const { balm } = require('../lib/index');
const { expect } = require('chai');

describe('File System', function() {
  it('renders files from the file system', function() {
    const engine = balm({
      root: __dirname,
      watch: false
    });
    expect(engine.render('templates/view').replace(/\s+/g, ' ')).to.equal('header | the view click | footer');
  });
});
