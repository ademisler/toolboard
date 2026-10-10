import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'toml-ini-viewer',
  name: 'TOML/INI Viewer',
  category: 'previewers',
  icon: 'toml-ini',
  permissions: ['activeTab'],
  tags: ['preview', 'toml', 'ini', 'config'],
  keywords: ['toml', 'ini', 'section', 'key value']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function setByPath(root, path, key, value) {
  let target = root;
  path.forEach((seg) => {
    if (!target[seg] || typeof target[seg] !== 'object') target[seg] = {};
    target = target[seg];
  });
  target[key] = value;
}

function parseValue(raw) {
  const v = String(raw || '').trim();
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseIniToml(input) {
  const lines = String(input || '').split(/\r?\n/);
  const result = {};
  let path = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return;

    const sectionMatch = trimmed.match(/^\[(.+)]$/);
    if (sectionMatch) {
      path = sectionMatch[1].split('.').map((s) => s.trim()).filter(Boolean);
      return;
    }

    const idx = trimmed.indexOf('=');
    if (idx === -1) return;

    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();
    if (!key) return;

    setByPath(result, path, key, parseValue(valueRaw));
  });

  return result;
}

function render() {
  const input = panel?.querySelector('#toolary-toml-ini-input')?.value || '';
  const output = panel?.querySelector('#toolary-toml-ini-output');
  if (!output) return;

  if (!input.trim()) {
    showError(t('tomlIniViewerEmptyInput') || 'Please paste TOML/INI content.');
    return;
  }

  try {
    const parsed = parseIniToml(input);
    output.textContent = JSON.stringify(parsed, null, 2);
    showCoffeeMessageForTool('toml-ini-viewer');
  } catch (error) {
    showError(`${t('tomlIniViewerParseFailed') || 'Failed to parse content.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-toml-ini-viewer',
    title: t('tomlIniViewerTitle') || 'TOML/INI Viewer',
    width: 1040,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2">
        <section class="toolary-preview-section">
          <p class="toolary-preview-muted" style="margin:0;">${escapeHtml(t('tomlIniViewerHint') || 'Supports INI style and basic TOML sections/keys.')}</p>
          <textarea id="toolary-toml-ini-input" rows="22" placeholder="${t('tomlIniViewerInputPlaceholder') || '[server]\nhost = "localhost"\nport = 8080'}"></textarea>
          <button class="toolary-ui-btn" data-action="parse">${t('tomlIniViewerParse') || 'Parse'}</button>
        </section>
        <section class="toolary-preview-section">
          <textarea id="toolary-toml-ini-output" rows="22" readonly></textarea>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="parse"]'), 'click', render));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'tomlIniViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'tomlIniViewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
