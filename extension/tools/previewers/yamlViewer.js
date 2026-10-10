import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'yaml-viewer',
  name: 'YAML Viewer',
  category: 'previewers',
  icon: 'yaml-viewer',
  permissions: ['activeTab'],
  tags: ['preview', 'yaml', 'tree', 'search'],
  keywords: ['yaml', 'tree', 'fold', 'search']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function countIndent(line) {
  const m = String(line || '').match(/^\s*/);
  return m ? m[0].length : 0;
}

function parseYamlLines(yaml) {
  const lines = String(yaml || '').split(/\r?\n/);
  const root = { label: '$', children: [] };
  const stack = [{ indent: -1, node: root }];

  lines.forEach((raw) => {
    const line = raw.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const indent = countIndent(line);
    const isArrayItem = trimmed.startsWith('- ');
    let label = trimmed;

    if (isArrayItem) {
      label = trimmed.slice(2).trim() || '- item';
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const node = { label, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  });

  return root;
}

function renderTree(node, path = '$') {
  const currentPath = `${path}/${node.label}`;
  if (!node.children?.length) {
    return `<div data-searchable="${escapeHtml(`${currentPath} ${node.label}`.toLowerCase())}" class="toolary-preview-card" style="margin:4px 0;">${escapeHtml(node.label)}</div>`;
  }

  return `
    <details open data-searchable="${escapeHtml(`${currentPath} ${node.label}`.toLowerCase())}" class="toolary-preview-card" style="margin:5px 0;">
      <summary style="cursor:pointer;font-weight:600;">${escapeHtml(node.label)}</summary>
      <div style="padding-left:10px;border-left:2px dashed rgba(127,127,127,.28);margin-top:6px;">${node.children.map((child) => renderTree(child, currentPath)).join('')}</div>
    </details>
  `;
}

function renderYaml() {
  const input = panel?.querySelector('#toolary-yaml-input')?.value || '';
  const output = panel?.querySelector('#toolary-yaml-tree');
  if (!output) return;

  if (!input.trim()) {
    showError(t('yamlViewerEmptyInput') || 'Please paste YAML content.');
    return;
  }

  try {
    const root = parseYamlLines(input);
    output.innerHTML = root.children.length
      ? root.children.map((node) => renderTree(node)).join('')
      : `<div class="toolary-preview-muted">${t('yamlViewerNoNodes') || 'No nodes parsed.'}</div>`;
    showCoffeeMessageForTool('yaml-viewer');
  } catch (error) {
    showError(`${t('yamlViewerParseFailed') || 'Failed to parse YAML.'} ${error.message || ''}`.trim());
  }
}

function applySearch(query) {
  const q = String(query || '').trim().toLowerCase();
  panel?.querySelectorAll('[data-searchable]').forEach((el) => {
    const hay = el.getAttribute('data-searchable') || '';
    el.style.display = !q || hay.includes(q) ? '' : 'none';
  });
}

function setFold(open) {
  panel?.querySelectorAll('#toolary-yaml-tree details').forEach((d) => {
    d.open = open;
  });
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-yaml-viewer',
    title: t('yamlViewerTitle') || 'YAML Viewer',
    width: 1120,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2" style="min-height:68vh;">
        <section class="toolary-preview-section">
          <textarea id="toolary-yaml-input" rows="24" placeholder="${t('yamlViewerInputPlaceholder') || 'key:\n  nested: value'}"></textarea>
          <div class="toolary-preview-row">
            <button class="toolary-ui-btn" data-action="render">${t('yamlViewerRender') || 'Render tree'}</button>
            <button class="toolary-ui-btn" data-action="expand">${t('yamlViewerExpandAll') || 'Expand all'}</button>
            <button class="toolary-ui-btn" data-action="collapse">${t('yamlViewerCollapseAll') || 'Collapse all'}</button>
          </div>
        </section>
        <section class="toolary-preview-section">
          <input id="toolary-yaml-search" type="search" placeholder="${t('yamlViewerSearch') || 'Search nodes...'}" />
          <div id="toolary-yaml-tree" class="toolary-preview-scroll" style="max-height:68vh;padding:8px;"></div>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="render"]'), 'click', renderYaml));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="expand"]'), 'click', () => setFold(true)));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="collapse"]'), 'click', () => setFold(false)));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-yaml-search'), 'input', (e) => applySearch(e.target.value)));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'yamlViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'yamlViewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
