// Limpeza de HTML bruto por lista de permissões.
//
// Ideia central: nada do HTML de entrada é copiado como está. O texto é escapado e
// cada etiqueta reconhecida é reconstruída do zero, só com nomes e atributos da lista
// abaixo. Tudo o que não está na lista (script, style, iframe, svg, eventos on*,
// style=...) aparece escapado, como texto visível.

import { decodeEntities } from './entities.js';

const GLOBAL_ATTRS = ['title', 'lang', 'dir'];

const ALLOWED = {
  a: ['href'],
  abbr: [],
  b: [],
  bdi: [],
  bdo: [],
  blockquote: [],
  br: [],
  caption: [],
  cite: [],
  code: [],
  dd: [],
  del: [],
  details: ['open'],
  dfn: [],
  div: ['align'],
  dl: [],
  dt: [],
  em: [],
  figcaption: [],
  figure: [],
  h1: ['align'],
  h2: ['align'],
  h3: ['align'],
  h4: ['align'],
  h5: ['align'],
  h6: ['align'],
  hr: [],
  i: [],
  img: ['src', 'alt', 'width', 'height', 'align'],
  ins: [],
  kbd: [],
  li: [],
  mark: [],
  ol: ['start', 'type'],
  p: ['align'],
  pre: [],
  q: [],
  rp: [],
  rt: [],
  ruby: [],
  s: [],
  samp: [],
  small: [],
  span: [],
  strike: [],
  strong: [],
  sub: [],
  summary: [],
  sup: [],
  table: [],
  tbody: [],
  td: ['align', 'colspan', 'rowspan'],
  tfoot: [],
  th: ['align', 'colspan', 'rowspan'],
  thead: [],
  time: ['datetime'],
  tr: [],
  tt: [],
  u: [],
  ul: [],
  var: [],
  wbr: [],
};

const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr']);
const BOOLEAN_ATTRS = new Set(['open']);

const VALIDATORS = {
  align: (v) => /^(?:left|center|right|justify)$/i.test(v),
  width: (v) => /^\d{1,4}%?$/.test(v),
  height: (v) => /^\d{1,4}%?$/.test(v),
  start: (v) => /^-?\d{1,9}$/.test(v),
  type: (v) => /^[1aAiI]$/.test(v),
  colspan: (v) => /^\d{1,3}$/.test(v),
  rowspan: (v) => /^\d{1,3}$/.test(v),
  dir: (v) => /^(?:ltr|rtl|auto)$/i.test(v),
  lang: (v) => /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(v),
  datetime: (v) => /^[0-9TZ:+. -]{1,40}$/.test(v),
};

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const SAFE_IMAGE_DATA = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);/i;

// Caracteres que o navegador ignora dentro de URLs (controles, espaços) e que
// poderiam esconder um esquema perigoso, como "java\tscript:".
function stripIgnorable(url) {
  let out = '';
  for (const ch of url) {
    const code = ch.codePointAt(0);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
  }
  return out;
}

function schemeOf(url) {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(stripIgnorable(url));
  return m ? m[1].toLowerCase() : null;
}

/**
 * Diz se uma URL pode ir para href (kind "link") ou src (kind "image").
 * Permite caminhos relativos, âncoras e os esquemas http, https, mailto e tel;
 * imagens também podem usar data: com tipos de bitmap. Bloqueia javascript:,
 * vbscript:, file:, data: em links e qualquer outro esquema.
 */
export function isSafeUrl(url, kind = 'link') {
  const candidates = [url];
  try {
    candidates.push(decodeURIComponent(url));
  } catch {
    // sequência % inválida: basta checar a forma original
  }
  for (const candidate of candidates) {
    const scheme = schemeOf(candidate);
    if (scheme === null || SAFE_SCHEMES.has(scheme)) continue;
    if (kind === 'image' && scheme === 'data' && SAFE_IMAGE_DATA.test(stripIgnorable(candidate))) continue;
    return false;
  }
  return true;
}

export function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

// Texto comum: preserva referências de entidade já válidas (&nbsp;, &#233;) e escapa o resto.
const reTextSpecial = /&(?:#[xX][a-fA-F0-9]{1,6};|#[0-9]{1,7};|[A-Za-z][A-Za-z0-9]{1,31};)?|[<>]/g;

function escapeText(text) {
  return text.replace(reTextSpecial, (m) => (m === '<' ? '&lt;' : m === '>' ? '&gt;' : m === '&' ? '&amp;' : m));
}

const reOpenTag = /<([A-Za-z][A-Za-z0-9-]*)((?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?)*)\s*\/?>/y;
const reCloseTag = /<\/([A-Za-z][A-Za-z0-9-]*)\s*>/y;
const reAttribute = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:([^"'=<>`\x00-\x20]+)|'([^']*)'|"([^"]*)"))?/g;

function rebuildOpenTag(name, rawAttrs) {
  const allowed = ALLOWED[name];
  let out = '<' + name;
  const seen = new Set();
  reAttribute.lastIndex = 0;
  let m;
  while ((m = reAttribute.exec(rawAttrs)) !== null) {
    const attr = m[1].toLowerCase();
    if (seen.has(attr)) continue;
    seen.add(attr);
    if (!allowed.includes(attr) && !GLOBAL_ATTRS.includes(attr)) continue;
    if (BOOLEAN_ATTRS.has(attr)) {
      out += ' ' + attr;
      continue;
    }
    const raw = m[2] ?? m[3] ?? m[4] ?? '';
    const value = decodeEntities(raw);
    if (attr === 'href' && !isSafeUrl(value, 'link')) continue;
    if (attr === 'src' && !isSafeUrl(value, 'image')) continue;
    const check = VALIDATORS[attr];
    if (check && !check(value)) continue;
    out += ` ${attr}="${escapeHtml(value)}"`;
  }
  return out + (VOID_TAGS.has(name) ? ' />' : '>');
}

/**
 * Limpa um trecho de HTML: mantém só etiquetas e atributos permitidos, remove
 * comentários e escapa todo o resto. O resultado é sempre bem formado no nível
 * de etiquetas, então trechos limpos podem ser concatenados com segurança.
 */
export function sanitizeHtml(html) {
  let out = '';
  let i = 0;
  const n = html.length;
  // posição do próximo "-->"; reaproveitada para que muitos "<!--" sem fim não
  // deixem a limpeza quadrática
  let commentEnd = -2;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(html.slice(i));
      break;
    }
    out += escapeText(html.slice(i, lt));
    i = lt;
    if (html.startsWith('<!--', i)) {
      let end = -1;
      if (html.startsWith('<!-->', i)) end = i + 5;
      else if (html.startsWith('<!--->', i)) end = i + 6;
      else {
        if (commentEnd !== -1 && commentEnd < i + 4) commentEnd = html.indexOf('-->', i + 4);
        if (commentEnd !== -1) end = commentEnd + 3;
      }
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    reOpenTag.lastIndex = i;
    let m = reOpenTag.exec(html);
    if (m !== null) {
      const name = m[1].toLowerCase();
      out += Object.hasOwn(ALLOWED, name) ? rebuildOpenTag(name, m[2]) : escapeText(m[0]);
      i = reOpenTag.lastIndex;
      continue;
    }
    reCloseTag.lastIndex = i;
    m = reCloseTag.exec(html);
    if (m !== null) {
      const name = m[1].toLowerCase();
      out += Object.hasOwn(ALLOWED, name) && !VOID_TAGS.has(name) ? `</${name}>` : escapeText(m[0]);
      i = reCloseTag.lastIndex;
      continue;
    }
    out += '&lt;';
    i += 1;
  }
  return out;
}
