#!/usr/bin/env node

const { balm } = require('./index');
const esbuild = require('./esbuild');
const { resolve } = require('path');

if (process.argv.length != 3) {
  console.log('Usage: balm <path>');
  return;
}

const root = resolve(process.argv[2]);

console.log(`Bundling balm files from ${root}...`);

balm({
  root,
  watch: false,
  loadHandles: false
});

esbuild();
