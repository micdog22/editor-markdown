// Casos de blocos adaptados dos exemplos da especificação CommonMark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCases } from './helpers.js';
import { parse } from '../src/markdown.js';

const S = { html: 'sanitize' };

runCases('tabulações', [
  ['\tfoo\tbaz\t\tbim', '<pre><code>foo\tbaz\t\tbim\n</code></pre>\n'],
  ['  \tfoo\tbaz\t\tbim', '<pre><code>foo\tbaz\t\tbim\n</code></pre>\n'],
  ['    a\ta\n    \u1f50\ta', '<pre><code>a\ta\n\u1f50\ta\n</code></pre>\n'],
  ['  - foo\n\n\tbar', '<ul>\n<li>\n<p>foo</p>\n<p>bar</p>\n</li>\n</ul>\n'],
  ['- foo\n\n\t\tbar', '<ul>\n<li>\n<p>foo</p>\n<pre><code>  bar\n</code></pre>\n</li>\n</ul>\n'],
  ['>\t\tfoo', '<blockquote>\n<pre><code>  foo\n</code></pre>\n</blockquote>\n'],
  ['-\t\tfoo', '<ul>\n<li>\n<pre><code>  foo\n</code></pre>\n</li>\n</ul>\n'],
  ['    foo\n\tbar', '<pre><code>foo\nbar\n</code></pre>\n'],
  [' - foo\n   - bar\n\t - baz', '<ul>\n<li>foo\n<ul>\n<li>bar\n<ul>\n<li>baz</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n'],
  ['#\tFoo', '<h1>Foo</h1>\n'],
  ['*\t*\t*\t', '<hr />\n'],
]);

runCases('quebra temática', [
  ['***\n---\n___', '<hr />\n<hr />\n<hr />\n'],
  ['+++', '<p>+++</p>\n'],
  ['===', '<p>===</p>\n'],
  ['--\n**\n__', '<p>--\n**\n__</p>\n'],
  [' ***\n  ***\n   ***', '<hr />\n<hr />\n<hr />\n'],
  ['    ***', '<pre><code>***\n</code></pre>\n'],
  ['Foo\n    ***', '<p>Foo\n***</p>\n'],
  ['_____________________________________', '<hr />\n'],
  [' - - -', '<hr />\n'],
  [' **  * ** * ** * **', '<hr />\n'],
  ['-     -      -      -', '<hr />\n'],
  ['- - - -    ', '<hr />\n'],
  ['_ _ _ _ a\n\na------\n\n---a---', '<p>_ _ _ _ a</p>\n<p>a------</p>\n<p>---a---</p>\n'],
  [' *-*', '<p><em>-</em></p>\n'],
  ['- foo\n***\n- bar', '<ul>\n<li>foo</li>\n</ul>\n<hr />\n<ul>\n<li>bar</li>\n</ul>\n'],
  ['Foo\n***\nbar', '<p>Foo</p>\n<hr />\n<p>bar</p>\n'],
  ['Foo\n---\nbar', '<h2>Foo</h2>\n<p>bar</p>\n'],
  ['* Foo\n* * *\n* Bar', '<ul>\n<li>Foo</li>\n</ul>\n<hr />\n<ul>\n<li>Bar</li>\n</ul>\n'],
  ['- Foo\n- * * *', '<ul>\n<li>Foo</li>\n<li>\n<hr />\n</li>\n</ul>\n'],
]);

