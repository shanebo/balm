if (process.versions.node) {
  const fs = require('fs');
  const traversy = require('traversy');
  const cheerio = require('cheerio');
  const XRegExp = require('xregexp');
  const normalizeSelector = require('normalize-selector');
  const { dirname, basename, resolve, extname, relative } = require('path');
  const { hash, makeScopedClass, fileExtRegexStr, isDev, mapPath, toDeployPath } = require('./utils');
  const regex = new RegExp(fileExtRegexStr, 'g');
  const hmr = require('./hmr-server');
  const esbuild = require('esbuild');


  const cleanWhitespace = (str) => str.replace(/\s+/g, ' ').trim();


  const vdom = (template) => {
    return cheerio.load(template, {
      xml: {
        xmlMode: false,
        decodeEntities: false,
        lowerCaseAttributeNames: false
      }
    });
  };


  const blockTypes = {
    handle: {
      type: 'handle',
      tag: 'script[handle]',
      pathsRegex: /(import\s+(?:.*from\s+)?|require\(\s*)['"`]([\.\/][^'"`]+)['"`]\s*\)?/gim,
      ext: 'handle.js'
    },
    js: {
      type: 'js',
      tag: 'script:not(script[handle]):not(script[inline]):not(script[src])',
      pathsRegex: /(import\s+(?:.*from\s+)?|require\(\s*)['"`]([\.\/][^'"`]+)['"`]\s*\)?/gim,
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
      pathsRegex: /(@import\s+url\(|@import\s+|url\(\s*)['"]?([\.\/][^'"\)]+)['"]?\s*\)?/gmi,
      importStatement: (path) => `@import './${path}';`,
      ext: 'css'
    }
  };


  const inlineCSSCommentsRegex = /\/\/[^\n]+/g;
  const combinators = ['>', '+', '~'];
  const deepCombinator = '>>>'; // this is our custom deep combinator for decendant scoping
  const psuedoElements = /::after|:after|::backdrop|::after|:after|::backdrop|::before|:before|::cue|:cue|::first-letter|:first-letter|::first-line|:first-line|::grammar-error|::marker|::part\(.*?\)|::placeholder|::selection|::slotted\(.*?\)|::spelling-error/;


  function hasNoInlineComments(val) {
    return val && !val.trim().match(/^\/\//);
  }


  function minifyTemplate(original$) {
    const $ = vdom(cleanWhitespace(original$.html()));
    const ommittedTags = 'pre, code, textarea';
    const originalTags = original$(ommittedTags);
    const tags = $(ommittedTags);

    originalTags.each((i, oTag) => {
      $(tags[i]).replaceWith(oTag);
    });

    const minifiedTemplate = $('template').html().trim();
    return fixInlineAttributeConditions(minifiedTemplate);
  }


  function addBundleImports(block, blockType) {
    const { importStatement } = blockType;
    let { bundle, file } = block;

    bundle = !bundle
      ? ['entry']
      : bundle.split(',').filter(b => b).map(b => b.trim());

    bundle.forEach((b) => {
      if (!blockType.bundles[b]) {
        blockType.bundles[b] = [];
      }

      blockType.bundles[b].push(importStatement(file));
    });
  }


  function addHmrToBundles(port, blocksDir) {
    const { bundles, importStatement } = blockTypes.js;
    const hmrPath = `${require.resolve.paths('./hmr-client.js')[0]}/hmr-client.js`;
    const hmrContent = fs.readFileSync(hmrPath, 'utf8').replace('PORT', port);
    fs.writeFileSync(`${blocksDir}/hmr-client.js`, hmrContent);

    Object.keys(bundles).forEach((bundle) => {
      const bundleStack = bundles[bundle];
      const hmr = importStatement('hmr-client.js');

      if (!bundleStack.includes(hmr)) {
        bundleStack.push(hmr);
      }
    });
  }


  function getHashedPath(path, ext) {
    return `${basename(path, extname(path))}.${hash(path)}.${ext}`;
  }


  function cleanCSS(blockContent) {
    return replaceSelectors(blockContent, (selectors) => {
      return selectors.map(parts => parts.join(' ')).join(',\n');
    });
  }


  function replaceSelectors(css, callback) {
    css = css.replace(/\/\*[\s\S]+?\*\//gm, ''); // remove block comments

    const matches = XRegExp.matchRecursive(css, '{', '}', 'g', {
      valueNames: ['name', null, 'style', null]
    });

    return matches
      .map((match, m) => {
        const val = normalizeSelector(match.value).replace('> > >', deepCombinator);
        if (match.name === 'name' && hasNoInlineComments(val)) {
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


  function scopeCSS(path, blockContent, $) {
    const styles = replaceSelectors(blockContent, (selectors) => {
      const scopedClass = makeScopedClass(path);

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
            $(el).addClass(scopedClass);
          }

          return `${selector} ${part.replace(/([^:]+)(:.+)?/, `$1.${scopedClass}$2`)}`;
        }, '').trim();
      }).join(',\n');
    });

    return styles;
  }


  function writeEntryFile(type, blocksDir) {
    const { bundles, ext } = blockTypes[type];
    Object.keys(bundles).forEach((bundle) => {
      fs.writeFileSync(`${blocksDir}/${bundle}.${ext}`, bundles[bundle].join('\n'));
    });
  }


  function fixPaths(path, block, pathsRegex, root, blocksDir) {
    return block.replace(pathsRegex, (match, _, importPath) => {
      const abImportPath = resolve(root, dirname(path), importPath);
      const newImportPath = relative(blocksDir, abImportPath);
      return match.replace(importPath, newImportPath);
    });
  }


  function extractBlocks(path, root, blocksDir) {
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
            ? minifyTemplate(vdom(original$.html()))
            : original$(el).get()[0].children[0].data,
          ...el.attribs
        };

        if (type === 'js') {
          addBundleImports(block, blockType);
        }

        if (type !== 'template') {
          original$(el).remove();
        }

        block.content = fixPaths(path, block.content, pathsRegex, root, blocksDir);

        if (type === 'css') {
          addBundleImports(block, blockType);

          block.content = block.hasOwnProperty('scoped')
            ? scopeCSS(path, block.content, original$)
            : cleanCSS(block.content, original$);

          if (blocks.template) {
            // scoped css effects the template markup so update template content and hash
            const body = minifyTemplate(original$);
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


  const fixInlineAttributeConditions = (str) => str.replace(/=\"=(=?)\"/gm, '==$1');


  function start(opts) {
    console.log('Balm bundling...');
    const { blocksDir, root, watch, port } = opts;

    blockTypes.css.bundles = { entry: [] };
    blockTypes.js.bundles = { entry: [] };

    if (!fs.existsSync(blocksDir)) {
      fs.mkdirSync(blocksDir);
    }

    traversy(root, fileExtRegexStr, (path) => {
      bundleFile(path, opts);
    });

    if (watch) {
      console.log('Balm watching...');
      addHmrToBundles(port, blocksDir);
      hmr.start(opts);

      fs.watch(root, { recursive: true }, (_, path) => {
        if (extname(path) === '.balm') {
          bundleFile(resolve(root, path), opts);
        }
      });
    }

    writeEntryFile('css', blocksDir);
    writeEntryFile('js', blocksDir);

    esbuild.build(opts.esbuild).then((result) => {
      finish(null, result, opts);
    });
  }


  function bundleFile(path, opts) {
    const { root, blocksDir, handles, handlePaths, watch, templates, hashes } = opts;
    const key = toDeployPath(path.replace(regex, ''));
    const blocks = extractBlocks(path, root, blocksDir);

    Object.entries(blocks).forEach(([ _, block ]) => {
      const { type, file, content, contentHash } = block;
      const path = `${blocksDir}/${file}`;
      const previousHash = hashes[file];

      if (contentHash !== previousHash) {
        fs.writeFileSync(path, content);
        hashes[file] = contentHash;

        if (type === 'handle') {
          if (isDev) {
            delete require.cache[require.resolve(path)];
            handles[key] = require(path);
          } else {
            handlePaths[key] = toDeployPath(path);
          }
        }

        if (type === 'template') {
          templates[key] = content;
        }

        if (watch && previousHash && ['template', 'handle'].includes(type)) {
          hmr.notify(path);
        }
      }
    });
  }


  function makeMap(opts) {
    const { origin, assets, templates, handlePaths } = opts;

    const map = JSON.stringify({
      origin,
      assets,
      templates,
      handlePaths
    }, null, 2);

    fs.writeFileSync(mapPath, map, 'utf8');
  }


  function makeAssetsMap(outputs, opts) {
    Object.entries(outputs).forEach(([path, value]) => {
      const entryPath = value.entryPoint
        ? value.entryPoint
        : Object.keys(value.inputs)[0];
      const absPath = resolve(path);
      const key = toDeployPath(entryPath);
      // Remove non-web public path portion
      const pathSplat = path.split(/(?:^|\/)public\//);
      const webPath = `/${pathSplat[1]}`;

      if (!opts.assets[key]) {
        opts.assets[key] = {};
      }

      if (opts.watch) {
        const fileSize = fs.statSync(absPath).size;

        if (opts.assets[key].size !== fileSize) {
          hmr.notify(webPath);
        }

        opts.assets[key].size = fileSize;
      }

      // For inline beard asset tag rendering
      // This makes the content of the asset available to be output directly in the template
      if (['.css', '.js', '.svg'].includes(extname(key))) {
        const newPath = resolve(path);
        opts.assets[key].content = fs.readFileSync(newPath, 'utf8');
      }

      opts.assets[key].path = key.match(/\.svg$/)
        ? webPath
        : `${opts.origin}${webPath}`;
    });
  }


  function finish(error, result, opts) {
    if (error) {
      console.error('Balm bundling failed', error);
    } else {
      console.log('Balm bundled.');
      makeAssetsMap(result.metafile.outputs, opts);

      if (!isDev) {
        makeMap(opts);
      }
    }
  }


  exports.start = start;
  exports.finish = finish;
}
