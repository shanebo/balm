const fs = require('fs');
const callsites = require('callsites');
const { klona } = require('klona');
const { merge } = require('merge-anything');
const { dirname, basename, resolve, extname } = require('path');
const traversy = require('traversy');


let assetsMap = {};
let assetOpts = { inline: [] };


const asset = (options = { inline: [] }) => {
  assetOpts = options;

  return (origPath, opts = {}) => {
    const { content, path } = assetsMap[origPath];
    return opts.inline
      ? content
      : path;
  }
}


// we need to account for regexes for js src and image src
const getAssetPaths = (str) => str
  .match(/(href=)"(.*?)"/g)
  .map(match => match.replace(/(href=|")/gi, ''));


const loadAssetsMap = (origin = '') => {
  assetsMap = {};

  const entryPath = resolve('app/assets/entry.html');
  const distDir = 'public/dist';
  const entryDir = dirname(entryPath);
  const entryName = basename(entryPath);
  const resultPath = resolve(distDir, entryName);
  const entryPaths = getAssetPaths(fs.readFileSync(entryPath, 'utf8'));
  const resultPaths = getAssetPaths(fs.readFileSync(resultPath, 'utf8'));

  entryPaths.forEach((path, p) => {
    const key = resolve(entryDir, path);
    const hashedPath = resultPaths[p];

    assetsMap[key] = {};

    if (assetOpts.inline.includes(key)) {
      const cssPath = resolve(__base, '../public', hashedPath.replace(/^\//, ''));
      assetsMap[key].content = fs.readFileSync(cssPath, 'utf8');
    }

    assetsMap[key].path = key.match(/\.svg$/)
      ? hashedPath
      : `${origin}${hashedPath}`;
  });
}


/*
base component tag render
- no clone of called component locals
- nonshared locals: no merge of called component locals with render locals
- most performant
*/
const component = (absPath, locals, handles, render, partial) => {
  const handle = handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
  const renderWrapper = (locals) => render(absPath, locals);
  return handle(renderWrapper, locals, partial);
}


/*
cloned locals component tag render
- clone of called component locals
- nonshared locals: no merge of called component locals with render locals
*/
const clonedLocalsComponent = (absPath, locals, handles, render, partial) => {
  // conditionals are used instead of default {} values for performance reasons
  locals = locals ? klona(locals) : {};
  const handle = handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
  const renderWrapper = (locals) => render(absPath, locals);
  return handle(renderWrapper, locals, partial);
}


/*
clone and merge locals component tag render
- clone of called component locals
- shared locals: merge of called component locals with render locals
*/
const clonedAndMergedLocalsComponent = (absPath, locals, handles, render, partial) => {
  // conditionals are used instead of default {} values for performance reasons
  locals = locals ? klona(locals) : {};
  const handle = handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
  const renderWrapper = (data) => render(absPath, data ? merge(locals, data) : locals);
  return handle(renderWrapper, locals, partial);
}


const componentRendererMap = {
  component,
  clonedLocalsComponent,
  clonedAndMergedLocalsComponent
};


const buildShortcut = (shortcuts, { dir, alias = (name) => name }) => {
  traversy(dir, '(.beard$)', (path) => {
    const name = path
      .replace(dir + '/', '')
      .replace(/\//g, '.')
      .replace(extname(path), '');

    shortcuts[alias(name)] = {
      tag: 'component',
      path: path.replace(extname(path), '')
    }
  });

  return shortcuts;
}


const defaults = {
  root: './',
  watch: false,
  assets: {
    origin: '',
    inline: []
  },
  components: {
    renderer: 'component',
    shortcut: []
  }
};


exports.config = (opts) => {
  const { root, watch, assets, components } = merge(defaults, opts);

  return {
    name: 'beard',
    opts: {
      root,
      ready: (beard) => {
        if (watch) {
          const watcher = 'chokidar';
          const chokidar = require(watcher);
          const beardFiles = chokidar.watch(`${root}/**/*.beard`);
          const assetsEntry = chokidar.watch('./public/dist/entry.html');

          beardFiles
            .on('add', beard.bundleFile.bind(beard))
            .on('change', beard.bundleFile.bind(beard));

          assetsEntry
            .on('add', loadAssetsMap.bind(null, assets.origin))
            .on('change', loadAssetsMap.bind(null, assets.origin));
        } else {
          loadAssetsMap(assets.origin);
        }
      },
      tags: {
        asset: {
          render: asset({
            inline: assets.inline
          }),
          firstArgIsResolvedPath: true,
          content: false
        },
        component: {
          render: componentRendererMap[components.renderer],
          firstArgIsResolvedPath: true,
          content: true
        }
      },
      shortcuts: components.shortcut.reduce(buildShortcut, {})
    }
  };
}


exports.page = (path) => {
  const from = callsites()[1].getFileName();
  const fromDir = dirname(from);
  const absPath = path ? resolve(fromDir, path.replace(/^~/, '.')) : false;
  return (req, res) => {
    const finalPath = absPath || resolve(fromDir, req.page.replace(/^~/, '.'));
    const handles = res.app.engine.handles;
    const handle = handles[finalPath] || ((req, res) => res.page());
    res.page = (locals) => res.render(finalPath, locals);
    return handle(req, res);
  }
}
