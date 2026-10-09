// Exportação para HTML completo e nomes de arquivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml, fileNameFor, MARKDOWN_CSS } from '../src/export.js';
import { markdownToHtml } from '../src/markdown.js';

test('HTML exportado é um documento completo e autocontido', () => {
  const body = markdownToHtml('# Relatório\n\nTexto com **negrito**.');
  const html = buildStandaloneHtml({ title: 'Relatório <final>', body });
  assert.ok(html.startsWith('<!doctype html>\n<html lang="pt-BR">'));
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<title>Relatório &lt;final&gt;<\/title>/);
  assert.match(html, /<article class="markdown-body page">\n<h1>Relatório<\/h1>\n<p>Texto com <strong>negrito<\/strong>.<\/p>\n<\/article>/);
  assert.ok(html.includes(MARKDOWN_CSS.trim()));
  // nada de recursos externos
  assert.ok(!/<link|<script|https?:\/\//.test(html));
});

test('título padrão quando o documento não tem título', () => {
  assert.match(buildStandaloneHtml({ title: '', body: '<p>x</p>' }), /<title>Documento<\/title>/);
});

test('CSS cobre os elementos gerados e tem tema escuro e impressão', () => {
  for (const sel of ['h1', 'blockquote', 'pre', 'code', 'table', 'th', 'td', 'li.task-list-item', 'hr', 'img', 'kbd', '.raw-html', 'del']) {
    assert.ok(MARKDOWN_CSS.includes(`.markdown-body ${sel}`), sel);
  }
  assert.match(MARKDOWN_CSS, /prefers-color-scheme: dark/);
  assert.match(MARKDOWN_CSS, /@media print/);
});

test('nomes de arquivo sem acento e sem caracteres estranhos', () => {
  assert.equal(fileNameFor('Relatório de Ação 2026', 'md'), 'relatorio-de-acao-2026.md');
  assert.equal(fileNameFor('  ***  ', 'html'), 'documento.html');
  assert.equal(fileNameFor('', 'md'), 'documento.md');
  assert.equal(fileNameFor('a/b\\c:d', 'md'), 'a-b-c-d.md');
  assert.equal(fileNameFor('x'.repeat(100), 'md'), 'x'.repeat(60) + '.md');
});
