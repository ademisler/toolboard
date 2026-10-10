import {
  addEventListenerWithCleanup,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { enhanceToolUI } from '../../shared/toolUi.js';

export const metadata = {
  id: 'qr-text-converter',
  name: 'QR Text Converter',
  category: 'converters',
  icon: 'qr-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'qr', 'qrcode', 'decode', 'encode'],
  keywords: ['qr to text', 'text to qr', 'qrcode decode', 'qrcode encode']
};

const QR_LIBRARY_PATH = 'libs/qrcode-generator.js';

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let qrFactoryPromise = null;
let currentMode = 'encode';
let outputCanvas = null;
let stylesInjected = false;
let fullscreenOverlay = null;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'qrTextConverter.clearCleanup');
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
  if (stylesInjected || document.getElementById('toolary-qr-convert-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-qr-convert-styles';
  style.textContent = `
    .toolary-qr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-qr-dialog { width: min(860px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-qr-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-qr-title { font-size: 16px; font-weight: 700; }
    .toolary-qr-mode-row, .toolary-qr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-qr-btn { border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; cursor: pointer; padding: 0 12px; height: 34px; }
    .toolary-qr-btn.action { height: 38px; padding: 0 14px; }
    .toolary-qr-mode-row .toolary-qr-btn { opacity: .7; }
    .toolary-qr-mode-row .toolary-qr-btn.is-active { opacity: 1; }
    .toolary-qr-section { display: grid; gap: 10px; margin-bottom: 10px; }
    .toolary-qr-hidden { display: none; }
    .toolary-qr-label { display: grid; gap: 6px; }
    .toolary-qr-label-text { font-size: 12px; opacity: .85; }
    .toolary-qr-input, .toolary-qr-select, .toolary-qr-textarea { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-qr-textarea { resize: vertical; }
    .toolary-qr-size-wrap { max-width: 180px; }
    .toolary-qr-preview { min-height: 120px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); padding: 10px; }
    .toolary-qr-preview.clickable { cursor: zoom-in; }
    .toolary-qr-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-qr-fullscreen-overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.88); display: flex; align-items: center; justify-content: center; padding: 20px; cursor: zoom-out; }
    .toolary-qr-fullscreen-overlay canvas { max-width: 95vw; max-height: 95vh; width: auto; height: auto; background: #fff; border-radius: 8px; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function getEl(selector) {
  return panel?.querySelector(selector) || null;
}

function setStatus(text) {
  const el = getEl('#toolary-qr-convert-status');
  if (el) el.textContent = text || '';
}

function closePreviewFullscreen() {
  if (fullscreenOverlay?.parentNode) {
    fullscreenOverlay.remove();
  }
  fullscreenOverlay = null;
}

function openPreviewFullscreen(canvas) {
  if (!canvas) return;
  closePreviewFullscreen();
  const overlay = document.createElement('div');
  overlay.className = 'toolary-qr-fullscreen-overlay';
  overlay.appendChild(canvas.cloneNode(true));
  overlay.addEventListener('click', closePreviewFullscreen);
  fullscreenOverlay = overlay;
  document.body.appendChild(overlay);
}

function setMode(mode) {
  currentMode = mode === 'decode' ? 'decode' : 'encode';
  const encodeSection = getEl('#toolary-qr-convert-encode');
  const decodeSection = getEl('#toolary-qr-convert-decode');
  const encodeBtn = getEl('#toolary-qr-convert-mode-encode');
  const decodeBtn = getEl('#toolary-qr-convert-mode-decode');
  const preview = getEl('#toolary-qr-convert-preview');
  if (encodeSection) encodeSection.classList.toggle('toolary-qr-hidden', currentMode !== 'encode');
  if (decodeSection) decodeSection.classList.toggle('toolary-qr-hidden', currentMode !== 'decode');
  if (encodeBtn) encodeBtn.classList.toggle('is-active', currentMode === 'encode');
  if (decodeBtn) decodeBtn.classList.toggle('is-active', currentMode === 'decode');
  if (preview && currentMode !== 'encode') preview.classList.remove('clickable');
  if (currentMode !== 'encode') closePreviewFullscreen();
  setStatus(currentMode === 'encode'
    ? (t('qrTextHintEncode') || 'Enter text and generate QR.')
    : (t('qrTextHintDecode') || 'Upload a QR image to decode text.'));
}

async function loadQrFactory() {
  if (qrFactoryPromise) return qrFactoryPromise;
  const moduleUrl = chrome.runtime.getURL(QR_LIBRARY_PATH);
  qrFactoryPromise = import(moduleUrl).then((module) => {
    if (module?.default && typeof module.default === 'function') return module.default;
    if (module?.qrcode && typeof module.qrcode === 'function') return module.qrcode;
    if (module?.default?.qrcode && typeof module.default.qrcode === 'function') return module.default.qrcode;
    throw new Error('QR library export not found');
  }).catch((error) => {
    qrFactoryPromise = null;
    throw error;
  });
  return qrFactoryPromise;
}

async function generateQr() {
  const text = (getEl('#toolary-qr-convert-text')?.value || '').trim();
  if (!text) {
    showError(t('qrTextNoInput') || 'Please enter text first.');
    return;
  }

  try {
    const size = Math.max(128, Math.min(1024, Number(getEl('#toolary-qr-convert-size')?.value || 256)));
    const factory = await loadQrFactory();
    const qr = factory(0, 'M');
    qr.addData(text);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const margin = 16;
    const cell = Math.max(1, Math.floor((size - (margin * 2)) / moduleCount));
    const canvasSize = moduleCount * cell + (margin * 2);

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('qrTextCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < moduleCount; r += 1) {
      for (let c = 0; c < moduleCount; c += 1) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(margin + (c * cell), margin + (r * cell), cell, cell);
        }
      }
    }

    const preview = getEl('#toolary-qr-convert-preview');
    if (preview) {
      preview.innerHTML = '';
      preview.appendChild(canvas);
      preview.classList.add('clickable');
      enhanceToolUI(document);
    }
    outputCanvas = canvas;
    const downloadBtn = getEl('#toolary-qr-convert-download');
    if (downloadBtn) downloadBtn.disabled = false;
    setStatus(t('qrTextReady') || 'QR is ready.');
    showSuccess(t('qrTextGenerated') || 'QR generated.');
  } catch (error) {
    handleError(error, 'qrTextConverter.generateQr');
    showError(error.message || t('qrTextGenerateFailed') || 'Failed to generate QR.');
  }
}

async function decodeQrFile(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showError(t('qrTextInvalidImage') || 'Please choose an image file.');
    return;
  }

  try {
    if (!('BarcodeDetector' in window)) {
      throw new Error(t('qrTextDetectorUnsupported') || 'QR decoding is not supported in this Chrome version.');
    }

    setStatus(t('qrTextDecoding') || 'Decoding QR...');
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    const bitmap = await window.createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    if (!codes?.length) {
      throw new Error(t('qrTextNotFound') || 'No QR code detected in image.');
    }

    const value = String(codes[0]?.rawValue || '').trim();
    if (!value) {
      throw new Error(t('qrTextDecodeEmpty') || 'QR content is empty.');
    }

    const output = getEl('#toolary-qr-convert-decoded');
    if (output) output.value = value;

    const copyBtn = getEl('#toolary-qr-convert-copy');
    if (copyBtn) copyBtn.disabled = false;

    setStatus(t('qrTextDecoded') || 'QR decoded successfully.');
    showSuccess(t('qrTextDecoded') || 'QR decoded successfully.');
  } catch (error) {
    handleError(error, 'qrTextConverter.decodeQrFile');
    setStatus('');
    showError(error.message || t('qrTextDecodeFailed') || 'Failed to decode QR.');
  }
}

function downloadQr() {
  if (!outputCanvas) {
    showError(t('qrTextNothingToDownload') || 'No QR image to download.');
    return;
  }
  try {
    const link = document.createElement('a');
    link.href = outputCanvas.toDataURL('image/png');
    link.download = `toolary-qr-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showSuccess(t('qrTextDownloaded') || 'QR image downloaded.');
    showCoffeeMessageForTool('qr-text-converter');
  } catch (error) {
    handleError(error, 'qrTextConverter.downloadQr');
    showError(error.message || t('qrTextDownloadFailed') || 'Failed to download QR image.');
  }
}

