// Operações de edição usadas pela barra de ferramentas e pelos atalhos.
// Todas são puras: recebem o texto e a seleção (início e fim) e devolvem
// { text, start, end } com o texto novo e a seleção que deve ficar marcada.

import { splitTableRow, parseDelimiterRow } from './markdown.js';

function result(text, start, end = start) {
  return { text, start, end };
}

function lineStartOf(text, pos) {
  return text.lastIndexOf('\n', pos - 1) + 1;
}

function lineEndOf(text, pos) {
  const k = text.indexOf('\n', pos);
  return k === -1 ? text.length : k;
}

/** Faixa de linhas inteiras tocadas pela seleção. */
function lineRange(text, start, end) {
  const from = lineStartOf(text, start);
  let to = end;
  // seleção que termina logo no início de uma linha não inclui essa linha
  if (end > start && text[end - 1] === '\n') to = end - 1;
  return { from, to: lineEndOf(text, Math.max(to, from)) };
}

function countRun(text, pos, step, ch) {
  let n = 0;
  for (let i = step < 0 ? pos - 1 : pos; i >= 0 && i < text.length && text[i] === ch; i += step) n++;
  return n;
}

/**
 * Liga ou desliga uma marcação inline (**, *, ~~, `) em volta da seleção.
 * Sem seleção, insere um texto de exemplo já selecionado.
 */
export function toggleInline(text, start, end, marker, placeholder = 'texto') {
  const ch = marker[0];
  const k = marker.length;
  const run = Math.min(countRun(text, start, -1, ch), countRun(text, end, 1, ch));
  // em * e _ um marcador simples é ênfase e um duplo é negrito: *** tem os dois
  const present = ch === '*' || ch === '_' ? (k === 1 ? run % 2 === 1 : run >= 2) : run >= k;
  if (present) {
    const out = text.slice(0, start - k) + text.slice(start, end) + text.slice(end + k);
    return result(out, start - k, end - k);
  }
  const sel = text.slice(start, end);
  if (sel.length > 2 * k && sel.startsWith(marker) && sel.endsWith(marker)
    && (k === 2 || sel[k] !== ch) && (k === 2 || sel[sel.length - k - 1] !== ch)) {
    const inner = sel.slice(k, -k);
    return result(text.slice(0, start) + inner + text.slice(end), start, start + inner.length);
  }
  // espaços nas pontas ficam fora da marcação (senão a ênfase não é reconhecida)
  let a = 0;
  let b = sel.length;
  while (a < b && /\s/.test(sel[a])) a++;
  while (b > a && /\s/.test(sel[b - 1])) b--;
  const core = sel.slice(a, b) || placeholder;
  const out = text.slice(0, start) + sel.slice(0, a) + marker + core + marker + sel.slice(b) + text.slice(end);
  const s = start + a + k;
  return result(out, s, s + core.length);
}

