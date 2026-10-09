// Interface do editor: liga o textarea, a pré-visualização, a barra de ferramentas,
// os atalhos, a rolagem sincronizada, o salvamento automático e a exportação.

import { parse, render, documentStats, documentTitle } from './markdown.js';
import * as edit from './editing.js';
import { MARKDOWN_CSS, buildStandaloneHtml, fileNameFor } from './export.js';

const STORAGE_TEXT = 'editor-markdown:texto';
const STORAGE_PREFS = 'editor-markdown:preferencias';
const ID_PREFIX = 'md-';
const MAX_FILE = 5 * 1024 * 1024;

const SAMPLE = [
  '# Bem-vindo ao Editor Markdown',
  '',
  'Escreva à esquerda e veja o resultado à direita. O texto fica salvo **automaticamente** no seu navegador, então dá para fechar a aba sem medo.',
  '',
  '## Formatação básica',
  '',
  'Você pode usar *itálico*, **negrito**, ***os dois juntos***, ~~tachado~~ e `código no meio da frase`.',
  'Links ficam assim: [especificação CommonMark](https://spec.commonmark.org/ "Página da especificação").',
  'Endereços soltos como www.example.com e https://example.com viram links sozinhos.',
  '',
  '> Citações aceitam **qualquer** outro elemento.',
  '>',
  '> - inclusive listas',
  '> - e `código`',
  '',
  '## Listas',
  '',
  '1. Primeiro passo',
  '2. Segundo passo',
  '   - um subitem',
  '   - outro subitem',
  '3. Terceiro passo',
  '',
  '### Tarefas',
  '',
  '- [x] Escrever o rascunho',
  '- [ ] Revisar o texto (clique na caixa ao lado, na pré-visualização)',
  '- [ ] Exportar para PDF',
  '',
  '## Tabela',
  '',
  '| Recurso | Atalho | Markdown       |',
  '| :------ | :----: | -------------: |',
  '| Negrito | Ctrl+B | `**texto**`    |',
  '| Itálico | Ctrl+I | `*texto*`      |',
  '| Link    | Ctrl+K | `[texto](url)` |',
  '',
  'O botão de tabela da barra cria uma tabela nova e o botão ao lado realinha as colunas.',
  '',
  '## Código',
  '',
  '```js',
  'function saudacao(nome) {',
  '  return `Olá, ${nome}!`;',
  '}',
  '```',
  '',
  '---',
  '',
  'Pronto para começar? Clique em **Novo** ou arraste um arquivo `.md` para o editor.',
  '',
].join('\n');

const $ = (id) => document.getElementById(id);
const editor = $('editor');
const preview = $('preview');
const previewScroll = $('preview-scroll');
const workspace = $('workspace');
const stats = $('stats');
const saveStatus = $('save-status');
const message = $('message');
const htmlMode = $('html-mode');
const syncBox = $('sync-scroll');
const fileInput = $('file-input');
const tableDialog = $('table-dialog');
const tableForm = $('table-form');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const prefs = { html: 'escape', sync: true, view: 'split' };
let currentFile = null;
let lastDoc = null;

// O mesmo CSS do arquivo exportado deixa a pré-visualização idêntica ao resultado.
const docStyle = document.createElement('style');
docStyle.textContent = MARKDOWN_CSS;
document.head.append(docStyle);

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

let messageTimer = 0;
function say(text, tone = 'ok') {
  message.textContent = text;
  message.dataset.tone = tone;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    message.textContent = '';
  }, 7000);
}

// ---------------------------------------------------------------------------
// Renderização e estatísticas
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat('pt-BR');

function updateStats(source, doc) {
  const s = documentStats(source, doc);
  const plural = (n, one, many) => `${numberFormat.format(n)} ${n === 1 ? one : many}`;
  stats.textContent = [
    plural(s.words, 'palavra', 'palavras'),
    plural(s.chars, 'caractere', 'caracteres'),
    plural(s.lines, 'linha', 'linhas'),
    `${s.minutes} min de leitura`,
  ].join(' · ');
}

