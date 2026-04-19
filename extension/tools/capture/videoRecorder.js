import { showError, showInfo, showSuccess, handleError } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { MESSAGE_TYPES, sendRuntimeMessage } from '../../core/messageRouter.js';

export const metadata = {
  id: 'video-recorder',
  name: 'Video Recorder',
  category: 'capture',
  icon: 'video',
  permissions: ['activeTab', 'tabCapture', 'storage'],
  tags: ['video', 'recording', 'screen'],
  keywords: ['record', 'video', 'screen', 'capture', 'webm', 'mp4']
};

let controlWindow = null;
let messageListener = null;
let windowWatcher = null;
let sessionId = null;
let activeDeactivate = null;
let lastContext = null;

const EXTENSION_ORIGIN = typeof chrome !== 'undefined' ? `chrome-extension://${chrome.runtime.id}` : '';

function generateSessionId() {
  return `toolary-video-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function requestActiveTabContext() {
  try {
    const response = await sendRuntimeMessage(MESSAGE_TYPES.VIDEO_RECORDER_GET_CONTEXT);
    if (!response?.success) {
      throw new Error(response?.error || 'Could not determine active tab.');
    }
    return response;
  } catch (error) {
    throw error;
  }
}

function cleanupMessageChannel() {
  if (messageListener) {
    window.removeEventListener('message', messageListener);
    messageListener = null;
  }

  if (windowWatcher) {
    clearInterval(windowWatcher);
    windowWatcher = null;
  }
}

function resetState() {
  cleanupMessageChannel();
  controlWindow = null;
  sessionId = null;
  lastContext = null;
}

function safeDeactivate() {
  const fn = activeDeactivate;
  activeDeactivate = null;
  if (typeof fn === 'function') {
    try {
      fn();
    } catch (error) {
      handleError(error, 'videoRecorder.safeDeactivate');
    }
  }
}

function watchControlWindow() {
  if (!controlWindow || windowWatcher) {
    return;
  }

  windowWatcher = setInterval(() => {
    if (!controlWindow) {
      clearInterval(windowWatcher);
      windowWatcher = null;
      return;
    }

    try {
      if (controlWindow.closed) {
        clearInterval(windowWatcher);
        windowWatcher = null;
            const message = chrome.i18n ? chrome.i18n.getMessage('videoRecorderWindowClosed') : 'Video recorder window closed.';
            showInfo(message);
        resetState();
        safeDeactivate();
      }
    } catch (error) {
      clearInterval(windowWatcher);
      windowWatcher = null;
      handleError(error, 'videoRecorder.windowWatcher');
      resetState();
      safeDeactivate();
    }
  }, 1200);
}

function registerMessageHandler(deactivate) {
  messageListener = (event) => {
    if (!event?.origin || event.origin !== EXTENSION_ORIGIN) {
      return;
    }

    const data = event.data;
    if (!data || data.sessionId !== sessionId) {
      return;
    }

    switch (data.type) {
      case 'video-recorder:ready': {
        try {
          controlWindow?.postMessage({
            type: 'video-recorder:start',
            sessionId,
            sourceTabId: lastContext?.tabId ?? null,
            sourceWindowId: lastContext?.windowId ?? null
          }, EXTENSION_ORIGIN);
        } catch (error) {
          handleError(error, 'videoRecorder.postStart');
            const message = chrome.i18n ? chrome.i18n.getMessage('recordingControlsNotReachable') : 'Recording controls are not reachable. Please try again.';
            showError(message);
          resetState();
          safeDeactivate();
        }
        break;
      }
      case 'video-recorder:started':
            const startedMessage = chrome.i18n ? chrome.i18n.getMessage('recordingStarted') : 'Recording started. Keep the control window open while recording.';
            showSuccess(startedMessage);
        break;
      case 'video-recorder:already-recording':
        const progressMessage = chrome.i18n ? chrome.i18n.getMessage('recordingAlreadyInProgress') : 'Recording already in progress.';
        showInfo(progressMessage);
        break;
      case 'video-recorder:stopped':
        if (data?.message) {
          showSuccess(data.message);
        } else {
          const savedMessage = chrome.i18n ? chrome.i18n.getMessage('recordingSavedDownloadStarted') : 'Recording saved. Download has started.';
          showSuccess(savedMessage);
        }
        
        // Show coffee message
        showCoffeeMessageForTool('video-recorder');
        resetState();
        safeDeactivate();
        break;
      case 'video-recorder:error':
            const errorMessage = chrome.i18n ? chrome.i18n.getMessage('videoRecorderError') : 'Video recorder encountered an error.';
            showError(data?.message || errorMessage);
        resetState();
        safeDeactivate();
        break;
      default:
        break;
    }
  };

  window.addEventListener('message', messageListener);
  watchControlWindow();
  activeDeactivate = deactivate;
}

export async function activate(deactivate) {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      const message = chrome.i18n ? chrome.i18n.getMessage('videoRecorderNotSupported') : 'Video recorder is not supported in this context.';
      showError(message);
      deactivate();
      return;
    }

    if (controlWindow && !controlWindow.closed) {
      controlWindow.focus();
      const message = chrome.i18n ? chrome.i18n.getMessage('videoRecorderWindowAlreadyOpen') : 'Video recorder window is already open.';
      showInfo(message);
      return;
    }

    const context = await requestActiveTabContext();
    lastContext = context;
    sessionId = generateSessionId();

    const features = [
      'width=360',
      'height=320',
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=yes',
      'scrollbars=no'
    ].join(',');

    const url = new URL(chrome.runtime.getURL('tools/capture/videoRecorderControl.html'));
    url.searchParams.set('sessionId', sessionId);
    if (typeof context.tabId === 'number') {
      url.searchParams.set('tabId', String(context.tabId));
    }
    if (typeof context.windowId === 'number') {
      url.searchParams.set('windowId', String(context.windowId));
    }

    controlWindow = window.open(url.toString(), 'toolary-video-recorder-controls', features);
    if (!controlWindow) {
      const message = chrome.i18n ? chrome.i18n.getMessage('popupBlockedAllowPopups') : 'Popup blocked. Allow popups for Toolboard to use the video recorder.';
      showError(message);
      resetState();
      deactivate();
      return;
    }

    const message = chrome.i18n ? chrome.i18n.getMessage('recordingControlsOpened') : 'Recording controls opened in a new window. Keep it open while recording.';
    showInfo(message);
    registerMessageHandler(deactivate);
  } catch (error) {
    handleError(error, 'videoRecorder.activate');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToOpenVideoRecorder') : 'Failed to open video recorder.';
    showError(error?.message || errorMessage);
    resetState();
    deactivate();
  }
}

export function deactivate() {
  cleanupMessageChannel();

  if (controlWindow && !controlWindow.closed) {
    try {
      if (sessionId) {
        controlWindow.postMessage({
          type: 'video-recorder:request-stop',
          sessionId
        }, EXTENSION_ORIGIN);
      }
      controlWindow.close();
    } catch (error) {
      handleError(error, 'videoRecorder.deactivate');
    }
  }

  controlWindow = null;
  sessionId = null;
  lastContext = null;
  activeDeactivate = null;
}
