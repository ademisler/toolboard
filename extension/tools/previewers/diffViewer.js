import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'diff-viewer',
  name: 'Diff Viewer',
  category: 'previewers',
  icon: 'diff-viewer',
  permissions: ['activeTab'],
  tags: ['preview', 'diff', 'json', 'xml', 'text'],
  keywords: ['diff', 'compare', 'side by side', 'json diff', 'xml diff']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function normalizeXml(text) {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML');
  return new XMLSerializer().serializeToString(doc);
}

function normalizeByMode(text, mode) {
  if (mode === 'json') return JSON.stringify(JSON.parse(text), null, 2);
  if (mode === 'xml') return normalizeXml(text);
  return text;
}

function renderDiff() {
  const left = panel?.querySelector('#toolary-diff-left')?.value || '';
  const right = panel?.querySelector('#toolary-diff-right')?.value || '';
  const mode = panel?.querySelector('#toolary-diff-mode')?.value || 'text';
  const result = panel?.querySelector('#toolary-diff-result');
  if (!result) return;

  if (!left.trim() && !right.trim()) {
    showError(t('diffViewerEmptyInput') || 'Please provide content to compare.');
    return;
  }

  try {
    const leftNorm = normalizeByMode(left, mode).split(/\r?\n/);
    const rightNorm = normalizeByMode(right, mode).split(/\r?\n/);
    const max = Math.max(leftNorm.length, rightNorm.length);

    const rows = [];
    let changed = 0;
    for (let i = 0; i < max; i += 1) {
      const l = leftNorm[i] ?? '';
      const r = rightNorm[i] ?? '';
      const same = l === r;
      if (!same) changed += 1;
      rows.push(`<tr>
        <td style="background:${same ? 'transparent' : 'rgba(239,68,68,.14)'};white-space:pre-wrap;">${escapeHtml(l)}</td>
        <td style="background:${same ? 'transparent' : 'rgba(34,197,94,.14)'};white-space:pre-wrap;">${escapeHtml(r)}</td>
      </tr>`);
    }

    result.innerHTML = `<table style="table-layout:fixed;">
      <thead><tr>
        <th>A</th>
        <th>B</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;

    const stats = panel?.querySelector('#toolary-diff-stats');
    if (stats) stats.textContent = `${changed} ${t('diffViewerChangedLines') || 'changed lines'}`;

    showCoffeeMessageForTool('diff-viewer');
  } catch (error) {
    showError(`${t('diffViewerCompareFailed') || 'Comparison failed.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-diff-viewer',
    title: t('diffViewerTitle') || 'Diff Viewer',
    width: 1200,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack" style="grid-template-rows:auto auto 1fr;">
        <div class="toolary-preview-row">
          <select id="toolary-diff-mode" style="max-width:160px;">
            <option value="text">${t('diffViewerModeText') || 'Text'}</option>
            <option value="json">${t('diffViewerModeJson') || 'JSON'}</option>
            <option value="xml">${t('diffViewerModeXml') || 'XML'}</option>
          </select>
          <button class="toolary-ui-btn" data-action="compare">${t('diffViewerCompare') || 'Compare'}</button>
          <span id="toolary-diff-stats" class="toolary-preview-muted"></span>
        </div>
        <div class="toolary-preview-grid-2" style="gap:8px;">
          <textarea id="toolary-diff-left" rows="10" placeholder="${t('diffViewerInputA') || 'Input A'}"></textarea>
          <textarea id="toolary-diff-right" rows="10" placeholder="${t('diffViewerInputB') || 'Input B'}"></textarea>
        </div>
        <div id="toolary-diff-result" class="toolary-preview-scroll" style="max-height:48vh;"></div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="compare"]'), 'click', renderDiff));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'diffViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'diffViewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
