// Itens de lista, listas apertadas e frouxas, aninhamento e listas de tarefas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCases } from './helpers.js';
import { parse } from '../src/markdown.js';

runCases('item de lista', [
  ['A paragraph\nwith two lines.\n\n    indented code\n\n> A block quote.',
    '<p>A paragraph\nwith two lines.</p>\n<pre><code>indented code\n</code></pre>\n<blockquote>\n<p>A block quote.</p>\n</blockquote>\n'],
  ['1.  A paragraph\n    with two lines.\n\n        indented code\n\n    > A block quote.',
    '<ol>\n<li>\n<p>A paragraph\nwith two lines.</p>\n<pre><code>indented code\n</code></pre>\n<blockquote>\n<p>A block quote.</p>\n</blockquote>\n</li>\n</ol>\n'],
  ['- one\n\n two', '<ul>\n<li>one</li>\n</ul>\n<p>two</p>\n'],
  ['- one\n\n  two', '<ul>\n<li>\n<p>one</p>\n<p>two</p>\n</li>\n</ul>\n'],
  [' -    one\n\n     two', '<ul>\n<li>one</li>\n</ul>\n<pre><code> two\n</code></pre>\n'],
  [' -    one\n\n      two', '<ul>\n<li>\n<p>one</p>\n<p>two</p>\n</li>\n</ul>\n'],
  ['   > > 1.  one\n>>\n>>     two',
    '<blockquote>\n<blockquote>\n<ol>\n<li>\n<p>one</p>\n<p>two</p>\n</li>\n</ol>\n</blockquote>\n</blockquote>\n'],
  ['>>- one\n>>\n  >  > two', '<blockquote>\n<blockquote>\n<ul>\n<li>one</li>\n</ul>\n<p>two</p>\n</blockquote>\n</blockquote>\n'],
  ['-one\n\n2.two', '<p>-one</p>\n<p>2.two</p>\n'],
  ['- foo\n\n\n  bar', '<ul>\n<li>\n<p>foo</p>\n<p>bar</p>\n</li>\n</ul>\n'],
  ['1.  foo\n\n    ```\n    bar\n    ```\n\n    baz\n\n    > bam',
    '<ol>\n<li>\n<p>foo</p>\n<pre><code>bar\n</code></pre>\n<p>baz</p>\n<blockquote>\n<p>bam</p>\n</blockquote>\n</li>\n</ol>\n'],
  ['- Foo\n\n      bar\n\n\n      baz', '<ul>\n<li>\n<p>Foo</p>\n<pre><code>bar\n\n\nbaz\n</code></pre>\n</li>\n</ul>\n'],
  ['123456789. ok', '<ol start="123456789">\n<li>ok</li>\n</ol>\n'],
  ['1234567890. not ok', '<p>1234567890. not ok</p>\n'],
  ['0. ok', '<ol start="0">\n<li>ok</li>\n</ol>\n'],
  ['003. ok', '<ol start="3">\n<li>ok</li>\n</ol>\n'],
  ['-1. not ok', '<p>-1. not ok</p>\n'],
  ['- foo\n\n      bar', '<ul>\n<li>\n<p>foo</p>\n<pre><code>bar\n</code></pre>\n</li>\n</ul>\n'],
  ['  10.  foo\n\n           bar', '<ol start="10">\n<li>\n<p>foo</p>\n<pre><code>bar\n</code></pre>\n</li>\n</ol>\n'],
  ['    indented code\n\nparagraph\n\n    more code',
    '<pre><code>indented code\n</code></pre>\n<p>paragraph</p>\n<pre><code>more code\n</code></pre>\n'],
  ['1.     indented code\n\n   paragraph\n\n       more code',
    '<ol>\n<li>\n<pre><code>indented code\n</code></pre>\n<p>paragraph</p>\n<pre><code>more code\n</code></pre>\n</li>\n</ol>\n'],
  ['1.      indented code\n\n   paragraph\n\n       more code',
    '<ol>\n<li>\n<pre><code> indented code\n</code></pre>\n<p>paragraph</p>\n<pre><code>more code\n</code></pre>\n</li>\n</ol>\n'],
  ['   foo\n\nbar', '<p>foo</p>\n<p>bar</p>\n'],
  ['-    foo\n\n  bar', '<ul>\n<li>foo</li>\n</ul>\n<p>bar</p>\n'],
  ['-  foo\n\n   bar', '<ul>\n<li>\n<p>foo</p>\n<p>bar</p>\n</li>\n</ul>\n'],
  ['-\n  foo\n-\n  ```\n  bar\n  ```\n-\n      baz',
    '<ul>\n<li>foo</li>\n<li>\n<pre><code>bar\n</code></pre>\n</li>\n<li>\n<pre><code>baz\n</code></pre>\n</li>\n</ul>\n'],
  ['-   \n  foo', '<ul>\n<li>foo</li>\n</ul>\n'],
  ['-\n\n  foo', '<ul>\n<li></li>\n</ul>\n<p>foo</p>\n'],
  ['- foo\n-\n- bar', '<ul>\n<li>foo</li>\n<li></li>\n<li>bar</li>\n</ul>\n'],
  ['- foo\n-   \n- bar', '<ul>\n<li>foo</li>\n<li></li>\n<li>bar</li>\n</ul>\n'],
  ['1. foo\n2.\n3. bar', '<ol>\n<li>foo</li>\n<li></li>\n<li>bar</li>\n</ol>\n'],
  ['*', '<ul>\n<li></li>\n</ul>\n'],
  ['foo\n*\n\nfoo\n1.', '<p>foo\n*</p>\n<p>foo\n1.</p>\n'],
  ['    1.  A paragraph\n        with two lines.\n\n            indented code\n\n        > A block quote.',
    '<pre><code>1.  A paragraph\n    with two lines.\n\n        indented code\n\n    &gt; A block quote.\n</code></pre>\n'],
  ['  1.  A paragraph\nwith two lines.\n\n          indented code\n\n      > A block quote.',
    '<ol>\n<li>\n<p>A paragraph\nwith two lines.</p>\n<pre><code>indented code\n</code></pre>\n<blockquote>\n<p>A block quote.</p>\n</blockquote>\n</li>\n</ol>\n'],
  ['  1.  A paragraph\n    with two lines.', '<ol>\n<li>A paragraph\nwith two lines.</li>\n</ol>\n'],
  ['> 1. > Blockquote\ncontinued here.',
    '<blockquote>\n<ol>\n<li>\n<blockquote>\n<p>Blockquote\ncontinued here.</p>\n</blockquote>\n</li>\n</ol>\n</blockquote>\n'],
  ['> 1. > Blockquote\n> continued here.',
    '<blockquote>\n<ol>\n<li>\n<blockquote>\n<p>Blockquote\ncontinued here.</p>\n</blockquote>\n</li>\n</ol>\n</blockquote>\n'],
  ['- foo\n  - bar\n    - baz\n      - boo',
    '<ul>\n<li>foo\n<ul>\n<li>bar\n<ul>\n<li>baz\n<ul>\n<li>boo</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n'],
  ['- foo\n - bar\n  - baz\n   - boo', '<ul>\n<li>foo</li>\n<li>bar</li>\n<li>baz</li>\n<li>boo</li>\n</ul>\n'],
  ['10) foo\n    - bar', '<ol start="10">\n<li>foo\n<ul>\n<li>bar</li>\n</ul>\n</li>\n</ol>\n'],
  ['10) foo\n   - bar', '<ol start="10">\n<li>foo</li>\n</ol>\n<ul>\n<li>bar</li>\n</ul>\n'],
  ['- - foo', '<ul>\n<li>\n<ul>\n<li>foo</li>\n</ul>\n</li>\n</ul>\n'],
  ['1. - 2. foo', '<ol>\n<li>\n<ul>\n<li>\n<ol start="2">\n<li>foo</li>\n</ol>\n</li>\n</ul>\n</li>\n</ol>\n'],
  ['- # Foo\n- Bar\n  ---\n  baz', '<ul>\n<li>\n<h1>Foo</h1>\n</li>\n<li>\n<h2>Bar</h2>\nbaz</li>\n</ul>\n'],
]);

