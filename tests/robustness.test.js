// Entradas patológicas precisam terminar rápido (sem explosão quadrática nem
// estouro de pilha), e o parser nunca pode lançar exceção.
import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml, parse, documentStats, documentTitle, countWords, slugify } from '../src/markdown.js';

function timed(label, src, limitMs = 1500) {
  test(`tempo: ${label}`, () => {
    const t0 = performance.now();
    const html = markdownToHtml(src, { html: 'sanitize', headingIds: true, sourceLines: true });
    const ms = performance.now() - t0;
    assert.equal(typeof html, 'string');
    assert.ok(ms < limitMs, `${label} levou ${ms.toFixed(0)} ms`);
  });
}

timed('50 mil colchetes abrindo', '['.repeat(50000));
timed('50 mil colchetes fechando', ']'.repeat(50000));
timed('links sem fim', '[a]('.repeat(20000));
timed('parênteses aninhados no destino', '[a](' + '('.repeat(30000) + ')'.repeat(30000) + ')');
timed('asteriscos alternados', '*a '.repeat(30000));
timed('sublinhados soltos', '_'.repeat(50000) + 'a');
timed('negrito sem fechamento', '**a'.repeat(20000));
timed('ênfase aninhada', '*'.repeat(20000) + 'a' + '*'.repeat(20000));
timed('crases de tamanhos crescentes', Array.from({ length: 300 }, (_, i) => 'a' + '`'.repeat(i + 1)).join(''));
timed('crases sem fechamento', '`a'.repeat(30000));
timed('comentários sem fim', '<!--'.repeat(20000));
timed('etiquetas sem fim', '<a '.repeat(20000));
timed('instruções sem fim', 'x <?'.repeat(20000));
timed('citações profundas', '> '.repeat(5000) + 'a');
timed('listas profundas', Array.from({ length: 1000 }, (_, i) => '  '.repeat(i) + '- a').join('\n'));
timed('espaços no meio do título', '# a' + ' '.repeat(50000) + 'b');
timed('espaços antes da quebra', 'a' + ' '.repeat(50000) + '\nb');
timed('barras invertidas', '\\'.repeat(50000));
timed('entidades quebradas', '&#'.repeat(20000));
timed('imagens abertas', '![['.repeat(10000));
timed('links automáticos', 'www.a.example '.repeat(10000));
timed('e-mails encadeados', 'a@'.repeat(20000) + 'b.example');
timed('parênteses no fim do link', 'www.a.example/' + ')'.repeat(20000));
timed('tabela grande', '| a | b |\n|---|---|\n' + '| 1 | 2 |\n'.repeat(20000));
timed('muitas definições', Array.from({ length: 5000 }, (_, i) => `[r${i}]: /u${i}`).join('\n') + '\n\n[r1] [r4999]');
timed('documento longo comum', '# Título\n\nUm parágrafo com **negrito**, `código` e [link](/x).\n\n- item\n- item\n\n'.repeat(3000), 3000);

test('saída nunca lança exceção com texto aleatório', () => {
  let seed = 42;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const alphabet = ' \t\n\\`*_~[]()!<>&#|-:=+.0123456789aZ"\'/@w;%';
  for (let n = 0; n < 3000; n++) {
    let s = '';
    const len = Math.floor(next() * 80);
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(next() * alphabet.length)];
    assert.doesNotThrow(() => markdownToHtml(s), s);
    assert.doesNotThrow(() => markdownToHtml(s, { gfm: false, html: 'sanitize' }), s);
  }
});

test('estatísticas e título do documento', () => {
  const src = '# Meu *Relatório*\n\nOlá, mundo! Guarda-chuva e d\'água contam como uma palavra cada.\n\n```\ncódigo aqui\n```';
  const stats = documentStats(src);
  assert.equal(stats.words, 14);
  assert.equal(stats.lines, 7);
  assert.equal(stats.chars, [...src].length);
  assert.equal(stats.minutes, 1);
  assert.equal(documentTitle(parse(src)), 'Meu Relatório');
  assert.equal(documentTitle(parse('texto sem título')), '');
  assert.equal(documentTitle(parse('## B\n\n# A')), 'A');
  assert.deepEqual(documentStats(''), { words: 0, chars: 0, lines: 0, minutes: 0 });
  assert.equal(countWords('um, dois; três... 4 5'), 5);
});

test('slugs no estilo do GitHub', () => {
  assert.equal(slugify('Olá, Mundo!'), 'olá-mundo');
  assert.equal(slugify('Como funciona?'), 'como-funciona');
  assert.equal(slugify('API v2.0 (beta)'), 'api-v20-beta');
  assert.equal(slugify('snake_case e kebab-case'), 'snake_case-e-kebab-case');
  const html = markdownToHtml('# Seção\n## Seção\n# Seção\n# Seção-1', { headingIds: true, idPrefix: 'md-' });
  assert.equal(html, '<h1 id="md-seção">Seção</h1>\n<h2 id="md-seção-1">Seção</h2>\n<h1 id="md-seção-2">Seção</h1>\n<h1 id="md-seção-1-1">Seção-1</h1>\n');
});

test('atributo data-line aponta a linha de origem (base 0)', () => {
  const html = markdownToHtml('# A\n\ntexto\n\n- x\n- y\n\n> q', { sourceLines: true });
  assert.equal(html, '<h1 data-line="0">A</h1>\n<p data-line="2">texto</p>\n<ul data-line="4">\n<li data-line="4">x</li>\n<li data-line="5">y</li>\n</ul>\n<blockquote data-line="7">\n<p data-line="7">q</p>\n</blockquote>\n');
});
