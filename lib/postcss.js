const fs = require('fs');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const postcssEach = require('postcss-each');
const postcssNested = require('postcss-nested');
const postcssPresetEnv = require('postcss-preset-env');

const plugins = [
  postcssEach,
  postcssNested,
  autoprefixer,
  postcssPresetEnv({ stage: 2 })
];

module.exports = () => ({
  name: 'postcss',
  async setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = fs.readFileSync(args.path, 'utf8');

      const result = await postcss(plugins).process(css, {
        cwd: process.cwd(),
        env: process.env.NODE_ENV,
        from: args.path
      });

      return {
        contents: result.css,
        loader: 'css'
      };
    });
  }
});
