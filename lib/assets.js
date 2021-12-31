const fs = require('fs');
const { resolve } = require('path');
let assetsMap = false;
let assetOpts = { inline: [] };


function asset(options = { inline: [] }) {
  assetOpts = options;

  return (origPath, opts = {}) => {
    if (!assetsMap) {
      console.log('Balm loadAssetsMap');
      assetsMap = JSON.parse(fs.readFileSync(resolve('assets-map.json'), 'utf8'));
    }

    const { content, path } = assetsMap[origPath];
    return opts.inline
      ? content
      : path;
  }
}

function resetAssetsMap() {
  assetsMap = false;
}

exports.asset = asset;
exports.resetAssetsMap = resetAssetsMap;
