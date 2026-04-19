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
  id: 'image-resizer-compressor',
  name: 'Image Resizer/Compressor',
  category: 'converters',
  icon: 'resize-compress',
  permissions: ['activeTab'],
  tags: ['converter', 'image', 'resize', 'compress', 'optimize'],
  keywords: ['image resize', 'compress', 'quality', 'dimensions', 'kb']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let sourceFile = null;
let sourceImage = null;
let sourceUrl = '';
let resultBlob = null;
let resultUrl = '';
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'imageResizerCompressor.clearCleanup');
    }
  });
  cleanupFns = [];
}

function cleanupUrls() {
  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
  }
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
  if (stylesInjected || document.getElementById('toolary-image-resizer-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-image-resizer-styles';
  style.textContent = `
    .toolary-image-resize-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-image-resize-dialog { width: min(980px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-image-resize-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-image-resize-title { font-size: 16px; font-weight: 700; }
    .toolary-image-resize-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); }
    .toolary-image-resize-label { display: grid; gap: 6px; }
    .toolary-image-resize-label-text { font-size: 12px; opacity: .85; }
    .toolary-image-resize-input, .toolary-image-resize-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-image-resize-checkbox { display: flex; align-items: center; gap: 8px; padding-top: 20px; }
    .toolary-image-resize-quality { display: flex; align-items: center; gap: 8px; }
    .toolary-image-resize-range { flex: 1; }
    .toolary-image-resize-quality-value { font-size: 12px; min-width: 44px; text-align: right; }
    .toolary-image-resize-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-image-resize-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-image-resize-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-image-resize-preview-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .toolary-image-resize-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 8px; background: var(--toolary-control-bg); }
    .toolary-image-resize-card-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .toolary-image-resize-card-title { font-size: 12px; }
    .toolary-image-resize-card-meta { font-size: 12px; opacity: .85; }
    .toolary-image-resize-preview { width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; background: var(--toolary-muted-bg); }
    @media (max-width: 900px) { .toolary-image-resize-preview-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function setStatus(message) {
  const el = panel?.querySelector('#toolary-image-resize-status');
  if (el) el.textContent = message || '';
}

function setMeta(selector, text) {
  const el = panel?.querySelector(selector);
  if (el) el.textContent = text || '-';
}

function updateQualityValue() {
  const input = panel?.querySelector('#toolary-image-resize-quality');
  const valueEl = panel?.querySelector('#toolary-image-resize-quality-value');
  if (!input || !valueEl) return;
  valueEl.textContent = `${Math.round(Number(input.value || 0.85) * 100)}%`;
}

function updateLinkedDimension(changed) {
  const keepAspect = panel?.querySelector('#toolary-image-resize-keep-aspect')?.checked;
  if (!keepAspect || !sourceImage) return;

  const widthInput = panel?.querySelector('#toolary-image-resize-width');
  const heightInput = panel?.querySelector('#toolary-image-resize-height');
  if (!widthInput || !heightInput) return;

  const origW = sourceImage.naturalWidth;
  const origH = sourceImage.naturalHeight;
  if (!origW || !origH) return;

  if (changed === 'width') {
    const width = Math.max(1, Number.parseInt(widthInput.value || '1', 10) || 1);
    heightInput.value = String(Math.max(1, Math.round((width * origH) / origW)));
  } else {
    const height = Math.max(1, Number.parseInt(heightInput.value || '1', 10) || 1);
    widthInput.value = String(Math.max(1, Math.round((height * origW) / origH)));
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t('imageResizerCompressorInvalidImage') || 'Invalid image file.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error(t('imageResizerCompressorReadFailed') || 'Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t('imageResizerCompressorConvertFailed') || 'Image processing failed.'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function resolveOutputMime() {
  const mode = panel?.querySelector('#toolary-image-resize-output')?.value || 'source';
  if (mode === 'jpeg') return 'image/jpeg';
  if (mode === 'webp') return 'image/webp';
  if (mode === 'png') return 'image/png';
  return sourceFile?.type?.startsWith('image/') ? sourceFile.type : 'image/png';
}

function suggestDownloadName(mime) {
  const base = (sourceFile?.name || 'image').replace(/\.[a-zA-Z0-9]+$/, '');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  return `${base}-optimized.${ext}`;
}

async function processImage() {
  if (!sourceFile || !sourceImage) {
    showError(t('imageResizerCompressorNoFile') || 'Please choose an image first.');
    return;
  }

  try {
    setStatus(t('imageResizerCompressorProcessing') || 'Processing image...');

    const width = Math.max(1, Number.parseInt(panel?.querySelector('#toolary-image-resize-width')?.value || '1', 10) || 1);
    const height = Math.max(1, Number.parseInt(panel?.querySelector('#toolary-image-resize-height')?.value || '1', 10) || 1);
    const quality = Math.min(1, Math.max(0.1, Number(panel?.querySelector('#toolary-image-resize-quality')?.value || 0.85)));
    const mime = resolveOutputMime();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('imageResizerCompressorCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }

    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(sourceImage, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, mime, quality);
    resultBlob = blob;

    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = '';
    }
    resultUrl = URL.createObjectURL(blob);

    const outPreview = panel?.querySelector('#toolary-image-resize-preview-output');
    if (outPreview) outPreview.src = resultUrl;

    const beforeKb = Math.max(1, Math.round(sourceFile.size / 1024));
    const afterKb = Math.max(1, Math.round(blob.size / 1024));
    const delta = Math.round(((beforeKb - afterKb) / beforeKb) * 100);

    setMeta('#toolary-image-resize-output-meta', `${width}×${height} • ${afterKb} KB (${delta >= 0 ? '-' : '+'}${Math.abs(delta)}%)`);

    const downloadBtn = panel?.querySelector('#toolary-image-resize-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('imageResizerCompressorReady') || 'Processing complete. Ready to download.');
  } catch (error) {
    handleError(error, 'imageResizerCompressor.processImage');
    setStatus('');
    showError(error.message || t('imageResizerCompressorConvertFailed') || 'Image processing failed.');
  }
}

function downloadResult() {
  if (!resultBlob || !resultUrl) {
    showError(t('imageResizerCompressorNothingToDownload') || 'No processed file to download.');
    return;
  }

  const mime = resultBlob.type || 'image/png';
  const filename = suggestDownloadName(mime);

  const link = document.createElement('a');
  link.href = resultUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('imageResizerCompressorDownloaded') || 'Processed image downloaded.');
  showCoffeeMessageForTool('image-resizer-compressor');
}

async function handleFileSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showError(t('imageResizerCompressorInvalidImage') || 'Invalid image file.');
    return;
  }

  try {
    sourceFile = file;
    sourceImage = await loadImageFromFile(file);
    resultBlob = null;

    cleanupUrls();
    sourceUrl = URL.createObjectURL(file);

    const inPreview = panel?.querySelector('#toolary-image-resize-preview-input');
    const outPreview = panel?.querySelector('#toolary-image-resize-preview-output');
    if (inPreview) inPreview.src = sourceUrl;
    if (outPreview) outPreview.src = '';

    const widthInput = panel?.querySelector('#toolary-image-resize-width');
    const heightInput = panel?.querySelector('#toolary-image-resize-height');
    if (widthInput) widthInput.value = String(sourceImage.naturalWidth);
    if (heightInput) heightInput.value = String(sourceImage.naturalHeight);

    const beforeKb = Math.max(1, Math.round(file.size / 1024));
    setMeta('#toolary-image-resize-input-meta', `${sourceImage.naturalWidth}×${sourceImage.naturalHeight} • ${beforeKb} KB`);
    setMeta('#toolary-image-resize-output-meta', '-');

    const downloadBtn = panel?.querySelector('#toolary-image-resize-download');
    if (downloadBtn) downloadBtn.disabled = true;

    setStatus(t('imageResizerCompressorFileReady') || 'File selected. Adjust settings and process.');
  } catch (error) {
    handleError(error, 'imageResizerCompressor.handleFileSelected');
    showError(error.message || t('imageResizerCompressorReadFailed') || 'Could not read selected file.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-image-resizer-compressor-overlay';
  overlay.className = 'toolary-image-resize-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-image-resizer-compressor';
  dialog.className = 'toolary-image-resize-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-image-resize-header">
      <strong class="toolary-image-resize-title">${t('imageResizerCompressorTitle') || 'Image Resizer/Compressor'}</strong>
      <button id="toolary-image-resize-close" type="button" class="toolary-image-resize-btn">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-image-resize-grid">
      <label class="toolary-image-resize-label">
        <span class="toolary-image-resize-label-text">${t('imageResizerCompressorSourceImage') || 'Source Image'}</span>
        <input id="toolary-image-resize-file" type="file" accept="image/png,image/jpeg,image/webp,image/*" class="toolary-image-resize-input" />
      </label>

      <label class="toolary-image-resize-label">
        <span class="toolary-image-resize-label-text">${t('imageResizerCompressorWidth') || 'Width (px)'}</span>
        <input id="toolary-image-resize-width" type="number" min="1" value="1" class="toolary-image-resize-input" />
      </label>

      <label class="toolary-image-resize-label">
        <span class="toolary-image-resize-label-text">${t('imageResizerCompressorHeight') || 'Height (px)'}</span>
        <input id="toolary-image-resize-height" type="number" min="1" value="1" class="toolary-image-resize-input" />
      </label>

      <label class="toolary-image-resize-checkbox">
        <input id="toolary-image-resize-keep-aspect" type="checkbox" checked />
        <span>${t('imageResizerCompressorKeepAspect') || 'Keep aspect ratio'}</span>
      </label>

      <label class="toolary-image-resize-label">
        <span class="toolary-image-resize-label-text">${t('imageResizerCompressorQuality') || 'Quality'}</span>
        <div class="toolary-image-resize-quality">
          <input id="toolary-image-resize-quality" type="range" min="0.1" max="1" step="0.01" value="0.85" class="toolary-image-resize-range" />
          <span id="toolary-image-resize-quality-value" class="toolary-image-resize-quality-value">85%</span>
        </div>
      </label>

      <label class="toolary-image-resize-label">
        <span class="toolary-image-resize-label-text">${t('imageResizerCompressorOutputFormat') || 'Output Format'}</span>
        <select id="toolary-image-resize-output" class="toolary-image-resize-select">
          <option value="source">${t('imageResizerCompressorOutputSource') || 'Same as source'}</option>
          <option value="jpeg">JPG / JPEG</option>
          <option value="png">PNG</option>
          <option value="webp">WEBP</option>
        </select>
      </label>
    </div>

    <div class="toolary-image-resize-actions">
      <button id="toolary-image-resize-run" type="button" class="toolary-image-resize-btn">${t('imageResizerCompressorProcess') || 'Resize & Compress'}</button>
      <button id="toolary-image-resize-download" type="button" disabled class="toolary-image-resize-btn">${t('imageResizerCompressorDownload') || 'Download'}</button>
    </div>

    <div id="toolary-image-resize-status" class="toolary-image-resize-status">${t('imageResizerCompressorChooseFile') || 'Choose an image file to start.'}</div>

    <div class="toolary-image-resize-preview-grid">
      <div class="toolary-image-resize-card">
        <div class="toolary-image-resize-card-head">
          <strong class="toolary-image-resize-card-title">${t('imageResizerCompressorInputPreview') || 'Input Preview'}</strong>
          <span id="toolary-image-resize-input-meta" class="toolary-image-resize-card-meta">-</span>
        </div>
        <img id="toolary-image-resize-preview-input" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-image-resize-preview" />
      </div>

      <div class="toolary-image-resize-card">
        <div class="toolary-image-resize-card-head">
          <strong class="toolary-image-resize-card-title">${t('imageResizerCompressorOutputPreview') || 'Output Preview'}</strong>
          <span id="toolary-image-resize-output-meta" class="toolary-image-resize-card-meta">-</span>
        </div>
        <img id="toolary-image-resize-preview-output" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-image-resize-preview" />
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;

  updateQualityValue();
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

    const closeBtn = panel.querySelector('#toolary-image-resize-close');
    const fileInput = panel.querySelector('#toolary-image-resize-file');
    const widthInput = panel.querySelector('#toolary-image-resize-width');
    const heightInput = panel.querySelector('#toolary-image-resize-height');
    const qualityInput = panel.querySelector('#toolary-image-resize-quality');
    const processBtn = panel.querySelector('#toolary-image-resize-run');
    const downloadBtn = panel.querySelector('#toolary-image-resize-download');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleFileSelected));
    cleanupFns.push(addEventListenerWithCleanup(widthInput, 'input', () => updateLinkedDimension('width')));
    cleanupFns.push(addEventListenerWithCleanup(heightInput, 'input', () => updateLinkedDimension('height')));
    cleanupFns.push(addEventListenerWithCleanup(qualityInput, 'input', updateQualityValue));
    cleanupFns.push(addEventListenerWithCleanup(processBtn, 'click', processImage));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadResult));
  } catch (error) {
    handleError(error, 'imageResizerCompressor.activate');
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
  sourceFile = null;
  sourceImage = null;
  resultBlob = null;
  deactivateCb = null;
}
