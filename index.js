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


console.log('BALM LOCAL LOADED!!!!!!!!!!');


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
  ssjs: {
    type: 'ssjs',
    tag: 'script[handle]',
    pathsRegex: /(import|require)[^'"`]+['"`]([\.\/][^'"`]+)['"`]/gmi,
    ext: 'ssjs.js'
  },
  css: {
    type: 'css',
    tag: 'style:not(style[inline])',
    pathsRegex: /(@import|url)\s*["'\(]*([^'"\)]+)/gmi,
    importStatement: (path) => `@import './${path}';`,
    ext: 'css'
  },
  js: {
    type: 'js',
    tag: 'script:not(script[handle]):not(script[inline]):not(script[src])',
    pathsRegex: /(import|require)[^'"`]+['"`]([\.\/][^'"`]+)['"`]/gmi,
    importStatement: (path) => `import './${path}';`,
    ext: 'js'
  }
};

const inlineCSSCommentsRegex = /\/\/[^\n]+/g;
const combinators = ['>', '+', '~'];
const deepCombinator = '>>>'; // this is our custom deep combinator for decendant scoping
const psuedoElements = /::after|:after|::backdrop|::after|:after|::backdrop|::before|:before|::cue|:cue|::first-letter|:first-letter|::first-line|:first-line|::grammar-error|::marker|::part\(.*?\)|::placeholder|::selection|::slotted\(.*?\)|::spelling-error/;



function parseBlocks ($, path) {
  const blocks = extractBlocks($, path);

  Object.entries(blocks).forEach(([type, block]) => {
    const blockType = blockTypes[type];
    const { importStatement, ext, pathsRegex } = blockType;

    if (type === 'css') {
      block.content = block.hasOwnProperty('scoped')
        ? scopeCSS(path, block.content, $)
        : cleanCSS(block.content, $);
    }

    block.content = fixPaths(path, block.content, pathsRegex);
    block.file = getHashedPath(path, ext);

    if (type !== 'ssjs') {
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
  });

  return blocks;
}


function extractBlocks($) {
  const blocks = {};

  Object.entries(blockTypes).forEach(([type, blockType]) => {
    const { tag } = blockType;

    $(tag).each((i, el) => {
      const block = {
        ...{ content: $(el).get()[0].children[0].data },
        ...el.attribs
      };
      blocks[type] = block;
      $(el).remove();
    });
  });

  return blocks;
}


function writeBlockFiles (blocks) {
  Object.entries(blocks).forEach(([key, block]) => {
    fs.writeFileSync(`${_blocksDir}/${block.file}`, block.content);
  });
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








class Balm {

  constructor(opts = {}) {
    const { root, watch, assets } = merge(defaults, opts);

    opts.templates = {};
    opts.loadHandles = opts.hasOwnProperty('loadHandles') ? opts.loadHandles : true;

    this.opts = opts;
    this.handles = {};
    this.blocksDir = `${root}/../.beard`;
    this.hashes = {};

    _root = this.opts.root;
    _blocksDir = this.blocksDir;

    console.log({ loadHandles: this.opts.loadHandles });
    this.bundle();

    this.beard = beard({
      root,
      templates: this.opts.templates,
      tags: opts.tags,
      shortcuts: opts.shortcuts
    });
    this.render = this.beard.render.bind(this.beard);
    this.partial = this.beard.partial.bind(this.beard);

    if (watch) {
      console.log('WATCH!!!!!!!!!');
      const socket = new WebSocket.Server({ port: 7778 });
      const watcher = 'chokidar';
      const chokidar = require(watcher);
      const beardFiles = chokidar.watch(`${root}/**/*.beard`);
      const assetsEntry = chokidar.watch('./public/dist/entry.html');
      const bundles = chokidar.watch(['./public/dist/*.css', './public/dist/*.js']);
      const handles = chokidar.watch(['./.beard/*.ssjs.js', './.beard/*.beard']);





      let timer;
      let changes = [];

      const notifyClient = (path) => {
        clearTimeout(timer);
        changes.push(path);
        timer = setTimeout(() => {
          socket.clients.forEach((client) => {
            console.log('going to beard add to client');
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(changes));
              changes = [];
            }
          });
        }, 100);
      }

      // const notifyClient = (path) => {
      //   socket.clients.forEach((client) => {
      //     console.log('going to beard add to client');
      //     if (client.readyState === WebSocket.OPEN) {
      //       client.send(path);
      //     }
      //   });
      // }

      bundles
        // .on('add', notifyClient)
        .on('change', notifyClient);

      handles
        // .on('add', (path) => {
        //   console.log('HANDLE ADDED', path);
        // })
        .on('change', (path) => {
          // console.log('HANDLE CHANGED', path);
          notifyClient(path);
        });

      beardFiles
        // .on('add', this.bundleFile.bind(this))
        .on('change', this.bundleFile.bind(this));

      assetsEntry
        .on('add', loadAssetsMap.bind(null, assets.origin))
        .on('change', loadAssetsMap.bind(null, assets.origin));
    } else {
      loadAssetsMap(assets.origin);
    }
  }


  bundle() {
    if (this.opts.cssExtension) {
      blockTypes.css.ext = this.opts.cssExtension;
    }

    fse.ensureDirSync(this.blocksDir);

    blockTypes.css.bundles = {
      entry: []
    };

    blockTypes.js.bundles = {
      entry: []
    };

    traversy(this.opts.root, '(.beard$)', this.bundleFile.bind(this));
    writeEntryFile('css');
    writeEntryFile('js');
  }


  bundleFile(path) {
    const regex = new RegExp('(.beard$)', 'g');
    const key = path.replace(regex, '');
    const contents = fs.readFileSync(path, 'utf8');
    const template = /<template>[\s\S]*?<\/template>/gm.test(contents)
      ? contents
      : `<template>${contents}</template>`;

    const original$ = vdom(template);
    const blocks = parseBlocks(original$, path);
    const $ = vdom(cleanWhitespace(original$('template').html()));
    const whitespaceTagsSelectors = 'pre, code, textarea';
    const originalWhitespaceTags = original$(whitespaceTagsSelectors);
    const whitespaceTags = $(whitespaceTagsSelectors);

    originalWhitespaceTags.each((i, el) => {
      $(whitespaceTags[i]).replaceWith(el);
    });

    const body = $.html().replace(/=\"=(=?)\"/gm, '==$1');

    // writeBlockFiles(blocks);
    Object.entries(blocks).forEach(([key, block]) => {
      const path = `${this.blocksDir}/${block.file}`;
      const hashedContent = hash(block.content);
      console.log('checking for diff');
      if (this.hashes[path] !== hashedContent) {
        console.log('!!!!DIFF!!!!!');
        this.hashes[path] = hashedContent;
        fs.writeFileSync(path, block.content);
      }
    });

    if (this.opts.loadHandles && blocks.ssjs) {
      console.log('REQUIRE HANDLE!!!!!');
      const handlePath = `${this.blocksDir}/${blocks.ssjs.file}`;
      delete require.cache[require.resolve(handlePath)];
      _handles[key] = require(handlePath);
      this.handles[key] = require(handlePath);
    }

    if (this.opts.templates[key] !== body) {
      fs.writeFileSync(`${this.blocksDir}/${getHashedPath(path, 'beard')}`, body);
    }

    this.opts.templates[key] = body;
  }
}


exports.Balm = Balm;
