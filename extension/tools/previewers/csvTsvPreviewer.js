import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, detectDelimiter, escapeHtml, parseDelimited, readFileAsText, sortRows } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'csv-tsv-previewer',
  name: 'CSV/TSV Previewer',
  category: 'previewers',
  icon: 'table-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'csv', 'tsv', 'table'],
  keywords: ['csv', 'tsv', 'delimiter', 'filter', 'sort']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let rows = [];
let sortState = { index: -1, direction: 'asc' };

function normalizeDelimiterLabel(delimiter) {
  if (delimiter === '\t') return t('csvTsvPreviewerDelimiterTab') || 'Tab';
  if (delimiter === ';') return t('csvTsvPreviewerDelimiterSemicolon') || 'Semicolon';
  if (delimiter === '|') return t('csvTsvPreviewerDelimiterPipe') || 'Pipe';
  return t('csvTsvPreviewerDelimiterComma') || 'Comma';
}

function renderTable() {
  const tableWrap = panel?.querySelector('#toolary-csv-table-wrap');
  const filter = (panel?.querySelector('#toolary-csv-filter')?.value || '').toLowerCase();
  const hasHeader = Boolean(panel?.querySelector('#toolary-csv-header')?.checked);
  if (!tableWrap) return;

  if (!rows.length) {
    tableWrap.innerHTML = `<div class="toolary-preview-muted" style="padding:10px;">${t('csvTsvPreviewerEmpty') || 'No rows to preview.'}</div>`;
    return;
  }

  let tableRows = [...rows];
  if (sortState.index >= 0) {
    const bodyRows = hasHeader ? tableRows.slice(1) : tableRows;
    const sorted = sortRows(bodyRows, sortState.index, sortState.direction);
    tableRows = hasHeader ? [tableRows[0], ...sorted] : sorted;
  }

  if (filter) {
    const body = hasHeader ? tableRows.slice(1) : tableRows;
    const filtered = body.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(filter)));
    tableRows = hasHeader ? [tableRows[0], ...filtered] : filtered;
  }

  const headerRow = hasHeader ? tableRows[0] || [] : (rows[0] || []).map((_, index) => `Column ${index + 1}`);
  const bodyRows = hasHeader ? tableRows.slice(1) : tableRows;

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          ${headerRow.map((cell, index) => `<th data-sort-index="${index}" style="cursor:pointer;">${escapeHtml(String(cell))} ${sortState.index === index ? (sortState.direction === 'asc' ? '▲' : '▼') : ''}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${bodyRows.map((row) => `<tr>${headerRow.map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function parseInput(text) {
  const delimiter = detectDelimiter(text);
  rows = parseDelimited(text, delimiter);
  sortState = { index: -1, direction: 'asc' };

  const stats = panel?.querySelector('#toolary-csv-stats');
  if (stats) {
    stats.textContent = `${rows.length} rows | ${rows[0]?.length || 0} columns | ${normalizeDelimiterLabel(delimiter)}`;
  }

  renderTable();
  showCoffeeMessageForTool('csv-tsv-previewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-csv-tsv-previewer',
    title: t('csvTsvPreviewerTitle') || 'CSV/TSV Previewer',
    width: 1160,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <input id="toolary-csv-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain" />
          <label class="toolary-preview-row" style="gap:6px;"><input id="toolary-csv-header" type="checkbox" checked style="width:auto;" /> ${t('csvTsvPreviewerHeader') || 'First row is header'}</label>
          <input id="toolary-csv-filter" type="search" placeholder="${t('csvTsvPreviewerFilter') || 'Filter rows...'}" style="flex:1;min-width:220px;" />
          <button class="toolary-ui-btn" data-action="parse">${t('csvTsvPreviewerParse') || 'Preview table'}</button>
        </div>
        <textarea id="toolary-csv-input" rows="8" placeholder="${t('csvTsvPreviewerInputPlaceholder') || 'Paste CSV/TSV here...'}"></textarea>
        <div id="toolary-csv-stats" class="toolary-preview-muted">${t('csvTsvPreviewerStatsPlaceholder') || 'No file parsed yet.'}</div>
        <div id="toolary-csv-table-wrap" class="toolary-preview-scroll" style="max-height:55vh;"></div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  const input = panel.querySelector('#toolary-csv-input');
  const fileInput = panel.querySelector('#toolary-csv-file');
  const parseBtn = panel.querySelector('[data-action="parse"]');
  const filterInput = panel.querySelector('#toolary-csv-filter');
  const headerToggle = panel.querySelector('#toolary-csv-header');

  cleanupFns.push(addEventListenerWithCleanup(parseBtn, 'click', () => {
    const value = input?.value || '';
    if (!value.trim()) {
      showError(t('csvTsvPreviewerEmptyInput') || 'Please paste CSV/TSV content.');
      return;
    }
    try {
      parseInput(value);
    } catch (error) {
      showError(`${t('csvTsvPreviewerParseFailed') || 'Failed to parse data.'} ${error.message || ''}`.trim());
    }
  }));

  cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      if (input) input.value = text;
      parseInput(text);
    } catch (error) {
      showError(`${t('csvTsvPreviewerReadFailed') || 'Failed to read file.'} ${error.message || ''}`.trim());
    }
  }));

  cleanupFns.push(addEventListenerWithCleanup(filterInput, 'input', () => renderTable()));
  cleanupFns.push(addEventListenerWithCleanup(headerToggle, 'change', () => renderTable()));

  cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
    const th = event.target.closest('th[data-sort-index]');
    if (!th) return;
    const index = Number(th.dataset.sortIndex);
    if (sortState.index === index) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.index = index;
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
    handleError(error, 'csvTsvPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'csvTsvPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  rows = [];
  sortState = { index: -1, direction: 'asc' };
  deactivateCb = null;
}
