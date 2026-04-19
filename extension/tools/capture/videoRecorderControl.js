/* global URLSearchParams, MediaRecorder */
import { t } from '../../shared/helpers.js';

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('sessionId') || `toolary-${Date.now()}`;
const sourceTabId = Number.parseInt(params.get('tabId') || '', 10);
const sourceWindowId = Number.parseInt(params.get('windowId') || '', 10);

// const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
const openerOrigin = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
})();

const elements = {
  status: document.getElementById('status'),
  countdown: document.getElementById('countdown'),
  duration: document.getElementById('duration'),
  pause: document.getElementById('pause'),
  stop: document.getElementById('stop'),
  captureMode: document.getElementById('capture-mode'),
  configHint: document.getElementById('config-hint')
};

const state = {
  stream: null,
  recorder: null,
  chunks: [],
  isRecording: false,
  isPaused: false,
  startTime: null,
  durationTimer: null,
  stopRequested: false,
  displaySurface: null,
  mimeType: 'video/webm;codecs=vp9',
  controlTabId: null,
  controlWindowId: null,
  focusGuards: []
};

function postToOpener(type, payload = {}) {
  if (!window.opener) {
    return;
  }

  try {
    window.opener.postMessage({ ...payload, type, sessionId }, openerOrigin || '*');
  } catch {
    // Ignore cross-origin access errors; opener might navigate away.
  }
}

function setStatus(message) {
  elements.status.textContent = message;
}

function updateCountdown(value) {
  if (value === null) {
    elements.countdown.classList.add('hidden');
    return;
  }
  elements.countdown.classList.remove('hidden');
  elements.countdown.textContent = String(value);
}

function updateDuration() {
  if (!state.isRecording || state.isPaused) {
    return;
  }

  const seconds = Math.floor((Date.now() - state.startTime) / 1000);
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  elements.duration.textContent = `${minutes}:${remainder}`;
}

function clearDurationTimer() {
  if (state.durationTimer) {
    clearInterval(state.durationTimer);
    state.durationTimer = null;
  }
}

function showDuration() {
  elements.duration.classList.remove('hidden');
  elements.duration.textContent = t('duration', '00:00');
  state.durationTimer = setInterval(updateDuration, 1000);
}

function enableControls() {
  elements.pause.disabled = false;
  elements.stop.disabled = false;
}

function disableControls() {
  elements.pause.disabled = true;
  elements.stop.disabled = true;
}

function setPauseLabel(isPaused) {
  if (isPaused) {
    elements.pause.textContent = t('resume', 'Resume');
    elements.pause.classList.remove('pause');
    elements.pause.classList.add('resume');
  } else {
    elements.pause.textContent = t('pause', 'Pause');
    elements.pause.classList.remove('resume');
    elements.pause.classList.add('pause');
  }
}

function cleanupFocusGuards() {
  state.focusGuards.forEach((cleanup) => {
    try {
      cleanup();
    } catch {
      // Ignore listener cleanup errors.
    }
  });
  state.focusGuards = [];
}

function formatReason(reason) {
  switch (reason) {
    case 'tab-switched':
      return 'Recording finished because you left the captured tab.';
    case 'tab-closed':
      return 'Captured tab closed. Recording saved automatically.';
    case 'window-changed':
      return 'Recording stopped after switching to another window.';
    case 'track-ended':
      return 'Screen sharing ended.';
    case 'requested':
      return 'Recording stopped.';
    default:
      return 'Recording finished.';
  }
}

async function startCountdown() {
  updateCountdown(3);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  updateCountdown(2);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  updateCountdown(1);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  updateCountdown(null);
}

function detectDisplaySurface(stream) {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    return 'unknown';
  }

  const settings = videoTrack.getSettings();
  if (!settings || !settings.displaySurface) {
    return 'unknown';
  }
  return settings.displaySurface;
}

function updateCaptureBadge(surface) {
  const badge = elements.captureMode;
  switch (surface) {
    case 'monitor':
      badge.textContent = t('entireScreen', 'Entire Screen');
      badge.classList.remove('danger');
      break;
    case 'window':
      badge.textContent = t('window', 'Window');
      badge.classList.remove('danger');
      break;
    case 'browser':
      badge.textContent = t('chromeTab', 'Chrome Tab');
      badge.classList.add('danger');
      break;
    default:
      badge.textContent = t('recording', 'Recording');
      badge.classList.remove('danger');
      break;
  }
}

