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
  id: 'json-yaml-converter',
  name: 'JSON ↔ YAML Converter',
  category: 'converters',
  icon: 'json-yaml',
  permissions: ['activeTab'],
  tags: ['converter', 'json', 'yaml', 'yml', 'data'],
  keywords: ['json', 'yaml', 'yml', 'parse', 'serialize']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-json-yaml-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-json-yaml-converter-styles';
  style.textContent = `
    #toolary-json-yaml-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-json-yaml-converter{width:min(860px,100%);max-height:min(92vh,920px);overflow:auto;border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-json-yaml-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
    .toolary-json-yaml-title{font-size:16px;}
    .toolary-json-yaml-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px;}
    .toolary-json-yaml-label{display:grid;gap:6px;}
    .toolary-json-yaml-label--mode{min-width:240px;}
    .toolary-json-yaml-caption{font-size:12px;opacity:.85;}
    .toolary-json-yaml-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-json-yaml-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-json-yaml-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-json-yaml-btn--close{height:auto;padding:4px 10px;}
    .toolary-json-yaml-note{font-size:12px;opacity:.9;margin-bottom:10px;padding:8px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-json-yaml-info-bg,rgba(59,130,246,.1));}
    .toolary-json-yaml-panels{display:grid;gap:10px;grid-template-columns:1fr 1fr;}
    .toolary-json-yaml-textarea{resize:vertical;min-height:300px;}
    .toolary-json-yaml-output{background:var(--toolary-json-yaml-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:860px){.toolary-json-yaml-panels{grid-template-columns:1fr;}.toolary-json-yaml-textarea{min-height:200px;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'jsonYamlConverter.clearCleanup');
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

function formatYamlScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : JSON.stringify(value);

  const text = String(value);
  if (text === '') return '""';

  const needsQuotes = /[:#\n\r\t\[\]{}&,*!?|>'"%@`]|^\s|\s$/.test(text) || /^(true|false|null|~)$/i.test(text) || /^-?\d+(\.\d+)?$/.test(text);
  if (needsQuotes) return JSON.stringify(text);
  return text;
}

function toYAML(value, indent = 0) {
  const pad = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    return value.map((item) => {
      if (item !== null && typeof item === 'object') {
        const nested = toYAML(item, indent + 2);
        return `${pad}-\n${nested}`;
      }
      return `${pad}- ${formatYamlScalar(item)}`;
    }).join('\n');
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries.map(([key, val]) => {
      const safeKey = /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
      if (val !== null && typeof val === 'object') {
        const nested = toYAML(val, indent + 2);
        return `${pad}${safeKey}:\n${nested}`;
      }
      return `${pad}${safeKey}: ${formatYamlScalar(val)}`;
    }).join('\n');
  }

  return `${pad}${formatYamlScalar(value)}`;
}

function stripInlineComment(text) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && !inSingle && text[i - 1] !== '\\') inDouble = !inDouble;
    if (ch === '\'' && !inDouble) inSingle = !inSingle;
    if (ch === '#' && !inSingle && !inDouble) return text.slice(0, i).trimEnd();
  }
  return text;
}

function parseYamlScalar(raw) {
  const value = stripInlineComment(String(raw || '').trim());
  if (value === '') return '';
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    if (value.startsWith('"')) {
      return JSON.parse(value);
    }
    return value.slice(1, -1).replace(/''/g, '\'');
  }

  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function firstColonIndex(text) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && !inSingle && text[i - 1] !== '\\') inDouble = !inDouble;
    if (ch === '\'' && !inDouble) inSingle = !inSingle;
    if (ch === ':' && !inSingle && !inDouble) return i;
  }
  return -1;
}

function preprocessYaml(text) {
  return String(text || '')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => line.replace(/\r/g, ''));
}

