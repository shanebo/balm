const crypto = require('crypto');

const hash = (str) => crypto
  .createHash('md5')
  .update(str)
  .digest('hex')
  .slice(-6);

const makeScopedClass = (path) => `b-${hash(path)}`;

const fileExtRegexStr = '(.balm$)';

exports.hash = hash;
exports.makeScopedClass = makeScopedClass;
exports.fileExtRegexStr = fileExtRegexStr;
