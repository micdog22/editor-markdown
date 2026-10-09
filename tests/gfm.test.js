// Extensões do GitHub Flavored Markdown: tabelas, tachado e links automáticos estendidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCases } from './helpers.js';
import { findAutolinks, parseDelimiterRow, splitTableRow } from '../src/markdown.js';

const table = (head, rows) => {
  let out = '<table>\n<thead>\n<tr>\n';
  for (const [text, align] of head) out += `<th${align ? ` align="${align}"` : ''}>${text}</th>\n`;
  out += '</tr>\n</thead>\n';
  if (rows.length) {
    out += '<tbody>\n';
    for (const row of rows) {
      out += '<tr>\n';
      row.forEach((text, i) => {
        const align = head[i][1];
        out += `<td${align ? ` align="${align}"` : ''}>${text}</td>\n`;
      });
      out += '</tr>\n';
    }
    out += '</tbody>\n';
  }
  return out + '</table>\n';
};

runCases('tabela', [
  ['| foo | bar |\n| --- | --- |\n| baz | bim |', table([['foo'], ['bar']], [['baz', 'bim']])],
  ['| abc | defghi |\n:-: | -----------:\nbar | baz', table([['abc', 'center'], ['defghi', 'right']], [['bar', 'baz']])],
  ['| f\\|oo  |\n| ------ |\n| b `\\|` az |\n| b **\\|** im |',
    table([['f|oo']], [['b <code>|</code> az'], ['b <strong>|</strong> im']])],
  ['| abc | def |\n| --- | --- |\n| bar | baz |\n> bar',
    table([['abc'], ['def']], [['bar', 'baz']]) + '<blockquote>\n<p>bar</p>\n</blockquote>\n'],
  ['| abc | def |\n| --- | --- |\n| bar | baz |\nbar\n\nbar',
    table([['abc'], ['def']], [['bar', 'baz'], ['bar', '']]) + '<p>bar</p>\n'],
  ['| abc | def |\n| --- |\n| bar |', '<p>| abc | def |\n| --- |\n| bar |</p>\n'],
  ['| abc | def |\n| --- | --- |\n| bar |\n| bar | baz | boo |', table([['abc'], ['def']], [['bar', ''], ['bar', 'baz']])],
  ['| abc | def |\n| --- | --- |', table([['abc'], ['def']], [])],
  ['texto antes\n| a | b |\n|---|---|\n| 1 | 2 |', '<p>texto antes</p>\n' + table([['a'], ['b']], [['1', '2']])],
  ['a | b\n--|--\n1 | 2', table([['a'], ['b']], [['1', '2']])],
  ['| a |\n| :-: |\n| *x* |', table([['a', 'center']], [['<em>x</em>']])],
  ['- | a | b |\n  | - | - |\n  | 1 | 2 |', '<ul>\n<li>\n' + table([['a'], ['b']], [['1', '2']]) + '</li>\n</ul>\n'],
  ['> | a |\n> | - |\n> | 1 |', '<blockquote>\n' + table([['a']], [['1']]) + '</blockquote>\n'],
  ['| a | b |\n| - | - |\n| 1 | 2 |\n- item', table([['a'], ['b']], [['1', '2']]) + '<ul>\n<li>item</li>\n</ul>\n'],
  ['| a |\n| - |\n# título', table([['a']], []) + '<h1>título</h1>\n'],
  ['[r]: /url\n| a |\n| - |\n| [r] |', table([['a']], [['<a href="/url">r</a>']])],
  ['Título\n---', '<h2>Título</h2>\n'],
  ['| a | b |\n| - | - |', '<p>| a | b |\n| - | - |</p>\n', { gfm: false }],
]);

runCases('tachado', [
  ['~~Hi~~ Hello, ~there~ world!', '<p><del>Hi</del> Hello, <del>there</del> world!</p>\n'],
  ['This ~~has a\n\nnew paragraph~~.', '<p>This ~~has a</p>\n<p>new paragraph~~.</p>\n'],
  ['This will ~~~not~~~ strike.', '<p>This will ~~~not~~~ strike.</p>\n'],
  ['~~mistura~', '<p>~~mistura~</p>\n'],
  ['~~*ênfase* dentro~~', '<p><del><em>ênfase</em> dentro</del></p>\n'],
  ['**~~ambos~~**', '<p><strong><del>ambos</del></strong></p>\n'],
  ['a ~~ b ~~ c', '<p>a ~~ b ~~ c</p>\n'],
  ['~~sem GFM~~', '<p>~~sem GFM~~</p>\n', { gfm: false }],
]);