function enableTaskCheckboxes() {
  for (const box of preview.querySelectorAll('li.task-list-item input[type="checkbox"]')) {
    const li = box.closest('li');
    if (!li || li.dataset.line === undefined) continue;
    box.disabled = false;
    box.dataset.line = li.dataset.line;
    const label = li.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
    box.setAttribute('aria-label', label ? `Tarefa: ${label}` : 'Tarefa');
  }
}

let renderTimer = 0;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, editor.value.length > 200000 ? 250 : 50);
}

function renderNow() {
  clearTimeout(renderTimer);
  const source = editor.value;
  const doc = parse(source);
  lastDoc = doc;
  // A saída do renderizador já vem escapada: texto do usuário nunca vira HTML ativo.
  preview.innerHTML = render(doc, { html: prefs.html, headingIds: true, idPrefix: ID_PREFIX, sourceLines: true });
  enableTaskCheckboxes();
  updateStats(source, doc);
  sync.previewDirty = true;
  if (prefs.sync && !sync.suspended) syncPreviewToEditor(true);
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    saveStatus.textContent = storageSet(STORAGE_TEXT, editor.value)
      ? `Salvo no navegador às ${time}`
      : 'Não foi possível salvar no navegador';
  }, 500);
}

function onInput() {
  sync.editorDirty = true;
  scheduleRender();
  scheduleSave();
}

// ---------------------------------------------------------------------------
// Edição preservando o desfazer (Ctrl+Z)
// ---------------------------------------------------------------------------

