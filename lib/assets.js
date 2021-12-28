const fs = require('fs');
const { resolve } = require('path');
let assetsMap = false;
let assetOpts = { inline: [] };


function asset(options = { inline: [] }) {
  assetOpts = options;

  return (origPath, opts = {}) => {
    if (!assetsMap) {
      console.log('Balm loadAssetsMap');
      loadAssetsMap();
    }

    const { content, path } = assetsMap[origPath];
    return opts.inline
      ? content
      : path;
  }
}


const loadAssetsMap = () => {
  assetsMap = {};

  const entryPath = resolve('app/assets/entry.html');
  const distDir = 'public/dist';
  const entryDir = dirname(entryPath);
  const entryName = basename(entryPath);
  const resultPath = resolve(distDir, entryName);
  const entryPaths = getAssetPaths(fs.readFileSync(entryPath, 'utf8'));
  const resultPaths = getAssetPaths(fs.readFileSync(resultPath, 'utf8'));

  entryPaths.forEach((path, p) => {
    const key = resolve(entryDir, path);
    const hashedPath = resultPaths[p];

    assetsMap[key] = {};

    if (assetOpts.inline.includes(key)) {
      const cssPath = resolve(__base, '../public', hashedPath.replace(/^\//, ''));
      assetsMap[key].content = fs.readFileSync(cssPath, 'utf8');
    }

    assetsMap[key].path = key.match(/\.svg$/)
      ? hashedPath
      : `${opts.assets.origin}${hashedPath}`;
  });
}

exports.asset = asset;
