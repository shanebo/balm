# Balm

Balm for Dylan's Beard.

Balm is a component file format that allows the inlining of blocks (template, style, script, and script handle). These blocks are extracted, import paths are modified, styles are optionally scoped, and written to the hidden balm folder for bundling use.

## Features
- Scoped styles
- Set bundle(s) the style and script blocks belong to
- Memory cached compiled templates
- HMR for css, js, template, and handles

## Install

`npm install @dylan/balm`

## Usage

``` js
const dylan = require('dylan');
const balm = require('@dylan/balm');
const { resolve } = require('path');
const root = resolve('app');
const engine = balm.config({
  root,
  watch: process.env.NODE_ENV === 'development',
  assets: {
    origin: 'https://statics.website.com',
    inline: [resolve('app/subdomains/send/send.css')]
  },
  components: {
    renderer: 'clonedAndMergedLocalsComponent',
    shortcut: [
      {
        dir: root + '/components',
        alias: (name) => name
      },
      {
        dir: root + '/subdomains/hub/components',
        alias: (name) => `hub.${name}`
      }
    ]
  }
});

const app = dylan({ engine });
```