function replaceText(next, selStart, selEnd = selStart) {
  const prev = editor.value;
  editor.focus({ preventScroll: true });
  if (prev !== next) {
    // troca só o trecho que mudou, para o histórico de desfazer ficar enxuto
    const max = Math.min(prev.length, next.length);
    let a = 0;
    while (a < max && prev.charCodeAt(a) === next.charCodeAt(a)) a++;
    let b = 0;
    while (b < max - a && prev.charCodeAt(prev.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++;
    editor.setSelectionRange(a, prev.length - b);
    let done = false;
    try {
      done = document.execCommand('insertText', false, next.slice(a, next.length - b));
    } catch {
      done = false;
    }
    if (!done || editor.value !== next) editor.value = next;
    onInput();
  }
  editor.setSelectionRange(selStart, selEnd);
}

function applyEdit(r) {
  if (!r) return false;
  replaceText(r.text, r.start, r.end);
  return true;
}

const runEdit = (fn) => applyEdit(fn(editor.value, editor.selectionStart, editor.selectionEnd));

const commands = {
  bold: () => runEdit((t, s, e) => edit.toggleInline(t, s, e, '**', 'negrito')),
  italic: () => runEdit((t, s, e) => edit.toggleInline(t, s, e, '*', 'itálico')),
  strike: () => runEdit((t, s, e) => edit.toggleInline(t, s, e, '~~', 'tachado')),
  code: () => runEdit((t, s, e) => edit.toggleInline(t, s, e, '`', 'código')),
  h1: () => runEdit((t, s, e) => edit.setHeading(t, s, e, 1)),
  h2: () => runEdit((t, s, e) => edit.setHeading(t, s, e, 2)),
  h3: () => runEdit((t, s, e) => edit.setHeading(t, s, e, 3)),
  quote: () => runEdit((t, s, e) => edit.toggleLinePrefix(t, s, e, 'quote')),
  bullet: () => runEdit((t, s, e) => edit.toggleLinePrefix(t, s, e, 'bullet')),
  ordered: () => runEdit((t, s, e) => edit.toggleLinePrefix(t, s, e, 'ordered')),
  task: () => runEdit((t, s, e) => edit.toggleLinePrefix(t, s, e, 'task')),
  link: () => runEdit((t, s, e) => edit.insertLink(t, s, e)),
  image: () => runEdit((t, s, e) => edit.insertLink(t, s, e, true)),
  codeblock: () => runEdit((t, s, e) => edit.insertCodeBlock(t, s, e)),
  rule: () => runEdit((t, s, e) => edit.insertRule(t, s, e)),
  table: () => openTableDialog(),
  formattable: () => {
    const r = edit.formatTableAt(editor.value, editor.selectionStart);
    if (r) {
      applyEdit(r);
      say('Tabela alinhada.');
    } else {
      say('Coloque o cursor dentro de uma tabela para alinhar as colunas.', 'warn');
    }
  },
};

const toolbar = document.querySelector('.toolbar');
const tools = [...toolbar.querySelectorAll('button')];
tools.forEach((b, i) => b.setAttribute('tabindex', i === 0 ? '0' : '-1'));

toolbar.addEventListener('click', (ev) => {
  const button = ev.target.closest('button[data-cmd]');
  if (!button) return;
  tools.forEach((b) => b.setAttribute('tabindex', b === button ? '0' : '-1'));
  commands[button.dataset.cmd]?.();
});

// Navegação por setas dentro da barra (padrão de toolbar acessível)
toolbar.addEventListener('keydown', (ev) => {
  const i = tools.indexOf(document.activeElement);
  if (i === -1) return;
  let j = -1;
  if (ev.key === 'ArrowRight') j = (i + 1) % tools.length;
  else if (ev.key === 'ArrowLeft') j = (i - 1 + tools.length) % tools.length;
  else if (ev.key === 'Home') j = 0;
  else if (ev.key === 'End') j = tools.length - 1;
  if (j === -1) return;
  ev.preventDefault();
  tools[i].setAttribute('tabindex', '-1');
  tools[j].setAttribute('tabindex', '0');
  tools[j].focus();
});

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------

let escapeArmed = false;
const reListLine = /^\s*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

function handleTab(outdent) {
  const { value, selectionStart: s, selectionEnd: e } = editor;
  const from = value.lastIndexOf('\n', s - 1) + 1;
  const lineEnd = value.indexOf('\n', s);
  const line = value.slice(from, lineEnd === -1 ? value.length : lineEnd);
  if (outdent || s !== e || reListLine.test(line)) {
    applyEdit(edit.indentLines(value, s, e, outdent));
  } else {
    replaceText(value.slice(0, s) + '  ' + value.slice(e), s + 2);
  }
}

editor.addEventListener('keydown', (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;
  if (ev.key === 'Escape') {
    escapeArmed = true;
    say('Agora Tab sai do editor.', 'ok');
    return;
  }
  if (ev.key === 'Tab' && !mod && !ev.altKey) {
    if (escapeArmed) {
      escapeArmed = false;
      return;
    }
    ev.preventDefault();
    handleTab(ev.shiftKey);
    return;
  }
  escapeArmed = false;
  if (ev.key === 'Enter' && !mod && !ev.shiftKey && !ev.altKey && !ev.isComposing) {
    if (editor.selectionStart === editor.selectionEnd) {
      const r = edit.continueList(editor.value, editor.selectionStart);
      if (r) {
        ev.preventDefault();
        applyEdit(r);
      }
    }
    return;
  }
  if (!mod || ev.altKey) return;
  const key = ev.key.toLowerCase();
  const action = ev.shiftKey
    ? { x: 'strike' }[key]
    : { b: 'bold', i: 'italic', k: 'link', e: 'code' }[key];
  if (action) {
    ev.preventDefault();
    commands[action]();
  }
});

editor.addEventListener('blur', () => {
  escapeArmed = false;
});

document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 's') {
    ev.preventDefault();
    saveMarkdown();
  }
});

editor.addEventListener('input', onInput);

