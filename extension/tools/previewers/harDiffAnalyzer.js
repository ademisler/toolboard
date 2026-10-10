import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'har-diff-analyzer',
  name: 'HAR Diff Analyzer',
  category: 'previewers',
  icon: 'har-diff',
  permissions: ['activeTab'],
  tags: ['har', 'network', 'diff', 'performance'],
  keywords: ['har diff', 'network compare', 'request delta', 'latency diff']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function parseHar(value) {
  const parsed = JSON.parse(value);
  const entries = parsed?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error(t('harDiffAnalyzerInvalid') || 'Invalid HAR format.');
  }
  return entries;
}

function normalizePath(urlValue) {
  try {
    const parsed = new URL(urlValue);
    return parsed.pathname || '/';
  } catch {
    return String(urlValue || '/');
  }
}

function summarize(entries) {
  const count = entries.length;
  const totalTime = entries.reduce((acc, item) => acc + (Number(item?.time) || 0), 0);
  const avgTime = count ? totalTime / count : 0;
  const errorCount = entries.filter((item) => Number(item?.response?.status) >= 400).length;

  const byPath = {};
  entries.forEach((item) => {
    const path = normalizePath(item?.request?.url || '');
    byPath[path] = (byPath[path] || 0) + 1;
  });

  return {
    count,
    avgTime,
    errorCount,
    byPath
  };
}

function comparePathCounts(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys
    .map((key) => ({
      path: key,
      before: a[key] || 0,
      after: b[key] || 0,
      delta: (b[key] || 0) - (a[key] || 0)
    }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 40);
}

function runDiff() {
  const beforeInput = panel?.querySelector('#toolary-har-diff-before');
  const afterInput = panel?.querySelector('#toolary-har-diff-after');
  const out = panel?.querySelector('#toolary-har-diff-output');
  if (!beforeInput || !afterInput || !out) return;

  try {
    const beforeEntries = parseHar(beforeInput.value || '');
    const afterEntries = parseHar(afterInput.value || '');

    const before = summarize(beforeEntries);
    const after = summarize(afterEntries);
    const rows = comparePathCounts(before.byPath, after.byPath)
      .map((item) => `
        <tr>
          <td><code>${escapeHtml(item.path)}</code></td>
          <td>${item.before}</td>
          <td>${item.after}</td>
          <td>${item.delta > 0 ? '+' : ''}${item.delta}</td>
        </tr>
      `)
      .join('');

    out.innerHTML = `
      <div class="toolary-preview-grid-2">
        <div class="toolary-preview-card"><strong>${escapeHtml(t('harDiffAnalyzerReqBefore') || 'Requests (A)')}</strong><div>${before.count}</div></div>
        <div class="toolary-preview-card"><strong>${escapeHtml(t('harDiffAnalyzerReqAfter') || 'Requests (B)')}</strong><div>${after.count}</div></div>
        <div class="toolary-preview-card"><strong>${escapeHtml(t('harDiffAnalyzerAvgBefore') || 'Avg ms (A)')}</strong><div>${Math.round(before.avgTime)}</div></div>
        <div class="toolary-preview-card"><strong>${escapeHtml(t('harDiffAnalyzerAvgAfter') || 'Avg ms (B)')}</strong><div>${Math.round(after.avgTime)}</div></div>
      </div>
      <div class="toolary-preview-card" style="display:grid;gap:8px;">
        <strong>${escapeHtml(t('harDiffAnalyzerTopPathChanges') || 'Top path changes')}</strong>
        <div class="toolary-preview-scroll" style="max-height:45vh;">
          <table>
            <thead><tr><th>${escapeHtml(t('harDiffAnalyzerPath') || 'Path')}</th><th>A</th><th>B</th><th>Δ</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="4">${escapeHtml(t('harDiffAnalyzerNoDiff') || 'No path-level changes found.')}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;

    showCoffeeMessageForTool('har-diff-analyzer');
  } catch (error) {
    handleError(error, 'harDiffAnalyzer.runDiff');
    showError(error.message || (t('harDiffAnalyzerInvalid') || 'Invalid HAR format.'));
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-har-diff-analyzer',
    title: t('harDiffAnalyzerTitle') || 'HAR Diff Analyzer',
    width: 1160,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="run">${t('harDiffAnalyzerRun') || 'Compare HAR files'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('harDiffAnalyzerHint') || 'Paste two HAR JSON payloads (before/after) and compare path-level traffic changes.')}</div>
        <div class="toolary-preview-grid-2">
          <label class="toolary-preview-section">
            <span class="toolary-preview-muted">${escapeHtml(t('harDiffAnalyzerInputA') || 'HAR A (before)')}</span>
            <textarea id="toolary-har-diff-before" rows="16" placeholder="{\"log\":{\"entries\":[]}}"></textarea>
          </label>
          <label class="toolary-preview-section">
            <span class="toolary-preview-muted">${escapeHtml(t('harDiffAnalyzerInputB') || 'HAR B (after)')}</span>
            <textarea id="toolary-har-diff-after" rows="16" placeholder="{\"log\":{\"entries\":[]}}"></textarea>
          </label>
        </div>
        <section id="toolary-har-diff-output" class="toolary-preview-section"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="run"]'), 'click', runDiff));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'harDiffAnalyzer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'harDiffAnalyzer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