function setupTabFocusGuards() {
  if (!Number.isInteger(sourceTabId)) {
    return;
  }

  const handleActivated = (activeInfo) => {
    if (state.stopRequested) {
      return;
    }

    if (activeInfo.tabId === sourceTabId || activeInfo.tabId === state.controlTabId) {
      return;
    }

    stopRecording('tab-switched');
  };

  const handleRemoved = (tabId) => {
    if (state.stopRequested) {
      return;
    }

    if (tabId === sourceTabId) {
      stopRecording('tab-closed');
    }
  };

  const handleWindowFocus = (windowId) => {
    if (state.stopRequested) {
      return;
    }

    if (
      windowId === chrome.windows.WINDOW_ID_NONE ||
      windowId === state.controlWindowId ||
      windowId === sourceWindowId
    ) {
      return;
    }

    stopRecording('window-changed');
  };

  chrome.tabs.onActivated.addListener(handleActivated);
  state.focusGuards.push(() => chrome.tabs.onActivated.removeListener(handleActivated));

  chrome.tabs.onRemoved.addListener(handleRemoved);
  state.focusGuards.push(() => chrome.tabs.onRemoved.removeListener(handleRemoved));

  chrome.windows.onFocusChanged.addListener(handleWindowFocus);
  state.focusGuards.push(() => chrome.windows.onFocusChanged.removeListener(handleWindowFocus));
}

async function getDisplayStream() {
  const constraints = {
    video: {
      frameRate: 30,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      cursor: 'always',
      preferCurrentTab: Number.isInteger(sourceTabId)
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48000
    }
  };

  return navigator.mediaDevices.getDisplayMedia(constraints);
}

function selectMimeType() {
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    state.mimeType = 'video/webm;codecs=vp9';
    return;
  }

  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    state.mimeType = 'video/webm;codecs=vp8';
    return;
  }

  state.mimeType = 'video/webm';
}

async function startRecording() {
  if (state.isRecording && !state.stopRequested) {
    setStatus('Recording already in progress.');
    return;
  }

  if (state.stopRequested) {
    state.stopRequested = false;
  }

  try {
    await startCountdown();
    setStatus('Waiting for Chrome sharing prompt…');

    const stream = await getDisplayStream();
    state.stream = stream;

    state.displaySurface = detectDisplaySurface(stream);
    updateCaptureBadge(state.displaySurface);

    if (state.displaySurface === 'browser') {
      setStatus('Recording current Chrome tab. Leaving the tab will end the recording.');
      setupTabFocusGuards();
    } else if (state.displaySurface === 'monitor') {
      setStatus('Recording entire screen. You can move between tabs and windows.');
    } else if (state.displaySurface === 'window') {
      setStatus('Recording a window. Switching away may pause audio on some systems.');
    } else {
      setStatus('Recording started.');
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => {
        stopRecording('track-ended');
      });
    }

    selectMimeType();
    const recorderOptions = {
      mimeType: state.mimeType,
      videoBitsPerSecond: state.displaySurface === 'monitor' ? 7000000 : 4500000
    };

    const recorder = new MediaRecorder(stream, recorderOptions);
    state.recorder = recorder;
    state.chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      setStatus(`Recorder error: ${event.error?.message || 'unknown error'}`);
      postToOpener('video-recorder:error', { message: 'Recorder error occurred.' });
      stopRecording('recorder-error');
    };

    recorder.onstop = () => {
      finalizeRecording();
    };

    recorder.start(1000);

    state.isRecording = true;
    state.isPaused = false;
    state.startTime = Date.now();
    showDuration();
    enableControls();
    setPauseLabel(false);
    elements.configHint.textContent = t('recordingInProgress', 'Recording in progress. Keep this window open to manage the capture.');

    postToOpener('video-recorder:started');
  } catch (error) {
    const message =
      error?.name === 'NotAllowedError'
        ? 'Screen recording permission denied.'
        : error?.message || 'Screen recording failed.';
    setStatus(message);
    postToOpener('video-recorder:error', { message });
    disableControls();
    updateCountdown(null);
    setTimeout(() => {
      try {
        window.close();
      } catch {
        // Ignore close failures.
      }
    }, 2500);
  }
}