// ---------------------------------------------------------------------------
// Rolagem sincronizada
// ---------------------------------------------------------------------------
// Cada bloco renderizado carrega data-line (a linha de origem). Um espelho invisível
// do textarea mede onde cada linha começa (considerando a quebra automática). Com as
// duas tabelas, a posição de um painel é convertida em linha e a linha na posição do
// outro, interpolando entre os blocos vizinhos.

const sync = {
  editorTops: null,
  editorDirty: true,
  blocks: null,
  previewDirty: true,
  expectEditor: null,
  expectPreview: null,
  suspended: false,
  frame: 0,
};

const mirror = document.createElement('div');
mirror.className = 'editor-mirror';
mirror.setAttribute('aria-hidden', 'true');
document.body.append(mirror);

function measureEditor() {
  const cs = getComputedStyle(editor);
  for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'tabSize']) {
    mirror.style[prop] = cs[prop];
  }
  mirror.style.width = `${editor.clientWidth}px`;
  const lines = editor.value.split('\n');
  const frag = document.createDocumentFragment();
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line === '' ? ' ' : line;
    frag.append(div);
  }
  mirror.replaceChildren(frag);
  const tops = new Float64Array(lines.length + 1);
  let i = 0;
  for (const div of mirror.children) tops[i++] = div.offsetTop;
  tops[lines.length] = mirror.scrollHeight - parseFloat(cs.paddingBottom);
  mirror.replaceChildren();
  sync.editorTops = tops;
  sync.editorPad = parseFloat(cs.paddingTop);
  sync.editorDirty = false;
}

function measurePreview() {
  const base = previewScroll.getBoundingClientRect().top - previewScroll.scrollTop;
  const blocks = [];
  let lastLine = -1;
  let lastTop = -Infinity;
  for (const el of preview.querySelectorAll('[data-line]')) {
    const line = Number(el.dataset.line);
    const top = el.getBoundingClientRect().top - base;
    if (line > lastLine && top >= lastTop) {
      blocks.push({ line, top });
      lastLine = line;
      lastTop = top;
    }
  }
  sync.blocks = blocks;
  sync.previewPad = parseFloat(getComputedStyle(previewScroll).paddingTop);
  sync.previewDirty = false;
}

// cheap = true reaproveita a medição antiga do editor (usado a cada renderização,
// para não recriar o espelho inteiro a cada tecla); a rolagem seguinte remede.
function ensureMeasured(cheap = false) {
  if (!sync.editorTops || (sync.editorDirty && !cheap)) measureEditor();
  if (sync.previewDirty || !sync.blocks) measurePreview();
}

function editorLineAtTop() {
  const tops = sync.editorTops;
  const y = editor.scrollTop + sync.editorPad;
  let lo = 0;
  let hi = tops.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  const h = tops[lo + 1] - tops[lo];
  return lo + (h > 0 ? Math.min(1, Math.max(0, (y - tops[lo]) / h)) : 0);
}

function previewTopForLine(line) {
  const blocks = sync.blocks;
  const total = (sync.editorTops?.length ?? 1) - 1;
  let prev = { line: 0, top: 0 };
  let next = { line: total, top: previewScroll.scrollHeight };
  for (const b of blocks) {
    if (b.line <= line) prev = b;
    else {
      next = b;
      break;
    }
  }
  const span = next.line - prev.line;
  const t = span > 0 ? (line - prev.line) / span : 0;
  return prev.top + t * (next.top - prev.top);
}

function lineForPreviewTop(top) {
  const blocks = sync.blocks;
  const total = (sync.editorTops?.length ?? 1) - 1;
  let prev = { line: 0, top: 0 };
  let next = { line: total, top: previewScroll.scrollHeight };
  for (const b of blocks) {
    if (b.top <= top) prev = b;
    else {
      next = b;
      break;
    }
  }
  const span = next.top - prev.top;
  const t = span > 0 ? (top - prev.top) / span : 0;
  return prev.line + t * (next.line - prev.line);
}

