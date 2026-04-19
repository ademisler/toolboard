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
  id: 'uuid-converter',
  name: 'UUID Generator/Validator',
  category: 'converters',
  icon: 'uuid',
  permissions: ['activeTab'],
  tags: ['converter', 'uuid', 'guid', 'validator', 'generator'],
  keywords: ['uuid v4', 'guid', 'id', 'random id']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-uuid-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-uuid-converter-styles';
  style.textContent = `
    #toolary-uuid-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-uuid-converter{width:min(680px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-uuid-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-uuid-title{font-size:16px;}
    .toolary-uuid-grid{display:grid;gap:10px;}
    .toolary-uuid-row{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:end;}
    .toolary-uuid-label{display:grid;gap:6px;}
    .toolary-uuid-caption{font-size:12px;opacity:.85;}
    .toolary-uuid-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-uuid-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-uuid-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-uuid-btn--close{height:auto;padding:4px 10px;}
    .toolary-uuid-textarea{resize:vertical;}
    .toolary-uuid-output{background:var(--toolary-uuid-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:760px){.toolary-uuid-row{grid-template-columns:1fr 1fr;}.toolary-uuid-btn{width:100%;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'uuidConverter.clearCleanup');
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

function generateUuidV4() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateUuid(uuid) {
  const value = String(uuid || '').trim();
  const match = value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  if (!match) return { valid: false, version: null };
  return { valid: true, version: Number.parseInt(match[1], 10) };
}

function setResult(text) {
  const outputEl = panel?.querySelector('#toolary-uuid-output');
  if (outputEl) outputEl.value = text;
}

function runGenerate() {
  const countRaw = panel?.querySelector('#toolary-uuid-count')?.value || '1';
  const count = Math.max(1, Math.min(20, Number.parseInt(countRaw, 10) || 1));
  const values = Array.from({ length: count }, () => generateUuidV4());
  const result = values.join('\n');
  lastResult = result;
  setResult(result);
}

function runValidate() {
  const input = panel?.querySelector('#toolary-uuid-input')?.value || '';
  if (!input.trim()) {
    showError(t('uuidConverterEmptyInput') || 'Please enter UUID text.');
    return;
  }

  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    showError(t('uuidConverterEmptyInput') || 'Please enter UUID text.');
    return;
  }

  const results = lines.map((line) => {
    const check = validateUuid(line);
    if (!check.valid) return `${line} -> ${t('uuidConverterInvalid') || 'Invalid'}`;
    return `${line} -> ${(t('uuidConverterValidVersion') || 'Valid (v$1)').replace('$1', String(check.version))}`;
  });

  const result = results.join('\n');
  lastResult = result;
  setResult(result);
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-uuid-converter-overlay';
  overlay.style.setProperty('--toolary-uuid-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-uuid-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-uuid-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-uuid-header">
      <strong class="toolary-uuid-title">${t('uuidConverterTitle') || 'UUID Generator/Validator'}</strong>
      <button id="toolary-uuid-close" class="toolary-uuid-btn toolary-uuid-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-uuid-grid">
      <div class="toolary-uuid-row">
        <label class="toolary-uuid-label">
          <span class="toolary-uuid-caption">${t('uuidConverterGenerateCount') || 'Generate Count'}</span>
          <input id="toolary-uuid-count" class="toolary-uuid-control" type="number" min="1" max="20" value="1" />
        </label>
        <button id="toolary-uuid-generate" class="toolary-uuid-btn" type="button">${t('uuidConverterGenerate') || 'Generate v4'}</button>
        <button id="toolary-uuid-validate" class="toolary-uuid-btn" type="button">${t('uuidConverterValidate') || 'Validate'}</button>
        <button id="toolary-uuid-copy" class="toolary-uuid-btn" type="button">${t('uuidConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-uuid-label">
        <span class="toolary-uuid-caption">${t('uuidConverterInput') || 'Input (one per line for validation)'}</span>
        <textarea id="toolary-uuid-input" rows="5" class="toolary-uuid-control toolary-uuid-textarea" placeholder="${t('uuidConverterInputPlaceholder') || 'Paste UUID values here...'}"></textarea>
      </label>
      <label class="toolary-uuid-label">
        <span class="toolary-uuid-caption">${t('uuidConverterOutput') || 'Output'}</span>
        <textarea id="toolary-uuid-output" rows="6" readonly class="toolary-uuid-control toolary-uuid-textarea toolary-uuid-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-uuid-close');
    const generateBtn = panel.querySelector('#toolary-uuid-generate');
    const validateBtn = panel.querySelector('#toolary-uuid-validate');
    const copyBtn = panel.querySelector('#toolary-uuid-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(generateBtn, 'click', runGenerate));
    cleanupFns.push(addEventListenerWithCleanup(validateBtn, 'click', runValidate));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('uuidConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('uuidConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('uuid-converter');
    }));
  } catch (error) {
    handleError(error, 'uuidConverter.activate');
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
