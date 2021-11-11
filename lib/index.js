const fs = require('fs');
const callsites = require('callsites');
const traversy = require('traversy');
const fse = require('fs-extra');
const beard = require('beard');
const WebSocket = require('ws');
const config = require('./config');
const { dirname, basename, resolve } = require('path');
const { fileExtRegexStr, makeScopedClass } = require('./utils');
const { blockTypes, extractBlocks, writeEntryFile } = require('./bundling');
const regex = new RegExp(fileExtRegexStr, 'g');


exports.balm = (opts = {}) => {
  let _socket;
  let _timer;
  let _changes = [];
  let _handles = {};

  opts = config(opts, _handles);

  const _blocksDir = `${opts.root}/../.beard`;
  const _hashes = {};
  const _hasBundled = {};


  function bundle() {
    blockTypes.css.bundles = { entry: [] };
    blockTypes.js.bundles = { entry: [] };
    fse.ensureDirSync(_blocksDir);
    traversy(opts.root, fileExtRegexStr, bundleFile);
    writeEntryFile('css', _blocksDir);
    writeEntryFile('js', _blocksDir);

    if (opts.watch) {
      startWatching();
    } else {
    // } else if (opts.loadHandles) {
      // console.log('YOOOOOO');
      // opts.loadAssetsMap();
    }
  }


  function bundleFile(path) {
    const key = path.replace(regex, '');
    const blocks = extractBlocks(path, opts.root, _blocksDir);

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
    assetsEntry.on('change', opts.loadAssetsMap);
    balmFiles.on('change', bundleFile);
  }


  function notifyClient(path) {
    clearTimeout(_timer);

    _changes.push(basename(path));
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
    partial: engine.partial.bind(engine),
    handles: _handles
  };
}


exports.page = (path) => {
  const from = callsites()[1].getFileName();
  const fromDir = dirname(from);
  const absPath = path ? resolve(fromDir, path.replace(/^~/, '.')) : false;
  return (req, res) => {
    const finalPath = absPath || resolve(fromDir, req.page.replace(/^~/, '.'));
    res.locals.scopedClass = makeScopedClass(finalPath);
    const handle = res.app.engine.handles[finalPath] || ((req, res) => res.page());
    res.page = (locals) => res.render(finalPath, locals);
    return handle(req, res);
  }
}