runCases('título ATX', [
  ['# foo\n## foo\n### foo\n#### foo\n##### foo\n###### foo',
    '<h1>foo</h1>\n<h2>foo</h2>\n<h3>foo</h3>\n<h4>foo</h4>\n<h5>foo</h5>\n<h6>foo</h6>\n'],
  ['####### foo', '<p>####### foo</p>\n'],
  ['#5 bolt\n\n#hashtag', '<p>#5 bolt</p>\n<p>#hashtag</p>\n'],
  ['\\## foo', '<p>## foo</p>\n'],
  ['# foo *bar* \\*baz\\*', '<h1>foo <em>bar</em> *baz*</h1>\n'],
  ['#                  foo                     ', '<h1>foo</h1>\n'],
  [' ### foo\n  ## foo\n   # foo', '<h3>foo</h3>\n<h2>foo</h2>\n<h1>foo</h1>\n'],
  ['    # foo', '<pre><code># foo\n</code></pre>\n'],
  ['foo\n    # bar', '<p>foo\n# bar</p>\n'],
  ['## foo ##\n  ###   bar    ###', '<h2>foo</h2>\n<h3>bar</h3>\n'],
  ['# foo ##################################\n##### foo ##', '<h1>foo</h1>\n<h5>foo</h5>\n'],
  ['### foo ###     ', '<h3>foo</h3>\n'],
  ['### foo ### b', '<h3>foo ### b</h3>\n'],
  ['# foo#', '<h1>foo#</h1>\n'],
  ['### foo \\###\n## foo #\\##\n# foo \\#', '<h3>foo ###</h3>\n<h2>foo ###</h2>\n<h1>foo #</h1>\n'],
  ['****\n## foo\n****', '<hr />\n<h2>foo</h2>\n<hr />\n'],
  ['Foo bar\n# baz\nBar foo', '<p>Foo bar</p>\n<h1>baz</h1>\n<p>Bar foo</p>\n'],
  ['## \n#\n### ###', '<h2></h2>\n<h1></h1>\n<h3></h3>\n'],
]);

runCases('título setext', [
  ['Foo *bar*\n=========\n\nFoo *bar*\n---------', '<h1>Foo <em>bar</em></h1>\n<h2>Foo <em>bar</em></h2>\n'],
  ['Foo *bar\nbaz*\n====', '<h1>Foo <em>bar\nbaz</em></h1>\n'],
  ['  Foo *bar\nbaz*\t\n====', '<h1>Foo <em>bar\nbaz</em></h1>\n'],
  ['Foo\n-------------------------\n\nFoo\n=', '<h2>Foo</h2>\n<h1>Foo</h1>\n'],
  ['   Foo\n---\n\n  Foo\n-----\n\n  Foo\n  ===', '<h2>Foo</h2>\n<h2>Foo</h2>\n<h1>Foo</h1>\n'],
  ['    Foo\n    ---\n\n    Foo\n---', '<pre><code>Foo\n---\n\nFoo\n</code></pre>\n<hr />\n'],
  ['Foo\n   ----      ', '<h2>Foo</h2>\n'],
  ['Foo\n    ---', '<p>Foo\n---</p>\n'],
  ['Foo\n= =\n\nFoo\n--- -', '<p>Foo\n= =</p>\n<p>Foo</p>\n<hr />\n'],
  ['Foo  \n-----', '<h2>Foo</h2>\n'],
  ['Foo\\\n----', '<h2>Foo\\</h2>\n'],
  ['`Foo\n----\n`\n\n<a title="a lot\n---\nof dashes"/>',
    '<h2>`Foo</h2>\n<p>`</p>\n<h2>&lt;a title=&quot;a lot</h2>\n<p>of dashes&quot;/&gt;</p>\n'],
  ['> Foo\n---', '<blockquote>\n<p>Foo</p>\n</blockquote>\n<hr />\n'],
  ['> foo\nbar\n===', '<blockquote>\n<p>foo\nbar\n===</p>\n</blockquote>\n'],
  ['- Foo\n---', '<ul>\n<li>Foo</li>\n</ul>\n<hr />\n'],
  ['Foo\nBar\n---', '<h2>Foo\nBar</h2>\n'],
  ['---\nFoo\n---\nBar\n---\nBaz', '<hr />\n<h2>Foo</h2>\n<h2>Bar</h2>\n<p>Baz</p>\n'],
  ['\n====', '<p>====</p>\n'],
  ['---\n---', '<hr />\n<hr />\n'],
  ['- foo\n-----', '<ul>\n<li>foo</li>\n</ul>\n<hr />\n'],
  ['    foo\n---', '<pre><code>foo\n</code></pre>\n<hr />\n'],
  ['> foo\n-----', '<blockquote>\n<p>foo</p>\n</blockquote>\n<hr />\n'],
  ['\\> foo\n------', '<h2>&gt; foo</h2>\n'],
  ['Foo\n\nbar\n---\nbaz', '<p>Foo</p>\n<h2>bar</h2>\n<p>baz</p>\n'],
  ['Foo\nbar\n\n---\n\nbaz', '<p>Foo\nbar</p>\n<hr />\n<p>baz</p>\n'],
  ['Foo\nbar\n* * *\nbaz', '<p>Foo\nbar</p>\n<hr />\n<p>baz</p>\n'],
  ['Foo\nbar\n\\---\nbaz', '<p>Foo\nbar\n---\nbaz</p>\n'],
]);

