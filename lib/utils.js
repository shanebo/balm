const crypto = require('crypto');
const cwd = process.cwd();
const { NODE_ENV, APP_PATH } = process.env;

const hash = (str) => crypto
  .createHash('md5')
  .update(str)
  .digest('hex')
  .slice(-6);

const makeScopedClass = (path) => {
  // path mutations below are critically important
  // for scoping to work on deployed environments
  const templatePath = path.replace(/\.balm$/, '');
  const key = templatePath.replace(cwd, '');
  return `b-${hash(key)}`;
}

const appPath = APP_PATH || cwd;

const mapPath = `${__dirname}/../balm-map-${hash(appPath)}.json`;

const toDeployPath = (path) => {
  // conditionally resolve paths between
  // development and deploy environments
  // for assets, templates, and handles
  return path.startsWith('/')
    ? path.replace(cwd, appPath)
    : `${appPath}/${path}`;
}

exports.hash = hash;
exports.makeScopedClass = makeScopedClass;
exports.fileExtRegexStr = '(.balm$)';
exports.isDev = NODE_ENV === 'development';
exports.mapPath = mapPath;
exports.toDeployPath = toDeployPath;
