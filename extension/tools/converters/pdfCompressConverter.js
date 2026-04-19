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
  id: 'pdf-compress-converter',
  name: 'PDF Compress',
  category: 'converters',
  icon: 'pdf-compress',
  permissions: ['activeTab'],
  tags: ['converter', 'pdf', 'compress', 'optimize'],
  keywords: ['pdf compress', 'reduce pdf size', 'smaller pdf', 'optimize pdf']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let pdfJsLib = null;
let pdfLib = null;
let sourceFile = null;
let outputBlob = null;
let outputUrl = '';
let isProcessing = false;
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'pdfCompressConverter.clearCleanup');
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

function resetOutput() {
  outputBlob = null;
  cleanupOutputUrl();
  const outputMeta = panel?.querySelector('#toolary-pdf-compress-output-meta');
  if (outputMeta) outputMeta.textContent = '-';
  const downloadBtn = panel?.querySelector('#toolary-pdf-compress-download');
  if (downloadBtn) downloadBtn.disabled = true;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-pdf-compress-status');
  if (el) el.textContent = text || '';
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
  if (stylesInjected || document.getElementById('toolary-pdf-compress-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-pdf-compress-styles';
  style.textContent = `
    .toolary-pdf-compress-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-pdf-compress-dialog { width: min(860px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-pdf-compress-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-pdf-compress-title { font-size: 16px; font-weight: 700; }
    .toolary-pdf-compress-label { display: grid; gap: 6px; }
    .toolary-pdf-compress-label-text { font-size: 12px; opacity: .85; }
    .toolary-pdf-compress-input, .toolary-pdf-compress-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-pdf-compress-advanced { border: 1px solid var(--toolary-border); border-radius: 10px; padding: 10px; background: var(--toolary-muted-bg); }
    .toolary-pdf-compress-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); margin-top: 10px; }
    .toolary-pdf-compress-quality { display: flex; align-items: center; gap: 8px; }
    .toolary-pdf-compress-quality-range { flex: 1; }
    .toolary-pdf-compress-quality-value { font-size: 12px; min-width: 44px; text-align: right; }
    .toolary-pdf-compress-info { margin-top: 8px; font-size: 12px; opacity: .85; }
    .toolary-pdf-compress-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-pdf-compress-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-pdf-compress-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-pdf-compress-meta-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); }
    .toolary-pdf-compress-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 10px; }
    .toolary-pdf-compress-card-title { font-size: 12px; }
    .toolary-pdf-compress-card-meta { font-size: 12px; opacity: .85; margin-top: 4px; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function dataUrlToBytes(dataUrl) {
  const base64Index = dataUrl.indexOf(',');
  if (base64Index < 0) {
    throw new Error(t('pdfCompressRenderFailed') || 'Failed to render PDF page.');
  }
  const base64 = dataUrl.slice(base64Index + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getPresetValues(preset) {
  switch (preset) {
    case 'strong':
      return { scale: 1.1, quality: 0.62 };
    case 'light':
      return { scale: 1.6, quality: 0.82 };
    case 'balanced':
    default:
      return { scale: 1.35, quality: 0.72 };
  }
}

function syncPresetToInputs() {
  const preset = panel?.querySelector('#toolary-pdf-compress-preset')?.value || 'balanced';
  const { scale, quality } = getPresetValues(preset);
  const scaleInput = panel?.querySelector('#toolary-pdf-compress-scale');
  const qualityInput = panel?.querySelector('#toolary-pdf-compress-quality');
  const qualityValue = panel?.querySelector('#toolary-pdf-compress-quality-value');
  if (scaleInput) scaleInput.value = String(scale);
  if (qualityInput) qualityInput.value = String(quality);
  if (qualityValue) qualityValue.textContent = `${Math.round(quality * 100)}%`;
}

function updateQualityLabel() {
  const input = panel?.querySelector('#toolary-pdf-compress-quality');
  const value = panel?.querySelector('#toolary-pdf-compress-quality-value');
  if (!input || !value) return;
  value.textContent = `${Math.round(Number(input.value || 0.72) * 100)}%`;
}

async function loadPdfJs() {
  if (pdfJsLib) return pdfJsLib;
  const mod = await import(chrome.runtime.getURL('libs/pdfjs/pdf.mjs'));
  mod.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdfjs/pdf.worker.mjs');
  pdfJsLib = mod;
  return mod;
}

async function loadPdfLib() {
  if (pdfLib) return pdfLib;
  pdfLib = await import(chrome.runtime.getURL('libs/pdf-lib/pdf-lib.esm.min.mjs'));
  return pdfLib;
}

function suggestFilename(file) {
  const base = String(file?.name || 'compressed').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base}-compressed.pdf`;
}

async function handleSourceFileChange(event) {
  const file = event?.target?.files?.[0];
  sourceFile = null;
  resetOutput();

  if (!file) {
    const inputMeta = panel?.querySelector('#toolary-pdf-compress-input-meta');
    if (inputMeta) inputMeta.textContent = '-';
    return;
  }

  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    showError(t('pdfCompressInvalidFile') || 'Please select a PDF file.');
    return;
  }

  sourceFile = file;
  const inputMeta = panel?.querySelector('#toolary-pdf-compress-input-meta');
  if (inputMeta) inputMeta.textContent = `${Math.round(file.size / 1024)} KB`;
  setStatus(t('pdfCompressFileReady') || 'PDF loaded. Click Compress.');
}

async function compressPdf() {
  if (isProcessing) return;
  if (!sourceFile) {
    showError(t('pdfCompressNoFile') || 'Please choose a PDF file first.');
    return;
  }

  try {
    isProcessing = true;
    resetOutput();

    const scale = Math.max(0.8, Math.min(2, Number(panel?.querySelector('#toolary-pdf-compress-scale')?.value || 1.35)));
    const quality = Math.max(0.45, Math.min(0.95, Number(panel?.querySelector('#toolary-pdf-compress-quality')?.value || 0.72)));

    setStatus(t('pdfCompressPreparing') || 'Compressing PDF pages...');

    const [pdfjs, pdflib] = await Promise.all([loadPdfJs(), loadPdfLib()]);
    const bytes = new Uint8Array(await sourceFile.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const srcDoc = await loadingTask.promise;
    const outDoc = await pdflib.PDFDocument.create();

    for (let i = 1; i <= srcDoc.numPages; i += 1) {
      const page = await srcDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error(t('pdfCompressCanvasUnavailable') || 'Canvas rendering is unavailable.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpgDataUrl = canvas.toDataURL('image/jpeg', quality);
      const jpgBytes = dataUrlToBytes(jpgDataUrl);
      const embedded = await outDoc.embedJpg(jpgBytes);
      const outPage = outDoc.addPage([viewport.width, viewport.height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height
      });

      setStatus((t('pdfCompressProcessingPage') || 'Processing page $1/$2...').replace('$1', String(i)).replace('$2', String(srcDoc.numPages)));
    }

    const outBytes = await outDoc.save({ useObjectStreams: true });
    outputBlob = new Blob([outBytes], { type: 'application/pdf' });
    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(outputBlob);

    const outputMeta = panel?.querySelector('#toolary-pdf-compress-output-meta');
    if (outputMeta) {
      const sourceKb = Math.max(1, Math.round(sourceFile.size / 1024));
      const outputKb = Math.max(1, Math.round(outputBlob.size / 1024));
      const ratio = Math.round((1 - (outputKb / sourceKb)) * 100);
      const badge = Number.isFinite(ratio) ? `${ratio >= 0 ? '-' : '+'}${Math.abs(ratio)}%` : '-';
      outputMeta.textContent = `${outputKb} KB (${badge})`;
    }

    const downloadBtn = panel?.querySelector('#toolary-pdf-compress-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('pdfCompressReady') || 'Compressed PDF is ready to download.');
    showSuccess(t('pdfCompressDone') || 'PDF compressed successfully.');
  } catch (error) {
    handleError(error, 'pdfCompressConverter.compressPdf');
    setStatus('');
    showError(error.message || t('pdfCompressFailed') || 'PDF compression failed.');
  } finally {
    isProcessing = false;
  }
}

function downloadOutput() {
  if (!outputBlob || !outputUrl || !sourceFile) {
    showError(t('pdfCompressNothingToDownload') || 'No compressed PDF to download.');
    return;
  }

  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = suggestFilename(sourceFile);
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('pdfCompressDownloaded') || 'Compressed PDF downloaded.');
  showCoffeeMessageForTool('pdf-compress-converter');
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-pdf-compress-overlay';
  overlay.className = 'toolary-pdf-compress-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-pdf-compress';
  dialog.className = 'toolary-pdf-compress-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-pdf-compress-header">
      <strong class="toolary-pdf-compress-title">${t('pdfCompressTitle') || 'PDF Compress'}</strong>
      <button id="toolary-pdf-compress-close" type="button" class="toolary-pdf-compress-btn">${t('close') || 'Close'}</button>
    </div>

    <label class="toolary-pdf-compress-label">
      <span class="toolary-pdf-compress-label-text">${t('pdfCompressSourcePdf') || 'Source PDF'}</span>
      <input id="toolary-pdf-compress-file" type="file" accept="application/pdf,.pdf" class="toolary-pdf-compress-input" />
    </label>

    <label class="toolary-pdf-compress-label">
      <span class="toolary-pdf-compress-label-text">${t('pdfCompressPreset') || 'Compression Preset'}</span>
      <select id="toolary-pdf-compress-preset" class="toolary-pdf-compress-select">
        <option value="light">${t('pdfCompressLight') || 'Light (better quality)'}</option>
        <option value="balanced" selected>${t('pdfCompressBalanced') || 'Balanced'}</option>
        <option value="strong">${t('pdfCompressStrong') || 'Strong (smaller file)'}</option>
      </select>
    </label>

    <details class="toolary-pdf-compress-advanced">
      <summary>${t('pdfCompressAdvancedOptions') || 'Advanced Options'}</summary>
      <div class="toolary-pdf-compress-grid">
        <label class="toolary-pdf-compress-label">
          <span class="toolary-pdf-compress-label-text">${t('pdfCompressScale') || 'Render Scale'}</span>
          <input id="toolary-pdf-compress-scale" type="number" min="0.8" max="2" step="0.05" value="1.35" class="toolary-pdf-compress-input" />
        </label>
        <label class="toolary-pdf-compress-label">
          <span class="toolary-pdf-compress-label-text">${t('pdfCompressQuality') || 'JPEG Quality'}</span>
          <div class="toolary-pdf-compress-quality">
            <input id="toolary-pdf-compress-quality" type="range" min="0.45" max="0.95" step="0.01" value="0.72" class="toolary-pdf-compress-quality-range" />
            <span id="toolary-pdf-compress-quality-value" class="toolary-pdf-compress-quality-value">72%</span>
          </div>
        </label>
      </div>
      <div class="toolary-pdf-compress-info">${t('pdfCompressInfo') || 'Compression re-renders pages as images. Text select/search may be reduced.'}</div>
    </details>

    <div class="toolary-pdf-compress-actions">
      <button id="toolary-pdf-compress-run" type="button" class="toolary-pdf-compress-btn">${t('pdfCompressRun') || 'Compress PDF'}</button>
      <button id="toolary-pdf-compress-download" type="button" disabled class="toolary-pdf-compress-btn">${t('pdfCompressDownload') || 'Download Compressed PDF'}</button>
    </div>

    <div id="toolary-pdf-compress-status" class="toolary-pdf-compress-status">${t('pdfCompressHint') || 'Choose a PDF and click Compress.'}</div>

    <div class="toolary-pdf-compress-meta-grid">
      <div class="toolary-pdf-compress-card">
        <strong class="toolary-pdf-compress-card-title">${t('pdfCompressInputInfo') || 'Input'}</strong>
        <div id="toolary-pdf-compress-input-meta" class="toolary-pdf-compress-card-meta">-</div>
      </div>
      <div class="toolary-pdf-compress-card">
        <strong class="toolary-pdf-compress-card-title">${t('pdfCompressOutputInfo') || 'Output'}</strong>
        <div id="toolary-pdf-compress-output-meta" class="toolary-pdf-compress-card-meta">-</div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
}

export async function activate(deactivate) {
  try {
    await ensureLanguageLoaded();
    deactivateCb = deactivate;
    sourceFile = null;
    isProcessing = false;

    if (panel) panel.remove();
    clearCleanup();
    resetOutput();
    createPanel();

    const closeBtn = panel.querySelector('#toolary-pdf-compress-close');
    const fileInput = panel.querySelector('#toolary-pdf-compress-file');
    const presetSelect = panel.querySelector('#toolary-pdf-compress-preset');
    const qualityInput = panel.querySelector('#toolary-pdf-compress-quality');
    const runBtn = panel.querySelector('#toolary-pdf-compress-run');
    const downloadBtn = panel.querySelector('#toolary-pdf-compress-download');

    syncPresetToInputs();
    updateQualityLabel();

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleSourceFileChange));
    cleanupFns.push(addEventListenerWithCleanup(presetSelect, 'change', syncPresetToInputs));
    cleanupFns.push(addEventListenerWithCleanup(qualityInput, 'input', updateQualityLabel));
    cleanupFns.push(addEventListenerWithCleanup(runBtn, 'click', compressPdf));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadOutput));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'pdfCompressConverter.activate');
    showError(error.message || t('pdfCompressFailed') || 'PDF compression failed.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  sourceFile = null;
  outputBlob = null;
  isProcessing = false;
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
