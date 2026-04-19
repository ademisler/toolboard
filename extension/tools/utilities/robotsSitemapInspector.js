import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from '../previewers/sharedPreviewUtils.js';

export const metadata = {
  id: 'robots-sitemap-inspector',
  name: 'Robots/Sitemap Inspector',
  category: 'utilities',
  icon: 'robots-sitemap',
  permissions: ['activeTab'],
  tags: ['robots', 'sitemap', 'seo', 'indexing'],
  keywords: ['robots.txt', 'sitemap.xml', 'crawl', 'indexability']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

function parseRobots(rawText) {
  const lines = String(rawText || '').split(/\r?\n/).map((line) => line.trim());
  const result = {
    userAgents: 0,
    disallow: 0,
    allow: 0,
    sitemapUrls: []
  };

  lines.forEach((line) => {
    if (!line || line.startsWith('#')) return;
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) result.userAgents += 1;
    if (lower.startsWith('disallow:')) result.disallow += 1;
    if (lower.startsWith('allow:')) result.allow += 1;
    if (lower.startsWith('sitemap:')) {
      const value = line.slice(line.indexOf(':') + 1).trim();
      if (value) result.sitemapUrls.push(value);
    }
  });

  return result;
}

function countSitemapUrls(xmlText) {
  const match = String(xmlText || '').match(/<url\b/gi);
  return match ? match.length : 0;
}

async function runInspect() {
  const out = panel?.querySelector('#toolary-robots-sitemap-output');
  if (!out) return;

  out.innerHTML = `<div class="toolary-preview-muted">${escapeHtml(t('robotsSitemapInspectorLoading') || 'Loading robots.txt and sitemap...')}</div>`;

  try {
    const origin = window.location.origin;
    const robotsUrl = `${origin}/robots.txt`;
    const robotsText = await fetchText(robotsUrl);
    const parsed = parseRobots(robotsText);

    let sitemapUrl = parsed.sitemapUrls[0] || `${origin}/sitemap.xml`;
    let sitemapCount = 0;
    let sitemapError = '';

    try {
      if (new URL(sitemapUrl).origin !== origin) {
        sitemapError = t('robotsSitemapInspectorCrossOriginSitemap') || 'Sitemap is on another origin and was not fetched.';
      } else {
        const xml = await fetchText(sitemapUrl);
        sitemapCount = countSitemapUrls(xml);
      }
    } catch (error) {
      sitemapError = error.message || '';
    }

    out.innerHTML = `
      <div class="toolary-preview-grid-2">
        <div class="toolary-preview-card"><strong>robots.txt</strong><div><code>${escapeHtml(robotsUrl)}</code></div></div>
        <div class="toolary-preview-card"><strong>sitemap</strong><div><code>${escapeHtml(sitemapUrl)}</code></div></div>
      </div>
      <div class="toolary-preview-grid-3" style="margin-top:8px;">
        <div class="toolary-preview-card"><strong>${escapeHtml(t('robotsSitemapInspectorUserAgents') || 'User-agents')}</strong><div>${parsed.userAgents}</div></div>
        <div class="toolary-preview-card"><strong>${escapeHtml(t('robotsSitemapInspectorDisallow') || 'Disallow rules')}</strong><div>${parsed.disallow}</div></div>
        <div class="toolary-preview-card"><strong>${escapeHtml(t('robotsSitemapInspectorAllow') || 'Allow rules')}</strong><div>${parsed.allow}</div></div>
      </div>
      <div class="toolary-preview-card" style="margin-top:8px;display:grid;gap:6px;">
        <strong>${escapeHtml(t('robotsSitemapInspectorSitemapUrls') || 'Sitemap URLs detected')}</strong>
        <div>${parsed.sitemapUrls.length ? parsed.sitemapUrls.map((item) => `<div><code>${escapeHtml(item)}</code></div>`).join('') : `<span class="toolary-preview-muted">${escapeHtml(t('robotsSitemapInspectorNoSitemap') || 'No sitemap directive in robots.txt')}</span>`}</div>
        <div class="toolary-preview-muted">${escapeHtml((t('robotsSitemapInspectorSitemapCount') || 'URL entries in sitemap: $1').replace('$1', String(sitemapCount)))}</div>
        ${sitemapError ? `<div class="toolary-preview-status-bad">${escapeHtml(sitemapError)}</div>` : ''}
      </div>
    `;

    showCoffeeMessageForTool('robots-sitemap-inspector');
  } catch (error) {
    handleError(error, 'robotsSitemapInspector.runInspect');
    showError(`${t('robotsSitemapInspectorFailed') || 'Failed to inspect robots/sitemap.'} ${error.message || ''}`.trim());
    out.innerHTML = '';
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-robots-sitemap-inspector',
    title: t('robotsSitemapInspectorTitle') || 'Robots/Sitemap Inspector',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="inspect">${t('robotsSitemapInspectorRun') || 'Inspect'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('robotsSitemapInspectorHint') || 'Checks robots.txt directives and sitemap URL coverage for the current site.')}</div>
        <section id="toolary-robots-sitemap-output"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="inspect"]'), 'click', runInspect));

  runInspect();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'robotsSitemapInspector.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'robotsSitemapInspector');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
