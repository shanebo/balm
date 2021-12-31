const esbuild = require('esbuild');
const postcss = require('esbuild-postcss');
const browserslistToEsbuild = require('browserslist-to-esbuild');
const { resolve } = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

esbuild.build({
  entryPoints: [
    'app/assets/scripts/public.js',
    'app/subdomains/give/assets/give-form.js',
    'app/subdomains/account/assets/account-payment-method-form.js',
    'app/subdomains/hub/assets/hub.js',
    'app/subdomains/give/assets/give.css',
    'app/subdomains/account/assets/account.css',
    'app/subdomains/hub/assets/hub.css',
    'app/subdomains/hub/assets/print.css',
    'app/subdomains/send/receipt.css',
    'app/subdomains/send/send.css',
    'app/assets/social.png',
    'app/subdomains/give/assets/eig-logo.png',
    'app/subdomains/give/assets/social.png',
    'app/subdomains/send/logo.png',
    'app/subdomains/hub/assets/dg-hub-icons.svg'
  ],
  outdir: 'public/dist',
  entryNames: '[name].[hash]',
  minify: !isDev,
  loader: {
    '.png': 'file',
    '.svg': 'file',
    '.woff2': 'file'
  },
  metafile: true,
  bundle: true,
  target: browserslistToEsbuild(),
  plugins: [postcss()],
  watch: isDev
    ? {
        onRebuild(error, result) {
          if (error) {
            console.error('ESBuild rebuilt failed:', error);
          } else {
            console.log('ESBuild watch rebuilt');
            makeAssetsMap(result.metafile.outputs);
          }
        }
      }
    : false
}).then((result) => {
  console.log(`esbuild ${isDev ? 'watching...' : 'done'}`);
  makeAssetsMap(result.metafile.outputs);
});

function makeAssetsMap(outputs) {
  const map = {};

  Object.entries(outputs).forEach(([key, value]) => {
    const original = value.entryPoint
      ? resolve(value.entryPoint)
      : resolve(Object.keys(value.inputs)[0]);

    if (!map[original]) {
      map[original] = key.replace(/^public/, '');
    }
  });

  fs.writeFileSync(resolve('assets-map.json'), JSON.stringify(map, null, 2));
}
