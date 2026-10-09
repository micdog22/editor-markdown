// Tentativas de XSS: nada que execute código pode sair do renderizador,
// nem no modo padrão (HTML escapado) nem no modo de subconjunto seguro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../src/markdown.js';
import { isSafeUrl, sanitizeHtml } from '../src/sanitize.js';
import { decodeEntities } from '../src/entities.js';

const ESC = {};
const SAN = { html: 'sanitize' };

// Todas as etiquetas que podem aparecer na saída e seus atributos permitidos.
const OUTPUT_TAGS = {
  a: ['href', 'title', 'lang', 'dir'], abbr: [], b: [], bdi: [], bdo: [], blockquote: [], br: [], caption: [],
  cite: [], code: ['class'], dd: [], del: [], details: ['open'], dfn: [], div: ['align'], dl: [], dt: [], em: [],
  figcaption: [], figure: [], h1: ['id', 'align'], h2: ['id', 'align'], h3: ['id', 'align'], h4: ['id', 'align'],
  h5: ['id', 'align'], h6: ['id', 'align'], hr: [], i: [], img: ['src', 'alt', 'title', 'width', 'height', 'align'],
  input: ['type', 'checked', 'disabled'], ins: [], kbd: [], li: ['class'], mark: [], ol: ['start', 'type'],
  p: ['align', 'class'], pre: [], q: [], rp: [], rt: [], ruby: [], s: [], samp: [], small: [], span: [],
  strike: [], strong: [], sub: [], summary: [], sup: [], table: [], tbody: [], td: ['align', 'colspan', 'rowspan'],
  tfoot: [], th: ['align', 'colspan', 'rowspan'], thead: [], time: ['datetime'], tr: [], tt: [], u: [], ul: [],
  var: [], wbr: [],
};
const COMMON_ATTRS = ['title', 'lang', 'dir', 'data-line'];

/** Verifica que cada "<" da saída abre uma etiqueta conhecida com atributos conhecidos e URLs seguras. */
function assertSafeHtml(html) {
  let i = 0;
  while ((i = html.indexOf('<', i)) !== -1) {
    const m = /^<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z-]+(?:="[^"<>]*")?)*)\s*\/?>/.exec(html.slice(i));
    assert.ok(m, `"<" solto ou etiqueta malformada perto de: ${html.slice(i, i + 60)}`);
    const [, closing, name, attrs] = m;
    assert.ok(Object.hasOwn(OUTPUT_TAGS, name), `etiqueta inesperada: ${name}`);
    if (!closing) {
      const re = /\s+([a-z-]+)(?:="([^"]*)")?/g;
      let a;
      while ((a = re.exec(attrs)) !== null) {
        const attr = a[1];
        assert.ok(OUTPUT_TAGS[name].includes(attr) || COMMON_ATTRS.includes(attr), `atributo inesperado: ${name} ${attr}`);
        assert.ok(!/^on/i.test(attr), `atributo de evento: ${attr}`);
        if (attr === 'href' || attr === 'src') {
          const value = decodeEntities(a[2] ?? '');
          assert.ok(isSafeUrl(value, attr === 'src' ? 'image' : 'link'), `URL insegura: ${value}`);
        }
      }
    }
    i += m[0].length;
  }
}

const vectors = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[x](javascript:alert(1))',
  '[x](JaVaScRiPt:alert(1))',
  '[x](javascript&#58;alert(1))',
  '[x](&#106;avascript:alert(1))',
  '[x](<java\tscript:alert(1)>)',
  '[x](java%0ascript:alert(1))',
  '[x](vbscript:msgbox(1))',
  '[x](data:text/html;base64,PHNjcmlwdD4=)',
  '[x](file:///etc/passwd)',
  '![x](javascript:alert(1))',
  '![x](data:image/svg+xml;base64,PHN2Zz4=)',
  '<javascript:alert(1)>',
  '[x]: javascript:alert(1)\n\n[x]',
  '[x](/ok "a\\" onmouseover=\\"alert(1)")',
  '```"><script>alert(1)</script>\ncode\n```',
  '# "><img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<svg onload=alert(1)>',
  '<style>body{display:none}</style>',
  '<div style="position:fixed" onclick="alert(1)" align="center">x</div>',
  '<details open ontoggle=alert(1)><summary>s</summary></details>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<object data="x"></object><embed src="x">',
  '<form action="https://evil.example"><input name=senha></form>',
  '<scr<script>ipt>alert(1)</script>',
  '<a href="x" title=\'"><script>alert(1)</script>\'>t</a>',
  '<IMG SRC="jav&#x0A;ascript:alert(\'XSS\');">',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<base href="https://evil.example/">',
  '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  '<link rel=stylesheet href=x>',
  '<!-- <script>alert(1)</script> -->',
  '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
  'texto <b onmouseover="alert(1)">negrito</b>',
  '<a href="&#x6A;avascript&colon;alert(1)">x</a>',
  '[x](javascript&colon;alert(1))',
  '<textarea><script>alert(1)</script></textarea>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
];

