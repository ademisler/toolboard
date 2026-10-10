import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'structured-data-validator',
  name: 'Structured Data Validator',
  category: 'previewers',
  icon: 'structured-data',
  permissions: ['activeTab'],
  tags: ['schema', 'json-ld', 'microdata', 'rdfa'],
  keywords: ['structured data', 'json-ld', 'schema.org', 'microdata', 'rdfa']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function validateStructuredData() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  const types = [];
  const errors = [];

  scripts.forEach((script, index) => {
    const raw = script.textContent || '';
    if (!raw.trim()) return;

    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed];

      nodes.forEach((node) => {
        const nodeType = node?.['@type'];
        if (Array.isArray(nodeType)) {
          nodeType.forEach((item) => types.push(String(item)));
        } else if (nodeType) {
          types.push(String(nodeType));
        }
      });
    } catch (error) {
      errors.push(`${t('structuredDataValidatorParseError') || 'JSON-LD parse error'} #${index + 1}: ${error.message}`);
    }
  });

  const microdataCount = document.querySelectorAll('[itemscope]').length;
  const rdfaCount = document.querySelectorAll('[typeof], [property], [vocab]').length;

  return {
    jsonLdBlocks: scripts.length,
    types,
    errors,
    microdataCount,
    rdfaCount
  };
}

function renderResult() {
  const out = panel?.querySelector('#toolary-structured-data-output');
  if (!out) return;

  const result = validateStructuredData();
  const typeCounts = result.types.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});

  const typeRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<tr><td>${escapeHtml(type)}</td><td>${count}</td></tr>`)
    .join('');

  out.innerHTML = `
    <div class="toolary-preview-grid-3">
      <div class="toolary-preview-card"><strong>JSON-LD</strong><div>${result.jsonLdBlocks}</div></div>
      <div class="toolary-preview-card"><strong>Microdata</strong><div>${result.microdataCount}</div></div>
      <div class="toolary-preview-card"><strong>RDFa</strong><div>${result.rdfaCount}</div></div>
    </div>
    <div class="toolary-preview-card" style="display:grid;gap:8px;">
      <strong>${escapeHtml(t('structuredDataValidatorTypes') || 'Detected @type values')}</strong>
      <div class="toolary-preview-scroll" style="max-height:34vh;">
        <table>
          <thead><tr><th>${escapeHtml(t('structuredDataValidatorType') || 'Type')}</th><th>${escapeHtml(t('structuredDataValidatorCount') || 'Count')}</th></tr></thead>
          <tbody>${typeRows || `<tr><td colspan="2">${escapeHtml(t('structuredDataValidatorNoTypes') || 'No @type values found')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="toolary-preview-card" style="display:grid;gap:6px;">
      <strong>${escapeHtml(t('structuredDataValidatorErrors') || 'Parse errors')}</strong>
      <pre class="toolary-preview-code">${escapeHtml(result.errors.length ? result.errors.join('\n') : (t('structuredDataValidatorNoErrors') || 'No JSON-LD parse errors.'))}</pre>
    </div>
  `;

  showCoffeeMessageForTool('structured-data-validator');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-structured-data-validator',
    title: t('structuredDataValidatorTitle') || 'Structured Data Validator',
    width: 1040,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="refresh">${t('structuredDataValidatorRefresh') || 'Refresh analysis'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('structuredDataValidatorHint') || 'Validates JSON-LD blocks and lists Microdata/RDFa signals on the page.')}</div>
        <section id="toolary-structured-data-output" class="toolary-preview-section"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="refresh"]'), 'click', renderResult));

  renderResult();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'structuredDataValidator.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'structuredDataValidator');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
