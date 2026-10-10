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
import * as messageRouter from '../../core/messageRouter.js';

export const metadata = {
  id: 'currency-converter',
  name: 'Currency Converter',
  category: 'converters',
  icon: 'tag',
  permissions: ['activeTab'],
  tags: ['converter', 'currency', 'exchange', 'forex'],
  keywords: ['money', 'exchange rate', 'usd', 'eur', 'gbp', 'try']
};

const CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'TRY', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'SEK',
  'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RSD', 'RUB',
  'UAH', 'INR', 'KRW', 'SGD', 'HKD', 'NZD', 'BRL', 'MXN', 'ZAR', 'AED'
];

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let latestResultText = '';
let isConverting = false;
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-currency-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-currency-converter-styles';
  style.textContent = `
    #toolary-currency-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-currency-converter{width:min(480px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-currency-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-currency-title{font-size:16px;}
    .toolary-currency-grid{display:grid;gap:10px;}
    .toolary-currency-label{display:grid;gap:6px;}
    .toolary-currency-caption{font-size:12px;opacity:.85;}
    .toolary-currency-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-currency-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-currency-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;}
    .toolary-currency-actions{display:flex;gap:8px;margin-top:2px;}
    .toolary-currency-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-currency-btn:disabled{cursor:not-allowed;}
    .toolary-currency-btn--close{padding:4px 10px;}
    .toolary-currency-btn--swap{height:36px;padding:0 10px;}
    .toolary-currency-btn--primary{flex:1;}
    .toolary-currency-result-wrap{display:grid;gap:6px;}
    #toolary-currency-result{min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-currency-muted-bg,rgba(127,127,127,.08));white-space:pre-wrap;}
    #toolary-currency-meta{font-size:12px;opacity:.8;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
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
      mutedBg: 'rgba(255, 255, 255, 0.08)'
    };
  }

  return {
    bg: '#ffffff',
    text: '#111111',
    border: '#d1d5db',
    controlBg: '#ffffff',
    mutedBg: 'rgba(127, 127, 127, 0.08)'
  };
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'currencyConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function parseAmount(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatNumber(value, fractionDigits = 6) {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Number(value.toFixed(fractionDigits));
  return rounded.toString();
}

function buildCurrencyOptions(selected) {
  return CURRENCY_CODES
    .map((code) => `<option value="${code}" ${selected === code ? 'selected' : ''}>${code}</option>`)
    .join('');
}

function setLoading(isLoading) {
  const convertButton = panel?.querySelector('#toolary-currency-convert');
  if (!convertButton) return;
  convertButton.disabled = isLoading;
  convertButton.textContent = isLoading
    ? (t('currencyConverterConverting') || 'Converting...')
    : (t('currencyConverterConvert') || 'Convert');
}

function setResult({ resultText = '', rateText = '', dateText = '' }) {
  const resultEl = panel?.querySelector('#toolary-currency-result');
  const metaEl = panel?.querySelector('#toolary-currency-meta');
  if (resultEl) resultEl.textContent = resultText;
  if (metaEl) metaEl.textContent = [rateText, dateText].filter(Boolean).join(' • ');
}

function readState() {
  return {
    amountRaw: panel?.querySelector('#toolary-currency-amount')?.value || '',
    from: panel?.querySelector('#toolary-currency-from')?.value || 'USD',
    to: panel?.querySelector('#toolary-currency-to')?.value || 'EUR'
  };
}

async function runConversion() {
  if (isConverting) return;

  const { amountRaw, from, to } = readState();
  const amount = parseAmount(amountRaw);
  if (amount === null || amount <= 0) {
    latestResultText = '';
    setResult({ resultText: t('currencyConverterInvalidAmount') || 'Enter a valid amount.' });
    return;
  }

  isConverting = true;
  setLoading(true);

  try {
    const response = await messageRouter.sendRuntimeMessage(
      messageRouter.MESSAGE_TYPES.CURRENCY_CONVERT,
      { amount, from, to }
    );

    if (!response?.success) {
      throw new Error(response?.error || 'Currency conversion failed');
    }

    const resultText = `${formatNumber(response.amount)} ${response.from} = ${formatNumber(response.converted)} ${response.to}`;
    const rateText = `${t('currencyConverterRate') || 'Rate'}: 1 ${response.from} = ${formatNumber(response.rate, 8)} ${response.to}`;
    const dateText = `${t('currencyConverterUpdated') || 'Updated'}: ${response.date}`;

    latestResultText = `${resultText}\n${rateText}\n${dateText}`;
    setResult({ resultText, rateText, dateText });
  } catch (error) {
    handleError(error, 'currencyConverter.runConversion');
    latestResultText = '';
    setResult({ resultText: t('currencyConverterFetchError') || 'Could not fetch exchange rates.' });
    showError(t('currencyConverterFetchError') || 'Could not fetch exchange rates.');
  } finally {
    isConverting = false;
    setLoading(false);
  }
}

function createPanel() {
  const theme = resolveThemeVars();

  const overlay = document.createElement('div');
  overlay.id = 'toolary-currency-converter-overlay';
  overlay.style.setProperty('--toolary-currency-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-currency-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-currency-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-currency-header">
      <strong class="toolary-currency-title">${t('currencyConverterTitle') || 'Currency Converter'}</strong>
      <button id="toolary-currency-close" class="toolary-currency-btn toolary-currency-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-currency-grid">
      <label class="toolary-currency-label">
        <span class="toolary-currency-caption">${t('currencyConverterAmount') || 'Amount'}</span>
        <input id="toolary-currency-amount" class="toolary-currency-control" type="text" inputmode="decimal" placeholder="${t('currencyConverterAmountPlaceholder') || '1'}" value="1" />
      </label>
      <div class="toolary-currency-row">
        <label class="toolary-currency-label">
          <span class="toolary-currency-caption">${t('currencyConverterFrom') || 'From'}</span>
          <select id="toolary-currency-from" class="toolary-currency-control">${buildCurrencyOptions('USD')}</select>
        </label>
        <button id="toolary-currency-swap" class="toolary-currency-btn toolary-currency-btn--swap" type="button">${t('currencyConverterSwap') || 'Swap'}</button>
        <label class="toolary-currency-label">
          <span class="toolary-currency-caption">${t('currencyConverterTo') || 'To'}</span>
          <select id="toolary-currency-to" class="toolary-currency-control">${buildCurrencyOptions('EUR')}</select>
        </label>
      </div>
      <div class="toolary-currency-actions">
        <button id="toolary-currency-convert" class="toolary-currency-btn toolary-currency-btn--primary" type="button">${t('currencyConverterConvert') || 'Convert'}</button>
        <button id="toolary-currency-copy" class="toolary-currency-btn" type="button">${t('currencyConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <div class="toolary-currency-result-wrap">
        <span class="toolary-currency-caption">${t('currencyConverterResult') || 'Result'}</span>
        <div id="toolary-currency-result"></div>
        <div id="toolary-currency-meta"></div>
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

    const closeBtn = panel.querySelector('#toolary-currency-close');
    const amountEl = panel.querySelector('#toolary-currency-amount');
    const fromEl = panel.querySelector('#toolary-currency-from');
    const toEl = panel.querySelector('#toolary-currency-to');
    const swapBtn = panel.querySelector('#toolary-currency-swap');
    const convertBtn = panel.querySelector('#toolary-currency-convert');
    const copyBtn = panel.querySelector('#toolary-currency-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));

    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', async () => {
      const currentFrom = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = currentFrom;
      await runConversion();
    }));

    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(fromEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(toEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(amountEl, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));

    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!latestResultText) {
        showError(t('currencyConverterNothingToCopy') || 'No conversion result to copy.');
        return;
      }
      await copyText(latestResultText);
      showSuccess(t('currencyConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('currency-converter');
    }));

    amountEl.focus();
    amountEl.select();
    await runConversion();
  } catch (error) {
    handleError(error, 'currencyConverter.activate');
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
  isConverting = false;
  deactivateCb = null;
}
