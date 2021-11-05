#!/usr/bin/env node

const { Balm } = require('./index');
const { resolve } = require('path');

if (process.argv.length != 3) {
  console.log('Usage: balm <path>');
  return;
}

const root = resolve(`${process.cwd()}/${process.argv[2]}`);

console.log(`Bundling balm files from ${root}...`)

new Balm({
  root,
  loadHandles: false
});
