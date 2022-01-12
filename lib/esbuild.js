const esbuild = require('esbuild');
const { isDev } = require('./utils');
const { makeAssetsMap } = require('./assets');


module.exports = (opts) => {
  esbuild.build(opts.esbuild).then((result) => {
    console.log(`esbuild ${isDev ? 'watching...' : 'done'}`);
    makeAssetsMap(result.metafile.outputs, opts);
  });
}
