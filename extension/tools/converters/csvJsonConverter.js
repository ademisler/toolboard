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
  id: 'csv-json-converter',
  name: 'CSV ↔ JSON Converter',
  category: 'converters',
  icon: 'table-arrows',
  permissions: ['activeTab'],
  tags: ['converter', 'csv', 'json', 'table', 'data'],
  keywords: ['csv', 'json', 'delimiter', 'comma', 'tab']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-csv-json-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-csv-json-converter-styles';
  style.textContent = `
    #toolary-csv-json-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-csv-json-converter{width:min(920px,100%);max-height:min(92vh,920px);overflow:auto;border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-csv-json-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
    .toolary-csv-json-title{font-size:16px;}
    .toolary-csv-json-grid{display:grid;gap:10px;margin-bottom:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));}
    .toolary-csv-json-label{display:grid;gap:6px;}
    .toolary-csv-json-inline-label{display:flex;align-items:center;gap:8px;padding-top:20px;}
    .toolary-csv-json-caption{font-size:12px;opacity:.85;}
    .toolary-csv-json-inline-label span{font-size:13px;}
    .toolary-csv-json-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-csv-json-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-csv-json-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
    .toolary-csv-json-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-csv-json-note{font-size:12px;opacity:.9;margin-bottom:10px;padding:8px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-csv-json-info-bg,rgba(59,130,246,.1));}
    .toolary-csv-json-panels{display:grid;gap:10px;grid-template-columns:1fr 1fr;}
    .toolary-csv-json-textarea{resize:vertical;min-height:300px;}
    #toolary-csv-json-output{background:var(--toolary-csv-json-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:840px){.toolary-csv-json-panels{grid-template-columns:1fr;}.toolary-csv-json-textarea{min-height:200px;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'csvJsonConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);
  if (isDark) {
    return {
      bg: '#2b2b2b',
      text: '#f5f5f5',
      border: '#4b5563',
      controlBg: '#1f2937',
      mutedBg: 'rgba(255,255,255,.08)',
      infoBg: 'rgba(59,130,246,.20)'
    };
  }
  return {
    bg: '#ffffff',
    text: '#111111',
    border: '#d1d5db',
    controlBg: '#ffffff',
    mutedBg: 'rgba(127,127,127,.08)',
    infoBg: 'rgba(59,130,246,.10)'
  };
}

function normalizeDelimiter(value) {
  if (value === 'tab') return '\t';
  if (value === 'semicolon') return ';';
  if (value === 'pipe') return '|';
  return ',';
}

function parseCSV(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const input = String(text || '');
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\r') {
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new Error(t('csvJsonConverterUnclosedQuote') || 'CSV contains an unclosed quoted field.');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function coerceType(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return value;
}

function csvToJson(csvText, delimiter, useHeader, typeCast) {
  const rows = parseCSV(csvText, delimiter);
  if (!rows.length) return [];

  if (!useHeader) {
    return rows.map((row) => (typeCast ? row.map(coerceType) : row));
  }

  const headers = rows[0].map((h, index) => {
    const key = String(h || '').trim();
    return key || `column_${index + 1}`;
  });

  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      const raw = row[index] ?? '';
      obj[header] = typeCast ? coerceType(raw) : raw;
    });
    return obj;
  });
}

function escapeCsvField(value, delimiter) {
  const text = value === null || value === undefined ? '' : String(value);
  const needsQuotes = text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter);
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function jsonToCsv(jsonText, delimiter, includeHeader) {
  const parsed = JSON.parse(jsonText);
  const array = Array.isArray(parsed) ? parsed : [parsed];
  if (!array.length) return '';

  const first = array[0];
  const objectMode = first && typeof first === 'object' && !Array.isArray(first);

  if (objectMode) {
    const keySet = new Set();
    array.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        Object.keys(item).forEach((key) => keySet.add(key));
      }
    });

    const headers = Array.from(keySet);
    const rows = [];

    if (includeHeader) {
      rows.push(headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter));
    }

    array.forEach((item) => {
      const row = headers.map((key) => {
        const value = item && typeof item === 'object' ? item[key] : '';
        if (typeof value === 'object' && value !== null) {
          return escapeCsvField(JSON.stringify(value), delimiter);
        }
        return escapeCsvField(value, delimiter);
      });
      rows.push(row.join(delimiter));
    });

    return rows.join('\n');
  }

  const rows = array.map((item) => {
    if (Array.isArray(item)) {
      return item.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter);
    }
    return escapeCsvField(item, delimiter);
  });

  return rows.join('\n');
}

function convert() {
  const input = panel?.querySelector('#toolary-csv-json-input')?.value || '';
  const mode = panel?.querySelector('#toolary-csv-json-mode')?.value || 'csv-to-json';
  const delimiter = normalizeDelimiter(panel?.querySelector('#toolary-csv-json-delimiter')?.value || 'comma');
  const useHeader = Boolean(panel?.querySelector('#toolary-csv-json-header')?.checked);
  const typeCast = Boolean(panel?.querySelector('#toolary-csv-json-typecast')?.checked);

  if (!input.trim()) {
    showError(t('csvJsonConverterEmptyInput') || 'Please enter data to convert.');
    return;
  }

  try {
    const output = mode === 'csv-to-json'
      ? JSON.stringify(csvToJson(input, delimiter, useHeader, typeCast), null, 2)
      : jsonToCsv(input, delimiter, useHeader);

    const outputEl = panel?.querySelector('#toolary-csv-json-output');
    if (outputEl) outputEl.value = output;
    lastResult = output;
  } catch (error) {
    handleError(error, 'csvJsonConverter.convert');
    showError(`${t('csvJsonConverterFailed') || 'Conversion failed.'} ${error.message || ''}`.trim());
  }
}

function swapValues() {
  const inputEl = panel?.querySelector('#toolary-csv-json-input');
  const outputEl = panel?.querySelector('#toolary-csv-json-output');
  if (!inputEl || !outputEl) return;

  const oldInput = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = oldInput;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-csv-json-converter-overlay';
  overlay.style.setProperty('--toolary-csv-json-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-csv-json-info-bg', theme.infoBg);
  overlay.style.setProperty('--toolary-csv-json-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-csv-json-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-csv-json-header">
      <strong class="toolary-csv-json-title">${t('csvJsonConverterTitle') || 'CSV ↔ JSON Converter'}</strong>
      <button id="toolary-csv-json-close" class="toolary-csv-json-btn" type="button">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-csv-json-grid">
      <label class="toolary-csv-json-label">
        <span class="toolary-csv-json-caption">${t('csvJsonConverterMode') || 'Conversion Direction'}</span>
        <select id="toolary-csv-json-mode" class="toolary-csv-json-control">
          <option value="csv-to-json">${t('csvJsonConverterCsvToJson') || 'CSV → JSON'}</option>
          <option value="json-to-csv">${t('csvJsonConverterJsonToCsv') || 'JSON → CSV'}</option>
        </select>
      </label>

      <label class="toolary-csv-json-label">
        <span class="toolary-csv-json-caption">${t('csvJsonConverterDelimiter') || 'Delimiter'}</span>
        <select id="toolary-csv-json-delimiter" class="toolary-csv-json-control">
          <option value="comma">${t('csvJsonConverterDelimiterComma') || 'Comma (,)'}</option>
          <option value="semicolon">${t('csvJsonConverterDelimiterSemicolon') || 'Semicolon (;)'}</option>
          <option value="tab">${t('csvJsonConverterDelimiterTab') || 'Tab'}</option>
          <option value="pipe">${t('csvJsonConverterDelimiterPipe') || 'Pipe (|)'}</option>
        </select>
      </label>

      <label class="toolary-csv-json-inline-label">
        <input id="toolary-csv-json-header" type="checkbox" checked />
        <span>${t('csvJsonConverterUseHeader') || 'Use first row as header'}</span>
      </label>

      <label class="toolary-csv-json-inline-label">
        <input id="toolary-csv-json-typecast" type="checkbox" checked />
        <span>${t('csvJsonConverterTypecast') || 'Type-cast numbers/booleans (CSV → JSON)'}</span>
      </label>
    </div>

    <div class="toolary-csv-json-actions">
      <button id="toolary-csv-json-convert" class="toolary-csv-json-btn" type="button">${t('csvJsonConverterConvert') || 'Convert'}</button>
      <button id="toolary-csv-json-swap" class="toolary-csv-json-btn" type="button">${t('csvJsonConverterSwap') || 'Swap'}</button>
      <button id="toolary-csv-json-copy" class="toolary-csv-json-btn" type="button">${t('csvJsonConverterCopyResult') || 'Copy Result'}</button>
    </div>

    <div class="toolary-csv-json-note">
      ${t('csvJsonConverterHint') || 'Handles quoted fields and line breaks. Use the delimiter setting for your file format.'}
    </div>

    <div class="toolary-csv-json-panels">
      <label class="toolary-csv-json-label">
        <span class="toolary-csv-json-caption">${t('csvJsonConverterInput') || 'Input'}</span>
        <textarea id="toolary-csv-json-input" rows="14" class="toolary-csv-json-control toolary-csv-json-textarea" placeholder="${t('csvJsonConverterInputPlaceholder') || 'Paste CSV or JSON here...'}"></textarea>
      </label>

      <label class="toolary-csv-json-label">
        <span class="toolary-csv-json-caption">${t('csvJsonConverterOutput') || 'Output'}</span>
        <textarea id="toolary-csv-json-output" rows="14" readonly class="toolary-csv-json-control toolary-csv-json-textarea"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-csv-json-close');
    const convertBtn = panel.querySelector('#toolary-csv-json-convert');
    const swapBtn = panel.querySelector('#toolary-csv-json-swap');
    const copyBtn = panel.querySelector('#toolary-csv-json-copy');
    const inputEl = panel.querySelector('#toolary-csv-json-input');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', convert));
    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', swapValues));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        convert();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('csvJsonConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('csvJsonConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('csv-json-converter');
    }));
  } catch (error) {
    handleError(error, 'csvJsonConverter.activate');
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
