import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'jsonl-ndjson-viewer',
  name: 'JSONL/NDJSON Viewer',
  category: 'previewers',
  icon: 'jsonl-viewer',
  permissions: ['activeTab'],
  tags: ['preview', 'jsonl', 'ndjson', 'logs'],
  keywords: ['jsonl', 'ndjson', 'logs', 'line json']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let records = [];

function parseJsonl(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.map((line, index) => {
    try {
      return { line: index + 1, data: JSON.parse(line), raw: line, error: null };
    } catch (error) {
      return { line: index + 1, data: null, raw: line, error: error.message || 'Invalid JSON' };
    }
  });
}

function renderTable() {
  const wrap = panel?.querySelector('#toolary-jsonl-table');
  const filter = (panel?.querySelector('#toolary-jsonl-filter')?.value || '').toLowerCase();
  if (!wrap) return;

  const filtered = records.filter((item) => {
    if (!filter) return true;
    return JSON.stringify(item.data ?? item.raw).toLowerCase().includes(filter);
  });

  wrap.innerHTML = filtered.length
    ? `<table>
        <thead><tr>
          <th>${t('jsonlViewerLineColumn') || 'Line'}</th>
          <th>${t('jsonlViewerStatusColumn') || 'Status'}</th>
          <th>${t('jsonlViewerPreviewColumn') || 'Preview'}</th>
        </tr></thead>
        <tbody>
          ${filtered.map((item) => `<tr>
            <td>${item.line}</td>
            <td>${item.error ? `<span class="toolary-preview-status-bad">${escapeHtml(t('jsonlViewerStatusInvalid') || 'Invalid')}</span>` : `<span class="toolary-preview-status-ok">${escapeHtml(t('jsonlViewerStatusOk') || 'OK')}</span>`}</td>
            <td>${escapeHtml(item.error ? item.raw : JSON.stringify(item.data))}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : `<div class="toolary-preview-muted">${t('jsonlViewerNoRecords') || 'No records.'}</div>`;
}

function parseAndRender() {
  const input = panel?.querySelector('#toolary-jsonl-input')?.value || '';
  if (!input.trim()) {
    showError(t('jsonlViewerEmptyInput') || 'Please paste JSONL/NDJSON content.');
    return;
  }

  records = parseJsonl(input);
  const stats = panel?.querySelector('#toolary-jsonl-stats');
  if (stats) {
    const invalid = records.filter((r) => r.error).length;
    stats.textContent = `${records.length} ${t('jsonlViewerRows') || 'rows'} • ${invalid} ${t('jsonlViewerInvalid') || 'invalid'}`;
  }
  renderTable();
  showCoffeeMessageForTool('jsonl-ndjson-viewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-jsonl-viewer',
    title: t('jsonlViewerTitle') || 'JSONL/NDJSON Viewer',
    width: 1120,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <textarea id="toolary-jsonl-input" rows="12" placeholder="${t('jsonlViewerInputPlaceholder') || '{"level":"info"}\n{"level":"error"}'}"></textarea>
        <div class="toolary-preview-row">
          <button class="toolary-ui-btn" data-action="parse">${t('jsonlViewerParse') || 'Parse logs'}</button>
          <input id="toolary-jsonl-filter" type="search" placeholder="${t('jsonlViewerFilter') || 'Filter...'}" style="flex:1;min-width:220px;" />
          <span id="toolary-jsonl-stats" class="toolary-preview-muted"></span>
        </div>
        <div id="toolary-jsonl-table" class="toolary-preview-scroll" style="max-height:56vh;"></div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="parse"]'), 'click', parseAndRender));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-jsonl-filter'), 'input', renderTable));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'jsonlViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'jsonlViewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  records = [];
  deactivateCb = null;
}
