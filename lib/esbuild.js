#!/usr/bin/env node

const esbuild = require('esbuild');
const postcss = require('esbuild-postcss');
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
  target: 'es2020,chrome58,firefox57,safari11,edge16,node12',
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
  const config = require(`${process.cwd()}/app/config`);
  const assetOpts = config.engine.opts.assets;
  const map = {};

  Object.entries(outputs).forEach(([path, value]) => {
    const key = value.entryPoint
      ? resolve(value.entryPoint)
      : resolve(Object.keys(value.inputs)[0]);

    const hashedPath = path.replace(/^public/, '');

    map[key] = {};

    if (assetOpts.inline.includes(key)) {
      const cssPath = resolve(__base, '../public', hashedPath.replace(/^\//, ''));
      map[key].content = fs.readFileSync(cssPath, 'utf8');
    }

    map[key].path = key.match(/\.svg$/)
      ? hashedPath
      : `${assetOpts.origin}${hashedPath}`;
  });

  fs.writeFileSync(resolve('assets-map.json'), JSON.stringify(map, null, 2));
}
