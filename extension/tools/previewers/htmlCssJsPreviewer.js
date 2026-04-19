import { addEventListenerWithCleanup, copyText, ensureLanguageLoaded, handleError, showError, showSuccess, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel } from './sharedPreviewUtils.js';
import { openToolFullscreen } from '../../shared/toolUi.js';

export const metadata = {
  id: 'html-css-js-previewer',
  name: 'HTML/CSS/JS Previewer',
  category: 'previewers',
  icon: 'code-preview',
  permissions: ['activeTab'],
  tags: ['preview', 'html', 'css', 'js', 'playground'],
  keywords: ['html', 'css', 'javascript', 'live preview', 'playground']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let activeTab = 'html';
const STYLES_ID = 'toolary-html-css-js-previewer-styles';

function ensureStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .toolary-playground-shell {
      min-height: 72vh;
    }
    .toolary-playground-editor {
      grid-template-rows: auto auto 1fr;
    }
    .toolary-playground-preview {
      grid-template-rows: auto 1fr auto;
    }
    .toolary-playground-editor-host {
      position: relative;
      min-height: 0;
    }
    .toolary-playground-editor-pane {
      height: 100%;
      min-height: 420px;
      resize: none;
      display: none;
    }
    .toolary-playground-editor-pane.is-active {
      display: block;
    }
    .toolary-playground-tab {
      opacity: .75;
    }
    .toolary-playground-tab.is-active {
      opacity: 1;
    }
    .toolary-playground-output-title,
    .toolary-playground-console-title {
      margin: 0;
    }
    .toolary-playground-output {
      width: 100%;
      height: 100%;
      min-height: 420px;
      background: var(--toolary-preview-bg);
    }
    .toolary-playground-console-shell {
      min-height: 140px;
      gap: 6px;
    }
    .toolary-playground-console {
      max-height: 180px;
      padding: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      display: grid;
      gap: 4px;
    }
    .toolary-playground-console-line {
      padding: 4px 6px;
      border-radius: 6px;
      background: rgba(127, 127, 127, .12);
    }
    .toolary-playground-console-line.is-error {
      background: rgba(239, 68, 68, .16);
    }
  `;
  document.head.appendChild(style);
}

async function openOutputFullscreen() {
  const output = panel?.querySelector('#toolary-playground-output');
  if (!output) return;
  if (openToolFullscreen(output)) return;
  showError(t('htmlCssJsPreviewerFullscreenNotSupported') || 'Fullscreen is not supported on this page.');
}

const DEFAULT_HTML = `<main class="wrap">\n  <h1>Hello Toolboard</h1>\n  <p>Edit HTML, CSS and JS then run preview.</p>\n  <button id="helloBtn">Click me</button>\n</main>`;

const DEFAULT_CSS = `body {\n  margin: 0;\n  color: #0f172a;\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  background: linear-gradient(120deg, #f8fafc, #e2e8f0);\n}\n.wrap {\n  max-width: 640px;\n  margin: 40px auto;\n  background: #ffffffcc;\n  border: 1px solid #cbd5e1;\n  border-radius: 14px;\n  padding: 20px;\n}\nbutton {\n  height: 36px;\n  padding: 0 14px;\n  border-radius: 10px;\n  border: 1px solid #64748b;\n  background: #0f172a;\n  color: #fff;\n  cursor: pointer;\n}`;

const DEFAULT_JS = `document.getElementById('helloBtn')?.addEventListener('click', () => {\n  console.log('Hello from Toolboard Playground');\n  alert('Preview is working');\n});`;

function getEditors() {
  return {
    html: panel?.querySelector('#toolary-playground-html'),
    css: panel?.querySelector('#toolary-playground-css'),
    js: panel?.querySelector('#toolary-playground-js')
  };
}

function appendLog(type, args = []) {
  const output = panel?.querySelector('#toolary-playground-console');
  if (!output) return;

  const line = document.createElement('div');
  line.className = `toolary-playground-console-line${type === 'error' ? ' is-error' : ''}`;
  line.textContent = `[${type}] ${args.map((value) => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }).join(' ')}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function buildSrcDoc() {
  const editors = getEditors();
  const html = editors.html?.value || '';
  const css = editors.css?.value || '';
  const js = (editors.js?.value || '').replace(/<\/(script)/gi, '<\\/$1');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
html, body {
  background: #ffffff;
  color: #111827;
  color-scheme: only light;
}
</style>
<style>${css}</style>
</head>
<body>
${html}
<script>
(() => {
  const emit = (type, args) => {
    parent.postMessage({ __toolaryPlayground: true, type, args }, '*');
  };
  ['log','info','warn','error'].forEach((name) => {
    const original = console[name];
    console[name] = (...args) => {
      emit(name, args);
      original.apply(console, args);
    };
  });
  window.addEventListener('error', (event) => {
    emit('error', [event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    emit('error', [event.reason?.message || String(event.reason)]);
  });
})();
</script>
<script>
${js}
</script>
</body>
</html>`;
}

function runPreview() {
  const iframe = panel?.querySelector('#toolary-playground-output');
  const consoleBox = panel?.querySelector('#toolary-playground-console');
  if (!iframe || !consoleBox) return;

  consoleBox.innerHTML = '';
  iframe.srcdoc = buildSrcDoc();
  appendLog('info', [t('htmlCssJsPreviewerReady') || 'Preview rendered']);
  showCoffeeMessageForTool('html-css-js-previewer');
}

function switchTab(tabName) {
  activeTab = tabName;
  panel?.querySelectorAll('[data-editor-tab]').forEach((button) => {
    const isActive = button.getAttribute('data-editor-tab') === tabName;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('is-active', isActive);
  });

  panel?.querySelectorAll('[data-editor]').forEach((editor) => {
    const isActive = editor.getAttribute('data-editor') === tabName;
    editor.classList.toggle('is-active', isActive);
  });
}

function resetEditors() {
  const editors = getEditors();
  if (editors.html) editors.html.value = DEFAULT_HTML;
  if (editors.css) editors.css.value = DEFAULT_CSS;
  if (editors.js) editors.js.value = DEFAULT_JS;
  runPreview();
}

async function copyBundle() {
  try {
    const editors = getEditors();
    const bundled = `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<style>\n${editors.css?.value || ''}\n</style>\n</head>\n<body>\n${editors.html?.value || ''}\n<script>\n${editors.js?.value || ''}\n<\\/script>\n</body>\n</html>`;
    await copyText(bundled);
    showSuccess(t('htmlCssJsPreviewerCopied') || t('copied') || 'Copied');
  } catch (error) {
    handleError(error, 'htmlCssJsPreviewer.copyBundle');
    showError(t('htmlCssJsPreviewerCopyFailed') || 'Copy failed.');
  }
}

function downloadBundle() {
  const editors = getEditors();
  const content = `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<style>\n${editors.css?.value || ''}\n</style>\n</head>\n<body>\n${editors.html?.value || ''}\n<script>\n${(editors.js?.value || '').replace(/<\/(script)/gi, '<\\/$1')}\n<\\/script>\n</body>\n</html>`;
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `toolary-playground-${Date.now()}.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showSuccess(t('htmlCssJsPreviewerDownloaded') || 'Downloaded');
}

function createPanel() {
  ensureStyles();
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-html-css-js-previewer',
    title: t('htmlCssJsPreviewerTitle') || 'HTML/CSS/JS Previewer',
    width: 1200,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-grid-2 toolary-playground-shell">
        <section class="toolary-preview-section toolary-playground-editor">
          <div class="toolary-preview-row">
            <button class="toolary-ui-btn" data-action="run">${t('htmlCssJsPreviewerRun') || 'Run Preview'}</button>
            <button class="toolary-ui-btn" data-action="reset">${t('htmlCssJsPreviewerReset') || 'Reset'}</button>
            <button class="toolary-ui-btn" data-action="copy">${t('htmlCssJsPreviewerCopy') || 'Copy Bundle'}</button>
            <button class="toolary-ui-btn" data-action="download">${t('htmlCssJsPreviewerDownload') || 'Download HTML'}</button>
            <button class="toolary-ui-btn" data-action="fullscreen">${t('htmlCssJsPreviewerFullscreen') || 'Fullscreen'}</button>
          </div>

          <div class="toolary-preview-row">
            <button class="toolary-ui-btn" data-editor-tab="html" aria-pressed="true">${t('htmlCssJsPreviewerHtmlTab') || 'HTML'}</button>
            <button class="toolary-ui-btn" data-editor-tab="css" aria-pressed="false">${t('htmlCssJsPreviewerCssTab') || 'CSS'}</button>
            <button class="toolary-ui-btn" data-editor-tab="js" aria-pressed="false">${t('htmlCssJsPreviewerJsTab') || 'JS'}</button>
          </div>

          <div class="toolary-playground-editor-host">
            <textarea id="toolary-playground-html" class="toolary-playground-editor-pane is-active" data-editor="html" spellcheck="false"></textarea>
            <textarea id="toolary-playground-css" class="toolary-playground-editor-pane" data-editor="css" spellcheck="false"></textarea>
            <textarea id="toolary-playground-js" class="toolary-playground-editor-pane" data-editor="js" spellcheck="false"></textarea>
          </div>
        </section>

        <section class="toolary-preview-section toolary-playground-preview">
          <h3 class="toolary-preview-muted toolary-playground-output-title">${t('htmlCssJsPreviewerOutput') || 'Output'}</h3>
          <iframe id="toolary-playground-output" sandbox="allow-scripts allow-modals" class="toolary-preview-scroll toolary-playground-output"></iframe>
          <div class="toolary-preview-section toolary-playground-console-shell">
            <h3 class="toolary-preview-muted toolary-playground-console-title">${t('htmlCssJsPreviewerConsole') || 'Console'}</h3>
            <div id="toolary-playground-console" class="toolary-preview-scroll toolary-playground-console"></div>
          </div>
        </section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  const editors = getEditors();
  if (editors.html) editors.html.value = DEFAULT_HTML;
  if (editors.css) editors.css.value = DEFAULT_CSS;
  if (editors.js) editors.js.value = DEFAULT_JS;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="run"]'), 'click', runPreview));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="reset"]'), 'click', resetEditors));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="copy"]'), 'click', copyBundle));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="download"]'), 'click', downloadBundle));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="fullscreen"]'), 'click', openOutputFullscreen));

  panel.querySelectorAll('[data-editor-tab]').forEach((button) => {
    button.classList.add('toolary-playground-tab');
    cleanupFns.push(addEventListenerWithCleanup(button, 'click', () => switchTab(button.getAttribute('data-editor-tab') || 'html')));
  });

  cleanupFns.push(addEventListenerWithCleanup(window, 'message', (event) => {
    if (!event.data || event.data.__toolaryPlayground !== true) return;
    appendLog(event.data.type || 'log', Array.isArray(event.data.args) ? event.data.args : []);
  }));

  switchTab(activeTab);
  runPreview();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'htmlCssJsPreviewer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'htmlCssJsPreviewer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
  activeTab = 'html';
}
