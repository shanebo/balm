const fs = require('fs');
const { resolve } = require('path');


function asset(opts) {
  return (origPath, scopedOpts = {}) => {
    const { content, path } = opts.map[origPath];
    return scopedOpts.inline
      ? content
      : path;
  }
}


function makeAssetsMap(outputs, opts) {
  const map = {};

  Object.entries(outputs).forEach(([path, value]) => {
    const key = value.entryPoint
      ? resolve(value.entryPoint)
      : resolve(Object.keys(value.inputs)[0]);

    const hashedPath = path.replace(/^public/, '');

    map[key] = {};

    if (opts.assets.inline.includes(key)) {
      const cssPath = resolve(__base, '../public', hashedPath.replace(/^\//, ''));
      map[key].content = fs.readFileSync(cssPath, 'utf8');
    }

    map[key].path = key.match(/\.svg$/)
      ? hashedPath
      : `${opts.assets.origin}${hashedPath}`;
  });

  opts.assets.map = map;
}


exports.asset = asset;
exports.makeAssetsMap = makeAssetsMap;