runCases('código indentado', [
  ['    a simple\n      indented code block', '<pre><code>a simple\n  indented code block\n</code></pre>\n'],
  ['  - foo\n\n    bar', '<ul>\n<li>\n<p>foo</p>\n<p>bar</p>\n</li>\n</ul>\n'],
  ['1.  foo\n\n    - bar', '<ol>\n<li>\n<p>foo</p>\n<ul>\n<li>bar</li>\n</ul>\n</li>\n</ol>\n'],
  ['    <a/>\n    *hi*\n\n    - one', '<pre><code>&lt;a/&gt;\n*hi*\n\n- one\n</code></pre>\n'],
  ['    chunk1\n\n    chunk2\n  \n \n \n    chunk3', '<pre><code>chunk1\n\nchunk2\n\n\n\nchunk3\n</code></pre>\n'],
  ['    chunk1\n      \n      chunk2', '<pre><code>chunk1\n  \n  chunk2\n</code></pre>\n'],
  ['Foo\n    bar', '<p>Foo\nbar</p>\n'],
  ['    foo\nbar', '<pre><code>foo\n</code></pre>\n<p>bar</p>\n'],
  ['# Heading\n    foo\nHeading\n------\n    foo\n----',
    '<h1>Heading</h1>\n<pre><code>foo\n</code></pre>\n<h2>Heading</h2>\n<pre><code>foo\n</code></pre>\n<hr />\n'],
  ['        foo\n    bar', '<pre><code>    foo\nbar\n</code></pre>\n'],
  ['\n    \n    foo\n    ', '<pre><code>foo\n</code></pre>\n'],
  ['    foo  ', '<pre><code>foo  \n</code></pre>\n'],
]);

