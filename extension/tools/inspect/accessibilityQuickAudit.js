import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from '../previewers/sharedPreviewUtils.js';

export const metadata = {
  id: 'accessibility-quick-audit',
  name: 'Accessibility Quick Audit',
  category: 'inspect',
  icon: 'a11y-audit',
  permissions: ['activeTab'],
  tags: ['a11y', 'accessibility', 'audit', 'wcag'],
  keywords: ['accessibility', 'alt text', 'labels', 'headings', 'aria']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function cssSelectorOf(element) {
  if (!element || !element.tagName) return '';
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const className = typeof element.className === 'string'
    ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((item) => `.${item}`).join('')
    : '';
  return `${tag}${id}${className}`;
}

function pushIssue(issues, severity, type, element) {
  issues.push({
    severity,
    type,
    selector: cssSelectorOf(element)
  });
}

function collectIssues() {
  const issues = [];

  document.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt');
    if (alt == null || !alt.trim()) {
      pushIssue(issues, 'high', t('accessibilityQuickAuditMissingAlt') || 'Image missing alt text', img);
    }
  });

  document.querySelectorAll('button, [role="button"]').forEach((button) => {
    const label = (button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '').trim();
    if (!label) {
      pushIssue(issues, 'high', t('accessibilityQuickAuditButtonName') || 'Button has no accessible name', button);
    }
  });

  document.querySelectorAll('input, select, textarea').forEach((field) => {
    const type = (field.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset'].includes(type)) return;
    const id = field.getAttribute('id');
    const escapedId = id ? id.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : '';
    const byFor = escapedId ? document.querySelector(`label[for="${escapedId}"]`) : null;
    const byWrap = field.closest('label');
    const ariaLabel = (field.getAttribute('aria-label') || '').trim();
    if (!byFor && !byWrap && !ariaLabel) {
      pushIssue(issues, 'medium', t('accessibilityQuickAuditFieldLabel') || 'Form field has no label', field);
    }
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    const text = (link.textContent || '').trim();
    const ariaLabel = (link.getAttribute('aria-label') || '').trim();
    if (!text && !ariaLabel) {
      pushIssue(issues, 'medium', t('accessibilityQuickAuditLinkText') || 'Link has no discernible text', link);
    }
  });

  const headingLevels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .map((el) => ({ element: el, level: Number(el.tagName[1]) }))
    .filter((item) => Number.isFinite(item.level));

  for (let i = 1; i < headingLevels.length; i += 1) {
    if (headingLevels[i].level - headingLevels[i - 1].level > 1) {
      pushIssue(issues, 'low', t('accessibilityQuickAuditHeadingOrder') || 'Heading level skip detected', headingLevels[i].element);
    }
  }

  return issues;
}

function renderIssues() {
  const output = panel?.querySelector('#toolary-a11y-audit-output');
  if (!output) return;

  const issues = collectIssues();
  const high = issues.filter((item) => item.severity === 'high').length;
  const medium = issues.filter((item) => item.severity === 'medium').length;
  const low = issues.filter((item) => item.severity === 'low').length;

  const summary = `${t('accessibilityQuickAuditSummary') || 'Issues'}: ${issues.length} (H:${high} M:${medium} L:${low})`;

  if (!issues.length) {
    output.innerHTML = `
      <div class="toolary-preview-card">
        <div class="toolary-preview-status-ok">${escapeHtml(t('accessibilityQuickAuditNoIssues') || 'No common accessibility issues detected.')}</div>
      </div>
    `;
    showCoffeeMessageForTool('accessibility-quick-audit');
    return;
  }

  const rows = issues
    .map((issue) => `
      <tr>
        <td>${escapeHtml(issue.severity.toUpperCase())}</td>
        <td>${escapeHtml(issue.type)}</td>
        <td><code>${escapeHtml(issue.selector || '-')}</code></td>
      </tr>
    `)
    .join('');

  output.innerHTML = `
    <div class="toolary-preview-card" style="display:grid;gap:8px;">
      <strong>${escapeHtml(summary)}</strong>
      <div class="toolary-preview-scroll" style="max-height:52vh;">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t('accessibilityQuickAuditColSeverity') || 'Severity')}</th>
              <th>${escapeHtml(t('accessibilityQuickAuditColIssue') || 'Issue')}</th>
              <th>${escapeHtml(t('accessibilityQuickAuditColSelector') || 'Selector')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
  showCoffeeMessageForTool('accessibility-quick-audit');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-accessibility-quick-audit',
    title: t('accessibilityQuickAuditTitle') || 'Accessibility Quick Audit',
    width: 980,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="run">${t('accessibilityQuickAuditRun') || 'Run audit'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('accessibilityQuickAuditHint') || 'Checks common a11y issues: alt text, labels, button names, links, headings.')}</div>
        <section id="toolary-a11y-audit-output" class="toolary-preview-section"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="run"]'), 'click', renderIssues));

  renderIssues();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'accessibilityQuickAudit.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'accessibilityQuickAudit');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
