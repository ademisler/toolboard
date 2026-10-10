import {
  createOverlay,
  removeOverlay,
  copyText,
  showError,
  showSuccess,
  showInfo,
  throttle,
  handleError,
  safeExecute,
  sanitizeInput,
  addEventListenerWithCleanup,
  renderIcon,
  t,
  ensureLanguageLoaded
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'media-picker',
  name: 'Media Download',
  category: 'capture',
  icon: 'image',
  permissions: ['activeTab', 'downloads'],
  tags: ['media', 'image', 'video'],
  keywords: ['images', 'videos', 'download', 'assets']
};

const HIGHLIGHT_COLOR_IMAGE = 'rgba(76, 175, 80, 0.25)';
const HIGHLIGHT_BORDER_IMAGE = '#4caf50';
const HIGHLIGHT_COLOR_VIDEO = 'rgba(33, 150, 243, 0.25)';
const HIGHLIGHT_BORDER_VIDEO = '#2196f3';
const RESOURCE_ENTRY_MAX_AGE = 5 * 60 * 1000; // Inspect last 5 minutes of requests

let overlay;
let deactivateCb;
let currentMedia = null;
let cleanupFunctions = [];

const throttledOnMove = throttle((event) => {
  try {
    const pointerTarget = event.target instanceof Element
      ? event.target
      : (typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(event.clientX ?? 0, event.clientY ?? 0)
        : null);

    const media = findMediaElement(pointerTarget);
    if (!media) {
      if (overlay) overlay.style.display = 'none';
      currentMedia = null;
      return;
    }

    currentMedia = media;
    const rect = media.getBoundingClientRect();
    if (overlay) {
      overlay.style.display = 'block';
      overlay.style.top = rect.top + window.scrollY + 'px';
      overlay.style.left = rect.left + window.scrollX + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.backgroundColor = media.tagName.toLowerCase() === 'video'
        ? HIGHLIGHT_COLOR_VIDEO
        : HIGHLIGHT_COLOR_IMAGE;
      overlay.style.borderColor = media.tagName.toLowerCase() === 'video'
        ? HIGHLIGHT_BORDER_VIDEO
        : HIGHLIGHT_BORDER_IMAGE;
    }
  } catch (error) {
    console.debug('Media picker move handler error:', error);
  }
}, 16);

function findMediaElement(target) {
  return target?.closest('img, video') || null;
}

function getExtensionFromUrl(url, fallback = '') {
  if (!url) return fallback;
  try {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const ext = cleanUrl.substring(cleanUrl.lastIndexOf('.') + 1).toLowerCase();
    if (!ext || ext === 'blob' || ext.length > 5) return fallback;
    return ext;
  } catch {
    return fallback;
  }
}

const MEDIA_URL_PATTERN = /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8|mpd)(\?|#|$)/i;
const MEDIA_URL_TEXT_PATTERN = /(https?:\/\/[^\s"'<>]+?(?:\.(?:mp4|webm|ogg|ogv|mov|m4v|m3u8|mpd)|\/video\/[^\s"'<>]+)(?:\?[^\s"'<>]*)?)/gi;

function looksLikeMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (MEDIA_URL_PATTERN.test(url)) return true;
  const lowered = url.toLowerCase();
  return lowered.includes('videoplayback') || lowered.includes('/video/') || lowered.includes('reel') || lowered.includes('mp4');
}

function normalizeHttpUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return null;
  }

  try {
    const resolved = new URL(trimmed, window.location.href);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return resolved.toString();
    }
  } catch {
    // Ignore invalid URLs
  }

  return null;
}

