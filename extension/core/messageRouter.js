import { MESSAGE_TYPES } from './constants.js';

export function createMessage(type, payload = {}) {
  return { type, payload };
}

export function sendRuntimeMessage(type, payload = {}) {
  return chrome.runtime.sendMessage(createMessage(type, payload));
}

export function sendTabMessage(tabId, type, payload = {}) {
  if (typeof tabId !== 'number') {
    throw new Error('sendTabMessage requires a numeric tabId');
  }
  return chrome.tabs.sendMessage(tabId, createMessage(type, payload));
}

export function addMessageListener(handlers = {}) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) {
      return false;
    }

    try {
      const payload = message?.payload ?? (() => {
        if (!message || typeof message !== 'object') {
          return {};
        }
        const rest = { ...message };
        delete rest.type;
        return rest;
      })();

      const result = handler(payload, sender, sendResponse, message);
      if (result instanceof Promise) {
        result
          .then((value) => {
            if (value !== undefined) {
              sendResponse(value);
            }
          })
          .catch((error) => {
            console.error(`Toolboard message handler error (${message.type})`, error);
            sendResponse({ success: false, error: error?.message || 'Unknown error' });
          });
        return true;
      }

      if (result !== undefined) {
        sendResponse(result);
      }
    } catch (error) {
      console.error(`Toolboard message handler threw (${message.type})`, error);
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    }

    return false;
  });
}

export { MESSAGE_TYPES };

// Alias for sendRuntimeMessage for compatibility
export function sendMessage(type, payload = {}) {
  return sendRuntimeMessage(type, payload);
}

// Export messageRouter object for compatibility
export const messageRouter = {
  createMessage,
  sendRuntimeMessage,
  sendTabMessage,
  sendMessage,
  addMessageListener,
  MESSAGE_TYPES
};
