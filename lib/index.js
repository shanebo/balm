const fs = require('fs');
const callsites = require('callsites');
const traversy = require('traversy');
const beard = require('beard');
const WebSocket = require('ws');
const config = require('./config');
const { dirname, basename, resolve } = require('path');
const { fileExtRegexStr, makeScopedClass } = require('./utils');
const { blockTypes, extractBlocks, addHmrToBundles, writeEntryFile } = require('./bundling');
const regex = new RegExp(fileExtRegexStr, 'g');


exports.balm = (opts = {}) => {
  const hashes = {};
  const hasBundled = {};


  let _socket;
  let _timer;
  let _changes = [];


  const {
    root, blocksDir, loadHandles,
    handles, watch, port, tags,
    shortcuts, templates
  } = config(opts);


  function bundle() {
    blockTypes.css.bundles = { entry: [] };
    blockTypes.js.bundles = { entry: [] };

    if (!fs.existsSync(blocksDir)){
      fs.mkdirSync(blocksDir);
    }

    traversy(root, fileExtRegexStr, bundleFile);

    if (watch) {
      startWatching();
    }

    writeEntryFile('css', blocksDir);
    writeEntryFile('js', blocksDir);
  }


  function bundleFile(path) {
    const key = path.replace(regex, '');
    const blocks = extractBlocks(path, root, blocksDir);

    Object.entries(blocks).forEach(([ _, block ]) => {
      const { type, file, content, contentHash } = block;
      const path = `${blocksDir}/${file}`;
      const previousHash = hashes[file];

      if (contentHash !== previousHash) {
        fs.writeFileSync(path, content);
        hashes[file] = contentHash;

        if (loadHandles && type === 'handle') {
          delete require.cache[require.resolve(path)];
          handles[key] = require(path);
        }

        if (watch && previousHash && ['template', 'handle'].includes(type)) {
          notifyClient(path);
        }

        if (type === 'template') {
          templates[key] = content;
        }
      }
    });
  }


  function startWatching() {
    console.log('Balm watching...');

    _socket = new WebSocket.Server({ port });
    addHmrToBundles(port, blocksDir);

    const watcher = 'chokidar';
    const chokidar = require(watcher);
    const distWatchOptions = {
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 25
      }
    };
    const bundles = chokidar.watch(['./public/dist/*.css', './public/dist/*.js'], distWatchOptions);
    const balmFiles = chokidar.watch(`${root}/**/*.balm`);

    bundles.on('change', (path) => {
      if (hasBundled[path]) {
        notifyClient(path);
      } else {
        hasBundled[path] = true;
      }
    });

    balmFiles.on('change', bundleFile);
  }


  function notifyClient(path) {
    clearTimeout(_timer);

    _changes.push(basename(path));
    _changes = [...new Set(_changes)];

    _timer = setTimeout(() => {
      _socket.clients.forEach((client) => {
        if (_changes.length && client.readyState === WebSocket.OPEN) {
          console.log('Balm notifying client of changes', _changes);
          client.send(JSON.stringify(_changes));
          _changes = [];
        }
      });
    }, 50);
  }


  bundle();


  const engine = beard({
    root,
    tags,
    shortcuts,
    templates
  });


  return {
    render: engine.render.bind(engine),
    partial: engine.partial.bind(engine),
    handles
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
