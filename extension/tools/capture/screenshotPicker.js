import { addEventListenerWithCleanup, showError, showSuccess, handleError } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'screenshot-picker',
  name: 'Screenshot Picker',
  category: 'capture',
  icon: 'screenshot',
  permissions: ['activeTab'],
  tags: ['screenshot', 'capture'],
  keywords: ['full page', 'capture', 'screenshot', 'image']
};

const CAPTURE_DELAY_MS = 120;
const MIN_CAPTURE_INTERVAL_MS = 650;
const MAX_CAPTURE_RETRIES = 3;
const MAX_SEGMENTS = 60;
const POST_CAPTURE_PANEL_ID = 'toolary-screenshot-actions';
const POST_CAPTURE_PANEL_DURATION_MS = 12000;
let isCapturing = false;
let activeCaptureSession = null;
let sessionCounter = 0;
let stickyVisibilityStyleTag = null;
const hiddenStickyElements = new Map();
let postCaptureCleanupFns = [];
let postCaptureHideTimer = null;
let postCapturePanel = null;

class CaptureCancelledError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaptureCancelledError';
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function getFilename(url) {
  if (!url) {
    return `toolary-screenshot-${Date.now()}.png`;
  }

  try {
    const { hostname, pathname } = new URL(url);
    const slug = `${hostname}${pathname}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/(^-|-$)/g, '')
      .toLowerCase();
    return `toolary-screencap-${slug || 'page'}-${Date.now()}.png`;
  } catch {
    return `toolary-screenshot-${Date.now()}.png`;
  }
}

function getMessage(key, fallback, substitutions = undefined) {
  try {
    if (chrome?.i18n?.getMessage) {
      const localized = chrome.i18n.getMessage(key, substitutions);
      if (localized) return localized;
    }
  } catch {
    // Ignore i18n errors and use fallback
  }
  return fallback;
}

function clearPostCapturePanel() {
  if (postCaptureHideTimer) {
    clearTimeout(postCaptureHideTimer);
    postCaptureHideTimer = null;
  }

  postCaptureCleanupFns.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      handleError(error, 'screenshotPicker.postCaptureCleanup');
    }
  });
  postCaptureCleanupFns = [];

  if (postCapturePanel?.parentNode) {
    postCapturePanel.remove();
  }
  postCapturePanel = null;
}

function clearToolToasts() {
  document.querySelectorAll('#toolary-toast, .toolary-coffee-toast').forEach((toast) => toast.remove());
}

function ensureSessionActive(session) {
  if (!session || session.cancelled || activeCaptureSession?.id !== session.id) {
    throw new CaptureCancelledError(getMessage('screenshotCaptureCancelled', 'Screenshot capture was cancelled.'));
  }
}

function downloadScreenshot(dataUrl, filename) {
  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    handleError(error, 'downloadScreenshot');
    const errorMessage = getMessage('screenshotDownloadFailed', 'Screenshot captured but download failed.');
    showError(errorMessage);
  }
}

function isScrollableY(element) {
  if (!element || typeof globalThis.Element !== 'function' || !(element instanceof globalThis.Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  return canScroll && element.scrollHeight - element.clientHeight > 40;
}

function getScrollContext() {
  const doc = document.documentElement;
  const scrollingElement = document.scrollingElement || doc;
  const docScrollable = (scrollingElement.scrollHeight - window.innerHeight) > 40;

  if (docScrollable) {
    return {
      type: 'window',
      getScrollTop: () => window.scrollY || scrollingElement.scrollTop || 0,
      setScrollTop: (value) => window.scrollTo(0, value),
      getViewportHeight: () => window.innerHeight || doc.clientHeight || 0,
      getTotalHeight: () => Math.max(
        document.body?.scrollHeight ?? 0,
        doc?.scrollHeight ?? 0,
        document.body?.offsetHeight ?? 0,
        doc?.offsetHeight ?? 0,
        doc?.clientHeight ?? 0
      )
    };
  }

  let best = null;
  let bestScore = 0;
  const candidates = document.querySelectorAll('main, [role="main"], section, div, article');
  candidates.forEach((element) => {
    if (!isScrollableY(element)) return;
    const rect = element.getBoundingClientRect();
    if (rect.height < 240 || rect.width < 240) return;
    const scrollRange = element.scrollHeight - element.clientHeight;
    const viewportCoverage = Math.min(rect.height / Math.max(window.innerHeight, 1), 1);
    const score = scrollRange * viewportCoverage;
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  });

  if (!best) {
    return {
      type: 'window',
      getScrollTop: () => window.scrollY || scrollingElement.scrollTop || 0,
      setScrollTop: (value) => window.scrollTo(0, value),
      getViewportHeight: () => window.innerHeight || doc.clientHeight || 0,
      getTotalHeight: () => Math.max(
        document.body?.scrollHeight ?? 0,
        doc?.scrollHeight ?? 0,
        document.body?.offsetHeight ?? 0,
        doc?.offsetHeight ?? 0,
        doc?.clientHeight ?? 0
      )
    };
  }

  return {
    type: 'element',
    element: best,
    getScrollTop: () => best.scrollTop || 0,
    setScrollTop: (value) => {
      best.scrollTop = value;
    },
    getViewportHeight: () => best.clientHeight || window.innerHeight || doc.clientHeight || 0,
    getTotalHeight: () => best.scrollHeight || 0
  };
}

function findStickyElements() {
  const stickyElements = [];
  const likelyCandidates = new Set();

  const candidateSelectors = [
    'header',
    'nav',
    '[role="banner"]',
    '[role="navigation"]',
    '[style*="position:fixed"]',
    '[style*="position: fixed"]',
    '[style*="position:sticky"]',
    '[style*="position: sticky"]',
    '[class*="sticky"]',
    '[class*="fixed"]',
    '[id*="sticky"]',
    '[id*="fixed"]'
  ];

  candidateSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => likelyCandidates.add(element));
  });

  Array.from(document.body?.children || []).forEach((element) => likelyCandidates.add(element));

  let shouldFallbackToFullScan = likelyCandidates.size === 0;

  if (shouldFallbackToFullScan) {
    const allElements = document.querySelectorAll('*');
    allElements.forEach((element) => likelyCandidates.add(element));
  }

  likelyCandidates.forEach((element) => {
    if (typeof globalThis.HTMLElement !== 'undefined' && !(element instanceof globalThis.HTMLElement)) return;
    if (
      element.id?.startsWith('toolary-') ||
      element.className?.toString?.().includes('toolary-') ||
      element.closest?.('[id^="toolary-"], [class*="toolary-"]')
    ) {
      return;
    }

    const computedStyle = window.getComputedStyle(element);
    const position = computedStyle.position;
    if (position !== 'fixed' && position !== 'sticky') return;

    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    if (visible) {
      stickyElements.push(element);
    }
  });

  return stickyElements;
}

function hideStickyElements() {
  const stickyElements = findStickyElements();
  if (!stickyElements.length) {
    return 0;
  }

  let newlyHiddenCount = 0;

  stickyElements.forEach((element) => {
    if (hiddenStickyElements.has(element)) return;
    const originalVisibility = element.style.visibility;
    hiddenStickyElements.set(element, { visibility: originalVisibility });

    element.style.setProperty('visibility', 'hidden', 'important');
    newlyHiddenCount += 1;
  });

  if (!stickyVisibilityStyleTag) {
    stickyVisibilityStyleTag = document.createElement('style');
    stickyVisibilityStyleTag.id = 'toolary-screenshot-hide-sticky-style';
    stickyVisibilityStyleTag.textContent = `
      [data-toolary-capture-hidden="true"] {
        visibility: hidden !important;
      }
    `;
    document.head?.appendChild(stickyVisibilityStyleTag);
  }

  stickyElements.forEach((element) => {
    element.setAttribute('data-toolary-capture-hidden', 'true');
  });

  return newlyHiddenCount;
}

function restoreStickyElements() {
  hiddenStickyElements.forEach(({ visibility }, element) => {
    // Restore original styles
    if (visibility) {
      element.style.visibility = visibility;
    } else {
      element.style.removeProperty('visibility');
    }

    element.removeAttribute('data-toolary-capture-hidden');
  });

  if (stickyVisibilityStyleTag?.parentNode) {
    stickyVisibilityStyleTag.remove();
  }
  stickyVisibilityStyleTag = null;

  hiddenStickyElements.clear();
}

function requestCapture() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.success || !response?.dataUrl) {
          reject(new Error(response?.error || getMessage('screenshotFailedVisibleTab', 'Failed to capture visible tab.')));
          return;
        }

        resolve(response.dataUrl);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(getMessage('screenshotFailedLoadImage', 'Failed to load captured image.')));
    img.src = dataUrl;
  });
}

async function requestCaptureWithThrottle(lastCaptureAt, session, attempt = 0) {
  ensureSessionActive(session);

  const elapsed = Date.now() - lastCaptureAt.value;
  if (elapsed < MIN_CAPTURE_INTERVAL_MS) {
    await wait(MIN_CAPTURE_INTERVAL_MS - elapsed);
  }

  try {
    ensureSessionActive(session);
    const dataUrl = await requestCapture();
    lastCaptureAt.value = Date.now();
    return dataUrl;
  } catch (error) {
    ensureSessionActive(session);
    if (
      attempt < MAX_CAPTURE_RETRIES &&
      typeof error.message === 'string' &&
      error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')
    ) {
      await wait(MIN_CAPTURE_INTERVAL_MS + 200);
      return requestCaptureWithThrottle(lastCaptureAt, session, attempt + 1);
    }
    throw error;
  }
}

async function stabilizeStickyElements(session) {
  let stableRounds = 0;
  for (let round = 0; round < 6; round += 1) {
    ensureSessionActive(session);
    const hiddenCount = hideStickyElements();
    if (hiddenCount === 0) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    await waitForNextFrame();
    await wait(40);

    if (stableRounds >= 2) {
      break;
    }
  }
}

function getImagePixelData(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || typeof context.getImageData !== 'function') return null;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

function getSampledRowDiff(dataA, dataB, width, rowA, rowB, xStart, xEnd, step = 8) {
  let total = 0;
  let count = 0;
  const clampedStart = Math.max(0, xStart);
  const clampedEnd = Math.min(width - 1, xEnd);

  for (let x = clampedStart; x <= clampedEnd; x += step) {
    const idxA = (rowA * width + x) * 4;
    const idxB = (rowB * width + x) * 4;
    total += Math.abs(dataA[idxA] - dataB[idxB]);
    total += Math.abs(dataA[idxA + 1] - dataB[idxB + 1]);
    total += Math.abs(dataA[idxA + 2] - dataB[idxB + 2]);
    count += 3;
  }

  if (count === 0) return 255;
  return total / count;
}

function detectRepeatedTopRows(prevImage, currImage, prevData, currData) {
  if (!prevData || !currData || prevImage.width !== currImage.width) {
    return 0;
  }

  const width = currImage.width;
  const height = Math.min(prevImage.height, currImage.height);
  const maxRows = Math.min(Math.floor(height * 0.42), 420);
  const xStart = Math.floor(width * 0.2);
  const xEnd = Math.floor(width * 0.8);

  let repeatedTop = 0;
  let mismatchRun = 0;

  for (let y = 0; y < maxRows; y += 2) {
    const diff = getSampledRowDiff(prevData, currData, width, y, y, xStart, xEnd, 8);
    if (diff < 6) {
      repeatedTop = y + 2;
      mismatchRun = 0;
      continue;
    }

    mismatchRun += 1;
    if (mismatchRun >= 4) {
      break;
    }
  }

  return repeatedTop;
}

async function stitchCaptures(segments, totalHeight, devicePixelRatio) {
  if (!segments.length) {
    throw new Error(getMessage('screenshotNoCaptureData', 'No capture data to stitch.'));
  }

  const images = await Promise.all(segments.map((segment) => loadImage(segment.dataUrl)));
  const imagePixelData = images.map((image) => getImagePixelData(image));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(getMessage('screenshotFailedCanvasContext', 'Canvas rendering context unavailable.'));
  }

  const width = images[0].width;
  const height = Math.round(totalHeight * devicePixelRatio);

  canvas.width = width;
  canvas.height = height;
  if (typeof context.clearRect === 'function') {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  let lastScrollY = -1;
  let lastDrawEnd = 0;
  images.forEach((image, index) => {
    const segment = segments[index];
    if (!segment) return;

    const scrollY = Math.round(segment.scrollY * devicePixelRatio);
    if (lastScrollY >= 0 && scrollY <= lastScrollY + 1) {
      return;
    }

    let cropTop = 0;
    if (index > 0 && segments[index - 1]) {
      const scrollDelta = Math.max(0, Math.round((segment.scrollY - segments[index - 1].scrollY) * devicePixelRatio));
      const repeatedTop = detectRepeatedTopRows(
        images[index - 1],
        image,
        imagePixelData[index - 1],
        imagePixelData[index]
      );

      const safeMaxCrop = Math.min(
        Math.floor(image.height * 0.45),
        scrollDelta > 2 ? scrollDelta - 2 : Math.floor(image.height * 0.32)
      );

      if (repeatedTop > 12 && safeMaxCrop > 0) {
        cropTop = Math.min(repeatedTop, safeMaxCrop);
      }
    }

    let sourceY = cropTop;
    let destY = scrollY;

    if (destY > lastDrawEnd) {
      // Prevent tiny seams from rounding/subpixel drift.
      destY = lastDrawEnd;
    } else if (destY < lastDrawEnd) {
      const overlapPx = lastDrawEnd - destY;
      sourceY += overlapPx;
      destY = lastDrawEnd;
    }

    const sourceHeight = image.height - sourceY;
    if (sourceHeight <= 4) return;

    context.drawImage(
      image,
      0,
      sourceY,
      image.width,
      sourceHeight,
      0,
      destY,
      image.width,
      sourceHeight
    );

    lastScrollY = scrollY;
    lastDrawEnd = destY + sourceHeight;
  });

  const stitchedDataUrl = canvas.toDataURL('image/png');
  const filename = getFilename(window.location.href);
  downloadScreenshot(stitchedDataUrl, filename);

  return { stitchedDataUrl, filename };
}

async function copyImageToClipboard(dataUrl) {
  if (!navigator?.clipboard?.write || typeof globalThis.ClipboardItem === 'undefined') {
    const error = new Error(getMessage('screenshotCopyUnavailable', 'Clipboard image copy is not supported in this browser.'));
    error.code = 'CLIPBOARD_IMAGE_UNAVAILABLE';
    throw error;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
  const clipboardItem = new globalThis.ClipboardItem({ 'image/png': pngBlob });
  await navigator.clipboard.write([clipboardItem]);
}

function showPostCaptureActions({ dataUrl, onClose, autoCopyState = 'unknown' }) {
  clearPostCapturePanel();

  const panel = document.createElement('aside');
  panel.id = POST_CAPTURE_PANEL_ID;
  panel.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 20px;
    z-index: 2147483646;
    width: min(320px, calc(100vw - 32px));
    background: var(--toolary-bg, #ffffff);
    color: var(--toolary-text, #1f2937);
    border: 1px solid var(--toolary-border, #d1d5db);
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  const title = document.createElement('div');
  title.textContent = autoCopyState === 'success'
    ? getMessage('screenshotDownloadedAndCopied', 'Screenshot downloaded and copied to clipboard.')
    : getMessage('screenshotReadyForCopy', 'Screenshot downloaded. You can also copy it.');
  title.style.cssText = 'font-size: 13px; line-height: 1.4; font-weight: 600; color: var(--toolary-text, #1f2937);';
  panel.appendChild(title);

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 8px; align-items: center;';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = autoCopyState === 'success'
    ? getMessage('screenshotCopyAgainButton', 'Copy Again')
    : getMessage('screenshotCopyButton', 'Copy Image');
  copyButton.style.cssText = `
    border: 1px solid var(--toolary-border, #d1d5db);
    background: var(--toolary-button-bg, #f8fafc);
    color: var(--toolary-text, #1f2937);
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  `;

  const dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.textContent = getMessage('dismiss', 'Dismiss');
  dismissButton.style.cssText = `
    border: 1px solid transparent;
    background: transparent;
    color: var(--toolary-text, #1f2937);
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 12px;
  `;

  const status = document.createElement('div');
  status.style.cssText = 'font-size: 12px; color: var(--toolary-secondary-text, #4b5563); min-height: 16px;';
  if (autoCopyState === 'success') {
    status.textContent = getMessage('screenshotCopiedToClipboard', 'Screenshot copied to clipboard.');
  } else if (autoCopyState === 'failed') {
    status.textContent = getMessage('screenshotAutoCopyFailed', 'Auto-copy failed. You can try the button.');
  } else if (autoCopyState === 'unavailable') {
    status.textContent = getMessage('screenshotCopyUnavailable', 'Clipboard image copy is not supported in this browser.');
  } else {
    status.textContent = getMessage('screenshotCopyHint', 'Copy is useful when pasting directly into chat or docs.');
  }

  actions.appendChild(copyButton);
  actions.appendChild(dismissButton);
  panel.appendChild(actions);
  panel.appendChild(status);
  document.body.appendChild(panel);
  postCapturePanel = panel;

  const onCopyClick = async () => {
    copyButton.disabled = true;
    copyButton.style.opacity = '0.7';
    status.textContent = getMessage('screenshotCopying', 'Copying image...');
    try {
      await copyImageToClipboard(dataUrl);
      status.textContent = getMessage('screenshotCopiedToClipboard', 'Screenshot copied to clipboard.');
      showSuccess(getMessage('screenshotCopiedToClipboard', 'Screenshot copied to clipboard.'));
    } catch (error) {
      handleError(error, 'screenshotPicker.copyImageToClipboard');
      const message = getMessage('screenshotCopyFailed', 'Could not copy screenshot to clipboard.');
      status.textContent = message;
      showError(message);
    } finally {
      copyButton.disabled = false;
      copyButton.style.opacity = '1';
    }
  };

  const onDismiss = () => {
    clearPostCapturePanel();
    onClose?.();
  };

  postCaptureCleanupFns.push(
    addEventListenerWithCleanup(copyButton, 'click', onCopyClick),
    addEventListenerWithCleanup(dismissButton, 'click', onDismiss)
  );

  postCaptureHideTimer = window.setTimeout(() => {
    clearPostCapturePanel();
    onClose?.();
  }, POST_CAPTURE_PANEL_DURATION_MS);
}

function finalizeSession(session, { invokeDeactivate = false } = {}) {
  if (!session || session.finalized) return;
  session.finalized = true;

  if (activeCaptureSession?.id === session.id) {
    activeCaptureSession = null;
  }

  if (invokeDeactivate && typeof session.deactivateFn === 'function' && !session.externalDeactivated) {
    session.deactivateFn();
  }
}

async function captureFullPage(session) {
  let scrollContext = getScrollContext();
  let totalHeight = scrollContext.getTotalHeight();
  let viewportHeight = scrollContext.getViewportHeight();

  if (totalHeight === 0 || viewportHeight === 0) {
    throw new Error(getMessage('screenshotUnableDimensions', 'Unable to determine page dimensions.'));
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  let maxScrollTop = Math.max(totalHeight - viewportHeight, 0);
  const originalWindowScrollX = window.scrollX;
  const originalWindowScrollY = window.scrollY;
  const originalContextScrollTop = scrollContext.getScrollTop();

  const segments = [];
  let currentScroll = 0;
  let iterations = 0;

  const lastCaptureAt = { value: Date.now() - MIN_CAPTURE_INTERVAL_MS };

  clearToolToasts();

  try {
    scrollContext.setScrollTop(0);
    await waitForNextFrame();
    await wait(90);

    while (true) {
      ensureSessionActive(session);
      const targetScroll = Math.min(currentScroll, maxScrollTop);
      scrollContext.setScrollTop(targetScroll);

      await waitForNextFrame();
      if (CAPTURE_DELAY_MS > 0) {
        await wait(CAPTURE_DELAY_MS);
      }

      const effectiveScrollTop = scrollContext.getScrollTop();
      if (Math.abs(effectiveScrollTop - targetScroll) > 4) {
        scrollContext.setScrollTop(targetScroll);
        await waitForNextFrame();
      }

      const isFirstSegment = segments.length === 0;
      if (!isFirstSegment) {
        const hiddenCount = hideStickyElements();
        if (hiddenCount > 0) {
          await wait(70);
        }
        hideStickyElements();
      }

      clearToolToasts();

      const dataUrl = await requestCaptureWithThrottle(lastCaptureAt, session);
      const actualScrollY = scrollContext.getScrollTop();
      segments.push({ dataUrl, scrollY: actualScrollY });

      if (segments.length === 1) {
        // Keep the first viewport "natural"; then prepare a clean canvas for remaining segments.
        await stabilizeStickyElements(session);
      }

      if (targetScroll >= maxScrollTop) {
        break;
      }

      if (segments.length > 1) {
        const prevScroll = segments[segments.length - 2].scrollY;
        const progressed = actualScrollY - prevScroll;
        const expectedProgress = Math.max(16, viewportHeight * 0.12);

        if (progressed < expectedProgress) {
          const refreshed = getScrollContext();
          scrollContext = refreshed;
          totalHeight = scrollContext.getTotalHeight();
          viewportHeight = scrollContext.getViewportHeight();
          maxScrollTop = Math.max(totalHeight - viewportHeight, 0);
        }
      }

      currentScroll = Math.max(actualScrollY + viewportHeight, targetScroll + viewportHeight);
      iterations += 1;

      if (iterations > MAX_SEGMENTS) {
        throw new Error(getMessage('screenshotPageTooTall', 'Page is too tall to capture completely.'));
      }
    }
  } finally {
    // Always restore sticky elements and scroll position
    scrollContext.setScrollTop(originalContextScrollTop);
    window.scrollTo(originalWindowScrollX, originalWindowScrollY);
    restoreStickyElements();
  }

  return stitchCaptures(segments, totalHeight, devicePixelRatio);
}

export async function activate(deactivate) {
  if (isCapturing) {
    return;
  }

  clearPostCapturePanel();
  isCapturing = true;
  const session = {
    id: ++sessionCounter,
    cancelled: false,
    finalized: false,
    externalDeactivated: false,
    deactivateFn: deactivate
  };
  activeCaptureSession = session;

  try {
    const { stitchedDataUrl } = await captureFullPage(session);
    ensureSessionActive(session);

    showCoffeeMessageForTool('screenshot-picker');

    let autoCopyState = 'unknown';
    try {
      await copyImageToClipboard(stitchedDataUrl);
      autoCopyState = 'success';
      showSuccess(getMessage('screenshotCopiedToClipboard', 'Screenshot copied to clipboard.'));
    } catch (error) {
      handleError(error, 'screenshotPicker.autoCopy');
      autoCopyState = error?.code === 'CLIPBOARD_IMAGE_UNAVAILABLE'
        ? 'unavailable'
        : 'failed';
    }

    showPostCaptureActions({
      dataUrl: stitchedDataUrl,
      autoCopyState,
      onClose: () => finalizeSession(session, { invokeDeactivate: true })
    });
  } catch (error) {
    if (error instanceof CaptureCancelledError) {
      return;
    }
    handleError(error, 'screenshotPicker.capture');
    const errorMessage = getMessage('failedToCaptureScreenshot', 'Failed to capture screenshot.');
    showError(errorMessage);
    finalizeSession(session, { invokeDeactivate: true });
  } finally {
    isCapturing = false;
    if (session.cancelled) {
      finalizeSession(session, { invokeDeactivate: false });
    }
  }
}

export function deactivate() {
  if (activeCaptureSession && !activeCaptureSession.finalized) {
    activeCaptureSession.cancelled = true;
    activeCaptureSession.externalDeactivated = true;
  }
  activeCaptureSession = null;
  clearPostCapturePanel();
  isCapturing = false;
}
