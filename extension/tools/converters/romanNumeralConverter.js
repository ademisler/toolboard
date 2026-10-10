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
  id: 'roman-numeral-converter',
  name: 'Roman Numeral Converter',
  category: 'converters',
  icon: 'roman-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'roman', 'numeral', 'number'],
  keywords: ['roman numeral', 'number to roman', 'roman to number', 'i v x l c d m']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

const ROMAN_PAIRS = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I']
];

const ROMAN_VALUES = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000
};

const STRICT_ROMAN_PATTERN = /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-roman-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-roman-converter-styles';
  style.textContent = `
    #toolary-roman-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-roman-converter{width:min(560px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-roman-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-roman-title{font-size:16px;}
    .toolary-roman-grid{display:grid;gap:10px;}
    .toolary-roman-label{display:grid;gap:6px;}
    .toolary-roman-caption{font-size:12px;opacity:.85;}
    .toolary-roman-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-roman-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-roman-actions{display:flex;gap:8px;}
    .toolary-roman-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-roman-btn--close{padding:4px 10px;}
    .toolary-roman-btn--primary{flex:1;}
    .toolary-roman-output{background:var(--toolary-roman-muted-bg,rgba(127,127,127,.08));resize:vertical;}
    .toolary-roman-hint{font-size:12px;opacity:.78;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'romanNumeralConverter.clearCleanup');
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

function toRomanNumber(value) {
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value > 3999) return null;

  let remaining = value;
  let output = '';
  for (const [numeric, symbol] of ROMAN_PAIRS) {
    while (remaining >= numeric) {
      output += symbol;
      remaining -= numeric;
    }
  }
  return output;
}

function fromRomanNumber(raw) {
  const normalized = String(raw || '').trim().toUpperCase();
  if (!normalized || !STRICT_ROMAN_PATTERN.test(normalized)) return null;

  let total = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const current = ROMAN_VALUES[normalized[i]];
    const next = ROMAN_VALUES[normalized[i + 1]];
    if (!current) return null;
    if (next && next > current) {
      total += (next - current);
      i += 1;
    } else {
      total += current;
    }
  }
  return total;
}

function detectDirection(input) {
  if (/^\d+$/.test(input)) return 'number-to-roman';
  if (/^[ivxlcdm]+$/i.test(input)) return 'roman-to-number';
  return null;
}

function setOutput(text) {
  const outputEl = panel?.querySelector('#toolary-roman-output');
  if (outputEl) outputEl.value = text;
}

function runConversion() {
  const inputRaw = panel?.querySelector('#toolary-roman-input')?.value || '';
  const input = inputRaw.trim();
  const mode = panel?.querySelector('#toolary-roman-mode')?.value || 'auto';

  if (!input) {
    lastResult = '';
    setOutput('');
    showError(t('romanNumeralConverterNoInput') || 'Please enter a value.');
    return;
  }

  const direction = mode === 'auto' ? detectDirection(input) : mode;
  if (!direction) {
    lastResult = '';
    setOutput('');
    showError(t('romanNumeralConverterDetectFailed') || 'Could not detect conversion direction.');
    return;
  }

  if (direction === 'number-to-roman') {
    const parsed = Number.parseInt(input, 10);
    if (!Number.isSafeInteger(parsed)) {
      lastResult = '';
      setOutput('');
      showError(t('romanNumeralConverterInvalidNumber') || 'Invalid number.');
      return;
    }
    const roman = toRomanNumber(parsed);
    if (!roman) {
      lastResult = '';
      setOutput('');
      showError(t('romanNumeralConverterNumberRange') || 'Number must be between 1 and 3999.');
      return;
    }
    lastResult = roman;
    setOutput(roman);
    showSuccess(t('romanNumeralConverterConverted') || 'Conversion completed.');
    return;
  }

  const numeric = fromRomanNumber(input);
  if (numeric === null) {
    lastResult = '';
    setOutput('');
    showError(t('romanNumeralConverterInvalidRoman') || 'Invalid Roman numeral.');
    return;
  }

  lastResult = String(numeric);
  setOutput(lastResult);
  showSuccess(t('romanNumeralConverterConverted') || 'Conversion completed.');
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-roman-converter-overlay';
  overlay.style.setProperty('--toolary-roman-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-roman-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-roman-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-roman-header">
      <strong class="toolary-roman-title">${t('romanNumeralConverterTitle') || 'Roman Numeral Converter'}</strong>
      <button id="toolary-roman-close" class="toolary-roman-btn toolary-roman-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-roman-grid">
      <label class="toolary-roman-label">
        <span class="toolary-roman-caption">${t('romanNumeralConverterInput') || 'Input'}</span>
        <input id="toolary-roman-input" class="toolary-roman-control" type="text" placeholder="${t('romanNumeralConverterInputPlaceholder') || 'Type a number (2026) or Roman numeral (MMXXVI)'}" />
      </label>
      <label class="toolary-roman-label">
        <span class="toolary-roman-caption">${t('romanNumeralConverterDirection') || 'Direction'}</span>
        <select id="toolary-roman-mode" class="toolary-roman-control">
          <option value="auto">${t('romanNumeralConverterDirectionAuto') || 'Auto detect'}</option>
          <option value="number-to-roman">${t('romanNumeralConverterDirectionNumberToRoman') || 'Number to Roman'}</option>
          <option value="roman-to-number">${t('romanNumeralConverterDirectionRomanToNumber') || 'Roman to Number'}</option>
        </select>
      </label>
      <div class="toolary-roman-actions">
        <button id="toolary-roman-convert" class="toolary-roman-btn toolary-roman-btn--primary" type="button">${t('romanNumeralConverterConvert') || 'Convert'}</button>
        <button id="toolary-roman-swap" class="toolary-roman-btn" type="button">${t('romanNumeralConverterSwap') || 'Swap'}</button>
        <button id="toolary-roman-copy" class="toolary-roman-btn" type="button">${t('romanNumeralConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-roman-label">
        <span class="toolary-roman-caption">${t('romanNumeralConverterOutput') || 'Output'}</span>
        <textarea id="toolary-roman-output" rows="3" readonly class="toolary-roman-control toolary-roman-output"></textarea>
      </label>
      <div class="toolary-roman-hint">${t('romanNumeralConverterHint') || 'Supports 1-3999 range and strict Roman numeral notation.'}</div>
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
    const closeBtn = panel.querySelector('#toolary-roman-close');
    const convertBtn = panel.querySelector('#toolary-roman-convert');
    const copyBtn = panel.querySelector('#toolary-roman-copy');
    const swapBtn = panel.querySelector('#toolary-roman-swap');
    const inputEl = panel.querySelector('#toolary-roman-input');
    const modeEl = panel.querySelector('#toolary-roman-mode');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(modeEl, 'change', () => {
      runConversion();
    }));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', () => {
      const current = modeEl.value;
      if (current === 'number-to-roman') modeEl.value = 'roman-to-number';
      else if (current === 'roman-to-number') modeEl.value = 'number-to-roman';
      else modeEl.value = 'number-to-roman';

      if (lastResult) {
        inputEl.value = lastResult;
      }
      runConversion();
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('romanNumeralConverterNothingToCopy') || 'No conversion result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('romanNumeralConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('roman-numeral-converter');
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') {
        deactivateCb?.();
      }
    }));
  } catch (error) {
    handleError(error, 'romanNumeralConverter.activate');
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
