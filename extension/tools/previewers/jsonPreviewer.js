import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, copyWithToast, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';
import { openToolFullscreen } from '../../shared/toolUi.js';

export const metadata = {
  id: 'json-previewer',
  name: 'JSON Previewer',
  category: 'previewers',
  icon: 'json-tree',
  permissions: ['activeTab'],
  tags: ['preview', 'json', 'tree', 'inspect'],
  keywords: ['json', 'tree', 'collapse', 'copy path', 'copy value']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let treeRoot = null;
const STYLES_ID = 'toolary-json-previewer-styles';

function ensureStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .toolary-json-search {
      flex: 1;
      min-width: 220px;
    }
    .toolary-json-tree {
      max-height: 62vh;
      padding: 8px;
    }
    .toolary-json-leaf {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      margin: 4px 0;
    }
    .toolary-json-leaf-content {
      min-width: 0;
    }
    .toolary-json-leaf-value {
      word-break: break-word;
    }
    .toolary-json-copy-actions {
      gap: 6px;
    }
    .toolary-json-node {
      margin: 6px 0;
    }
    .toolary-json-summary {
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .toolary-json-children {
      margin-top: 8px;
      padding-left: 10px;
      border-left: 2px dashed rgba(127, 127, 127, .32);
    }
    .toolary-json-node.is-search-match,
    .toolary-json-leaf.is-search-match {
      outline: 1px solid rgba(14, 165, 233, .4);
      outline-offset: 1px;
    }
  `;
  document.head.appendChild(style);
}

function formatPreview(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return Array.isArray(value) ? `Array(${value.length})` : 'Object';
  return String(value);
}

function renderNode(path, key, value) {
  const currentPath = key === '' ? '$' : path;
  const isObject = value && typeof value === 'object';

  const pathLabel = t('jsonPreviewerCopyPath') || 'Path';
  const valueLabel = t('jsonPreviewerCopyValue') || 'Value';

  if (!isObject) {
    return `
      <div class="toolary-ui-row toolary-preview-card toolary-json-leaf" data-searchable="${escapeHtml(`${currentPath} ${formatPreview(value)}`.toLowerCase())}">
        <div class="toolary-json-leaf-content">
          <strong class="toolary-preview-muted">${escapeHtml(currentPath)}</strong>
          <div class="toolary-json-leaf-value">${escapeHtml(formatPreview(value))}</div>
        </div>
        <div class="toolary-preview-row toolary-json-copy-actions">
          <button class="toolary-ui-btn" data-action="copy-path" data-value="${escapeHtml(currentPath)}">${escapeHtml(pathLabel)}</button>
          <button class="toolary-ui-btn" data-action="copy-value" data-value="${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value))}">${escapeHtml(valueLabel)}</button>
        </div>
      </div>
    `;
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);

  const children = entries.map(([childKey, childValue]) => {
    const childPath = Array.isArray(value)
      ? `${currentPath}[${childKey}]`
      : `${currentPath}.${childKey}`;
    return renderNode(childPath, String(childKey), childValue);
  }).join('');

  return `
    <details open data-tree="true" data-searchable="${escapeHtml(`${currentPath} ${Object.keys(value || {}).join(' ')}`.toLowerCase())}" class="toolary-preview-card toolary-json-node">
      <summary class="toolary-json-summary">
        <span><strong>${escapeHtml(currentPath)}</strong> <span class="toolary-preview-muted">${escapeHtml(formatPreview(value))}</span></span>
        <span class="toolary-preview-row toolary-json-copy-actions">
          <button class="toolary-ui-btn" data-action="copy-path" data-value="${escapeHtml(currentPath)}">${escapeHtml(pathLabel)}</button>
          <button class="toolary-ui-btn" data-action="copy-value" data-value="${escapeHtml(JSON.stringify(value, null, 2))}">${escapeHtml(valueLabel)}</button>
        </span>
      </summary>
      <div class="toolary-json-children">${children}</div>
    </details>
  `;
}

function applySearch(query) {
  const allNodes = panel?.querySelectorAll('[data-searchable]') || [];
  const detailsNodes = panel?.querySelectorAll('details[data-tree]') || [];
  const q = String(query || '').trim().toLowerCase();

  allNodes.forEach((node) => {
    const hay = node.getAttribute('data-searchable') || '';
    const matched = !q || hay.includes(q);
    node.style.display = matched ? '' : 'none';
    node.classList.toggle('is-search-match', Boolean(matched && q));
  });

  if (q) {
    detailsNodes.forEach((d) => {
      const visibleChild = Array.from(d.querySelectorAll('[data-searchable]')).some((node) => node.style.display !== 'none');
      d.open = visibleChild;
    });
  }
}

function buildTree() {
  const input = panel?.querySelector('#toolary-json-input')?.value?.trim() || '';
  if (!input) {
    showError(t('jsonPreviewerEmptyInput') || 'Please paste JSON data.');
    return;
  }

  try {
    const parsed = JSON.parse(input);
    treeRoot.innerHTML = renderNode('$', '', parsed);
  } catch (error) {
    showError(`${t('jsonPreviewerInvalidJson') || 'Invalid JSON.'} ${error.message || ''}`.trim());
  }
}

async function openTreeFullscreen() {
  if (!treeRoot) return;
  if (openToolFullscreen(treeRoot)) return;
  showError(t('jsonPreviewerFullscreenUnsupported') || t('fullscreenNotSupported') || 'Fullscreen is not supported on this page.');
}

function createPanel() {
  ensureStyles();
  const { overlay, dialog, cleanup } = createPreviewPanel({
    id: 'toolary-json-previewer',
    title: t('jsonPreviewerTitle') || 'JSON Previewer',
    width: 1100,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2">
        <label class="toolary-preview-section">
          <span class="toolary-preview-muted">${t('jsonPreviewerInput') || 'JSON Input'}</span>
          <textarea id="toolary-json-input" rows="20" placeholder="${t('jsonPreviewerInputPlaceholder') || 'Paste JSON here...'}"></textarea>
        </label>
        <section class="toolary-preview-section">
          <div class="toolary-preview-row">
            <input id="toolary-json-search" class="toolary-json-search" type="search" placeholder="${t('jsonPreviewerSearch') || 'Search keys/values/path...'}" />
            <button class="toolary-ui-btn" data-action="build">${t('jsonPreviewerRender') || 'Render Tree'}</button>
            <button class="toolary-ui-btn" data-action="expand">${t('jsonPreviewerExpand') || 'Expand all'}</button>
            <button class="toolary-ui-btn" data-action="collapse">${t('jsonPreviewerCollapse') || 'Collapse all'}</button>
            <button class="toolary-ui-btn" data-action="fullscreen">${t('fullscreen') || 'Fullscreen'}</button>
          </div>
          <div id="toolary-json-tree" class="toolary-preview-scroll toolary-json-tree"></div>
        </section>
      </div>
    `
  });

  panel = overlay;
  treeRoot = dialog.querySelector('#toolary-json-tree');
  cleanupFns = cleanup;

  cleanupFns.push(
    ...[
      ['[data-action="build"]', 'click', () => buildTree()],
      ['#toolary-json-search', 'input', (event) => applySearch(event.target.value)],
      ['[data-action="fullscreen"]', 'click', () => openTreeFullscreen()],
      ['[data-action="expand"]', 'click', () => {
        panel.querySelectorAll('details[data-tree]').forEach((node) => { node.open = true; });
      }],
      ['[data-action="collapse"]', 'click', () => {
        panel.querySelectorAll('details[data-tree]').forEach((node) => { node.open = false; });
      }]
    ].map(([selector, eventName, handler]) => {
      const el = panel.querySelector(selector);
      return el ? addEventListenerWithCleanup(el, eventName, handler) : () => {};
    })
  );

  cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
    const button = event.target.closest('button[data-action="copy-path"],button[data-action="copy-value"]');
    if (!button) return;
    const value = button.getAttribute('data-value') || '';
    copyWithToast(value, t('copied') || 'Copied');
    showCoffeeMessageForTool('json-previewer');
  }));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'jsonPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'jsonPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  treeRoot = null;
  deactivateCb = null;
}
