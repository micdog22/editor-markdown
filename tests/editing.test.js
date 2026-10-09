// Operações puras do editor: marcações, prefixos de linha, listas, tabelas e tarefas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleInline, toggleLinePrefix, setHeading, indentLines, continueList, insertLink,
  insertCodeBlock, insertRule, buildTable, insertTable, formatTableAt, tableToMarkdown,
  toggleTaskAtLine, displayWidth,
} from '../src/editing.js';
import { markdownToHtml } from '../src/markdown.js';

// Helper: aplica a operação a um texto com a seleção marcada pelo primeiro [ e pelo último ].
function run(fn, marked, ...args) {
  const start = marked.indexOf('[');
  const close = marked.lastIndexOf(']');
  const end = close - 1;
  const text = marked.slice(0, start) + marked.slice(start + 1, close) + marked.slice(close + 1);
  const r = fn(text, start, end, ...args);
  if (r === null) return null;
  return r.text.slice(0, r.start) + '[' + r.text.slice(r.start, r.end) + ']' + r.text.slice(r.end);
}

test('negrito, itálico, tachado e código', () => {
  assert.equal(run(toggleInline, 'um [texto] aqui', '**'), 'um **[texto]** aqui');
  assert.equal(run(toggleInline, 'um **[texto]** aqui', '**'), 'um [texto] aqui');
  assert.equal(run(toggleInline, 'um [**texto**] aqui', '**'), 'um [texto] aqui');
  assert.equal(run(toggleInline, 'um []', '**'), 'um **[texto]**');
  assert.equal(run(toggleInline, 'um []', '*', 'ênfase'), 'um *[ênfase]*');
  assert.equal(run(toggleInline, 'x [ palavra ] y', '*'), 'x  *[palavra]*  y');
  assert.equal(run(toggleInline, '**[forte]**', '*'), '***[forte]***');
  assert.equal(run(toggleInline, '***[ambos]***', '*'), '**[ambos]**');
  assert.equal(run(toggleInline, '***[ambos]***', '**'), '*[ambos]*');
  assert.equal(run(toggleInline, '*[só itálico]*', '**'), '***[só itálico]***');
  assert.equal(run(toggleInline, 'a [b] c', '~~'), 'a ~~[b]~~ c');
  assert.equal(run(toggleInline, 'a ~~[b]~~ c', '~~'), 'a [b] c');
  assert.equal(run(toggleInline, 'use [npm]', '`'), 'use `[npm]`');
  assert.equal(run(toggleInline, 'use `[npm]`', '`'), 'use [npm]');
});

test('prefixos de linha: citação e listas', () => {
  assert.equal(run(toggleLinePrefix, '[a\nb]', 'quote'), '[> a\n> b]');
  assert.equal(run(toggleLinePrefix, '[> a\n> b]', 'quote'), '[a\nb]');
  assert.equal(run(toggleLinePrefix, '[a\n\nb]', 'bullet'), '[- a\n\n- b]');
  assert.equal(run(toggleLinePrefix, '[- a\n- b]', 'bullet'), '[a\nb]');
  assert.equal(run(toggleLinePrefix, '[a\nb\nc]', 'ordered'), '[1. a\n2. b\n3. c]');
  assert.equal(run(toggleLinePrefix, '[- a\n- b]', 'ordered'), '[1. a\n2. b]');
  assert.equal(run(toggleLinePrefix, '[1. a\n2. b]', 'task'), '[- [ ] a\n- [ ] b]');
  assert.equal(run(toggleLinePrefix, '[- [x] a\n- [ ] b]', 'task'), '[a\nb]');
  assert.equal(run(toggleLinePrefix, '[- [ ] a]', 'bullet'), '[- a]');
  assert.equal(run(toggleLinePrefix, 'antes\nlin[]ha\ndepois', 'bullet'), 'antes\n- lin[]ha\ndepois');
  assert.equal(run(toggleLinePrefix, '  [a]', 'bullet'), '[  - a]');
});

test('títulos', () => {
  assert.equal(run(setHeading, 'Tí[]tulo', 2), '## Tí[]tulo');
  assert.equal(run(setHeading, '## Tí[]tulo', 2), 'Tí[]tulo');
  assert.equal(run(setHeading, '## Tí[]tulo', 1), '# Tí[]tulo');
  assert.equal(run(setHeading, 'a\n[]b\nc', 3), 'a\n### []b\nc');
});

test('indentação com Tab e Shift+Tab', () => {
  assert.equal(run(indentLines, '- a\n- b[]', false), '- a\n  - b[]');
  assert.equal(run(indentLines, '1. a\n1. b[]', false), '1. a\n   1. b[]');
  assert.equal(run(indentLines, '- a\n  - b[]', true), '- a\n- b[]');
  assert.equal(run(indentLines, '[x\ny]', false), '[  x\n  y]');
  assert.equal(run(indentLines, '[  x\n  y]', true), '[x\ny]');
  assert.equal(run(indentLines, '\t[x]', true), '[x]');
});

