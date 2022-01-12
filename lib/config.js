const traversy = require('traversy');
const { klona } = require('klona');
const { merge } = require('merge-anything');
const { extname } = require('path');
const { fileExtRegexStr, makeScopedClass, isDev } = require('./utils');
const { asset, makeAssetsMap } = require('./assets');
const postcss = require('esbuild-postcss');
const browserslistToEsbuild = require('browserslist-to-esbuild');
// const babel = require('esbuild-plugin-babel');


const toPort = (path) => {
  let i = 0;
  let h = 0;
  let l = path.length;

  if (l > 0) {
    while (i < l) {
      h = (h << 5) - h + path.charCodeAt(i++) | 0;
    }
  }

  return 3000 + parseInt(h.toString().substring(1, 5));
}


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


module.exports = (opts = {}) => {
  /*
  base component tag render
  - no clone of called component locals
  - nonshared locals: no merge of called component locals with render locals
  - most performant
  */
  const component = (absPath, locals, render, partial) => {
    const handle = opts.handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
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
    const handle = opts.handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
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
    const handle = opts.handles[absPath] || ((renderWrapper, data) => renderWrapper(data));
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
    handles: {},
    loadHandles: true,
    runBundler: isDev,
    port: toPort(__dirname),
    watch: false,
    assets: {
      origin: '',
      inline: [],
      map: {}
    },
    components: {
      renderer: 'component',
      shortcut: []
    },
    esbuild: {
      outdir: 'public/dist',
      entryNames: '[name].[hash]',
      minify: !isDev,
      loader: {
        '.jpg': 'file',
        '.png': 'file',
        '.svg': 'file',
        '.woff2': 'file'
      },
      metafile: true,
      bundle: true,
      target: browserslistToEsbuild(),
      plugins: isDev
        ? [postcss()]
        : [
            postcss(),
            // babel({
            //   filter: /.*js/,
            //   namespace: '',
            //   config: {} // babel config here or in babel.config.json
            // })
          ],
      watch: isDev
        ? {
            onRebuild(error, result) {
              if (error) {
                console.error('esbuild rebuild failed', error);
              } else {
                console.log('esbuild rebuild');
                makeAssetsMap(result.metafile.outputs, opts);
              }
            }
          }
        : false
    }
  };


  opts = merge(defaults, opts);
  opts.blocksDir = `${opts.root}/../.balm`;


  const beardOpts = {
    shortcuts: opts.components.shortcut.reduce(buildShortcut, {}),
    tags: {
      asset: {
        render: asset(opts.assets),
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


  opts = merge(opts, beardOpts);


  return opts;
}
