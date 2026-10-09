// Parser de Markdown escrito do zero: CommonMark com as extensões do GFM
// (tabelas, listas de tarefas, tachado e links automáticos estendidos).
//
// O trabalho é feito em duas fases, como descreve a especificação:
//   1. Blocos: cada linha é comparada com os contêineres abertos (citação, lista,
//      item). O que sobra da linha pode abrir blocos novos ou virar texto de um
//      bloco folha (parágrafo, código, título). O resultado é uma árvore de blocos.
//   2. Inlines: o texto de parágrafos, títulos e células é lido da esquerda para a
//      direita com duas pilhas: uma de delimitadores (* _ ~) para ênfase e tachado
//      e outra de colchetes para links e imagens.
// Por fim a árvore vira HTML. O HTML bruto do texto é escapado por padrão ou passa
// por uma lista de permissões; URLs perigosas (javascript: e afins) nunca saem.

import { decodeEntity } from './entities.js';
import { escapeHtml, isSafeUrl, sanitizeHtml } from './sanitize.js';

// ---------------------------------------------------------------------------
// Árvore
// ---------------------------------------------------------------------------

const CONTAINERS = new Set([
  'document', 'block_quote', 'list', 'item', 'paragraph', 'heading', 'emph', 'strong', 'del',
  'link', 'image', 'table', 'table_head', 'table_body', 'table_row', 'table_cell',
]);

export class Node {
  constructor(type, startLine = 0) {
    this.type = type;
    this.parent = null;
    this.firstChild = null;
    this.lastChild = null;
    this.prev = null;
    this.next = null;
    this.startLine = startLine;
    this.endLine = startLine;
    this.open = true;
    this.content = '';
    this.literal = null;
    this.lastLineBlank = false;
  }

  get isContainer() {
    return CONTAINERS.has(this.type);
  }

  appendChild(child) {
    child.unlink();
    child.parent = this;
    if (this.lastChild) {
      this.lastChild.next = child;
      child.prev = this.lastChild;
      this.lastChild = child;
    } else {
      this.firstChild = child;
      this.lastChild = child;
    }
  }

  insertAfter(sibling) {
    sibling.unlink();
    sibling.next = this.next;
    if (sibling.next) sibling.next.prev = sibling;
    sibling.prev = this;
    this.next = sibling;
    sibling.parent = this.parent;
    if (!sibling.next && sibling.parent) sibling.parent.lastChild = sibling;
  }

  unlink() {
    if (this.prev) this.prev.next = this.next;
    else if (this.parent) this.parent.firstChild = this.next;
    if (this.next) this.next.prev = this.prev;
    else if (this.parent) this.parent.lastChild = this.prev;
    this.parent = null;
    this.next = null;
    this.prev = null;
  }

  *children() {
    for (let c = this.firstChild; c; c = c.next) yield c;
  }
}

/** Percorre a árvore sem recursão, emitindo eventos de entrada e saída. */
export class Walker {
  constructor(root) {
    this.root = root;
    this.current = root;
    this.entering = true;
  }

  next() {
    const cur = this.current;
    const entering = this.entering;
    if (cur === null) return null;
    if (entering && cur.isContainer) {
      if (cur.firstChild) {
        this.current = cur.firstChild;
        this.entering = true;
      } else {
        this.entering = false;
      }
    } else if (cur === this.root) {
      this.current = null;
    } else if (cur.next === null) {
      this.current = cur.parent;
      this.entering = false;
    } else {
      this.current = cur.next;
      this.entering = true;
    }
    return { node: cur, entering };
  }

  /** Continua a partir de um nó (usado para pular os filhos de uma imagem). */
  resumeAt(node, entering) {
    this.current = node;
    this.entering = entering;
  }
}

function textNode(s) {
  const node = new Node('text');
  node.literal = s;
  return node;
}

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

const reEscapable = /^[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]$/;
const reUnescape = /\\[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]|&(?:#[xX][a-fA-F0-9]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g;
const reUnicodeWhitespace = /[\p{Zs}\t\n\f\r]/u;
const rePunctuation = /[\p{P}\p{S}]/u;
const reNonSpace = /[^ \t\f\v\r\n]/;

function isWs(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

function isSpaceOrTab(c) {
  return c === ' ' || c === '\t';
}

/** Remove espaços, tabulações e quebras das pontas (sem regex, para ser linear). */
export function trimWs(s) {
  let a = 0;
  let b = s.length;
  while (a < b && isWs(s[a])) a++;
  while (b > a && isWs(s[b - 1])) b--;
  return s.slice(a, b);
}

function isBlank(s) {
  return !reNonSpace.test(s);
}

/** Aplica escapes com barra invertida e entidades (usado em URLs, títulos e info strings). */
export function unescapeString(s) {
  if (s.indexOf('\\') === -1 && s.indexOf('&') === -1) return s;
  return s.replace(reUnescape, (m) => {
    if (m[0] === '\\') return m[1];
    const decoded = decodeEntity(m.slice(1, -1));
    return decoded === null ? m : decoded;
  });
}

const reUrlSafe = /[A-Za-z0-9;/?:@&=+$,\-_.!~*'()#]/;
const reHex2 = /^[0-9a-fA-F]{2}$/;

/** Codifica uma URL com %XX, preservando sequências %XX que já existem. */
export function normalizeUri(uri) {
  let out = '';
  for (let i = 0; i < uri.length; i++) {
    const ch = uri[i];
    if (ch === '%' && reHex2.test(uri.slice(i + 1, i + 3))) {
      out += uri.slice(i, i + 3);
      i += 2;
      continue;
    }
    if (reUrlSafe.test(ch)) {
      out += ch;
      continue;
    }
    const code = uri.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < uri.length) {
      const low = uri.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += encodeURIComponent(ch + uri[i + 1]);
        i += 1;
        continue;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      out += '%EF%BF%BD';
      continue;
    }
    out += encodeURIComponent(ch);
  }
  return out;
}

/** Normaliza o rótulo de uma referência: tira colchetes, junta espaços e ignora caixa. */
export function normalizeReference(label) {
  return trimWs(label.slice(1, -1)).replace(/[ \t\r\n]+/g, ' ').toLowerCase().toUpperCase();
}

// ---------------------------------------------------------------------------
// HTML bruto: expressões das etiquetas (seção "Raw HTML" da especificação)
// ---------------------------------------------------------------------------

const TAGNAME = '[A-Za-z][A-Za-z0-9-]*';
const ATTRIBUTENAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const ATTRIBUTEVALUE = '(?:[^"\'=<>`\\x00-\\x20]+|\'[^\']*\'|"[^"]*")';
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`;
const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`;
const CLOSETAG = `</${TAGNAME}\\s*>`;

const reOpenOrCloseTag = new RegExp(`${OPENTAG}|${CLOSETAG}`, 'y');

const BLOCK_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

const reHtmlBlockOpen = [
  null,
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  new RegExp(`^</?(?:${BLOCK_TAGS})(?:\\s|/?>|$)`, 'i'),
  new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`),
];

const reHtmlBlockClose = [
  null,
  /<\/(?:script|pre|textarea|style)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
];

const reRawTextTag = /^<\/?(?:script|style|pre|textarea)(?:[\s/>]|$)/i;

// ---------------------------------------------------------------------------
// Fase 1: blocos
// ---------------------------------------------------------------------------

const CODE_INDENT = 4;
const reMaybeSpecial = /^[#`~*+_=<>0-9|:-]/;
const reBulletListMarker = /^[*+-]/;
const reOrderedListMarker = /^(\d{1,9})([.)])/;
const reATXHeadingMarker = /^#{1,6}(?:[ \t]+|$)/;
const reCodeFence = /^`{3,}(?!.*`)|^~{3,}/;
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/;
const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const reTaskMarker = /^\[([ \txX])\](?=[ \t\n]|$)[ \t]?/;

