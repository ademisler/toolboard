import { jest } from '@jest/globals';

describe('Screenshot Picker', () => {
  const originalQuerySelector = document.querySelector;
  const originalQuerySelectorAll = document.querySelectorAll;
  const originalBodyAppendChild = document.body.appendChild;
  const originalBodyRemoveChild = document.body.removeChild;
  const originalRAF = window.requestAnimationFrame;
  const originalScrollTo = window.scrollTo;
  const originalImage = global.Image;
  const originalClipboardItem = global.ClipboardItem;
  const originalFetch = global.fetch;
  const originalClipboard = navigator.clipboard;
  const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
  const originalCanvasToDataURL = HTMLCanvasElement.prototype.toDataURL;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    document.querySelector = Document.prototype.querySelector.bind(document);
    document.querySelectorAll = Document.prototype.querySelectorAll.bind(document);
    document.body.appendChild = Element.prototype.appendChild.bind(document.body);
    document.body.removeChild = Element.prototype.removeChild.bind(document.body);

    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(document.documentElement, 'offsetHeight', { value: 1200, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(document.body, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(document.body, 'offsetHeight', { value: 1200, configurable: true });

    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.scrollTo = jest.fn();

    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      fillStyle: '',
      fillRect: jest.fn(),
      drawImage: jest.fn()
    }));
    HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,test');

    global.Image = class {
      constructor() {
        this.width = 800;
        this.height = 800;
        this.onload = null;
        this.onerror = null;
      }

      set src(_value) {
        setTimeout(() => this.onload?.(), 0);
      }
    };
  });

  afterEach(() => {
    document.querySelector = originalQuerySelector;
    document.querySelectorAll = originalQuerySelectorAll;
    document.body.appendChild = originalBodyAppendChild;
    document.body.removeChild = originalBodyRemoveChild;
    window.requestAnimationFrame = originalRAF;
    window.scrollTo = originalScrollTo;
    global.Image = originalImage;
    global.ClipboardItem = originalClipboardItem;
    global.fetch = originalFetch;
    navigator.clipboard = originalClipboard;
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalCanvasToDataURL;
  });

  test('does not invoke deactivate callback when externally deactivated during capture', async () => {
    chrome.runtime.sendMessage = jest.fn((_payload, cb) => {
      setTimeout(() => cb?.({ success: true, dataUrl: 'data:image/png;base64,test' }), 20);
    });

    const screenshotPicker = await import('../extension/tools/capture/screenshotPicker.js');
    const deactivateMock = jest.fn();

    const activationPromise = screenshotPicker.activate(deactivateMock);
    screenshotPicker.deactivate();

    await activationPromise;
    expect(deactivateMock).not.toHaveBeenCalled();
  });

  test('shows copy panel after successful capture and copies image to clipboard', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, 'offsetHeight', { value: 800, configurable: true });
    Object.defineProperty(document.body, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(document.body, 'offsetHeight', { value: 800, configurable: true });

    chrome.runtime.sendMessage = jest.fn((_payload, cb) => {
      cb?.({ success: true, dataUrl: 'data:image/png;base64,test' });
    });

    const writeMock = jest.fn(() => Promise.resolve());
    navigator.clipboard = {
      ...navigator.clipboard,
      write: writeMock
    };
    global.ClipboardItem = class {
      constructor(data) {
        this.data = data;
      }
    };
    global.fetch = jest.fn(() => Promise.resolve({
      blob: () => Promise.resolve(new Blob(['img'], { type: 'image/png' }))
    }));

    const screenshotPicker = await import('../extension/tools/capture/screenshotPicker.js');
    const deactivateMock = jest.fn();

    await screenshotPicker.activate(deactivateMock);

    const panel = document.getElementById('toolary-screenshot-actions');
    expect(panel).toBeTruthy();
    expect(deactivateMock).not.toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);

    const buttons = Array.from(panel.querySelectorAll('button'));
    const copyButton = buttons.find((btn) => /copy/i.test(btn.textContent));
    const dismissButton = buttons.find((btn) => /dismiss/i.test(btn.textContent));
    expect(copyButton).toBeTruthy();
    expect(dismissButton).toBeTruthy();

    copyButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeMock).toHaveBeenCalledTimes(2);

    dismissButton.click();
    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });
});
