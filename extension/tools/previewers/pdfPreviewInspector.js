import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml, formatBytes, readFileAsArrayBuffer } from './sharedPreviewUtils.js';
import { enhanceToolUI } from '../../shared/toolUi.js';

export const metadata = {
  id: 'pdf-preview-inspector',
  name: 'PDF Preview Inspector',
  category: 'previewers',
  icon: 'pdf-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'pdf', 'metadata', 'pages'],
  keywords: ['pdf', 'pages', 'thumbnail', 'metadata']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

async function inspectPdf(file) {
  const info = panel?.querySelector('#toolary-pdf-info');
  const thumbs = panel?.querySelector('#toolary-pdf-thumbs');
  if (!info || !thumbs) return;

  if (!file) {
    showError(t('pdfPreviewInspectorMissingFile') || 'Please select a PDF file.');
    return;
  }

  try {
    const data = await readFileAsArrayBuffer(file);
    const pdfJsUrl = chrome.runtime.getURL('libs/pdfjs/pdf.mjs');
    const pdfWorkerUrl = chrome.runtime.getURL('libs/pdfjs/pdf.worker.mjs');
    const pdfjs = await import(pdfJsUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const metadata = await pdf.getMetadata().catch(() => ({ info: {} }));
    const infoData = metadata?.info || {};

    const title = infoData.Title || '-';
    const author = infoData.Author || '-';
    const subject = infoData.Subject || '-';
    const producer = infoData.Producer || '-';
    const creator = infoData.Creator || '-';
    const created = infoData.CreationDate || '-';
    const modified = infoData.ModDate || '-';
    info.innerHTML = `
      <div><strong>${t('pdfPreviewInspectorFile') || 'File'}:</strong> ${escapeHtml(file.name)}</div>
      <div><strong>${t('pdfPreviewInspectorSize') || 'Size'}:</strong> ${escapeHtml(formatBytes(file.size))}</div>
      <div><strong>${t('pdfPreviewInspectorPages') || 'Pages'}:</strong> ${pageCount}</div>
      <div><strong>${t('pdfPreviewInspectorTitle') || 'Title'}:</strong> ${escapeHtml(title)}</div>
      <div><strong>${t('pdfPreviewInspectorAuthor') || 'Author'}:</strong> ${escapeHtml(author)}</div>
      <div><strong>${t('pdfPreviewInspectorSubject') || 'Subject'}:</strong> ${escapeHtml(subject)}</div>
      <div><strong>${t('pdfPreviewInspectorProducer') || 'Producer'}:</strong> ${escapeHtml(producer)}</div>
      <div><strong>${t('pdfPreviewInspectorCreator') || 'Creator'}:</strong> ${escapeHtml(creator)}</div>
      <div><strong>${t('pdfPreviewInspectorCreated') || 'Created'}:</strong> ${escapeHtml(created)}</div>
      <div><strong>${t('pdfPreviewInspectorModified') || 'Modified'}:</strong> ${escapeHtml(modified)}</div>
    `;

    thumbs.innerHTML = '';
    thumbs.innerHTML = `<div class="toolary-preview-muted" style="padding:8px;">${t('pdfPreviewInspectorRenderingThumbs') || 'Rendering thumbnails...'}</div>`;
    const frag = document.createDocumentFragment();

    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(0.28, 130 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const card = document.createElement('article');
      card.className = 'toolary-preview-card';
      card.style.cssText = 'display:grid;gap:6px;';
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <strong>${t('pdfPreviewInspectorPage') || 'Page'} ${pageNum}</strong>
          <span class="toolary-preview-muted">${Math.round(baseViewport.width)}×${Math.round(baseViewport.height)} pt</span>
        </div>
        <div class="toolary-preview-scroll" style="display:flex;align-items:center;justify-content:center;min-height:80px;border-style:dashed;padding:6px;"></div>
      `;
      const frame = card.querySelector('div:last-child');
      if (frame) {
        canvas.style.cssText = 'max-width:100%;height:auto;border-radius:6px;display:block;';
        frame.appendChild(canvas);
      }
      frag.appendChild(card);
    }
    thumbs.innerHTML = '';
    thumbs.appendChild(frag);
    enhanceToolUI(document);

    showCoffeeMessageForTool('pdf-preview-inspector');
  } catch (error) {
    showError(`${t('pdfPreviewInspectorFailed') || 'Failed to inspect PDF.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-pdf-preview-inspector',
    title: t('pdfPreviewInspectorTitle') || 'PDF Preview Inspector',
    width: 1100,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <input id="toolary-pdf-file" type="file" accept="application/pdf,.pdf" />
          <button class="toolary-ui-btn" data-action="inspect">${t('pdfPreviewInspectorInspect') || 'Inspect PDF'}</button>
        </div>
        <section id="toolary-pdf-info" class="toolary-preview-grid-2 toolary-preview-card" style="gap:8px;"></section>
        <section class="toolary-preview-section">
          <h3 style="margin:0 0 8px 0;font-size:14px;">${t('pdfPreviewInspectorThumbnails') || 'Page thumbnails'}</h3>
          <div id="toolary-pdf-thumbs" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;"></div>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  const fileInput = panel.querySelector('#toolary-pdf-file');
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="inspect"]'), 'click', () => inspectPdf(fileInput.files?.[0])));
  cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', () => inspectPdf(fileInput.files?.[0])));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'pdfPreviewInspector.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'pdfPreviewInspector');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
