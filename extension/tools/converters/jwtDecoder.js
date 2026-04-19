import {
  addEventListenerWithCleanup,
  copyText,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'jwt-decoder',
  name: 'JWT Decoder',
  category: 'converters',
  icon: 'jwt-token',
  permissions: ['activeTab'],
  tags: ['converter', 'jwt', 'token', 'auth', 'decode'],
  keywords: ['jwt', 'bearer', 'claims', 'payload', 'header']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-jwt-decoder-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-jwt-decoder-styles';
  style.textContent = `
    #toolary-jwt-decoder-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-jwt-decoder{width:min(760px,100%);max-height:min(92vh,900px);overflow:auto;border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-jwt-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-jwt-title{font-size:16px;}
    .toolary-jwt-label{display:grid;gap:6px;}
    .toolary-jwt-label--token{margin-bottom:10px;}
    .toolary-jwt-caption{font-size:12px;opacity:.85;}
    .toolary-jwt-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-jwt-control-bg,#fff);color:var(--toolary-text,#111);resize:vertical;}
    .toolary-jwt-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
    .toolary-jwt-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-jwt-btn--close{height:auto;padding:4px 10px;}
    .toolary-jwt-advanced{margin-bottom:10px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;padding:8px 10px;background:var(--toolary-jwt-muted-bg,rgba(127,127,127,.08));}
    .toolary-jwt-advanced summary{cursor:pointer;font-weight:600;}
    #toolary-jwt-analysis{margin:8px 0 0 0;white-space:pre-wrap;font-size:12px;padding:8px;border-radius:8px;background:var(--toolary-jwt-info-bg,rgba(59,130,246,.1));border:1px solid var(--toolary-border,#d1d5db);}
    .toolary-jwt-results{display:grid;gap:10px;grid-template-columns:1fr;}
    .toolary-jwt-output{background:var(--toolary-jwt-muted-bg,rgba(127,127,127,.08));}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'jwtDecoder.clearCleanup');
    }
  });
  cleanupFns = [];
}

function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);
  if (isDark) {
    return {
      bg: '#2b2b2b',
      text: '#f5f5f5',
      border: '#4b5563',
      controlBg: '#1f2937',
      mutedBg: 'rgba(255,255,255,.08)',
      infoBg: 'rgba(59,130,246,.18)'
    };
  }

  return {
    bg: '#ffffff',
    text: '#111111',
    border: '#d1d5db',
    controlBg: '#ffffff',
    mutedBg: 'rgba(127,127,127,.08)',
    infoBg: 'rgba(59,130,246,.10)'
  };
}

function normalizeToken(input) {
  const value = String(input || '').trim();
  if (value.toLowerCase().startsWith('bearer ')) {
    return value.slice(7).trim();
  }
  return value;
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToString(value) {
  const bytes = base64UrlToBytes(value);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(bytes);
}

function parseJsonPart(part, label) {
  const raw = base64UrlToString(part);
  try {
    return {
      raw,
      data: JSON.parse(raw),
      error: null,
      label
    };
  } catch {
    return {
      raw,
      data: null,
      error: new Error(`${label} is not valid JSON`),
      label
    };
  }
}

function formatJson(value) {
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

function formatEpoch(value) {
  if (!Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString()} (${value})`;
}

function buildTemporalAnalysis(payload) {
  if (!payload || typeof payload !== 'object') {
    return t('jwtDecoderNoTemporalClaims') || 'No temporal claims found.';
  }

  const now = Math.floor(Date.now() / 1000);
  const lines = [];
  const exp = Number(payload.exp);
  const nbf = Number(payload.nbf);
  const iat = Number(payload.iat);

  if (Number.isFinite(exp)) {
    const expText = formatEpoch(exp) || String(exp);
    const expired = now >= exp;
    lines.push(`${t('jwtDecoderExp') || 'exp'}: ${expText} - ${expired ? (t('jwtDecoderExpired') || 'Expired') : (t('jwtDecoderActive') || 'Active')}`);
  }

  if (Number.isFinite(nbf)) {
    const nbfText = formatEpoch(nbf) || String(nbf);
    const notYetValid = now < nbf;
    lines.push(`${t('jwtDecoderNbf') || 'nbf'}: ${nbfText} - ${notYetValid ? (t('jwtDecoderNotYetValid') || 'Not yet valid') : (t('jwtDecoderValidNow') || 'Valid now')}`);
  }

  if (Number.isFinite(iat)) {
    const iatText = formatEpoch(iat) || String(iat);
    lines.push(`${t('jwtDecoderIat') || 'iat'}: ${iatText}`);
  }

  if (!lines.length) {
    return t('jwtDecoderNoTemporalClaims') || 'No temporal claims found.';
  }

  return lines.join('\n');
}

function setValue(selector, value) {
  const el = panel?.querySelector(selector);
  if (el) el.value = value;
}

function setText(selector, value) {
  const el = panel?.querySelector(selector);
  if (el) el.textContent = value;
}

