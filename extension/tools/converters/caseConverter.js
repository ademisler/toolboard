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
  id: 'case-converter',
  name: 'Case Converter',
  category: 'converters',
  icon: 'text-case',
  permissions: ['activeTab'],
  tags: ['converter', 'text', 'case', 'string'],
  keywords: ['uppercase', 'lowercase', 'title case', 'camel case', 'snake case']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-case-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-case-converter-styles';
  style.textContent = `
    #toolary-case-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-case-converter{width:min(620px,100%);border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-case-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-case-title{font-size:16px;}
    .toolary-case-grid{display:grid;gap:10px;}
    .toolary-case-label{display:grid;gap:6px;}
    .toolary-case-caption{font-size:12px;opacity:.85;}
    .toolary-case-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-case-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-case-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end;}
    .toolary-case-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-case-btn--close{height:auto;padding:4px 10px;}
    .toolary-case-textarea{resize:vertical;}
    .toolary-case-output{background:var(--toolary-case-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:700px){.toolary-case-row{grid-template-columns:1fr;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'caseConverter.clearCleanup');
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

function wordsFromText(text) {
  return String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function toTitleCase(text) {
  return text
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function toSentenceCase(text) {
  const normalized = text.toLowerCase();
  return normalized.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
}

function toCamelCase(text) {
  const words = wordsFromText(text).map((w) => w.toLowerCase());
  if (!words.length) return '';
  return words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

function toPascalCase(text) {
  return wordsFromText(text)
    .map((w) => {
      const lower = w.toLowerCase();
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join('');
}

function toSnakeCase(text) {
  return wordsFromText(text).map((w) => w.toLowerCase()).join('_');
}

function toKebabCase(text) {
  return wordsFromText(text).map((w) => w.toLowerCase()).join('-');
}

function setResult(text) {
  const outputEl = panel?.querySelector('#toolary-case-output');
  if (outputEl) outputEl.value = text;
}

function runConversion() {
  const input = panel?.querySelector('#toolary-case-input')?.value || '';
  const mode = panel?.querySelector('#toolary-case-mode')?.value || 'lower';

  if (!input.trim()) {
    lastResult = '';
    setResult('');
    showError(t('caseConverterEmptyInput') || 'Please enter text.');
    return;
  }

  let result = input;
  if (mode === 'lower') result = input.toLowerCase();
  if (mode === 'upper') result = input.toUpperCase();
  if (mode === 'title') result = toTitleCase(input);
  if (mode === 'sentence') result = toSentenceCase(input);
  if (mode === 'camel') result = toCamelCase(input);
  if (mode === 'pascal') result = toPascalCase(input);
  if (mode === 'snake') result = toSnakeCase(input);
  if (mode === 'kebab') result = toKebabCase(input);

  lastResult = result;
  setResult(result);
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-case-converter-overlay';
  overlay.style.setProperty('--toolary-case-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-case-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-case-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-case-header">
      <strong class="toolary-case-title">${t('caseConverterTitle') || 'Case Converter'}</strong>
      <button id="toolary-case-close" class="toolary-case-btn toolary-case-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-case-grid">
      <label class="toolary-case-label">
        <span class="toolary-case-caption">${t('caseConverterInput') || 'Input'}</span>
        <textarea id="toolary-case-input" rows="5" class="toolary-case-control toolary-case-textarea" placeholder="${t('caseConverterInputPlaceholder') || 'Enter text...'}"></textarea>
      </label>
      <div class="toolary-case-row">
        <label class="toolary-case-label">
          <span class="toolary-case-caption">${t('caseConverterMode') || 'Case Type'}</span>
          <select id="toolary-case-mode" class="toolary-case-control">
            <option value="lower">${t('caseConverterLower') || 'lowercase'}</option>
            <option value="upper">${t('caseConverterUpper') || 'UPPERCASE'}</option>
            <option value="title">${t('caseConverterTitleCase') || 'Title Case'}</option>
            <option value="sentence">${t('caseConverterSentence') || 'Sentence case'}</option>
            <option value="camel">${t('caseConverterCamel') || 'camelCase'}</option>
            <option value="pascal">${t('caseConverterPascal') || 'PascalCase'}</option>
            <option value="snake">${t('caseConverterSnake') || 'snake_case'}</option>
            <option value="kebab">${t('caseConverterKebab') || 'kebab-case'}</option>
          </select>
        </label>
        <button id="toolary-case-convert" class="toolary-case-btn" type="button">${t('caseConverterConvert') || 'Convert'}</button>
        <button id="toolary-case-copy" class="toolary-case-btn" type="button">${t('caseConverterCopyResult') || 'Copy Result'}</button>
      </div>
      <label class="toolary-case-label">
        <span class="toolary-case-caption">${t('caseConverterOutput') || 'Output'}</span>
        <textarea id="toolary-case-output" rows="5" readonly class="toolary-case-control toolary-case-textarea toolary-case-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-case-close');
    const convertBtn = panel.querySelector('#toolary-case-convert');
    const copyBtn = panel.querySelector('#toolary-case-copy');
    const modeEl = panel.querySelector('#toolary-case-mode');
    const inputEl = panel.querySelector('#toolary-case-input');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(modeEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runConversion();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('caseConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('caseConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('case-converter');
    }));
  } catch (error) {
    handleError(error, 'caseConverter.activate');
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