const reListPrefix = /^(\s*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const reQuotePrefix = /^(\s*)>[ \t]?/;
const reHeadingPrefix = /^(\s{0,3})#{1,6}(?:[ \t]+|$)/;

/**
 * Aplica um prefixo de bloco a cada linha da seleção: "quote" (> ), "bullet" (- ),
 * "ordered" (1. 2. 3.) ou "task" (- [ ] ). Se todas as linhas já têm o prefixo,
 * ele é removido. Listas de outro tipo são convertidas.
 */
export function toggleLinePrefix(text, start, end, kind) {
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const has = (line) => {
    if (kind === 'quote') return reQuotePrefix.test(line);
    const m = reListPrefix.exec(line);
    if (!m) return false;
    const marker = m[0].trim();
    if (kind === 'task') return /\[[ xX]\]$/.test(marker);
    if (/\[[ xX]\]$/.test(marker)) return false;
    return kind === 'ordered' ? /^\d/.test(marker) : /^[-*+]/.test(marker);
  };
  const filled = lines.filter((l) => l.trim() !== '');
  const remove = filled.length > 0 && filled.every(has);
  let n = 0;
  const out = lines.map((line) => {
    if (line.trim() === '') return line;
    if (remove) return kind === 'quote' ? line.replace(reQuotePrefix, '$1') : line.replace(reListPrefix, '$1');
    if (kind === 'quote') return '> ' + line;
    const m = reListPrefix.exec(line);
    const indent = m ? m[1] : /^\s*/.exec(line)[0];
    const body = m ? line.slice(m[0].length) : line.slice(indent.length);
    n += 1;
    const marker = kind === 'ordered' ? `${n}. ` : kind === 'task' ? '- [ ] ' : '- ';
    return indent + marker + body;
  });
  const replaced = out.join('\n');
  const newText = text.slice(0, from) + replaced + text.slice(to);
  if (start === end && lines.length === 1) {
    // cursor sem seleção: mantém a posição relativa ao fim da linha
    const caret = Math.max(from, Math.min(from + replaced.length, start + replaced.length - (to - from)));
    return result(newText, caret);
  }
  return result(newText, from, from + replaced.length);
}

/** Define o nível de título da linha atual; repetir o mesmo nível remove o título. */
export function setHeading(text, start, end, level) {
  const from = lineStartOf(text, start);
  const to = lineEndOf(text, from);
  const line = text.slice(from, to);
  const m = reHeadingPrefix.exec(line);
  const current = m ? m[0].trim().length : 0;
  const body = m ? line.slice(m[0].length) : line.trimStart();
  const next = current === level ? body : '#'.repeat(level) + ' ' + body;
  const caretOffset = Math.max(0, start - from - (line.length - body.length));
  const caret = from + (next.length - body.length) + Math.min(caretOffset, body.length);
  return result(text.slice(0, from) + next + text.slice(to), caret);
}

/** Largura de indentação usada por Tab: a do marcador do item de lista mais próximo acima. */
function indentUnit(text, from) {
  let pos = from;
  while (pos > 0) {
    const prevStart = lineStartOf(text, pos - 1);
    const line = text.slice(prevStart, pos - 1);
    const m = /^(\s*)((?:[-*+]|\d{1,9}[.)])[ \t]+)/.exec(line);
    if (m) return m[2].length;
    if (line.trim() === '') break;
    pos = prevStart;
  }
  return 2;
}

/** Indenta (ou, com outdent = true, desindenta) as linhas tocadas pela seleção. */
export function indentLines(text, start, end, outdent = false) {
  const { from, to } = lineRange(text, start, end);
  const unit = indentUnit(text, from);
  const lines = text.slice(from, to).split('\n');
  let firstDelta = 0;
  let totalDelta = 0;
  const out = lines.map((line, i) => {
    let next;
    if (outdent) {
      if (line[0] === '\t') next = line.slice(1);
      else {
        let k = 0;
        while (k < unit && line[k] === ' ') k++;
        next = line.slice(k);
      }
    } else {
      next = line.trim() === '' && lines.length > 1 ? line : ' '.repeat(unit) + line;
    }
    const delta = next.length - line.length;
    if (i === 0) firstDelta = delta;
    totalDelta += delta;
    return next;
  });
  const newText = text.slice(0, from) + out.join('\n') + text.slice(to);
  const newStart = start === from && start !== end ? from : Math.max(from, start + firstDelta);
  if (start === end) return result(newText, newStart);
  return result(newText, newStart, end + totalDelta);
}

/**
 * Enter dentro de uma lista ou citação: cria o próximo item com o mesmo marcador
 * (número + 1 nas listas ordenadas, "[ ]" nas tarefas). Em um item vazio, o Enter
 * encerra a lista apagando o marcador. Devolve null quando o Enter deve ser o normal.
 */
