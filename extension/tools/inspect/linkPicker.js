import { copyText, showModal, showError, showSuccess, showInfo, showWarning, throttle, handleError, safeExecute, sanitizeInput, addEventListenerWithCleanup, t, ensureLanguageLoaded } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'link-picker',
  name: 'Link Picker',
  category: 'inspect',
  icon: 'link',
  permissions: ['activeTab'],
  tags: ['links', 'urls', 'validation'],
  keywords: ['links', 'broken links', 'urls', 'anchors']
};

const DATA_ATTRIBUTE_KEYS = ['url', 'href', 'link', 'target', 'route', 'path', 'navigate', 'slug'];
const JS_URL_REGEX = /(https?:\/\/[^'"\s]+)/i;
const RELATIVE_URL_REGEX = /['"](\/[^'"\s]*)['"]/i;

let startX, startY, box, deactivateCb;
let isSelecting = false;
let cleanupFunctions = []; // New: Array to store cleanup functions for event listeners

// Enhanced mouse down handler with error handling
function onMouseDown(e) {
  try {
    if (isSelecting) return;
    
    startX = e.pageX;
    startY = e.pageY;
    isSelecting = true;
    
    box = document.createElement('div');
    box.id = 'toolary-highlight-overlay';
    box.style.cssText = `
      position: absolute;
      background-color: var(--toolary-highlight-bg, rgba(33, 150, 243, 0.2));
      border: 2px solid var(--toolary-primary-color, #2196f3);
      border-radius: 4px;
      z-index: 2147483646;
      pointer-events: none;
      box-sizing: border-box;
      box-shadow: 0 0 6px var(--toolary-highlight-shadow, rgba(33, 150, 243, 0.6));
      transition: all 0.15s ease-out;
    `;
    
    document.body.appendChild(box);
    
    // Add event listeners with cleanup tracking
    const cleanupMove = addEventListenerWithCleanup(document, 'mousemove', throttledOnMove, true);
    const cleanupUp = addEventListenerWithCleanup(document, 'mouseup', onUp, true);
    
    cleanupFunctions.push(cleanupMove, cleanupUp);
    
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('dragToSelectLinks') : 'Drag to select links • Release to extract • Ctrl/Cmd+A for all links • Esc to cancel';
    showInfo(infoMessage, 2000);
    
  } catch (error) {
    handleError(error, 'onMouseDown');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToStartLinkSelection') : 'Failed to start link selection. Please try again.';
    showError(errorMessage);
  }
}

// Performance optimized move handler with enhanced error handling
const throttledOnMove = throttle((e) => {
  try {
    if (!isSelecting) return;
    
    const x = Math.min(startX, e.pageX);
    const y = Math.min(startY, e.pageY);
    const w = Math.abs(startX - e.pageX);
    const h = Math.abs(startY - e.pageY);
    
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
  } catch (error) {
    console.debug('Link picker move handler error:', error);
  }
}, 16);

function finalizeSelection() {
  cleanupFunctions.forEach(cleanup => {
    try {
      cleanup();
    } catch (error) {
      handleError(error, 'event listener cleanup');
    }
  });
  cleanupFunctions.length = 0;
  if (box) {
    box.remove();
  }
  box = null;
  isSelecting = false;
}

function showProgressOverlay(total) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    background: rgba(18, 18, 20, 0.92);
    padding: 24px 32px;
    border-radius: 12px;
    width: min(420px, 90vw);
    color: #ffffff;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  `;

  const title = document.createElement('div');
  title.textContent = t('scanningLinks', 'Scanning links…');
  title.style.cssText = 'font-size: 16px; font-weight: 600; margin-bottom: 14px;';

  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'height: 8px; border-radius: 999px; background: rgba(255,255,255,0.25); overflow: hidden;';

  const barInner = document.createElement('div');
  barInner.style.cssText = 'height: 100%; width: 0%; background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%); transition: width 140ms ease-out;';

  const subtitle = document.createElement('div');
  subtitle.textContent = `Processing 0 of ${total}`;
  subtitle.style.cssText = 'margin-top: 12px; font-size: 13px; opacity: 0.85;';

  barOuter.appendChild(barInner);
  container.appendChild(title);
  container.appendChild(barOuter);
  container.appendChild(subtitle);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  return {
    update(current) {
      const percent = Math.min(100, Math.round((current / total) * 100));
      barInner.style.width = `${percent}%`;
      subtitle.textContent = `Processing ${current} of ${total}`;
    },
    complete() {
      title.textContent = t('finalising', 'Finalising…');
    },
    destroy() {
      overlay.remove();
    }
  };
}

function normalizeUrl(candidate) {
  if (!candidate || typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed || trimmed === '#' || /^javascript:/i.test(trimmed)) return null;

  if (/^(mailto:|tel:|sms:|http:|https:)/i.test(trimmed)) {
    try {
      return new URL(trimmed, window.location.href).href;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('//')) {
    return `${window.location.protocol}${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return `${window.location.origin}${trimmed}`;
  }

  if (!trimmed.includes(' ') && /^[a-z0-9]/i.test(trimmed)) {
    try {
      return new URL(trimmed, window.location.href).href;
    } catch {
      return null;
    }
  }

  return null;
}

function extractCandidatesFromElement(link) {
  const candidates = [];

  DATA_ATTRIBUTE_KEYS.forEach((key) => {
    const attrValue = link.getAttribute(`data-${key}`);
    if (attrValue) candidates.push(attrValue);
    const datasetValue = link.dataset?.[key];
    if (datasetValue) candidates.push(datasetValue);
  });

  const ariaLabel = link.getAttribute('aria-label');
  if (ariaLabel) {
    const httpMatch = JS_URL_REGEX.exec(ariaLabel);
    if (httpMatch) candidates.push(httpMatch[0]);
  }

  const onclickAttr = link.getAttribute('onclick');
  if (onclickAttr) {
    const httpMatch = JS_URL_REGEX.exec(onclickAttr);
    if (httpMatch) candidates.push(httpMatch[0]);
    const relativeMatch = RELATIVE_URL_REGEX.exec(onclickAttr);
    if (relativeMatch) candidates.push(relativeMatch[1]);
  }

  if (typeof link.onclick === 'function') {
    const fnString = link.onclick.toString();
    const httpMatch = JS_URL_REGEX.exec(fnString);
    if (httpMatch) candidates.push(httpMatch[0]);
    const relativeMatch = RELATIVE_URL_REGEX.exec(fnString);
    if (relativeMatch) candidates.push(relativeMatch[1]);
  }

  return candidates.filter(Boolean);
}

function resolveLinkUrl(link) {
  const hrefAttr = link.getAttribute('href');
  if (hrefAttr && !/^javascript:/i.test(hrefAttr) && hrefAttr !== '#') {
    try {
      return new URL(hrefAttr, window.location.href).href;
    } catch {
      // fall through to candidate extraction
    }
  }

  const candidates = extractCandidatesFromElement(link);
  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function requiresAdvancedMode(links) {
  return links.some((link) => {
    const hrefAttr = link.getAttribute('href');
    return !hrefAttr || hrefAttr === '#' || /^javascript:/i.test(hrefAttr);
  });
}

async function analyzeLinks(links, sourceLabel = 'selected area') {
  if (!links || links.length === 0) {
    showWarning(`No links found in ${sourceLabel}.`);
    deactivateCb();
    return false;
  }

  const useAdvanced = requiresAdvancedMode(links);
  const progress = useAdvanced ? showProgressOverlay(links.length) : null;
  const analyzed = [];

  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    const resolvedUrl = resolveLinkUrl(link);
    if (resolvedUrl) {
      analyzed.push({
        url: sanitizeInput(resolvedUrl),
        text: sanitizeInput(link.textContent.trim()),
        title: sanitizeInput(link.title || ''),
        target: sanitizeInput(link.target || '_self'),
        rel: sanitizeInput(link.rel || '')
      });
    }

    if (progress) {
      progress.update(index + 1);
      await new Promise(requestAnimationFrame);
    }
  }

  if (progress) {
    progress.complete();
    setTimeout(() => progress.destroy(), 200);
  }

  const uniqueLinks = analyzed.filter((link, index, self) =>
    index === self.findIndex(l => l.url === link.url)
  );

  if (!uniqueLinks.length) {
    const message = chrome.i18n ? chrome.i18n.getMessage('noValidLinksDetected') : 'No valid links were detected.';
    showWarning(message);
    deactivateCb();
    return false;
  }

  const urlsList = uniqueLinks.map(link => link.url).join('\n');
  copyText(urlsList);

  const successMessage = chrome.i18n ? chrome.i18n.getMessage('linksExtractedFromSource', [uniqueLinks.length, sourceLabel]) : `${uniqueLinks.length} links extracted from ${sourceLabel}!`;
  showSuccess(successMessage);

  const title = `${uniqueLinks.length} ${uniqueLinks.length === 1 ? t('link') : t('links')}`;
  showModal(title, urlsList, 'link', 'links');
  
  // Show coffee message when modal is closed
  setTimeout(() => {
    const modalOverlay = document.querySelector('#toolary-modal-overlay');
    if (modalOverlay) {
      // Override the remove method to show coffee message
      const originalRemove = modalOverlay.remove;
      modalOverlay.remove = function() {
        originalRemove.call(this);
        showCoffeeMessageForTool('link-picker');
      };
      
      // Also override the dismiss button click
      const dismissBtn = modalOverlay.querySelector('button[type="button"]');
      if (dismissBtn) {
        const originalClick = dismissBtn.onclick;
        dismissBtn.onclick = function(e) {
          if (originalClick) originalClick.call(this, e);
          showCoffeeMessageForTool('link-picker');
        };
      }
    }
  }, 100);
  deactivateCb();
  return true;
}

// Enhanced mouse up handler with comprehensive link analysis and error handling
async function onUp() {
  try {
    if (!isSelecting) return;

    const rect = box ? box.getBoundingClientRect() : null;
    finalizeSelection();
    const allLinks = safeExecute(() => [...document.querySelectorAll('a')], 'querySelectorAll links') || [];
    const selectedLinks = rect ? allLinks.filter(link => {
      try {
        const linkRect = link.getBoundingClientRect();
        return linkRect.left < rect.right &&
               linkRect.right > rect.left &&
               linkRect.top < rect.bottom &&
               linkRect.bottom > rect.top;
      } catch (error) {
        handleError(error, 'link rect calculation');
        return false;
      }
    }) : [];

    await analyzeLinks(selectedLinks, 'the selected area');

  } catch (error) {
    handleError(error, 'linkPicker onUp');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToExtractLinks') : 'Failed to extract links. Please try again.';
    showError(errorMessage);
    deactivateCb();
  }
}

// Keyboard navigation with enhanced error handling
async function onKeyDown(e) {
  try {
    const isSelectAll = (e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey);

    if (isSelectAll) {
      e.preventDefault();
      try {
        document.execCommand('selectAll');
      } catch {
        // ignore if execCommand fails
      }

      finalizeSelection();
      const allLinks = safeExecute(() => [...document.querySelectorAll('a')], 'querySelectorAll links') || [];
      await analyzeLinks(allLinks, 'the entire page');
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      finalizeSelection();
      deactivateCb();
    }
  } catch (error) {
    handleError(error, 'onKeyDown');
  }
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  
  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    document.body.style.cursor = 'crosshair';
    
    // Add event listeners with cleanup tracking
    const cleanupMouseDown = addEventListenerWithCleanup(document, 'mousedown', onMouseDown, true);
    const cleanupKeydown = addEventListenerWithCleanup(document, 'keydown', onKeyDown, true);
    
    cleanupFunctions.push(cleanupMouseDown, cleanupKeydown);
    
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('dragToSelectLinks') : 'Drag to select links • Release to extract • Ctrl/Cmd+A for all links • Esc to cancel';
    showInfo(infoMessage, 3000);
    
  } catch (error) {
    handleError(error, 'linkPicker activation');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateLinkPicker') : 'Failed to activate link picker. Please try again.';
    showError(errorMessage);
    deactivate();
  }
}

export function deactivate() {
  try {
    finalizeSelection();
    document.body.style.cursor = '';
    
  } catch (error) {
    handleError(error, 'linkPicker deactivation');
  }
}