function parseYAML(yamlText) {
  const lines = preprocessYaml(yamlText);

  function nextContentIndex(startIndex) {
    let i = startIndex;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed && !trimmed.startsWith('#')) return i;
      i += 1;
    }
    return i;
  }

  function countIndent(line) {
    let i = 0;
    while (i < line.length && line[i] === ' ') i += 1;
    return i;
  }

  function parseBlock(startIndex, indent) {
    let index = nextContentIndex(startIndex);
    if (index >= lines.length) return { value: null, index };

    const firstLine = lines[index];
    const firstIndent = countIndent(firstLine);
    if (firstIndent < indent) return { value: null, index };
    if (firstIndent > indent) throw new Error(t('jsonYamlConverterIndentError') || 'Invalid indentation.');

    const trimmed = firstLine.slice(indent).trimStart();
    const isArray = trimmed.startsWith('- ');

    if (isArray) {
      const result = [];

      while (index < lines.length) {
        index = nextContentIndex(index);
        if (index >= lines.length) break;

        const line = lines[index];
        const lineIndent = countIndent(line);
        if (lineIndent < indent) break;
        if (lineIndent > indent) throw new Error(t('jsonYamlConverterIndentError') || 'Invalid indentation.');

        const body = line.slice(indent).trimStart();
        if (!body.startsWith('- ')) break;

        const rest = body.slice(2).trim();
        index += 1;

        if (!rest) {
          const nested = parseBlock(index, indent + 2);
          result.push(nested.value);
          index = nested.index;
          continue;
        }

        const colonPos = firstColonIndex(rest);
        if (colonPos > 0) {
          const key = rest.slice(0, colonPos).trim().replace(/^['"]|['"]$/g, '');
          const valuePart = rest.slice(colonPos + 1).trim();
          const obj = {};

          if (valuePart === '') {
            const nested = parseBlock(index, indent + 2);
            obj[key] = nested.value;
            index = nested.index;
          } else {
            obj[key] = parseYamlScalar(valuePart);
            const extra = parseBlock(index, indent + 2);
            if (extra.value && typeof extra.value === 'object' && !Array.isArray(extra.value)) {
              Object.assign(obj, extra.value);
              index = extra.index;
            }
          }

          result.push(obj);
          continue;
        }

        result.push(parseYamlScalar(rest));
      }

      return { value: result, index };
    }

    const map = {};
    while (index < lines.length) {
      index = nextContentIndex(index);
      if (index >= lines.length) break;

      const line = lines[index];
      const lineIndent = countIndent(line);
      if (lineIndent < indent) break;
      if (lineIndent > indent) throw new Error(t('jsonYamlConverterIndentError') || 'Invalid indentation.');

      const body = stripInlineComment(line.slice(indent));
      if (!body.trim()) {
        index += 1;
        continue;
      }

      if (body.trimStart().startsWith('- ')) {
        throw new Error(t('jsonYamlConverterMixedTypeError') || 'Cannot mix list and object at the same indentation level.');
      }

      const colonPos = firstColonIndex(body);
      if (colonPos <= 0) {
        throw new Error(t('jsonYamlConverterInvalidLine') || 'Invalid YAML line.');
      }

      const keyRaw = body.slice(0, colonPos).trim();
      const key = keyRaw.replace(/^['"]|['"]$/g, '');
      const valuePart = body.slice(colonPos + 1).trim();
      index += 1;

      if (valuePart === '') {
        const nested = parseBlock(index, indent + 2);
        map[key] = nested.value;
        index = nested.index;
      } else {
        map[key] = parseYamlScalar(valuePart);
      }
    }

    return { value: map, index };
  }

  const parsed = parseBlock(0, 0);
  return parsed.value;
}

function convert() {
  const input = panel?.querySelector('#toolary-json-yaml-input')?.value || '';
  const mode = panel?.querySelector('#toolary-json-yaml-mode')?.value || 'json-to-yaml';

  if (!input.trim()) {
    showError(t('jsonYamlConverterEmptyInput') || 'Please enter data to convert.');
    return;
  }

  try {
    let output = '';
    if (mode === 'json-to-yaml') {
      const parsed = JSON.parse(input);
      output = toYAML(parsed);
    } else {
      const parsed = parseYAML(input);
      output = JSON.stringify(parsed, null, 2);
    }

    lastResult = output;
    const outputEl = panel?.querySelector('#toolary-json-yaml-output');
    if (outputEl) outputEl.value = output;
  } catch (error) {
    handleError(error, 'jsonYamlConverter.convert');
    showError(`${t('jsonYamlConverterFailed') || 'Conversion failed.'} ${error.message || ''}`.trim());
  }
}

function swapValues() {
  const inputEl = panel?.querySelector('#toolary-json-yaml-input');
  const outputEl = panel?.querySelector('#toolary-json-yaml-output');
  if (!inputEl || !outputEl) return;

  const oldInput = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = oldInput;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-json-yaml-converter-overlay';
  overlay.style.setProperty('--toolary-json-yaml-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-json-yaml-muted-bg', theme.mutedBg);
  overlay.style.setProperty('--toolary-json-yaml-info-bg', theme.infoBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-json-yaml-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-json-yaml-header">
      <strong class="toolary-json-yaml-title">${t('jsonYamlConverterTitle') || 'JSON ↔ YAML Converter'}</strong>
      <button id="toolary-json-yaml-close" class="toolary-json-yaml-btn toolary-json-yaml-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-json-yaml-toolbar">
      <label class="toolary-json-yaml-label toolary-json-yaml-label--mode">
        <span class="toolary-json-yaml-caption">${t('jsonYamlConverterMode') || 'Conversion Direction'}</span>
        <select id="toolary-json-yaml-mode" class="toolary-json-yaml-control">
          <option value="json-to-yaml">${t('jsonYamlConverterJsonToYaml') || 'JSON → YAML'}</option>
          <option value="yaml-to-json">${t('jsonYamlConverterYamlToJson') || 'YAML → JSON'}</option>
        </select>
      </label>
      <button id="toolary-json-yaml-convert" class="toolary-json-yaml-btn" type="button">${t('jsonYamlConverterConvert') || 'Convert'}</button>
      <button id="toolary-json-yaml-swap" class="toolary-json-yaml-btn" type="button">${t('jsonYamlConverterSwap') || 'Swap'}</button>
      <button id="toolary-json-yaml-copy" class="toolary-json-yaml-btn" type="button">${t('jsonYamlConverterCopyResult') || 'Copy Result'}</button>
    </div>

    <div class="toolary-json-yaml-note">
      ${t('jsonYamlConverterHint') || 'Supports common YAML structures (objects, arrays, scalar values).'}
    </div>

    <div class="toolary-json-yaml-panels">
      <label class="toolary-json-yaml-label">
        <span class="toolary-json-yaml-caption">${t('jsonYamlConverterInput') || 'Input'}</span>
        <textarea id="toolary-json-yaml-input" rows="14" class="toolary-json-yaml-control toolary-json-yaml-textarea" placeholder="${t('jsonYamlConverterInputPlaceholder') || 'Paste JSON or YAML here...'}"></textarea>
      </label>

      <label class="toolary-json-yaml-label">
        <span class="toolary-json-yaml-caption">${t('jsonYamlConverterOutput') || 'Output'}</span>
        <textarea id="toolary-json-yaml-output" rows="14" readonly class="toolary-json-yaml-control toolary-json-yaml-textarea toolary-json-yaml-output"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-json-yaml-close');
    const convertBtn = panel.querySelector('#toolary-json-yaml-convert');
    const swapBtn = panel.querySelector('#toolary-json-yaml-swap');
    const copyBtn = panel.querySelector('#toolary-json-yaml-copy');
    const inputEl = panel.querySelector('#toolary-json-yaml-input');

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
        showError(t('jsonYamlConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('jsonYamlConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('json-yaml-converter');
    }));
  } catch (error) {
    handleError(error, 'jsonYamlConverter.activate');
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