runCases('código cercado', [
  ['```\n<\n >\n```', '<pre><code>&lt;\n &gt;\n</code></pre>\n'],
  ['~~~\n<\n >\n~~~', '<pre><code>&lt;\n &gt;\n</code></pre>\n'],
  ['``\nfoo\n``', '<p><code>foo</code></p>\n'],
  ['```\naaa\n~~~\n```', '<pre><code>aaa\n~~~\n</code></pre>\n'],
  ['~~~\naaa\n```\n~~~', '<pre><code>aaa\n```\n</code></pre>\n'],
  ['````\naaa\n```\n``````', '<pre><code>aaa\n```\n</code></pre>\n'],
  ['~~~~\naaa\n~~~\n~~~~', '<pre><code>aaa\n~~~\n</code></pre>\n'],
  ['```', '<pre><code></code></pre>\n'],
  ['`````\n\n```\naaa', '<pre><code>\n```\naaa\n</code></pre>\n'],
  ['> ```\n> aaa\n\nbbb', '<blockquote>\n<pre><code>aaa\n</code></pre>\n</blockquote>\n<p>bbb</p>\n'],
  ['```\n\n  \n```', '<pre><code>\n  \n</code></pre>\n'],
  ['```\n```', '<pre><code></code></pre>\n'],
  [' ```\n aaa\naaa\n```', '<pre><code>aaa\naaa\n</code></pre>\n'],
  ['  ```\naaa\n  aaa\naaa\n  ```', '<pre><code>aaa\naaa\naaa\n</code></pre>\n'],
  ['   ```\n   aaa\n    aaa\n  aaa\n   ```', '<pre><code>aaa\n aaa\naaa\n</code></pre>\n'],
  ['    ```\n    aaa\n    ```', '<pre><code>```\naaa\n```\n</code></pre>\n'],
  ['```\naaa\n  ```', '<pre><code>aaa\n</code></pre>\n'],
  ['   ```\naaa\n  ```', '<pre><code>aaa\n</code></pre>\n'],
  ['```\naaa\n    ```', '<pre><code>aaa\n    ```\n</code></pre>\n'],
  ['``` ```\naaa', '<p><code> </code>\naaa</p>\n'],
  ['~~~~~~\naaa\n~~~ ~~', '<pre><code>aaa\n~~~ ~~\n</code></pre>\n'],
  ['foo\n```\nbar\n```\nbaz', '<p>foo</p>\n<pre><code>bar\n</code></pre>\n<p>baz</p>\n'],
  ['foo\n---\n~~~\nbar\n~~~\n# baz', '<h2>foo</h2>\n<pre><code>bar\n</code></pre>\n<h1>baz</h1>\n'],
  ['```ruby\ndef foo(x)\n  return 3\nend\n```', '<pre><code class="language-ruby">def foo(x)\n  return 3\nend\n</code></pre>\n'],
  ['~~~~    ruby startline=3 $%@#$\ndef foo(x)\n  return 3\nend\n~~~~~~~',
    '<pre><code class="language-ruby">def foo(x)\n  return 3\nend\n</code></pre>\n'],
  ['````;\n````', '<pre><code class="language-;"></code></pre>\n'],
  ['``` aa ```\nfoo', '<p><code>aa</code>\nfoo</p>\n'],
  ['~~~ aa ``` ~~~\nfoo\n~~~', '<pre><code class="language-aa">foo\n</code></pre>\n'],
  ['```\n``` aaa\n```', '<pre><code>``` aaa\n</code></pre>\n'],
  ['``` foo\\+bar\nfoo\n```', '<pre><code class="language-foo+bar">foo\n</code></pre>\n'],
  ['``` f&ouml;&ouml;\nfoo\n```', '<pre><code class="language-f\u00f6\u00f6">foo\n</code></pre>\n'],
]);

runCases('bloco de HTML (subconjunto seguro)', [
  ['<table><tr><td>\n<pre>\n**Hello**,\n\n_world_.\n</pre>\n</td></tr></table>',
    '<table><tr><td>\n<pre>\n**Hello**,\n<p><em>world</em>.\n</pre></p>\n</td></tr></table>\n'],
  ['<div>\n  *hello*\n         <foo><a>', '<div>\n  *hello*\n         &lt;foo&gt;<a>\n'],
  ['</div>\n*foo*', '</div>\n*foo*\n'],
  ['<DIV CLASS="foo">\n\n*Markdown*\n\n</DIV>', '<div>\n<p><em>Markdown</em></p>\n</div>\n'],
  ['<div id="foo"\n  class="bar">\n</div>', '<div>\n</div>\n'],
  ['<div>\n*foo*\n\n*bar*', '<div>\n*foo*\n<p><em>bar</em></p>\n'],
  ['<a href="foo">\n*bar*\n</a>', '<a href="foo">\n*bar*\n</a>\n'],
  ['<Warning>\n*bar*\n</Warning>', '&lt;Warning&gt;\n*bar*\n&lt;/Warning&gt;\n'],
  ['<del>*foo*</del>', '<p><del><em>foo</em></del></p>\n'],
  ['<del>\n\n*foo*\n\n</del>', '<del>\n<p><em>foo</em></p>\n</del>\n'],
  ['<pre language="haskell"><code>\nimport Text.HTML.TagSoup\n\nmain :: IO ()\n</code></pre>\nokay',
    '<pre><code>\nimport Text.HTML.TagSoup\n\nmain :: IO ()\n</code></pre>\n<p>okay</p>\n'],
  ['<!-- foo -->*bar*\n*baz*', '*bar*\n<p><em>baz</em></p>\n'],
  ['- <div>\n- foo', '<ul>\n<li>\n<div>\n</li>\n<li>foo</li>\n</ul>\n'],
  ['Foo\n<div>\nbar\n</div>', '<p>Foo</p>\n<div>\nbar\n</div>\n'],
  ['Foo\n<a href="bar">\nbaz', '<p>Foo\n<a href="bar">\nbaz</p>\n'],
  ['  <!-- foo -->\n\n    <!-- foo -->', '  \n<pre><code>&lt;!-- foo --&gt;\n</code></pre>\n'],
  ['<details>\n<summary>Mais</summary>\n\nTexto *oculto*.\n\n</details>',
    '<details>\n<summary>Mais</summary>\n<p>Texto <em>oculto</em>.</p>\n</details>\n'],
], S);

