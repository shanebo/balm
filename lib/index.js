const callsites = require('callsites');
const beard = require('beard');
const config = require('./config');
const { dirname, resolve } = require('path');
const { makeScopedClass } = require('./utils');
const bundler = require('./bundler');


function balm(options = {}) {
  const opts = config(options);
  const {
    root, handles, tags,
    shortcuts, templates, runBundler
  } = opts;

  if (runBundler) {
    bundler.start(opts);
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
