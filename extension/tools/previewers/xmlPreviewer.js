import { addEventListenerWithCleanup, copyText, ensureLanguageLoaded, handleError, showError, showSuccess, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'xml-previewer',
  name: 'XML Previewer',
  category: 'previewers',
  icon: 'xml-tree',
  permissions: ['activeTab'],
  tags: ['preview', 'xml', 'tree', 'format'],
  keywords: ['xml', 'tree', 'format', 'pretty', 'nodes']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function formatXml(xml) {
  const text = String(xml || '')
    .replace(/>\s*</g, '><')
    .replace(/</g, '~::~<')
    .split('~::~')
    .filter(Boolean);

  let indent = 0;
  return text.map((node) => {
    if (/^<\//.test(node)) indent = Math.max(indent - 1, 0);
    const line = `${'  '.repeat(indent)}${node}`;
    if (/^<[^!?/][^>]*[^/]>/m.test(node)) indent += 1;
    return line;
  }).join('\n');
}

function nodeToTree(node, path) {
  if (!node) return '';

  if (node.nodeType === window.Node.TEXT_NODE) {
    const text = node.nodeValue?.trim();
    if (!text) return '';
    return `<div class="toolary-preview-card" style="margin:4px 0;" data-searchable="${escapeHtml(`${path} ${text}`.toLowerCase())}">${escapeHtml(text)}</div>`;
  }

  if (node.nodeType !== window.Node.ELEMENT_NODE) {
    return '';
  }

  const attrs = Array.from(node.attributes || []).map((attr) => `${attr.name}="${attr.value}"`).join(' ');
  const label = attrs ? `${node.tagName} ${attrs}` : node.tagName;
  const children = Array.from(node.childNodes || []).map((child, index) => nodeToTree(child, `${path}/${node.tagName}[${index}]`)).join('');

  return `
    <details open data-searchable="${escapeHtml(`${path} ${label}`.toLowerCase())}" class="toolary-preview-card" style="margin:6px 0;">
      <summary style="cursor:pointer;"><strong>&lt;${escapeHtml(node.tagName)}&gt;</strong> <span style="opacity:.75;">${escapeHtml(attrs)}</span></summary>
      <div style="margin-top:6px;padding-left:10px;border-left:2px dashed rgba(127,127,127,.3);">${children || `<em class="toolary-preview-muted">${escapeHtml(t('xmlPreviewerEmptyNode') || '(empty)')}</em>`}</div>
    </details>
  `;
}

function renderXml() {
  const input = panel?.querySelector('#toolary-xml-input')?.value || '';
  const formatted = panel?.querySelector('#toolary-xml-formatted');
  const tree = panel?.querySelector('#toolary-xml-tree');

  if (!input.trim()) {
    showError(t('xmlPreviewerEmptyInput') || 'Please paste XML content.');
    return;
  }

  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(input, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error(doc.querySelector('parsererror')?.textContent || 'Invalid XML');
    }

    const pretty = formatXml(new XMLSerializer().serializeToString(doc));
    if (formatted) formatted.value = pretty;

    const root = doc.documentElement;
    if (tree) {
      tree.innerHTML = nodeToTree(root, '$');
    }

    showCoffeeMessageForTool('xml-previewer');
  } catch (error) {
    showError(`${t('xmlPreviewerParseFailed') || 'Failed to parse XML.'} ${error.message || ''}`.trim());
  }
}

function filterTree(text) {
  const q = String(text || '').trim().toLowerCase();
  panel?.querySelectorAll('[data-searchable]').forEach((node) => {
    const hay = node.getAttribute('data-searchable') || '';
    node.style.display = !q || hay.includes(q) ? '' : 'none';
  });
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-xml-previewer',
    title: t('xmlPreviewerTitle') || 'XML Previewer',
    width: 1140,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2">
        <section class="toolary-preview-section">
          <div class="toolary-preview-row">
            <button class="toolary-ui-btn" data-action="render">${t('xmlPreviewerRender') || 'Render'}</button>
            <button class="toolary-ui-btn" data-action="copy">${t('xmlPreviewerCopyFormatted') || 'Copy formatted XML'}</button>
          </div>
          <textarea id="toolary-xml-input" rows="11" placeholder="${t('xmlPreviewerInputPlaceholder') || '<root>...</root>'}"></textarea>
          <textarea id="toolary-xml-formatted" rows="11" readonly></textarea>
        </section>
        <section class="toolary-preview-section">
          <input id="toolary-xml-search" type="search" placeholder="${t('xmlPreviewerSearch') || 'Search tags/values...'}" />
          <div id="toolary-xml-tree" class="toolary-preview-scroll" style="max-height:64vh;padding:8px;"></div>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="render"]'), 'click', renderXml));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="copy"]'), 'click', async () => {
    const value = panel.querySelector('#toolary-xml-formatted')?.value || '';
    if (!value) {
      showError(t('xmlPreviewerNothingToCopy') || 'Nothing to copy.');
      return;
    }
    await copyText(value);
    showSuccess(t('copied') || 'Copied');
  }));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-xml-search'), 'input', (event) => filterTree(event.target.value)));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'xmlPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'xmlPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
