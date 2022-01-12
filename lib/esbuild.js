#!/usr/bin/env node

const esbuild = require('esbuild');
const postcss = require('esbuild-postcss');
const browserslistToEsbuild = require('browserslist-to-esbuild');
const babel = require('esbuild-plugin-babel');
const { resolve } = require('path');
const fs = require('fs');
const { isDev } = require('./utils');


const defaultBuild = {
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
  plugins: isDev
    ? [
        postcss()
      ]
    : [
        postcss(),
        babel({
          filter: /.*js/,
          namespace: '',
          config: {} // babel config here or in babel.config.json
        })
      ],
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
};

const assetsBuild = JSON.parse(fs.readFileSync(resolve('assets.json'), 'utf8'));

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

module.exports = () => {
  esbuild.build({
    ...defaultBuild,
    ...assetsBuild
  }).then((result) => {
    console.log(`esbuild ${isDev ? 'watching...' : 'done'}`);
    makeAssetsMap(result.metafile.outputs);
  });
}
