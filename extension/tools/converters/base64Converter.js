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
  id: 'base64-converter',
  name: 'Base64 Encode/Decode',
  category: 'converters',
  icon: 'braces',
  permissions: ['activeTab'],
  tags: ['converter', 'base64', 'encode', 'decode', 'text'],
  keywords: ['base64', 'encode', 'decode', 'utf-8', 'binary']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-base64-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-base64-converter-styles';
  style.textContent = `
    #toolary-base64-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-base64-converter{width:min(620px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-base64-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-base64-title{font-size:16px;}
    .toolary-base64-grid{display:grid;gap:10px;}
    .toolary-base64-label{display:grid;gap:6px;}
    .toolary-base64-caption{font-size:12px;opacity:.85;}
    .toolary-base64-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-base64-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-base64-textarea{resize:vertical;}
    .toolary-base64-actions{display:flex;gap:8px;flex-wrap:wrap;}
    .toolary-base64-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-base64-btn--close{padding:4px 10px;}
    .toolary-base64-btn--copy{margin-left:auto;}
    .toolary-base64-output{background:var(--toolary-base64-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:640px){.toolary-base64-btn--copy{margin-left:0;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'base64Converter.clearCleanup');
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

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToUtf8(base64Text) {
  const normalized = base64Text
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function setResult(text) {
  const outputEl = panel?.querySelector('#toolary-base64-output');
  if (outputEl) outputEl.value = text;
}

function readInputValue() {
  return panel?.querySelector('#toolary-base64-input')?.value || '';
}

function runEncode() {
  try {
    const input = readInputValue();
    if (!input.trim()) {
      showError(t('base64ConverterEmptyInput') || 'Please enter text.');
      return;
    }
    const encoded = utf8ToBase64(input);
    setResult(encoded);
    lastResult = encoded;
  } catch (error) {
    handleError(error, 'base64Converter.runEncode');
    showError(t('base64ConverterEncodeFailed') || 'Encoding failed.');
  }
}

function runDecode() {
  try {
    const input = readInputValue();
    if (!input.trim()) {
      showError(t('base64ConverterEmptyInput') || 'Please enter text.');
      return;
    }
    const decoded = base64ToUtf8(input);
    setResult(decoded);
    lastResult = decoded;
  } catch (error) {
    handleError(error, 'base64Converter.runDecode');
    showError(t('base64ConverterInvalidInput') || 'Invalid Base64 input.');
  }
}

function swapInputOutput() {
  const inputEl = panel?.querySelector('#toolary-base64-input');
  const outputEl = panel?.querySelector('#toolary-base64-output');
  if (!inputEl || !outputEl) return;
  const currentInput = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = currentInput;
  lastResult = outputEl.value;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-base64-converter-overlay';
  overlay.style.setProperty('--toolary-base64-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-base64-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-base64-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-base64-header">
      <strong class="toolary-base64-title">${t('base64ConverterTitle') || 'Base64 Encode/Decode'}</strong>
      <button id="toolary-base64-close" class="toolary-base64-btn toolary-base64-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-base64-grid">
      <label class="toolary-base64-label">
        <span class="toolary-base64-caption">${t('base64ConverterInput') || 'Input'}</span>
        <textarea id="toolary-base64-input" rows="5" class="toolary-base64-control toolary-base64-textarea" placeholder="${t('base64ConverterInputPlaceholder') || 'Enter text or Base64...'}"></textarea>
      </label>
      <div class="toolary-base64-actions">
        <button id="toolary-base64-encode" class="toolary-base64-btn" type="button">${t('base64ConverterEncode') || 'Encode'}</button>
        <button id="toolary-base64-decode" class="toolary-base64-btn" type="button">${t('base64ConverterDecode') || 'Decode'}</button>
        <button id="toolary-base64-swap" class="toolary-base64-btn" type="button">${t('base64ConverterSwap') || 'Swap'}</button>
        <button id="toolary-base64-copy" class="toolary-base64-btn toolary-base64-btn--copy" type="button">${t('base64ConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-base64-label">
        <span class="toolary-base64-caption">${t('base64ConverterOutput') || 'Output'}</span>
        <textarea id="toolary-base64-output" rows="5" readonly class="toolary-base64-control toolary-base64-textarea toolary-base64-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-base64-close');
    const encodeBtn = panel.querySelector('#toolary-base64-encode');
    const decodeBtn = panel.querySelector('#toolary-base64-decode');
    const swapBtn = panel.querySelector('#toolary-base64-swap');
    const copyBtn = panel.querySelector('#toolary-base64-copy');
    const inputEl = panel.querySelector('#toolary-base64-input');

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
        showError(t('base64ConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('base64ConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('base64-converter');
    }));
  } catch (error) {
    handleError(error, 'base64Converter.activate');
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
