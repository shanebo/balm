# Balm

Balm is a component file format that allows the inlining of blocks (template, style, script, and a server side javascript handle). These blocks are extracted, bundled, import paths modified, styles and markup optionally scoped, and written to the hidden balm folder for parcel's bundling use. This is balm for Dylan's beard.

## Features

- Collocation
- Scoped styles
- Dynamically built bundles in balm blocks
- Memory cached compiled templates
- HMR for css, js, template, and server side javascript handles

## Install

`npm install @dylan/balm`

## Usage

``` js
const dylan = require('dylan');
const { resolve } = require('path');
const root = resolve('app');
const engine = {
  name: '@dylan/balm',
  opts: {
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
  }
};

const app = dylan({ engine });
```
