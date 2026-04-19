import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'link-previewer',
  name: 'Link Previewer',
  category: 'previewers',
  icon: 'link-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'link', 'url', 'status'],
  keywords: ['link', 'target', 'status', 'content-type', 'head']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function collectLinks() {
  const set = new Set();
  const links = [];
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.href;
    if (!href || set.has(href)) return;
    set.add(href);
    links.push({ href, text: (a.textContent || '').trim() || (t('linkPreviewerNoText') || '(no text)') });
  });
  return links.slice(0, 250);
}

async function checkLink(url) {
  try {
    const target = new URL(url, location.href);
    let response;

    try {
      response = await fetch(target.href, { method: 'HEAD', redirect: 'follow' });
    } catch {
      response = await fetch(target.href, { method: 'GET', redirect: 'follow' });
    }

    return {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type') || '-',
      finalUrl: response.url || target.href,
      note: ''
    };
  } catch (error) {
    return {
      status: '-',
      ok: false,
      contentType: '-',
      finalUrl: url,
      note: error.message || 'Request failed (possible CORS restriction).'
    };
  }
}

function renderLinks() {
  const listEl = panel?.querySelector('#toolary-link-list');
  if (!listEl) return;

  const q = (panel.querySelector('#toolary-link-search')?.value || '').toLowerCase();
  const items = collectLinks().filter((item) => !q || item.href.toLowerCase().includes(q) || item.text.toLowerCase().includes(q));

  listEl.innerHTML = items.length
    ? items.map((item, index) => `
      <button type="button" data-link-index="${index}" data-link-url="${escapeHtml(item.href)}" class="toolary-preview-card" style="display:grid;gap:3px;width:100%;text-align:left;cursor:pointer;">
        <strong class="toolary-preview-muted">${escapeHtml(item.text)}</strong>
        <span class="toolary-preview-muted" style="word-break:break-all;">${escapeHtml(item.href)}</span>
      </button>
    `).join('')
    : `<div class="toolary-preview-muted">${t('linkPreviewerNoLinks') || 'No links found.'}</div>`;
}

async function inspectUrl(url) {
  const out = panel?.querySelector('#toolary-link-details');
  if (!out || !url) return;

  out.innerHTML = `<div class="toolary-preview-muted">${t('linkPreviewerChecking') || 'Checking link...'}</div>`;
  const result = await checkLink(url);

  out.innerHTML = `
    <div><strong>${t('linkPreviewerTarget') || 'Target'}:</strong> <span style="word-break:break-all;">${escapeHtml(url)}</span></div>
    <div><strong>${t('linkPreviewerFinalUrl') || 'Final URL'}:</strong> <span style="word-break:break-all;">${escapeHtml(result.finalUrl)}</span></div>
    <div><strong>${t('linkPreviewerStatus') || 'Status'}:</strong> ${escapeHtml(result.status)}</div>
    <div><strong>${t('linkPreviewerContentType') || 'Content-Type'}:</strong> ${escapeHtml(result.contentType)}</div>
    ${result.note ? `<div class="toolary-preview-muted">${escapeHtml(result.note)}</div>` : ''}
  `;

  showCoffeeMessageForTool('link-previewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-link-previewer',
    title: t('linkPreviewerTitle') || 'Link Previewer',
    width: 1100,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2" style="gap:10px;">
        <section class="toolary-preview-section">
          <input id="toolary-link-search" type="search" placeholder="${t('linkPreviewerSearch') || 'Search links...'}" />
          <div id="toolary-link-list" class="toolary-preview-scroll" style="display:grid;gap:8px;max-height:64vh;padding:8px;"></div>
        </section>
        <section id="toolary-link-details" class="toolary-preview-card" style="display:grid;gap:8px;align-content:start;"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-link-search'), 'input', renderLinks));
  cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
    const button = event.target.closest('[data-link-url]');
    if (!button) return;
    inspectUrl(button.getAttribute('data-link-url'));
  }));

  renderLinks();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'linkPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'linkPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
