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
  id: 'text-to-slug-converter',
  name: 'Text to Slug',
  category: 'converters',
  icon: 'slug',
  permissions: ['activeTab'],
  tags: ['converter', 'slug', 'text', 'url'],
  keywords: ['slugify', 'url slug', 'seo', 'title to url']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-slug-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-slug-converter-styles';
  style.textContent = `
    #toolary-slug-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-slug-converter{width:min(620px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-slug-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-slug-title{font-size:16px;}
    .toolary-slug-grid{display:grid;gap:10px;}
    .toolary-slug-label{display:grid;gap:6px;}
    .toolary-slug-caption{font-size:12px;opacity:.85;}
    .toolary-slug-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-slug-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-slug-textarea{resize:vertical;}
    .toolary-slug-row{display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end;}
    .toolary-slug-lower-wrap{display:flex;gap:8px;align-items:center;padding-bottom:8px;}
    .toolary-slug-lower-text{font-size:12px;opacity:.9;}
    .toolary-slug-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-slug-btn--close{height:auto;padding:4px 10px;}
    .toolary-slug-output{background:var(--toolary-slug-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:760px){.toolary-slug-row{grid-template-columns:1fr 1fr;}.toolary-slug-btn{width:100%;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'textToSlugConverter.clearCleanup');
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

function transliterate(input) {
  const map = {
    ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
    à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a', À: 'A', Á: 'A', Â: 'A', Ä: 'A', Ã: 'A', Å: 'A',
    è: 'e', é: 'e', ê: 'e', ë: 'e', È: 'E', É: 'E', Ê: 'E', Ë: 'E',
    ì: 'i', í: 'i', î: 'i', ï: 'i', Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
    ò: 'o', ó: 'o', ô: 'o', õ: 'o', Ò: 'O', Ó: 'O', Ô: 'O', Õ: 'O',
    ù: 'u', ú: 'u', û: 'u', Ù: 'U', Ú: 'U', Û: 'U',
    ñ: 'n', Ñ: 'N', ý: 'y', Ý: 'Y', ÿ: 'y',
    æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE'
  };
  return String(input || '').split('').map((ch) => map[ch] ?? ch).join('');
}

function slugify(input, separator = '-', lowercase = true) {
  let text = transliterate(input);
  if (lowercase) text = text.toLowerCase();
  text = text
    .replace(/['"`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, separator)
    .replace(new RegExp(`\\${separator}{2,}`, 'g'), separator)
    .replace(new RegExp(`^\\${separator}|\\${separator}$`, 'g'), '');
  return text;
}

function setOutput(text) {
  const outputEl = panel?.querySelector('#toolary-slug-output');
  if (outputEl) outputEl.value = text;
}

function runConversion() {
  const input = panel?.querySelector('#toolary-slug-input')?.value || '';
  const separator = panel?.querySelector('#toolary-slug-separator')?.value || '-';
  const lowercase = panel?.querySelector('#toolary-slug-lowercase')?.checked ?? true;

  if (!input.trim()) {
    lastResult = '';
    setOutput('');
    showError(t('textToSlugConverterEmptyInput') || 'Please enter text.');
    return;
  }

  const slug = slugify(input, separator, lowercase);
  lastResult = slug;
  setOutput(slug);
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-slug-converter-overlay';
  overlay.style.setProperty('--toolary-slug-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-slug-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-slug-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-slug-header">
      <strong class="toolary-slug-title">${t('textToSlugConverterTitle') || 'Text to Slug'}</strong>
      <button id="toolary-slug-close" class="toolary-slug-btn toolary-slug-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-slug-grid">
      <label class="toolary-slug-label">
        <span class="toolary-slug-caption">${t('textToSlugConverterInput') || 'Input'}</span>
        <textarea id="toolary-slug-input" rows="5" class="toolary-slug-control toolary-slug-textarea" placeholder="${t('textToSlugConverterInputPlaceholder') || 'Enter title or text...'}"></textarea>
      </label>
      <div class="toolary-slug-row">
        <label class="toolary-slug-label">
          <span class="toolary-slug-caption">${t('textToSlugConverterSeparator') || 'Separator'}</span>
          <select id="toolary-slug-separator" class="toolary-slug-control">
            <option value="-">-</option>
            <option value="_">_</option>
          </select>
        </label>
        <label class="toolary-slug-lower-wrap">
          <input id="toolary-slug-lowercase" type="checkbox" checked />
          <span class="toolary-slug-lower-text">${t('textToSlugConverterLowercase') || 'Lowercase output'}</span>
        </label>
        <button id="toolary-slug-convert" class="toolary-slug-btn" type="button">${t('textToSlugConverterConvert') || 'Convert'}</button>
        <button id="toolary-slug-copy" class="toolary-slug-btn" type="button">${t('textToSlugConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-slug-label">
        <span class="toolary-slug-caption">${t('textToSlugConverterOutput') || 'Output'}</span>
        <textarea id="toolary-slug-output" rows="3" readonly class="toolary-slug-control toolary-slug-textarea toolary-slug-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-slug-close');
    const convertBtn = panel.querySelector('#toolary-slug-convert');
    const copyBtn = panel.querySelector('#toolary-slug-copy');
    const inputEl = panel.querySelector('#toolary-slug-input');
    const sepEl = panel.querySelector('#toolary-slug-separator');
    const lowerEl = panel.querySelector('#toolary-slug-lowercase');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(sepEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(lowerEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('textToSlugConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('textToSlugConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('text-to-slug-converter');
    }));
  } catch (error) {
    handleError(error, 'textToSlugConverter.activate');
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