runCases('bloco de HTML (escapado, padrão)', [
  ['<div>\n*oi*\n</div>', '<p class="raw-html">&lt;div&gt;\n*oi*\n&lt;/div&gt;</p>\n'],
  ['<!-- nota -->', '<p class="raw-html">&lt;!-- nota --&gt;</p>\n'],
  ['<?php\n\n  echo \'>\';\n\n?>\nokay', '<p class="raw-html">&lt;?php\n\n  echo \'&gt;\';\n\n?&gt;</p>\n<p>okay</p>\n'],
  ['<!DOCTYPE html>', '<p class="raw-html">&lt;!DOCTYPE html&gt;</p>\n'],
  ['<![CDATA[\nx < y\n]]>\nfim', '<p class="raw-html">&lt;![CDATA[\nx &lt; y\n]]&gt;</p>\n<p>fim</p>\n'],
]);

test('tipos de bloco de HTML reconhecidos na árvore', () => {
  const kinds = (src) => {
    const out = [];
    for (const n of parse(src).children()) out.push(n.type === 'html_block' ? `html${n.htmlBlockType}` : n.type);
    return out.join(',');
  };
  assert.equal(kinds('<script>\nx\n</script>\ndepois'), 'html1,paragraph');
  assert.equal(kinds('<style\n  type="text/css">\n\nfoo'), 'html1');
  assert.equal(kinds('<!-- a -->'), 'html2');
  assert.equal(kinds('<?x?>'), 'html3');
  assert.equal(kinds('<!X>'), 'html4');
  assert.equal(kinds('<![CDATA[x]]>'), 'html5');
  assert.equal(kinds('<section>\na\n\nb'), 'html6,paragraph');
  assert.equal(kinds('<custom-tag a="1">\nx\n\ny'), 'html7,paragraph');
  assert.equal(kinds('texto\n<custom-tag>\nmais'), 'paragraph');
  assert.equal(kinds('</script>'), 'paragraph');
});

