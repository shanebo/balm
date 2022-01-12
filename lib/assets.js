const fs = require('fs');
const { resolve } = require('path');
const { notifyClient } = require('./watch');


function asset(opts) {
  return (origPath, scopedOpts = {}) => {
    const { content, path } = opts.map[origPath];
    return scopedOpts.inline
      ? content
      : path;
  }
}


function makeAssetsMap(outputs, opts) {
  Object.entries(outputs).forEach(([path, value]) => {
    const key = value.entryPoint
      ? resolve(value.entryPoint)
      : resolve(Object.keys(value.inputs)[0]);

    const hashedPath = path.replace(/^public/, '');

    if (!opts.assets.map[key]) {
      opts.assets.map[key] = {};
    }

    if (opts.watch) {
      const fileSize = fs.statSync(resolve(path)).size;

      if (opts.assets.map[key].size !== fileSize) {
        console.log('changed now notify!!!!!', path, key);
        notifyClient(hashedPath);
      }

      opts.assets.map[key].size = fileSize;
    }

    if (opts.assets.inline.includes(key)) {
      const cssPath = resolve(__base, '../public', hashedPath.replace(/^\//, ''));
      opts.assets.map[key].content = fs.readFileSync(cssPath, 'utf8');
    }

    opts.assets.map[key].path = key.match(/\.svg$/)
      ? hashedPath
      : `${opts.assets.origin}${hashedPath}`;
  });
}


exports.asset = asset;
exports.makeAssetsMap = makeAssetsMap;