function extractUrlsFromJsonLd(node, addUrl) {
  if (!node) return;

  if (typeof node === 'string') {
    if (looksLikeMediaUrl(node)) {
      addUrl(node);
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(item => extractUrlsFromJsonLd(item, addUrl));
    return;
  }

  if (typeof node === 'object') {
    Object.entries(node).forEach(([key, value]) => {
      if (typeof value === 'string') {
        if (looksLikeMediaUrl(value) || /url$/i.test(key) || key === 'contentUrl' || key === 'embedUrl') {
          addUrl(value);
        }
      } else if (typeof value === 'object') {
        extractUrlsFromJsonLd(value, addUrl);
      }
    });
  }
}

function extractUrlsFromText(text, addUrl) {
  if (!text || typeof text !== 'string') return;

  let match;
  const limit = Math.min(text.length, 2_000_000); // Safety cap
  const scoped = text.slice(0, limit);
  MEDIA_URL_TEXT_PATTERN.lastIndex = 0;
  while ((match = MEDIA_URL_TEXT_PATTERN.exec(scoped)) !== null) {
    addUrl(match[1]);
  }
}

function discoverAlternateVideoUrls(video) {
  const urls = new Set();

  const addPotentialUrl = (value) => {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return;
    if (!looksLikeMediaUrl(normalized)) return;
    urls.add(normalized);
  };

  const candidateAttributes = [
    'src',
    'data-src',
    'data-url',
    'data-video',
    'data-video-url',
    'data-href',
    'data-mp4',
    'data-webm',
    'poster'
  ];

  candidateAttributes.forEach(attr => addPotentialUrl(video.getAttribute(attr)));
  Object.values(video.dataset || {}).forEach(addPotentialUrl);

  Array.from(video.querySelectorAll('source')).forEach(source => {
    candidateAttributes.forEach(attr => addPotentialUrl(source.getAttribute(attr)));
    addPotentialUrl(source.src);
  });

  let ancestor = video.parentElement;
  let depth = 0;
  while (ancestor && depth < 3) {
    candidateAttributes.forEach(attr => addPotentialUrl(ancestor.getAttribute(attr)));
    Object.values(ancestor.dataset || {}).forEach(addPotentialUrl);
    ancestor = ancestor.parentElement;
    depth += 1;
  }

  document.querySelectorAll("link[rel='preload'][as='video'], link[rel='preload'][as='media']").forEach(link => {
    addPotentialUrl(link.getAttribute('href'));
  });

  document.querySelectorAll("meta[property='og:video'], meta[property='og:video:url'], meta[property='og:video:secure_url'], meta[property='twitter:player:stream']").forEach(meta => {
    addPotentialUrl(meta.getAttribute('content'));
  });

  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      extractUrlsFromJsonLd(data, addPotentialUrl);
    } catch {
      // Ignore invalid JSON
    }
  });

  const jsonScripts = document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__');
  jsonScripts.forEach(script => {
    const raw = script.textContent;
    if (!raw) return;

    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const data = JSON.parse(trimmed);
        extractUrlsFromJsonLd(data, addPotentialUrl);
      } catch {
        // Fall back to regex-based extraction
        extractUrlsFromText(trimmed, addPotentialUrl);
      }
    }
  });

  document.querySelectorAll('script:not([type]), script[type="text/javascript"]').forEach(script => {
    if (!script.textContent) return;
    const text = script.textContent;
    if (!/video_url|mp4|reel|instagram/i.test(text)) return;
    extractUrlsFromText(text, addPotentialUrl);
  });

  if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    const now = performance.now();
    const entries = performance.getEntriesByType('resource');
    entries.forEach(entry => {
      if (!entry || typeof entry.name !== 'string') return;
      if (entry.responseEnd && now - entry.responseEnd > RESOURCE_ENTRY_MAX_AGE) return;
      if (entry.initiatorType === 'video' || entry.initiatorType === 'media' || looksLikeMediaUrl(entry.name)) {
        addPotentialUrl(entry.name);
      }
    });
  }

  return Array.from(urls).slice(0, 8);
}

function createFilename(type, extension = 'bin') {
  const host = sanitizeInput(window.location.hostname || 'page');
  const safeExt = extension || (type === 'video' ? 'mp4' : 'png');
  return `toolary-${type}-${host}-${Date.now()}.${safeExt}`;
}

function collectImageInfo(img) {
  const primaryUrl = img.currentSrc || img.src || extractSrcFromSrcset(img.srcset);
  const normalizedPrimary = normalizeHttpUrl(primaryUrl) || primaryUrl;
  const extension = getExtensionFromUrl(normalizedPrimary || primaryUrl, 'png');

  return {
    type: 'image',
    element: img,
    url: normalizedPrimary || primaryUrl,
    streamUrl: primaryUrl,
    alternateUrls: [],
    width: safeExecute(() => img.naturalWidth || img.width, 'img naturalWidth') || 0,
    height: safeExecute(() => img.naturalHeight || img.height, 'img naturalHeight') || 0,
    displayWidth: img.clientWidth,
    displayHeight: img.clientHeight,
    alt: sanitizeInput(img.alt || ''),
    title: sanitizeInput(img.title || ''),
    srcset: sanitizeInput(img.srcset || ''),
    sizes: sanitizeInput(img.getAttribute('sizes') || ''),
    isLazy: img.loading === 'lazy',
    filename: createFilename('image', extension),
    extension
  };
}

