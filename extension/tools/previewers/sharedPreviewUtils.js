import { addEventListenerWithCleanup, copyText, handleError, showError, showSuccess, t } from '../../shared/helpers.js';

let previewStylesInjected = false;

function ensurePreviewStyles() {
  if (previewStylesInjected || document.getElementById('toolary-previewer-shared-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-previewer-shared-styles';
  style.textContent = `
    .toolary-preview-root {
      --preview-gap: 10px;
      color: var(--toolary-preview-text);
      line-height: 1.45;
    }
    .toolary-preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      position: static;
      top: auto;
      background: transparent;
      border: 0;
      border-radius: 0;
      border-bottom: 1px solid color-mix(in srgb, var(--toolary-preview-border) 86%, transparent);
      z-index: 2;
      padding: 0 0 12px;
    }
    .toolary-preview-close-btn {
      height: 36px;
      padding: 0 12px;
    }
    .toolary-preview-body {
      overflow: auto;
      padding-right: 2px;
    }
    .toolary-preview-title {
      margin: 0;
      font-size: 17px;
      line-height: 1.2;
      letter-spacing: .01em;
    }
    .toolary-preview-stack {
      display: grid;
      gap: 12px;
      min-height: 0;
    }
    .toolary-preview-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      min-height: 0;
    }
    .toolary-preview-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      min-height: 0;
    }
    .toolary-preview-section {
      display: grid;
      gap: 8px;
      min-height: 0;
    }
    .toolary-preview-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .toolary-preview-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      min-height: 36px;
    }
    .toolary-preview-help {
      padding: 8px 10px;
      border-style: dashed;
      border-width: 1px;
      border-color: color-mix(in srgb, var(--toolary-preview-border) 84%, var(--toolary-preview-accent) 16%);
      border-radius: 10px;
      background: color-mix(in srgb, var(--toolary-preview-panel) 90%, var(--toolary-preview-accent) 10%);
    }
    .toolary-preview-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
      padding: 2px 8px;
      border: 1px solid transparent;
      width: fit-content;
    }
    .toolary-preview-badge.is-good {
      color: #16a34a;
      background: color-mix(in srgb, #16a34a 14%, transparent);
      border-color: color-mix(in srgb, #16a34a 45%, transparent);
    }
    .toolary-preview-badge.is-mid {
      color: #ca8a04;
      background: color-mix(in srgb, #ca8a04 16%, transparent);
      border-color: color-mix(in srgb, #ca8a04 45%, transparent);
    }
    .toolary-preview-badge.is-poor {
      color: #dc2626;
      background: color-mix(in srgb, #dc2626 14%, transparent);
      border-color: color-mix(in srgb, #dc2626 45%, transparent);
    }
    .toolary-preview-badge.is-na {
      color: var(--toolary-preview-muted);
      background: color-mix(in srgb, var(--toolary-preview-border) 30%, transparent);
      border-color: color-mix(in srgb, var(--toolary-preview-border) 70%, transparent);
    }
    .toolary-preview-row > :where(.toolary-ui-btn, select, input[type="file"], input[type="number"], input[type="text"], input[type="url"], input[type="search"]) {
      flex: 0 0 auto;
    }
    .toolary-preview-row > :where(input[type="text"], input[type="url"], input[type="search"]) {
      min-width: 180px;
    }
    .toolary-preview-card {
      border: 1px solid var(--toolary-preview-border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--toolary-preview-bg) 96%, var(--toolary-preview-accent) 4%);
      padding: 10px;
      min-height: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
    }
    .toolary-preview-scroll {
      border: 1px solid var(--toolary-preview-border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--toolary-preview-bg) 98%, var(--toolary-preview-accent) 2%);
      overflow: auto;
      min-height: 0;
    }
    .toolary-preview-muted {
      opacity: .78;
      font-size: 12px;
    }
    .toolary-preview-code {
      margin: 0;
      max-height: 320px;
      overflow: auto;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid var(--toolary-preview-border);
      background: color-mix(in srgb, var(--toolary-preview-bg) 84%, #0f172a 16%);
      color: var(--toolary-preview-text);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    .toolary-preview-root .toolary-ui-btn {
      cursor: pointer;
      border-radius: 10px !important;
      border: 1px solid var(--toolary-preview-border) !important;
      color: var(--toolary-preview-text) !important;
      background: var(--toolary-preview-panel) !important;
      box-shadow: 0 2px 8px rgba(0,0,0,.1);
      font-weight: 500;
      transition: all .2s cubic-bezier(.4,0,.2,1);
    }
    .toolary-preview-root button:not(:disabled) {
      cursor: pointer;
    }
    .toolary-preview-root [role="button"]:not([aria-disabled="true"]),
    .toolary-preview-root [data-action]:not([disabled]) {
      cursor: pointer;
    }
    .toolary-preview-root .toolary-ui-btn:hover {
      background: color-mix(in srgb, var(--toolary-preview-panel) 86%, var(--toolary-preview-accent) 14%) !important;
      border-color: color-mix(in srgb, var(--toolary-preview-border) 70%, var(--toolary-preview-accent) 30%) !important;
      transform: translateY(-1px);
    }
    .toolary-preview-root .toolary-ui-btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--toolary-preview-accent) 22%, transparent);
    }
    .toolary-preview-root :where(input[type="text"], input[type="url"], input[type="search"], input[type="number"], input[type="file"], select, textarea) {
      width: 100%;
      max-width: 100%;
      border: 1px solid var(--toolary-preview-border);
      border-radius: 10px;
      background: var(--toolary-preview-panel);
      color: var(--toolary-preview-text);
      padding: 9px 10px;
      box-sizing: border-box;
      font: inherit;
      transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
    }
    .toolary-preview-root :where(input[type="text"], input[type="url"], input[type="search"], input[type="number"], input[type="file"], select, .toolary-ui-btn) {
      min-height: 36px;
    }
    .toolary-preview-root select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-image:
        linear-gradient(45deg, transparent 50%, var(--toolary-preview-muted) 50%),
        linear-gradient(135deg, var(--toolary-preview-muted) 50%, transparent 50%);
      background-position:
        calc(100% - 16px) calc(50% - 2px),
        calc(100% - 11px) calc(50% - 2px);
      background-size: 5px 5px, 5px 5px;
      background-repeat: no-repeat;
      padding-right: 28px;
    }
    .toolary-preview-root option {
      background: var(--toolary-preview-panel);
      color: var(--toolary-preview-text);
    }
    .toolary-preview-root input[type="file"] {
      padding: 7px 8px;
      cursor: pointer;
    }
    .toolary-preview-root input[type="file"]::file-selector-button {
      border: 1px solid var(--toolary-preview-border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--toolary-preview-panel) 88%, var(--toolary-preview-accent) 12%);
      color: var(--toolary-preview-text);
      padding: 5px 10px;
      margin-right: 10px;
      cursor: pointer;
    }
    .toolary-preview-root input[type="checkbox"] {
      accent-color: var(--toolary-preview-accent);
    }
    .toolary-preview-root textarea {
      min-height: 120px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .toolary-preview-root :where(input, select, textarea):focus {
      outline: none;
      border-color: var(--toolary-preview-accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--toolary-preview-accent) 18%, transparent);
    }
    .toolary-preview-root table {
      width: 100%;
      border-collapse: collapse;
      min-width: 640px;
    }
    .toolary-preview-root th,
    .toolary-preview-root td {
      border: 1px solid color-mix(in srgb, var(--toolary-preview-border) 86%, transparent);
      padding: 7px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    .toolary-preview-root th {
      background: color-mix(in srgb, var(--toolary-preview-bg) 88%, var(--toolary-preview-accent) 12%);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .toolary-preview-status-ok { color: #22c55e; font-weight: 700; }
    .toolary-preview-status-bad { color: #ef4444; font-weight: 700; }

    @media (max-width: 980px) {
      .toolary-preview-grid-2,
      .toolary-preview-grid-3 {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
  previewStylesInjected = true;
}

export function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);

  if (isDark) {
    return {
      bg: '#1e1e1e',
      text: '#ffffff',
      border: '#3a3a3a',
      panel: '#2a2a2a',
      panelAlt: '#333333',
      muted: '#b0b0b0',
      accent: '#00BFFF',
      accentSoft: 'rgba(0,191,255,.16)',
      success: '#28a745',
      warning: '#ffc107',
      danger: '#dc3545'
    };
  }

  return {
    bg: '#f8f9fa',
    text: '#1f2937',
    border: '#d1d5db',
    panel: '#ffffff',
    panelAlt: '#f3f4f6',
    muted: '#6b7280',
    accent: '#00BFFF',
    accentSoft: 'rgba(0,191,255,.12)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444'
  };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / (1024 ** exp)).toFixed(exp === 0 ? 0 : 2)} ${units[exp]}`;
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsText(file);
  });
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function detectDelimiter(sampleText) {
  const sample = String(sampleText || '').split(/\r?\n/).slice(0, 8).join('\n');
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestScore = -1;

  candidates.forEach((delimiter) => {
    const rows = sample.split(/\r?\n/).filter(Boolean);
    if (!rows.length) return;
    const counts = rows.map((line) => line.split(delimiter).length);
    const avg = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const stable = counts.filter((count) => Math.abs(count - avg) < 1).length;
    const score = avg + stable;
    if (score > bestScore && avg > 1) {
      best = delimiter;
      bestScore = score;
    }
  });

  return best;
}

export function parseDelimited(text, delimiter = ',') {
  const rows = [];
  const input = String(text || '');
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\r') {
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new Error('Unclosed quoted field.');
  }

  if (row.length || field.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

export function sortRows(rows, index, direction = 'asc') {
  const mult = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = String(a[index] ?? '');
    const vb = String(b[index] ?? '');
    const na = Number(va);
    const nb = Number(vb);

    if (Number.isFinite(na) && Number.isFinite(nb) && va.trim() && vb.trim()) {
      return (na - nb) * mult;
    }

    return va.localeCompare(vb, undefined, { sensitivity: 'base' }) * mult;
  });
}

