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
let _handles = {};
let assetsMap = {};
let assetOpts = { inline: [] };
const fileExtRegexStr = '(.beard$)';
const regex = new RegExp(fileExtRegexStr, 'g');


console.log('!!!!!!!!!! BALM LOADED LOCALLYITO !!!!!!!!!!');


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





const defaults = {
  root: './',
  loadHandles: true,
  templates: {},
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
    name: '@dylan/balm',
    opts: {
      root,
      watch,
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


// function writeBlockFiles (blocks) {
//   Object.entries(blocks).forEach(([key, block]) => {
//     fs.writeFileSync(`${_blocksDir}/${block.file}`, block.content);
//   });
// }


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




class Balm {

  constructor(opts = {}) {
    this.opts = merge(defaults, opts);
    this.blocksDir = `${this.opts.root}/../.beard`;
    this.hashes = {};

    _root = this.opts.root;
    _blocksDir = this.blocksDir;

    this.bundle();
    this.beard = beard({
      root: this.opts.root,
      tags: this.opts.tags,
      shortcuts: this.opts.shortcuts,
      templates: this.opts.templates
    });
    this.render = this.beard.render.bind(this.beard);
    this.partial = this.beard.partial.bind(this.beard);
  }


  watch() {
    this.socket = new WebSocket.Server({ port: 7778 });
    this.changes = [];

    const watcher = 'chokidar';
    const chokidar = require(watcher);
    const balmFiles = chokidar.watch(`${this.opts.root}/**/*.beard`);
    const assetsEntry = chokidar.watch('./public/dist/entry.html');
    const bundles = chokidar.watch(['./public/dist/*.css', './public/dist/*.js']);

    bundles.on('change', this.notifyClient.bind(this));
    balmFiles.on('change', this.bundleFile.bind(this));
    assetsEntry.on('change', loadAssetsMap.bind(null, this.opts.assets.origin));
  }


  bundle() {
    if (this.opts.watch) {
      this.watch();
    } else {
      // uncomment this
      // loadAssetsMap(this.opts.assets.origin);
    }

    blockTypes.css.bundles = { entry: [] };
    blockTypes.js.bundles = { entry: [] };
    fse.ensureDirSync(this.blocksDir);
    traversy(this.opts.root, fileExtRegexStr, this.bundleFile.bind(this));
    writeEntryFile('css');
    writeEntryFile('js');
  }


  bundleFile(path) {
    const key = path.replace(regex, '');
    const blocks = extractBlocks(path);

    Object.entries(blocks).forEach(([ _, block ]) => {
      const { type, file, content, contentHash } = block;
      const path = `${this.blocksDir}/${file}`;
      const previousHash = this.hashes[file];

      if (contentHash !== previousHash) {
        fs.writeFileSync(path, content);
        this.hashes[file] = contentHash;

        if (this.opts.loadHandles && type === 'handle') {
          delete require.cache[require.resolve(path)];
          _handles[key] = require(path);
        }

        if (this.opts.watch && previousHash) {
          console.log('notify client about', file);
          this.notifyClient(path);
        }

        if (type === 'template') {
          this.opts.templates[key] = content;
        }
      }
    });
  }


  notifyClient(path) {
    const ext = path.split('.').pop();
    if (ext === 'css' && ext === 'js' && !path.includes('.handle.js')) {
      console.log('supress notify client', path);
      return;
    }

    clearTimeout(this.timer);
    this.changes.push(path);

    this.timer = setTimeout(() => {
      this.socket.clients.forEach((client) => {
        console.log('going to beard add to client');
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(this.changes));
          this.changes = [];
        }
      });
    }, 50);
  }
}


exports.Balm = Balm;
