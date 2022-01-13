const fs = require('fs');
const esbuild = require('esbuild');
const { isDev } = require('./utils');
const { resolve } = require('path');
const hmr = require('./hmr-server');


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
        hmr.notify(hashedPath);
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


function build(opts) {
  esbuild.build(opts.esbuild).then((result) => {
    console.log(`esbuild ${isDev ? 'watching...' : 'done'}`);
    makeAssetsMap(result.metafile.outputs, opts);
  });
}


exports.esbuild = build;
exports.makeAssetsMap = makeAssetsMap;
