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
  id: 'heic-converter',
  name: 'HEIC to JPG/PNG',
  category: 'converters',
  icon: 'heic-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'heic', 'heif', 'jpg', 'png', 'image'],
  keywords: ['heic', 'heif', 'iphone photo', 'jpg', 'png', 'convert']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let sourceFile = null;
let sourceImageBitmap = null;
let outputBlob = null;
let outputUrl = '';
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'heicConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function cleanupOutputUrl() {
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = '';
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
  if (stylesInjected || document.getElementById('toolary-heic-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-heic-styles';
  style.textContent = `
    .toolary-heic-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-heic-dialog { width: min(980px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-heic-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-heic-title { font-size: 16px; font-weight: 700; }
    .toolary-heic-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); }
    .toolary-heic-label { display: grid; gap: 6px; }
    .toolary-heic-label-text { font-size: 12px; opacity: .85; }
    .toolary-heic-input, .toolary-heic-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-heic-quality { display: flex; align-items: center; gap: 8px; }
    .toolary-heic-range { flex: 1; }
    .toolary-heic-quality-value { font-size: 12px; min-width: 44px; text-align: right; }
    .toolary-heic-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-heic-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-heic-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-heic-preview-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .toolary-heic-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 8px; background: var(--toolary-control-bg); }
    .toolary-heic-card-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .toolary-heic-card-title { font-size: 12px; }
    .toolary-heic-card-meta { font-size: 12px; opacity: .85; }
    .toolary-heic-preview { width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; background: var(--toolary-muted-bg); }
    @media (max-width: 900px) { .toolary-heic-preview-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-heic-status');
  if (el) el.textContent = text || '';
}

function setMeta(selector, text) {
  const el = panel?.querySelector(selector);
  if (el) el.textContent = text || '-';
}

function updateQualityLabel() {
  const input = panel?.querySelector('#toolary-heic-quality');
  const valueEl = panel?.querySelector('#toolary-heic-quality-value');
  if (!input || !valueEl) return;
  valueEl.textContent = `${Math.round(Number(input.value || 0.92) * 100)}%`;
}

function updateQualityVisibility() {
  const format = panel?.querySelector('#toolary-heic-format')?.value || 'image/jpeg';
  const wrap = panel?.querySelector('#toolary-heic-quality-wrap');
  if (!wrap) return;
  wrap.style.display = format === 'image/jpeg' ? 'grid' : 'none';
}

async function decodeHeicBlob(blob) {
  if (!('createImageBitmap' in window)) {
    throw new Error(t('heicConverterBitmapUnsupported') || 'This browser does not support image decoding for this feature.');
  }

  try {
    return await window.createImageBitmap(blob);
  } catch {
    throw new Error(t('heicConverterDecodeUnsupported') || 'HEIC decode is not supported on this system/browser.');
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t('heicConverterConvertFailed') || 'HEIC conversion failed.'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function suggestFilename(format) {
  const base = (sourceFile?.name || 'image').replace(/\.[a-zA-Z0-9]+$/, '');
  const ext = format === 'image/png' ? 'png' : 'jpg';
  return `${base}-converted.${ext}`;
}

async function convertImage() {
  if (!sourceFile || !sourceImageBitmap) {
    showError(t('heicConverterNoFile') || 'Please choose a HEIC file first.');
    return;
  }

  try {
    setStatus(t('heicConverterConverting') || 'Converting HEIC image...');

    const format = panel?.querySelector('#toolary-heic-format')?.value || 'image/jpeg';
    const quality = Math.min(1, Math.max(0.1, Number(panel?.querySelector('#toolary-heic-quality')?.value || 0.92)));

    const canvas = document.createElement('canvas');
    canvas.width = sourceImageBitmap.width;
    canvas.height = sourceImageBitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('heicConverterCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }

    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(sourceImageBitmap, 0, 0);

    const blob = await canvasToBlob(canvas, format, quality);
    outputBlob = blob;

    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(blob);

    const preview = panel?.querySelector('#toolary-heic-preview-output');
    if (preview) preview.src = outputUrl;

    setMeta('#toolary-heic-output-meta', `${canvas.width}×${canvas.height} • ${Math.round(blob.size / 1024)} KB`);

    const downloadBtn = panel?.querySelector('#toolary-heic-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('heicConverterReady') || 'Conversion complete. Ready to download.');
  } catch (error) {
    handleError(error, 'heicConverter.convertImage');
    setStatus('');
    showError(error.message || t('heicConverterConvertFailed') || 'HEIC conversion failed.');
  }
}

function downloadResult() {
  if (!outputBlob || !outputUrl) {
    showError(t('heicConverterNothingToDownload') || 'No converted output to download.');
    return;
  }

  const format = panel?.querySelector('#toolary-heic-format')?.value || 'image/jpeg';
  const filename = suggestFilename(format);

  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('heicConverterDownloaded') || 'Converted image downloaded.');
  showCoffeeMessageForTool('heic-converter');
}

async function handleFileSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const looksHeic = file.type.includes('heic') || file.type.includes('heif') || /\.hei[cf]$/i.test(file.name);
  if (!looksHeic) {
    showError(t('heicConverterInvalidFile') || 'Please select a HEIC/HEIF file.');
    return;
  }

  try {
    setStatus(t('heicConverterCheckingSupport') || 'Checking HEIC decode support...');

    sourceFile = file;
    outputBlob = null;

    if (sourceImageBitmap && 'close' in sourceImageBitmap) {
      sourceImageBitmap.close();
    }
    sourceImageBitmap = await decodeHeicBlob(file);

    const preview = panel?.querySelector('#toolary-heic-preview-input');
    if (preview) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = sourceImageBitmap.width;
      tempCanvas.height = sourceImageBitmap.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(sourceImageBitmap, 0, 0);
        preview.src = tempCanvas.toDataURL('image/png');
      }
    }

    const outPreview = panel?.querySelector('#toolary-heic-preview-output');
    if (outPreview) outPreview.src = '';

    setMeta('#toolary-heic-input-meta', `${sourceImageBitmap.width}×${sourceImageBitmap.height} • ${Math.round(file.size / 1024)} KB`);
    setMeta('#toolary-heic-output-meta', '-');

    const downloadBtn = panel?.querySelector('#toolary-heic-download');
    if (downloadBtn) downloadBtn.disabled = true;

    setStatus(t('heicConverterFileReady') || 'HEIC file loaded. Click Convert.');
  } catch (error) {
    handleError(error, 'heicConverter.handleFileSelected');
    showError(error.message || t('heicConverterDecodeUnsupported') || 'HEIC decode is not supported on this system/browser.');
    setStatus(t('heicConverterUnsupportedHint') || 'Try converting HEIC in Photos/Preview first if decode support is unavailable.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-heic-converter-overlay';
  overlay.className = 'toolary-heic-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-heic-converter';
  dialog.className = 'toolary-heic-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-heic-header">
      <strong class="toolary-heic-title">${t('heicConverterTitle') || 'HEIC to JPG/PNG'}</strong>
      <button id="toolary-heic-close" type="button" class="toolary-heic-btn">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-heic-grid">
      <label class="toolary-heic-label">
        <span class="toolary-heic-label-text">${t('heicConverterSourceFile') || 'HEIC/HEIF File'}</span>
        <input id="toolary-heic-file" type="file" accept=".heic,.heif,image/heic,image/heif" class="toolary-heic-input" />
      </label>

      <label class="toolary-heic-label">
        <span class="toolary-heic-label-text">${t('heicConverterTargetFormat') || 'Target Format'}</span>
        <select id="toolary-heic-format" class="toolary-heic-select">
          <option value="image/jpeg">JPG / JPEG</option>
          <option value="image/png">PNG</option>
        </select>
      </label>

      <label id="toolary-heic-quality-wrap" class="toolary-heic-label">
        <span class="toolary-heic-label-text">${t('heicConverterQuality') || 'Quality'}</span>
        <div class="toolary-heic-quality">
          <input id="toolary-heic-quality" type="range" min="0.1" max="1" step="0.01" value="0.92" class="toolary-heic-range" />
          <span id="toolary-heic-quality-value" class="toolary-heic-quality-value">92%</span>
        </div>
      </label>
    </div>

    <div class="toolary-heic-actions">
      <button id="toolary-heic-convert" type="button" class="toolary-heic-btn">${t('heicConverterConvert') || 'Convert'}</button>
      <button id="toolary-heic-download" type="button" disabled class="toolary-heic-btn">${t('heicConverterDownload') || 'Download'}</button>
    </div>

    <div id="toolary-heic-status" class="toolary-heic-status">${t('heicConverterHint') || 'HEIC decode support depends on your Chrome/system codecs.'}</div>

    <div class="toolary-heic-preview-grid">
      <div class="toolary-heic-card">
        <div class="toolary-heic-card-head">
          <strong class="toolary-heic-card-title">${t('heicConverterInputPreview') || 'Input Preview'}</strong>
          <span id="toolary-heic-input-meta" class="toolary-heic-card-meta">-</span>
        </div>
        <img id="toolary-heic-preview-input" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-heic-preview" />
      </div>

      <div class="toolary-heic-card">
        <div class="toolary-heic-card-head">
          <strong class="toolary-heic-card-title">${t('heicConverterOutputPreview') || 'Output Preview'}</strong>
          <span id="toolary-heic-output-meta" class="toolary-heic-card-meta">-</span>
        </div>
        <img id="toolary-heic-preview-output" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-heic-preview" />
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;

  updateQualityVisibility();
  updateQualityLabel();
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

    const closeBtn = panel.querySelector('#toolary-heic-close');
    const fileInput = panel.querySelector('#toolary-heic-file');
    const formatSelect = panel.querySelector('#toolary-heic-format');
    const qualityInput = panel.querySelector('#toolary-heic-quality');
    const convertBtn = panel.querySelector('#toolary-heic-convert');
    const downloadBtn = panel.querySelector('#toolary-heic-download');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleFileSelected));
    cleanupFns.push(addEventListenerWithCleanup(formatSelect, 'change', () => {
      updateQualityVisibility();
      updateQualityLabel();
    }));
    cleanupFns.push(addEventListenerWithCleanup(qualityInput, 'input', updateQualityLabel));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', convertImage));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadResult));
  } catch (error) {
    handleError(error, 'heicConverter.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  if (sourceImageBitmap && 'close' in sourceImageBitmap) {
    sourceImageBitmap.close();
  }
  sourceImageBitmap = null;
  if (panel) {
    panel.remove();
    panel = null;
  }
  sourceFile = null;
  outputBlob = null;
  deactivateCb = null;
}
