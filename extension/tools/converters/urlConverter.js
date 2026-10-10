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
  id: 'url-converter',
  name: 'URL Encode/Decode',
  category: 'converters',
  icon: 'link-code',
  permissions: ['activeTab'],
  tags: ['converter', 'url', 'encode', 'decode', 'uri'],
  keywords: ['urlencode', 'urldecode', 'uri', 'query', 'percent encoding']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-url-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-url-converter-styles';
  style.textContent = `
    #toolary-url-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-url-converter{width:min(620px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-url-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-url-title{font-size:16px;}
    .toolary-url-grid{display:grid;gap:10px;}
    .toolary-url-label{display:grid;gap:6px;}
    .toolary-url-caption{font-size:12px;opacity:.85;}
    .toolary-url-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-url-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-url-textarea{resize:vertical;}
    .toolary-url-actions{display:flex;gap:8px;flex-wrap:wrap;}
    .toolary-url-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-url-btn--close{padding:4px 10px;}
    .toolary-url-btn--copy{margin-left:auto;}
    .toolary-url-output{background:var(--toolary-url-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:640px){.toolary-url-btn--copy{margin-left:0;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'urlConverter.clearCleanup');
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

function getMode() {
  return panel?.querySelector('#toolary-url-mode')?.value || 'component';
}

function readInput() {
  return panel?.querySelector('#toolary-url-input')?.value || '';
}

function setOutput(text) {
  const outputEl = panel?.querySelector('#toolary-url-output');
  if (outputEl) outputEl.value = text;
}

function encodeValue(value, mode) {
  if (mode === 'uri') return encodeURI(value);
  return encodeURIComponent(value);
}

function decodeValue(value, mode) {
  if (mode === 'uri') return decodeURI(value);
  return decodeURIComponent(value);
}

function runEncode() {
  try {
    const input = readInput();
    if (!input.trim()) {
      showError(t('urlConverterEmptyInput') || 'Please enter text.');
      return;
    }
    const encoded = encodeValue(input, getMode());
    setOutput(encoded);
    lastResult = encoded;
  } catch (error) {
    handleError(error, 'urlConverter.runEncode');
    showError(t('urlConverterEncodeFailed') || 'URL encoding failed.');
  }
}

function runDecode() {
  try {
    const input = readInput();
    if (!input.trim()) {
      showError(t('urlConverterEmptyInput') || 'Please enter text.');
      return;
    }
    const decoded = decodeValue(input, getMode());
    setOutput(decoded);
    lastResult = decoded;
  } catch (error) {
    handleError(error, 'urlConverter.runDecode');
    showError(t('urlConverterInvalidInput') || 'Invalid URL-encoded input.');
  }
}

function swapInputOutput() {
  const inputEl = panel?.querySelector('#toolary-url-input');
  const outputEl = panel?.querySelector('#toolary-url-output');
  if (!inputEl || !outputEl) return;
  const temp = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = temp;
  lastResult = outputEl.value;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-url-converter-overlay';
  overlay.style.setProperty('--toolary-url-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-url-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-url-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-url-header">
      <strong class="toolary-url-title">${t('urlConverterTitle') || 'URL Encode/Decode'}</strong>
      <button id="toolary-url-close" class="toolary-url-btn toolary-url-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-url-grid">
      <label class="toolary-url-label">
        <span class="toolary-url-caption">${t('urlConverterMode') || 'Mode'}</span>
        <select id="toolary-url-mode" class="toolary-url-control">
          <option value="component">${t('urlConverterComponentMode') || 'Component (query/value)'}</option>
          <option value="uri">${t('urlConverterUriMode') || 'Full URL (URI)'}</option>
        </select>
      </label>
      <label class="toolary-url-label">
        <span class="toolary-url-caption">${t('urlConverterInput') || 'Input'}</span>
        <textarea id="toolary-url-input" rows="5" class="toolary-url-control toolary-url-textarea" placeholder="${t('urlConverterInputPlaceholder') || 'Enter URL or text...'}"></textarea>
      </label>
      <div class="toolary-url-actions">
        <button id="toolary-url-encode" class="toolary-url-btn" type="button">${t('urlConverterEncode') || 'Encode'}</button>
        <button id="toolary-url-decode" class="toolary-url-btn" type="button">${t('urlConverterDecode') || 'Decode'}</button>
        <button id="toolary-url-swap" class="toolary-url-btn" type="button">${t('urlConverterSwap') || 'Swap'}</button>
        <button id="toolary-url-copy" class="toolary-url-btn toolary-url-btn--copy" type="button">${t('urlConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-url-label">
        <span class="toolary-url-caption">${t('urlConverterOutput') || 'Output'}</span>
        <textarea id="toolary-url-output" rows="5" readonly class="toolary-url-control toolary-url-textarea toolary-url-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-url-close');
    const encodeBtn = panel.querySelector('#toolary-url-encode');
    const decodeBtn = panel.querySelector('#toolary-url-decode');
    const swapBtn = panel.querySelector('#toolary-url-swap');
    const copyBtn = panel.querySelector('#toolary-url-copy');
    const inputEl = panel.querySelector('#toolary-url-input');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(encodeBtn, 'click', runEncode));
    cleanupFns.push(addEventListenerWithCleanup(decodeBtn, 'click', runDecode));
    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', swapInputOutput));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runEncode();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('urlConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('urlConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('url-converter');
    }));
  } catch (error) {
    handleError(error, 'urlConverter.activate');
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