function syncPreviewToEditor(cheap = false) {
  if (prefs.view !== 'split' || !prefs.sync) return;
  ensureMeasured(cheap);
  let target;
  if (editor.scrollTop <= 0) target = 0;
  else if (editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 2) target = previewScroll.scrollHeight;
  else target = previewTopForLine(editorLineAtTop()) - sync.previewPad;
  previewScroll.scrollTop = target;
  sync.expectPreview = previewScroll.scrollTop;
}

function syncEditorToPreview() {
  if (prefs.view !== 'split' || !prefs.sync) return;
  ensureMeasured();
  let target;
  if (previewScroll.scrollTop <= 0) target = 0;
  else if (previewScroll.scrollTop + previewScroll.clientHeight >= previewScroll.scrollHeight - 2) target = editor.scrollHeight;
  else {
    const line = lineForPreviewTop(previewScroll.scrollTop + sync.previewPad);
    const tops = sync.editorTops;
    const i = Math.min(Math.floor(line), tops.length - 2);
    target = tops[i] + (line - i) * (tops[i + 1] - tops[i]) - sync.editorPad;
  }
  editor.scrollTop = target;
  sync.expectEditor = editor.scrollTop;
}

function onScroll(source) {
  if (!prefs.sync || sync.suspended) return;
  if (source === 'editor') {
    if (sync.expectEditor !== null && Math.abs(editor.scrollTop - sync.expectEditor) < 1) {
      sync.expectEditor = null;
      return;
    }
    sync.expectEditor = null;
  } else {
    if (sync.expectPreview !== null && Math.abs(previewScroll.scrollTop - sync.expectPreview) < 1) {
      sync.expectPreview = null;
      return;
    }
    sync.expectPreview = null;
  }
  cancelAnimationFrame(sync.frame);
  sync.frame = requestAnimationFrame(() => (source === 'editor' ? syncPreviewToEditor(false) : syncEditorToPreview()));
}

editor.addEventListener('scroll', () => onScroll('editor'), { passive: true });
previewScroll.addEventListener('scroll', () => onScroll('preview'), { passive: true });
preview.addEventListener('load', () => {
  sync.previewDirty = true;
}, true);

if ('ResizeObserver' in window) {
  new ResizeObserver(() => {
    sync.editorDirty = true;
    sync.previewDirty = true;
  }).observe(workspace);
}

// ---------------------------------------------------------------------------
// Pré-visualização: links e tarefas clicáveis
// ---------------------------------------------------------------------------

preview.addEventListener('click', (ev) => {
  const a = ev.target.closest('a');
  if (!a || !preview.contains(a)) return;
  ev.preventDefault();
  const href = a.getAttribute('href');
  if (href === null) return;
  if (href.startsWith('#')) {
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // mantém o id como está
    }
    const target = document.getElementById(ID_PREFIX + id);
    if (target && preview.contains(target)) {
      // rola só o painel da pré-visualização, sem mexer na página
      const top = target.getBoundingClientRect().top - previewScroll.getBoundingClientRect().top + previewScroll.scrollTop - 8;
      previewScroll.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    return;
  }
  window.open(a.href, '_blank', 'noopener,noreferrer');
});

preview.addEventListener('change', (ev) => {
  const box = ev.target;
  if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox' || box.dataset.line === undefined) return;
  const line = box.dataset.line;
  const r = edit.toggleTaskAtLine(editor.value, Number(line));
  if (!r) return;
  const keep = { editor: editor.scrollTop, preview: previewScroll.scrollTop };
  const sel = [editor.selectionStart, editor.selectionEnd];
  sync.suspended = true;
  replaceText(r.text, sel[0], sel[1]);
  renderNow();
  editor.scrollTop = keep.editor;
  previewScroll.scrollTop = keep.preview;
  const again = preview.querySelector(`input[data-line="${Number(line)}"]`);
  if (again) again.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    sync.suspended = false;
  });
});

// ---------------------------------------------------------------------------
// Arquivos: abrir, arrastar e soltar, salvar e exportar
// ---------------------------------------------------------------------------

