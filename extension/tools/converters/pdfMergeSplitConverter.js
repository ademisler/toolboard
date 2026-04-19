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
  id: 'pdf-merge-split-converter',
  name: 'PDF Merge/Split',
  category: 'converters',
  icon: 'pdf-merge',
  permissions: ['activeTab'],
  tags: ['converter', 'pdf', 'merge', 'split', 'extract'],
  keywords: ['pdf merge', 'pdf split', 'extract pages', 'combine pdf', 'pdf pages']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let pdfLib = null;
let mode = 'merge';
let mergeFiles = [];
let splitFile = null;
let outputBlob = null;
let outputUrl = '';
let outputFilename = '';
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'pdfMergeSplitConverter.clearCleanup');
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
  outputFilename = '';
  cleanupOutputUrl();
  const outputMeta = panel?.querySelector('#toolary-pdf-ms-output-meta');
  if (outputMeta) outputMeta.textContent = '-';
  const downloadBtn = panel?.querySelector('#toolary-pdf-ms-download');
  if (downloadBtn) downloadBtn.disabled = true;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-pdf-ms-status');
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
  if (stylesInjected || document.getElementById('toolary-pdf-ms-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-pdf-ms-styles';
  style.textContent = `
    .toolary-pdf-ms-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-pdf-ms-dialog { width: min(900px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 12px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-pdf-ms-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-pdf-ms-title { font-size: 16px; font-weight: 700; }
    .toolary-pdf-ms-mode-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-pdf-ms-section { display: grid; gap: 10px; }
    .toolary-pdf-ms-hidden { display: none; }
    .toolary-pdf-ms-label { display: grid; gap: 6px; }
    .toolary-pdf-ms-label-text { font-size: 12px; opacity: .85; }
    .toolary-pdf-ms-input { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-pdf-ms-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-pdf-ms-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-pdf-ms-btn.mode { height: 34px; padding: 0 12px; background: var(--toolary-muted-bg); }
    .toolary-pdf-ms-mode-row .toolary-pdf-ms-btn.mode { opacity: .7; }
    .toolary-pdf-ms-mode-row .toolary-pdf-ms-btn.mode.is-active { opacity: 1; }
    .toolary-pdf-ms-status { font-size: 12px; opacity: .9; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-pdf-ms-meta-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); }
    .toolary-pdf-ms-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 10px; }
    .toolary-pdf-ms-card-title { font-size: 12px; }
    .toolary-pdf-ms-card-meta { font-size: 12px; opacity: .85; margin-top: 4px; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

async function loadPdfLib() {
  if (pdfLib) return pdfLib;
  const mod = await import(chrome.runtime.getURL('libs/pdf-lib/pdf-lib.esm.min.mjs'));
  pdfLib = mod;
  return mod;
}

function parsePageRange(text, totalPages) {
  const raw = String(text || '').trim();
  if (!raw) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pageSet = new Set();
  const tokens = raw.split(',').map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) {
    throw new Error(t('pdfMergeSplitInvalidRange') || 'Invalid page range.');
  }

  tokens.forEach((token) => {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1 || start > totalPages || end > totalPages || start > end) {
        throw new Error(t('pdfMergeSplitInvalidRange') || 'Invalid page range.');
      }
      for (let page = start; page <= end; page += 1) {
        pageSet.add(page - 1);
      }
      return;
    }

    const single = Number.parseInt(token, 10);
    if (!Number.isFinite(single) || single < 1 || single > totalPages) {
      throw new Error(t('pdfMergeSplitInvalidRange') || 'Invalid page range.');
    }
    pageSet.add(single - 1);
  });

  return Array.from(pageSet.values()).sort((a, b) => a - b);
}

function updateModeUI() {
  const mergeSection = panel?.querySelector('#toolary-pdf-ms-merge-section');
  const splitSection = panel?.querySelector('#toolary-pdf-ms-split-section');
  const mergeBtn = panel?.querySelector('#toolary-pdf-ms-mode-merge');
  const splitBtn = panel?.querySelector('#toolary-pdf-ms-mode-split');

  if (mergeSection) mergeSection.classList.toggle('toolary-pdf-ms-hidden', mode !== 'merge');
  if (splitSection) splitSection.classList.toggle('toolary-pdf-ms-hidden', mode !== 'split');

  if (mergeBtn) mergeBtn.classList.toggle('is-active', mode === 'merge');
  if (splitBtn) splitBtn.classList.toggle('is-active', mode === 'split');

  setStatus(mode === 'merge'
    ? (t('pdfMergeSplitMergeHint') || 'Select multiple PDF files and click Process.')
    : (t('pdfMergeSplitSplitHint') || 'Select one PDF and enter page range (for example: 1-3,5).'));
  resetOutput();
}

function setInputMeta(text) {
  const el = panel?.querySelector('#toolary-pdf-ms-input-meta');
  if (el) el.textContent = text || '-';
}

function suggestFilename(prefix) {
  return `${prefix}-${Date.now()}.pdf`;
}

async function processMerge() {
  if (!mergeFiles.length) {
    showError(t('pdfMergeSplitNoMergeFiles') || 'Please select PDF files to merge.');
    return;
  }

  try {
    const { PDFDocument } = await loadPdfLib();
    setStatus(t('pdfMergeSplitMerging') || 'Merging PDF files...');
    resetOutput();

    const targetPdf = await PDFDocument.create();

    for (let i = 0; i < mergeFiles.length; i += 1) {
      const file = mergeFiles[i];
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await targetPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      pages.forEach((page) => targetPdf.addPage(page));
      setStatus((t('pdfMergeSplitProcessingFile') || 'Processing file $1/$2...').replace('$1', String(i + 1)).replace('$2', String(mergeFiles.length)));
    }

    const outBytes = await targetPdf.save();
    outputBlob = new Blob([outBytes], { type: 'application/pdf' });
    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(outputBlob);
    outputFilename = suggestFilename('merged');

    const pageCount = targetPdf.getPageCount();
    const outputMeta = panel?.querySelector('#toolary-pdf-ms-output-meta');
    if (outputMeta) outputMeta.textContent = `${pageCount} pages • ${Math.round(outputBlob.size / 1024)} KB`;

    const downloadBtn = panel?.querySelector('#toolary-pdf-ms-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('pdfMergeSplitReady') || 'PDF is ready to download.');
    showSuccess(t('pdfMergeSplitMerged') || 'PDF files merged successfully.');
  } catch (error) {
    handleError(error, 'pdfMergeSplitConverter.processMerge');
    setStatus('');
    showError(error.message || t('pdfMergeSplitMergeFailed') || 'Failed to merge PDF files.');
  }
}

async function processSplit() {
  if (!splitFile) {
    showError(t('pdfMergeSplitNoSplitFile') || 'Please select a PDF file to split.');
    return;
  }

  try {
    const { PDFDocument } = await loadPdfLib();
    setStatus(t('pdfMergeSplitSplitting') || 'Preparing split PDF...');
    resetOutput();

    const sourceBytes = new Uint8Array(await splitFile.arrayBuffer());
    const sourcePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    const totalPages = sourcePdf.getPageCount();
    const rangeInput = panel?.querySelector('#toolary-pdf-ms-range')?.value || '';
    const selected = parsePageRange(rangeInput, totalPages);
    if (!selected.length) {
      throw new Error(t('pdfMergeSplitNoPagesSelected') || 'No pages selected.');
    }

    const targetPdf = await PDFDocument.create();
    const copiedPages = await targetPdf.copyPages(sourcePdf, selected);
    copiedPages.forEach((page) => targetPdf.addPage(page));

    const outBytes = await targetPdf.save();
    outputBlob = new Blob([outBytes], { type: 'application/pdf' });
    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(outputBlob);
    outputFilename = suggestFilename('split');

    const outputMeta = panel?.querySelector('#toolary-pdf-ms-output-meta');
    if (outputMeta) outputMeta.textContent = `${selected.length}/${totalPages} pages • ${Math.round(outputBlob.size / 1024)} KB`;

    const downloadBtn = panel?.querySelector('#toolary-pdf-ms-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('pdfMergeSplitReady') || 'PDF is ready to download.');
    showSuccess(t('pdfMergeSplitSplitDone') || 'PDF pages extracted successfully.');
  } catch (error) {
    handleError(error, 'pdfMergeSplitConverter.processSplit');
    setStatus('');
    showError(error.message || t('pdfMergeSplitSplitFailed') || 'Failed to split PDF.');
  }
}

async function processCurrentMode() {
  if (mode === 'merge') {
    await processMerge();
    return;
  }
  await processSplit();
}

function downloadOutput() {
  if (!outputBlob || !outputUrl) {
    showError(t('pdfMergeSplitNothingToDownload') || 'No output PDF to download.');
    return;
  }

  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = outputFilename || suggestFilename('result');
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('pdfMergeSplitDownloaded') || 'PDF downloaded.');
  showCoffeeMessageForTool('pdf-merge-split-converter');
}

function onMergeFilesChange(event) {
  const files = Array.from(event?.target?.files || []);
  const valid = files.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  mergeFiles = valid;
  resetOutput();
  if (!valid.length) {
    setInputMeta('-');
    return;
  }
  const totalKb = Math.round(valid.reduce((sum, file) => sum + file.size, 0) / 1024);
  setInputMeta(`${valid.length} files • ${totalKb} KB`);
}

async function onSplitFileChange(event) {
  const file = event?.target?.files?.[0] || null;
  splitFile = null;
  resetOutput();

  if (!file) {
    setInputMeta('-');
    return;
  }

  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    showError(t('pdfMergeSplitInvalidPdf') || 'Please select a PDF file.');
    setInputMeta('-');
    return;
  }

  try {
    const { PDFDocument } = await loadPdfLib();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    splitFile = file;
    setInputMeta(`${doc.getPageCount()} pages • ${Math.round(file.size / 1024)} KB`);
  } catch (error) {
    handleError(error, 'pdfMergeSplitConverter.onSplitFileChange');
    splitFile = null;
    showError(error.message || t('pdfMergeSplitInvalidPdf') || 'Please select a PDF file.');
    setInputMeta('-');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-pdf-merge-split-overlay';
  overlay.className = 'toolary-pdf-ms-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-pdf-merge-split';
  dialog.className = 'toolary-pdf-ms-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-pdf-ms-header">
      <strong class="toolary-pdf-ms-title">${t('pdfMergeSplitTitle') || 'PDF Merge/Split'}</strong>
      <button id="toolary-pdf-ms-close" type="button" class="toolary-pdf-ms-btn">${t('close') || 'Close'}</button>
    </div>

    <div class="toolary-pdf-ms-mode-row">
      <button id="toolary-pdf-ms-mode-merge" type="button" class="toolary-pdf-ms-btn mode">${t('pdfMergeSplitModeMerge') || 'Merge PDFs'}</button>
      <button id="toolary-pdf-ms-mode-split" type="button" class="toolary-pdf-ms-btn mode">${t('pdfMergeSplitModeSplit') || 'Split/Extract'}</button>
    </div>

    <div id="toolary-pdf-ms-merge-section" class="toolary-pdf-ms-section">
      <label class="toolary-pdf-ms-label">
        <span class="toolary-pdf-ms-label-text">${t('pdfMergeSplitMergeFiles') || 'PDF Files'}</span>
        <input id="toolary-pdf-ms-merge-files" type="file" accept="application/pdf,.pdf" multiple class="toolary-pdf-ms-input" />
      </label>
    </div>

    <div id="toolary-pdf-ms-split-section" class="toolary-pdf-ms-section toolary-pdf-ms-hidden">
      <label class="toolary-pdf-ms-label">
        <span class="toolary-pdf-ms-label-text">${t('pdfMergeSplitSourceFile') || 'Source PDF'}</span>
        <input id="toolary-pdf-ms-split-file" type="file" accept="application/pdf,.pdf" class="toolary-pdf-ms-input" />
      </label>
      <label class="toolary-pdf-ms-label">
        <span class="toolary-pdf-ms-label-text">${t('pdfMergeSplitRange') || 'Page Range'}</span>
        <input id="toolary-pdf-ms-range" type="text" placeholder="${t('pdfMergeSplitRangePlaceholder') || 'Example: 1-3,5'}" class="toolary-pdf-ms-input" />
      </label>
    </div>

    <div class="toolary-pdf-ms-actions">
      <button id="toolary-pdf-ms-process" type="button" class="toolary-pdf-ms-btn">${t('pdfMergeSplitProcess') || 'Process PDF'}</button>
      <button id="toolary-pdf-ms-download" type="button" disabled class="toolary-pdf-ms-btn">${t('pdfMergeSplitDownload') || 'Download PDF'}</button>
    </div>

    <div id="toolary-pdf-ms-status" class="toolary-pdf-ms-status">${t('pdfMergeSplitMergeHint') || 'Select multiple PDF files and click Process.'}</div>

    <div class="toolary-pdf-ms-meta-grid">
      <div class="toolary-pdf-ms-card">
        <strong class="toolary-pdf-ms-card-title">${t('pdfMergeSplitInputInfo') || 'Input'}</strong>
        <div id="toolary-pdf-ms-input-meta" class="toolary-pdf-ms-card-meta">-</div>
      </div>
      <div class="toolary-pdf-ms-card">
        <strong class="toolary-pdf-ms-card-title">${t('pdfMergeSplitOutputInfo') || 'Output'}</strong>
        <div id="toolary-pdf-ms-output-meta" class="toolary-pdf-ms-card-meta">-</div>
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
    mode = 'merge';
    mergeFiles = [];
    splitFile = null;

    if (panel) panel.remove();
    clearCleanup();
    resetOutput();

    createPanel();

    const closeBtn = panel.querySelector('#toolary-pdf-ms-close');
    const modeMergeBtn = panel.querySelector('#toolary-pdf-ms-mode-merge');
    const modeSplitBtn = panel.querySelector('#toolary-pdf-ms-mode-split');
    const mergeInput = panel.querySelector('#toolary-pdf-ms-merge-files');
    const splitInput = panel.querySelector('#toolary-pdf-ms-split-file');
    const processBtn = panel.querySelector('#toolary-pdf-ms-process');
    const downloadBtn = panel.querySelector('#toolary-pdf-ms-download');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(modeMergeBtn, 'click', () => {
      mode = 'merge';
      setInputMeta('-');
      updateModeUI();
    }));
    cleanupFns.push(addEventListenerWithCleanup(modeSplitBtn, 'click', () => {
      mode = 'split';
      setInputMeta('-');
      updateModeUI();
    }));
    cleanupFns.push(addEventListenerWithCleanup(mergeInput, 'change', onMergeFilesChange));
    cleanupFns.push(addEventListenerWithCleanup(splitInput, 'change', onSplitFileChange));
    cleanupFns.push(addEventListenerWithCleanup(processBtn, 'click', processCurrentMode));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadOutput));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'pdfMergeSplitConverter.activate');
    showError(error.message || t('pdfMergeSplitGenericError') || 'PDF operation failed.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  outputBlob = null;
  outputFilename = '';
  mergeFiles = [];
  splitFile = null;
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