runCases('listas', [
  ['- foo\n- bar\n+ baz', '<ul>\n<li>foo</li>\n<li>bar</li>\n</ul>\n<ul>\n<li>baz</li>\n</ul>\n'],
  ['1. foo\n2. bar\n3) baz', '<ol>\n<li>foo</li>\n<li>bar</li>\n</ol>\n<ol start="3">\n<li>baz</li>\n</ol>\n'],
  ['Foo\n- bar\n- baz', '<p>Foo</p>\n<ul>\n<li>bar</li>\n<li>baz</li>\n</ul>\n'],
  ['The number of windows in my house is\n14.  The number of doors is 6.',
    '<p>The number of windows in my house is\n14.  The number of doors is 6.</p>\n'],
  ['The number of windows in my house is\n1.  The number of doors is 6.',
    '<p>The number of windows in my house is</p>\n<ol>\n<li>The number of doors is 6.</li>\n</ol>\n'],
  ['- foo\n\n- bar\n\n\n- baz', '<ul>\n<li>\n<p>foo</p>\n</li>\n<li>\n<p>bar</p>\n</li>\n<li>\n<p>baz</p>\n</li>\n</ul>\n'],
  ['- foo\n  - bar\n    - baz\n\n\n      bim',
    '<ul>\n<li>foo\n<ul>\n<li>bar\n<ul>\n<li>\n<p>baz</p>\n<p>bim</p>\n</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n'],
  ['- a\n - b\n  - c\n   - d\n  - e\n - f\n- g',
    '<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n<li>d</li>\n<li>e</li>\n<li>f</li>\n<li>g</li>\n</ul>\n'],
  ['1. a\n\n  2. b\n\n   3. c', '<ol>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ol>\n'],
  ['- a\n - b\n  - c\n   - d\n    - e', '<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n<li>d\n- e</li>\n</ul>\n'],
  ['1. a\n\n  2. b\n\n    3. c', '<ol>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ol>\n<pre><code>3. c\n</code></pre>\n'],
  ['- a\n- b\n\n- c', '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ul>\n'],
  ['* a\n*\n\n* c', '<ul>\n<li>\n<p>a</p>\n</li>\n<li></li>\n<li>\n<p>c</p>\n</li>\n</ul>\n'],
  ['- a\n- b\n\n  c\n- d', '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n<p>c</p>\n</li>\n<li>\n<p>d</p>\n</li>\n</ul>\n'],
  ['- a\n- b\n\n  [ref]: /url\n- d', '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n<li>\n<p>d</p>\n</li>\n</ul>\n'],
  ['- a\n- ```\n  b\n\n\n  ```\n- c', '<ul>\n<li>a</li>\n<li>\n<pre><code>b\n\n\n</code></pre>\n</li>\n<li>c</li>\n</ul>\n'],
  ['- a\n  - b\n\n    c\n- d', '<ul>\n<li>a\n<ul>\n<li>\n<p>b</p>\n<p>c</p>\n</li>\n</ul>\n</li>\n<li>d</li>\n</ul>\n'],
  ['* a\n  > b\n  >\n* c', '<ul>\n<li>a\n<blockquote>\n<p>b</p>\n</blockquote>\n</li>\n<li>c</li>\n</ul>\n'],
  ['- a\n  > b\n  ```\n  c\n  ```\n- d', '<ul>\n<li>a\n<blockquote>\n<p>b</p>\n</blockquote>\n<pre><code>c\n</code></pre>\n</li>\n<li>d</li>\n</ul>\n'],
  ['- a', '<ul>\n<li>a</li>\n</ul>\n'],
  ['- a\n  - b', '<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n'],
  ['1. ```\n   foo\n   ```\n\n   bar', '<ol>\n<li>\n<pre><code>foo\n</code></pre>\n<p>bar</p>\n</li>\n</ol>\n'],
  ['* foo\n  * bar\n\n  baz', '<ul>\n<li>\n<p>foo</p>\n<ul>\n<li>bar</li>\n</ul>\n<p>baz</p>\n</li>\n</ul>\n'],
  ['- a\n  - b\n  - c\n\n- d\n  - e\n  - f',
    '<ul>\n<li>\n<p>a</p>\n<ul>\n<li>b</li>\n<li>c</li>\n</ul>\n</li>\n<li>\n<p>d</p>\n<ul>\n<li>e</li>\n<li>f</li>\n</ul>\n</li>\n</ul>\n'],
  ['-   foo\n\n    notcode\n\n-   foo\n\n<!-- -->\n\n    code',
    '<ul>\n<li>\n<p>foo</p>\n<p>notcode</p>\n</li>\n<li>\n<p>foo</p>\n</li>\n</ul>\n<pre><code>code\n</code></pre>\n',
    { html: 'sanitize' }],
  ['- foo\n- bar\n\n<!-- -->\n\n- baz\n- bim',
    '<ul>\n<li>foo</li>\n<li>bar</li>\n</ul>\n<ul>\n<li>baz</li>\n<li>bim</li>\n</ul>\n', { html: 'sanitize' }],
]);

