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
  id: 'xml-json-converter',
  name: 'XML ↔ JSON Converter',
  category: 'converters',
  icon: 'xml-json',
  permissions: ['activeTab'],
  tags: ['converter', 'xml', 'json', 'data', 'markup'],
  keywords: ['xml', 'json', 'attributes', 'nodes', 'parse']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-xml-json-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-xml-json-converter-styles';
  style.textContent = `
    #toolary-xml-json-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-xml-json-converter{width:min(920px,100%);max-height:min(92vh,920px);overflow:auto;border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-xml-json-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
    .toolary-xml-json-title{font-size:16px;}
    .toolary-xml-json-grid{display:grid;gap:10px;margin-bottom:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));}
    .toolary-xml-json-label{display:grid;gap:6px;}
    .toolary-xml-json-inline-label{display:flex;align-items:center;gap:8px;padding-top:20px;}
    .toolary-xml-json-caption{font-size:12px;opacity:.85;}
    .toolary-xml-json-inline-label span{font-size:13px;}
    .toolary-xml-json-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-xml-json-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-xml-json-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
    .toolary-xml-json-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-xml-json-note{font-size:12px;opacity:.9;margin-bottom:10px;padding:8px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-xml-json-info-bg,rgba(59,130,246,.1));}
    .toolary-xml-json-panels{display:grid;gap:10px;grid-template-columns:1fr 1fr;}
    .toolary-xml-json-textarea{resize:vertical;min-height:300px;}
    #toolary-xml-json-output{background:var(--toolary-xml-json-muted-bg,rgba(127,127,127,.08));}
    @media (max-width:840px){.toolary-xml-json-panels{grid-template-columns:1fr;}.toolary-xml-json-textarea{min-height:200px;}}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'xmlJsonConverter.clearCleanup');
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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function coerceValue(text) {
  const value = String(text ?? '').trim();
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function elementToJson(element, typeCast) {
  const result = {};

  if (element.attributes && element.attributes.length) {
    const attrs = {};
    Array.from(element.attributes).forEach((attr) => {
      attrs[attr.name] = typeCast ? coerceValue(attr.value) : attr.value;
    });
    result['@attributes'] = attrs;
  }

  const children = Array.from(element.childNodes || []);
  const textNodes = children.filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.nodeValue || '').join('').trim();
  const elementNodes = children.filter((n) => n.nodeType === Node.ELEMENT_NODE);

  if (!elementNodes.length) {
    if (textNodes) {
      if (Object.keys(result).length) {
        result['#text'] = typeCast ? coerceValue(textNodes) : textNodes;
        return result;
      }
      return typeCast ? coerceValue(textNodes) : textNodes;
    }
    return Object.keys(result).length ? result : '';
  }

  elementNodes.forEach((child) => {
    const childJson = elementToJson(child, typeCast);
    const tag = child.nodeName;
    if (Object.prototype.hasOwnProperty.call(result, tag)) {
      if (!Array.isArray(result[tag])) result[tag] = [result[tag]];
      result[tag].push(childJson);
    } else {
      result[tag] = childJson;
    }
  });

  if (textNodes) {
    result['#text'] = typeCast ? coerceValue(textNodes) : textNodes;
  }

  return result;
}

function xmlToJson(xmlText, typeCast) {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(t('xmlJsonConverterInvalidXml') || 'Invalid XML input.');
  }

  const root = doc.documentElement;
  if (!root) throw new Error(t('xmlJsonConverterInvalidXml') || 'Invalid XML input.');

  return {
    [root.nodeName]: elementToJson(root, typeCast)
  };
}

function buildXmlNode(name, value, pretty, level) {
  const indent = pretty ? '  '.repeat(level) : '';
  const newline = pretty ? '\n' : '';

  if (value === null || value === undefined) {
    return `${indent}<${name}></${name}>`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => buildXmlNode(name, item, pretty, level)).join(newline);
  }

  if (typeof value !== 'object') {
    return `${indent}<${name}>${escapeXml(value)}</${name}>`;
  }

  const attrs = value['@attributes'] && typeof value['@attributes'] === 'object'
    ? Object.entries(value['@attributes']).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')
    : '';

  const attrText = attrs ? ` ${attrs}` : '';
  const textContent = Object.prototype.hasOwnProperty.call(value, '#text') ? value['#text'] : null;
  const childEntries = Object.entries(value).filter(([k]) => k !== '@attributes' && k !== '#text');

  if (!childEntries.length && (textContent === null || textContent === undefined || textContent === '')) {
    return `${indent}<${name}${attrText}></${name}>`;
  }

  const childXml = childEntries.map(([childName, childValue]) => buildXmlNode(childName, childValue, pretty, level + 1)).join(newline);

  if (!childEntries.length) {
    return `${indent}<${name}${attrText}>${escapeXml(textContent)}</${name}>`;
  }

  if (textContent !== null && textContent !== undefined && String(textContent) !== '') {
    const textLine = pretty ? `${'  '.repeat(level + 1)}${escapeXml(textContent)}${newline}` : escapeXml(textContent);
    return `${indent}<${name}${attrText}>${newline}${textLine}${childXml}${newline}${indent}</${name}>`;
  }

  return `${indent}<${name}${attrText}>${newline}${childXml}${newline}${indent}</${name}>`;
}

function jsonToXml(jsonText, pretty, rootNameFallback) {
  const parsed = JSON.parse(jsonText);

  if (typeof parsed !== 'object' || parsed === null) {
    const rootName = rootNameFallback || 'root';
    return buildXmlNode(rootName, parsed, pretty, 0);
  }

  const keys = Object.keys(parsed);
  if (keys.length === 1) {
    const root = keys[0];
    return buildXmlNode(root, parsed[root], pretty, 0);
  }

  const rootName = rootNameFallback || 'root';
  return buildXmlNode(rootName, parsed, pretty, 0);
}

function convert() {
  const input = panel?.querySelector('#toolary-xml-json-input')?.value || '';
  const mode = panel?.querySelector('#toolary-xml-json-mode')?.value || 'xml-to-json';
  const typeCast = Boolean(panel?.querySelector('#toolary-xml-json-typecast')?.checked);
  const prettyXml = Boolean(panel?.querySelector('#toolary-xml-json-pretty')?.checked);
  const rootName = (panel?.querySelector('#toolary-xml-json-root')?.value || '').trim();

  if (!input.trim()) {
    showError(t('xmlJsonConverterEmptyInput') || 'Please enter data to convert.');
    return;
  }

  try {
    const output = mode === 'xml-to-json'
      ? JSON.stringify(xmlToJson(input, typeCast), null, 2)
      : jsonToXml(input, prettyXml, rootName || 'root');

    const outputEl = panel?.querySelector('#toolary-xml-json-output');
    if (outputEl) outputEl.value = output;
    lastResult = output;
  } catch (error) {
    handleError(error, 'xmlJsonConverter.convert');
    showError(`${t('xmlJsonConverterFailed') || 'Conversion failed.'} ${error.message || ''}`.trim());
  }
}

function swapValues() {
  const inputEl = panel?.querySelector('#toolary-xml-json-input');
  const outputEl = panel?.querySelector('#toolary-xml-json-output');
  if (!inputEl || !outputEl) return;

  const oldInput = inputEl.value;
  inputEl.value = outputEl.value;
  outputEl.value = oldInput;
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-xml-json-converter-overlay';
  overlay.style.setProperty('--toolary-xml-json-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-xml-json-info-bg', theme.infoBg);
  overlay.style.setProperty('--toolary-xml-json-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-xml-json-converter';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-xml-json-header">
      <strong class="toolary-xml-json-title">${t('xmlJsonConverterTitle') || 'XML ↔ JSON Converter'}</strong>
      <button id="toolary-xml-json-close" class="toolary-xml-json-btn" type="button">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-xml-json-grid">
      <label class="toolary-xml-json-label">
        <span class="toolary-xml-json-caption">${t('xmlJsonConverterMode') || 'Conversion Direction'}</span>
        <select id="toolary-xml-json-mode" class="toolary-xml-json-control">
          <option value="xml-to-json">${t('xmlJsonConverterXmlToJson') || 'XML → JSON'}</option>
          <option value="json-to-xml">${t('xmlJsonConverterJsonToXml') || 'JSON → XML'}</option>
        </select>
      </label>

      <label class="toolary-xml-json-inline-label">
        <input id="toolary-xml-json-typecast" type="checkbox" checked />
        <span>${t('xmlJsonConverterTypecast') || 'Type-cast primitive values (XML → JSON)'}</span>
      </label>

      <label class="toolary-xml-json-inline-label">
        <input id="toolary-xml-json-pretty" type="checkbox" checked />
        <span>${t('xmlJsonConverterPrettyXml') || 'Pretty XML output (JSON → XML)'}</span>
      </label>

      <label class="toolary-xml-json-label">
        <span class="toolary-xml-json-caption">${t('xmlJsonConverterRootName') || 'Root name (JSON → XML)'}</span>
        <input id="toolary-xml-json-root" class="toolary-xml-json-control" type="text" value="root" />
      </label>
    </div>

    <div class="toolary-xml-json-actions">
      <button id="toolary-xml-json-convert" class="toolary-xml-json-btn" type="button">${t('xmlJsonConverterConvert') || 'Convert'}</button>
      <button id="toolary-xml-json-swap" class="toolary-xml-json-btn" type="button">${t('xmlJsonConverterSwap') || 'Swap'}</button>
      <button id="toolary-xml-json-copy" class="toolary-xml-json-btn" type="button">${t('xmlJsonConverterCopyResult') || 'Copy Result'}</button>
    </div>

    <div class="toolary-xml-json-note">
      ${t('xmlJsonConverterHint') || 'XML attributes map to @attributes and text nodes map to #text.'}
    </div>

    <div class="toolary-xml-json-panels">
      <label class="toolary-xml-json-label">
        <span class="toolary-xml-json-caption">${t('xmlJsonConverterInput') || 'Input'}</span>
        <textarea id="toolary-xml-json-input" rows="14" class="toolary-xml-json-control toolary-xml-json-textarea" placeholder="${t('xmlJsonConverterInputPlaceholder') || 'Paste XML or JSON here...'}"></textarea>
      </label>

      <label class="toolary-xml-json-label">
        <span class="toolary-xml-json-caption">${t('xmlJsonConverterOutput') || 'Output'}</span>
        <textarea id="toolary-xml-json-output" rows="14" readonly class="toolary-xml-json-control toolary-xml-json-textarea"></textarea>
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

    const closeBtn = panel.querySelector('#toolary-xml-json-close');
    const convertBtn = panel.querySelector('#toolary-xml-json-convert');
    const swapBtn = panel.querySelector('#toolary-xml-json-swap');
    const copyBtn = panel.querySelector('#toolary-xml-json-copy');
    const inputEl = panel.querySelector('#toolary-xml-json-input');

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
        showError(t('xmlJsonConverterNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('xmlJsonConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('xml-json-converter');
    }));
  } catch (error) {
    handleError(error, 'xmlJsonConverter.activate');
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
