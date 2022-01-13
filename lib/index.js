const fs = require('fs');
const callsites = require('callsites');
const beard = require('beard');
const config = require('./config');
const hmr = require('./hmr-server');
const { esbuild } = require('./esbuild');
const { dirname, resolve, extname } = require('path');
const { makeScopedClass } = require('./utils');
const { bundle, bundleFile } = require('./bundling');


exports.balm = (options = {}) => {
  const opts = config(options);
  const {
    root, handles, tags, shortcuts,
    templates, runBundler, watch
  } = opts;

  bundle(opts);

  if (runBundler) {
    esbuild(opts);
  }

  if (watch) {
    hmr.start(opts);

    fs.watch(root, { recursive: true }, (_, path) => {
      if (extname(path) === '.balm') {
        bundleFile(resolve(root, path), opts);
      }
    });
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