export function continueList(text, caret) {
  const from = lineStartOf(text, caret);
  const to = lineEndOf(text, caret);
  const line = text.slice(from, to);
  const list = /^(\s*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/.exec(line);
  const quote = list ? null : /^(\s*(?:>[ \t]?)+)/.exec(line);
  const prefix = list ? list[0] : quote ? quote[0] : null;
  if (prefix === null || caret < from + prefix.length) return null;
  if (line.slice(prefix.length).trim() === '') {
    // item vazio: tira o marcador e encerra a lista
    return result(text.slice(0, from) + text.slice(to), from);
  }
  let next;
  if (quote) next = prefix;
  else {
    const marker = list[2] ?? `${parseInt(list[3], 10) + 1}${list[4]}`;
    next = list[1] + marker + list[5] + (list[6] ? '[ ] ' : '');
  }
  const insert = '\n' + next;
  return result(text.slice(0, caret) + insert + text.slice(caret), caret + insert.length);
}

/** Link: com seleção vira o texto do link; se a seleção já é uma URL, vira o destino. */
export function insertLink(text, start, end, image = false) {
  const sel = text.slice(start, end);
  const bang = image ? '!' : '';
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(sel)) {
    const label = image ? 'descrição' : 'texto';
    const out = text.slice(0, start) + `${bang}[${label}](${sel})` + text.slice(end);
    const s = start + bang.length + 1;
    return result(out, s, s + label.length);
  }
  const label = sel || (image ? 'descrição' : 'texto do link');
  const url = 'https://';
  const out = text.slice(0, start) + `${bang}[${label}](${url})` + text.slice(end);
  if (sel) {
    const s = start + bang.length + label.length + 3;
    return result(out, s, s + url.length);
  }
  const s = start + bang.length + 1;
  return result(out, s, s + label.length);
}

/** Garante que um bloco novo fique separado do texto vizinho por linhas em branco. */
function insertBlock(text, start, end, block, selectFrom = 0, selectLength = 0) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  let lead = '';
  if (before !== '' && !before.endsWith('\n\n')) lead = before.endsWith('\n') ? '\n' : '\n\n';
  let trail = '';
  if (after === '') trail = '\n';
  else if (!after.startsWith('\n\n')) trail = after.startsWith('\n') ? '\n' : '\n\n';
  const out = before + lead + block + trail + after;
  const s = start + lead.length + selectFrom;
  return result(out, s, s + selectLength);
}

/** Envolve a seleção em um bloco de código cercado. */
export function insertCodeBlock(text, start, end, lang = '') {
  const sel = text.slice(start, end);
  const body = sel.replace(/\n$/, '') || 'código';
  const fence = /```/.test(body) ? '~~~' : '```';
  const block = `${fence}${lang}\n${body}\n${fence}`;
  return insertBlock(text, start, end, block, fence.length + lang.length + 1, body.length);
}

/** Insere uma linha horizontal. */
export function insertRule(text, start, end) {
  const r = insertBlock(text, start, end, '---');
  return result(r.text, r.start + 3);
}

// --------------------------------------------------------------------------
// Tabelas
// --------------------------------------------------------------------------

const reWide = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u;

/** Largura visual aproximada (CJK e emoji ocupam duas colunas, marcas combinantes nenhuma). */
export function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    if (/\p{M}/u.test(ch)) continue;
    w += reWide.test(ch) ? 2 : 1;
  }
  return w;
}

function pad(cell, width, align) {
  const gap = width - displayWidth(cell);
  if (gap <= 0) return cell;
  if (align === 'right') return ' '.repeat(gap) + cell;
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + cell + ' '.repeat(gap - left);
  }
  return cell + ' '.repeat(gap);
}

function delimiterCell(width, align) {
  if (align === 'center') return ':' + '-'.repeat(Math.max(1, width - 2)) + ':';
  if (align === 'left') return ':' + '-'.repeat(Math.max(1, width - 1));
  if (align === 'right') return '-'.repeat(Math.max(1, width - 1)) + ':';
  return '-'.repeat(Math.max(3, width));
}