async function openFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE) {
    say('Arquivo grande demais: o limite é 5 MB.', 'error');
    return;
  }
  if (!/\.(?:md|markdown|mdown|mkd|txt)$/i.test(file.name) && !/^text\//.test(file.type)) {
    say('Esse arquivo não parece texto. Use um arquivo .md ou .txt.', 'error');
    return;
  }
  const text = (await file.text()).replace(/\r\n?/g, '\n');
  replaceText(text, 0);
  editor.scrollTop = 0;
  currentFile = file.name;
  renderNow();
  say(`Arquivo "${file.name}" aberto. Ctrl+Z volta ao texto anterior.`);
}

$('btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  openFile(fileInput.files[0]);
  fileInput.value = '';
});

let dragDepth = 0;
workspace.addEventListener('dragenter', (ev) => {
  if (![...(ev.dataTransfer?.types ?? [])].includes('Files')) return;
  ev.preventDefault();
  dragDepth += 1;
  workspace.classList.add('dragging');
});
workspace.addEventListener('dragover', (ev) => {
  if ([...(ev.dataTransfer?.types ?? [])].includes('Files')) ev.preventDefault();
});
workspace.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) workspace.classList.remove('dragging');
});
workspace.addEventListener('drop', (ev) => {
  dragDepth = 0;
  workspace.classList.remove('dragging');
  const file = ev.dataTransfer?.files?.[0];
  if (!file) return;
  ev.preventDefault();
  openFile(file);
});

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function currentTitle() {
  return documentTitle(lastDoc ?? parse(editor.value));
}

function exportName(ext) {
  if (currentFile) return currentFile.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|]+/g, '-') + '.' + ext;
  return fileNameFor(currentTitle(), ext);
}

function saveMarkdown() {
  const name = exportName('md');
  download(name, editor.value, 'text/markdown;charset=utf-8');
  say(`Arquivo ${name} gerado.`);
}

function cleanHtml() {
  return render(parse(editor.value), { html: prefs.html, headingIds: true });
}

$('btn-save-md').addEventListener('click', saveMarkdown);

$('btn-export-html').addEventListener('click', () => {
  const name = exportName('html');
  const title = currentTitle() || name.replace(/\.html$/, '');
  download(name, buildStandaloneHtml({ title, body: cleanHtml() }), 'text/html;charset=utf-8');
  say(`Arquivo ${name} gerado, com o CSS embutido.`);
});

$('btn-copy-html').addEventListener('click', async () => {
  const html = cleanHtml();
  try {
    await navigator.clipboard.writeText(html);
    say('HTML copiado para a área de transferência.');
  } catch {
    const area = document.createElement('textarea');
    area.value = html;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    say(ok ? 'HTML copiado para a área de transferência.' : 'Não foi possível copiar automaticamente.', ok ? 'ok' : 'error');
  }
});

$('btn-print').addEventListener('click', () => {
  renderNow();
  say('Na janela de impressão, escolha "Salvar como PDF" para gerar o arquivo.');
  window.print();
});

// Ações que trocam o texto inteiro pedem um segundo clique de confirmação.
function confirmable(button, confirmLabel, action) {
  const original = button.textContent;
  let armedUntil = 0;
  let timer = 0;
  const reset = () => {
    armedUntil = 0;
    button.textContent = original;
    button.classList.remove('danger');
  };
  button.addEventListener('click', () => {
    const needsConfirm = editor.value.trim() !== '' && editor.value !== SAMPLE;
    if (needsConfirm && Date.now() > armedUntil) {
      armedUntil = Date.now() + 5000;
      button.textContent = confirmLabel;
      button.classList.add('danger');
      say('Clique de novo para confirmar. Depois, Ctrl+Z ainda recupera o texto.', 'warn');
      clearTimeout(timer);
      timer = setTimeout(reset, 5000);
      return;
    }
    clearTimeout(timer);
    reset();
    action();
  });
}

