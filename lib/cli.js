#!/usr/bin/env node

const { bundle } = require('./bundling');
const { resolve } = require('path');
const config = require('./config');
const appOpts = require(`${process.cwd()}/app/config`);

if (process.argv.length !== 3) {
  console.log('Usage: balm <path>');
  return;
}

const opts = config({
  root: resolve(process.argv[2]),
  runBundler: true,
  watch: false,
  esbuild: appOpts.engine.opts.esbuild
});

bundle(opts);
