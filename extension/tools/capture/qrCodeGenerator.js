import {
  showSuccess,
  showError,
  handleError,
  addEventListenerWithCleanup,
  t,
  ensureLanguageLoaded
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'qr-code-generator',
  name: 'QR Code Generator',
  category: 'capture',
  icon: 'qrcode',
  permissions: ['activeTab'],
  tags: ['qr', 'qrcode', 'share', 'mobile'],
  keywords: ['qr code', 'qrcode', 'barcode', 'share', 'mobile', 'scan']
};

const DEFAULT_QR_SETTINGS = {
  size: 256,
  margin: 16,
  colorDark: '#000000',
  colorLight: '#ffffff',
  errorCorrection: 'M'
};

const QR_LIBRARY_PATH = 'libs/qrcode-generator.js';
const RENDER_DEBOUNCE_MS = 160;

let deactivateCb;
let cleanupFns = [];
let qrModal = null;
let qrBackdrop = null;
let currentQrData = null;
let renderTimeoutId = null;
let activeRenderToken = 0;
let qrFactoryPromise = null;
let stylesInjected = false;
let qrFullscreenOverlay = null;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-qr-generator-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-qr-generator-styles';
  style.textContent = `
    #toolary-qr-backdrop{position:fixed;inset:0;z-index:2147483646;pointer-events:auto;background:transparent;}
    .toolary-qr-preview-message{font-size:14px;color:var(--toolary-secondary-text,#666);text-align:center;padding:8px;}
    .toolary-qr-preview-message.error{color:var(--toolary-error-color,#dc3545);padding:20px;}
    .toolary-qr-preview-message-line{margin-bottom:10px;}
    .toolary-qr-preview-message-detail{font-size:12px;color:var(--toolary-secondary-text,#666);}
    .toolary-qr-retry-btn{margin-top:10px;}
    .toolary-qr-inline-icon{margin-right:8px;}
    .toolary-qr-inline-icon-sm{margin-right:6px;}
    .toolary-qr-inline-icon-xs{margin-right:4px;}
    .toolary-qr-loading-text{color:var(--toolary-secondary-text,#666);font-size:14px;margin-top:12px;}
    .toolary-qr-preview.clickable{cursor:zoom-in;}
    .toolary-qr-fullscreen-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;}
    .toolary-qr-fullscreen-overlay canvas{max-width:95vw;max-height:95vh;width:auto;height:auto;background:#fff;border-radius:8px;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

const isJestEnvironment = () => typeof global !== 'undefined' && Boolean(global.jest);

function createJestQrFactory() {
  const factory = () => {
    let data = '';
    return {
      addData(text) {
        data = text;
      },
      make() {
        if (!data) {
          throw new Error('Missing QR data');
        }
      },
      getModuleCount() {
        return 21;
      },
      isDark(row, col) {
        return (row + col) % 3 === 0;
      }
    };
  };

  factory.stringToBytes = () => [];

  return factory;
}

async function loadQrFactory() {
  if (qrFactoryPromise) {
    return qrFactoryPromise;
  }

  if (isJestEnvironment()) {
    if (!global.__toolaryQrFactory) {
      global.__toolaryQrFactory = createJestQrFactory();
    }
    qrFactoryPromise = Promise.resolve(global.__toolaryQrFactory);
    return qrFactoryPromise;
  }

  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    throw new Error('chrome.runtime.getURL is not available');
  }

  const moduleUrl = chrome.runtime.getURL(QR_LIBRARY_PATH);
  qrFactoryPromise = import(moduleUrl)
    .then((module) => {
      // Try to get the qrcode function from various possible exports
      let qrFactory = null;
      
      if (module?.default && typeof module.default === 'function') {
        qrFactory = module.default;
      } else if (module?.qrcode && typeof module.qrcode === 'function') {
        qrFactory = module.qrcode;
      } else if (module?.default?.qrcode && typeof module.default.qrcode === 'function') {
        qrFactory = module.default.qrcode;
      }
      
      if (!qrFactory) {
        throw new Error('QR code library is missing a valid qrcode function export');
      }
      
      return qrFactory;
    })
    .catch((error) => {
      qrFactoryPromise = null;
      throw new Error(`Failed to load QR code library: ${error.message}`);
    });

  return qrFactoryPromise;
}

async function renderQRCodeCanvas(text, settings) {
  if (!text) {
    throw new Error('QR code text is empty');
  }

  const createQrCode = await loadQrFactory();
  const qr = createQrCode(0, settings.errorCorrection);
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  if (!moduleCount || moduleCount <= 0) {
    throw new Error('QR code matrix could not be generated');
  }

  const margin = Math.max(0, settings.margin | 0);
  const availablePixels = Math.max(settings.size - margin * 2, moduleCount);
  const cellSize = Math.max(1, Math.floor(availablePixels / moduleCount));
  const canvasSize = moduleCount * cellSize + margin * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  canvas.style.width = `${canvasSize}px`;
  canvas.style.height = `${canvasSize}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas rendering context unavailable');
  }

  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = settings.colorLight;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  ctx.fillStyle = settings.colorDark;
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qr.isDark(row, col)) {
        const x = margin + col * cellSize;
        const y = margin + row * cellSize;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  return canvas;
}

