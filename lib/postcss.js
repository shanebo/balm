if (process.versions.node) {
  const fs = require('fs');

  const postcssName = 'postcss';
  const autoprefixerName = 'autoprefixer';
  const postcssEachName = 'postcss-each';
  const postcssNestedName = 'postcss-nested';
  const postcssPresetEnvName = 'postcss-preset-env';

  const postcss = require(postcssName);
  const autoprefixer = require(autoprefixerName);
  const postcssEach = require(postcssEachName);
  const postcssNested = require(postcssNestedName);
  const postcssPresetEnv = require(postcssPresetEnvName);

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
}
