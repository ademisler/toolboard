const ENHANCED_OVERLAY_ATTR = 'data-toolary-ui-enhanced';
const ENHANCED_MEDIA_ATTR = 'data-toolary-media-enhanced';
const ENHANCED_MEDIA_FULLSCREEN_ATTR = 'data-toolary-media-fullscreen-enhanced';
const MEDIA_FULLSCREEN_OVERLAY_ID = 'toolary-media-fullscreen-overlay';

function getMessage(key, fallback) {
  const message = chrome?.i18n?.getMessage?.(key);
  return message || fallback;
}

function inferDialog(overlay) {
  if (!overlay) return null;
  if (overlay.id === 'toolary-modal-overlay') {
    return overlay.querySelector('#toolary-modal-content');
  }
  return overlay.firstElementChild || overlay.querySelector(':scope > div') || null;
}

function classifyButton(button) {
  if (button.dataset.toolaryBtnTone) {
    return;
  }

  const signals = [
    button.className || '',
    button.getAttribute('data-action') || '',
    button.getAttribute('id') || '',
    button.getAttribute('aria-label') || '',
    button.getAttribute('title') || '',
    button.textContent || ''
  ]
    .join(' ')
    .toLowerCase();

  if (/danger|delete|remove|clear|reset|cancel/i.test(signals)) {
    button.dataset.toolaryBtnTone = 'danger';
    return;
  }

  if (/primary|main|generate|convert|preview|run|apply|save|download|copy|encode|decode/i.test(signals)) {
    button.dataset.toolaryBtnTone = 'primary';
    return;
  }

  button.dataset.toolaryBtnTone = 'neutral';
}

function shouldSkipButtonEnhance(button) {
  if (!button) return true;
  if (button.classList.contains('modal-close')) return true;

  const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
  const title = (button.getAttribute('title') || '').toLowerCase();
  if (ariaLabel === 'close' || title === 'close') return true;

  const text = (button.textContent || '').trim();
  const hasIconOnly = !text && button.querySelector('svg, img, i');
  return Boolean(hasIconOnly);
}

function enhanceButtons(dialog) {
  const buttons = dialog.querySelectorAll('button');
  buttons.forEach((button) => {
    if (shouldSkipButtonEnhance(button)) return;
    if (!button.classList.contains('toolary-ui-btn')) {
      button.classList.add('toolary-ui-btn');
    }
    classifyButton(button);
  });
}

function enhanceFields(dialog) {
  const controls = dialog.querySelectorAll('input, select, textarea');
  controls.forEach((control) => {
    if (control.classList.contains('toolary-ui-input')) return;
    control.classList.add('toolary-ui-input');
  });
}

function setMediaState(shell, state) {
  shell.classList.remove('is-loading', 'is-ready', 'is-error');
  shell.classList.add(state);
}

function closeMediaFullscreenOverlay() {
  const overlay = document.getElementById(MEDIA_FULLSCREEN_OVERLAY_ID);
  if (!overlay) return;
  overlay.remove();
}

function createFullscreenOverlay() {
  closeMediaFullscreenOverlay();

  const overlay = document.createElement('div');
  overlay.id = MEDIA_FULLSCREEN_OVERLAY_ID;
  overlay.className = 'toolary-media-fullscreen-overlay';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toolary-media-fullscreen-close';
  closeBtn.textContent = getMessage('toolUiFullscreenClose', 'Close');

  const stage = document.createElement('div');
  stage.className = 'toolary-media-fullscreen-stage';

  overlay.appendChild(closeBtn);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  const onEsc = (event) => {
    if (event.key === 'Escape') {
      closeMediaFullscreenOverlay();
      document.removeEventListener('keydown', onEsc);
    }
  };

  closeBtn.addEventListener('click', () => {
    closeMediaFullscreenOverlay();
    document.removeEventListener('keydown', onEsc);
  }, { once: true });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeMediaFullscreenOverlay();
      document.removeEventListener('keydown', onEsc);
    }
  });

  document.addEventListener('keydown', onEsc);
  return stage;
}