/** Monta o texto de uma tabela alinhada a partir de cabeçalho, alinhamentos e linhas. */
export function tableToMarkdown(header, aligns, rows) {
  const cols = header.length;
  const esc = (c) => c.replace(/\|/g, '\\|');
  const head = header.map(esc);
  const body = rows.map((r) => Array.from({ length: cols }, (_, i) => esc(r[i] ?? '')));
  const widths = head.map((h, i) => {
    const min = aligns[i] === 'center' ? 5 : 3;
    return Math.max(min, displayWidth(h), ...body.map((r) => displayWidth(r[i])));
  });
  const line = (cells) => '| ' + cells.join(' | ') + ' |';
  const out = [
    line(head.map((h, i) => pad(h, widths[i], aligns[i]))),
    line(widths.map((w, i) => delimiterCell(w, aligns[i]))),
    ...body.map((r) => line(r.map((c, i) => pad(c, widths[i], aligns[i])))),
  ];
  return out.join('\n');
}

/** Esqueleto de tabela com cols colunas e rows linhas de dados. */
export function buildTable(rows, cols, align = null) {
  const c = Math.max(1, Math.min(20, cols | 0));
  const r = Math.max(0, Math.min(100, rows | 0));
  const header = Array.from({ length: c }, (_, i) => `Coluna ${i + 1}`);
  const aligns = header.map(() => align);
  const body = Array.from({ length: r }, () => header.map(() => ''));
  return tableToMarkdown(header, aligns, body);
}

/** Insere uma tabela nova na posição do cursor. */
export function insertTable(text, start, end, rows, cols, align = null) {
  const table = buildTable(rows, cols, align);
  return insertBlock(text, start, end, table, 2, 'Coluna 1'.length);
}

/**
 * Reformata a tabela em que o cursor está: alinha as barras, completa células
 * que faltam e respeita os alinhamentos da linha delimitadora.
 */
export function formatTableAt(text, caret) {
  const isRow = (l) => l.includes('|');
  let from = lineStartOf(text, caret);
  if (!isRow(text.slice(from, lineEndOf(text, from)))) return null;
  while (from > 0) {
    const prev = lineStartOf(text, from - 1);
    if (!isRow(text.slice(prev, from - 1))) break;
    from = prev;
  }
  let to = lineEndOf(text, caret);
  while (to < text.length) {
    const nextEnd = lineEndOf(text, to + 1);
    if (!isRow(text.slice(to + 1, nextEnd))) break;
    to = nextEnd;
  }
  const lines = text.slice(from, to).split('\n');
  const indent = /^\s*/.exec(lines[0])[0];
  if (lines.length < 2) return null;
  const aligns = parseDelimiterRow(lines[1]);
  if (!aligns) return null;
  const header = splitTableRow(lines[0]);
  const cols = Math.max(header.length, aligns.length);
  while (header.length < cols) header.push('');
  while (aligns.length < cols) aligns.push(null);
  const rows = lines.slice(2).map((l) => splitTableRow(l).slice(0, cols));
  const formatted = tableToMarkdown(header, aligns, rows).split('\n').map((l) => indent + l).join('\n');
  const newText = text.slice(0, from) + formatted + text.slice(to);
  const lineIndex = text.slice(from, caret).split('\n').length - 1;
  const fLines = formatted.split('\n');
  let caretPos = from;
  for (let i = 0; i < lineIndex; i++) caretPos += fLines[i].length + 1;
  return result(newText, caretPos + Math.min(2 + indent.length, fLines[lineIndex].length));
}

// --------------------------------------------------------------------------
// Tarefas
// --------------------------------------------------------------------------

const reTaskLine = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\]/;

/** Marca ou desmarca a tarefa da linha indicada (base 0). Devolve null se não houver tarefa. */
export function toggleTaskAtLine(text, lineIndex) {
  let from = 0;
  for (let i = 0; i < lineIndex; i++) {
    const k = text.indexOf('\n', from);
    if (k === -1) return null;
    from = k + 1;
  }
  const to = lineEndOf(text, from);
  const line = text.slice(from, to);
  const m = reTaskLine.exec(line);
  if (!m) return null;
  const mark = m[2] === ' ' ? 'x' : ' ';
  const pos = from + m[1].length + 1;
  return result(text.slice(0, pos) + mark + text.slice(pos + 1), pos + 1);
}
