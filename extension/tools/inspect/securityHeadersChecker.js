import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from '../previewers/sharedPreviewUtils.js';

export const metadata = {
  id: 'security-headers-checker',
  name: 'Security Headers Checker',
  category: 'inspect',
  icon: 'security-headers',
  permissions: ['activeTab'],
  tags: ['security', 'headers', 'http', 'policy'],
  keywords: ['csp', 'hsts', 'x-frame-options', 'permissions-policy']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

const HEADER_RULES = [
  { key: 'strict-transport-security', label: 'HSTS' },
  { key: 'content-security-policy', label: 'CSP' },
  { key: 'x-frame-options', label: 'X-Frame-Options' },
  { key: 'x-content-type-options', label: 'X-Content-Type-Options' },
  { key: 'referrer-policy', label: 'Referrer-Policy' },
  { key: 'permissions-policy', label: 'Permissions-Policy' }
];

async function fetchHeaders() {
  const url = window.location.href;
  const tryRequest = async (method) => {
    const response = await fetch(url, {
      method,
      cache: 'no-store',
      redirect: 'follow'
    });
    return response;
  };

  try {
    return await tryRequest('HEAD');
  } catch {
    return tryRequest('GET');
  }
}

function gradeHeader(value) {
  if (!value) return 'missing';
  if (String(value).trim().length < 3) return 'weak';
  return 'ok';
}

async function runCheck() {
  const out = panel?.querySelector('#toolary-security-headers-output');
  if (!out) return;

  out.innerHTML = `<div class="toolary-preview-muted">${escapeHtml(t('securityHeadersCheckerLoading') || 'Loading headers...')}</div>`;

  try {
    const response = await fetchHeaders();
    const rows = HEADER_RULES.map((rule) => {
      const value = response.headers.get(rule.key) || '';
      const status = gradeHeader(value);
      return {
        header: rule.label,
        status,
        value: value || (t('securityHeadersCheckerMissing') || 'Missing')
      };
    });

    const okCount = rows.filter((row) => row.status === 'ok').length;
    const weakCount = rows.filter((row) => row.status === 'weak').length;
    const missingCount = rows.filter((row) => row.status === 'missing').length;

    out.innerHTML = `
      <div class="toolary-preview-card" style="display:grid;gap:8px;">
        <strong>${escapeHtml((t('securityHeadersCheckerSummary') || 'Security headers summary').replace('$1', String(okCount)).replace('$2', String(weakCount)).replace('$3', String(missingCount)))}</strong>
        <div class="toolary-preview-scroll" style="max-height:52vh;">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t('securityHeadersCheckerColHeader') || 'Header')}</th>
                <th>${escapeHtml(t('securityHeadersCheckerColStatus') || 'Status')}</th>
                <th>${escapeHtml(t('securityHeadersCheckerColValue') || 'Value')}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.header)}</td>
                  <td>${escapeHtml(row.status.toUpperCase())}</td>
                  <td><code>${escapeHtml(row.value)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    showCoffeeMessageForTool('security-headers-checker');
  } catch (error) {
    handleError(error, 'securityHeadersChecker.runCheck');
    showError(`${t('securityHeadersCheckerFailed') || 'Security header check failed.'} ${error.message || ''}`.trim());
    out.innerHTML = '';
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-security-headers-checker',
    title: t('securityHeadersCheckerTitle') || 'Security Headers Checker',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="check">${t('securityHeadersCheckerRun') || 'Check headers'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('securityHeadersCheckerHint') || 'Checks common HTTP security headers for the active page URL.')}</div>
        <section id="toolary-security-headers-output"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="check"]'), 'click', runCheck));

  runCheck();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'securityHeadersChecker.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'securityHeadersChecker');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
