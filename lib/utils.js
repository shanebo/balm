const crypto = require('crypto');

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

exports.hash = hash;
exports.makeScopedClass = makeScopedClass;
exports.fileExtRegexStr = '(.balm$)';