async function copyDecodedText() {
  const text = (getEl('#toolary-qr-convert-decoded')?.value || '').trim();
  if (!text) {
    showError(t('qrTextNothingToCopy') || 'No decoded text to copy.');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showSuccess(t('qrTextCopied') || 'Decoded text copied.');
    showCoffeeMessageForTool('qr-text-converter');
  } catch (error) {
    handleError(error, 'qrTextConverter.copyDecodedText');
    showError(error.message || t('qrTextCopyFailed') || 'Failed to copy text.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-qr-convert-overlay';
  overlay.className = 'toolary-qr-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-qr-convert-dialog';
  dialog.className = 'toolary-qr-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-qr-header">
      <strong class="toolary-qr-title">${t('qrTextTitle') || 'QR ↔ Text'}</strong>
      <button id="toolary-qr-convert-close" type="button" class="toolary-qr-btn">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-qr-mode-row">
      <button id="toolary-qr-convert-mode-encode" type="button" class="toolary-qr-btn">${t('qrTextModeEncode') || 'Text to QR'}</button>
      <button id="toolary-qr-convert-mode-decode" type="button" class="toolary-qr-btn">${t('qrTextModeDecode') || 'QR to Text'}</button>
    </div>

    <div id="toolary-qr-convert-encode" class="toolary-qr-section">
      <label class="toolary-qr-label">
        <span class="toolary-qr-label-text">${t('qrTextInput') || 'Input Text'}</span>
        <textarea id="toolary-qr-convert-text" rows="4" class="toolary-qr-textarea" placeholder="${t('qrTextInputPlaceholder') || 'Type text or URL...'}"></textarea>
      </label>
      <label class="toolary-qr-label toolary-qr-size-wrap">
        <span class="toolary-qr-label-text">${t('qrTextSize') || 'Size'}</span>
        <select id="toolary-qr-convert-size" class="toolary-qr-select">
          <option value="256">256</option>
          <option value="384">384</option>
          <option value="512">512</option>
        </select>
      </label>
      <div class="toolary-qr-actions">
        <button id="toolary-qr-convert-generate" type="button" class="toolary-qr-btn action">${t('qrTextGenerate') || 'Generate QR'}</button>
        <button id="toolary-qr-convert-download" type="button" disabled class="toolary-qr-btn action">${t('qrTextDownload') || 'Download PNG'}</button>
      </div>
      <div id="toolary-qr-convert-preview" class="toolary-qr-preview"></div>
    </div>

    <div id="toolary-qr-convert-decode" class="toolary-qr-section toolary-qr-hidden">
      <label class="toolary-qr-label">
        <span class="toolary-qr-label-text">${t('qrTextImage') || 'QR Image'}</span>
        <input id="toolary-qr-convert-file" type="file" accept="image/*" class="toolary-qr-input" />
      </label>
      <label class="toolary-qr-label">
        <span class="toolary-qr-label-text">${t('qrTextDecodedLabel') || 'Decoded Text'}</span>
        <textarea id="toolary-qr-convert-decoded" rows="5" readonly class="toolary-qr-textarea"></textarea>
      </label>
      <div class="toolary-qr-actions">
        <button id="toolary-qr-convert-copy" type="button" disabled class="toolary-qr-btn action">${t('qrTextCopy') || 'Copy Text'}</button>
      </div>
    </div>

    <div id="toolary-qr-convert-status" class="toolary-qr-status">${t('qrTextHintEncode') || 'Enter text and generate QR.'}</div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
}

export async function activate(deactivate) {
  try {
    await ensureLanguageLoaded();
    deactivateCb = deactivate;
    outputCanvas = null;

    if (panel) panel.remove();
    clearCleanup();
    createPanel();
    setMode('encode');

    const closeBtn = getEl('#toolary-qr-convert-close');
    const encodeBtn = getEl('#toolary-qr-convert-mode-encode');
    const decodeBtn = getEl('#toolary-qr-convert-mode-decode');
    const generateBtn = getEl('#toolary-qr-convert-generate');
    const downloadBtn = getEl('#toolary-qr-convert-download');
    const fileInput = getEl('#toolary-qr-convert-file');
    const copyBtn = getEl('#toolary-qr-convert-copy');
    const preview = getEl('#toolary-qr-convert-preview');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(encodeBtn, 'click', () => setMode('encode')));
    cleanupFns.push(addEventListenerWithCleanup(decodeBtn, 'click', () => setMode('decode')));
    cleanupFns.push(addEventListenerWithCleanup(generateBtn, 'click', generateQr));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadQr));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', decodeQrFile));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', copyDecodedText));
    if (preview) {
      cleanupFns.push(addEventListenerWithCleanup(preview, 'click', () => openPreviewFullscreen(outputCanvas)));
    }
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'qrTextConverter.activate');
    showError(error.message || t('qrTextGenericError') || 'QR conversion failed.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  closePreviewFullscreen();
  outputCanvas = null;
  if (panel) {
    panel.remove();
    panel = null;
  }
  if (typeof deactivateCb === 'function') {
    const cb = deactivateCb;
    deactivateCb = null;
    cb();
  }
}
