#!/usr/bin/env node

const { balm } = require('./index');
const { resolve } = require('path');

if (process.argv.length !== 3) {
  console.log('Usage: balm <path>');
  return;
}

const root = resolve(process.argv[2]);

balm({
  root,
  watch: false,
  loadHandles: false,
  runBundler: true
});

console.log(`Bundling balm files from ${root}...`);
