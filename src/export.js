// Exportação: o mesmo CSS serve a pré-visualização e o arquivo HTML exportado,
// então o documento sai do editor com a mesma aparência que tinha na tela.

import { escapeHtml } from './sanitize.js';

export const MARKDOWN_CSS = `
.markdown-body {
  --md-bg: #ffffff;
  --md-text: #1f2328;
  --md-muted: #59636e;
  --md-border: #d1d9e0;
  --md-soft: #f6f8fa;
  --md-link: #0b57d0;
  --md-code-bg: #eff2f5;
  --md-mark: #fff3a3;
  color: var(--md-text);
  background: var(--md-bg);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 1rem;
  line-height: 1.65;
  overflow-wrap: break-word;
}
@media (prefers-color-scheme: dark) {
  .markdown-body {
    --md-bg: #0f1115;
    --md-text: #e6e9ee;
    --md-muted: #9aa3af;
    --md-border: #30363d;
    --md-soft: #161b22;
    --md-link: #7cb4ff;
    --md-code-bg: #1f2530;
    --md-mark: #5c4d00;
  }
}
.markdown-body > :first-child { margin-top: 0; }
.markdown-body > :last-child { margin-bottom: 0; }
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin: 1.6em 0 0.6em;
  line-height: 1.25;
  font-weight: 650;
}
.markdown-body h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: 0.875em; }
.markdown-body h6 { font-size: 0.85em; color: var(--md-muted); }
.markdown-body p, .markdown-body blockquote, .markdown-body ul, .markdown-body ol,
.markdown-body dl, .markdown-body table, .markdown-body pre, .markdown-body details {
  margin: 0 0 1em;
}
.markdown-body a { color: var(--md-link); text-underline-offset: 0.15em; }
.markdown-body a:not([href]) { color: inherit; text-decoration: none; }
.markdown-body strong { font-weight: 650; }
.markdown-body ul, .markdown-body ol { padding-left: 2em; }
.markdown-body li + li, .markdown-body li > ul, .markdown-body li > ol { margin-top: 0.25em; }
.markdown-body li > ul, .markdown-body li > ol { margin-bottom: 0; }
.markdown-body li > p { margin-top: 0.75em; }
.markdown-body li.task-list-item { list-style: none; }
.markdown-body li.task-list-item input { margin: 0 0.35em 0.2em -1.5em; vertical-align: middle; }
.markdown-body blockquote {
  padding: 0 1em;
  color: var(--md-muted);
  border-left: 0.25em solid var(--md-border);
}
.markdown-body code, .markdown-body kbd, .markdown-body pre, .markdown-body samp {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.875em;
}
.markdown-body code {
  padding: 0.15em 0.35em;
  background: var(--md-code-bg);
  border-radius: 6px;
}
.markdown-body pre {
  padding: 1em;
  overflow: auto;
  line-height: 1.45;
  background: var(--md-soft);
  border: 1px solid var(--md-border);
  border-radius: 8px;
}
.markdown-body pre code { padding: 0; background: none; border-radius: 0; font-size: 1em; }
.markdown-body kbd {
  padding: 0.1em 0.4em;
  border: 1px solid var(--md-border);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--md-soft);
}
.markdown-body hr { height: 0; margin: 1.5em 0; border: 0; border-top: 1px solid var(--md-border); }
.markdown-body img { max-width: 100%; height: auto; }
.markdown-body table { display: block; width: max-content; max-width: 100%; overflow: auto; border-collapse: collapse; }
.markdown-body th, .markdown-body td { padding: 0.4em 0.8em; border: 1px solid var(--md-border); }
.markdown-body th { font-weight: 650; background: var(--md-soft); }
.markdown-body tbody tr:nth-child(2n) { background: var(--md-soft); }
.markdown-body mark { background: var(--md-mark); color: inherit; }
.markdown-body del { color: var(--md-muted); }
.markdown-body details { padding: 0.5em 0.75em; border: 1px solid var(--md-border); border-radius: 8px; }
.markdown-body summary { cursor: pointer; font-weight: 600; }
.markdown-body .raw-html {
  padding: 0.5em 0.75em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.85em;
  white-space: pre-wrap;
  color: var(--md-muted);
  background: var(--md-soft);
  border-left: 3px solid var(--md-border);
}
@media print {
  .markdown-body {
    --md-bg: #ffffff; --md-text: #000000; --md-muted: #444444; --md-border: #bbbbbb;
    --md-soft: #f3f3f3; --md-link: #000000; --md-code-bg: #eeeeee; --md-mark: #fff3a3;
  }
  .markdown-body pre { white-space: pre-wrap; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 { break-after: avoid; }
  .markdown-body pre, .markdown-body table, .markdown-body img, .markdown-body blockquote { break-inside: avoid; }
}
`;

/** Nome de arquivo a partir do título: sem acentos, minúsculo e com hífens. */
export function fileNameFor(title, ext) {
  const base = String(title || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return `${base || 'documento'}.${ext}`;
}

/** Monta um arquivo HTML completo, com o CSS embutido e nenhuma dependência externa. */
export function buildStandaloneHtml({ title, body, lang = 'pt-BR' }) {
  const safeTitle = escapeHtml(title || 'Documento');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; background: #ffffff; }
@media (prefers-color-scheme: dark) { body { background: #0f1115; } }
.page { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
@media print { body { background: #ffffff; } .page { max-width: none; padding: 0; } }
${MARKDOWN_CSS.trim()}
</style>
</head>
<body>
<article class="markdown-body page">
${body.trimEnd()}
</article>
</body>
</html>
`;
}