for (const [label, opts] of [['escapado', ESC], ['subconjunto seguro', SAN]]) {
  vectors.forEach((src, k) => {
    test(`XSS (${label}) ${k + 1}: ${JSON.stringify(src).slice(0, 50)}`, () => {
      const html = markdownToHtml(src, { ...opts, headingIds: true });
      assertSafeHtml(html);
      assert.ok(!/<script/i.test(html));
    });
  });
}

test('links perigosos perdem o href, mas o texto continua', () => {
  assert.equal(markdownToHtml('[x](javascript:alert(1))'), '<p><a>x</a></p>\n');
  assert.equal(markdownToHtml('[x](&#106;avascript:alert(1))'), '<p><a>x</a></p>\n');
  assert.equal(markdownToHtml('[x](java%0ascript:alert(1))'), '<p><a>x</a></p>\n');
  assert.equal(markdownToHtml('![x](javascript:alert(1))'), '<p><img src="" alt="x" /></p>\n');
  assert.equal(markdownToHtml('<javascript:alert(1)>'), '<p><a>javascript:alert(1)</a></p>\n');
  assert.equal(markdownToHtml('[x]: javascript:alert(1)\n\n[x]'), '<p><a>x</a></p>\n');
});

test('links seguros continuam funcionando', () => {
  assert.equal(markdownToHtml('[a](https://ok.example/x?y=1)'), '<p><a href="https://ok.example/x?y=1">a</a></p>\n');
  assert.equal(markdownToHtml('[a](mailto:fulano@site.example)'), '<p><a href="mailto:fulano@site.example">a</a></p>\n');
  assert.equal(markdownToHtml('[a](tel:+5511900000000)'), '<p><a href="tel:+5511900000000">a</a></p>\n');
  assert.equal(markdownToHtml('[a](#secao)'), '<p><a href="#secao">a</a></p>\n');
  assert.equal(markdownToHtml('[a](../docs/a.md)'), '<p><a href="../docs/a.md">a</a></p>\n');
  assert.equal(markdownToHtml('[a](//cdn.example/x)'), '<p><a href="//cdn.example/x">a</a></p>\n');
});

test('título e info string são escapados em atributos', () => {
  assert.equal(markdownToHtml('[x](/ok "a\\" onmouseover=\\"alert(1)")'),
    '<p><a href="/ok" title="a&quot; onmouseover=&quot;alert(1)">x</a></p>\n');
  assert.equal(markdownToHtml('```"><b>\nx\n```'), '<pre><code class="language-&quot;&gt;&lt;b&gt;">x\n</code></pre>\n');
});

test('ids de títulos não carregam pontuação', () => {
  assert.equal(markdownToHtml('# "><img src=x onerror=alert(1)>', { headingIds: true }),
    '<h1 id="img-srcx-onerroralert1">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</h1>\n');
});

