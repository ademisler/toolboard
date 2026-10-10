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
  id: 'hash-generator',
  name: 'Hash Generator',
  category: 'converters',
  icon: 'hash',
  permissions: ['activeTab'],
  tags: ['converter', 'hash', 'sha', 'checksum'],
  keywords: ['sha256', 'sha512', 'hash', 'digest', 'fingerprint']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-hash-generator-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-hash-generator-styles';
  style.textContent = `
    #toolary-hash-generator-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-hash-generator{width:min(640px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-hash-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-hash-title{font-size:16px;}
    .toolary-hash-grid{display:grid;gap:10px;}
    .toolary-hash-label{display:grid;gap:6px;}
    .toolary-hash-caption{font-size:12px;opacity:.85;}
    .toolary-hash-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-hash-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-hash-textarea{resize:vertical;}
    .toolary-hash-row{display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end;}
    .toolary-hash-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-hash-btn--close{height:auto;padding:4px 10px;}
    .toolary-hash-output{background:var(--toolary-hash-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:760px){.toolary-hash-row{grid-template-columns:1fr 1fr;}.toolary-hash-btn{width:100%;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'hashGenerator.clearCleanup');
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

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

async function createHash(input, algorithm, outputFormat) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest(algorithm, data);
  if (outputFormat === 'base64') return toBase64(digest);
  return toHex(digest);
}

function setOutput(text) {
  const outputEl = panel?.querySelector('#toolary-hash-output');
  if (outputEl) outputEl.value = text;
}

async function runGenerate() {
  const input = panel?.querySelector('#toolary-hash-input')?.value || '';
  const algorithm = panel?.querySelector('#toolary-hash-algorithm')?.value || 'SHA-256';
  const format = panel?.querySelector('#toolary-hash-format')?.value || 'hex';

  if (!input.trim()) {
    showError(t('hashGeneratorEmptyInput') || 'Please enter text.');
    return;
  }

  try {
    const result = await createHash(input, algorithm, format);
    lastResult = result;
    setOutput(result);
  } catch (error) {
    handleError(error, 'hashGenerator.runGenerate');
    showError(t('hashGeneratorFailed') || 'Hash generation failed.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-hash-generator-overlay';
  overlay.style.setProperty('--toolary-hash-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-hash-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-hash-generator';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-hash-header">
      <strong class="toolary-hash-title">${t('hashGeneratorTitle') || 'Hash Generator'}</strong>
      <button id="toolary-hash-close" class="toolary-hash-btn toolary-hash-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-hash-grid">
      <label class="toolary-hash-label">
        <span class="toolary-hash-caption">${t('hashGeneratorInput') || 'Input'}</span>
        <textarea id="toolary-hash-input" rows="5" class="toolary-hash-control toolary-hash-textarea" placeholder="${t('hashGeneratorInputPlaceholder') || 'Enter text...'}"></textarea>
      </label>
      <div class="toolary-hash-row">
        <label class="toolary-hash-label">
          <span class="toolary-hash-caption">${t('hashGeneratorAlgorithm') || 'Algorithm'}</span>
          <select id="toolary-hash-algorithm" class="toolary-hash-control">
            <option value="SHA-1">SHA-1</option>
            <option value="SHA-256" selected>SHA-256</option>
            <option value="SHA-384">SHA-384</option>
            <option value="SHA-512">SHA-512</option>
          </select>
        </label>
        <label class="toolary-hash-label">
          <span class="toolary-hash-caption">${t('hashGeneratorFormat') || 'Output Format'}</span>
          <select id="toolary-hash-format" class="toolary-hash-control">
            <option value="hex">HEX</option>
            <option value="base64">Base64</option>
          </select>
        </label>
        <button id="toolary-hash-generate" class="toolary-hash-btn" type="button">${t('hashGeneratorGenerate') || 'Generate'}</button>
        <button id="toolary-hash-copy" class="toolary-hash-btn" type="button">${t('hashGeneratorCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-hash-label">
        <span class="toolary-hash-caption">${t('hashGeneratorOutput') || 'Output'}</span>
        <textarea id="toolary-hash-output" rows="5" readonly class="toolary-hash-control toolary-hash-textarea toolary-hash-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-hash-close');
    const generateBtn = panel.querySelector('#toolary-hash-generate');
    const copyBtn = panel.querySelector('#toolary-hash-copy');
    const inputEl = panel.querySelector('#toolary-hash-input');
    const algEl = panel.querySelector('#toolary-hash-algorithm');
    const formatEl = panel.querySelector('#toolary-hash-format');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(generateBtn, 'click', runGenerate));
    cleanupFns.push(addEventListenerWithCleanup(algEl, 'change', runGenerate));
    cleanupFns.push(addEventListenerWithCleanup(formatEl, 'change', runGenerate));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runGenerate();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('hashGeneratorNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('hashGeneratorCopied') || 'Result copied.');
      showCoffeeMessageForTool('hash-generator');
    }));
  } catch (error) {
    handleError(error, 'hashGenerator.activate');
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