function getModalElement(selector) {
  return qrModal?.querySelector(selector) || null;
}

function readFormValues() {
  const textInput = getModalElement('#toolary-qr-text');
  const sizeSelect = getModalElement('#toolary-qr-size');
  const marginSelect = getModalElement('#toolary-qr-margin');
  const colorDarkInput = getModalElement('#toolary-qr-color-dark');
  const colorLightInput = getModalElement('#toolary-qr-color-light');
  const correctionSelect = getModalElement('#toolary-qr-error-level');

  return {
    text: textInput?.value?.trim() ?? '',
    settings: {
      size: parseInt(sizeSelect?.value ?? DEFAULT_QR_SETTINGS.size, 10),
      margin: parseInt(marginSelect?.value ?? DEFAULT_QR_SETTINGS.margin, 10),
      colorDark: colorDarkInput?.value || DEFAULT_QR_SETTINGS.colorDark,
      colorLight: colorLightInput?.value || DEFAULT_QR_SETTINGS.colorLight,
      errorCorrection: correctionSelect?.value || DEFAULT_QR_SETTINGS.errorCorrection
    }
  };
}

function setActionAvailability(hasCanvas) {
  const downloadBtn = getModalElement('[data-action="download-png"]');
  const copyBtn = getModalElement('[data-action="copy-text"]');

  if (downloadBtn) {
    downloadBtn.disabled = !hasCanvas;
  }
  if (copyBtn) {
    copyBtn.disabled = !hasCanvas;
  }
}

function schedulePreviewRender(options = {}) {
  const { announceSuccess = false } = options;

  if (renderTimeoutId) {
    clearTimeout(renderTimeoutId);
  }

  renderTimeoutId = setTimeout(() => {
    renderTimeoutId = null;
    updatePreview({ announceSuccess });
  }, RENDER_DEBOUNCE_MS);
}

function closePreviewFullscreen() {
  if (qrFullscreenOverlay?.parentNode) {
    qrFullscreenOverlay.remove();
  }
  qrFullscreenOverlay = null;
}

function openPreviewFullscreen(canvas) {
  if (!canvas) return;
  closePreviewFullscreen();
  const overlay = document.createElement('div');
  overlay.className = 'toolary-qr-fullscreen-overlay';
  overlay.appendChild(canvas.cloneNode(true));
  overlay.addEventListener('click', closePreviewFullscreen);
  qrFullscreenOverlay = overlay;
  document.body.appendChild(overlay);
}

function renderPreviewMessage(type, title, detail = '', withRetry = false) {
  if (type === 'error') {
    return `
      <div class="toolary-qr-preview-message error">
        <div class="toolary-qr-preview-message-line">❌ ${title}</div>
        ${detail ? `<div class="toolary-qr-preview-message-detail">${detail}</div>` : ''}
        ${withRetry ? `<button data-action="retry-load" class="toolary-btn toolary-btn-primary toolary-qr-retry-btn">Retry</button>` : ''}
      </div>
    `;
  }
  return `<div class="toolary-qr-preview-message">${title}</div>`;
}

