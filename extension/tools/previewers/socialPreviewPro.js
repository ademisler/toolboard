import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';
import { enhanceToolUI, openToolFullscreen } from '../../shared/toolUi.js';

export const metadata = {
  id: 'social-preview-pro',
  name: 'Social Preview Pro',
  category: 'previewers',
  icon: 'social-preview-pro',
  permissions: ['activeTab'],
  tags: ['social', 'open graph', 'twitter', 'meta'],
  keywords: ['og', 'twitter card', 'social preview', 'meta tags']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
const STYLES_ID = 'toolary-social-preview-pro-styles';

function ensureStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .toolary-social-card {
      display: grid;
      gap: 10px;
    }
    .toolary-social-layout {
      grid-template-columns: 140px 1fr;
    }
    .toolary-social-media {
      width: 140px;
      height: 140px;
    }
    .toolary-social-media .toolary-media-el {
      object-fit: cover;
    }
    .toolary-social-title {
      font-size: 16px;
      line-height: 1.3;
    }
    .toolary-social-description {
      margin: 0;
      opacity: .85;
    }
    .toolary-social-url {
      word-break: break-all;
    }
    .toolary-social-checks {
      padding: 8px;
    }
    .toolary-social-checks-list {
      margin: 8px 0 0 18px;
    }
  `;
  document.head.appendChild(style);
}

function getMeta(name, attr = 'property') {
  const tag = document.querySelector(`meta[${attr}="${name}"]`);
  return tag?.getAttribute('content')?.trim() || '';
}

function collectData() {
  return {
    title: getMeta('og:title') || getMeta('twitter:title', 'name') || document.title || '',
    description: getMeta('og:description') || getMeta('twitter:description', 'name') || getMeta('description', 'name') || '',
    image: getMeta('og:image') || getMeta('twitter:image', 'name') || '',
    url: getMeta('og:url') || location.href,
    siteName: getMeta('og:site_name') || location.hostname,
    type: getMeta('og:type') || 'website',
    twitterCard: getMeta('twitter:card', 'name') || ''
  };
}

function validate(data) {
  const issues = [];
  if (!data.title) issues.push(t('socialPreviewProMissingTitle') || 'Missing title');
  if (!data.description) issues.push(t('socialPreviewProMissingDescription') || 'Missing description');
  if (!data.image) issues.push(t('socialPreviewProMissingImage') || 'Missing image');
  if (!data.url) issues.push(t('socialPreviewProMissingUrl') || 'Missing canonical/og:url');
  if (!data.twitterCard) issues.push(t('socialPreviewProMissingTwitterCard') || 'Missing twitter:card');
  return issues;
}

async function openPreviewImageFullscreen() {
  const image = panel?.querySelector('#toolary-social-preview-pro-output .toolary-media-el');
  if (!image) {
    showError(t('socialPreviewProNoImage') || 'No image');
    return;
  }
  if (openToolFullscreen(image)) return;
  showError(t('toolUiFullscreenNotSupported') || 'Fullscreen is not supported on this page.');
}

function renderPreview() {
  const data = collectData();
  const issues = validate(data);
  const out = panel?.querySelector('#toolary-social-preview-pro-output');
  if (!out) return;

  out.innerHTML = `
    <section class="toolary-preview-card toolary-social-card">
      <div class="toolary-preview-grid-2 toolary-social-layout">
        <div class="toolary-media-shell toolary-social-media ${data.image ? 'is-loading' : 'is-error'}">
          ${data.image
            ? `<img src="${escapeHtml(data.image)}" alt="${escapeHtml(t('toolUiMediaPreviewAlt') || 'Tool preview')}" class="toolary-media-el" />`
            : `<span class="toolary-media-placeholder"><span class="toolary-media-text" data-toolary-error-label="${escapeHtml(t('toolUiMediaPreviewUnavailable') || 'Preview unavailable')}">${escapeHtml(t('socialPreviewProNoImage') || 'No image')}</span></span>`}
          ${data.image ? `<span class="toolary-media-placeholder"><span class="toolary-media-spinner"></span></span>` : ''}
        </div>
        <div class="toolary-preview-section">
          <strong class="toolary-social-title">${escapeHtml(data.title || '-')}</strong>
          <p class="toolary-social-description">${escapeHtml(data.description || '-')}</p>
          <div class="toolary-preview-muted">${escapeHtml(data.siteName)} • ${escapeHtml(data.type)}</div>
          <div class="toolary-preview-muted toolary-social-url">${escapeHtml(data.url)}</div>
          <div class="toolary-preview-muted">twitter:card = ${escapeHtml(data.twitterCard || '-')}</div>
        </div>
      </div>
      <div class="toolary-preview-card toolary-social-checks">
        <strong>${escapeHtml(t('socialPreviewProChecks') || 'Checks')}</strong>
        <ul class="toolary-social-checks-list">${issues.length
          ? issues.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
          : `<li>${escapeHtml(t('socialPreviewProChecksOk') || 'Required social preview fields look good.')}</li>`}
        </ul>
      </div>
    </section>
  `;

  enhanceToolUI(document);
  showCoffeeMessageForTool('social-preview-pro');
}

function createPanel() {
  ensureStyles();
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-social-preview-pro',
    title: t('socialPreviewProTitle') || 'Social Preview Pro',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="refresh">${t('socialPreviewProRefresh') || 'Refresh'}</button>
          <button class="toolary-ui-btn" data-action="fullscreen">${t('toolUiFullscreenOpen') || 'Fullscreen image'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('socialPreviewProHint') || 'Open Graph + Twitter Card preview and field checks.')}</div>
        <section id="toolary-social-preview-pro-output" class="toolary-preview-section"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="refresh"]'), 'click', renderPreview));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="fullscreen"]'), 'click', openPreviewImageFullscreen));

  renderPreview();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'socialPreviewPro.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'socialPreviewPro');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