export function createPreviewPanel({ id, title, bodyHtml, onClose, width = 980 }) {
  const theme = resolveThemeVars();
  ensurePreviewStyles();
  const overlay = document.createElement('div');
  overlay.id = `${id}-overlay`;
  overlay.className = 'toolary-ui-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:18px;';

  const dialog = document.createElement('section');
  dialog.id = id;
  dialog.className = 'toolary-ui-card toolary-ui-panel toolary-ui-surface toolary-preview-root';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-preview-bg:${theme.bg};--toolary-preview-text:${theme.text};--toolary-preview-border:${theme.border};--toolary-preview-panel:${theme.panel};--toolary-preview-panel-alt:${theme.panelAlt};--toolary-preview-muted:${theme.muted};--toolary-preview-accent:${theme.accent};width:min(${width}px,100%);max-height:min(92vh,980px);overflow:hidden;padding:16px;border-radius:16px;background:${theme.bg};color:${theme.text};border:1px solid ${theme.border};box-shadow:0 16px 42px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;`;

  dialog.innerHTML = `
    <header class="toolary-preview-header">
      <h2 class="toolary-preview-title">${escapeHtml(title)}</h2>
      <button type="button" data-role="close" class="toolary-ui-btn toolary-preview-close-btn">${t('close') || 'Close'}</button>
    </header>
    <div class="toolary-ui-stack toolary-preview-stack toolary-preview-body">${bodyHtml}</div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const cleanup = [];
  cleanup.push(addEventListenerWithCleanup(overlay, 'click', (event) => {
    if (event.target === overlay) {
      onClose?.();
    }
  }));

  const closeBtn = dialog.querySelector('[data-role="close"]');
  cleanup.push(addEventListenerWithCleanup(closeBtn, 'click', () => onClose?.()));

  return { overlay, dialog, cleanup, theme };
}

export function clearCleanup(cleanupFns = [], scope = 'previewers') {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, `${scope}.clearCleanup`);
    }
  });
}

export function copyWithToast(value, copiedText = 'Copied.') {
  if (!value) {
    showError('Nothing to copy.');
    return;
  }
  copyText(String(value));
  showSuccess(copiedText);
}
