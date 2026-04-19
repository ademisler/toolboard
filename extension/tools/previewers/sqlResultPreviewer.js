import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, detectDelimiter, escapeHtml, parseDelimited, sortRows } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'sql-result-previewer',
  name: 'SQL Result Previewer',
  category: 'previewers',
  icon: 'sql-result',
  permissions: ['activeTab'],
  tags: ['preview', 'sql', 'table', 'csv', 'json'],
  keywords: ['sql result', 'csv', 'tsv', 'json table']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let table = { headers: [], rows: [] };
let sortState = { index: -1, direction: 'asc' };

function parseInputToTable(text, format) {
  const input = String(text || '').trim();
  if (!input) return { headers: [], rows: [] };

  if (format === 'json') {
    const parsed = JSON.parse(input);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const keySet = new Set();
    arr.forEach((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        Object.keys(row).forEach((k) => keySet.add(k));
      }
    });
    const headers = [...keySet];
    const rows = arr.map((row) => headers.map((h) => (row && typeof row === 'object' ? row[h] : '')));
    return { headers, rows };
  }

  const delimiter = format === 'tsv' ? '\t' : format === 'csv' ? ',' : detectDelimiter(input);
  const rowsRaw = parseDelimited(input, delimiter);
  if (!rowsRaw.length) return { headers: [], rows: [] };

  const headers = rowsRaw[0].map((h, i) => (String(h || '').trim() || `col_${i + 1}`));
  const rows = rowsRaw.slice(1);
  return { headers, rows };
}

function renderTable() {
  const wrap = panel?.querySelector('#toolary-sql-result-table');
  const filter = (panel?.querySelector('#toolary-sql-result-filter')?.value || '').toLowerCase();
  if (!wrap) return;

  let rows = [...table.rows];
  if (sortState.index >= 0) {
    rows = sortRows(rows, sortState.index, sortState.direction);
  }

  if (filter) {
    rows = rows.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(filter)));
  }

  wrap.innerHTML = table.headers.length
    ? `<table>
      <thead><tr>${table.headers.map((h, i) => `<th data-sort-index="${i}" style="cursor:pointer;">${escapeHtml(h)} ${sortState.index===i?(sortState.direction==='asc'?'▲':'▼'):''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${table.headers.map((_, i) => `<td>${escapeHtml(row[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`
    : `<div class="toolary-preview-muted">${t('sqlResultPreviewerNoRows') || 'No rows to show.'}</div>`;
}

function parseAndRender() {
  const input = panel?.querySelector('#toolary-sql-result-input')?.value || '';
  const format = panel?.querySelector('#toolary-sql-result-format')?.value || 'auto';

  if (!input.trim()) {
    showError(t('sqlResultPreviewerEmptyInput') || 'Please provide SQL result data.');
    return;
  }

  try {
    table = parseInputToTable(input, format);
    sortState = { index: -1, direction: 'asc' };
    renderTable();
    const stats = panel?.querySelector('#toolary-sql-result-stats');
    if (stats) stats.textContent = `${table.rows.length} ${t('sqlResultPreviewerRows') || 'rows'} • ${table.headers.length} ${t('sqlResultPreviewerColumns') || 'columns'}`;
    showCoffeeMessageForTool('sql-result-previewer');
  } catch (error) {
    showError(`${t('sqlResultPreviewerParseFailed') || 'Failed to parse SQL result.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-sql-result-previewer',
    title: t('sqlResultPreviewerTitle') || 'SQL Result Previewer',
    width: 1160,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <select id="toolary-sql-result-format" style="max-width:180px;">
            <option value="auto">${t('sqlResultPreviewerFormatAuto') || 'Auto'}</option>
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="json">JSON</option>
          </select>
          <button class="toolary-ui-btn" data-action="parse">${t('sqlResultPreviewerParse') || 'Preview table'}</button>
          <input id="toolary-sql-result-filter" type="search" placeholder="${t('sqlResultPreviewerFilter') || 'Filter rows...'}" style="flex:1;min-width:240px;" />
          <span id="toolary-sql-result-stats" class="toolary-preview-muted"></span>
        </div>
        <textarea id="toolary-sql-result-input" rows="10" placeholder="${t('sqlResultPreviewerInputPlaceholder') || '[{"id":1,"name":"Alice"}]'}"></textarea>
        <div id="toolary-sql-result-table" class="toolary-preview-scroll" style="max-height:54vh;"></div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="parse"]'), 'click', parseAndRender));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-sql-result-filter'), 'input', renderTable));
  cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
    const th = event.target.closest('th[data-sort-index]');
    if (!th) return;
    const idx = Number(th.dataset.sortIndex);
    if (sortState.index === idx) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.index = idx;
      sortState.direction = 'asc';
    }
    renderTable();
  }));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'sqlResultPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'sqlResultPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  table = { headers: [], rows: [] };
  sortState = { index: -1, direction: 'asc' };
  deactivateCb = null;
}
