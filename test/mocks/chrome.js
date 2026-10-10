// Chrome API mock for testing
export default {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve())
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  i18n: {
    getMessage: jest.fn((key) => key)
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([{
      id: 1,
      url: 'https://example.com',
      title: 'Test Page'
    }])),
    captureVisibleTab: jest.fn(() => Promise.resolve('data:image/png;base64,test'))
  },
  action: {
    openPopup: jest.fn()
  },
  commands: {
    onCommand: {
      addListener: jest.fn()
    }
  },
  scripting: {
    executeScript: jest.fn(() => Promise.resolve())
  }
};