async function updatePreview(options = {}) {
  const { announceSuccess = false } = options;
  const previewContainer = getModalElement('#toolary-qr-preview');

  if (!previewContainer) {
    return;
  }

  const { text, settings } = readFormValues();
  if (!text) {
    currentQrData = null;
    setActionAvailability(false);
    previewContainer.classList.remove('clickable');
    previewContainer.innerHTML = renderPreviewMessage('info', 'Enter text to build a QR code.');
    return;
  }

  const requestId = ++activeRenderToken;
  previewContainer.innerHTML = renderPreviewMessage('info', 'Building QR code...');

  try {
    // Ensure QR library is loaded before attempting to render
    await loadQrFactory();
    
    const canvas = await renderQRCodeCanvas(text, settings);
    if (requestId !== activeRenderToken) {
      return;
    }

    previewContainer.innerHTML = '';
    previewContainer.appendChild(canvas);
    previewContainer.classList.add('clickable');

    currentQrData = { text, settings, canvas };
    setActionAvailability(true);

    if (announceSuccess) {
      const message = chrome.i18n ? chrome.i18n.getMessage('qrCodeGenerated') : 'QR code generated';
      showSuccess(message);
    }
  } catch (error) {
    if (requestId !== activeRenderToken) {
      return;
    }

    currentQrData = null;
    setActionAvailability(false);
    previewContainer.classList.remove('clickable');
    
    // Provide more specific error messages
    let errorMessage = 'Failed to build QR code.';
    if (error.message.includes('QR code library')) {
      errorMessage = 'QR code library not available.';
    } else if (error.message.includes('QR code text is empty')) {
      errorMessage = 'Please enter some text to generate a QR code.';
    } else if (error.message.includes('QR code matrix')) {
      errorMessage = 'Text is too long for QR code generation.';
    }
    
    previewContainer.innerHTML = renderPreviewMessage('error', errorMessage, error.message);
    handleError(error, 'qrCodeGenerator.updatePreview');
    showError(errorMessage);
  }
}

async function downloadAsPNG() {
  if (!currentQrData?.canvas) {
    const message = chrome.i18n ? chrome.i18n.getMessage('noQrCodeAvailableToDownload') : 'No QR code available to download';
    showError(message);
    return;
  }

  try {
    const { canvas, settings } = currentQrData;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Unable to prepare QR code image'));
        }
      }, 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const sizeLabel = settings.size || DEFAULT_QR_SETTINGS.size;
    link.download = `toolary-qr-${sizeLabel}px-${Date.now()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    const message = chrome.i18n ? chrome.i18n.getMessage('qrCodeDownloaded') : 'QR code downloaded';
    showSuccess(message);
  } catch (error) {
    handleError(error, 'qrCodeGenerator.downloadAsPNG');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToDownloadQrCode') : 'Failed to download QR code';
    showError(message);
  }
}

async function copyTextToClipboard() {
  if (!currentQrData?.text) {
    const message = chrome.i18n ? chrome.i18n.getMessage('nothingToCopy') : 'Nothing to copy';
    showError(message);
    return;
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(currentQrData.text);
    } else {
      const tempInput = document.createElement('textarea');
      tempInput.value = currentQrData.text;
      tempInput.setAttribute('readonly', '');
      tempInput.style.position = 'absolute';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      tempInput.remove();
    }
    const message = chrome.i18n ? chrome.i18n.getMessage('textCopiedToClipboard') : 'Text copied to clipboard';
    showSuccess(message);
  } catch (error) {
    handleError(error, 'qrCodeGenerator.copyTextToClipboard');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToCopyText') : 'Failed to copy text';
    showError(message);
  }
}

function useCurrentUrl() {
  const textInput = getModalElement('#toolary-qr-text');
  if (textInput) {
    textInput.value = window.location.href;
  }
  schedulePreviewRender({ announceSuccess: false });
}

function closeModal() {
  try {
    if (renderTimeoutId) {
      clearTimeout(renderTimeoutId);
      renderTimeoutId = null;
    }

    activeRenderToken += 1;
    currentQrData = null;
    closePreviewFullscreen();

    if (qrBackdrop && qrBackdrop.parentNode) {
      qrBackdrop.remove();
    }
    qrBackdrop = null;

    if (qrModal && qrModal.parentNode) {
      qrModal.remove();
    }
    qrModal = null;
    
    // Show coffee message when modal is closed
    showCoffeeMessageForTool('qr-code-generator');
  } catch (error) {
    handleError(error, 'closeModal');
  }
}

function createModal() {
  const modal = document.createElement('div');
  modal.id = 'toolary-modal-overlay';
  modal.innerHTML = `
    <div id="toolary-modal-content" class="qr-modal-wide">
      <div class="modal-header">
        <h3 class="modal-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <path d="M9 9h6v6H9z"/>
            <path d="M9 1v6"/>
            <path d="M15 1v6"/>
            <path d="M9 17v6"/>
            <path d="M15 17v6"/>
            <path d="M1 9h6"/>
            <path d="M17 9h6"/>
            <path d="M1 15h6"/>
            <path d="M17 15h6"/>
          </svg>
          QR Code Generator
        </h3>
        <button class="modal-close" data-action="close" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="qr-modal-body">
        <div class="qr-preview-section">
          <div id="toolary-qr-preview" class="toolary-qr-preview">
            <div class="qr-loading-state">
              <div class="qr-loading-spinner"></div>
              <div class="toolary-qr-loading-text">Preparing QR code...</div>
            </div>
          </div>
        </div>
        
        <div class="qr-controls-section">
          <div class="qr-form-section">
            <div class="form-group">
              <label class="form-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-sm">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10,9 9,9 8,9"/>
                </svg>
                Text or URL
              </label>
              <textarea id="toolary-qr-text" rows="4" class="form-input qr-textarea" placeholder="${t('qrTextPlaceholder', 'Enter text, URL, or any content to generate QR code...')}"></textarea>
            </div>
            
            <div class="qr-quick-actions">
              <button class="toolary-btn toolary-btn-secondary qr-quick-btn" data-action="use-current-url">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-sm">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                Use current URL
              </button>
            </div>
          </div>

          <div class="qr-settings-section">
            <h4 class="settings-title">Settings</h4>
            <div class="settings-grid">
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-xs">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="M21 15.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5"/>
                    </svg>
                    Size
                  </label>
                  <select id="toolary-qr-size" class="form-input">
                    <option value="192">192 px</option>
                    <option value="256" selected>256 px</option>
                    <option value="320">320 px</option>
                    <option value="384">384 px</option>
                    <option value="512">512 px</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-xs">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                    </svg>
                    Margin
                  </label>
                  <select id="toolary-qr-margin" class="form-input">
                    <option value="0">0 px</option>
                    <option value="8">8 px</option>
                    <option value="16" selected>16 px</option>
                    <option value="24">24 px</option>
                    <option value="32">32 px</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-xs">
                    <path d="M9 12l2 2 4-4"/>
                    <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                    <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                    <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"/>
                    <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3"/>
                  </svg>
                  Error correction
                </label>
                <select id="toolary-qr-error-level" class="form-input">
                  <option value="L">Low (7%)</option>
                  <option value="M" selected>Medium (15%)</option>
                  <option value="Q">Quartile (25%)</option>
                  <option value="H">High (30%)</option>
                </select>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-xs">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M8 12h8"/>
                      <path d="M12 8v8"/>
                    </svg>
                    Dark color
                  </label>
                  <div class="color-input-wrapper">
                    <input type="color" id="toolary-qr-color-dark" value="#000000" class="toolary-color-input">
                    <span class="color-value">#000000</span>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon-xs">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                    </svg>
                    Light color
                  </label>
                  <div class="color-input-wrapper">
                    <input type="color" id="toolary-qr-color-light" value="#ffffff" class="toolary-color-input">
                    <span class="color-value">#ffffff</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="qr-actions">
            <button class="toolary-btn toolary-btn-primary qr-action-btn" data-action="download-png" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PNG
            </button>
            <button class="toolary-btn toolary-btn-secondary qr-action-btn" data-action="copy-text" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-qr-inline-icon">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy text
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  return modal;
}