function extractSrcFromSrcset(srcset) {
  if (!srcset) return '';
  const first = srcset.split(',')[0];
  if (!first) return '';
  return first.trim().split(' ')[0];
}

function collectVideoInfo(video) {
  const sources = Array.from(video.querySelectorAll('source')).map(source => ({
    src: source.src || source.getAttribute('src') || '',
    type: source.type || source.getAttribute('type') || ''
  })).filter(source => source.src);

  const rawUrl = video.currentSrc || video.src || sources[0]?.src || '';
  const normalizedRawUrl = normalizeHttpUrl(rawUrl);
  const discoveredAlternates = discoverAlternateVideoUrls(video);
  const candidateUrls = normalizedRawUrl
    ? [normalizedRawUrl, ...discoveredAlternates.filter(url => url !== normalizedRawUrl)]
    : discoveredAlternates.slice();
  const primaryUrl = candidateUrls[0] || rawUrl;
  const alternateUrls = candidateUrls.slice(1);
  const extension = getExtensionFromUrl(primaryUrl || rawUrl, 'mp4');
  const fallbackApplied = !normalizedRawUrl && discoveredAlternates.length > 0;

  return {
    type: 'video',
    element: video,
    url: primaryUrl,
    streamUrl: rawUrl,
    alternateUrls,
    fallbackApplied,
    poster: sanitizeInput(video.poster || ''),
    width: video.videoWidth || video.clientWidth || 0,
    height: video.videoHeight || video.clientHeight || 0,
    displayWidth: video.clientWidth,
    displayHeight: video.clientHeight,
    duration: Number.isFinite(video.duration) ? video.duration : null,
    muted: video.muted,
    loop: video.loop,
    autoplay: video.autoplay,
    controls: video.controls,
    sources,
    filename: createFilename('video', extension),
    extension
  };
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unknown';
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildDetails(info) {
  const details = [];

  const typeLabel = chrome.i18n ? chrome.i18n.getMessage('typeLabel') : 'Type';
  const videoLabel = chrome.i18n ? chrome.i18n.getMessage('videoLabel') : 'Video';
  const imageLabel = chrome.i18n ? chrome.i18n.getMessage('imageLabel') : 'Image';
  const primaryUrlLabel = chrome.i18n ? chrome.i18n.getMessage('primaryUrlLabel') : 'Primary URL';
  const streamUrlLabel = chrome.i18n ? chrome.i18n.getMessage('streamUrlLabel') : 'Stream URL';
  const urlLabel = chrome.i18n ? chrome.i18n.getMessage('urlLabel') : 'URL';
  const unavailableLabel = chrome.i18n ? chrome.i18n.getMessage('unavailableLabel') : 'Unavailable';
  const extraSourcesLabel = chrome.i18n ? chrome.i18n.getMessage('additionalSources') : 'Extra sources';

  details.push({ label: typeLabel, value: info.type === 'video' ? videoLabel : imageLabel });

  if (info.type === 'video') {
    details.push({ label: primaryUrlLabel, value: info.url ? sanitizeInput(info.url) : unavailableLabel });

    if (info.streamUrl && info.streamUrl !== info.url) {
      details.push({ label: streamUrlLabel, value: sanitizeInput(info.streamUrl) });
    }

    if (Array.isArray(info.alternateUrls) && info.alternateUrls.length) {
      details.push({
        label: extraSourcesLabel,
        value: info.alternateUrls.map((url) => sanitizeInput(url)).join('\n')
      });
    }
  } else {
    details.push({ label: urlLabel, value: info.url ? sanitizeInput(info.url) : unavailableLabel });
  }

  if (info.type === 'image') {
    details.push({ label: 'Natural size', value: info.width && info.height ? `${info.width} × ${info.height}` : 'Unknown' });
    details.push({ label: 'Displayed size', value: info.displayWidth && info.displayHeight ? `${info.displayWidth} × ${info.displayHeight}` : 'Unknown' });
    if (info.alt) details.push({ label: 'Alt text', value: info.alt });
    if (info.srcset) details.push({ label: 'Srcset', value: info.srcset });
  } else {
    details.push({ label: 'Resolution', value: info.width && info.height ? `${info.width} × ${info.height}` : 'Unknown' });
    if (info.duration !== null) details.push({ label: 'Duration', value: formatDuration(info.duration) });
    details.push({ label: 'Muted', value: info.muted ? 'Yes' : 'No' });
    details.push({ label: 'Autoplay', value: info.autoplay ? 'Yes' : 'No' });
    details.push({ label: 'Loop', value: info.loop ? 'Yes' : 'No' });
    if (info.sources.length) {
      details.push({
        label: 'Sources',
        value: info.sources
          .map(source => sanitizeInput(`${source.src} (${source.type || 'unknown'})`))
          .join('\n')
      });
    }
  }

  details.push({ label: 'Filename', value: info.filename });
  return details;
}

function showMediaModal(info) {
  try {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: toolary-fade-in 0.25s ease-out;
      pointer-events: none;
    `;
    
    // Create invisible clickable area for overlay
    const overlayClickArea = document.createElement('div');
    overlayClickArea.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: auto;
      background: transparent;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--toolary-bg, #fff);
      border-radius: 14px;
      border: 1px solid var(--toolary-border, #ddd);
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      width: min(520px, 94vw);
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: auto;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--toolary-border, #eee);
      background: var(--toolary-header-bg, #f8f9fa);
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 10px; color: var(--toolary-text, #333);';
    const titleIcon = renderIcon(info.type === 'video' ? 'media' : 'image', { size: 18, decorative: true });
    title.appendChild(titleIcon);
    const titleText = document.createElement('span');
    titleText.textContent = info.type === 'video' ? t('videoLabel', 'Video') : t('imageLabel', 'Image');
    title.appendChild(titleText);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      color: var(--toolary-secondary-text, #666);
      padding: 6px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
    `;
    closeButton.appendChild(renderIcon('close', { size: 18, decorative: true }));
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.background = 'rgba(0,0,0,0.08)';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.background = 'transparent';
    });

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.style.cssText = 'padding: 20px 24px; overflow-y: auto; flex: 1; display: grid; gap: 18px;';

    if (info.url) {
      if (info.type === 'image') {
        const preview = document.createElement('img');
        preview.src = info.url;
        preview.alt = info.alt || 'Media preview';
        preview.style.cssText = 'max-width: 100%; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1);';
        body.appendChild(preview);
      } else {
        const video = document.createElement('video');
        video.style.cssText = 'max-width: 100%; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); background: #000;';
        video.controls = true;
        video.muted = true;
        video.playsInline = true;
        if (info.poster) video.poster = info.poster;
        if (info.streamUrl?.startsWith('blob:')) {
          const warning = document.createElement('div');
          const warningMessage = chrome.i18n ? chrome.i18n.getMessage('blobUrlWarning') : '⚠️ This video uses a blob URL. Download may not be available.';
          warning.textContent = warningMessage;
          warning.style.cssText = 'font-size: 13px; color: var(--toolary-warning-color, #ffa000);';
          body.appendChild(warning);
        }
        const source = document.createElement('source');
        source.src = info.streamUrl || info.url;
        if (info.sources[0]?.type) source.type = info.sources[0].type;
        video.appendChild(source);
        body.appendChild(video);
      }
    }

    if (info.fallbackApplied) {
      const fallbackNote = document.createElement('div');
      fallbackNote.style.cssText = 'font-size: 13px; line-height: 1.5; color: var(--toolary-warning-color, #ff9800);';
      const fallbackMessage = chrome.i18n ? chrome.i18n.getMessage('blobUrlFallbackNote') : 'Primary stream uses a blob URL. A downloadable source was discovered and is used for copy & download actions.';
      fallbackNote.textContent = fallbackMessage;
      body.appendChild(fallbackNote);
    }

    const detailList = document.createElement('dl');
    detailList.style.cssText = 'display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px;';
    buildDetails(info).forEach(({ label, value }) => {
      const dt = document.createElement('dt');
      dt.style.cssText = 'font-weight: 600; color: var(--toolary-text, #333);';
      dt.textContent = label;

      const dd = document.createElement('dd');
      dd.style.cssText = 'margin: 0; color: var(--toolary-secondary-text, #555); white-space: pre-line;';
      dd.textContent = value;

      detailList.appendChild(dt);
      detailList.appendChild(dd);
    });
    body.appendChild(detailList);

    if (info.type === 'video' && Array.isArray(info.alternateUrls) && info.alternateUrls.length) {
      const altWrapper = document.createElement('div');
      altWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; background: rgba(0, 123, 255, 0.06); border: 1px solid rgba(0, 123, 255, 0.15);';

      const altTitle = document.createElement('div');
      altTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--toolary-primary-color, #007bff);';
      const additionalSourcesText = chrome.i18n ? chrome.i18n.getMessage('additionalSources') : 'Additional sources';
      altTitle.textContent = additionalSourcesText;
      altWrapper.appendChild(altTitle);

      const truncateUrl = (url) => {
        if (!url || url.length <= 120) return url;
        return `${url.slice(0, 117)}…`;
      };

      info.alternateUrls.forEach((altUrl) => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.6); border-radius: 8px; padding: 10px;';

        const urlText = document.createElement('div');
        urlText.style.cssText = 'font-size: 12px; word-break: break-all; color: var(--toolary-secondary-text, #555);';
        urlText.textContent = truncateUrl(altUrl);
        row.appendChild(urlText);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px;';

        const copyAltBtn = document.createElement('button');
        copyAltBtn.style.cssText = buttonStyle(true);
        const copyAltIcon = renderIcon('copy', { size: 14, decorative: true });
        copyAltIcon.style.color = '#3a2900';
        copyAltBtn.appendChild(copyAltIcon);
        const copyText = chrome.i18n ? chrome.i18n.getMessage('copy') : 'Copy';
        copyAltBtn.appendChild(Object.assign(document.createElement('span'), { textContent: copyText }));
        copyAltBtn.addEventListener('click', async () => {
          await copyText(altUrl);
          const successMessage = chrome.i18n ? chrome.i18n.getMessage('alternateMediaUrlCopied') : 'Alternate media URL copied.';
          showSuccess(successMessage);
        });

        const downloadAltBtn = document.createElement('button');
        downloadAltBtn.style.cssText = primaryButtonStyle(true);
        downloadAltBtn.appendChild(renderIcon('download', { size: 14, decorative: true }));
        const downloadText = chrome.i18n ? chrome.i18n.getMessage('download') : 'Download';
        downloadAltBtn.appendChild(Object.assign(document.createElement('span'), { textContent: downloadText }));
        downloadAltBtn.addEventListener('click', () => {
          downloadMedia(info, altUrl);
        });

        actions.appendChild(copyAltBtn);
        actions.appendChild(downloadAltBtn);
        row.appendChild(actions);

        altWrapper.appendChild(row);
      });

      body.appendChild(altWrapper);
    }

    const footer = document.createElement('div');
    footer.style.cssText = 'padding: 18px 22px; border-top: 1px solid var(--toolary-border, #eee); display: flex; gap: 10px; justify-content: flex-end; background: var(--toolary-header-bg, #f8f9fa);';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = buttonStyle();
    closeBtn.appendChild(renderIcon('close', { size: 16, decorative: true }));
    const closeText = chrome.i18n ? chrome.i18n.getMessage('close') : 'Close';
    closeBtn.appendChild(Object.assign(document.createElement('span'), { textContent: closeText }));

    const copyBtn = document.createElement('button');
    copyBtn.disabled = !info.url;
    copyBtn.style.cssText = buttonStyle(info.url);
    const copyIcon = renderIcon('copy', { size: 16, decorative: true });
    copyIcon.style.color = '#ffffff';
    copyBtn.appendChild(copyIcon);
    const copyUrlText = chrome.i18n ? chrome.i18n.getMessage('copyUrl') : 'Copy URL';
    const copyUrlUnavailableText = chrome.i18n ? chrome.i18n.getMessage('copyUrlUnavailable') : 'Copy URL (unavailable)';
    copyBtn.appendChild(Object.assign(document.createElement('span'), {
      textContent: info.url ? copyUrlText : copyUrlUnavailableText
    }));

    const downloadBtn = document.createElement('button');
    downloadBtn.disabled = !info.url;
    downloadBtn.style.cssText = primaryButtonStyle(info.url);
    downloadBtn.appendChild(renderIcon('download', { size: 16, decorative: true }));
    const downloadText = chrome.i18n ? chrome.i18n.getMessage('download') : 'Download';
    const downloadUnavailableText = chrome.i18n ? chrome.i18n.getMessage('downloadUnavailable') : 'Download (unavailable)';
    downloadBtn.appendChild(Object.assign(document.createElement('span'), {
      textContent: info.url ? downloadText : downloadUnavailableText
    }));
    
    console.log('Media Picker: Download button created', { 
      disabled: downloadBtn.disabled, 
      hasUrl: !!info.url, 
      url: info.url,
      buttonElement: downloadBtn
    });
    
    // Force enable button for testing
    if (info.url) {
      downloadBtn.disabled = false;
      downloadBtn.style.cssText = primaryButtonStyle(true);
      console.log('Media Picker: Button force enabled for testing');
    }

    [closeBtn, copyBtn, downloadBtn].forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-1px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
      });
    });

    footer.appendChild(closeBtn);
    footer.appendChild(copyBtn);
    footer.appendChild(downloadBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlayClickArea);
    document.body.appendChild(overlay);

    // Add click handler to close modal
    overlayClickArea.addEventListener('click', destroyModal);

    function destroyModal() {
      overlayClickArea.remove();
      overlay.remove();
      document.removeEventListener('keydown', handleEsc);
      // Show coffee message after modal is closed
      setTimeout(() => {
        console.log('Media Picker: Showing coffee toast after modal close');
        showCoffeeMessageForTool('media-picker');
      }, 300);
    }

    function handleEsc(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        destroyModal();
      }
    }

    closeButton.addEventListener('click', destroyModal);
    closeBtn.addEventListener('click', destroyModal);
    document.addEventListener('keydown', handleEsc);

    copyBtn.addEventListener('click', async () => {
      if (!info.url) return;
      await copyText(info.url);
      const successMessage = chrome.i18n ? chrome.i18n.getMessage('mediaUrlCopiedToClipboard') : 'Media URL copied to clipboard!';
      showSuccess(successMessage);
    });

    downloadBtn.addEventListener('click', (e) => {
      console.log('Media Picker: Download button clicked via event listener', e);
      e.preventDefault();
      e.stopPropagation();
      downloadMedia(info);
    });
  } catch (error) {
    handleError(error, 'mediaPicker.modal');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToShowMediaDetails') : 'Failed to show media details.';
    showError(errorMessage);
  }
}

