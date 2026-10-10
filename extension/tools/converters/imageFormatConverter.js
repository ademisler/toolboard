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
  id: 'image-format-converter',
  name: 'Image Format Converter',
  category: 'converters',
  icon: 'image-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'image', 'png', 'jpg', 'jpeg', 'webp'],
  keywords: ['image convert', 'png', 'jpeg', 'webp', 'format']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let sourceFile = null;
let convertedBlob = null;
let convertedUrl = '';
let originalUrl = '';
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'imageFormatConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function cleanupObjectUrls() {
  if (convertedUrl) {
    URL.revokeObjectURL(convertedUrl);
    convertedUrl = '';
  }
  if (originalUrl) {
    URL.revokeObjectURL(originalUrl);
    originalUrl = '';
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
  if (stylesInjected || document.getElementById('toolary-image-format-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-image-format-styles';
  style.textContent = `
    .toolary-image-format-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-image-format-dialog { width: min(920px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-image-format-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-image-format-title { font-size: 16px; font-weight: 700; }
    .toolary-image-format-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); }
    .toolary-image-format-label { display: grid; gap: 6px; }
    .toolary-image-format-label-text { font-size: 12px; opacity: .85; }
    .toolary-image-format-input, .toolary-image-format-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-image-format-quality { display: flex; align-items: center; gap: 8px; }
    .toolary-image-format-range { flex: 1; }
    .toolary-image-format-quality-value { font-size: 12px; min-width: 44px; text-align: right; }
    .toolary-image-format-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-image-format-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-image-format-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-image-format-preview-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .toolary-image-format-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 8px; background: var(--toolary-control-bg); }
    .toolary-image-format-card-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .toolary-image-format-card-title { font-size: 12px; }
    .toolary-image-format-card-meta { font-size: 12px; opacity: .85; }
    .toolary-image-format-preview { width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; background: var(--toolary-muted-bg); }
    @media (max-width: 900px) { .toolary-image-format-preview-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function setStatus(text) {
  const statusEl = panel?.querySelector('#toolary-image-convert-status');
  if (statusEl) statusEl.textContent = text || '';
}

function updateQualityVisibility() {
  const format = panel?.querySelector('#toolary-image-convert-format')?.value || 'image/png';
  const qualityWrap = panel?.querySelector('#toolary-image-convert-quality-wrap');
  if (!qualityWrap) return;
  qualityWrap.style.display = format === 'image/png' ? 'none' : 'grid';
}

function updateQualityLabel() {
  const input = panel?.querySelector('#toolary-image-convert-quality');
  const label = panel?.querySelector('#toolary-image-convert-quality-value');
  if (!input || !label) return;
  label.textContent = `${Math.round(Number(input.value || 0.92) * 100)}%`;
}

function readImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t('imageFormatConverterInvalidImage') || 'Invalid image file.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error(t('imageFormatConverterReadFailed') || 'Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t('imageFormatConverterConvertFailed') || 'Image conversion failed.'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

async function convertImage() {
  if (!sourceFile) {
    showError(t('imageFormatConverterNoFile') || 'Please choose an image first.');
    return;
  }

  try {
    setStatus(t('imageFormatConverterConverting') || 'Converting image...');

    const mimeType = panel?.querySelector('#toolary-image-convert-format')?.value || 'image/png';
    const qualityRaw = Number(panel?.querySelector('#toolary-image-convert-quality')?.value || 0.92);
    const quality = Math.min(1, Math.max(0.1, qualityRaw));

    const image = await readImageFromFile(sourceFile);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('imageFormatConverterCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }

    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(image, 0, 0);

    const blob = await canvasToBlob(canvas, mimeType, quality);
    convertedBlob = blob;

    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      convertedUrl = '';
    }
    convertedUrl = URL.createObjectURL(blob);

    const preview = panel?.querySelector('#toolary-image-convert-preview-output');
    if (preview) preview.src = convertedUrl;

    const inputInfo = panel?.querySelector('#toolary-image-convert-input-info');
    const outputInfo = panel?.querySelector('#toolary-image-convert-output-info');
    if (inputInfo) inputInfo.textContent = `${sourceFile.name} • ${Math.round(sourceFile.size / 1024)} KB`;
    if (outputInfo) outputInfo.textContent = `${blob.type} • ${Math.round(blob.size / 1024)} KB`;

    const downloadBtn = panel?.querySelector('#toolary-image-convert-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('imageFormatConverterReadyToDownload') || 'Conversion completed. Ready to download.');
  } catch (error) {
    handleError(error, 'imageFormatConverter.convertImage');
    setStatus('');
    showError(error.message || t('imageFormatConverterConvertFailed') || 'Image conversion failed.');
  }
}

function downloadResult() {
  if (!convertedBlob || !convertedUrl || !sourceFile) {
    showError(t('imageFormatConverterNothingToDownload') || 'No converted file to download.');
    return;
  }

  const format = panel?.querySelector('#toolary-image-convert-format')?.value || 'image/png';
  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
  const baseName = sourceFile.name.replace(/\.[a-zA-Z0-9]+$/, '');
  const filename = `${baseName}-converted.${ext}`;

  const link = document.createElement('a');
  link.href = convertedUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('imageFormatConverterDownloaded') || 'Converted image downloaded.');
  showCoffeeMessageForTool('image-format-converter');
}

function handleFileSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showError(t('imageFormatConverterInvalidImage') || 'Invalid image file.');
    return;
  }

  sourceFile = file;
  convertedBlob = null;

  if (convertedUrl) {
    URL.revokeObjectURL(convertedUrl);
    convertedUrl = '';
  }

  if (originalUrl) {
    URL.revokeObjectURL(originalUrl);
    originalUrl = '';
  }

  originalUrl = URL.createObjectURL(file);
  const previewIn = panel?.querySelector('#toolary-image-convert-preview-input');
  const previewOut = panel?.querySelector('#toolary-image-convert-preview-output');
  if (previewIn) previewIn.src = originalUrl;
  if (previewOut) previewOut.src = '';

  const inputInfo = panel?.querySelector('#toolary-image-convert-input-info');
  const outputInfo = panel?.querySelector('#toolary-image-convert-output-info');
  if (inputInfo) inputInfo.textContent = `${file.name} • ${Math.round(file.size / 1024)} KB`;
  if (outputInfo) outputInfo.textContent = '-';

  const downloadBtn = panel?.querySelector('#toolary-image-convert-download');
  if (downloadBtn) downloadBtn.disabled = true;

  setStatus(t('imageFormatConverterFileReady') || 'File selected. Click Convert.');
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-image-format-converter-overlay';
  overlay.className = 'toolary-image-format-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-image-format-converter';
  dialog.className = 'toolary-image-format-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-image-format-header">
      <strong class="toolary-image-format-title">${t('imageFormatConverterTitle') || 'Image Format Converter'}</strong>
      <button id="toolary-image-convert-close" type="button" class="toolary-image-format-btn">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-image-format-grid">
      <label class="toolary-image-format-label">
        <span class="toolary-image-format-label-text">${t('imageFormatConverterSourceImage') || 'Source Image'}</span>
        <input id="toolary-image-convert-file" type="file" accept="image/png,image/jpeg,image/webp,image/*" class="toolary-image-format-input" />
      </label>

      <label class="toolary-image-format-label">
        <span class="toolary-image-format-label-text">${t('imageFormatConverterTargetFormat') || 'Target Format'}</span>
        <select id="toolary-image-convert-format" class="toolary-image-format-select">
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPG / JPEG</option>
          <option value="image/webp">WEBP</option>
        </select>
      </label>

      <label id="toolary-image-convert-quality-wrap" class="toolary-image-format-label">
        <span class="toolary-image-format-label-text">${t('imageFormatConverterQuality') || 'Quality'}</span>
        <div class="toolary-image-format-quality">
          <input id="toolary-image-convert-quality" type="range" min="0.1" max="1" step="0.01" value="0.92" class="toolary-image-format-range" />
          <span id="toolary-image-convert-quality-value" class="toolary-image-format-quality-value">92%</span>
        </div>
      </label>
    </div>

    <div class="toolary-image-format-actions">
      <button id="toolary-image-convert-run" type="button" class="toolary-image-format-btn">${t('imageFormatConverterConvert') || 'Convert'}</button>
      <button id="toolary-image-convert-download" type="button" disabled class="toolary-image-format-btn">${t('imageFormatConverterDownload') || 'Download'}</button>
    </div>

    <div id="toolary-image-convert-status" class="toolary-image-format-status">${t('imageFormatConverterChooseFile') || 'Choose an image file to start.'}</div>

    <div class="toolary-image-format-preview-grid">
      <div class="toolary-image-format-card">
        <div class="toolary-image-format-card-head">
          <strong class="toolary-image-format-card-title">${t('imageFormatConverterInputPreview') || 'Input Preview'}</strong>
          <span id="toolary-image-convert-input-info" class="toolary-image-format-card-meta">-</span>
        </div>
        <img id="toolary-image-convert-preview-input" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-image-format-preview" />
      </div>

      <div class="toolary-image-format-card">
        <div class="toolary-image-format-card-head">
          <strong class="toolary-image-format-card-title">${t('imageFormatConverterOutputPreview') || 'Output Preview'}</strong>
          <span id="toolary-image-convert-output-info" class="toolary-image-format-card-meta">-</span>
        </div>
        <img id="toolary-image-convert-preview-output" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-image-format-preview" />
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

    const closeBtn = panel.querySelector('#toolary-image-convert-close');
    const fileInput = panel.querySelector('#toolary-image-convert-file');
    const formatSelect = panel.querySelector('#toolary-image-convert-format');
    const qualityInput = panel.querySelector('#toolary-image-convert-quality');
    const convertBtn = panel.querySelector('#toolary-image-convert-run');
    const downloadBtn = panel.querySelector('#toolary-image-convert-download');

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
    handleError(error, 'imageFormatConverter.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupObjectUrls();
  if (panel) {
    panel.remove();
    panel = null;
  }
  sourceFile = null;
  convertedBlob = null;
  deactivateCb = null;
}