test('Enter continua listas e citações', () => {
  const enter = (marked) => {
    const caret = marked.indexOf('|');
    const r = continueList(marked.replace('|', ''), caret);
    return r === null ? null : r.text.slice(0, r.start) + '|' + r.text.slice(r.start);
  };
  assert.equal(enter('- um|'), '- um\n- |');
  assert.equal(enter('* um|'), '* um\n* |');
  assert.equal(enter('9. nove|'), '9. nove\n10. |');
  assert.equal(enter('3) três|'), '3) três\n4) |');
  assert.equal(enter('  - aninhado|'), '  - aninhado\n  - |');
  assert.equal(enter('- [x] feito|'), '- [x] feito\n- [ ] |');
  assert.equal(enter('> citação|'), '> citação\n> |');
  assert.equal(enter('- a\n- |'), '- a\n|');
  assert.equal(enter('> |'), '|');
  assert.equal(enter('- meio|fim'), '- meio\n- |fim');
  assert.equal(enter('texto comum|'), null);
  assert.equal(enter('-| a'), null);
});

test('links e imagens', () => {
  assert.equal(run(insertLink, 'veja [isto]'), 'veja [isto]([https://])');
  assert.equal(run(insertLink, 'veja []'), 'veja [[texto do link]](https://)');
  assert.equal(run(insertLink, '[https://site.example]'), '[[texto]](https://site.example)');
  assert.equal(run(insertLink, '[]', true), '![[descrição]](https://)');
});

test('blocos de código e linha horizontal', () => {
  assert.equal(run(insertCodeBlock, 'texto\n[let a = 1;]\nmais', 'js'), 'texto\n\n```js\n[let a = 1;]\n```\n\nmais');
  assert.equal(run(insertCodeBlock, '[]'), '```\n[código]\n```\n');
  assert.equal(run(insertCodeBlock, '[a ``` b]'), '~~~\n[a ``` b]\n~~~\n');
  assert.equal(run(insertRule, 'a[]'), 'a\n\n---[]\n');
});

test('tabela: esqueleto, inserção e renderização', () => {
  assert.equal(buildTable(2, 3, 'center'), [
    '| Coluna 1 | Coluna 2 | Coluna 3 |',
    '| :------: | :------: | :------: |',
    '|          |          |          |',
    '|          |          |          |',
  ].join('\n'));
  const html = markdownToHtml(buildTable(1, 2));
  assert.match(html, /<th>Coluna 1<\/th>\n<th>Coluna 2<\/th>/);
  assert.match(html, /<td><\/td>\n<td><\/td>/);
  const r = insertTable('Intro', 5, 5, 1, 2);
  assert.ok(r.text.startsWith('Intro\n\n| Coluna 1 | Coluna 2 |\n'));
  assert.equal(r.text.slice(r.start, r.end), 'Coluna 1');
  assert.equal(buildTable(0, 1), '| Coluna 1 |\n| -------- |');
});

test('tabela: formatação alinha colunas e respeita alinhamentos', () => {
  const src = 'antes\n\n|a|b|c|\n|:-|:-:|-:|\n|longo texto|x|1|\n|y\n\ndepois';
  const caret = src.indexOf('|a|') + 1;
  const r = formatTableAt(src, caret);
  assert.equal(r.text, 'antes\n\n| a           |   b   |   c |\n| :---------- | :---: | --: |\n| longo texto |   x   |   1 |\n| y           |       |     |\n\ndepois');
  assert.equal(formatTableAt('sem tabela', 3), null);
  assert.equal(tableToMarkdown(['a|b'], [null], [['c']]), '| a\\|b |\n| ---- |\n| c    |');
  assert.equal(displayWidth('ação'), 4);
  assert.equal(displayWidth('a\u0301'), 1);
  assert.equal(displayWidth('\u6f22\u5b57'), 4);
});

test('marcar e desmarcar tarefas pela linha', () => {
  const src = '# Lista\n\n- [ ] um\n- [x] dois\n> - [ ] três\n1. [X] quatro';
  assert.equal(toggleTaskAtLine(src, 2).text, src.replace('- [ ] um', '- [x] um'));
  assert.equal(toggleTaskAtLine(src, 3).text, src.replace('- [x] dois', '- [ ] dois'));
  assert.equal(toggleTaskAtLine(src, 4).text, src.replace('> - [ ] três', '> - [x] três'));
  assert.equal(toggleTaskAtLine(src, 5).text, src.replace('1. [X] quatro', '1. [ ] quatro'));
  assert.equal(toggleTaskAtLine(src, 0), null);
  assert.equal(toggleTaskAtLine(src, 99), null);
});
