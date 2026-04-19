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
  id: 'unix-time-converter',
  name: 'Unix Time Converter',
  category: 'converters',
  icon: 'file-text',
  permissions: ['activeTab'],
  tags: ['converter', 'unix', 'timestamp', 'datetime'],
  keywords: ['epoch', 'timestamp', 'unix', 'date', 'time']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-unix-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-unix-converter-styles';
  style.textContent = `
    #toolary-unix-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-unix-converter{width:min(540px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-unix-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-unix-title{font-size:16px;}
    .toolary-unix-grid{display:grid;gap:12px;}
    .toolary-unix-card{display:grid;gap:8px;padding:10px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-unix-muted-bg,rgba(127,127,127,.08));}
    .toolary-unix-card-title{font-size:13px;font-weight:600;}
    .toolary-unix-row{display:grid;gap:8px;}
    .toolary-unix-row--triple{grid-template-columns:1fr 140px auto;}
    .toolary-unix-row--double{grid-template-columns:1fr auto;}
    .toolary-unix-result-header{display:flex;justify-content:space-between;align-items:center;}
    .toolary-unix-caption{font-size:12px;opacity:.85;}
    .toolary-unix-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-unix-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-unix-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-unix-btn--close{padding:4px 10px;}
    .toolary-unix-btn--copy{padding:6px 10px;}
    #toolary-unix-result{min-height:68px;padding:10px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-unix-muted-bg,rgba(127,127,127,.08));white-space:pre-wrap;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'unixTimeConverter.clearCleanup');
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

function getNowLocalInput() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function setResult(text) {
  const el = panel?.querySelector('#toolary-unix-result');
  if (el) el.textContent = text;
}

function parseUnixValue(raw) {
  const value = String(raw || '').trim();
  if (!/^-?\d+$/.test(value)) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseDateTimeRaw(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function runUnixToDate() {
  const unixRaw = panel?.querySelector('#toolary-unix-input')?.value || '';
  const precision = panel?.querySelector('#toolary-unix-precision')?.value || 'seconds';
  const unix = parseUnixValue(unixRaw);
  if (unix === null) {
    lastResult = '';
    setResult(t('unixTimeConverterInvalidUnix') || 'Enter a valid Unix value.');
    return;
  }

  const ms = precision === 'seconds' ? unix * 1000 : unix;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    lastResult = '';
    setResult(t('unixTimeConverterInvalidUnix') || 'Enter a valid Unix value.');
    return;
  }

  const localText = date.toLocaleString();
  const utcText = date.toUTCString();
  const isoText = date.toISOString();
  const result = `${t('unixTimeConverterLocalLabel') || 'Local'}: ${localText}\n${t('unixTimeConverterUtcLabel') || 'UTC'}: ${utcText}\n${t('unixTimeConverterIsoLabel') || 'ISO'}: ${isoText}`;
  lastResult = result;
  setResult(result);
}

function runDateToUnix() {
  const dateRaw = panel?.querySelector('#toolary-datetime-input')?.value || '';
  const date = parseDateTimeRaw(dateRaw);
  if (!date) {
    lastResult = '';
    setResult(t('unixTimeConverterInvalidDateTime') || 'Enter a valid date and time.');
    return;
  }

  const unixSeconds = Math.floor(date.getTime() / 1000);
  const unixMs = date.getTime();
  const result = `${t('unixTimeConverterSecondsLabel') || 'Seconds'}: ${unixSeconds}\n${t('unixTimeConverterMillisecondsLabel') || 'Milliseconds'}: ${unixMs}`;
  lastResult = result;
  setResult(result);
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-unix-converter-overlay';
  overlay.style.setProperty('--toolary-unix-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-unix-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-unix-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-unix-header">
      <strong class="toolary-unix-title">${t('unixTimeConverterTitle') || 'Unix Time Converter'}</strong>
      <button id="toolary-unix-close" class="toolary-unix-btn toolary-unix-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-unix-grid">
      <div class="toolary-unix-card">
        <div class="toolary-unix-card-title">${t('unixTimeConverterUnixToDate') || 'Unix → Date Time'}</div>
        <div class="toolary-unix-row toolary-unix-row--triple">
          <input id="toolary-unix-input" class="toolary-unix-control" type="text" placeholder="${t('unixTimeConverterUnixPlaceholder') || '1700000000'}" />
          <select id="toolary-unix-precision" class="toolary-unix-control">
            <option value="seconds">${t('unixTimeConverterSeconds') || 'Seconds'}</option>
            <option value="milliseconds">${t('unixTimeConverterMilliseconds') || 'Milliseconds'}</option>
          </select>
          <button id="toolary-unix-to-date" class="toolary-unix-btn" type="button">${t('unixTimeConverterConvert') || 'Convert'}</button>
        </div>
      </div>
      <div class="toolary-unix-card">
        <div class="toolary-unix-card-title">${t('unixTimeConverterDateToUnix') || 'Date Time → Unix'}</div>
        <div class="toolary-unix-row toolary-unix-row--double">
          <input id="toolary-datetime-input" class="toolary-unix-control" type="datetime-local" step="1" value="${getNowLocalInput()}" />
          <button id="toolary-date-to-unix" class="toolary-unix-btn" type="button">${t('unixTimeConverterConvert') || 'Convert'}</button>
        </div>
      </div>
      <div class="toolary-unix-row">
        <div class="toolary-unix-result-header">
          <span class="toolary-unix-caption">${t('unixTimeConverterResult') || 'Result'}</span>
          <button id="toolary-unix-copy" class="toolary-unix-btn toolary-unix-btn--copy" type="button">${t('unixTimeConverterCopyResult') || 'Copy Result'}</button>
        </div>
        <div id="toolary-unix-result"></div>
      </div>
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

    const closeBtn = panel.querySelector('#toolary-unix-close');
    const unixToDateBtn = panel.querySelector('#toolary-unix-to-date');
    const dateToUnixBtn = panel.querySelector('#toolary-date-to-unix');
    const unixInput = panel.querySelector('#toolary-unix-input');
    const dateInput = panel.querySelector('#toolary-datetime-input');
    const copyBtn = panel.querySelector('#toolary-unix-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(unixToDateBtn, 'click', runUnixToDate));
    cleanupFns.push(addEventListenerWithCleanup(dateToUnixBtn, 'click', runDateToUnix));
    cleanupFns.push(addEventListenerWithCleanup(unixInput, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runUnixToDate();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(dateInput, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runDateToUnix();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('unixTimeConverterNothingToCopy') || 'No conversion result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('unixTimeConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('unix-time-converter');
    }));
  } catch (error) {
    handleError(error, 'unixTimeConverter.activate');
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