function buttonStyle(enabled = true) {
  return `
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid var(--toolary-border, #ddd);
    background: ${enabled ? 'var(--toolary-button-bg, #f0f0f0)' : 'rgba(0,0,0,0.05)'};
    color: var(--toolary-text, #333);
    cursor: ${enabled ? 'pointer' : 'not-allowed'};
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: ${enabled ? '0 6px 14px rgba(0,0,0,0.04)' : 'none'};
  `;
}

function primaryButtonStyle(enabled = true) {
  return `
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid ${enabled ? 'var(--toolary-primary-color, #007bff)' : 'rgba(0,0,0,0.1)'};
    background: ${enabled ? 'var(--toolary-primary-color, #007bff)' : 'rgba(0,0,0,0.05)'};
    color: #ffffff;
    cursor: ${enabled ? 'pointer' : 'not-allowed'};
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: ${enabled ? '0 10px 20px rgba(0,0,0,0.12)' : 'none'};
  `;
}

function downloadMedia(info, overrideUrl = null) {
  console.log('Media Picker: Download button clicked', { info, overrideUrl });
  const targetUrl = overrideUrl || info.url;
  console.log('Media Picker: Target URL', targetUrl);

  if (!targetUrl) {
    console.log('Media Picker: No target URL available');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('mediaUrlUnavailable') : 'Media URL unavailable.';
    showError(errorMessage);
    return;
  }

  if (targetUrl.startsWith('blob:')) {
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('blobUrlCannotDownload') : 'This media uses a blob URL and cannot be downloaded directly.';
    showError(errorMessage);
    return;
  }

  const fallbackExtension = info.type === 'video' ? 'mp4' : 'png';
  const extension = getExtensionFromUrl(targetUrl, info.extension || fallbackExtension);
  const filename = info.filename && info.extension
    ? info.filename.replace(new RegExp(`\.${info.extension}$`), `.${extension}`)
    : createFilename(info.type || 'media', extension);

  info.extension = extension;
  info.filename = filename;

  console.log('Media Picker: Sending download message', { targetUrl, filename });
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_MEDIA',
    url: targetUrl,
    filename
  }, (response) => {
    console.log('Media Picker: Download response', { response, lastError: chrome.runtime.lastError });
    
    if (chrome.runtime.lastError) {
      console.error('Media Picker: Download error', chrome.runtime.lastError);
      handleError(chrome.runtime.lastError, 'mediaPicker.download');
      const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToDownloadMedia') : 'Failed to download media.';
      showError(chrome.runtime.lastError.message || errorMessage);
      return;
    }

    if (!response?.success) {
      console.error('Media Picker: Download failed', response);
      const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToDownloadMedia') : 'Failed to download media.';
      showError(response?.error || errorMessage);
      return;
    }

    console.log('Media Picker: Download successful');
    const successMessage = chrome.i18n ? chrome.i18n.getMessage('downloadStarted') : 'Download started.';
    showSuccess(successMessage);
  });
}

