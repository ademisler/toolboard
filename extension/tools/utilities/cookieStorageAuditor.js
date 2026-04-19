import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from '../previewers/sharedPreviewUtils.js';

export const metadata = {
  id: 'cookie-storage-auditor',
  name: 'Cookie & Storage Auditor',
  category: 'utilities',
  icon: 'cookie-auditor',
  permissions: ['activeTab'],
  tags: ['cookie', 'storage', 'privacy', 'audit'],
  keywords: ['cookies', 'localStorage', 'sessionStorage', 'privacy audit']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function bytesOf(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

function summarizeStorage(store) {
  const items = [];
  let total = 0;
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    const value = store.getItem(key) || '';
    const size = bytesOf(key) + bytesOf(value);
    total += size;
    items.push({ key, size });
  }
  items.sort((a, b) => b.size - a.size);
  return { total, items: items.slice(0, 12) };
}

function parseCookies() {
  const raw = document.cookie || '';
  if (!raw.trim()) return [];
  return raw
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const eq = chunk.indexOf('=');
      const name = eq >= 0 ? chunk.slice(0, eq) : chunk;
      const value = eq >= 0 ? chunk.slice(eq + 1) : '';
      return { name, value, size: bytesOf(chunk) };
    });
}

function findRiskyCookies(cookies) {
  const pattern = /(session|token|auth|jwt|sid)/i;
  return cookies.filter((cookie) => pattern.test(cookie.name) && !/^(__Secure-|__Host-)/.test(cookie.name));
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function runAudit() {
  const out = panel?.querySelector('#toolary-cookie-storage-output');
  if (!out) return;

  try {
    const cookies = parseCookies();
    const risky = findRiskyCookies(cookies);
    const cookieTotal = cookies.reduce((acc, item) => acc + item.size, 0);

    const local = summarizeStorage(window.localStorage);
    const session = summarizeStorage(window.sessionStorage);

    out.innerHTML = `
      <div class="toolary-preview-grid-3">
        <div class="toolary-preview-card"><strong>${escapeHtml(t('cookieStorageAuditorCookies') || 'Cookies')}</strong><div>${cookies.length}</div><div class="toolary-preview-muted">${formatBytes(cookieTotal)}</div></div>
        <div class="toolary-preview-card"><strong>localStorage</strong><div>${window.localStorage.length}</div><div class="toolary-preview-muted">${formatBytes(local.total)}</div></div>
        <div class="toolary-preview-card"><strong>sessionStorage</strong><div>${window.sessionStorage.length}</div><div class="toolary-preview-muted">${formatBytes(session.total)}</div></div>
      </div>
      <div class="toolary-preview-card" style="margin-top:8px;display:grid;gap:6px;">
        <strong>${escapeHtml(t('cookieStorageAuditorRiskyCookies') || 'Potentially risky cookie names')}</strong>
        <div>${risky.length
          ? risky.map((item) => `<div><code>${escapeHtml(item.name)}</code> <span class="toolary-preview-muted">(${formatBytes(item.size)})</span></div>`).join('')
          : `<span class="toolary-preview-status-ok">${escapeHtml(t('cookieStorageAuditorNoRisky') || 'No risky cookie names detected.')}</span>`}
        </div>
      </div>
      <div class="toolary-preview-grid-2" style="margin-top:8px;">
        <div class="toolary-preview-card" style="display:grid;gap:6px;">
          <strong>${escapeHtml(t('cookieStorageAuditorTopLocal') || 'Top localStorage keys')}</strong>
          <div>${local.items.length
            ? local.items.map((item) => `<div><code>${escapeHtml(item.key)}</code> <span class="toolary-preview-muted">${formatBytes(item.size)}</span></div>`).join('')
            : `<span class="toolary-preview-muted">-</span>`}
          </div>
        </div>
        <div class="toolary-preview-card" style="display:grid;gap:6px;">
          <strong>${escapeHtml(t('cookieStorageAuditorTopSession') || 'Top sessionStorage keys')}</strong>
          <div>${session.items.length
            ? session.items.map((item) => `<div><code>${escapeHtml(item.key)}</code> <span class="toolary-preview-muted">${formatBytes(item.size)}</span></div>`).join('')
            : `<span class="toolary-preview-muted">-</span>`}
          </div>
        </div>
      </div>
    `;

    showCoffeeMessageForTool('cookie-storage-auditor');
  } catch (error) {
    handleError(error, 'cookieStorageAuditor.runAudit');
    showError(`${t('cookieStorageAuditorFailed') || 'Failed to audit storage.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-cookie-storage-auditor',
    title: t('cookieStorageAuditorTitle') || 'Cookie & Storage Auditor',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="audit">${t('cookieStorageAuditorRun') || 'Run audit'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('cookieStorageAuditorHint') || 'Summarizes cookie/localStorage/sessionStorage usage for quick privacy review.')}</div>
        <section id="toolary-cookie-storage-output"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="audit"]'), 'click', runAudit));

  runAudit();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'cookieStorageAuditor.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'cookieStorageAuditor');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
