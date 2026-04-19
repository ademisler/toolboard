import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml, readFileAsText } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'har-viewer',
  name: 'HAR Viewer',
  category: 'previewers',
  icon: 'har-viewer',
  permissions: ['activeTab'],
  tags: ['preview', 'har', 'network', 'http'],
  keywords: ['har', 'network export', 'requests', 'waterfall']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let entries = [];

function renderEntries() {
  const wrap = panel?.querySelector('#toolary-har-table');
  const filter = (panel?.querySelector('#toolary-har-filter')?.value || '').toLowerCase();
  if (!wrap) return;

  const filtered = entries.filter((entry) => {
    if (!filter) return true;
    const hay = `${entry.method} ${entry.url} ${entry.status} ${entry.mime}`.toLowerCase();
    return hay.includes(filter);
  });

  wrap.innerHTML = filtered.length
    ? `<table>
        <thead><tr>
          <th>${t('harViewerMethodColumn') || 'Method'}</th>
          <th>${t('harViewerStatusColumn') || 'Status'}</th>
          <th>${t('harViewerTypeColumn') || 'Type'}</th>
          <th>${t('harViewerTimeColumn') || 'Time (ms)'}</th>
          <th>${t('harViewerUrlColumn') || 'URL'}</th>
        </tr></thead>
        <tbody>
          ${filtered.map((e) => `<tr>
            <td>${escapeHtml(e.method)}</td>
            <td>${e.status}</td>
            <td>${escapeHtml(e.mime)}</td>
            <td>${Number.isFinite(e.time) ? e.time.toFixed(1) : '-'}</td>
            <td>${escapeHtml(e.url)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : `<div class="toolary-preview-muted">${t('harViewerNoEntries') || 'No HAR entries.'}</div>`;
}

function parseHar(content) {
  const parsed = JSON.parse(content);
  const list = parsed?.log?.entries;
  if (!Array.isArray(list)) throw new Error('HAR log.entries not found');

  entries = list.map((entry) => ({
    method: entry?.request?.method || '-',
    url: entry?.request?.url || '-',
    status: entry?.response?.status ?? '-',
    mime: entry?.response?.content?.mimeType || '-',
    time: Number(entry?.time)
  }));

  const stats = panel?.querySelector('#toolary-har-stats');
  if (stats) stats.textContent = `${entries.length} ${t('harViewerRequests') || 'requests'}`;

  renderEntries();
  showCoffeeMessageForTool('har-viewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-har-viewer',
    title: t('harViewerTitle') || 'HAR Viewer',
    width: 1160,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <input id="toolary-har-file" type="file" accept=".har,application/json" />
          <button class="toolary-ui-btn" data-action="parse">${t('harViewerParse') || 'Parse HAR'}</button>
          <input id="toolary-har-filter" type="search" placeholder="${t('harViewerFilter') || 'Filter by URL/type/status...'}" style="flex:1;min-width:240px;" />
          <span id="toolary-har-stats" class="toolary-preview-muted"></span>
        </div>
        <textarea id="toolary-har-input" rows="8" placeholder="${t('harViewerInputPlaceholder') || 'Paste HAR JSON...'}"></textarea>
        <div id="toolary-har-table" class="toolary-preview-scroll" style="max-height:56vh;"></div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="parse"]'), 'click', () => {
    const text = panel?.querySelector('#toolary-har-input')?.value || '';
    if (!text.trim()) {
      showError(t('harViewerEmptyInput') || 'Please provide HAR JSON content.');
      return;
    }
    try {
      parseHar(text);
    } catch (error) {
      showError(`${t('harViewerParseFailed') || 'Failed to parse HAR.'} ${error.message || ''}`.trim());
    }
  }));

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-har-file'), 'change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const input = panel?.querySelector('#toolary-har-input');
      if (input) input.value = text;
      parseHar(text);
    } catch (error) {
      showError(`${t('harViewerFileReadFailed') || 'Failed to read HAR file.'} ${error.message || ''}`.trim());
    }
  }));

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-har-filter'), 'input', renderEntries));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'harViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'harViewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  entries = [];
  deactivateCb = null;
}
