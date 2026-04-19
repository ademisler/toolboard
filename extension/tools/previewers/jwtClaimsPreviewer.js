import { addEventListenerWithCleanup, copyText, ensureLanguageLoaded, handleError, showError, showSuccess, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'jwt-claims-previewer',
  name: 'JWT Claims Previewer',
  category: 'previewers',
  icon: 'jwt-claims',
  permissions: ['activeTab'],
  tags: ['preview', 'jwt', 'claims', 'token'],
  keywords: ['jwt', 'claims', 'exp', 'nbf', 'iat', 'decode']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function base64UrlDecode(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

function formatDate(epoch) {
  if (!Number.isFinite(epoch)) return '-';
  const d = new Date(epoch * 1000);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function statusForClaim(epoch, type) {
  if (!Number.isFinite(epoch)) return { label: '-', color: '#64748b' };
  const now = Math.floor(Date.now() / 1000);
  if (type === 'exp') return now >= epoch ? { label: (t('jwtClaimsPreviewerExpired') || 'Expired'), color: '#ef4444' } : { label: (t('jwtClaimsPreviewerActive') || 'Active'), color: '#22c55e' };
  if (type === 'nbf') return now < epoch ? { label: (t('jwtClaimsPreviewerNotYetValid') || 'Not Yet Valid'), color: '#f59e0b' } : { label: (t('jwtClaimsPreviewerValid') || 'Valid'), color: '#22c55e' };
  return { label: (t('jwtClaimsPreviewerIssued') || 'Issued'), color: '#3b82f6' };
}

function decode() {
  const input = panel?.querySelector('#toolary-jwt-claims-input')?.value?.trim() || '';
  const output = panel?.querySelector('#toolary-jwt-claims-output');
  const chips = panel?.querySelector('#toolary-jwt-claims-chips');

  if (!input) {
    showError(t('jwtClaimsPreviewerEmptyInput') || 'Please enter a JWT token.');
    return;
  }

  try {
    const token = input.toLowerCase().startsWith('bearer ') ? input.slice(7).trim() : input;
    const [headerPart, payloadPart] = token.split('.');
    if (!headerPart || !payloadPart) throw new Error('Invalid JWT format.');

    const header = JSON.parse(base64UrlDecode(headerPart));
    const payload = JSON.parse(base64UrlDecode(payloadPart));

    const exp = Number(payload.exp);
    const nbf = Number(payload.nbf);
    const iat = Number(payload.iat);

    const expState = statusForClaim(exp, 'exp');
    const nbfState = statusForClaim(nbf, 'nbf');
    const iatState = statusForClaim(iat, 'iat');

    if (chips) {
      chips.innerHTML = `
        <div class="toolary-preview-card" style="background:${expState.color}22;border-color:${expState.color}66;">exp: ${expState.label}<br><small>${escapeHtml(formatDate(exp))}</small></div>
        <div class="toolary-preview-card" style="background:${nbfState.color}22;border-color:${nbfState.color}66;">nbf: ${nbfState.label}<br><small>${escapeHtml(formatDate(nbf))}</small></div>
        <div class="toolary-preview-card" style="background:${iatState.color}22;border-color:${iatState.color}66;">iat: ${iatState.label}<br><small>${escapeHtml(formatDate(iat))}</small></div>
      `;
    }

    if (output) {
      output.value = JSON.stringify({ header, payload }, null, 2);
    }

    showCoffeeMessageForTool('jwt-claims-previewer');
  } catch (error) {
    showError(`${t('jwtClaimsPreviewerDecodeFailed') || 'Failed to decode JWT.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-jwt-claims-previewer',
    title: t('jwtClaimsPreviewerTitle') || 'JWT Claims Previewer',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <textarea id="toolary-jwt-claims-input" rows="5" placeholder="${t('jwtClaimsPreviewerInputPlaceholder') || 'Paste JWT token here...'}"></textarea>
        <div class="toolary-preview-row">
          <button class="toolary-ui-btn" data-action="decode">${t('jwtClaimsPreviewerDecode') || 'Decode claims'}</button>
          <button class="toolary-ui-btn" data-action="copy">${t('jwtClaimsPreviewerCopy') || 'Copy result'}</button>
        </div>
        <div id="toolary-jwt-claims-chips" class="toolary-preview-grid-3" style="gap:8px;"></div>
        <textarea id="toolary-jwt-claims-output" rows="10" readonly></textarea>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="decode"]'), 'click', decode));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="copy"]'), 'click', async () => {
    const value = panel.querySelector('#toolary-jwt-claims-output')?.value || '';
    if (!value) {
      showError(t('jwtClaimsPreviewerNothingToCopy') || 'No result to copy.');
      return;
    }
    await copyText(value);
    showSuccess(t('copied') || 'Copied');
  }));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'jwtClaimsPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'jwtClaimsPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
