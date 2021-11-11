const WebSocket = require('ws');
const fs = require('fs');
const callsites = require('callsites');
const { klona } = require('klona');
const { merge } = require('merge-anything');
const { dirname, basename, resolve, extname, relative } = require('path');
const traversy = require('traversy');
const { vdom, cleanWhitespace, hash, removeExtension } = require('./utils');
const fse = require('fs-extra');
const XRegExp = require('xregexp');
const normalizeSelector = require('normalize-selector');
const beard = require('beard');


let _root;
let _blocksDir;
let _handles = {}; // share between both bundling and templating/rendering
const fileExtRegexStr = '(.beard$)';
// const regex = new RegExp(fileExtRegexStr, 'g');


// we need to account for regexes for js src and image src
const getAssetPaths = (str) => str
  .match(/(href=)"(.*?)"/g)
  .map(match => match.replace(/(href=|")/gi, ''));


const makeScopedClass = (path) => `b-${hash(path.replace(_root, ''))}`;


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


exports.page = (path) => {
  const from = callsites()[1].getFileName();
  const fromDir = dirname(from);
  const absPath = path ? resolve(fromDir, path.replace(/^~/, '.')) : false;
  return (req, res) => {
    const finalPath = absPath || resolve(fromDir, req.page.replace(/^~/, '.'));
    res.locals.scopedClass = makeScopedClass(finalPath);
    const handle = _handles[finalPath] || ((req, res) => res.page());
    res.page = (locals) => res.render(finalPath, locals);
    return handle(req, res);
  }
}




// - stripping out handles
// - stripping out styles
// - stripping out frontend js
// - fixing paths in all of those different embedded blocks
// - creating distinct bundles for styles and frontend js
// - reading beard templates (without blocks) into memory cache
// - scoping css on scoped styles block
// --- TODO
// - prune unused styles
// - prune unused js


const blockTypes = {
  handle: {
    type: 'handle',
    tag: 'script[handle]',
    pathsRegex: /(import|require)[^'"`]+['"`]([\.\/][^'"`]+)['"`]/gmi,
    ext: 'handle.js'
  },
  js: {
    type: 'js',
    tag: 'script:not(script[handle]):not(script[inline]):not(script[src])',
    pathsRegex: /(import|require)[^'"`]+['"`]([\.\/][^'"`]+)['"`]/gmi,
    importStatement: (path) => `import './${path}';`,
    ext: 'js'
  },
  template: {
    type: 'beard',
    tag: 'template',
    ext: 'beard'
  },
  css: {
    type: 'css',
    tag: 'style:not(style[inline])',
    pathsRegex: /(@import|url)\s*["'\(]*([^'"\)]+)/gmi,
    importStatement: (path) => `@import './${path}';`,
    ext: 'css'
  }
};

const inlineCSSCommentsRegex = /\/\/[^\n]+/g;
const combinators = ['>', '+', '~'];
const deepCombinator = '>>>'; // this is our custom deep combinator for decendant scoping
const psuedoElements = /::after|:after|::backdrop|::after|:after|::backdrop|::before|:before|::cue|:cue|::first-letter|:first-letter|::first-line|:first-line|::grammar-error|::marker|::part\(.*?\)|::placeholder|::selection|::slotted\(.*?\)|::spelling-error/;


function minimizeWhitespace(original$) {
  const $ = vdom(cleanWhitespace(original$('template').html()));
  const ommittedTags = 'pre, code, textarea';
  const originalWhitespaceTags = original$(ommittedTags);
  const whitespaceTags = $(ommittedTags);

  originalWhitespaceTags.each((i, el) => {
    $(whitespaceTags[i]).replaceWith(el);
  });

  return fixInlineAttributeConditions($.html());
}


const fixInlineAttributeConditions = (str) => str.replace(/=\"=(=?)\"/gm, '==$1');


const addBundleImports = (block, blockType) => {
  const { importStatement } = blockType;
  let { bundle } = block;

  bundle = !bundle
    ? ['entry']
    : bundle.split(',').filter(b => b).map(b => b.trim());

  bundle.forEach((b) => {
    if (!blockType.bundles[b]) {
      blockType.bundles[b] = [];
    }

    blockType.bundles[b].push(importStatement(block.file));
  });
}


function extractBlocks(path) {
  const blocks = {};
  const contents = fs.readFileSync(path, 'utf8');
  const template = /<template>[\s\S]*?<\/template>/gm.test(contents)
    ? contents
    : `<template>${contents}</template>`;
  const original$ = vdom(template);


  Object.entries(blockTypes).forEach(([ type, blockType ]) => {
    const { tag, ext, pathsRegex } = blockType;

    original$(tag).each((i, el) => {
      const block = {
        ext,
        type,
        file: getHashedPath(path, ext),
        content: type === 'template'
          ? minimizeWhitespace(original$)
          : original$(el).get()[0].children[0].data,
        ...el.attribs
      };

      if (type === 'js') {
        addBundleImports(block, blockType);
      }

      if (type !== 'template') {
        original$(el).remove();
      }

      block.content = fixPaths(path, block.content, pathsRegex);

      if (type === 'css') {
        addBundleImports(block, blockType);

        block.content = block.hasOwnProperty('scoped')
          ? scopeCSS(path, block.content, original$)
          : cleanCSS(block.content, original$);

        if (blocks.template) {
          // scoped css effects the template markup so update template content and hash
          const body = fixInlineAttributeConditions(cleanWhitespace(original$('template').html()));
          blocks.template.content = body;
          blocks.template.contentHash = hash(body);
        }
      }

      block.contentHash = hash(block.content);
      blocks[type] = block;
    });
  });

  return blocks;
}


function writeEntryFile(type) {
  const { bundles, ext } = blockTypes[type];
  Object.keys(bundles).forEach((bundle) => {
    fs.writeFileSync(`${_blocksDir}/${bundle}.${ext}`, bundles[bundle].join('\n'));
  });
}


function getHashedPath (path, ext) {
  return `${basename(path, extname(path))}.${hash(path)}.${ext}`;
}


function fixPaths(path, block, pathsRegex) {
  return block.replace(pathsRegex, (match, _, importPath) => {
    const abImportPath = resolve(_root, dirname(path), importPath);
    const newImportPath = relative(_blocksDir, abImportPath);
    return match.replace(importPath, newImportPath);
  });
}


function cleanCSS(blockContent) {
  return replaceSelectors(blockContent, (selectors) => {
    return selectors.map(parts => parts.join(' ')).join(',\n');
  });
}


function scopeCSS(path, blockContent, $) {
  const styles = replaceSelectors(blockContent, (selectors) => {
    const scopedClass = `.b-${hash(removeExtension(path.replace(_root, '')))}`;

    return selectors.map(origSelector => {
      let hasDeepCombinator = false;

      return origSelector.reduce((selector, part) => {
        if (!hasDeepCombinator && part === deepCombinator) {
          hasDeepCombinator = true;
          return selector;
        }

        if (hasDeepCombinator || combinators.includes(part) || part.startsWith(':')) {
          // this part is not a queryable element, so it doesn't need a scoped css class
          return `${selector} ${part}`;
        }

        const el = `${selector} ${part.replace(psuedoElements, '')}`;

        if ($(el)) {
          $(el).addClass(scopedClass.substring(1));
        }

        return `${selector} ${part.replace(/([^:]+)(:.+)?/, `$1${scopedClass}$2`)}`;
      }, '').trim();
    }).join(',\n');
  });

  return styles;
}


function validStyle(val) {
  if (!val) return false;
  const notCommentedOut = !val.trim().match(/^\/\//);
  if (notCommentedOut) return true;
  return false;
}


function replaceSelectors(css, callback) {
  css = css.replace(/\/\*[\s\S]+?\*\//gm, ''); // remove block comments

  const matches = XRegExp.matchRecursive(css, '{', '}', 'g', {
    valueNames: ['name', null, 'style', null]
  });

  return matches
    .map((match, m) => {
      const val = normalizeSelector(match.value).replace('> > >', deepCombinator);
      if (match.name === 'name' && validStyle(val)) {
        return {
          name: val,
          selectors: val
            .split(',')
            .filter(name => !['/*', '//'].includes(name.trim().substring(0, 2)))
            .map(name => name.trim().split(/\s+/)),
          content: matches[m + 1].value.replace(inlineCSSCommentsRegex, '')
        };
      }
    })
    .filter(match => match)
    .map(style => {
      const name = style.name.trim();
      if (name.startsWith('@') && name.includes(' ')) {
        const mediaQueryStyles = replaceSelectors(style.content, callback);
        return `${style.name} {${mediaQueryStyles}}`;
      } else {
        return `${callback(style.selectors)} {${style.content}}`;
      }
    }).join('\n');
}



const defaults = {
  root: './',
  templates: {},
  loadHandles: true,
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



exports.balm = (opts = {}) => {
  let assetOpts = { inline: [] };
  let assetsMap = {};

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


  _root = opts.root;
  _blocksDir = `${opts.root}/../.beard`;

  let _socket;
  let _timer;
  let _hashes = {};
  let _changes = [];

  const regex = new RegExp(fileExtRegexStr, 'g');


  function asset(options = { inline: [] }) {
    assetOpts = options;

    return (origPath, opts = {}) => {
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


  function bundle() {
    // if (opts.watch) {
    //   startWatching();
    // } else {
    //   // uncomment this
    //   // loadAssetsMap();
    // }

    blockTypes.css.bundles = { entry: [] };
    blockTypes.js.bundles = { entry: [] };
    fse.ensureDirSync(_blocksDir);
    traversy(opts.root, fileExtRegexStr, bundleFile);
    writeEntryFile('css');
    writeEntryFile('js');

    if (opts.watch) {
      startWatching();
    } else {
      // uncomment this
      // loadAssetsMap();
    }
  }

  const _hasBundled = {};


  function startWatching() {
    _socket = new WebSocket.Server({ port: 7778 });

    const watcher = 'chokidar';
    const chokidar = require(watcher);
    const distWatchOptions = {
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 25
      }
    };
    const bundles = chokidar.watch(['./public/dist/*.css', './public/dist/*.js'], distWatchOptions);
    const assetsEntry = chokidar.watch('./public/dist/entry.html', distWatchOptions);
    const balmFiles = chokidar.watch(`${opts.root}/**/*.beard`);

    bundles.on('change', (path) => {
      if (_hasBundled[path]) {
        notifyClient(path);
      } else {
        _hasBundled[path] = true;
      }
    });
    assetsEntry.on('change', loadAssetsMap);
    balmFiles.on('change', bundleFile);
  }


  function bundleFile(path) {
    const key = path.replace(regex, '');
    const blocks = extractBlocks(path);

    Object.entries(blocks).forEach(([ _, block ]) => {
      const { type, file, content, contentHash } = block;
      const path = `${_blocksDir}/${file}`;
      const previousHash = _hashes[file];

      if (contentHash !== previousHash) {
        fs.writeFileSync(path, content);
        _hashes[file] = contentHash;

        if (opts.loadHandles && type === 'handle') {
          delete require.cache[require.resolve(path)];
          _handles[key] = require(path);
        }

        if (opts.watch && previousHash && ['template', 'handle'].includes(type)) {
          notifyClient(path);
        }

        if (type === 'template') {
          opts.templates[key] = content;
        }
      }
    });
  }


  function notifyClient(path) {
    clearTimeout(_timer);

    path = path.split('/').pop();
    _changes.push(path);
    _changes = [...new Set(_changes)];

    _timer = setTimeout(() => {
      _socket.clients.forEach((client) => {
        if (_changes.length && client.readyState === WebSocket.OPEN) {
          console.log('Notify client of changes', _changes);
          client.send(JSON.stringify(_changes));
          _changes = [];
        }
      });
    }, 50);
  }


  bundle();


  const engine = beard({
    root: opts.root,
    tags: opts.tags,
    shortcuts: opts.shortcuts,
    templates: opts.templates
  });


  return {
    render: engine.render.bind(engine),
    partial: engine.partial.bind(engine)
  };
}
