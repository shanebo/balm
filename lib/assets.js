const fs = require('fs');
const { resolve } = require('path');
let assetsMap = false;
let assetOpts = { inline: [] };


function asset(options = { inline: [] }) {
  assetOpts = options;

  return (origPath, opts = {}) => {
    if (!assetsMap) {
      console.log('Balm loadAssetsMap');
      loadAssetsMap(assetOpts.origin);
    }

    const { content, path } = assetsMap[origPath];
    return opts.inline
      ? content
      : path;
  }
}



const loadAssetsMap = (origin) => {
  assetsMap = {};

  const map = JSON.parse(fs.readFileSync(resolve('assets-map.json'), 'utf8'));

  Object.keys(map).forEach((key) => {
    const hashedPath = map[key];
    assetsMap[key] = {};

    if (assetOpts.inline.includes(key)) {
      const cssPath = resolve(__base, '../public', hashedPath.replace(/^\//, ''));
      assetsMap[key].content = fs.readFileSync(cssPath, 'utf8');
    }

    assetsMap[key].path = key.match(/\.svg$/)
      ? hashedPath
      : `${origin}${hashedPath}`;
  });
}

exports.asset = asset;