runCases('lista de tarefas', [
  ['- [ ] foo\n- [x] bar',
    '<ul>\n<li class="task-list-item"><input type="checkbox" disabled="" /> foo</li>\n'
    + '<li class="task-list-item"><input type="checkbox" checked="" disabled="" /> bar</li>\n</ul>\n'],
  ['- [x] foo\n  - [ ] bar\n  - [X] baz\n- [ ] bim',
    '<ul>\n<li class="task-list-item"><input type="checkbox" checked="" disabled="" /> foo\n<ul>\n'
    + '<li class="task-list-item"><input type="checkbox" disabled="" /> bar</li>\n'
    + '<li class="task-list-item"><input type="checkbox" checked="" disabled="" /> baz</li>\n</ul>\n</li>\n'
    + '<li class="task-list-item"><input type="checkbox" disabled="" /> bim</li>\n</ul>\n'],
  ['1. [x] numerada', '<ol>\n<li class="task-list-item"><input type="checkbox" checked="" disabled="" /> numerada</li>\n</ol>\n'],
  ['- [ ] frouxa\n\n- [x] também',
    '<ul>\n<li class="task-list-item">\n<p><input type="checkbox" disabled="" /> frouxa</p>\n</li>\n'
    + '<li class="task-list-item">\n<p><input type="checkbox" checked="" disabled="" /> também</p>\n</li>\n</ul>\n'],
  ['- [ ]sem espaço', '<ul>\n<li>[ ]sem espaço</li>\n</ul>\n'],
  ['- [y] outra letra', '<ul>\n<li>[y] outra letra</li>\n</ul>\n'],
  ['[ ] fora de lista', '<p>[ ] fora de lista</p>\n'],
  ['- texto [ ] no meio', '<ul>\n<li>texto [ ] no meio</li>\n</ul>\n'],
  ['- [ ] sem GFM', '<ul>\n<li>[ ] sem GFM</li>\n</ul>\n', { gfm: false }],
]);

test('aperto da lista fica na árvore', () => {
  const tight = parse('- a\n- b').firstChild;
  const loose = parse('- a\n\n- b').firstChild;
  assert.equal(tight.tight, true);
  assert.equal(loose.tight, false);
  assert.equal(parse('3. x').firstChild.listData.start, 3);
  assert.equal(parse('- [x] y').firstChild.firstChild.task, 'checked');
});
