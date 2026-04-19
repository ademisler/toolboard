import {
  addEventListenerWithCleanup,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'svg-to-png-converter',
  name: 'SVG to PNG Converter',
  category: 'converters',
  icon: 'svg-png',
  permissions: ['activeTab'],
  tags: ['converter', 'svg', 'png', 'vector', 'image'],
  keywords: ['svg to png', 'vector', 'raster', 'scale', 'export']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let resultBlob = null;
let resultUrl = '';
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'svgToPngConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function cleanupUrls() {
  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = '';
  }
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
      mutedBg: 'rgba(255,255,255,.08)'
    };
  }
  return {
    bg: '#ffffff',
    text: '#111111',
    border: '#d1d5db',
    controlBg: '#ffffff',
    mutedBg: 'rgba(127,127,127,.08)'
  };
}

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-svg-png-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-svg-png-styles';
  style.textContent = `
    .toolary-svg-png-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-svg-png-dialog { width: min(980px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-svg-png-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-svg-png-title { font-size: 16px; font-weight: 700; }
    .toolary-svg-png-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); }
    .toolary-svg-png-label { display: grid; gap: 6px; }
    .toolary-svg-png-label-text { font-size: 12px; opacity: .85; }
    .toolary-svg-png-input, .toolary-svg-png-select, .toolary-svg-png-textarea { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-svg-png-checkbox { display: flex; align-items: center; gap: 8px; padding-top: 20px; }
    .toolary-svg-png-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-svg-png-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-svg-png-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-svg-png-main { display: grid; gap: 10px; grid-template-columns: 1.2fr .8fr; }
    .toolary-svg-png-textarea { resize: vertical; }
    .toolary-svg-png-side { display: grid; gap: 10px; }
    .toolary-svg-png-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 8px; background: var(--toolary-control-bg); }
    .toolary-svg-png-card-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .toolary-svg-png-card-title { font-size: 12px; }
    .toolary-svg-png-card-meta { font-size: 12px; opacity: .85; }
    .toolary-svg-png-card-note { font-size: 12px; opacity: .75; }
    .toolary-svg-png-preview { width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; background: var(--toolary-muted-bg); }
    @media (max-width: 900px) { .toolary-svg-png-main { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-svg-png-status');
  if (el) el.textContent = text || '';
}

function setMeta(selector, text) {
  const el = panel?.querySelector(selector);
  if (el) el.textContent = text || '-';
}

function parseSvgDimensions(svgEl) {
  const widthAttr = svgEl.getAttribute('width');
  const heightAttr = svgEl.getAttribute('height');
  const viewBox = svgEl.getAttribute('viewBox');

  const parseNum = (v) => {
    if (!v) return null;
    const n = Number.parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  let width = parseNum(widthAttr);
  let height = parseNum(heightAttr);

  if ((!width || !height) && viewBox) {
    const parts = viewBox.split(/\s+/).map(Number.parseFloat);
    if (parts.length === 4) {
      const vbW = parts[2];
      const vbH = parts[3];
      if (!width && Number.isFinite(vbW) && vbW > 0) width = vbW;
      if (!height && Number.isFinite(vbH) && vbH > 0) height = vbH;
    }
  }

  if (!width) width = 512;
  if (!height) height = 512;
  return { width, height };
}

function validateSvg(svgText) {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(t('svgToPngConverterInvalidSvg') || 'Invalid SVG content.');
  }

  const svgEl = doc.documentElement;
  if (!svgEl || String(svgEl.nodeName).toLowerCase() !== 'svg') {
    throw new Error(t('svgToPngConverterInvalidSvg') || 'Invalid SVG content.');
  }

  return svgEl;
}

function svgToImage(svgText) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t('svgToPngConverterRenderFailed') || 'Could not render SVG.'));
    };

    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t('svgToPngConverterConvertFailed') || 'SVG to PNG conversion failed.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function convertSvg() {
  const textArea = panel?.querySelector('#toolary-svg-png-input');
  const scaleInput = panel?.querySelector('#toolary-svg-png-scale');
  const whiteBg = panel?.querySelector('#toolary-svg-png-white-bg')?.checked;

  const svgText = (textArea?.value || '').trim();
  if (!svgText) {
    showError(t('svgToPngConverterNoInput') || 'Please provide SVG content.');
    return;
  }

  try {
    setStatus(t('svgToPngConverterConverting') || 'Converting SVG...');
    const svgEl = validateSvg(svgText);
    const scale = Math.max(1, Math.min(6, Number.parseInt(scaleInput?.value || '1', 10) || 1));
    const { width, height } = parseSvgDimensions(svgEl);
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const img = await svgToImage(svgText);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('svgToPngConverterCanvasUnavailable') || 'Canvas rendering is unavailable.');

    if (whiteBg) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }

    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await canvasToBlob(canvas);
    resultBlob = blob;

    cleanupUrls();
    resultUrl = URL.createObjectURL(blob);

    const preview = panel?.querySelector('#toolary-svg-png-preview-output');
    if (preview) preview.src = resultUrl;

    setMeta('#toolary-svg-png-input-meta', `${Math.round(new Blob([svgText]).size / 1024)} KB`);
    setMeta('#toolary-svg-png-output-meta', `${outW}×${outH} • ${Math.round(blob.size / 1024)} KB`);

    const downloadBtn = panel?.querySelector('#toolary-svg-png-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('svgToPngConverterReady') || 'Conversion completed. Ready to download.');
  } catch (error) {
    handleError(error, 'svgToPngConverter.convertSvg');
    setStatus('');
    showError(error.message || t('svgToPngConverterConvertFailed') || 'SVG to PNG conversion failed.');
  }
}

function downloadResult() {
  if (!resultBlob || !resultUrl) {
    showError(t('svgToPngConverterNothingToDownload') || 'No PNG output to download.');
    return;
  }

  const filename = 'converted-image.png';
  const link = document.createElement('a');
  link.href = resultUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('svgToPngConverterDownloaded') || 'PNG downloaded.');
  showCoffeeMessageForTool('svg-to-png-converter');
}

async function handleFileSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!isSvg) {
    showError(t('svgToPngConverterInvalidFile') || 'Please select an SVG file.');
    return;
  }

  try {
    const text = await file.text();
    validateSvg(text);

    const input = panel?.querySelector('#toolary-svg-png-input');
    if (input) input.value = text;
    setMeta('#toolary-svg-png-input-meta', `${Math.round(file.size / 1024)} KB`);
    setStatus(t('svgToPngConverterFileReady') || 'SVG loaded. Click Convert.');
  } catch (error) {
    handleError(error, 'svgToPngConverter.handleFileSelected');
    showError(error.message || t('svgToPngConverterInvalidSvg') || 'Invalid SVG content.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-svg-png-converter-overlay';
  overlay.className = 'toolary-svg-png-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-svg-png-converter';
  dialog.className = 'toolary-svg-png-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-svg-png-header">
      <strong class="toolary-svg-png-title">${t('svgToPngConverterTitle') || 'SVG to PNG Converter'}</strong>
      <button id="toolary-svg-png-close" type="button" class="toolary-svg-png-btn">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-svg-png-grid">
      <label class="toolary-svg-png-label">
        <span class="toolary-svg-png-label-text">${t('svgToPngConverterSourceSvg') || 'Source SVG'}</span>
        <input id="toolary-svg-png-file" type="file" accept=".svg,image/svg+xml" class="toolary-svg-png-input" />
      </label>

      <label class="toolary-svg-png-label">
        <span class="toolary-svg-png-label-text">${t('svgToPngConverterScale') || 'Scale'}</span>
        <select id="toolary-svg-png-scale" class="toolary-svg-png-select">
          <option value="1">1x</option>
          <option value="2" selected>2x</option>
          <option value="3">3x</option>
          <option value="4">4x</option>
        </select>
      </label>

      <label class="toolary-svg-png-checkbox">
        <input id="toolary-svg-png-white-bg" type="checkbox" />
        <span>${t('svgToPngConverterWhiteBackground') || 'White background'}</span>
      </label>
    </div>

    <div class="toolary-svg-png-actions">
      <button id="toolary-svg-png-convert" type="button" class="toolary-svg-png-btn">${t('svgToPngConverterConvert') || 'Convert to PNG'}</button>
      <button id="toolary-svg-png-download" type="button" disabled class="toolary-svg-png-btn">${t('svgToPngConverterDownload') || 'Download PNG'}</button>
    </div>

    <div id="toolary-svg-png-status" class="toolary-svg-png-status">${t('svgToPngConverterHint') || 'Paste SVG or select an SVG file to start.'}</div>

    <div class="toolary-svg-png-main">
      <label class="toolary-svg-png-label">
        <span class="toolary-svg-png-label-text">${t('svgToPngConverterSvgInput') || 'SVG Input'}</span>
        <textarea id="toolary-svg-png-input" rows="16" placeholder="${t('svgToPngConverterInputPlaceholder') || 'Paste SVG markup here...'}" class="toolary-svg-png-textarea"></textarea>
      </label>

      <div class="toolary-svg-png-side">
        <div class="toolary-svg-png-card">
          <div class="toolary-svg-png-card-head">
            <strong class="toolary-svg-png-card-title">${t('svgToPngConverterInputMeta') || 'Input'}</strong>
            <span id="toolary-svg-png-input-meta" class="toolary-svg-png-card-meta">-</span>
          </div>
          <div class="toolary-svg-png-card-note">SVG</div>
        </div>

        <div class="toolary-svg-png-card">
          <div class="toolary-svg-png-card-head">
            <strong class="toolary-svg-png-card-title">${t('svgToPngConverterOutputMeta') || 'Output'}</strong>
            <span id="toolary-svg-png-output-meta" class="toolary-svg-png-card-meta">-</span>
          </div>
          <img id="toolary-svg-png-preview-output" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-svg-png-preview" />
        </div>
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

    if (panel) {
      panel.remove();
      panel = null;
    }

    createPanel();

    const closeBtn = panel.querySelector('#toolary-svg-png-close');
    const fileInput = panel.querySelector('#toolary-svg-png-file');
    const convertBtn = panel.querySelector('#toolary-svg-png-convert');
    const downloadBtn = panel.querySelector('#toolary-svg-png-download');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleFileSelected));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', convertSvg));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadResult));
  } catch (error) {
    handleError(error, 'svgToPngConverter.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupUrls();
  if (panel) {
    panel.remove();
    panel = null;
  }
  resultBlob = null;
  deactivateCb = null;
}