confirmable($('btn-new'), 'Confirmar: novo', () => {
  replaceText('', 0);
  currentFile = null;
  renderNow();
  say('Documento novo.');
});

confirmable($('btn-sample'), 'Confirmar: exemplo', () => {
  replaceText(SAMPLE, 0);
  editor.scrollTop = 0;
  currentFile = null;
  renderNow();
  say('Exemplo carregado.');
});

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

const tableCols = $('table-cols');
const tableRows = $('table-rows');
const tableAlign = $('table-align');
const tablePreview = $('table-preview');
const clampInt = (v, lo, hi, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : Math.min(hi, Math.max(lo, n));
};

function updateTablePreview() {
  const cols = clampInt(tableCols.value, 1, 20, 3);
  const rows = clampInt(tableRows.value, 0, 100, 2);
  tablePreview.textContent = edit.buildTable(Math.min(rows, 3), cols, tableAlign.value || null)
    + (rows > 3 ? `\n(mais ${rows - 3} linhas)` : '');
}

function openTableDialog() {
  updateTablePreview();
  if (typeof tableDialog.showModal === 'function') tableDialog.showModal();
  else say('Seu navegador não abre caixas de diálogo; atualize-o para usar o assistente de tabela.', 'error');
}

tableForm.addEventListener('input', updateTablePreview);
tableDialog.addEventListener('close', () => {
  if (tableDialog.returnValue !== 'ok') {
    editor.focus();
    return;
  }
  const cols = clampInt(tableCols.value, 1, 20, 3);
  const rows = clampInt(tableRows.value, 0, 100, 2);
  applyEdit(edit.insertTable(editor.value, editor.selectionStart, editor.selectionEnd, rows, cols, tableAlign.value || null));
  say('Tabela inserida. Escreva nas células e use o botão de alinhar para arrumar as colunas.');
});

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

function savePrefs() {
  storageSet(STORAGE_PREFS, JSON.stringify(prefs));
}

function applyView(view) {
  prefs.view = ['split', 'editor', 'preview'].includes(view) ? view : 'split';
  workspace.dataset.view = prefs.view;
  for (const b of document.querySelectorAll('.seg')) b.setAttribute('aria-pressed', String(b.dataset.view === prefs.view));
  sync.editorDirty = true;
  sync.previewDirty = true;
}

for (const b of document.querySelectorAll('.seg')) {
  b.addEventListener('click', () => {
    applyView(b.dataset.view);
    savePrefs();
    if (prefs.view !== 'preview') editor.focus({ preventScroll: true });
  });
}

htmlMode.addEventListener('change', () => {
  prefs.html = htmlMode.value === 'sanitize' ? 'sanitize' : 'escape';
  savePrefs();
  renderNow();
  say(prefs.html === 'sanitize'
    ? 'HTML do texto liberado, só com etiquetas e atributos seguros.'
    : 'HTML do texto aparece como texto comum.');
});

syncBox.addEventListener('change', () => {
  prefs.sync = syncBox.checked;
  savePrefs();
  if (prefs.sync) syncPreviewToEditor();
});

function loadPrefs() {
  try {
    const saved = JSON.parse(storageGet(STORAGE_PREFS) ?? '{}');
    if (saved && typeof saved === 'object') {
      if (saved.html === 'sanitize') prefs.html = 'sanitize';
      if (saved.sync === false) prefs.sync = false;
      if (typeof saved.view === 'string') prefs.view = saved.view;
    }
  } catch {
    // preferências corrompidas: ficam as padrão
  }
  htmlMode.value = prefs.html;
  syncBox.checked = prefs.sync;
  applyView(prefs.view);
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

loadPrefs();
const saved = storageGet(STORAGE_TEXT);
editor.value = saved ?? SAMPLE;
if (saved !== null) saveStatus.textContent = 'Texto recuperado do navegador';
renderNow();
