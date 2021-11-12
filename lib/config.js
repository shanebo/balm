const fs = require('fs');
const traversy = require('traversy');
const { klona } = require('klona');
const { merge } = require('merge-anything');
const { dirname, basename, resolve, extname } = require('path');
const { fileExtRegexStr, makeScopedClass } = require('./utils');


const makeRandomPort = (min = 5678, max = 10000) => Math.floor(Math.random() * (max - min + 1) + min);


const buildShortcut = (shortcuts, { dir, alias = (name) => name }) => {
  traversy(dir, fileExtRegexStr, (path) => {
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


// we need to account for regexes for js src and image src
const getAssetPaths = (str) => str
    .match(/(href=)"(.*?)"/g)
    .map(match => match.replace(/(href=|")/gi, ''));


module.exports = (opts = {}, _handles) => {
  let assetsMap = false;
  let assetOpts = { inline: [] };

  /*
  base component tag render
  - no clone of called component locals
  - nonshared locals: no merge of called component locals with render locals
  - most performant
  */
  const component = (absPath, locals, render, partial) => {
    const handle = _handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
    locals.scopedClass = makeScopedClass(absPath);
    const renderWrapper = (locals) => render(absPath, locals);
    return handle(renderWrapper, locals, partial);
  }


  /*
  cloned locals component tag render
  - clone of called component locals
  - nonshared locals: no merge of called component locals with render locals
  */
  const clonedLocalsComponent = (absPath, locals, render, partial) => {
    // conditionals are used instead of default {} values for performance reasons
    locals = locals ? klona(locals) : {};
    locals.scopedClass = makeScopedClass(absPath);
    const handle = _handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
    const renderWrapper = (locals) => render(absPath, locals);
    return handle(renderWrapper, locals, partial);
  }


  /*
  clone and merge locals component tag render
  - clone of called component locals
  - shared locals: merge of called component locals with render locals
  */
  const clonedAndMergedLocalsComponent = (absPath, locals, render, partial) => {
    // conditionals are used instead of default {} values for performance reasons
    locals = locals ? klona(locals) : {};
    locals.scopedClass = makeScopedClass(absPath);
    const handle = _handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
    const renderWrapper = (data) => render(absPath, data ? merge(locals, data) : locals);
    return handle(renderWrapper, locals, partial);
  }


  const componentRendererMap = {
    component,
    clonedLocalsComponent,
    clonedAndMergedLocalsComponent
  };


  const defaults = {
    root: './',
    templates: {},
    loadHandles: true,
    port: makeRandomPort(),
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


  opts = merge(defaults, opts);


  const beardConfig = {
    shortcuts: opts.components.shortcut.reduce(buildShortcut, {}),
    tags: {
      asset: {
        render: asset({
          inline: opts.assets.inline
        }),
        firstArgIsResolvedPath: true,
        content: false
      },
      component: {
        render: componentRendererMap[opts.components.renderer],
        firstArgIsResolvedPath: true,
        content: true
      }
    }
  };


  opts = merge(opts, beardConfig);


  function asset(options = { inline: [] }) {
    assetOpts = options;

    return (origPath, opts = {}) => {
      if (!assetsMap) {
        console.log('Balm loadAssetsMap');
        loadAssetsMap();
      }

      const { content, path } = assetsMap[origPath];
      return opts.inline
        ? content
        : path;
    }
  }


  const loadAssetsMap = () => {
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
        : `${opts.assets.origin}${hashedPath}`;
    });
  }


  opts.loadAssetsMap = loadAssetsMap;


  return opts;
}
