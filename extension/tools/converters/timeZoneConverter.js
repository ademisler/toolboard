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
  id: 'time-zone-converter',
  name: 'Time Zone Converter',
  category: 'converters',
  icon: 'site',
  permissions: ['activeTab'],
  tags: ['converter', 'timezone', 'time', 'date'],
  keywords: ['utc', 'gmt', 'timezone', 'time zone', 'date time']
};

const TIME_ZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Istanbul', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland'
];

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let latestResultText = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-timezone-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-timezone-converter-styles';
  style.textContent = `
    #toolary-timezone-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-timezone-converter{width:min(500px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-timezone-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-timezone-title{font-size:16px;}
    .toolary-timezone-grid{display:grid;gap:10px;}
    .toolary-timezone-label{display:grid;gap:6px;}
    .toolary-timezone-caption{font-size:12px;opacity:.85;}
    .toolary-timezone-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-timezone-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-timezone-zones{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;}
    .toolary-timezone-actions{display:flex;gap:8px;}
    .toolary-timezone-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-timezone-btn--close{padding:4px 10px;}
    .toolary-timezone-btn--swap{height:36px;padding:0 10px;}
    .toolary-timezone-btn--primary{flex:1;}
    .toolary-timezone-result-wrap{display:grid;gap:6px;}
    #toolary-timezone-result{min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-timezone-muted-bg,rgba(127,127,127,.08));white-space:pre-wrap;}
    #toolary-timezone-meta{font-size:12px;opacity:.8;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'timeZoneConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);

  if (isDark) {
    return { bg: '#2b2b2b', text: '#f5f5f5', border: '#4b5563', controlBg: '#1f2937', mutedBg: 'rgba(255, 255, 255, 0.08)' };
  }
  return { bg: '#ffffff', text: '#111111', border: '#d1d5db', controlBg: '#ffffff', mutedBg: 'rgba(127, 127, 127, 0.08)' };
}

function getLocalDateTimeValue() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function buildZoneOptions(selectedZone) {
  return TIME_ZONES.map((zone) => `<option value="${zone}" ${zone === selectedZone ? 'selected' : ''}>${zone}</option>`).join('');
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second')
  };
}

function getZoneOffsetMs(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function parseDateTimeInput(raw) {
  const match = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5])
  };
}

function zonedDateTimeToUtcMs(input, fromZone) {
  let guessUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = getZoneOffsetMs(new Date(guessUtc), fromZone);
    guessUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0) - offset;
  }
  return guessUtc;
}

function formatInZone(date, zone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).format(date);
}

function setResult(text, meta = '') {
  const resultEl = panel?.querySelector('#toolary-timezone-result');
  const metaEl = panel?.querySelector('#toolary-timezone-meta');
  if (resultEl) resultEl.textContent = text;
  if (metaEl) metaEl.textContent = meta;
}

function readState() {
  return {
    datetimeRaw: panel?.querySelector('#toolary-timezone-datetime')?.value || '',
    fromZone: panel?.querySelector('#toolary-timezone-from')?.value || 'UTC',
    toZone: panel?.querySelector('#toolary-timezone-to')?.value || 'Europe/Istanbul'
  };
}

function runConversion() {
  const { datetimeRaw, fromZone, toZone } = readState();
  const parsedInput = parseDateTimeInput(datetimeRaw);
  if (!parsedInput) {
    latestResultText = '';
    setResult(t('timeZoneConverterInvalidDate') || 'Enter a valid date and time.');
    return;
  }

  try {
    const utcMs = zonedDateTimeToUtcMs(parsedInput, fromZone);
    const utcDate = new Date(utcMs);
    const fromText = formatInZone(utcDate, fromZone);
    const toText = formatInZone(utcDate, toZone);
    const result = `${toText}\n(${toZone})`;
    const meta = `${fromZone}: ${fromText}`;
    latestResultText = `${result}\n${meta}`;
    setResult(result, meta);
  } catch (error) {
    handleError(error, 'timeZoneConverter.runConversion');
    latestResultText = '';
    setResult(t('timeZoneConverterConversionFailed') || 'Time zone conversion failed.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-timezone-converter-overlay';
  overlay.style.setProperty('--toolary-timezone-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-timezone-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-timezone-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-timezone-header">
      <strong class="toolary-timezone-title">${t('timeZoneConverterTitle') || 'Time Zone Converter'}</strong>
      <button id="toolary-timezone-close" class="toolary-timezone-btn toolary-timezone-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-timezone-grid">
      <label class="toolary-timezone-label">
        <span class="toolary-timezone-caption">${t('timeZoneConverterDateTime') || 'Date & Time'}</span>
        <input id="toolary-timezone-datetime" class="toolary-timezone-control" type="datetime-local" value="${getLocalDateTimeValue()}" />
      </label>
      <div class="toolary-timezone-zones">
        <label class="toolary-timezone-label">
          <span class="toolary-timezone-caption">${t('timeZoneConverterFrom') || 'From Time Zone'}</span>
          <select id="toolary-timezone-from" class="toolary-timezone-control">${buildZoneOptions('UTC')}</select>
        </label>
        <button id="toolary-timezone-swap" class="toolary-timezone-btn toolary-timezone-btn--swap" type="button">${t('timeZoneConverterSwap') || 'Swap'}</button>
        <label class="toolary-timezone-label">
          <span class="toolary-timezone-caption">${t('timeZoneConverterTo') || 'To Time Zone'}</span>
          <select id="toolary-timezone-to" class="toolary-timezone-control">${buildZoneOptions('Europe/Istanbul')}</select>
        </label>
      </div>
      <div class="toolary-timezone-actions">
        <button id="toolary-timezone-convert" class="toolary-timezone-btn toolary-timezone-btn--primary" type="button">${t('timeZoneConverterConvert') || 'Convert'}</button>
        <button id="toolary-timezone-copy" class="toolary-timezone-btn" type="button">${t('timeZoneConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <div class="toolary-timezone-result-wrap">
        <span class="toolary-timezone-caption">${t('timeZoneConverterResult') || 'Result'}</span>
        <div id="toolary-timezone-result"></div>
        <div id="toolary-timezone-meta"></div>
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

    const closeBtn = panel.querySelector('#toolary-timezone-close');
    const datetimeEl = panel.querySelector('#toolary-timezone-datetime');
    const fromEl = panel.querySelector('#toolary-timezone-from');
    const toEl = panel.querySelector('#toolary-timezone-to');
    const swapBtn = panel.querySelector('#toolary-timezone-swap');
    const convertBtn = panel.querySelector('#toolary-timezone-convert');
    const copyBtn = panel.querySelector('#toolary-timezone-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', () => {
      const currentFrom = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = currentFrom;
      runConversion();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(datetimeEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(fromEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(toEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!latestResultText) {
        showError(t('timeZoneConverterNothingToCopy') || 'No conversion result to copy.');
        return;
      }
      await copyText(latestResultText);
      showSuccess(t('timeZoneConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('time-zone-converter');
    }));

    runConversion();
  } catch (error) {
    handleError(error, 'timeZoneConverter.activate');
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
  latestResultText = '';
  deactivateCb = null;
}
