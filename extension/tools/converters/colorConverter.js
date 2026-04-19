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
  id: 'color-converter',
  name: 'Color Converter',
  category: 'converters',
  icon: 'palette',
  permissions: ['activeTab'],
  tags: ['converter', 'color', 'hex', 'rgb', 'hsl', 'cmyk'],
  keywords: ['color', 'hex', 'rgb', 'hsl', 'cmyk', 'design']
};

const FORMAT_OPTIONS = ['hex', 'rgb', 'hsl', 'cmyk'];

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResultText = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-color-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-color-converter-styles';
  style.textContent = `
    #toolary-color-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-color-converter{width:min(520px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-color-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-color-title{font-size:16px;}
    .toolary-color-grid{display:grid;gap:10px;}
    .toolary-color-input-row{display:grid;grid-template-columns:140px 1fr;gap:8px;}
    .toolary-color-actions{display:flex;gap:8px;}
    .toolary-color-label{display:grid;gap:6px;}
    .toolary-color-caption{font-size:12px;opacity:.85;}
    .toolary-color-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-color-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-color-btn{border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-color-btn--close{padding:4px 10px;}
    .toolary-color-btn--primary{flex:1;}
    .toolary-color-output{background:var(--toolary-color-muted-bg,rgba(127,127,127,.08));}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'colorConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);
  if (isDark) {
    return { bg: '#2b2b2b', text: '#f5f5f5', border: '#4b5563', controlBg: '#1f2937', mutedBg: 'rgba(255,255,255,.08)' };
  }
  return { bg: '#ffffff', text: '#111111', border: '#d1d5db', controlBg: '#ffffff', mutedBg: 'rgba(127,127,127,.08)' };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(raw) {
  const value = String(raw || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(value)) return null;
  const normalized = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function parseRgb(raw) {
  const parts = String(raw || '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) return null;
  const [r, g, b] = parts.map((v) => clamp(Math.round(v), 0, 255));
  return { r, g, b };
}

function parseHsl(raw) {
  const parts = String(raw || '').replace(/%/g, '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) return null;
  const h = ((parts[0] % 360) + 360) % 360;
  const s = clamp(parts[1], 0, 100);
  const l = clamp(parts[2], 0, 100);
  return { h, s, l };
}

function parseCmyk(raw) {
  const parts = String(raw || '').replace(/%/g, '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return null;
  const [c, m, y, k] = parts.map((v) => clamp(v, 0, 100));
  return { c, m, y, k };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs((2 * l) - 1));
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * (((bn - rn) / delta) + 2);
    else h = 60 * (((rn - gn) / delta) + 4);
  }
  return { h: Math.round((h + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs((2 * ln) - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - (c / 2);
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}

function rgbToCmyk({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = ((1 - rn - k) / (1 - k)) * 100;
  const m = ((1 - gn - k) / (1 - k)) * 100;
  const y = ((1 - bn - k) / (1 - k)) * 100;
  return { c: Math.round(c), m: Math.round(m), y: Math.round(y), k: Math.round(k * 100) };
}

function cmykToRgb({ c, m, y, k }) {
  const cn = c / 100;
  const mn = m / 100;
  const yn = y / 100;
  const kn = k / 100;
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn))
  };
}

function parseToRgb(format, value) {
  if (format === 'hex') return parseHex(value);
  if (format === 'rgb') return parseRgb(value);
  if (format === 'hsl') {
    const parsed = parseHsl(value);
    return parsed ? hslToRgb(parsed) : null;
  }
  if (format === 'cmyk') {
    const parsed = parseCmyk(value);
    return parsed ? cmykToRgb(parsed) : null;
  }
  return null;
}

function setResult({ hex = '', rgb = '', hsl = '', cmyk = '' }) {
  const hexEl = panel?.querySelector('#toolary-color-result-hex');
  const rgbEl = panel?.querySelector('#toolary-color-result-rgb');
  const hslEl = panel?.querySelector('#toolary-color-result-hsl');
  const cmykEl = panel?.querySelector('#toolary-color-result-cmyk');
  if (hexEl) hexEl.value = hex;
  if (rgbEl) rgbEl.value = rgb;
  if (hslEl) hslEl.value = hsl;
  if (cmykEl) cmykEl.value = cmyk;
}

function runConversion() {
  const format = panel?.querySelector('#toolary-color-format')?.value || 'hex';
  const value = panel?.querySelector('#toolary-color-input')?.value || '';
  const rgb = parseToRgb(format, value);
  if (!rgb) {
    setResult({ hex: '', rgb: '', hsl: '', cmyk: '' });
    lastResultText = '';
    showError(t('colorConverterInvalidInput') || 'Invalid color value.');
    return;
  }

  const hex = rgbToHex(rgb);
  const hsl = rgbToHsl(rgb);
  const cmyk = rgbToCmyk(rgb);
  const rgbText = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  const hslText = `${hsl.h}, ${hsl.s}%, ${hsl.l}%`;
  const cmykText = `${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%`;

  setResult({ hex, rgb: rgbText, hsl: hslText, cmyk: cmykText });
  lastResultText = `HEX: ${hex}\nRGB: ${rgbText}\nHSL: ${hslText}\nCMYK: ${cmykText}`;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-color-converter-overlay';
  overlay.style.setProperty('--toolary-color-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-color-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-color-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-color-header">
      <strong class="toolary-color-title">${t('colorConverterTitle') || 'Color Converter'}</strong>
      <button id="toolary-color-close" class="toolary-color-btn toolary-color-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-color-grid">
      <div class="toolary-color-input-row">
        <select id="toolary-color-format" class="toolary-color-control">
          ${FORMAT_OPTIONS.map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}
        </select>
        <input id="toolary-color-input" class="toolary-color-control" type="text" placeholder="${t('colorConverterInputPlaceholder') || '#FF8800 / 255,136,0 / 32,100,50 / 0,47,100,0'}" />
      </div>
      <div class="toolary-color-actions">
        <button id="toolary-color-convert" class="toolary-color-btn toolary-color-btn--primary" type="button">${t('colorConverterConvert') || 'Convert'}</button>
        <button id="toolary-color-copy" class="toolary-color-btn" type="button">${t('colorConverterCopyAll') || 'Copy All'}</button>
      </div>
      <label class="toolary-color-label">
        <span class="toolary-color-caption">${t('colorConverterHexLabel') || 'HEX'}</span>
        <input id="toolary-color-result-hex" class="toolary-color-control toolary-color-output" type="text" readonly />
      </label>
      <label class="toolary-color-label">
        <span class="toolary-color-caption">${t('colorConverterRgbLabel') || 'RGB'}</span>
        <input id="toolary-color-result-rgb" class="toolary-color-control toolary-color-output" type="text" readonly />
      </label>
      <label class="toolary-color-label">
        <span class="toolary-color-caption">${t('colorConverterHslLabel') || 'HSL'}</span>
        <input id="toolary-color-result-hsl" class="toolary-color-control toolary-color-output" type="text" readonly />
      </label>
      <label class="toolary-color-label">
        <span class="toolary-color-caption">${t('colorConverterCmykLabel') || 'CMYK'}</span>
        <input id="toolary-color-result-cmyk" class="toolary-color-control toolary-color-output" type="text" readonly />
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

    const closeBtn = panel.querySelector('#toolary-color-close');
    const inputEl = panel.querySelector('#toolary-color-input');
    const convertBtn = panel.querySelector('#toolary-color-convert');
    const copyBtn = panel.querySelector('#toolary-color-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResultText) {
        showError(t('colorConverterNothingToCopy') || 'No converted values to copy.');
        return;
      }
      await copyText(lastResultText);
      showSuccess(t('colorConverterCopied') || 'Values copied.');
      showCoffeeMessageForTool('color-converter');
    }));

    inputEl.focus();
  } catch (error) {
    handleError(error, 'colorConverter.activate');
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
  lastResultText = '';
  deactivateCb = null;
}
