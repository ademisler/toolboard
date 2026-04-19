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
  id: 'html-entity-converter',
  name: 'HTML Entity Encode/Decode',
  category: 'converters',
  icon: 'entity-code',
  permissions: ['activeTab'],
  tags: ['converter', 'html', 'entity', 'encode', 'decode'],
  keywords: ['html entities', 'escape', 'unescape', 'ampersand', 'lt gt']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-entity-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-entity-converter-styles';
  style.textContent = `
    #toolary-entity-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-entity-converter{width:min(620px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-entity-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-entity-title{font-size:16px;}
    .toolary-entity-grid{display:grid;gap:10px;}
    .toolary-entity-label{display:grid;gap:6px;}
    .toolary-entity-caption{font-size:12px;opacity:.85;}
    .toolary-entity-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-entity-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-entity-textarea{resize:vertical;}
    .toolary-entity-numeric{display:flex;gap:8px;align-items:center;}
    .toolary-entity-numeric-text{font-size:12px;opacity:.9;}
    .toolary-entity-actions{display:flex;gap:8px;flex-wrap:wrap;}
    .toolary-entity-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-entity-btn--close{padding:4px 10px;}
    .toolary-entity-btn--copy{margin-left:auto;}
    .toolary-entity-output{background:var(--toolary-entity-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:640px){.toolary-entity-btn--copy{margin-left:0;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'htmlEntityConverter.clearCleanup');
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

function encodeHtmlEntities(input, numericMode = false) {
  const basic = String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  if (!numericMode) return basic;
  return basic.replace(/[^\x20-\x7E]/g, (ch) => `&#${ch.codePointAt(0)};`);
}

function decodeHtmlEntities(input) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(input || '');
  return textarea.value;
}

function setOutput(text) {
  const outputEl = panel?.querySelector('#toolary-entity-output');
  if (outputEl) outputEl.value = text;
}

function readInput() {
  return panel?.querySelector('#toolary-entity-input')?.value || '';
}

function isNumericMode() {
  return panel?.querySelector('#toolary-entity-numeric')?.checked || false;
}

function runEncode() {
  try {
    const input = readInput();
    if (!input.trim()) {
      showError(t('htmlEntityConverterEmptyInput') || 'Please enter text.');
      return;
    }
    const encoded = encodeHtmlEntities(input, isNumericMode());
    setOutput(encoded);
    lastResult = encoded;
  } catch (error) {
    handleError(error, 'htmlEntityConverter.runEncode');
    showError(t('htmlEntityConverterEncodeFailed') || 'Encoding failed.');
  }
}

function runDecode() {
  try {
    const input = readInput();
    if (!input.trim()) {
      showError(t('htmlEntityConverterEmptyInput') || 'Please enter text.');
      return;
    }
    const decoded = decodeHtmlEntities(input);
    setOutput(decoded);
    lastResult = decoded;
  } catch (error) {
    handleError(error, 'htmlEntityConverter.runDecode');
    showError(t('htmlEntityConverterDecodeFailed') || 'Decoding failed.');
  }
}

function swapInputOutput() {
  const inputEl = panel?.querySelector('#toolary-entity-input');
  const outputEl = panel?.querySelector('#toolary-entity-output');
  if (!inputEl || !outputEl) return;
  const temp = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = temp;
  lastResult = outputEl.value;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-entity-converter-overlay';
  overlay.style.setProperty('--toolary-entity-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-entity-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-entity-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-entity-header">
      <strong class="toolary-entity-title">${t('htmlEntityConverterTitle') || 'HTML Entity Encode/Decode'}</strong>
      <button id="toolary-entity-close" class="toolary-entity-btn toolary-entity-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-entity-grid">
      <label class="toolary-entity-label">
        <span class="toolary-entity-caption">${t('htmlEntityConverterInput') || 'Input'}</span>
        <textarea id="toolary-entity-input" rows="5" class="toolary-entity-control toolary-entity-textarea" placeholder="${t('htmlEntityConverterInputPlaceholder') || 'Enter text or entities...'}"></textarea>
      </label>
      <label class="toolary-entity-numeric">
        <input id="toolary-entity-numeric" type="checkbox" />
        <span class="toolary-entity-numeric-text">${t('htmlEntityConverterNumericMode') || 'Use numeric entities for non-ASCII characters'}</span>
      </label>
      <div class="toolary-entity-actions">
        <button id="toolary-entity-encode" class="toolary-entity-btn" type="button">${t('htmlEntityConverterEncode') || 'Encode'}</button>
        <button id="toolary-entity-decode" class="toolary-entity-btn" type="button">${t('htmlEntityConverterDecode') || 'Decode'}</button>
        <button id="toolary-entity-swap" class="toolary-entity-btn" type="button">${t('htmlEntityConverterSwap') || 'Swap'}</button>
        <button id="toolary-entity-copy" class="toolary-entity-btn toolary-entity-btn--copy" type="button">${t('htmlEntityConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-entity-label">
        <span class="toolary-entity-caption">${t('htmlEntityConverterOutput') || 'Output'}</span>
        <textarea id="toolary-entity-output" rows="5" readonly class="toolary-entity-control toolary-entity-textarea toolary-entity-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-entity-close');
    const encodeBtn = panel.querySelector('#toolary-entity-encode');
    const decodeBtn = panel.querySelector('#toolary-entity-decode');
    const swapBtn = panel.querySelector('#toolary-entity-swap');
    const copyBtn = panel.querySelector('#toolary-entity-copy');
    const inputEl = panel.querySelector('#toolary-entity-input');

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
        showError(t('htmlEntityConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('htmlEntityConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('html-entity-converter');
    }));
  } catch (error) {
    handleError(error, 'htmlEntityConverter.activate');
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
