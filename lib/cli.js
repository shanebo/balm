#!/usr/bin/env node

const bundler = require('./bundler');
const { resolve } = require('path');
const config = require('./config');
const root = resolve(process.argv[2]);
const appOpts = require(`${root}/config`);
const { origin, esbuild } = appOpts.engine.opts;

if (process.argv.length !== 3) {
  console.log('Usage: balm <path>');
  return;
}

const opts = config({
  root,
  origin: origin || '',
  bundle: true,
  watch: false,
  esbuild
});

bundler.start(opts);
