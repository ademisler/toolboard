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
  id: 'number-base-converter',
  name: 'Number Base Converter',
  category: 'converters',
  icon: 'binary',
  permissions: ['activeTab'],
  tags: ['converter', 'number', 'base', 'binary', 'hexadecimal'],
  keywords: ['base2', 'base8', 'base10', 'base16', 'radix']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

const COMMON_BASES = [2, 8, 10, 16, 32, 36];

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-base-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-base-converter-styles';
  style.textContent = `
    #toolary-base-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-base-converter{width:min(540px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-base-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-base-title{font-size:16px;}
    .toolary-base-grid{display:grid;gap:10px;}
    .toolary-base-label{display:grid;gap:6px;}
    .toolary-base-caption{font-size:12px;opacity:.85;}
    .toolary-base-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-base-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-base-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;}
    .toolary-base-actions{display:flex;gap:8px;}
    .toolary-base-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-base-btn--close{padding:4px 10px;}
    .toolary-base-btn--swap{height:36px;padding:0 10px;}
    .toolary-base-btn--primary{flex:1;}
    #toolary-base-result{min-height:72px;padding:10px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-base-muted-bg,rgba(127,127,127,.08));white-space:pre-wrap;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'numberBaseConverter.clearCleanup');
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

function parseBase(raw) {
  const n = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isInteger(n) || n < 2 || n > 36) return null;
  return n;
}

function parseBigIntFromBase(valueRaw, base) {
  let value = String(valueRaw || '').trim();
  if (!value) return null;

  const sign = value.startsWith('-') ? -1n : 1n;
  if (value[0] === '-' || value[0] === '+') {
    value = value.slice(1);
  }
  if (!value) return null;

  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  const allowed = digits.slice(0, base);
  const normalized = value.toLowerCase();
  for (const ch of normalized) {
    if (!allowed.includes(ch)) return null;
  }

  let result = 0n;
  const baseBig = BigInt(base);
  for (const ch of normalized) {
    const digit = BigInt(digits.indexOf(ch));
    result = (result * baseBig) + digit;
  }
  return result * sign;
}

function toBaseString(valueBigInt, base) {
  const sign = valueBigInt < 0n ? '-' : '';
  const abs = valueBigInt < 0n ? -valueBigInt : valueBigInt;
  return `${sign}${abs.toString(base).toUpperCase()}`;
}

function setResult(text) {
  const el = panel?.querySelector('#toolary-base-result');
  if (el) el.textContent = text;
}

function runConversion() {
  const valueRaw = panel?.querySelector('#toolary-base-input')?.value || '';
  const fromBase = parseBase(panel?.querySelector('#toolary-base-from')?.value);
  const toBase = parseBase(panel?.querySelector('#toolary-base-to')?.value);

  if (!fromBase || !toBase) {
    lastResult = '';
    setResult(t('numberBaseConverterInvalidBase') || 'Base must be between 2 and 36.');
    return;
  }

  const parsed = parseBigIntFromBase(valueRaw, fromBase);
  if (parsed === null) {
    lastResult = '';
    setResult(t('numberBaseConverterInvalidNumber') || 'Invalid number for selected source base.');
    return;
  }

  const converted = toBaseString(parsed, toBase);
  const normalizedInput = toBaseString(parsed, fromBase);
  const result = `${t('numberBaseConverterConverted') || 'Converted'}: ${converted}\n` +
    `${t('numberBaseConverterNormalized') || 'Normalized input'}: ${normalizedInput}\n` +
    `(${t('numberBaseConverterFromBase') || 'Base'} ${fromBase} -> ${t('numberBaseConverterToBase') || 'Base'} ${toBase})`;

  lastResult = result;
  setResult(result);
}

function createBaseOptions(selected) {
  return COMMON_BASES.map((base) => `<option value="${base}" ${base === selected ? 'selected' : ''}>${base}</option>`).join('');
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-base-converter-overlay';
  overlay.style.setProperty('--toolary-base-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-base-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-base-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-base-header">
      <strong class="toolary-base-title">${t('numberBaseConverterTitle') || 'Number Base Converter'}</strong>
      <button id="toolary-base-close" class="toolary-base-btn toolary-base-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-base-grid">
      <label class="toolary-base-label">
        <span class="toolary-base-caption">${t('numberBaseConverterValue') || 'Value'}</span>
        <input id="toolary-base-input" class="toolary-base-control" type="text" placeholder="${t('numberBaseConverterInputPlaceholder') || 'FF / 101101 / 12345'}" />
      </label>
      <div class="toolary-base-row">
        <label class="toolary-base-label">
          <span class="toolary-base-caption">${t('numberBaseConverterFromBase') || 'From Base'}</span>
          <select id="toolary-base-from" class="toolary-base-control">${createBaseOptions(10)}</select>
        </label>
        <button id="toolary-base-swap" class="toolary-base-btn toolary-base-btn--swap" type="button">${t('numberBaseConverterSwap') || 'Swap'}</button>
        <label class="toolary-base-label">
          <span class="toolary-base-caption">${t('numberBaseConverterToBase') || 'To Base'}</span>
          <select id="toolary-base-to" class="toolary-base-control">${createBaseOptions(16)}</select>
        </label>
      </div>
      <div class="toolary-base-actions">
        <button id="toolary-base-convert" class="toolary-base-btn toolary-base-btn--primary" type="button">${t('numberBaseConverterConvert') || 'Convert'}</button>
        <button id="toolary-base-copy" class="toolary-base-btn" type="button">${t('numberBaseConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <div id="toolary-base-result"></div>
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
    const closeBtn = panel.querySelector('#toolary-base-close');
    const convertBtn = panel.querySelector('#toolary-base-convert');
    const swapBtn = panel.querySelector('#toolary-base-swap');
    const copyBtn = panel.querySelector('#toolary-base-copy');
    const inputEl = panel.querySelector('#toolary-base-input');
    const fromEl = panel.querySelector('#toolary-base-from');
    const toEl = panel.querySelector('#toolary-base-to');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(fromEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(toEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', () => {
      const currentFrom = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = currentFrom;
      runConversion();
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('numberBaseConverterNothingToCopy') || 'No conversion result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('numberBaseConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('number-base-converter');
    }));
  } catch (error) {
    handleError(error, 'numberBaseConverter.activate');
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
