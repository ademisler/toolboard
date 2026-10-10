import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from './sharedPreviewUtils.js';

export const metadata = {
  id: 'schema-previewer',
  name: 'Schema Previewer',
  category: 'previewers',
  icon: 'schema-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'schema', 'json schema', 'openapi'],
  keywords: ['schema', 'json schema', 'openapi', 'properties', 'components']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function extractPageSchemas() {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  return scripts.map((script, index) => {
    const raw = script.textContent?.trim() || '';
    try {
      const parsed = JSON.parse(raw);
      const type = parsed['@type'] || parsed.type || 'Unknown';
      return { index, raw, parsed, type, valid: true };
    } catch {
      return { index, raw, parsed: null, type: 'Invalid JSON', valid: false };
    }
  });
}

function summarizeSchemaObject(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'No object schema';

  const isOpenApi = typeof parsed.openapi === 'string' || !!parsed.paths;
  if (isOpenApi) {
    const pathCount = Object.keys(parsed.paths || {}).length;
    const schemaCount = Object.keys(parsed.components?.schemas || {}).length;
    return `OpenAPI • ${pathCount} paths • ${schemaCount} component schemas`;
  }

  const propCount = Object.keys(parsed.properties || {}).length;
  const requiredCount = Array.isArray(parsed.required) ? parsed.required.length : 0;
  return `JSON Schema • ${propCount} properties • ${requiredCount} required`;
}

function render() {
  const pageList = panel?.querySelector('#toolary-schema-page-list');
  const customInput = panel?.querySelector('#toolary-schema-input')?.value || '';
  const customSummary = panel?.querySelector('#toolary-schema-summary');

  if (pageList) {
    const schemas = extractPageSchemas();
    pageList.innerHTML = schemas.length
      ? schemas.map((item) => `
          <details class="toolary-preview-card">
            <summary style="cursor:pointer;display:flex;gap:8px;align-items:center;">
              <strong>#${item.index + 1}</strong>
              <span>${escapeHtml(item.type)}</span>
              <span class="toolary-preview-muted">${item.valid ? (t('schemaPreviewerValid') || 'Valid') : (t('schemaPreviewerInvalid') || 'Invalid')}</span>
            </summary>
            <pre class="toolary-preview-code" style="margin-top:8px;">${escapeHtml(item.raw || '')}</pre>
          </details>
        `).join('')
      : `<div class="toolary-preview-muted">${t('schemaPreviewerNoSchema') || 'No JSON-LD schema found on this page.'}</div>`;
  }

  if (customSummary) {
    if (!customInput.trim()) {
      customSummary.innerHTML = `<div class="toolary-preview-muted">${t('schemaPreviewerCustomHint') || 'Paste JSON Schema/OpenAPI snippet to inspect.'}</div>`;
    } else {
      try {
        const parsed = JSON.parse(customInput);
        const summary = summarizeSchemaObject(parsed);
        customSummary.innerHTML = `
          <div><strong>${escapeHtml(summary)}</strong></div>
          <pre class="toolary-preview-code" style="margin-top:8px;">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>
        `;
      } catch (error) {
        customSummary.innerHTML = `<div class="toolary-preview-status-bad">${t('schemaPreviewerInvalidJson') || 'Invalid JSON.'} ${escapeHtml(error.message || '')}</div>`;
      }
    }
  }

  showCoffeeMessageForTool('schema-previewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-schema-previewer',
    title: t('schemaPreviewerTitle') || 'Schema Previewer',
    width: 1120,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <button class="toolary-ui-btn" data-action="scan">${t('schemaPreviewerScan') || 'Scan page schema'}</button>
        </div>
        <div class="toolary-preview-grid-2" style="gap:10px;">
          <section class="toolary-preview-section">
            <h3 style="margin:0;font-size:14px;">${t('schemaPreviewerPageSchemas') || 'Page JSON-LD schemas'}</h3>
            <div id="toolary-schema-page-list" class="toolary-preview-scroll" style="display:grid;gap:8px;max-height:56vh;padding:8px;"></div>
          </section>
          <section class="toolary-preview-section">
            <h3 style="margin:0;font-size:14px;">${t('schemaPreviewerCustom') || 'Custom JSON Schema / OpenAPI snippet'}</h3>
            <textarea id="toolary-schema-input" rows="10" placeholder="${t('schemaPreviewerInputPlaceholder') || '{"openapi":"3.1.0" ... }'}"></textarea>
            <div id="toolary-schema-summary" class="toolary-preview-card"></div>
          </section>
        </div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="scan"]'), 'click', render));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-schema-input'), 'input', render));

  render();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'schemaPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'schemaPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