runCases('definição de referência', [
  ['[foo]: /url "title"\n\n[foo]', '<p><a href="/url" title="title">foo</a></p>\n'],
  ['   [foo]: \n      /url  \n           \'the title\'  \n\n[foo]', '<p><a href="/url" title="the title">foo</a></p>\n'],
  ['[Foo*bar\\]]:my_(url) \'title (with parens)\'\n\n[Foo*bar\\]]',
    '<p><a href="my_(url)" title="title (with parens)">Foo*bar]</a></p>\n'],
  ['[Foo bar]:\n<my url>\n\'title\'\n\n[Foo bar]', '<p><a href="my%20url" title="title">Foo bar</a></p>\n'],
  ['[foo]: /url \'\ntitle\nline1\nline2\n\'\n\n[foo]', '<p><a href="/url" title="\ntitle\nline1\nline2\n">foo</a></p>\n'],
  ['[foo]: /url \'title\n\nwith blank line\'\n\n[foo]',
    '<p>[foo]: /url \'title</p>\n<p>with blank line\'</p>\n<p>[foo]</p>\n'],
  ['[foo]:\n/url\n\n[foo]', '<p><a href="/url">foo</a></p>\n'],
  ['[foo]:\n\n[foo]', '<p>[foo]:</p>\n<p>[foo]</p>\n'],
  ['[foo]: <>\n\n[foo]', '<p><a href="">foo</a></p>\n'],
  ['[foo]: <bar>(baz)\n\n[foo]', '<p>[foo]: &lt;bar&gt;(baz)</p>\n<p>[foo]</p>\n', S],
  ['[foo]: <bar>(baz)\n\n[foo]', '<p>[foo]: &lt;bar&gt;(baz)</p>\n<p>[foo]</p>\n'],
  ['[foo]: /url\\bar\\*baz "foo\\"bar\\baz"\n\n[foo]', '<p><a href="/url%5Cbar*baz" title="foo&quot;bar\\baz">foo</a></p>\n'],
  ['[foo]\n\n[foo]: url', '<p><a href="url">foo</a></p>\n'],
  ['[foo]\n\n[foo]: first\n[foo]: second', '<p><a href="first">foo</a></p>\n'],
  ['[FOO]: /url\n\n[Foo]', '<p><a href="/url">Foo</a></p>\n'],
  ['[\u0391\u0393\u03a9]: /\u03c6\u03bf\u03c5\n\n[\u03b1\u03b3\u03c9]', '<p><a href="/%CF%86%CE%BF%CF%85">\u03b1\u03b3\u03c9</a></p>\n'],
  ['[foo]: /url', ''],
  ['[\nfoo\n]: /url\nbar', '<p>bar</p>\n'],
  ['[foo]: /url "title" ok', '<p>[foo]: /url &quot;title&quot; ok</p>\n'],
  ['[foo]: /url\n"title" ok', '<p>&quot;title&quot; ok</p>\n'],
  ['    [foo]: /url "title"\n\n[foo]', '<pre><code>[foo]: /url &quot;title&quot;\n</code></pre>\n<p>[foo]</p>\n'],
  ['```\n[foo]: /url\n```\n\n[foo]', '<pre><code>[foo]: /url\n</code></pre>\n<p>[foo]</p>\n'],
  ['Foo\n[bar]: /baz\n\n[bar]', '<p>Foo\n[bar]: /baz</p>\n<p>[bar]</p>\n'],
  ['# [Foo]\n[foo]: /url\n> bar', '<h1><a href="/url">Foo</a></h1>\n<blockquote>\n<p>bar</p>\n</blockquote>\n'],
  ['[foo]: /url\nbar\n===\n[foo]', '<h1>bar</h1>\n<p><a href="/url">foo</a></p>\n'],
  ['[foo]: /url\n===\n[foo]', '<p>===\n<a href="/url">foo</a></p>\n'],
  ['[foo]: /url\n---', '<hr />\n'],
  ['[foo]: /foo-url "foo"\n[bar]: /bar-url\n  "bar"\n[baz]: /baz-url\n\n[foo],\n[bar],\n[baz]',
    '<p><a href="/foo-url" title="foo">foo</a>,\n<a href="/bar-url" title="bar">bar</a>,\n<a href="/baz-url">baz</a></p>\n'],
  ['[foo]\n\n> [foo]: /url', '<p><a href="/url">foo</a></p>\n<blockquote>\n</blockquote>\n'],
]);

runCases('parágrafos e linhas em branco', [
  ['aaa\n\nbbb', '<p>aaa</p>\n<p>bbb</p>\n'],
  ['aaa\nbbb\n\nccc\nddd', '<p>aaa\nbbb</p>\n<p>ccc\nddd</p>\n'],
  ['aaa\n\n\nbbb', '<p>aaa</p>\n<p>bbb</p>\n'],
  ['  aaa\n bbb', '<p>aaa\nbbb</p>\n'],
  ['aaa\n             bbb\n                                       ccc', '<p>aaa\nbbb\nccc</p>\n'],
  ['   aaa\nbbb', '<p>aaa\nbbb</p>\n'],
  ['    aaa\nbbb', '<pre><code>aaa\n</code></pre>\n<p>bbb</p>\n'],
  ['aaa     \nbbb     ', '<p>aaa<br />\nbbb</p>\n'],
  ['  \n\naaa\n  \n\n# aaa\n\n  ', '<p>aaa</p>\n<h1>aaa</h1>\n'],
  ['', ''],
  ['\n\n\n', ''],
  ['linha com fim CRLF\r\nsegunda\rterceira', '<p>linha com fim CRLF\nsegunda\nterceira</p>\n'],
  ['nulo \u0000 aqui', '<p>nulo \uFFFD aqui</p>\n'],
]);