runCases('link automático estendido', [
  ['www.commonmark.org', '<p><a href="http://www.commonmark.org">www.commonmark.org</a></p>\n'],
  ['Visit www.commonmark.org/help for more information.',
    '<p>Visit <a href="http://www.commonmark.org/help">www.commonmark.org/help</a> for more information.</p>\n'],
  ['Visit www.commonmark.org.\n\nVisit www.commonmark.org/a.b.',
    '<p>Visit <a href="http://www.commonmark.org">www.commonmark.org</a>.</p>\n<p>Visit <a href="http://www.commonmark.org/a.b">www.commonmark.org/a.b</a>.</p>\n'],
  ['www.google.com/search?q=Markup+(business)\n\nwww.google.com/search?q=Markup+(business)))\n\n(www.google.com/search?q=Markup+(business))\n\n(www.google.com/search?q=Markup+(business)',
    '<p><a href="http://www.google.com/search?q=Markup+(business)">www.google.com/search?q=Markup+(business)</a></p>\n'
    + '<p><a href="http://www.google.com/search?q=Markup+(business)">www.google.com/search?q=Markup+(business)</a>))</p>\n'
    + '<p>(<a href="http://www.google.com/search?q=Markup+(business)">www.google.com/search?q=Markup+(business)</a>)</p>\n'
    + '<p>(<a href="http://www.google.com/search?q=Markup+(business)">www.google.com/search?q=Markup+(business)</a></p>\n'],
  ['www.google.com/search?q=(business))+ok',
    '<p><a href="http://www.google.com/search?q=(business))+ok">www.google.com/search?q=(business))+ok</a></p>\n'],
  ['www.google.com/search?q=commonmark&hl=en\n\nwww.google.com/search?q=commonmark&hl;',
    '<p><a href="http://www.google.com/search?q=commonmark&amp;hl=en">www.google.com/search?q=commonmark&amp;hl=en</a></p>\n'
    + '<p><a href="http://www.google.com/search?q=commonmark">www.google.com/search?q=commonmark</a>&amp;hl;</p>\n'],
  ['www.commonmark.org/he<lp', '<p><a href="http://www.commonmark.org/he">www.commonmark.org/he</a>&lt;lp</p>\n'],
  ['http://commonmark.org\n\n(Visit https://encrypted.google.com/search?q=Markup+(business))',
    '<p><a href="http://commonmark.org">http://commonmark.org</a></p>\n'
    + '<p>(Visit <a href="https://encrypted.google.com/search?q=Markup+(business)">https://encrypted.google.com/search?q=Markup+(business)</a>)</p>\n'],
  ['foo@bar.baz', '<p><a href="mailto:foo@bar.baz">foo@bar.baz</a></p>\n'],
  ['hello@mail+xyz.example isn\'t valid, but hello+xyz@mail.example is.',
    '<p>hello@mail+xyz.example isn\'t valid, but <a href="mailto:hello+xyz@mail.example">hello+xyz@mail.example</a> is.</p>\n'],
  ['a.b-c_d@a.b\n\na.b-c_d@a.b.\n\na.b-c_d@a.b-\n\na.b-c_d@a.b_',
    '<p><a href="mailto:a.b-c_d@a.b">a.b-c_d@a.b</a></p>\n<p><a href="mailto:a.b-c_d@a.b">a.b-c_d@a.b</a>.</p>\n<p>a.b-c_d@a.b-</p>\n<p>a.b-c_d@a.b_</p>\n'],
  ['*www.example.com*', '<p><em><a href="http://www.example.com">www.example.com</a></em></p>\n'],
  ['[www.example.com](/outro)', '<p><a href="/outro">www.example.com</a></p>\n'],
  ['`www.example.com`', '<p><code>www.example.com</code></p>\n'],
  ['xwww.example.com', '<p>xwww.example.com</p>\n'],
  ['WWW.example.com', '<p>WWW.example.com</p>\n'],
  ['www.exa_mple.com', '<p>www.exa_mple.com</p>\n'],
  ['www\\.example.com e fulano\\@site.example', '<p>www.example.com e fulano@site.example</p>\n'],
  ['&#119;ww.example.com', '<p>www.example.com</p>\n'],
  ['www.under_score.example.com', '<p><a href="http://www.under_score.example.com">www.under_score.example.com</a></p>\n'],
  ['ahttp://example.com', '<p>ahttp://example.com</p>\n'],
  ['"https://example.com"', '<p>&quot;<a href="https://example.com">https://example.com</a>&quot;</p>\n'],
  ['https://example.com/a_b?x=1&y=2', '<p><a href="https://example.com/a_b?x=1&amp;y=2">https://example.com/a_b?x=1&amp;y=2</a></p>\n'],
  ['https://example.com/wiki/São_Paulo', '<p><a href="https://example.com/wiki/S%C3%A3o_Paulo">https://example.com/wiki/São_Paulo</a></p>\n'],
  ['contato@site.example.', '<p><a href="mailto:contato@site.example">contato@site.example</a>.</p>\n'],
]);

test('divisão de linhas de tabela', () => {
  assert.deepEqual(splitTableRow('| a | b |'), ['a', 'b']);
  assert.deepEqual(splitTableRow('a|b|c'), ['a', 'b', 'c']);
  assert.deepEqual(splitTableRow('| a \\| b |'), ['a | b']);
  assert.deepEqual(splitTableRow('| a | \\|'), ['a', '|']);
  assert.deepEqual(splitTableRow('| x \\\\|'), ['x \\\\']);
  assert.deepEqual(splitTableRow('|  |'), ['']);
});

test('linha delimitadora e alinhamentos', () => {
  assert.deepEqual(parseDelimiterRow('| :-- | :-: | --: | --- |'), ['left', 'center', 'right', null]);
  assert.deepEqual(parseDelimiterRow('---|---'), [null, null]);
  assert.equal(parseDelimiterRow('| a |'), null);
  assert.equal(parseDelimiterRow('| :: |'), null);
  assert.equal(parseDelimiterRow('| - - |'), null);
});

test('findAutolinks devolve trechos e destinos', () => {
  assert.deepEqual(findAutolinks('veja www.x.org e a@b.co!'), [
    { text: 'veja ' },
    { text: 'www.x.org', href: 'http://www.x.org' },
    { text: ' e ' },
    { text: 'a@b.co', href: 'mailto:a@b.co' },
    { text: '!' },
  ]);
  assert.deepEqual(findAutolinks('nada aqui'), [{ text: 'nada aqui' }]);
});
