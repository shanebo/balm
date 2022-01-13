const crypto = require('crypto');
const os = require('os');

const hash = (str) => crypto
  .createHash('md5')
  .update(str)
  .digest('hex')
  .slice(-6);

const makeScopedClass = (path) => {
  // path mutations below are critically important
  // for scoping to work on deployed environments
  const templatePath = path.replace(/\.balm$/, '');
  const key = templatePath.replace(process.cwd(), '');
  return `b-${hash(key)}`;
}

const mapPath = `${os.tmpdir()}/balm-map-${hash(process.cwd())}.json`;

exports.hash = hash;
exports.makeScopedClass = makeScopedClass;
exports.fileExtRegexStr = '(.balm$)';
exports.isDev = process.env.NODE_ENV === 'development';
exports.mapPath = mapPath;