runCases('citação', [
  ['> # Foo\n> bar\n> baz', '<blockquote>\n<h1>Foo</h1>\n<p>bar\nbaz</p>\n</blockquote>\n'],
  ['># Foo\n>bar\n> baz', '<blockquote>\n<h1>Foo</h1>\n<p>bar\nbaz</p>\n</blockquote>\n'],
  ['   > # Foo\n   > bar\n > baz', '<blockquote>\n<h1>Foo</h1>\n<p>bar\nbaz</p>\n</blockquote>\n'],
  ['    > # Foo\n    > bar\n    > baz', '<pre><code>&gt; # Foo\n&gt; bar\n&gt; baz\n</code></pre>\n'],
  ['> # Foo\n> bar\nbaz', '<blockquote>\n<h1>Foo</h1>\n<p>bar\nbaz</p>\n</blockquote>\n'],
  ['> bar\nbaz\n> foo', '<blockquote>\n<p>bar\nbaz\nfoo</p>\n</blockquote>\n'],
  ['> foo\n---', '<blockquote>\n<p>foo</p>\n</blockquote>\n<hr />\n'],
  ['> - foo\n- bar', '<blockquote>\n<ul>\n<li>foo</li>\n</ul>\n</blockquote>\n<ul>\n<li>bar</li>\n</ul>\n'],
  ['>     foo\n    bar', '<blockquote>\n<pre><code>foo\n</code></pre>\n</blockquote>\n<pre><code>bar\n</code></pre>\n'],
  ['> ```\nfoo\n```', '<blockquote>\n<pre><code></code></pre>\n</blockquote>\n<p>foo</p>\n<pre><code></code></pre>\n'],
  ['> foo\n    - bar', '<blockquote>\n<p>foo\n- bar</p>\n</blockquote>\n'],
  ['>', '<blockquote>\n</blockquote>\n'],
  ['>\n>  \n> ', '<blockquote>\n</blockquote>\n'],
  ['>\n> foo\n>  ', '<blockquote>\n<p>foo</p>\n</blockquote>\n'],
  ['> foo\n\n> bar', '<blockquote>\n<p>foo</p>\n</blockquote>\n<blockquote>\n<p>bar</p>\n</blockquote>\n'],
  ['> foo\n> bar', '<blockquote>\n<p>foo\nbar</p>\n</blockquote>\n'],
  ['> foo\n>\n> bar', '<blockquote>\n<p>foo</p>\n<p>bar</p>\n</blockquote>\n'],
  ['foo\n> bar', '<p>foo</p>\n<blockquote>\n<p>bar</p>\n</blockquote>\n'],
  ['> aaa\n***\n> bbb', '<blockquote>\n<p>aaa</p>\n</blockquote>\n<hr />\n<blockquote>\n<p>bbb</p>\n</blockquote>\n'],
  ['> bar\nbaz', '<blockquote>\n<p>bar\nbaz</p>\n</blockquote>\n'],
  ['> bar\n\nbaz', '<blockquote>\n<p>bar</p>\n</blockquote>\n<p>baz</p>\n'],
  ['> bar\n>\nbaz', '<blockquote>\n<p>bar</p>\n</blockquote>\n<p>baz</p>\n'],
  ['> > > foo\nbar', '<blockquote>\n<blockquote>\n<blockquote>\n<p>foo\nbar</p>\n</blockquote>\n</blockquote>\n</blockquote>\n'],
  ['>>> foo\n> bar\n>>baz', '<blockquote>\n<blockquote>\n<blockquote>\n<p>foo\nbar\nbaz</p>\n</blockquote>\n</blockquote>\n</blockquote>\n'],
  ['>     code\n\n>    not code', '<blockquote>\n<pre><code>code\n</code></pre>\n</blockquote>\n<blockquote>\n<p>not code</p>\n</blockquote>\n'],
]);

test('linhas de origem ficam registradas nos blocos', () => {
  const doc = parse('# T\n\npar\nágrafo\n\n- a\n- b\n\n```\nx\n```');
  const lines = [...doc.children()].map((n) => [n.type, n.startLine, n.endLine]);
  assert.deepEqual(lines, [
    ['heading', 1, 1],
    ['paragraph', 3, 4],
    ['list', 6, 7],
    ['code_block', 9, 11],
  ]);
});
