import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';
import { enhanceToolUI } from '../../shared/toolUi.js';

export const metadata = {
  id: 'opengraph-meta-previewer',
  name: 'OpenGraph/Meta Previewer',
  category: 'previewers',
  icon: 'social-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'meta', 'opengraph', 'social'],
  keywords: ['og:title', 'og:image', 'twitter card', 'meta']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function getMeta(name, attr = 'property') {
  const tag = document.querySelector(`meta[${attr}="${name}"]`);
  return tag?.getAttribute('content')?.trim() || '';
}

function collectMeta() {
  const title = getMeta('og:title') || getMeta('twitter:title', 'name') || document.title || '';
  const description = getMeta('og:description') || getMeta('description', 'name') || '';
  const image = getMeta('og:image') || getMeta('twitter:image', 'name') || '';
  const url = getMeta('og:url') || location.href;
  const siteName = getMeta('og:site_name') || location.hostname;
  const type = getMeta('og:type') || 'website';

  return { title, description, image, url, siteName, type };
}

function renderPreview() {
  const data = collectMeta();
  const card = panel?.querySelector('#toolary-og-card');
  const raw = panel?.querySelector('#toolary-og-raw');
  if (!card || !raw) return;

  card.innerHTML = `
    <div class="toolary-preview-grid-2" style="grid-template-columns:120px 1fr;">
      <div class="toolary-media-shell ${data.image ? 'is-loading' : 'is-error'}" style="width:120px;height:120px;">
        ${data.image
    ? `<img src="${escapeHtml(data.image)}" alt="${escapeHtml(t('toolUiMediaPreviewAlt') || 'Tool preview')}" class="toolary-media-el" style="object-fit:cover;" />`
    : `<span class="toolary-media-placeholder"><span class="toolary-media-text" data-toolary-error-label="${escapeHtml(t('toolUiMediaPreviewUnavailable') || 'Preview unavailable')}">${escapeHtml(t('openGraphMetaPreviewerNoImage') || 'No Image')}</span></span>`}
        ${data.image ? `<span class="toolary-media-placeholder"><span class="toolary-media-spinner"></span><span class="toolary-media-text" data-toolary-error-label="${escapeHtml(t('toolUiMediaPreviewUnavailable') || 'Preview unavailable')}">${escapeHtml(t('loading') || 'Loading')}</span></span>` : ''}
      </div>
      <div class="toolary-preview-section">
        <strong style="font-size:16px;line-height:1.3;">${escapeHtml(data.title || t('unknown') || 'Unknown')}</strong>
        <p style="margin:0;opacity:.84;line-height:1.4;">${escapeHtml(data.description || t('xmlPreviewerEmptyNode') || '(empty)')}</p>
        <div style="font-size:12px;opacity:.72;word-break:break-all;">${escapeHtml(data.url)}</div>
        <div style="font-size:12px;opacity:.72;">${escapeHtml(data.siteName)} • ${escapeHtml(data.type)}</div>
      </div>
    </div>
  `;
  enhanceToolUI(document);
  const image = card.querySelector('img.toolary-media-el');
  const shell = card.querySelector('.toolary-media-shell');
  if (image && shell) {
    image.addEventListener('load', () => shell.classList.remove('is-loading'), { once: true });
    image.addEventListener('error', () => {
      shell.classList.remove('is-loading');
      shell.classList.add('is-error');
    }, { once: true });
  }

  raw.textContent = JSON.stringify(data, null, 2);
  showCoffeeMessageForTool('opengraph-meta-previewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-opengraph-meta-previewer',
    title: t('openGraphMetaPreviewerTitle') || 'OpenGraph/Meta Previewer',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <button class="toolary-ui-btn" data-action="refresh">${t('openGraphMetaPreviewerRefresh') || 'Refresh preview'}</button>
        </div>
        <section id="toolary-og-card" class="toolary-preview-card"></section>
        <textarea id="toolary-og-raw" rows="10" readonly></textarea>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="refresh"]'), 'click', renderPreview));

  renderPreview();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'openGraphMetaPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'openGraphMetaPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
