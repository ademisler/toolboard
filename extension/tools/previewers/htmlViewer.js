import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, readFileAsText } from './sharedPreviewUtils.js';
import { openToolFullscreen } from '../../shared/toolUi.js';

export const metadata = {
  id: 'html-viewer',
  name: 'HTML Viewer',
  category: 'previewers',
  icon: 'html-viewer',
  permissions: ['activeTab'],
  tags: ['preview', 'html', 'sanitize', 'render'],
  keywords: ['html', 'viewer', 'sanitize', 'url', 'file']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

async function openOutputFullscreen() {
  const output = panel?.querySelector('#toolary-html-viewer-output');
  if (!output || output.style.display === 'none') {
    showError(t('htmlViewerFullscreenOnlyRender') || 'Fullscreen is available in sanitized render mode.');
    return;
  }
  if (openToolFullscreen(output)) return;
  showError(t('htmlViewerFullscreenNotSupported') || 'Fullscreen is not supported on this page.');
}

function sanitizeHtml(input) {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(String(input || ''), 'text/html');

  doc.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv="refresh"]').forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '').toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return doc.documentElement.outerHTML;
}

async function loadFromUrl() {
  const url = panel?.querySelector('#toolary-html-viewer-url')?.value?.trim();
  if (!url) {
    showError(t('htmlViewerMissingUrl') || 'Please enter a URL.');
    return;
  }

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const input = panel?.querySelector('#toolary-html-viewer-input');
    if (input) input.value = text;
    render();
  } catch (error) {
    showError(`${t('htmlViewerLoadUrlFailed') || 'Failed to load URL.'} ${error.message || ''}`.trim());
  }
}

function render() {
  const html = panel?.querySelector('#toolary-html-viewer-input')?.value || '';
  const mode = panel?.querySelector('#toolary-html-viewer-mode')?.value || 'sanitized';
  const output = panel?.querySelector('#toolary-html-viewer-output');
  const source = panel?.querySelector('#toolary-html-viewer-source');
  if (!output || !source) return;

  if (!html.trim()) {
    showError(t('htmlViewerEmptyInput') || 'Please provide HTML content.');
    return;
  }

  const sanitized = sanitizeHtml(html);

  if (mode === 'source') {
    output.srcdoc = '';
    output.style.display = 'none';
    source.style.display = 'block';
    source.value = html;
  } else if (mode === 'text') {
    const doc = new window.DOMParser().parseFromString(sanitized, 'text/html');
    output.srcdoc = '';
    output.style.display = 'none';
    source.style.display = 'block';
    source.value = doc.body?.innerText || '';
  } else {
    output.style.display = 'block';
    source.style.display = 'none';
    output.srcdoc = sanitized;
  }

  showCoffeeMessageForTool('html-viewer');
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-html-viewer',
    title: t('htmlViewerTitle') || 'HTML Viewer',
    width: 1180,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2" style="min-height:70vh;">
        <section class="toolary-preview-section">
          <div class="toolary-preview-row">
            <input id="toolary-html-viewer-url" type="url" placeholder="${t('htmlViewerUrlPlaceholder') || 'https://example.com'}" style="flex:1;" />
            <button class="toolary-ui-btn" data-action="load-url">${t('htmlViewerLoadUrl') || 'Load URL'}</button>
          </div>
          <div class="toolary-preview-row">
            <input id="toolary-html-viewer-file" type="file" accept=".html,.htm,text/html" />
            <select id="toolary-html-viewer-mode">
              <option value="sanitized">${t('htmlViewerModeSanitized') || 'Sanitized render'}</option>
              <option value="source">${t('htmlViewerModeSource') || 'Source view'}</option>
              <option value="text">${t('htmlViewerModeText') || 'Text only'}</option>
            </select>
            <button class="toolary-ui-btn" data-action="render">${t('htmlViewerRender') || 'Render'}</button>
            <button class="toolary-ui-btn" data-action="fullscreen">${t('htmlViewerFullscreen') || 'Fullscreen'}</button>
          </div>
          <textarea id="toolary-html-viewer-input" rows="22" placeholder="${t('htmlViewerInputPlaceholder') || '<html>...</html>'}"></textarea>
        </section>
        <section class="toolary-preview-section">
          <iframe id="toolary-html-viewer-output" sandbox="allow-same-origin" class="toolary-preview-scroll" style="width:100%;height:100%;min-height:560px;background:var(--toolary-preview-bg);"></iframe>
          <textarea id="toolary-html-viewer-source" rows="22" readonly style="display:none;"></textarea>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="render"]'), 'click', render));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="fullscreen"]'), 'click', openOutputFullscreen));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="load-url"]'), 'click', loadFromUrl));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-html-viewer-mode'), 'change', render));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('#toolary-html-viewer-file'), 'change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const input = panel?.querySelector('#toolary-html-viewer-input');
      if (input) input.value = text;
      render();
    } catch (error) {
      showError(`${t('htmlViewerFileReadFailed') || 'Failed to read file.'} ${error.message || ''}`.trim());
    }
  }));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'htmlViewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'htmlViewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
