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
    shortcuts, templates, bundle
  } = opts;

  if (bundle) {
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


function page(path, opts = { respond: true }) {
  const from = callsites()[1].getFileName();
  const fromDir = dirname(from);
  const absPath = path ? resolve(fromDir, path.replace(/^~/, '.')) : false;
  return (req, res, next) => {
    const finalPath = absPath || resolve(fromDir, req.page.replace(/^~/, '.'));
    res.locals.scopedClass = makeScopedClass(finalPath);
    const handle = res.app.engine.handles[finalPath] || ((req, res) => res.page());

    res.page = (locals) => {
      if (opts.respond) {
        res.render(finalPath, locals);
      } else {
        res.html = res.app.engine.render(finalPath, { ...res.locals, ...locals });
        next();
      }
    }

    return handle(req, res);
  }
}


exports.balm = balm;
exports.page = page;