function runDecode() {
  const tokenInput = panel?.querySelector('#toolary-jwt-input')?.value || '';
  const token = normalizeToken(tokenInput);

  if (!token) {
    showError(t('jwtDecoderEmptyInput') || 'Please enter a JWT token.');
    return;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    showError(t('jwtDecoderInvalidFormat') || 'Invalid JWT format. Expected 3 parts.');
    return;
  }

  try {
    const header = parseJsonPart(parts[0], 'header');
    const payload = parseJsonPart(parts[1], 'payload');

    if (header.error || payload.error) {
      showError(t('jwtDecoderInvalidPayload') || 'JWT header or payload could not be parsed.');
    }

    const headerOutput = header.data ? formatJson(header.data) : header.raw;
    const payloadOutput = payload.data ? formatJson(payload.data) : payload.raw;
    const signatureOutput = parts[2] || '';
    const temporalOutput = buildTemporalAnalysis(payload.data);

    setValue('#toolary-jwt-header', headerOutput);
    setValue('#toolary-jwt-payload', payloadOutput);
    setValue('#toolary-jwt-signature', signatureOutput);
    setText('#toolary-jwt-analysis', temporalOutput);

    lastResult = [
      'HEADER',
      headerOutput,
      '',
      'PAYLOAD',
      payloadOutput,
      '',
      'SIGNATURE',
      signatureOutput,
      '',
      'TEMPORAL ANALYSIS',
      temporalOutput
    ].join('\n');
  } catch (error) {
    handleError(error, 'jwtDecoder.runDecode');
    showError(t('jwtDecoderInvalidPayload') || 'JWT header or payload could not be parsed.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-jwt-decoder-overlay';
  overlay.style.setProperty('--toolary-jwt-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-jwt-muted-bg', theme.mutedBg);
  overlay.style.setProperty('--toolary-jwt-info-bg', theme.infoBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-jwt-decoder';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-jwt-header">
      <strong class="toolary-jwt-title">${t('jwtDecoderTitle') || 'JWT Decoder'}</strong>
      <button id="toolary-jwt-close" class="toolary-jwt-btn toolary-jwt-btn--close" type="button">${t('close') || 'Close'}</button>
    </div>

    <label class="toolary-jwt-label toolary-jwt-label--token">
      <span class="toolary-jwt-caption">${t('jwtDecoderInput') || 'JWT Token'}</span>
      <textarea id="toolary-jwt-input" class="toolary-jwt-control" rows="4" placeholder="${t('jwtDecoderInputPlaceholder') || 'Paste JWT token here...'}"></textarea>
    </label>

    <div class="toolary-jwt-actions">
      <button id="toolary-jwt-decode" class="toolary-jwt-btn" type="button">${t('jwtDecoderDecode') || 'Decode'}</button>
      <button id="toolary-jwt-copy" class="toolary-jwt-btn" type="button">${t('jwtDecoderCopyResult') || 'Copy Result'}</button>
    </div>

    <details class="toolary-jwt-advanced">
      <summary>${t('jwtDecoderAdvanced') || 'Advanced Analysis'}</summary>
      <pre id="toolary-jwt-analysis">${t('jwtDecoderNoTemporalClaims') || 'No temporal claims found.'}</pre>
    </details>

    <div class="toolary-jwt-results">
      <label class="toolary-jwt-label">
        <span class="toolary-jwt-caption">${t('jwtDecoderHeader') || 'Header'}</span>
        <textarea id="toolary-jwt-header" class="toolary-jwt-control toolary-jwt-output" rows="5" readonly></textarea>
      </label>

      <label class="toolary-jwt-label">
        <span class="toolary-jwt-caption">${t('jwtDecoderPayload') || 'Payload'}</span>
        <textarea id="toolary-jwt-payload" class="toolary-jwt-control toolary-jwt-output" rows="7" readonly></textarea>
      </label>

      <label class="toolary-jwt-label">
        <span class="toolary-jwt-caption">${t('jwtDecoderSignature') || 'Signature (raw)'}</span>
        <textarea id="toolary-jwt-signature" class="toolary-jwt-control toolary-jwt-output" rows="3" readonly></textarea>
      </label>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    ensureStyles();

    if (panel) {
      panel.remove();
      panel = null;
    }

    createPanel();

    const closeBtn = panel.querySelector('#toolary-jwt-close');
    const decodeBtn = panel.querySelector('#toolary-jwt-decode');
    const copyBtn = panel.querySelector('#toolary-jwt-copy');
    const inputEl = panel.querySelector('#toolary-jwt-input');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivateCb?.();
    }));
    cleanupFns.push(addEventListenerWithCleanup(decodeBtn, 'click', runDecode));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runDecode();
      }
    }));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('jwtDecoderNothingToCopy') || 'No result to copy.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('jwtDecoderCopied') || 'Result copied.');
      showCoffeeMessageForTool('jwt-decoder');
    }));
  } catch (error) {
    handleError(error, 'jwtDecoder.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();
  if (panel) {
    panel.remove();
    panel = null;
  }
  lastResult = '';
  deactivateCb = null;
}
