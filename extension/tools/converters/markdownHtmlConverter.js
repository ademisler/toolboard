import {
  addEventListenerWithCleanup,
  copyText,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'markdown-html-converter',
  name: 'Markdown ↔ HTML Converter',
  category: 'converters',
  icon: 'markdown-html',
  permissions: ['activeTab'],
  tags: ['converter', 'markdown', 'html', 'text'],
  keywords: ['md', 'html', 'markup', 'format']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-markdown-html-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-markdown-html-converter-styles';
  style.textContent = `
    #toolary-markdown-html-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-markdown-html-converter{width:min(680px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-mdhtml-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-mdhtml-title{font-size:16px;}
    .toolary-mdhtml-grid{display:grid;gap:10px;}
    .toolary-mdhtml-label{display:grid;gap:6px;}
    .toolary-mdhtml-caption{font-size:12px;opacity:.85;}
    .toolary-mdhtml-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-mdhtml-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-mdhtml-textarea{resize:vertical;}
    .toolary-mdhtml-actions{display:flex;gap:8px;flex-wrap:wrap;}
    .toolary-mdhtml-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-mdhtml-btn--close{padding:4px 10px;}
    .toolary-mdhtml-btn--copy{margin-left:auto;}
    .toolary-mdhtml-output{background:var(--toolary-mdhtml-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:640px){.toolary-mdhtml-btn--copy{margin-left:0;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'markdownHtmlConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);
  if (isDark) return { bg: '#2b2b2b', text: '#f5f5f5', border: '#4b5563', controlBg: '#1f2937', mutedBg: 'rgba(255,255,255,.08)' };
  return { bg: '#ffffff', text: '#111111', border: '#d1d5db', controlBg: '#ffffff', mutedBg: 'rgba(127,127,127,.08)' };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHtml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&');
}

function applyInlineMarkdown(markdown) {
  return markdown
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown) {
  const escaped = escapeHtml(markdown).replace(/\r\n/g, '\n');
  const lines = escaped.split('\n');
  const output = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      output.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      output.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (line === '---' || line === '***') {
      closeLists();
      output.push('<hr>');
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      closeLists();
      output.push(`<blockquote>${applyInlineMarkdown(quoteMatch[1])}</blockquote>`);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!inUl) {
        closeLists();
        output.push('<ul>');
        inUl = true;
      }
      output.push(`<li>${applyInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inOl) {
        closeLists();
        output.push('<ol>');
        inOl = true;
      }
      output.push(`<li>${applyInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    output.push(`<p>${applyInlineMarkdown(line)}</p>`);
  }

  closeLists();
  return output.join('\n');
}

function htmlToMarkdown(html) {
  let text = String(html || '').replace(/\r\n/g, '\n');

  text = text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*hr\s*\/?>/gi, '\n---\n')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  text = text.replace(/<[^>]+>/g, '');
  text = unescapeHtml(text);
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function setOutput(text) {
  const outputEl = panel?.querySelector('#toolary-markdown-html-output');
  if (outputEl) outputEl.value = text;
}

function runConversion() {
  const input = panel?.querySelector('#toolary-markdown-html-input')?.value || '';
  const mode = panel?.querySelector('#toolary-markdown-html-mode')?.value || 'md-to-html';

  if (!input.trim()) {
    showError(t('markdownHtmlConverterEmptyInput') || 'Please enter text.');
    return;
  }

  try {
    const result = mode === 'md-to-html' ? markdownToHtml(input) : htmlToMarkdown(input);
    lastResult = result;
    setOutput(result);
  } catch (error) {
    handleError(error, 'markdownHtmlConverter.runConversion');
    showError(t('markdownHtmlConverterConversionFailed') || 'Conversion failed.');
  }
}

function swapInputOutput() {
  const inputEl = panel?.querySelector('#toolary-markdown-html-input');
  const outputEl = panel?.querySelector('#toolary-markdown-html-output');
  const modeEl = panel?.querySelector('#toolary-markdown-html-mode');
  if (!inputEl || !outputEl || !modeEl) return;

  const temp = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = temp;
  modeEl.value = modeEl.value === 'md-to-html' ? 'html-to-md' : 'md-to-html';
  lastResult = outputEl.value;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-markdown-html-converter-overlay';
  overlay.style.setProperty('--toolary-mdhtml-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-mdhtml-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-markdown-html-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-mdhtml-header">
      <strong class="toolary-mdhtml-title">${t('markdownHtmlConverterTitle') || 'Markdown ↔ HTML Converter'}</strong>
      <button id="toolary-markdown-html-close" class="toolary-mdhtml-btn toolary-mdhtml-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-mdhtml-grid">
      <label class="toolary-mdhtml-label">
        <span class="toolary-mdhtml-caption">${t('markdownHtmlConverterMode') || 'Mode'}</span>
        <select id="toolary-markdown-html-mode" class="toolary-mdhtml-control">
          <option value="md-to-html">${t('markdownHtmlConverterMdToHtml') || 'Markdown → HTML'}</option>
          <option value="html-to-md">${t('markdownHtmlConverterHtmlToMd') || 'HTML → Markdown'}</option>
        </select>
      </label>
      <label class="toolary-mdhtml-label">
        <span class="toolary-mdhtml-caption">${t('markdownHtmlConverterInput') || 'Input'}</span>
        <textarea id="toolary-markdown-html-input" rows="6" class="toolary-mdhtml-control toolary-mdhtml-textarea" placeholder="${t('markdownHtmlConverterInputPlaceholder') || 'Enter Markdown or HTML...'}"></textarea>
      </label>
      <div class="toolary-mdhtml-actions">
        <button id="toolary-markdown-html-convert" class="toolary-mdhtml-btn" type="button">${t('markdownHtmlConverterConvert') || 'Convert'}</button>
        <button id="toolary-markdown-html-swap" class="toolary-mdhtml-btn" type="button">${t('markdownHtmlConverterSwap') || 'Swap'}</button>
        <button id="toolary-markdown-html-copy" class="toolary-mdhtml-btn toolary-mdhtml-btn--copy" type="button">${t('markdownHtmlConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-mdhtml-label">
        <span class="toolary-mdhtml-caption">${t('markdownHtmlConverterOutput') || 'Output'}</span>
        <textarea id="toolary-markdown-html-output" rows="6" readonly class="toolary-mdhtml-control toolary-mdhtml-textarea toolary-mdhtml-output"></textarea>
      </label>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    ensureStyles();
    if (panel) {
      panel.remove();
      panel = null;
    }
    createPanel();

    const closeBtn = panel.querySelector('#toolary-markdown-html-close');
    const convertBtn = panel.querySelector('#toolary-markdown-html-convert');
    const swapBtn = panel.querySelector('#toolary-markdown-html-swap');
    const copyBtn = panel.querySelector('#toolary-markdown-html-copy');
    const inputEl = panel.querySelector('#toolary-markdown-html-input');
    const modeEl = panel.querySelector('#toolary-markdown-html-mode');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', swapInputOutput));
    cleanupFns.push(addEventListenerWithCleanup(modeEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('markdownHtmlConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('markdownHtmlConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('markdown-html-converter');
    }));
  } catch (error) {
    handleError(error, 'markdownHtmlConverter.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();
  if (panel) {
    panel.remove();
    panel = null;
  }
  lastResult = '';
  deactivateCb = null;
}