function handleSelection(media) {
  const tag = media.tagName.toLowerCase();
  console.log('Media Picker: Handling selection', { tag, media });
  
  const info = tag === 'video' ? collectVideoInfo(media) : collectImageInfo(media);
  console.log('Media Picker: Collected info', { info });

  if (info.fallbackApplied) {
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('blobUrlUsingAlternateSource') : 'Stream uses a blob URL — using alternate source for copy & download.';
    showInfo(infoMessage, 3200);
  }

  if (info.url) {
    console.log('Media Picker: URL available, copying to clipboard');
    safeExecute(() => copyText(info.url), 'copy media url');
    const successMessage = chrome.i18n ? chrome.i18n.getMessage('mediaUrlCopiedToClipboard') : 'Media URL copied to clipboard!';
    showSuccess(successMessage);
  } else {
    console.log('Media Picker: No URL available');
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('mediaDetailsAvailable') : 'Media details available. Review the modal for download options.';
    showInfo(infoMessage, 3000);
  }
  showMediaModal(info);
  
  deactivateCb();
}

function onClick(event) {
  const media = findMediaElement(event.target);
  if (!media) return;

  event.preventDefault();
  event.stopPropagation();

  try {
    handleSelection(media);
  } catch (error) {
    handleError(error, 'mediaPicker.click');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToInspectMedia') : 'Failed to inspect media.';
    showError(errorMessage);
  }
}

