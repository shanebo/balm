const fs = require('fs');
const callsites = require('callsites');
const traversy = require('traversy');
const beard = require('beard');
const WebSocket = require('ws');
const config = require('./config');
const esbuild = require('./esbuild');
const { dirname, basename, resolve, extname } = require('path');
const { fileExtRegexStr, makeScopedClass, isDev } = require('./utils');
const { blockTypes, extractBlocks, addHmrToBundles, writeEntryFile } = require('./bundling');
const regex = new RegExp(fileExtRegexStr, 'g');


function balm(options = {}) {
  const hashes = {};
  const hasBundled = {};


  let _socket;
  let _timer;
  let _changes = [];


  const opts = config(options);
  const {
    root, blocksDir, loadHandles,
    handles, watch, port, tags,
    shortcuts, templates, runBundler
  } = opts;


  function bundle() {
    blockTypes.css.bundles = { entry: [] };
    blockTypes.js.bundles = { entry: [] };

    if (!fs.existsSync(blocksDir)){
      fs.mkdirSync(blocksDir);
    }

    traversy(root, fileExtRegexStr, bundleFile);

    if (isDev) {
      addHmrToBundles(port, blocksDir);
    }

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

    fs.watch('./public/dist', (_, path) => {
      console.log('THIS CAUSES A BUG ON FILES THAT HAVE ALREADY BEEN CREATED');

      if (!hasBundled[path]) {
        console.log('File changed for HMR', path);
        notifyClient(path);
        hasBundled[path] = true;
      }
    });

    fs.watch(root, { recursive: true }, (_, path) => {
      if (extname(path) === '.balm') {
        bundleFile(resolve(root, path));
      }
    });

    // ensure assets-map.json exists before watching the file
    fs.writeFileSync('assets-map.json', '', 'utf8');

    fs.watch('./assets-map.json', resetAssetsMap);
  }


  function notifyClient(path) {
    clearTimeout(_timer);

    _changes.push(basename(path));
    _changes = [...new Set(_changes)];

    _timer = setTimeout(() => {
      if (!_changes.length) return;

      _socket.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          console.log('Balm notifying client of changes', _changes);
          client.send(JSON.stringify(_changes));
        }
      });

      _changes = [];
    }, 50);
  }


  bundle();


  if (runBundler) {
    esbuild(opts);
  }


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


function page(path) {
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


exports.balm = balm;
exports.page = page;