export function openToolFullscreen(targetEl) {
  if (!targetEl) return false;

  const stage = createFullscreenOverlay();
  if (!stage) return false;

  let fullscreenNode = null;
  const tagName = String(targetEl.tagName || '').toUpperCase();

  if (tagName === 'IMG') {
    const src = targetEl.currentSrc || targetEl.getAttribute('src') || '';
    if (!String(src).trim()) {
      closeMediaFullscreenOverlay();
      return false;
    }
    const img = document.createElement('img');
    img.src = src;
    img.alt = targetEl.getAttribute('alt') || getMessage('toolUiMediaPreviewAlt', 'Tool preview');
    img.className = 'toolary-media-fullscreen-content';
    fullscreenNode = img;
  } else if (tagName === 'VIDEO') {
    const src = targetEl.currentSrc || targetEl.getAttribute('src') || '';
    if (!String(src).trim()) {
      closeMediaFullscreenOverlay();
      return false;
    }
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.autoplay = false;
    video.className = 'toolary-media-fullscreen-content';
    fullscreenNode = video;
  } else if (tagName === 'CANVAS') {
    const canvas = targetEl;
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      dataUrl = '';
    }
    if (!dataUrl) {
      closeMediaFullscreenOverlay();
      return false;
    }
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = getMessage('toolUiMediaPreviewAlt', 'Tool preview');
    img.className = 'toolary-media-fullscreen-content';
    fullscreenNode = img;
  } else if (tagName === 'IFRAME') {
    const frame = document.createElement('iframe');
    const src = targetEl.getAttribute('src') || '';
    const srcdoc = targetEl.getAttribute('srcdoc') || targetEl.srcdoc || '';
    frame.className = 'toolary-media-fullscreen-content toolary-media-fullscreen-frame';
    frame.setAttribute('sandbox', targetEl.getAttribute('sandbox') || 'allow-same-origin allow-scripts');
    if (srcdoc) {
      frame.srcdoc = srcdoc;
    } else if (src) {
      frame.src = src;
    } else {
      closeMediaFullscreenOverlay();
      return false;
    }
    fullscreenNode = frame;
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'toolary-media-fullscreen-content toolary-media-fullscreen-generic';
    wrapper.innerHTML = targetEl.innerHTML || '';
    fullscreenNode = wrapper;
  }

  if (!fullscreenNode) {
    closeMediaFullscreenOverlay();
    return false;
  }

  stage.appendChild(fullscreenNode);
  return true;
}

function openMediaFullscreen(mediaEl) {
  openToolFullscreen(mediaEl);
}

function enhanceMediaFullscreen(shell, mediaEl) {
  if (!shell || !mediaEl || shell.hasAttribute(ENHANCED_MEDIA_FULLSCREEN_ATTR)) return;
  shell.setAttribute(ENHANCED_MEDIA_FULLSCREEN_ATTR, 'true');
  shell.classList.add('toolary-media-can-fullscreen');
  shell.title = getMessage('toolUiFullscreenHint', 'Click to open fullscreen');
  shell.addEventListener('click', (event) => {
    if (event.target?.closest?.('button, a, input, select, textarea, label')) return;
    if (shell.classList.contains('is-loading') || shell.classList.contains('is-error')) return;
    openMediaFullscreen(mediaEl);
  });
}

