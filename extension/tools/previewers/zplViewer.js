import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, showSuccess, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, downloadBlob, escapeHtml } from './sharedPreviewUtils.js';
import { enhanceToolUI } from '../../shared/toolUi.js';

export const metadata = {
  id: 'zpl-viewer',
  name: 'ZPL Viewer',
  category: 'previewers',
  icon: 'zpl-viewer',
  permissions: ['activeTab', 'downloads'],
  tags: ['preview', 'zpl', 'label', 'barcode'],
  keywords: ['zpl', 'labelary', 'label', 'pdf', 'download']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let previewObjectUrl = '';

function cleanupPreviewObjectUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
  }
}

async function requestLabelary(zpl, format = 'image/png') {
  const dpmm = panel?.querySelector('#toolary-zpl-dpmm')?.value || '8';
  const size = panel?.querySelector('#toolary-zpl-size')?.value || '4x6';
  const index = panel?.querySelector('#toolary-zpl-index')?.value || '0';
  const url = `https://api.labelary.com/v1/printers/${encodeURIComponent(dpmm)}dpmm/labels/${encodeURIComponent(size)}/${encodeURIComponent(index)}/`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: format,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: zpl
  });

  if (!response.ok) {
    throw new Error(`Labelary request failed (${response.status})`);
  }

  return response.blob();
}

async function renderPreview() {
  const input = panel?.querySelector('#toolary-zpl-input')?.value || '';
  const preview = panel?.querySelector('#toolary-zpl-preview');
  if (!preview) return;

  if (!input.trim()) {
    showError(t('zplViewerEmptyInput') || 'Please paste ZPL content.');
    return;
  }

  preview.innerHTML = `
    <div class="toolary-media-shell is-loading" style="min-height:240px;max-height:62vh;width:100%;padding:8px;box-sizing:border-box;">
      <img alt="${escapeHtml(t('toolUiMediaPreviewAlt') || 'Tool preview')}" class="toolary-media-el" style="max-width:100%;max-height:60vh;width:auto;height:auto;" />
      <div class="toolary-media-placeholder">
        <div class="toolary-media-spinner"></div>
        <div class="toolary-media-text" data-toolary-error-label="${escapeHtml(t('toolUiMediaPreviewUnavailable') || 'Preview unavailable')}">${escapeHtml(t('zplViewerRendering') || 'Rendering...')}</div>
      </div>
    </div>
  `;
  enhanceToolUI(document);
  const shell = preview.querySelector('.toolary-media-shell');
  const image = preview.querySelector('.toolary-media-el');

  try {
    const blob = await requestLabelary(input, 'image/png');
    const url = URL.createObjectURL(blob);
    cleanupPreviewObjectUrl();
    previewObjectUrl = url;
    if (image) {
      image.addEventListener('load', () => {
        shell?.classList.remove('is-loading');
        shell?.classList.add('is-ready');
      }, { once: true });
      image.addEventListener('error', () => {
        shell?.classList.remove('is-loading');
        shell?.classList.add('is-error');
        cleanupPreviewObjectUrl();
      }, { once: true });
      image.src = url;
    }
    showCoffeeMessageForTool('zpl-viewer');
  } catch (error) {
    shell?.classList.remove('is-loading');
    shell?.classList.add('is-error');
    showError(`${t('zplViewerRenderFailed') || 'Failed to render ZPL.'} ${error.message || ''}`.trim());
  }
}

async function downloadPdf() {
  const input = panel?.querySelector('#toolary-zpl-input')?.value || '';
  if (!input.trim()) {
    showError(t('zplViewerEmptyInput') || 'Please paste ZPL content.');
    return;
  }

  try {
    const blob = await requestLabelary(input, 'application/pdf');
    const filename = `zpl-label-${Date.now()}.pdf`;
    downloadBlob(blob, filename);
    showSuccess(t('zplViewerPdfDownloaded') || 'PDF downloaded.');
    showCoffeeMessageForTool('zpl-viewer');
  } catch (error) {
    showError(`${t('zplViewerPdfFailed') || 'Failed to generate PDF.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-zpl-viewer',
    title: t('zplViewerTitle') || 'ZPL Viewer',
    width: 1060,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2" style="min-height:70vh;align-items:start;">
        <section class="toolary-preview-section">
          <div class="toolary-preview-grid-3">
            <label class="toolary-preview-section"><span class="toolary-preview-muted">${t('zplViewerDpmm') || 'dpmm'}</span><select id="toolary-zpl-dpmm"><option value="6">6</option><option value="8" selected>8</option><option value="12">12</option><option value="24">24</option></select></label>
            <label class="toolary-preview-section"><span class="toolary-preview-muted">${t('zplViewerLabelSize') || 'Label size (in)'}</span><input id="toolary-zpl-size" type="text" value="4x6" /></label>
            <label class="toolary-preview-section"><span class="toolary-preview-muted">${t('zplViewerLabelIndex') || 'Label index'}</span><input id="toolary-zpl-index" type="number" min="0" step="1" value="0" /></label>
          </div>

          <textarea id="toolary-zpl-input" rows="18" style="min-height:420px;">^XA
^FO40,40^A0N,30,30^FDToolboard ZPL Viewer^FS
^FO40,90^BY2
^BCN,80,Y,N,N
^FD123456789012^FS
^XZ</textarea>

          <div class="toolary-preview-row">
            <button class="toolary-ui-btn" data-action="preview">${t('zplViewerPreview') || 'Render preview'}</button>
            <button class="toolary-ui-btn" data-action="download-pdf">${t('zplViewerDownloadPdf') || 'Download PDF'}</button>
          </div>
        </section>

        <section class="toolary-preview-section">
          <span class="toolary-preview-muted">${t('zplViewerPreview') || 'Render preview'}</span>
          <section id="toolary-zpl-preview" class="toolary-preview-card" style="min-height:220px;height:100%;display:flex;align-items:center;justify-content:center;overflow:auto;"></section>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="preview"]'), 'click', renderPreview));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="download-pdf"]'), 'click', downloadPdf));

  renderPreview();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'zplViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'zplViewer');
  cleanupFns = [];
  cleanupPreviewObjectUrl();
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