export async function activate(deactivate) {
  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    ensureStyles();
    
    deactivateCb = deactivate;
    
    // Clean up any existing modal first
    if (qrModal && qrModal.parentNode) {
      qrModal.remove();
    }
    
    // Show loading modal first
    qrModal = createModal();
    const previewContainer = getModalElement('#toolary-qr-preview');
    if (previewContainer) {
      previewContainer.innerHTML = renderPreviewMessage('info', 'Loading QR code library...');
    }
    
    // Create invisible clickable area for backdrop
    qrBackdrop = document.createElement('div');
    qrBackdrop.id = 'toolary-qr-backdrop';

    document.body.appendChild(qrBackdrop);
    document.body.appendChild(qrModal);

    if (previewContainer) {
      cleanupFns.push(addEventListenerWithCleanup(previewContainer, 'click', (event) => {
        const retryButton = event.target?.closest?.('[data-action="retry-load"]');
        if (retryButton) {
          event.preventDefault();
          window.location.reload();
          return;
        }
        const clickedCanvas = event.target?.tagName === 'CANVAS' ? event.target : event.target?.closest?.('canvas');
        if (clickedCanvas && currentQrData?.canvas) {
          openPreviewFullscreen(currentQrData.canvas);
        }
      }));
    }

    // Try to load QR library first
    try {
      await loadQrFactory();
    } catch (error) {
      if (previewContainer) {
        previewContainer.innerHTML = renderPreviewMessage('error', 'Failed to load QR code library', error.message, true);
      }
      const message = chrome.i18n ? chrome.i18n.getMessage('failedToLoadQrCodeLibrary') : 'Failed to load QR code library';
      showError(message);
      return;
    }

    // Set up form elements
    const textInput = getModalElement('#toolary-qr-text');
    if (textInput) {
      textInput.value = window.location.href;
    }

    const closeBtn = getModalElement('[data-action="close"]');
    const downloadBtn = getModalElement('[data-action="download-png"]');
    const copyBtn = getModalElement('[data-action="copy-text"]');
    const useCurrentBtn = getModalElement('[data-action="use-current-url"]');
    const sizeSelect = getModalElement('#toolary-qr-size');
    const marginSelect = getModalElement('#toolary-qr-margin');
    const colorDarkInput = getModalElement('#toolary-qr-color-dark');
    const colorLightInput = getModalElement('#toolary-qr-color-light');
    const correctionSelect = getModalElement('#toolary-qr-error-level');

    // Update color value displays
    const updateColorValue = (input, valueSpan) => {
      if (input && valueSpan) {
        valueSpan.textContent = input.value.toUpperCase();
      }
    };

    const darkColorValue = getModalElement('#toolary-qr-color-dark').parentElement.querySelector('.color-value');
    const lightColorValue = getModalElement('#toolary-qr-color-light').parentElement.querySelector('.color-value');

    cleanupFns.push(
      addEventListenerWithCleanup(closeBtn, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
        if (deactivateCb) {
          deactivateCb();
        }
      }),
      addEventListenerWithCleanup(downloadBtn, 'click', downloadAsPNG),
      addEventListenerWithCleanup(copyBtn, 'click', copyTextToClipboard),
      addEventListenerWithCleanup(useCurrentBtn, 'click', useCurrentUrl),
      addEventListenerWithCleanup(textInput, 'input', () => schedulePreviewRender({ announceSuccess: false })),
      addEventListenerWithCleanup(sizeSelect, 'change', () => schedulePreviewRender({ announceSuccess: true })),
      addEventListenerWithCleanup(marginSelect, 'change', () => schedulePreviewRender({ announceSuccess: true })),
      addEventListenerWithCleanup(colorDarkInput, 'input', () => {
        updateColorValue(colorDarkInput, darkColorValue);
        schedulePreviewRender({ announceSuccess: false });
      }),
      addEventListenerWithCleanup(colorLightInput, 'input', () => {
        updateColorValue(colorLightInput, lightColorValue);
        schedulePreviewRender({ announceSuccess: false });
      }),
      addEventListenerWithCleanup(correctionSelect, 'change', () => schedulePreviewRender({ announceSuccess: true })),
      addEventListenerWithCleanup(qrBackdrop, 'click', closeModal),
      addEventListenerWithCleanup(qrModal, 'click', (event) => {
        if (event.target === qrModal) {
          closeModal();
          if (deactivateCb) {
            deactivateCb();
          }
        }
      })
    );

    cleanupFns.push(() => {
      if (renderTimeoutId) {
        clearTimeout(renderTimeoutId);
        renderTimeoutId = null;
      }
    });

    // Now try to generate the initial QR code
    try {
      await updatePreview({ announceSuccess: false });
    } catch (error) {
      if (previewContainer) {
        previewContainer.innerHTML = renderPreviewMessage('error', 'Failed to generate QR code', error.message);
      }
      const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToGenerateQRCode') : 'Failed to generate QR code';
      showError(errorMessage);
    }
  } catch (error) {
    handleError(error, 'qrCodeGenerator.activate');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateQRCodeGenerator') : 'Failed to activate QR code generator';
    showError(errorMessage);
    deactivate();
  }
}

export function deactivate() {
  try {
    // Clean up all event listeners first
    cleanupFns.forEach((cleanup) => {
      try {
        cleanup?.();
      } catch (error) {
        handleError(error, 'cleanup function');
      }
    });
    cleanupFns = [];
    
    // Clean up modal without calling deactivateCb to avoid infinite loop
    if (renderTimeoutId) {
      clearTimeout(renderTimeoutId);
      renderTimeoutId = null;
    }

    activeRenderToken += 1;
    currentQrData = null;
    closePreviewFullscreen();

    if (qrModal && qrModal.parentNode) {
      qrModal.remove();
    }
    if (qrBackdrop && qrBackdrop.parentNode) {
      qrBackdrop.remove();
    }
    qrModal = null;
    qrBackdrop = null;
  } catch (error) {
    handleError(error, 'qrCodeGenerator.deactivate');
  }
}
