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
  id: 'pdf-to-image-converter',
  name: 'PDF to Image',
  category: 'converters',
  icon: 'pdf-image',
  permissions: ['activeTab'],
  tags: ['converter', 'pdf', 'image', 'png', 'jpg'],
  keywords: ['pdf to image', 'pdf page', 'png', 'jpeg', 'export']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let pdfLib = null;
let pdfDoc = null;
let sourceFile = null;
let outputBlob = null;
let outputUrl = '';
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'pdfToImageConverter.clearCleanup');
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
  if (stylesInjected || document.getElementById('toolary-pdf-image-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-pdf-image-styles';
  style.textContent = `
    .toolary-pdf-image-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-pdf-image-dialog { width: min(980px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 14px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-pdf-image-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-pdf-image-title { font-size: 16px; font-weight: 700; }
    .toolary-pdf-image-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); }
    .toolary-pdf-image-label { display: grid; gap: 6px; }
    .toolary-pdf-image-label-text { font-size: 12px; opacity: .85; }
    .toolary-pdf-image-input, .toolary-pdf-image-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-pdf-image-page { display: flex; align-items: center; gap: 8px; }
    .toolary-pdf-image-page-input { width: 90px; }
    .toolary-pdf-image-quality { display: flex; align-items: center; gap: 8px; }
    .toolary-pdf-image-quality-range { flex: 1; }
    .toolary-pdf-image-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-pdf-image-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-pdf-image-status { font-size: 12px; opacity: .92; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-pdf-image-meta-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .toolary-pdf-image-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 8px; background: var(--toolary-control-bg); }
    .toolary-pdf-image-card-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .toolary-pdf-image-preview { width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; background: var(--toolary-muted-bg); }
    @media (max-width: 860px) { .toolary-pdf-image-meta-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-pdf-image-status');
  if (el) el.textContent = text || '';
}

function setMeta(selector, text) {
  const el = panel?.querySelector(selector);
  if (el) el.textContent = text || '-';
}

function updateQualityVisibility() {
  const format = panel?.querySelector('#toolary-pdf-image-format')?.value || 'image/png';
  const wrap = panel?.querySelector('#toolary-pdf-image-quality-wrap');
  if (!wrap) return;
  wrap.style.display = format === 'image/jpeg' ? 'grid' : 'none';
}

function updateQualityLabel() {
  const input = panel?.querySelector('#toolary-pdf-image-quality');
  const label = panel?.querySelector('#toolary-pdf-image-quality-value');
  if (!input || !label) return;
  label.textContent = `${Math.round(Number(input.value || 0.92) * 100)}%`;
}

async function loadPdfLib() {
  if (pdfLib) return pdfLib;

  const url = chrome.runtime.getURL('libs/pdfjs/pdf.mjs');
  const workerUrl = chrome.runtime.getURL('libs/pdfjs/pdf.worker.mjs');

  const mod = await import(url);
  mod.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfLib = mod;
  return pdfLib;
}

async function loadPdf(file) {
  const lib = await loadPdfLib();
  const bytes = new Uint8Array(await file.arrayBuffer());

  const loadingTask = lib.getDocument({ data: bytes });
  return loadingTask.promise;
}

function suggestFilename(page, format) {
  const base = (sourceFile?.name || 'document').replace(/\.[a-zA-Z0-9]+$/, '');
  const ext = format === 'image/jpeg' ? 'jpg' : 'png';
  return `${base}-page-${page}.${ext}`;
}

async function renderPage() {
  if (!pdfDoc) {
    showError(t('pdfToImageNoPdf') || 'Please choose a PDF file first.');
    return;
  }

  try {
    const pageNumber = Math.max(1, Math.min(pdfDoc.numPages, Number.parseInt(panel?.querySelector('#toolary-pdf-image-page')?.value || '1', 10) || 1));
    const scale = Math.min(4, Math.max(0.5, Number(panel?.querySelector('#toolary-pdf-image-scale')?.value || 2)));
    const format = panel?.querySelector('#toolary-pdf-image-format')?.value || 'image/png';
    const quality = Math.min(1, Math.max(0.1, Number(panel?.querySelector('#toolary-pdf-image-quality')?.value || 0.92)));

    setStatus(t('pdfToImageRendering') || 'Rendering page...');

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('pdfToImageCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) {
          reject(new Error(t('pdfToImageRenderFailed') || 'Failed to render image from PDF page.'));
          return;
        }
        resolve(b);
      }, format, quality);
    });

    outputBlob = blob;
    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(blob);

    const preview = panel?.querySelector('#toolary-pdf-image-preview-output');
    if (preview) preview.src = outputUrl;

    setMeta('#toolary-pdf-image-output-meta', `${Math.round(viewport.width)}×${Math.round(viewport.height)} • ${Math.round(blob.size / 1024)} KB`);

    const downloadBtn = panel?.querySelector('#toolary-pdf-image-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus((t('pdfToImageReady') || 'Image is ready to download.').replace('$1', String(pageNumber)));
  } catch (error) {
    handleError(error, 'pdfToImageConverter.renderPage');
    setStatus('');
    showError(error.message || t('pdfToImageRenderFailed') || 'Failed to render image from PDF page.');
  }
}

function downloadResult() {
  if (!outputBlob || !outputUrl) {
    showError(t('pdfToImageNothingToDownload') || 'No output image to download.');
    return;
  }

  const pageNumber = Math.max(1, Number.parseInt(panel?.querySelector('#toolary-pdf-image-page')?.value || '1', 10) || 1);
  const format = panel?.querySelector('#toolary-pdf-image-format')?.value || 'image/png';
  const filename = suggestFilename(pageNumber, format);

  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('pdfToImageDownloaded') || 'Image downloaded.');
  showCoffeeMessageForTool('pdf-to-image-converter');
}

async function handleFileSelected(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    showError(t('pdfToImageInvalidFile') || 'Please select a PDF file.');
    return;
  }

  try {
    setStatus(t('pdfToImageLoadingPdf') || 'Loading PDF...');
    sourceFile = file;
    outputBlob = null;
    cleanupOutputUrl();

    if (pdfDoc && typeof pdfDoc.cleanup === 'function') {
      try {
        pdfDoc.cleanup();
      } catch {
        // no-op
      }
    }

    pdfDoc = await loadPdf(file);

    const pageInput = panel?.querySelector('#toolary-pdf-image-page');
    const pageTotal = panel?.querySelector('#toolary-pdf-image-total');
    const downloadBtn = panel?.querySelector('#toolary-pdf-image-download');
    const outputPreview = panel?.querySelector('#toolary-pdf-image-preview-output');

    if (pageInput) {
      pageInput.max = String(pdfDoc.numPages);
      pageInput.value = '1';
    }
    if (pageTotal) pageTotal.textContent = String(pdfDoc.numPages);
    if (downloadBtn) downloadBtn.disabled = true;
    if (outputPreview) outputPreview.src = '';

    setMeta('#toolary-pdf-image-input-meta', `${pdfDoc.numPages} pages • ${Math.round(file.size / 1024)} KB`);
    setMeta('#toolary-pdf-image-output-meta', '-');

    setStatus(t('pdfToImageFileReady') || 'PDF loaded. Choose a page and render.');
  } catch (error) {
    handleError(error, 'pdfToImageConverter.handleFileSelected');
    showError(error.message || t('pdfToImageLoadFailed') || 'Failed to load PDF file.');
    setStatus('');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-pdf-image-converter-overlay';
  overlay.className = 'toolary-pdf-image-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-pdf-image-converter';
  dialog.className = 'toolary-pdf-image-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-pdf-image-header">
      <strong class="toolary-pdf-image-title">${t('pdfToImageTitle') || 'PDF to Image'}</strong>
      <button id="toolary-pdf-image-close" type="button" class="toolary-pdf-image-btn">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-pdf-image-grid">
      <label class="toolary-pdf-image-label">
        <span class="toolary-pdf-image-label-text">${t('pdfToImageSourcePdf') || 'Source PDF'}</span>
        <input id="toolary-pdf-image-file" type="file" accept="application/pdf,.pdf" class="toolary-pdf-image-input" />
      </label>

      <label class="toolary-pdf-image-label">
        <span class="toolary-pdf-image-label-text">${t('pdfToImagePage') || 'Page'}</span>
        <div class="toolary-pdf-image-page">
          <input id="toolary-pdf-image-page" type="number" min="1" value="1" class="toolary-pdf-image-input toolary-pdf-image-page-input" />
          <span class="toolary-pdf-image-label-text">/ <span id="toolary-pdf-image-total">-</span></span>
        </div>
      </label>

      <label class="toolary-pdf-image-label">
        <span class="toolary-pdf-image-label-text">${t('pdfToImageScale') || 'Scale'}</span>
        <select id="toolary-pdf-image-scale" class="toolary-pdf-image-select">
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2" selected>2x</option>
          <option value="3">3x</option>
        </select>
      </label>

      <label class="toolary-pdf-image-label">
        <span class="toolary-pdf-image-label-text">${t('pdfToImageFormat') || 'Output Format'}</span>
        <select id="toolary-pdf-image-format" class="toolary-pdf-image-select">
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPG / JPEG</option>
        </select>
      </label>

      <label id="toolary-pdf-image-quality-wrap" class="toolary-pdf-image-label">
        <span class="toolary-pdf-image-label-text">${t('pdfToImageQuality') || 'JPG Quality'}</span>
        <div class="toolary-pdf-image-quality">
          <input id="toolary-pdf-image-quality" type="range" min="0.1" max="1" step="0.01" value="0.92" class="toolary-pdf-image-quality-range" />
          <span id="toolary-pdf-image-quality-value" class="toolary-pdf-image-label-text">92%</span>
        </div>
      </label>
    </div>

    <div class="toolary-pdf-image-actions">
      <button id="toolary-pdf-image-render" type="button" class="toolary-pdf-image-btn">${t('pdfToImageRender') || 'Render Page'}</button>
      <button id="toolary-pdf-image-download" type="button" disabled class="toolary-pdf-image-btn">${t('pdfToImageDownload') || 'Download Image'}</button>
    </div>

    <div id="toolary-pdf-image-status" class="toolary-pdf-image-status">${t('pdfToImageHint') || 'Select a PDF file, then render the page you need.'}</div>

    <div class="toolary-pdf-image-meta-grid">
      <div class="toolary-pdf-image-card">
        <div class="toolary-pdf-image-card-head">
          <strong class="toolary-pdf-image-label-text">${t('pdfToImageInputInfo') || 'Input'}</strong>
          <span id="toolary-pdf-image-input-meta" class="toolary-pdf-image-label-text">-</span>
        </div>
        <div class="toolary-pdf-image-label-text">PDF</div>
      </div>

      <div class="toolary-pdf-image-card">
        <div class="toolary-pdf-image-card-head">
          <strong class="toolary-pdf-image-label-text">${t('pdfToImageOutputInfo') || 'Output'}</strong>
          <span id="toolary-pdf-image-output-meta" class="toolary-pdf-image-label-text">-</span>
        </div>
        <img id="toolary-pdf-image-preview-output" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-pdf-image-preview" />
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

    const closeBtn = panel.querySelector('#toolary-pdf-image-close');
    const fileInput = panel.querySelector('#toolary-pdf-image-file');
    const formatSelect = panel.querySelector('#toolary-pdf-image-format');
    const qualityInput = panel.querySelector('#toolary-pdf-image-quality');
    const renderBtn = panel.querySelector('#toolary-pdf-image-render');
    const downloadBtn = panel.querySelector('#toolary-pdf-image-download');

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
    cleanupFns.push(addEventListenerWithCleanup(renderBtn, 'click', renderPage));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadResult));
  } catch (error) {
    handleError(error, 'pdfToImageConverter.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  if (pdfDoc && typeof pdfDoc.cleanup === 'function') {
    try {
      pdfDoc.cleanup();
    } catch {
      // no-op
    }
  }
  pdfDoc = null;
  sourceFile = null;
  outputBlob = null;
  if (panel) {
    panel.remove();
    panel = null;
  }
  deactivateCb = null;
}
