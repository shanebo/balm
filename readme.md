# Balm

Balm for Dylan's Beard.

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