function onKeyDown(event) {
  try {
    if (event.key === 'Escape') {
      event.preventDefault();
      deactivateCb();
      return;
    }

    if (event.key === 'Enter' && currentMedia) {
      event.preventDefault();
      handleSelection(currentMedia);
    }
  } catch (error) {
    handleError(error, 'mediaPicker.keydown');
  }
}

export async function activate(deactivate) {
  deactivateCb = deactivate;

  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    overlay = createOverlay();
    overlay.style.cssText = `
      position: absolute;
      background-color: ${HIGHLIGHT_COLOR_IMAGE};
      border: 2px solid ${HIGHLIGHT_BORDER_IMAGE};
      border-radius: 6px;
      z-index: 2147483646;
      pointer-events: none;
      box-sizing: border-box;
      box-shadow: 0 0 8px rgba(0,0,0,0.15);
      transition: all 0.15s ease-out;
      animation: toolary-fade-in 0.15s ease-out;
      display: none;
    `;

    document.body.style.cursor = 'crosshair';

    const cleanupMove = addEventListenerWithCleanup(document, 'mousemove', throttledOnMove, true);
    const cleanupClick = addEventListenerWithCleanup(document, 'click', onClick, true);
    const cleanupKeydown = addEventListenerWithCleanup(document, 'keydown', onKeyDown, true);

    cleanupFunctions.push(cleanupMove, cleanupClick, cleanupKeydown);

    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('hoverToInspectMedia') : 'Hover over images or videos • Click to inspect • Enter to select • Esc to cancel';
    showInfo(infoMessage, 2500);
  } catch (error) {
    handleError(error, 'mediaPicker.activate');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateMediaPicker') : 'Failed to activate media picker.';
    showError(errorMessage);
    deactivate();
  }
}

export function deactivate() {
  try {
    cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        handleError(error, 'mediaPicker.cleanup');
      }
    });
    cleanupFunctions.length = 0;

    removeOverlay(overlay);
    overlay = null;
    currentMedia = null;
    document.body.style.cursor = '';
  } catch (error) {
    handleError(error, 'mediaPicker.deactivate');
  }
}