function attachMediaShell(mediaEl) {
  if (!mediaEl || mediaEl.hasAttribute(ENHANCED_MEDIA_ATTR)) return;

  const parent = mediaEl.parentElement;
  if (!parent) return;

  mediaEl.setAttribute(ENHANCED_MEDIA_ATTR, 'true');
  mediaEl.classList.add('toolary-media-el');
  if (mediaEl.tagName === 'IMG') {
    mediaEl.dataset.toolaryOriginalAlt = mediaEl.getAttribute('alt') || '';
    mediaEl.setAttribute('alt', getMessage('toolUiMediaPreviewAlt', 'Tool preview'));
  }

  let shell = null;
  if (parent.classList.contains('toolary-media-shell')) {
    shell = parent;
  } else {
    shell = document.createElement('div');
    shell.className = 'toolary-media-shell is-loading';
    shell.innerHTML = `
      <div class="toolary-media-placeholder" aria-hidden="true">
        <div class="toolary-media-spinner"></div>
        <span class="toolary-media-text" data-toolary-error-label="${getMessage('toolUiMediaPreviewUnavailable', 'Preview unavailable')}">${getMessage('toolUiMediaPreviewPending', 'Preview will appear after processing')}</span>
      </div>
    `;

    parent.insertBefore(shell, mediaEl);
    shell.appendChild(mediaEl);
  }
  enhanceMediaFullscreen(shell, mediaEl);

  const updateImageState = () => {
    const hasSrc = typeof mediaEl.currentSrc === 'string' && mediaEl.currentSrc.trim().length > 0
      ? true
      : typeof mediaEl.getAttribute('src') === 'string' && mediaEl.getAttribute('src').trim().length > 0;

    if (!hasSrc) {
      setMediaState(shell, 'is-loading');
      return;
    }

    if (mediaEl.complete && mediaEl.naturalWidth > 0) {
      setMediaState(shell, 'is-ready');
      return;
    }

    if (mediaEl.complete && mediaEl.naturalWidth === 0) {
      setMediaState(shell, 'is-error');
      return;
    }

    setMediaState(shell, 'is-loading');
  };

  const updateVideoState = () => {
    const src = mediaEl.currentSrc || mediaEl.getAttribute('src') || '';
    if (!String(src).trim()) {
      setMediaState(shell, 'is-loading');
      return;
    }
    if (mediaEl.readyState >= 2) {
      setMediaState(shell, 'is-ready');
    } else {
      setMediaState(shell, 'is-loading');
    }
  };

  if (mediaEl.tagName === 'IMG') {
    mediaEl.addEventListener('load', updateImageState, { passive: true });
    mediaEl.addEventListener('error', () => setMediaState(shell, 'is-error'), { passive: true });
    updateImageState();
    return;
  }

  if (mediaEl.tagName === 'VIDEO') {
    mediaEl.addEventListener('loadeddata', updateVideoState, { passive: true });
    mediaEl.addEventListener('error', () => setMediaState(shell, 'is-error'), { passive: true });
    updateVideoState();
    return;
  }

  // Canvas and other media-like elements are shown directly.
  setMediaState(shell, 'is-ready');
}

function enhanceMedia(dialog) {
  const mediaNodes = dialog.querySelectorAll('img, video, canvas');
  mediaNodes.forEach((node) => attachMediaShell(node));
}

function enhanceOverlay(overlay) {
  if (!overlay) return;
  const dialog = inferDialog(overlay);
  if (!dialog) return;

  if (!overlay.hasAttribute(ENHANCED_OVERLAY_ATTR)) {
    overlay.setAttribute(ENHANCED_OVERLAY_ATTR, 'true');
    overlay.classList.add('toolary-ui-overlay');
    dialog.classList.add('toolary-ui-surface');
  }

  enhanceButtons(dialog);
  enhanceFields(dialog);
  enhanceMedia(dialog);
}

function findOverlays(root = document) {
  return root.querySelectorAll(
    [
      '[id^="toolary-"][id$="-overlay"]',
      '#toolary-modal-overlay',
      '#toolary-overlay'
    ].join(', ')
  );
}

export function enhanceToolUI(root = document) {
  const overlays = findOverlays(root);
  overlays.forEach((overlay) => enhanceOverlay(overlay));
}

export function startToolUIObserver() {
  if (window.__toolaryUIObserverStarted) return;
  window.__toolaryUIObserverStarted = true;

  enhanceToolUI(document);

  const ObserverCtor = window.MutationObserver || window.WebKitMutationObserver;
  if (!ObserverCtor) return;

  const observer = new ObserverCtor(() => {
    enhanceToolUI(document);
  });
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  window.__toolaryUIObserver = observer;
}
