import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, copyWithToast, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';
import { openToolFullscreen } from '../../shared/toolUi.js';

export const metadata = {
  id: 'markdown-previewer',
  name: 'Markdown Previewer',
  category: 'previewers',
  icon: 'markdown-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'markdown', 'gfm', 'toc'],
  keywords: ['markdown', 'preview', 'toc', 'code block', 'gfm']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
const STYLES_ID = 'toolary-markdown-previewer-styles';

function ensureStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    #toolary-markdown-previewer .toolary-md-preview p {
      margin: .35rem 0;
      line-height: 1.5;
    }
    #toolary-markdown-previewer .toolary-md-preview h1,
    #toolary-markdown-previewer .toolary-md-preview h2,
    #toolary-markdown-previewer .toolary-md-preview h3,
    #toolary-markdown-previewer .toolary-md-preview h4,
    #toolary-markdown-previewer .toolary-md-preview h5,
    #toolary-markdown-previewer .toolary-md-preview h6 {
      margin: .75rem 0 .35rem;
      line-height: 1.25;
    }
    #toolary-markdown-previewer .toolary-md-preview code {
      padding: 1px 5px;
      border-radius: 6px;
      background: rgba(127, 127, 127, .15);
    }
    #toolary-markdown-previewer .toolary-md-preview .toolary-md-code {
      margin: .6rem 0;
      padding: 10px;
      border-radius: 10px;
      overflow: auto;
      background: color-mix(in srgb, var(--toolary-preview-bg) 80%, #0f172a 20%);
      color: var(--toolary-preview-text);
      border: 1px solid var(--toolary-preview-border);
    }
    .toolary-md-gap {
      height: 6px;
    }
    .toolary-md-toc-link {
      display: block;
    }
    .toolary-md-toc-link.level-1 { padding-left: 0; }
    .toolary-md-toc-link.level-2 { padding-left: 12px; }
    .toolary-md-toc-link.level-3 { padding-left: 24px; }
    .toolary-md-toc-link.level-4 { padding-left: 36px; }
    .toolary-md-toc-link.level-5 { padding-left: 48px; }
    .toolary-md-toc-link.level-6 { padding-left: 60px; }
    .toolary-md-preview-layout {
      grid-template-rows: auto 1fr;
    }
    .toolary-md-summary-grid {
      grid-template-columns: 220px 1fr;
      gap: 8px;
    }
    .toolary-md-toc {
      padding: 8px;
      max-height: 200px;
    }
    .toolary-md-toc-content {
      display: grid;
      gap: 4px;
      margin-top: 6px;
    }
    .toolary-md-hint {
      display: flex;
      align-items: center;
    }
    .toolary-md-preview-surface {
      min-height: 350px;
      max-height: 56vh;
      padding: 12px;
    }
  `;
  document.head.appendChild(style);
}

async function openPreviewFullscreen() {
  const preview = panel?.querySelector('#toolary-md-preview');
  if (!preview) return;
  if (openToolFullscreen(preview)) return;
  showError(t('toolUiFullscreenNotSupported') || 'Fullscreen is not supported on this page.');
}

function inlineMarkdown(text) {
  return String(text || '')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function markdownToHtml(markdown) {
  const input = escapeHtml(String(markdown || ''));
  const lines = input.split(/\r?\n/);
  const toc = [];
  let html = '';
  let inCode = false;
  let codeLang = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        html += `<pre class="toolary-md-code"><code data-lang="${escapeHtml(codeLang)}">`;
      } else {
        inCode = false;
        codeLang = '';
        html += '</code></pre>';
      }
      continue;
    }

    if (inCode) {
      html += `${line}\n`;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#{1,6}\s+/, '').trim();
      const id = `h-${toc.length + 1}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      toc.push({ level, text, id });
      html += `<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      html += '<ul>';
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*[-*]\s+/, '');
        html += `<li>${inlineMarkdown(item)}</li>`;
        i += 1;
      }
      html += '</ul>';
      i -= 1;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      html += '<ol>';
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+\.\s+/, '');
        html += `<li>${inlineMarkdown(item)}</li>`;
        i += 1;
      }
      html += '</ol>';
      i -= 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      html += `<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html += '<hr />';
      continue;
    }

    if (!line.trim()) {
      html += '<div class="toolary-md-gap"></div>';
      continue;
    }

    html += `<p>${inlineMarkdown(line)}</p>`;
  }

  const tocHtml = toc.length
    ? toc.map((item) => `<a href="#${item.id}" class="toolary-md-toc-link level-${Math.min(Math.max(item.level, 1), 6)}">${escapeHtml(item.text)}</a>`).join('')
    : `<span class="toolary-preview-muted">${t('markdownPreviewerNoToc') || 'No headings found.'}</span>`;

  return { html, tocHtml };
}

function renderPreview() {
  const input = panel?.querySelector('#toolary-md-input')?.value || '';
  const preview = panel?.querySelector('#toolary-md-preview');
  const toc = panel?.querySelector('#toolary-md-toc');

  if (!input.trim()) {
    showError(t('markdownPreviewerEmptyInput') || 'Please paste markdown content.');
    return;
  }

  const result = markdownToHtml(input);
  if (preview) preview.innerHTML = result.html;
  if (toc) toc.innerHTML = result.tocHtml;
  showCoffeeMessageForTool('markdown-previewer');
}

function createPanel() {
  ensureStyles();
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-markdown-previewer',
    title: t('markdownPreviewerTitle') || 'Markdown Previewer',
    width: 1160,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2">
        <section class="toolary-preview-section">
          <div class="toolary-preview-row">
            <button class="toolary-ui-btn" data-action="render">${t('markdownPreviewerRender') || 'Render'}</button>
            <button class="toolary-ui-btn" data-action="copy-html">${t('markdownPreviewerCopyHtml') || 'Copy HTML'}</button>
            <button class="toolary-ui-btn" data-action="fullscreen">${t('toolUiFullscreenOpen') || 'Fullscreen'}</button>
          </div>
          <textarea id="toolary-md-input" rows="22" placeholder="${t('markdownPreviewerInputPlaceholder') || '# Title\n\nPaste markdown here...'}"></textarea>
        </section>
        <section class="toolary-preview-section toolary-md-preview-layout">
          <div class="toolary-preview-grid-2 toolary-md-summary-grid">
            <aside class="toolary-preview-scroll toolary-md-toc">
              <strong class="toolary-preview-muted">${t('markdownPreviewerToc') || 'Table of contents'}</strong>
              <div id="toolary-md-toc" class="toolary-md-toc-content"></div>
            </aside>
            <div class="toolary-preview-card toolary-preview-muted toolary-md-hint">${t('markdownPreviewerHint') || 'Supports headings, lists, blockquotes, links and fenced code blocks.'}</div>
          </div>
          <article id="toolary-md-preview" class="toolary-md-preview toolary-preview-scroll toolary-md-preview-surface"></article>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  const renderBtn = panel.querySelector('[data-action="render"]');
  const copyBtn = panel.querySelector('[data-action="copy-html"]');
  const input = panel.querySelector('#toolary-md-input');

  cleanupFns.push(addEventListenerWithCleanup(renderBtn, 'click', renderPreview));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="fullscreen"]'), 'click', openPreviewFullscreen));
  cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', () => {
    const html = panel.querySelector('#toolary-md-preview')?.innerHTML || '';
    copyWithToast(html, t('copied') || 'Copied');
  }));
  cleanupFns.push(addEventListenerWithCleanup(input, 'keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      renderPreview();
    }
  }));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'markdownPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'markdownPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