function stopRecording(reason = 'requested') {
  if (state.stopRequested) {
    return;
  }

  state.stopRequested = true;
  state.isRecording = false;
  state.isPaused = false;
  disableControls();
  clearDurationTimer();
  cleanupFocusGuards();

  if (state.recorder && state.recorder.state !== 'inactive') {
    try {
      state.recorder.stop();
    } catch {
      finalizeRecording();
    }
  } else {
    finalizeRecording();
  }

  if (state.stream) {
    state.stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore track stop errors.
      }
    });
  }

  setStatus(formatReason(reason));
}

function finalizeRecording() {
  if (!state.chunks.length) {
    setStatus('No recording data captured.');
    postToOpener('video-recorder:error', { message: 'No recording data captured.' });
    return;
  }

  const blob = new Blob(state.chunks, { type: state.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `toolary-recording-${timestamp}.webm`;

  chrome.downloads.download(
    {
      url: objectUrl,
      filename,
      saveAs: false
    },
    (/* downloadId */) => {
      if (chrome.runtime.lastError) {
        const message = `Download failed: ${chrome.runtime.lastError.message}`;
        setStatus(message);
        postToOpener('video-recorder:error', { message });
      } else {
        setStatus('Recording saved. Download has started.');
        postToOpener('video-recorder:stopped', {
          message: 'Recording saved. Download has started.'
        });
        setTimeout(() => {
          try {
            window.close();
          } catch {
            // Ignore window close failures.
          }
        }, 2000);
      }

      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
  );
}

function togglePause() {
  if (!state.recorder || state.recorder.state === 'inactive' || state.stopRequested) {
    return;
  }

  if (state.isPaused) {
    try {
      state.recorder.resume();
      state.isPaused = false;
      setPauseLabel(false);
      setStatus('Recording resumed.');
    } catch (error) {
      setStatus(error?.message || 'Failed to resume recording.');
    }
    return;
  }

  try {
    state.recorder.pause();
    state.isPaused = true;
    setPauseLabel(true);
    setStatus('Recording paused.');
  } catch (error) {
    setStatus(error?.message || 'Failed to pause recording.');
  }
}

function handleIncomingMessage(event) {
  if (event.source !== window.opener) {
    return;
  }

  if (openerOrigin && event.origin !== openerOrigin) {
    return;
  }

  const data = event.data;
  if (!data || data.sessionId !== sessionId) {
    return;
  }

  if (data.type === 'video-recorder:start') {
    if (state.isRecording && !state.stopRequested) {
      postToOpener('video-recorder:already-recording');
      return;
    }
    if (!state.stopRequested) {
      startRecording();
    }
  }

  if (data.type === 'video-recorder:request-stop') {
    stopRecording('requested');
  }
}

function applySystemTheme() {
  if (!window.matchMedia) {
    return;
  }

  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.body.classList.add('light');
  } else {
    document.body.classList.remove('light');
  }
}

function init() {
  applySystemTheme();
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applySystemTheme);
    } catch {
      // Some browsers expose addListener instead of addEventListener
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      if (mediaQuery && typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(applySystemTheme);
        state.focusGuards.push(() => {
          if (typeof mediaQuery.removeListener === 'function') {
            mediaQuery.removeListener(applySystemTheme);
          }
        });
      }
    }
  }

  window.addEventListener('message', handleIncomingMessage);
  window.addEventListener('beforeunload', () => {
    if (!state.stopRequested && state.isRecording) {
      stopRecording('requested');
    }
  });

  chrome.tabs.getCurrent((tab) => {
    state.controlTabId = tab?.id ?? null;
  });

  chrome.windows.getCurrent((win) => {
    state.controlWindowId = win?.id ?? null;
  });

  elements.pause.addEventListener('click', () => togglePause());
  elements.stop.addEventListener('click', () => stopRecording('requested'));

  setPauseLabel(false);
  disableControls();
  postToOpener('video-recorder:ready');
}

init();