/** Remove a sequência final de # de um título ATX, quando ela é válida. */
function stripClosingHashes(s) {
  let end = s.length;
  while (end > 0 && isSpaceOrTab(s[end - 1])) end--;
  let k = end;
  while (k > 0 && s[k - 1] === '#') k--;
  if (k === end) return s.slice(0, end);
  let j = k;
  while (j > 0 && isSpaceOrTab(s[j - 1])) j--;
  if (j === 0) return '';
  if (j < k) return s.slice(0, j);
  return s.slice(0, end);
}

/** Divide uma linha de tabela em células; \| vira uma barra literal dentro da célula. */
export function splitTableRow(line) {
  let s = trimWs(line);
  if (s[0] === '|') s = s.slice(1);
  if (s.length > 0 && s[s.length - 1] === '|') {
    let backslashes = 0;
    for (let i = s.length - 2; i >= 0 && s[i] === '\\'; i--) backslashes++;
    if (backslashes % 2 === 0) s = s.slice(0, -1);
  }
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i += 1;
    } else if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i += 1;
    } else if (ch === '|') {
      cells.push(trimWs(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(trimWs(cur));
  return cells;
}

/** Lê a linha delimitadora de uma tabela e devolve os alinhamentos, ou null. */
export function parseDelimiterRow(line) {
  const s = trimWs(line);
  if (s.indexOf('-') === -1) return null;
  if (!/^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/.test(s)) return null;
  return splitTableRow(s).map((cell) => {
    const left = cell[0] === ':';
    const right = cell[cell.length - 1] === ':';
    if (left && right) return 'center';
    if (left) return 'left';
    if (right) return 'right';
    return null;
  });
}

function endsWithBlankLine(node) {
  for (let cur = node; cur; ) {
    if (cur.lastLineBlank) return true;
    if (cur.type === 'list' || cur.type === 'item') cur = cur.lastChild;
    else break;
  }
  return false;
}

function listsMatch(a, b) {
  return a.type === b.type && a.delimiter === b.delimiter && a.bulletChar === b.bulletChar;
}

// Comportamento de cada tipo de bloco:
//   cont: 0 = a linha continua o bloco, 1 = não continua, 2 = linha consumida (fim de cerca)
const BLOCKS = {
  document: {
    cont: () => 0,
    finalize() {},
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  list: {
    cont: () => 0,
    finalize(p, block) {
      block.tight = true;
      outer: for (let item = block.firstChild; item; item = item.next) {
        if (item.lastLineBlank && item.next) {
          block.tight = false;
          break;
        }
        for (let sub = item.firstChild; sub; sub = sub.next) {
          if ((item.next || sub.next) && endsWithBlankLine(sub)) {
            block.tight = false;
            break outer;
          }
        }
      }
      block.endLine = block.lastChild ? block.lastChild.endLine : block.startLine;
    },
    canContain: (t) => t === 'item',
    acceptsLines: false,
  },
  block_quote: {
    cont(p) {
      const ln = p.currentLine;
      if (!p.indented && ln[p.nextNonspace] === '>') {
        p.advanceNextNonspace();
        p.advanceOffset(1, false);
        if (isSpaceOrTab(ln[p.offset])) p.advanceOffset(1, true);
        return 0;
      }
      return 1;
    },
    finalize() {},
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  item: {
    cont(p, container) {
      if (p.blank) {
        if (container.firstChild === null) return 1;
        p.advanceNextNonspace();
      } else if (p.indent >= container.listData.markerOffset + container.listData.padding) {
        p.advanceOffset(container.listData.markerOffset + container.listData.padding, true);
      } else {
        return 1;
      }
      return 0;
    },
    finalize(p, block) {
      block.endLine = block.lastChild ? block.lastChild.endLine : block.startLine;
      const first = block.firstChild;
      if (p.options.gfm && first && first.type === 'paragraph') {
        const m = reTaskMarker.exec(first.content);
        if (m) {
          block.task = m[1] === 'x' || m[1] === 'X' ? 'checked' : 'unchecked';
          first.content = first.content.slice(m[0].length);
        }
      }
    },
    canContain: (t) => t !== 'item',
    acceptsLines: false,
  },
  heading: {
    cont: () => 1,
    finalize() {},
    canContain: () => false,
    acceptsLines: false,
  },
  thematic_break: {
    cont: () => 1,
    finalize() {},
    canContain: () => false,
    acceptsLines: false,
  },
  code_block: {
    cont(p, container) {
      const ln = p.currentLine;
      const indent = p.indent;
      if (container.fenced) {
        const m = indent <= 3 && ln[p.nextNonspace] === container.fenceChar
          ? reClosingCodeFence.exec(ln.slice(p.nextNonspace)) : null;
        if (m && m[0].length >= container.fenceLength) {
          p.finalize(container, p.lineNumber);
          return 2;
        }
        let i = container.fenceOffset;
        while (i > 0 && isSpaceOrTab(ln[p.offset])) {
          p.advanceOffset(1, true);
          i--;
        }
      } else if (indent >= CODE_INDENT) {
        p.advanceOffset(CODE_INDENT, true);
      } else if (p.blank) {
        p.advanceNextNonspace();
      } else {
        return 1;
      }
      return 0;
    },
    finalize(p, block) {
      if (block.fenced) {
        const nl = block.content.indexOf('\n');
        block.info = unescapeString(trimWs(block.content.slice(0, nl)));
        block.literal = block.content.slice(nl + 1);
      } else {
        const lines = block.content.split('\n');
        while (lines.length > 0 && !reNonSpace.test(lines[lines.length - 1])) lines.pop();
        block.literal = lines.join('\n') + '\n';
      }
      block.content = null;
    },
    canContain: () => false,
    acceptsLines: true,
  },
  html_block: {
    cont: (p, container) => (p.blank && (container.htmlBlockType === 6 || container.htmlBlockType === 7) ? 1 : 0),
    finalize(p, block) {
      block.literal = block.content.replace(/\n$/, '');
      block.content = null;
    },
    canContain: () => false,
    acceptsLines: true,
  },
  paragraph: {
    cont: (p) => (p.blank ? 1 : 0),
    finalize(p, block) {
      let pos;
      while (block.content[0] === '[' && (pos = p.inline.parseReference(block.content, p.refmap))) {
        block.content = block.content.slice(pos);
      }
      // um parágrafo só fica vazio quando era feito apenas de definições
      if (isBlank(block.content)) block.unlink();
    },
    canContain: () => false,
    acceptsLines: true,
  },
  table: {
    cont: (p) => (p.blank ? 1 : 0),
    finalize(p, block) {
      const columns = block.aligns.length;
      const makeCell = (text, i, header) => {
        const cell = new Node('table_cell', 0);
        cell.content = text;
        cell.align = block.aligns[i];
        cell.isHeader = header;
        return cell;
      };
      const head = new Node('table_head', block.startLine);
      const headRow = new Node('table_row', block.startLine);
      block.headerCells.forEach((text, i) => headRow.appendChild(makeCell(text, i, true)));
      head.appendChild(headRow);
      block.appendChild(head);
      const lines = block.content.split('\n').filter((l) => !isBlank(l));
      if (lines.length > 0) {
        const body = new Node('table_body', block.startLine + 2);
        lines.forEach((line, k) => {
          const cells = splitTableRow(line);
          const row = new Node('table_row', block.startLine + 2 + k);
          for (let i = 0; i < columns; i++) row.appendChild(makeCell(cells[i] ?? '', i, false));
          body.appendChild(row);
        });
        block.appendChild(body);
      }
      block.content = null;
    },
    canContain: (t) => t === 'table_head' || t === 'table_body',
    acceptsLines: true,
  },
};

function parseListMarker(p, container) {
  if (p.indent >= 4) return null;
  const ln = p.currentLine;
  const rest = ln.slice(p.nextNonspace);
  const interrupts = container.type === 'paragraph' || container.type === 'table';
  const data = {
    type: null, bulletChar: null, start: null, delimiter: null, padding: 0, markerOffset: p.indent,
  };
  let m = reBulletListMarker.exec(rest);
  if (m) {
    data.type = 'bullet';
    data.bulletChar = m[0];
  } else if ((m = reOrderedListMarker.exec(rest)) && (!interrupts || parseInt(m[1], 10) === 1)) {
    data.type = 'ordered';
    data.start = parseInt(m[1], 10);
    data.delimiter = m[2];
  } else {
    return null;
  }
  const after = ln[p.nextNonspace + m[0].length];
  if (!(after === undefined || after === '\t' || after === ' ')) return null;
  if (interrupts && !reNonSpace.test(ln.slice(p.nextNonspace + m[0].length))) return null;

  p.advanceNextNonspace();
  p.advanceOffset(m[0].length, true);
  const spacesStartCol = p.column;
  const spacesStartOffset = p.offset;
  do {
    p.advanceOffset(1, true);
  } while (p.column - spacesStartCol < 5 && isSpaceOrTab(ln[p.offset]));
  const blankItem = ln[p.offset] === undefined;
  const spacesAfterMarker = p.column - spacesStartCol;
  if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
    data.padding = m[0].length + 1;
    p.column = spacesStartCol;
    p.offset = spacesStartOffset;
    if (isSpaceOrTab(ln[p.offset])) p.advanceOffset(1, true);
  } else {
    data.padding = m[0].length + spacesAfterMarker;
  }
  return data;
}

/** Retira definições de referência do começo do texto de um parágrafo. */
function extractReferences(p, block) {
  let pos;
  while (block.content[0] === '[' && (pos = p.inline.parseReference(block.content, p.refmap))) {
    block.content = block.content.slice(pos);
  }
}

// Inícios de bloco, na ordem da especificação.
// Retorno: 0 = nada, 1 = abriu um contêiner, 2 = abriu um bloco folha.
const BLOCK_STARTS = [
  // citação
  (p) => {
    if (p.indented || p.currentLine[p.nextNonspace] !== '>') return 0;
    p.advanceNextNonspace();
    p.advanceOffset(1, false);
    if (isSpaceOrTab(p.currentLine[p.offset])) p.advanceOffset(1, true);
    p.closeUnmatchedBlocks();
    p.addChild('block_quote', p.nextNonspace);
    return 1;
  },
  // título ATX
  (p) => {
    if (p.indented) return 0;
    const m = reATXHeadingMarker.exec(p.currentLine.slice(p.nextNonspace));
    if (!m) return 0;
    p.advanceNextNonspace();
    p.advanceOffset(m[0].length, false);
    p.closeUnmatchedBlocks();
    const heading = p.addChild('heading', p.nextNonspace);
    heading.level = trimWs(m[0]).length;
    heading.content = stripClosingHashes(p.currentLine.slice(p.offset));
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // bloco de código cercado
  (p) => {
    if (p.indented) return 0;
    const m = reCodeFence.exec(p.currentLine.slice(p.nextNonspace));
    if (!m) return 0;
    const fenceLength = m[0].length;
    p.closeUnmatchedBlocks();
    const code = p.addChild('code_block', p.nextNonspace);
    code.fenced = true;
    code.fenceLength = fenceLength;
    code.fenceChar = m[0][0];
    code.fenceOffset = p.indent;
    p.advanceNextNonspace();
    p.advanceOffset(fenceLength, false);
    return 2;
  },
  // bloco de HTML
  (p, container) => {
    if (p.indented || p.currentLine[p.nextNonspace] !== '<') return 0;
    const s = p.currentLine.slice(p.nextNonspace);
    const interrupts = container.type === 'paragraph' || container.type === 'table';
    for (let type = 1; type <= 7; type++) {
      if (!reHtmlBlockOpen[type].test(s)) continue;
      if (type === 7 && (interrupts || reRawTextTag.test(s))) continue;
      p.closeUnmatchedBlocks();
      const block = p.addChild('html_block', p.offset);
      block.htmlBlockType = type;
      return 2;
    }
    return 0;
  },
  // título setext (sublinhado com = ou -)
  (p, container) => {
    if (p.indented || container.type !== 'paragraph') return 0;
    const m = reSetextHeadingLine.exec(p.currentLine.slice(p.nextNonspace));
    if (!m) return 0;
    p.closeUnmatchedBlocks();
    extractReferences(p, container);
    if (container.content.length === 0) return 0;
    const heading = new Node('heading', container.startLine);
    heading.level = m[0][0] === '=' ? 1 : 2;
    heading.content = container.content;
    container.insertAfter(heading);
    container.unlink();
    p.tip = heading;
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // tabela do GFM: a linha atual é a delimitadora e a última linha do parágrafo é o cabeçalho
  (p, container) => {
    if (!p.options.gfm || p.indented || container.type !== 'paragraph') return 0;
    const aligns = parseDelimiterRow(p.currentLine.slice(p.nextNonspace));
    if (!aligns) return 0;
    extractReferences(p, container);
    const lines = container.content.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    if (lines.length === 0) return 0;
    const headerCells = splitTableRow(lines[lines.length - 1]);
    if (headerCells.length !== aligns.length) return 0;
    p.closeUnmatchedBlocks();
    const parent = container.parent;
    if (lines.length > 1) {
      container.content = lines.slice(0, -1).join('\n') + '\n';
      p.finalize(container, p.lineNumber - 2);
    } else {
      container.unlink();
    }
    p.tip = parent;
    const table = p.addChild('table', p.nextNonspace);
    table.startLine = p.lineNumber - 1;
    table.aligns = aligns;
    table.headerCells = headerCells;
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // quebra temática
  (p) => {
    if (p.indented || !reThematicBreak.test(p.currentLine.slice(p.nextNonspace))) return 0;
    p.closeUnmatchedBlocks();
    p.addChild('thematic_break', p.nextNonspace);
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // item de lista
  (p, container) => {
    if (p.indented && container.type !== 'list') return 0;
    const data = parseListMarker(p, container);
    if (!data) return 0;
    p.closeUnmatchedBlocks();
    if (p.tip.type !== 'list' || !listsMatch(p.tip.listData, data)) {
      const list = p.addChild('list', p.nextNonspace);
      list.listData = data;
    }
    const item = p.addChild('item', p.nextNonspace);
    item.listData = data;
    return 1;
  },
  // código indentado
  (p) => {
    if (!p.indented || p.tip.type === 'paragraph' || p.tip.type === 'table' || p.blank) return 0;
    p.advanceOffset(CODE_INDENT, true);
    p.closeUnmatchedBlocks();
    p.addChild('code_block', p.offset);
    return 2;
  },
];

class BlockParser {
  constructor(options) {
    this.options = options;
  }

  parse(input) {
    this.doc = new Node('document', 1);
    this.tip = this.doc;
    this.oldtip = this.doc;
    this.lastMatchedContainer = this.doc;
    this.allClosed = true;
    this.refmap = new Map();
    this.inline = new InlineParser(this.refmap, this.options);
    this.lineNumber = 0;
    const text = input.indexOf('\0') === -1 ? input : input.replace(/\0/g, '\uFFFD');
    const lines = text.split(/\r\n|\n|\r/);
    let count = lines.length;
    if (text.length > 0 && (text.endsWith('\n') || text.endsWith('\r'))) count -= 1;
    for (let i = 0; i < count; i++) this.incorporateLine(lines[i]);
    while (this.tip) this.finalize(this.tip, count);
    this.processInlines();
    this.doc.refmap = this.refmap;
    return this.doc;
  }

  findNextNonspace() {
    // Enquanto o deslocamento continua dentro do mesmo trecho de espaços, o próximo
    // caractere não branco é o mesmo: reaproveitar o cálculo evita custo cúbico em
    // listas muito aninhadas (cada contêiner consumiria de novo a mesma indentação).
    if (this.nnLine === this.lineNumber && this.nnStart <= this.offset && this.offset <= this.nextNonspace) {
      this.indent = this.nextNonspaceColumn - this.column;
      this.indented = this.indent >= CODE_INDENT;
      return;
    }
    const ln = this.currentLine;
    let i = this.offset;
    let cols = this.column;
    let c;
    this.nnLine = this.lineNumber;
    this.nnStart = i;
    while ((c = ln[i]) !== undefined) {
      if (c === ' ') {
        i++;
        cols++;
      } else if (c === '\t') {
        i++;
        cols += 4 - (cols % 4);
      } else {
        break;
      }
    }
    this.blank = c === undefined || c === '\n' || c === '\r';
    this.nextNonspace = i;
    this.nextNonspaceColumn = cols;
    this.indent = cols - this.column;
    this.indented = this.indent >= CODE_INDENT;
  }

  // Avança count caracteres (ou colunas, quando columns = true), tratando a
  // tabulação como parada a cada 4 colunas; uma tabulação pode ser consumida em parte.
  advanceOffset(count, columns) {
    const ln = this.currentLine;
    let c;
    while (count > 0 && (c = ln[this.offset]) !== undefined) {
      if (c === '\t') {
        const charsToTab = 4 - (this.column % 4);
        if (columns) {
          this.partiallyConsumedTab = charsToTab > count;
          const charsToAdvance = charsToTab > count ? count : charsToTab;
          this.column += charsToAdvance;
          this.offset += this.partiallyConsumedTab ? 0 : 1;
          count -= charsToAdvance;
        } else {
          this.partiallyConsumedTab = false;
          this.column += charsToTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partiallyConsumedTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  }

  advanceNextNonspace() {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partiallyConsumedTab = false;
  }

  addLine() {
    if (this.partiallyConsumedTab) {
      this.offset += 1;
      const charsToTab = 4 - (this.column % 4);
      this.tip.content += ' '.repeat(charsToTab);
    }
    this.tip.content += this.currentLine.slice(this.offset) + '\n';
  }

  addChild(type, offset) {
    while (!BLOCKS[this.tip.type].canContain(type)) this.finalize(this.tip, this.lineNumber - 1);
    const block = new Node(type, this.lineNumber);
    block.column = offset + 1;
    this.tip.appendChild(block);
    this.tip = block;
    return block;
  }

  closeUnmatchedBlocks() {
    if (this.allClosed) return;
    while (this.oldtip !== this.lastMatchedContainer) {
      const parent = this.oldtip.parent;
      this.finalize(this.oldtip, this.lineNumber - 1);
      this.oldtip = parent;
    }
    this.allClosed = true;
  }

  finalize(block, lineNumber) {
    const above = block.parent;
    block.open = false;
    block.endLine = lineNumber;
    BLOCKS[block.type].finalize(this, block);
    this.tip = above;
  }

  incorporateLine(ln) {
    let container = this.doc;
    this.oldtip = this.tip;
    this.offset = 0;
    this.column = 0;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.lineNumber += 1;
    this.currentLine = ln;

    // 1. Quais contêineres abertos continuam nesta linha?
    let lastChild;
    while ((lastChild = container.lastChild) && lastChild.open) {
      container = lastChild;
      this.findNextNonspace();
      const res = BLOCKS[container.type].cont(this, container);
      if (res === 1) {
        container = container.parent;
        break;
      }
      if (res === 2) return;
    }
    this.allClosed = container === this.oldtip;
    this.lastMatchedContainer = container;

    // 2. O resto da linha abre blocos novos?
    let matchedLeaf = container.type !== 'paragraph' && container.type !== 'table'
      && BLOCKS[container.type].acceptsLines;
    while (!matchedLeaf) {
      this.findNextNonspace();
      if (!this.indented && !reMaybeSpecial.test(ln.slice(this.nextNonspace, this.nextNonspace + 1))) {
        this.advanceNextNonspace();
        break;
      }
      let i = 0;
      for (; i < BLOCK_STARTS.length; i++) {
        const res = BLOCK_STARTS[i](this, container);
        if (res === 1) {
          container = this.tip;
          break;
        }
        if (res === 2) {
          container = this.tip;
          matchedLeaf = true;
          break;
        }
      }
      if (i === BLOCK_STARTS.length) {
        this.advanceNextNonspace();
        break;
      }
    }

    // 3. O que sobrou é texto: continuação preguiçosa de parágrafo ou linha de um bloco.
    if (!this.allClosed && !this.blank && this.tip.type === 'paragraph') {
      this.addLine();
      return;
    }
    this.closeUnmatchedBlocks();
    if (this.blank && container.lastChild) container.lastChild.lastLineBlank = true;
    const t = container.type;
    container.lastLineBlank = this.blank && !(
      t === 'block_quote' || t === 'heading' || t === 'thematic_break'
      || (t === 'code_block' && container.fenced)
      || (t === 'item' && !container.firstChild && container.startLine === this.lineNumber)
    );
    for (let up = container.parent; up; up = up.parent) up.lastLineBlank = false;

    if (BLOCKS[t].acceptsLines) {
      this.addLine();
      if (t === 'html_block' && container.htmlBlockType <= 5
        && reHtmlBlockClose[container.htmlBlockType].test(ln.slice(this.offset))) {
        this.finalize(container, this.lineNumber);
      }
    } else if (this.offset < ln.length && !this.blank) {
      this.addChild('paragraph', this.offset);
      this.advanceNextNonspace();
      this.addLine();
    }
  }

  processInlines() {
    const targets = [];
    const walker = new Walker(this.doc);
    let ev;
    while ((ev = walker.next())) {
      const t = ev.node.type;
      if (ev.entering && (t === 'paragraph' || t === 'heading' || t === 'table_cell')) targets.push(ev.node);
    }
    for (const block of targets) {
      this.inline.parse(block);
      if (this.options.gfm) autolinkBlock(block);
    }
  }
}

// ---------------------------------------------------------------------------
// Fase 2: inlines
// ---------------------------------------------------------------------------

const reMain = /[^\n`[\]\\!<&*_~]+/y;
const reInitialSpace = / */y;
const reTicksHere = /`+/y;
const reTicks = /`+/g;
const reSpnl = /[ \t]*(?:\n[ \t]*)?/y;
const reSpaceAtEndOfLine = /[ \t]*(?:\n|$)/y;
const reLinkLabel = /\[(?:[^\\[\]]|\\[\s\S]){0,999}\]/y;
const reLinkTitle = /"(?:\\[\s\S]|[^\\"\x00])*"|'(?:\\[\s\S]|[^\\'\x00])*'|\((?:\\[\s\S]|[^\\()\x00])*\)/y;
const reLinkDestinationBraces = /<(?:[^<>\n\\\x00]|\\[\s\S])*>/y;
const reEntityHere = /&(?:#[xX][a-fA-F0-9]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/y;
const reEmailAutolink = /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y;
const reAutolink = /<([A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*)>/y;
const MAX_LINK_PARENS = 32;

function charBefore(s, i) {
  const low = s.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) {
    const high = s.charCodeAt(i - 2);
    if (high >= 0xd800 && high <= 0xdbff) return s.slice(i - 2, i);
  }
  return s[i - 1];
}

function charAt(s, i) {
  return String.fromCodePoint(s.codePointAt(i));
}

class InlineParser {
  constructor(refmap, options) {
    this.refmap = refmap;
    this.options = options;
    this.subject = '';
    this.pos = 0;
  }

  parse(block) {
    this.subject = trimWs(block.content);
    this.pos = 0;
    this.delimiters = null;
    this.brackets = null;
    this.noCloser = new Set();
    this.closerCache = new Map();
    while (this.parseInline(block));
    block.content = null;
    this.processEmphasis(null);
  }

  match(re) {
    re.lastIndex = this.pos;
    const m = re.exec(this.subject);
    if (m === null) return null;
    this.pos = re.lastIndex;
    return m[0];
  }

  peek() {
    return this.subject[this.pos] ?? '';
  }

  spnl() {
    this.match(reSpnl);
    return true;
  }

  parseInline(block) {
    const c = this.subject[this.pos];
    if (c === undefined) return false;
    let res;
    switch (c) {
      case '\n': res = this.parseNewline(block); break;
      case '\\': res = this.parseBackslash(block); break;
      case '`': res = this.parseBackticks(block); break;
      case '*':
      case '_': res = this.handleDelim(c, block); break;
      case '~': res = this.options.gfm ? this.handleDelim(c, block) : false; break;
      case '[': res = this.parseOpenBracket(block); break;
      case '!': res = this.parseBang(block); break;
      case ']': res = this.parseCloseBracket(block); break;
      case '<': res = this.parseAutolink(block) || this.parseHtmlTag(block); break;
      case '&': res = this.parseEntity(block); break;
      default: res = this.parseString(block);
    }
    if (!res) {
      this.pos += 1;
      block.appendChild(textNode(c));
    }
    return true;
  }

  parseString(block) {
    const m = this.match(reMain);
    if (m === null) return false;
    block.appendChild(textNode(m));
    return true;
  }

  parseNewline(block) {
    this.pos += 1;
    const last = block.lastChild;
    if (last && last.type === 'text' && last.literal[last.literal.length - 1] === ' ') {
      const s = last.literal;
      let end = s.length;
      while (end > 0 && s[end - 1] === ' ') end--;
      const hard = s.length - end >= 2;
      last.literal = s.slice(0, end);
      block.appendChild(new Node(hard ? 'linebreak' : 'softbreak'));
    } else {
      block.appendChild(new Node('softbreak'));
    }
    this.match(reInitialSpace);
    return true;
  }

  parseBackslash(block) {
    const s = this.subject;
    this.pos += 1;
    const next = s[this.pos];
    if (next === '\n') {
      this.pos += 1;
      block.appendChild(new Node('linebreak'));
    } else if (next !== undefined && reEscapable.test(next)) {
      const node = textNode(next);
      node.escaped = true;
      block.appendChild(node);
      this.pos += 1;
    } else {
      block.appendChild(textNode('\\'));
    }
    return true;
  }

  parseBackticks(block) {
    const ticks = this.match(reTicksHere);
    if (ticks === null) return false;
    const afterOpen = this.pos;
    const n = ticks.length;
    if (!this.noCloser.has(n)) {
      reTicks.lastIndex = afterOpen;
      let m;
      while ((m = reTicks.exec(this.subject)) !== null) {
        if (m[0].length !== n) continue;
        let contents = this.subject.slice(afterOpen, m.index).replace(/\n/g, ' ');
        // um espaço de cada ponta sai quando os dois existem e o conteúdo não é só espaço
        if (contents[0] === ' ' && contents[contents.length - 1] === ' ' && /[^ ]/.test(contents)) {
          contents = contents.slice(1, -1);
        }
        const node = new Node('code');
        node.literal = contents;
        block.appendChild(node);
        this.pos = m.index + n;
        return true;
      }
      // não existe fechamento com n crases depois daqui: lembra para não buscar de novo
      this.noCloser.add(n);
    }
    this.pos = afterOpen;
    block.appendChild(textNode(ticks));
    return true;
  }

  scanDelims(cc) {
    const s = this.subject;
    const start = this.pos;
    let n = 0;
    while (s[start + n] === cc) n++;
    if (n === 0) return null;
    const before = start === 0 ? '\n' : charBefore(s, start);
    const after = start + n >= s.length ? '\n' : charAt(s, start + n);
    const afterWs = reUnicodeWhitespace.test(after);
    const afterPunct = rePunctuation.test(after);
    const beforeWs = reUnicodeWhitespace.test(before);
    const beforePunct = rePunctuation.test(before);
    const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
    const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);
    let canOpen;
    let canClose;
    if (cc === '_') {
      canOpen = leftFlanking && (!rightFlanking || beforePunct);
      canClose = rightFlanking && (!leftFlanking || afterPunct);
    } else {
      canOpen = leftFlanking;
      canClose = rightFlanking;
    }
    return { n, canOpen, canClose };
  }

  handleDelim(cc, block) {
    const res = this.scanDelims(cc);
    if (!res) return false;
    const start = this.pos;
    this.pos += res.n;
    const node = textNode(this.subject.slice(start, this.pos));
    block.appendChild(node);
    // no tachado só valem sequências de um ou dois ~
    if (cc === '~' && res.n > 2) return true;
    if (res.canOpen || res.canClose) {
      this.delimiters = {
        cc, numdelims: res.n, origdelims: res.n, node,
        previous: this.delimiters, next: null, canOpen: res.canOpen, canClose: res.canClose,
      };
      if (this.delimiters.previous) this.delimiters.previous.next = this.delimiters;
    }
    return true;
  }

  removeDelimiter(delim) {
    if (delim.previous !== null) delim.previous.next = delim.next;
    if (delim.next === null) this.delimiters = delim.previous;
    else delim.next.previous = delim.previous;
  }

  // Algoritmo "process emphasis" da especificação: percorre os fechadores da
  // esquerda para a direita e procura, para trás, o abridor compatível mais próximo.
  processEmphasis(stackBottom) {
    const openersBottom = new Map();
    let closer = this.delimiters;
    while (closer !== null && closer.previous !== stackBottom) closer = closer.previous;
    while (closer !== null) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const cc = closer.cc;
      const key = cc === '~' ? `~${closer.origdelims}` : `${cc}${closer.canOpen ? 1 : 0}${closer.origdelims % 3}`;
      const bottom = openersBottom.has(key) ? openersBottom.get(key) : stackBottom;
      let opener = closer.previous;
      let found = false;
      while (opener !== null && opener !== stackBottom && opener !== bottom) {
        if (opener.cc === cc && opener.canOpen) {
          if (cc === '~') {
            if (opener.origdelims === closer.origdelims) {
              found = true;
              break;
            }
          } else {
            // regra do múltiplo de 3: "*foo**bar*" não fecha ** com *
            const oddMatch = (closer.canOpen || opener.canClose) && closer.origdelims % 3 !== 0
              && (opener.origdelims + closer.origdelims) % 3 === 0;
            if (!oddMatch) {
              found = true;
              break;
            }
          }
        }
        opener = opener.previous;
      }
      if (!found) {
        const old = closer;
        closer = closer.next;
        openersBottom.set(key, old.previous);
        if (!old.canOpen) this.removeDelimiter(old);
        continue;
      }
      const use = cc === '~' ? closer.numdelims : (closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1);
      const openerInl = opener.node;
      const closerInl = closer.node;
      opener.numdelims -= use;
      closer.numdelims -= use;
      openerInl.literal = openerInl.literal.slice(0, openerInl.literal.length - use);
      closerInl.literal = closerInl.literal.slice(0, closerInl.literal.length - use);
      const wrapper = new Node(cc === '~' ? 'del' : use === 1 ? 'emph' : 'strong');
      let tmp = openerInl.next;
      while (tmp && tmp !== closerInl) {
        const nx = tmp.next;
        tmp.unlink();
        wrapper.appendChild(tmp);
        tmp = nx;
      }
      openerInl.insertAfter(wrapper);
      if (opener.next !== closer) {
        opener.next = closer;
        closer.previous = opener;
      }
      if (opener.numdelims === 0) {
        openerInl.unlink();
        this.removeDelimiter(opener);
      }
      if (closer.numdelims === 0) {
        closerInl.unlink();
        const nx = closer.next;
        this.removeDelimiter(closer);
        closer = nx;
      }
    }
    while (this.delimiters !== null && this.delimiters !== stackBottom) this.removeDelimiter(this.delimiters);
  }

  addBracket(node, index, image) {
    if (this.brackets !== null) this.brackets.bracketAfter = true;
    this.brackets = {
      node, previous: this.brackets, previousDelimiter: this.delimiters, index, image,
      active: true, bracketAfter: false,
    };
  }

  removeBracket() {
    this.brackets = this.brackets.previous;
  }

  parseOpenBracket(block) {
    const start = this.pos;
    this.pos += 1;
    const node = textNode('[');
    block.appendChild(node);
    this.addBracket(node, start, false);
    return true;
  }

  parseBang(block) {
    const start = this.pos;
    this.pos += 1;
    if (this.peek() === '[') {
      this.pos += 1;
      const node = textNode('![');
      block.appendChild(node);
      this.addBracket(node, start + 1, true);
    } else {
      block.appendChild(textNode('!'));
    }
    return true;
  }

  parseLinkLabel() {
    const m = this.match(reLinkLabel);
    return m === null ? 0 : m.length;
  }

  parseLinkDestination() {
    const braces = this.match(reLinkDestinationBraces);
    if (braces !== null) return unescapeString(braces.slice(1, -1));
    if (this.peek() === '<') return null;
    const s = this.subject;
    const start = this.pos;
    let parens = 0;
    let c = '';
    while (this.pos < s.length) {
      c = s[this.pos];
      if (c === '\\' && this.pos + 1 < s.length && reEscapable.test(s[this.pos + 1])) {
        this.pos += 2;
        continue;
      }
      if (c === '(') {
        parens += 1;
        if (parens > MAX_LINK_PARENS) return null;
        this.pos += 1;
        continue;
      }
      if (c === ')') {
        if (parens < 1) break;
        parens -= 1;
        this.pos += 1;
        continue;
      }
      const code = s.charCodeAt(this.pos);
      if (code <= 0x20 || code === 0x7f) break;
      this.pos += 1;
    }
    if (this.pos === start && c !== ')') return null;
    if (parens !== 0) return null;
    return unescapeString(s.slice(start, this.pos));
  }

  parseLinkTitle() {
    const title = this.match(reLinkTitle);
    if (title === null) return null;
    return unescapeString(title.slice(1, -1));
  }

  parseCloseBracket(block) {
    this.pos += 1;
    const startpos = this.pos;
    const opener = this.brackets;
    if (opener === null) {
      block.appendChild(textNode(']'));
      return true;
    }
    if (!opener.active) {
      block.appendChild(textNode(']'));
      this.removeBracket();
      return true;
    }
    const isImage = opener.image;
    const savepos = this.pos;
    let matched = false;
    let dest = null;
    let title = null;

    // link inline: [texto](destino "título")
    if (this.peek() === '(') {
      this.pos += 1;
      this.spnl();
      dest = this.parseLinkDestination();
      if (dest !== null) {
        this.spnl();
        if (/[ \t\n]/.test(this.subject[this.pos - 1])) title = this.parseLinkTitle();
        this.spnl();
        if (this.peek() === ')') {
          this.pos += 1;
          matched = true;
        }
      }
      if (!matched) {
        this.pos = savepos;
        title = null;
      }
    }

    // link por referência: [texto][rótulo], [texto][] ou [texto]
    if (!matched) {
      const beforeLabel = this.pos;
      const n = this.parseLinkLabel();
      let label = null;
      if (n > 2) label = this.subject.slice(beforeLabel, beforeLabel + n);
      else if (!opener.bracketAfter) label = this.subject.slice(opener.index, startpos);
      if (n === 0) this.pos = savepos;
      if (label !== null) {
        const ref = this.refmap.get(normalizeReference(label));
        if (ref) {
          dest = ref.destination;
          title = ref.title;
          matched = true;
        }
      }
    }

    if (!matched) {
      this.removeBracket();
      this.pos = startpos;
      block.appendChild(textNode(']'));
      return true;
    }

    const node = new Node(isImage ? 'image' : 'link');
    node.destination = normalizeUri(dest);
    node.rawDestination = dest;
    node.title = title || '';
    let tmp = opener.node.next;
    while (tmp) {
      const nx = tmp.next;
      tmp.unlink();
      node.appendChild(tmp);
      tmp = nx;
    }
    block.appendChild(node);
    this.processEmphasis(opener.previousDelimiter);
    this.removeBracket();
    opener.node.unlink();
    // links não podem conter links: desativa os [ anteriores
    if (!isImage) {
      for (let o = this.brackets; o !== null; o = o.previous) if (!o.image) o.active = false;
    }
    return true;
  }

  parseAutolink(block) {
    let m = this.match(reEmailAutolink);
    let dest;
    let label;
    if (m !== null) {
      label = m.slice(1, -1);
      dest = 'mailto:' + label;
    } else if ((m = this.match(reAutolink)) !== null) {
      label = m.slice(1, -1);
      dest = label;
    } else {
      return false;
    }
    const node = new Node('link');
    node.destination = normalizeUri(dest);
    node.rawDestination = dest;
    node.title = '';
    node.appendChild(textNode(label));
    block.appendChild(node);
    return true;
  }

  // Procura needle a partir de from lembrando a última resposta, para que muitos
  // "<!--" sem fechamento não deixem a análise quadrática.
  findCached(needle, from) {
    const cached = this.closerCache.get(needle);
    if (cached !== undefined && (cached === -1 || cached >= from)) return cached;
    const found = this.subject.indexOf(needle, from);
    this.closerCache.set(needle, found);
    return found;
  }

  parseHtmlTag(block) {
    const s = this.subject;
    const p = this.pos;
    let end = -1;
    if (s.startsWith('<!--', p)) {
      if (s.startsWith('<!-->', p)) end = p + 5;
      else if (s.startsWith('<!--->', p)) end = p + 6;
      else {
        const k = this.findCached('-->', p + 4);
        end = k === -1 ? -1 : k + 3;
      }
    } else if (s.startsWith('<?', p)) {
      const k = this.findCached('?>', p + 2);
      end = k === -1 ? -1 : k + 2;
    } else if (s.startsWith('<![CDATA[', p)) {
      const k = this.findCached(']]>', p + 9);
      end = k === -1 ? -1 : k + 3;
    } else if (s.startsWith('<!', p) && /[A-Za-z]/.test(s[p + 2] ?? '')) {
      const k = this.findCached('>', p + 2);
      end = k === -1 ? -1 : k + 1;
    } else {
      reOpenOrCloseTag.lastIndex = p;
      const m = reOpenOrCloseTag.exec(s);
      if (m !== null) end = reOpenOrCloseTag.lastIndex;
    }
    if (end === -1) return false;
    const node = new Node('html_inline');
    node.literal = s.slice(p, end);
    block.appendChild(node);
    this.pos = end;
    return true;
  }

  parseEntity(block) {
    const m = this.match(reEntityHere);
    if (m === null) return false;
    const decoded = decodeEntity(m.slice(1, -1));
    if (decoded === null) {
      this.pos -= m.length;
      return false;
    }
    const node = textNode(decoded);
    node.escaped = true;
    block.appendChild(node);
    return true;
  }

  /** Tenta ler definições de referência ([rótulo]: destino "título") no início de s. */
  parseReference(s, refmap) {
    this.subject = s;
    this.pos = 0;
    const n = this.parseLinkLabel();
    if (n === 0) return 0;
    const rawLabel = s.slice(0, n);
    if (this.peek() !== ':') {
      this.pos = 0;
      return 0;
    }
    this.pos += 1;
    this.spnl();
    const dest = this.parseLinkDestination();
    if (dest === null) {
      this.pos = 0;
      return 0;
    }
    const beforeTitle = this.pos;
    this.spnl();
    let title = null;
    if (this.pos !== beforeTitle) title = this.parseLinkTitle();
    if (title === null) this.pos = beforeTitle;
    let atLineEnd = this.match(reSpaceAtEndOfLine) !== null;
    if (!atLineEnd && title !== null) {
      // o título não termina a linha, mas o destino sozinho pode valer
      title = null;
      this.pos = beforeTitle;
      atLineEnd = this.match(reSpaceAtEndOfLine) !== null;
    }
    if (!atLineEnd) {
      this.pos = 0;
      return 0;
    }
    const label = normalizeReference(rawLabel);
    if (label === '') {
      this.pos = 0;
      return 0;
    }
    if (!refmap.has(label)) refmap.set(label, { destination: dest, title: title ?? '' });
    return this.pos;
  }
}

// ---------------------------------------------------------------------------
// GFM: links automáticos estendidos (www., http://, https:// e e-mails)
// ---------------------------------------------------------------------------

const reHostChar = /[\p{L}\p{N}\p{M}]/u;
const reUrlScheme = /(?:https?|ftp):\/\//iy;

/** Lê um domínio a partir de start e devolve o fim, ou -1 se não for válido. */
function scanDomain(s, start, needPeriod) {
  let i = start;
  let periods = 0;
  let usLast = 0;
  let usPrev = 0;
  while (i < s.length) {
    const ch = charAt(s, i);
    if (ch === '_') usLast++;
    else if (ch === '.') {
      usPrev = usLast;
      usLast = 0;
      periods++;
    } else if (ch !== '-' && !reHostChar.test(ch)) break;
    i += ch.length;
  }
  if (i === start || usLast > 0 || usPrev > 0) return -1;
  if (needPeriod && periods === 0) return -1;
  return i;
}

/** Corta a pontuação final que não faz parte do link (regras do GFM). */
function trimAutolinkEnd(s, start, end) {
  let open = -1;
  let close = 0;
  while (end > start) {
    const c = s[end - 1];
    if ('?!.,:*_~\'"'.includes(c)) {
      end--;
    } else if (c === ';') {
      let k = end - 2;
      while (k > start && /[A-Za-z0-9]/.test(s[k])) k--;
      if (k < end - 2 && s[k] === '&') end = k;
      else end--;
    } else if (c === ')') {
      if (open === -1) {
        open = 0;
        for (let k = start; k < end; k++) {
          if (s[k] === '(') open++;
          else if (s[k] === ')') close++;
        }
      }
      // só corta o ) final quando há mais fechamentos do que aberturas
      if (close <= open) break;
      end--;
      close--;
    } else {
      break;
    }
  }
  return end;
}

function scanPathEnd(s, from) {
  let i = from;
  while (i < s.length && !reUnicodeWhitespace.test(s[i]) && s[i] !== '<') i++;
  return i;
}

/** Encontra links automáticos estendidos em um texto e devolve os trechos. */
export function findAutolinks(s) {
  const out = [];
  let last = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const prev = i === 0 ? '' : s[i - 1];
    let found = null;
    if (ch === 'w' && s.startsWith('www.', i)
      && (i === 0 || reUnicodeWhitespace.test(prev) || '*_~('.includes(prev))) {
      const domEnd = scanDomain(s, i, true);
      if (domEnd > i + 4) {
        const end = trimAutolinkEnd(s, i, scanPathEnd(s, domEnd));
        if (end > i + 4) found = { start: i, end, href: 'http://' + s.slice(i, end) };
      }
    } else if ((ch === 'h' || ch === 'H' || ch === 'f' || ch === 'F') && !/[A-Za-z]/.test(prev)) {
      reUrlScheme.lastIndex = i;
      const m = reUrlScheme.exec(s);
      if (m) {
        const domStart = i + m[0].length;
        const domEnd = scanDomain(s, domStart, false);
        if (domEnd !== -1) {
          const end = trimAutolinkEnd(s, i, scanPathEnd(s, domEnd));
          if (end > domStart) found = { start: i, end, href: s.slice(i, end) };
        }
      }
    } else if (ch === '@') {
      let start = i;
      while (start > last && /[A-Za-z0-9.+\-_]/.test(s[start - 1])) start--;
      if (start < i) {
        let end = i + 1;
        let periods = 0;
        while (end < s.length) {
          const c = s[end];
          if (/[A-Za-z0-9]/.test(c) || c === '-' || c === '_') end++;
          else if (c === '.' && /[A-Za-z0-9]/.test(s[end + 1] ?? '')) {
            periods++;
            end++;
          } else break;
        }
        if (periods > 0 && end > i + 1 && /[A-Za-z]/.test(s[end - 1])) {
          found = { start, end, href: 'mailto:' + s.slice(start, end) };
        }
      }
    }
    if (found) {
      if (found.start > last) out.push({ text: s.slice(last, found.start) });
      out.push({ text: s.slice(found.start, found.end), href: found.href });
      last = found.end;
      i = found.end;
    } else {
      i += 1;
    }
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

// Junta textos vizinhos para a busca de links automáticos. Caracteres escapados com
// barra invertida ou vindos de entidades ficam separados, como no cmark-gfm: assim
// "www\.exemplo.com" e "fulano\@site.com" continuam sendo texto comum.
function mergeTextNodes(parent) {
  let node = parent.firstChild;
  while (node) {
    if (node.type === 'text' && !node.escaped) {
      while (node.next && node.next.type === 'text' && !node.next.escaped) {
        node.literal += node.next.literal;
        node.next.unlink();
      }
    }
    node = node.next;
  }
}

function autolinkBlock(block) {
  const texts = [];
  const containers = [];
  let linkDepth = 0;
  const walker = new Walker(block);
  let ev;
  while ((ev = walker.next())) {
    const n = ev.node;
    if (n.type === 'link' || n.type === 'image') {
      linkDepth += ev.entering ? 1 : -1;
      continue;
    }
    if (ev.entering && n.isContainer) containers.push(n);
  }
  for (const c of containers) mergeTextNodes(c);
  const walker2 = new Walker(block);
  while ((ev = walker2.next())) {
    const n = ev.node;
    if (n.type === 'link' || n.type === 'image') {
      linkDepth += ev.entering ? 1 : -1;
      continue;
    }
    if (n.type === 'text' && linkDepth === 0) texts.push(n);
  }
  for (const t of texts) {
    const parts = findAutolinks(t.literal);
    if (parts.length === 1 && !parts[0].href) continue;
    let anchor = t;
    for (const part of parts) {
      let node;
      if (part.href) {
        node = new Node('link');
        node.destination = normalizeUri(part.href);
        node.rawDestination = part.href;
        node.title = '';
        node.appendChild(textNode(part.text));
      } else {
        node = textNode(part.text);
      }
      anchor.insertAfter(node);
      anchor = node;
    }
    t.unlink();
  }
}

// ---------------------------------------------------------------------------
// API de análise
// ---------------------------------------------------------------------------

/**
 * Analisa o Markdown e devolve a árvore (nó "document").
 * options.gfm (padrão true) liga tabelas, tarefas, tachado e links automáticos.
 */
export function parse(markdown, options = {}) {
  const opts = { gfm: true, ...options };
  return new BlockParser(opts).parse(String(markdown ?? ''));
}

/**
 * Texto puro dos filhos de um nó (usado no alt das imagens e nos ids dos títulos).
 * includeHtml decide se o HTML embutido entra como texto (ele aparece assim no modo escapado).
 */
export function inlineText(node, breakAs = '\n', includeHtml = true) {
  let out = '';
  const walker = new Walker(node);
  let ev;
  while ((ev = walker.next())) {
    if (!ev.entering) continue;
    const n = ev.node;
    if (n.type === 'text' || n.type === 'code' || (includeHtml && n.type === 'html_inline')) out += n.literal;
    else if (n.type === 'softbreak' || n.type === 'linebreak') out += breakAs;
  }
  return out;
}

/** Gera um identificador no estilo do GitHub: minúsculas, sem pontuação, espaços viram hífen. */
export function slugify(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

// ---------------------------------------------------------------------------
// Renderização em HTML
// ---------------------------------------------------------------------------

const DEFAULT_RENDER = {
  html: 'escape', // 'escape' mostra o HTML como texto; 'sanitize' aplica a lista de permissões
  headingIds: false,
  idPrefix: '',
  sourceLines: false,
};

function assignHeadingIds(doc, includeHtml) {
  const used = new Map();
  const walker = new Walker(doc);
  let ev;
  while ((ev = walker.next())) {
    if (!ev.entering || ev.node.type !== 'heading') continue;
    const base = slugify(trimWs(inlineText(ev.node, ' ', includeHtml)));
    if (base === '') continue;
    let slug = base;
    if (used.has(base)) {
      let k = used.get(base);
      do {
        k += 1;
        slug = `${base}-${k}`;
      } while (used.has(slug));
      used.set(base, k);
    }
    used.set(slug, used.get(slug) ?? 0);
    ev.node.slug = slug;
  }
}

class HtmlRenderer {
  constructor(options) {
    this.opts = options;
    this.chunks = [];
    this.last = '';
  }

  lit(s) {
    if (s.length === 0) return;
    this.chunks.push(s);
    this.last = s[s.length - 1];
  }

  // Quebra de linha entre blocos, sem duplicar. Guardar o último caractere evita
  // ler a string de saída (que seria copiada a cada consulta).
  cr() {
    if (this.last !== '' && this.last !== '\n') this.lit('\n');
  }

  line(node) {
    return this.opts.sourceLines ? ` data-line="${node.startLine - 1}"` : '';
  }

  rawHtml(literal) {
    return this.opts.html === 'sanitize' ? sanitizeHtml(literal) : escapeHtml(literal);
  }

  render(doc) {
    if (this.opts.headingIds) assignHeadingIds(doc, this.opts.html !== 'sanitize');
    const walker = new Walker(doc);
    let ev;
    while ((ev = walker.next())) {
      const { node, entering } = ev;
      switch (node.type) {
        case 'document':
          break;
        case 'paragraph': {
          const item = node.parent;
          const list = item && item.parent;
          const tight = item && item.type === 'item' && list && list.type === 'list' && list.tight;
          if (entering) {
            if (!tight) {
              this.cr();
              this.lit(`<p${this.line(node)}>`);
            }
            if (item && item.type === 'item' && item.task && item.firstChild === node) {
              this.lit(item.task === 'checked'
                ? '<input type="checkbox" checked="" disabled="" /> '
                : '<input type="checkbox" disabled="" /> ');
            }
          } else if (!tight) {
            this.lit('</p>');
            this.cr();
          }
          break;
        }
        case 'heading': {
          const tag = 'h' + node.level;
          if (entering) {
            const id = this.opts.headingIds && node.slug ? ` id="${escapeHtml(this.opts.idPrefix + node.slug)}"` : '';
            this.cr();
            this.lit(`<${tag}${id}${this.line(node)}>`);
          } else {
            this.lit(`</${tag}>`);
            this.cr();
          }
          break;
        }
        case 'code_block': {
          let cls = '';
          const lang = node.info ? node.info.split(/\s+/)[0] : '';
          if (lang) cls = ` class="${escapeHtml(lang.startsWith('language-') ? lang : 'language-' + lang)}"`;
          this.cr();
          this.lit(`<pre${this.line(node)}><code${cls}>${escapeHtml(node.literal)}</code></pre>`);
          this.cr();
          break;
        }
        case 'html_block':
          this.cr();
          if (this.opts.html === 'sanitize') this.lit(sanitizeHtml(node.literal));
          else this.lit(`<p class="raw-html"${this.line(node)}>${escapeHtml(node.literal)}</p>`);
          this.cr();
          break;
        case 'thematic_break':
          this.cr();
          this.lit(`<hr${this.line(node)} />`);
          this.cr();
          break;
        case 'block_quote':
          this.cr();
          this.lit(entering ? `<blockquote${this.line(node)}>` : '</blockquote>');
          this.cr();
          break;
        case 'list': {
          const tag = node.listData.type === 'bullet' ? 'ul' : 'ol';
          this.cr();
          if (entering) {
            const start = node.listData.start;
            const startAttr = start !== null && start !== 1 ? ` start="${start}"` : '';
            this.lit(`<${tag}${startAttr}${this.line(node)}>`);
          } else {
            this.lit(`</${tag}>`);
          }
          this.cr();
          break;
        }
        case 'item':
          if (entering) this.lit(`<li${node.task ? ' class="task-list-item"' : ''}${this.line(node)}>`);
          else {
            this.lit('</li>');
            this.cr();
          }
          break;
        case 'table':
          if (entering) {
            this.cr();
            this.lit(`<table${this.line(node)}>`);
            this.cr();
          } else {
            this.lit('</table>');
            this.cr();
          }
          break;
        case 'table_head':
          this.lit(entering ? '<thead>' : '</thead>');
          this.cr();
          break;
        case 'table_body':
          this.lit(entering ? '<tbody>' : '</tbody>');
          this.cr();
          break;
        case 'table_row':
          this.lit(entering ? `<tr${node.startLine > 0 ? this.line(node) : ''}>` : '</tr>');
          this.cr();
          break;
        case 'table_cell': {
          const tag = node.isHeader ? 'th' : 'td';
          if (entering) this.lit(`<${tag}${node.align ? ` align="${node.align}"` : ''}>`);
          else {
            this.lit(`</${tag}>`);
            this.cr();
          }
          break;
        }
        case 'text':
          this.lit(escapeHtml(node.literal));
          break;
        case 'softbreak':
          this.lit('\n');
          break;
        case 'linebreak':
          this.lit('<br />');
          this.cr();
          break;
        case 'emph':
          this.lit(entering ? '<em>' : '</em>');
          break;
        case 'strong':
          this.lit(entering ? '<strong>' : '</strong>');
          break;
        case 'del':
          this.lit(entering ? '<del>' : '</del>');
          break;
        case 'code':
          this.lit(`<code>${escapeHtml(node.literal)}</code>`);
          break;
        case 'html_inline':
          this.lit(this.rawHtml(node.literal));
          break;
        case 'link':
          if (entering) {
            const safe = isSafeUrl(node.rawDestination, 'link') && isSafeUrl(node.destination, 'link');
            const href = safe ? ` href="${escapeHtml(node.destination)}"` : '';
            const title = node.title ? ` title="${escapeHtml(node.title)}"` : '';
            this.lit(`<a${href}${title}>`);
          } else {
            this.lit('</a>');
          }
          break;
        case 'image': {
          const safe = isSafeUrl(node.rawDestination, 'image') && isSafeUrl(node.destination, 'image');
          const src = safe ? escapeHtml(node.destination) : '';
          const title = node.title ? ` title="${escapeHtml(node.title)}"` : '';
          this.lit(`<img src="${src}" alt="${escapeHtml(inlineText(node))}"${title} />`);
          walker.resumeAt(node, false);
          walker.next();
          break;
        }
        default:
          break;
      }
    }
    return this.chunks.join('');
  }
}

/** Converte a árvore em HTML. */
export function render(doc, options = {}) {
  return new HtmlRenderer({ ...DEFAULT_RENDER, ...options }).render(doc);
}

/** Atalho: Markdown direto para HTML. */
export function markdownToHtml(markdown, options = {}) {
  return render(parse(markdown, options), options);
}

/** Título do documento: texto do primeiro título de nível mais alto. */
export function documentTitle(doc) {
  let best = null;
  const walker = new Walker(doc);
  let ev;
  while ((ev = walker.next())) {
    if (ev.entering && ev.node.type === 'heading' && (best === null || ev.node.level < best.level)) best = ev.node;
  }
  return best ? trimWs(inlineText(best, ' ')) : '';
}

/** Texto puro do documento inteiro, com quebras entre blocos. */
export function documentText(doc) {
  const parts = [];
  const walker = new Walker(doc);
  let ev;
  let current = '';
  const flush = () => {
    if (current) parts.push(current);
    current = '';
  };
  while ((ev = walker.next())) {
    const n = ev.node;
    if (!ev.entering) {
      if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'table_cell') flush();
      continue;
    }
    if (n.type === 'text' || n.type === 'code') current += n.literal;
    else if (n.type === 'softbreak' || n.type === 'linebreak') current += ' ';
    else if (n.type === 'code_block' || n.type === 'html_block') {
      flush();
      parts.push(n.literal);
    }
  }
  flush();
  return parts.join('\n');
}

const reWord = /[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu;

/** Conta palavras (hífen e apóstrofo dentro da palavra não separam). */
export function countWords(text) {
  const m = text.match(reWord);
  return m ? m.length : 0;
}

/** Estatísticas exibidas na barra de status. */
export function documentStats(source, doc = parse(source)) {
  const words = countWords(documentText(doc));
  const chars = [...source].length;
  const lines = source === '' ? 0 : source.split(/\r\n|\n|\r/).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.round(words / 200));
  return { words, chars, lines, minutes };
}