test('sanitizeHtml: lista de permissões', () => {
  assert.equal(sanitizeHtml('<b>oi</b>'), '<b>oi</b>');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>'), '<img src="x" />');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(sanitizeHtml('<a href="https://ok.example" target="_blank" style="color:red">x</a>'),
    '<a href="https://ok.example">x</a>');
  assert.equal(sanitizeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(sanitizeHtml('<div style="x" onclick="y" align="center">t</div>'), '<div align="center">t</div>');
  assert.equal(sanitizeHtml('<details open ontoggle=alert(1)>'), '<details open>');
  assert.equal(sanitizeHtml('<p align="center" class="x" id="y">'), '<p align="center">');
  assert.equal(sanitizeHtml('<img src=x width="100" height="abc">'), '<img src="x" width="100" />');
  assert.equal(sanitizeHtml('<ol start="3" type="a">'), '<ol start="3" type="a">');
  assert.equal(sanitizeHtml('a <!-- comentário --> b'), 'a  b');
  assert.equal(sanitizeHtml('<!-- sem fim'), '&lt;!-- sem fim');
  assert.equal(sanitizeHtml('&copy; & &nbsp; &bogus; 1 < 2 > 0'), '&copy; &amp; &nbsp; &bogus; 1 &lt; 2 &gt; 0');
  assert.equal(sanitizeHtml('<a title=\'"><script>\'>t</a>'), '<a title="&quot;&gt;&lt;script&gt;">t</a>');
  assert.equal(sanitizeHtml('<IMG SRC="jav&#x0A;ascript:alert(1)">'), '<img />');
  assert.equal(sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="ok">'), '<img src="data:image/png;base64,AAAA" alt="ok" />');
  assert.equal(sanitizeHtml('<img src="data:image/svg+xml,x">'), '<img />');
  assert.equal(sanitizeHtml('<br/><hr><wbr>'), '<br /><hr /><wbr />');
  assert.equal(sanitizeHtml('</br></img>'), '&lt;/br&gt;&lt;/img&gt;');
  assert.equal(sanitizeHtml('<a href="x" href="javascript:alert(1)">d</a>'), '<a href="x">d</a>');
  assert.equal(sanitizeHtml('<?php echo 1; ?>'), '&lt;?php echo 1; ?&gt;');
});

test('isSafeUrl', () => {
  const ok = ['https://a.example', 'http://a.example', 'mailto:a@b.example', 'tel:123', '/x', 'x.html', '#t',
    '?q=1', '//cdn.example/a', 'HTTPS://A.EXAMPLE', 'a/b:c'];
  const bad = ['javascript:alert(1)', 'JAVASCRIPT:x', ' javascript:x', 'java\tscript:x', 'java\nscript:x',
    'jav\u0000ascript:x', 'vbscript:x', 'data:text/html,x', 'file:///etc/passwd', 'javascript%3Aalert(1)',
    'java%09script:alert(1)', 'blob:https://a.example/x', 'about:blank'];
  for (const u of ok) assert.ok(isSafeUrl(u), u);
  for (const u of bad) assert.ok(!isSafeUrl(u), u);
  assert.ok(isSafeUrl('data:image/png;base64,AAAA', 'image'));
  assert.ok(isSafeUrl('data:image/webp;base64,AAAA', 'image'));
  assert.ok(!isSafeUrl('data:image/png;base64,AAAA', 'link'));
  assert.ok(!isSafeUrl('data:image/svg+xml,<svg/>', 'image'));
});

// Gerador pseudoaleatório com semente fixa (mulberry32), para testes reproduzíveis.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('fuzz: documentos aleatórios com pedaços perigosos sempre geram HTML seguro', () => {
  const pieces = [...vectors, '*', '_', '~~', '[', ']', '(', ')', '<', '>', '&', '&amp;', '\\', '`', '```', '\n',
    '\n\n', '- ', '1. ', '> ', '# ', '| a | b |\n|---|---|\n', '    ', '\t', '"', "'", 'www.ex.example', 'a@b.example',
    'texto', 'ação', ':', 'javascript:', '<a ', 'href=', '<img ', 'onerror=', '![', '](', ' "t")', '<div>', '</div>',
    '<!--', '-->', '&#', '&#x', ';', '</', '/>', 'data:', 'src='];
  const next = rng(20261009);
  for (let n = 0; n < 1500; n++) {
    let src = '';
    const len = 1 + Math.floor(next() * 25);
    for (let k = 0; k < len; k++) src += pieces[Math.floor(next() * pieces.length)];
    for (const opts of [ESC, SAN]) {
      const html = markdownToHtml(src, { ...opts, headingIds: true, sourceLines: true });
      assertSafeHtml(html);
    }
  }
});
