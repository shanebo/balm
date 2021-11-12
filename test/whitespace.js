const { balm } = require('../lib/index');
const { expect } = require('chai');
const engine = balm({ root: __dirname });

describe('Templating', function() {
  it('removes repetitive whitespace', function() {
    expect(engine.render('templates/whitespace')).to.include('<span>some spanned content</span>');
  });

  it('does not remove whitespace in pre, code and textarea tags', function() {
    const rendered = engine.render('templates/whitespace');
    expect(rendered).to.include('<pre> some  pre-formatted     content</pre>');
    expect(rendered).to.include('<pre> other      content</pre>');
    expect(rendered).to.include('<code>   some    code   </code>');
    expect(rendered).to.
      include("<textarea>some other  in put that    is text\n            some text\n      </textarea>");
  });

  it('does not remove textarea whitespace while scoped', function() {
    const rendered = engine.render('templates/whitespace-scoped');
    expect(rendered).to.include('<body> <textarea class="b-b2350a">\n    Hello world.\n    This works.\n  </textarea> </body>');
  });
});
