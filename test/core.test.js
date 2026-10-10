import { jest } from '@jest/globals';
import path from 'path';
import { pathToFileURL } from 'url';

const MOCK_MANIFEST = {
  categories: {
    inspect: { name: 'Inspect', description: 'Inspect tools', order: 1 }
  },
  tools: [
    {
      id: 'mock-tool',
      name: 'Mock Tool',
      category: 'inspect',
      module: 'fixtures/mockToolModule.js',
      order: 2,
      icon: 'info',
      shortcut: { default: 'Alt+Shift+1' },
      tags: ['mock'],
      keywords: ['mock'],
      permissions: ['activeTab']
    },
    {
      id: 'alpha-tool',
      name: 'Alpha Tool',
      category: 'capture',
      module: 'fixtures/mockToolModule.js',
      order: 2,
      icon: 'info',
      shortcut: { default: 'Alt+Shift+5' },
      tags: ['alpha'],
      keywords: ['alpha'],
      permissions: ['activeTab']
    },
    {
      id: 'fallback-tool',
      name: 'Fallback Tool',
      category: 'inspect',
      module: 'fixtures/mockToolWithoutMetadata.js',
      order: 1,
      icon: 'info',
      shortcut: 'Alt+Shift+2',
      tags: ['fallback'],
      keywords: ['fallback'],
      permissions: ['activeTab']
    }
  ]
};

const fixturePath = (relativePath) => {
  return pathToFileURL(path.resolve('test', relativePath)).href;
};

const defaultGetUrl = (filePath) => {
  if (filePath.startsWith('config/')) {
    return fixturePath(`../extension/${filePath}`);
  }
  if (filePath.startsWith('tools/fixtures/')) {
    return fixturePath(filePath.replace('tools/', ''));
  }
  return fixturePath(filePath);
};

describe('Core modules', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(MOCK_MANIFEST)
    }));

    chrome.runtime.getURL = jest.fn(defaultGetUrl);

    chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ success: true }));
    chrome.tabs.sendMessage = jest.fn(() => Promise.resolve({ success: true }));

    chrome.storage.sync = {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve())
    };
  });

  afterEach(async () => {
    global.fetch = undefined;
    const { clearToolRegistryCache } = await import('../extension/core/toolRegistry.js');
    clearToolRegistryCache();
    jest.resetModules();
  });

  test('toolRegistry loads manifest and caches results', async () => {
    const {
      ensureRegistryLoaded,
      getAllTools,
      getToolById,
      getToolsByCategory,
      getCategories,
      resolveToolModuleUrl,
      clearToolRegistryCache
    } = await import('../extension/core/toolRegistry.js');

    await ensureRegistryLoaded();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const tools = await getAllTools();
    expect(tools).toHaveLength(3);
    // Tools should be sorted by order/name (fallback order=1, alpha/mock order=2 sorted alphabetically)
    expect(tools.map((t) => t.id)).toEqual(['fallback-tool', 'alpha-tool', 'mock-tool']);

    const tool = await getToolById('mock-tool');
    expect(tool.name).toBe('Mock Tool');

    const inspectTools = await getToolsByCategory('inspect');
    const inspectIds = inspectTools.map(t => t.id).sort();
    expect(inspectIds).toEqual(['fallback-tool', 'mock-tool']);

    const categories = await getCategories();
    expect(categories[0].id).toBe('inspect');

    const moduleUrl = await resolveToolModuleUrl('mock-tool');
    expect(moduleUrl.endsWith('fixtures/mockToolModule.js')).toBe(true);

    await ensureRegistryLoaded();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    clearToolRegistryCache();
    await ensureRegistryLoaded();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('toolLoader loads modules and backfills metadata', async () => {
    const { loadToolModule, clearToolModule, activateTool } = await import('../extension/core/toolLoader.js');
    const { getToolById } = await import('../extension/core/toolRegistry.js');

    const tool = await getToolById('mock-tool');
    expect(tool).toBeDefined();

    const moduleWithMetadata = await loadToolModule('mock-tool');
    expect(moduleWithMetadata.metadata.id).toBe('mock-tool');
    expect(typeof moduleWithMetadata.activate).toBe('function');

    const moduleWithoutMetadata = await loadToolModule('fallback-tool');
    expect(moduleWithoutMetadata.metadata).toMatchObject({ id: 'fallback-tool', name: 'Fallback Tool' });

    clearToolModule('mock-tool');
    clearToolModule(); // clear all cache

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await activateTool('fallback-tool', () => {});
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('messageRouter helpers send and handle messages', async () => {
    const { createMessage, sendRuntimeMessage, sendTabMessage, addMessageListener, MESSAGE_TYPES } = await import('../extension/core/messageRouter.js');

    const payload = { example: true };
    expect(createMessage('TEST', payload)).toEqual({ type: 'TEST', payload });

    await sendRuntimeMessage('PING', { ping: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'PING', payload: { ping: true } });

    expect(() => sendTabMessage('abc', 'PING')).toThrow('numeric tabId');

    const handler = jest.fn(() => ({ ok: true }));
    const asyncHandler = jest.fn(() => Promise.resolve({ success: true }));
    const asyncNoResultHandler = jest.fn(() => Promise.resolve(undefined));
    const restHandler = jest.fn(() => undefined);
    const undefinedHandler = jest.fn(() => undefined);
    const errorHandler = jest.fn(() => { throw new Error('kaboom'); });
    addMessageListener({
      [MESSAGE_TYPES.ACTIVATE_TOOL]: handler,
      TEST_ASYNC: asyncHandler,
      TEST_ASYNC_NO_RESULT: asyncNoResultHandler,
      TEST_REST: restHandler,
      TEST_ERROR: errorHandler,
      undefined: undefinedHandler
    });

    const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();

    listener({ type: MESSAGE_TYPES.ACTIVATE_TOOL, payload: { toolId: 'mock-tool' } }, {}, sendResponse);
    expect(handler).toHaveBeenCalledWith({ toolId: 'mock-tool' }, {}, sendResponse, { type: MESSAGE_TYPES.ACTIVATE_TOOL, payload: { toolId: 'mock-tool' } });
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });

    await sendTabMessage(1, 'PING', { done: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'PING', payload: { done: true } });

    const asyncResponse = jest.fn();
    const asyncResult = listener({ type: 'TEST_ASYNC', payload: { value: true } }, {}, asyncResponse);
    expect(asyncResult).toBe(true);
    await asyncHandler.mock.results[0].value;
    expect(asyncHandler).toHaveBeenCalledWith({ value: true }, {}, asyncResponse, expect.any(Object));
    expect(asyncResponse).toHaveBeenCalledWith({ success: true });

    const asyncNoResultResponse = jest.fn();
    const asyncNoResult = listener({ type: 'TEST_ASYNC_NO_RESULT', payload: { muted: true } }, {}, asyncNoResultResponse);
    expect(asyncNoResult).toBe(true);
    await asyncNoResultHandler.mock.results[0].value;
    expect(asyncNoResultHandler).toHaveBeenCalled();
    expect(asyncNoResultResponse).not.toHaveBeenCalled();

    const restResponse = jest.fn();
    listener({ type: 'TEST_REST', foo: 'bar' }, {}, restResponse);
    expect(restHandler).toHaveBeenCalledWith({ foo: 'bar' }, {}, restResponse, { type: 'TEST_REST', foo: 'bar' });
    expect(restResponse).not.toHaveBeenCalled();

    const undefinedResponse = jest.fn();
    listener(undefined, {}, undefinedResponse);
    expect(undefinedHandler).toHaveBeenCalledWith({}, {}, undefinedResponse, undefined);
    expect(undefinedResponse).not.toHaveBeenCalled();

    const errorResponse = jest.fn();
    listener({ type: 'TEST_ERROR' }, {}, errorResponse);
    expect(errorHandler).toHaveBeenCalled();
    expect(errorResponse).toHaveBeenCalledWith({ success: false, error: 'kaboom' });
  });

  test('tool loader handles modules missing activate gracefully', async () => {
    const manifest = {
      categories: {},
      tools: [
        {
          id: 'no-activate-tool',
          name: 'No Activate Tool',
          category: 'utilities',
          module: 'fixtures/mockToolNoActivate.js',
          order: 3,
          icon: 'info'
        }
      ]
    };

    global.fetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifest)
    }));

    const { ensureRegistryLoaded, clearToolRegistryCache } = await import('../extension/core/toolRegistry.js');
    const { activateTool, clearToolModule } = await import('../extension/core/toolLoader.js');

    await ensureRegistryLoaded();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await activateTool('no-activate-tool', () => {});
    expect(warnSpy).toHaveBeenCalledWith('Toolboard: tool "no-activate-tool" does not export activate()');
    warnSpy.mockRestore();

    clearToolModule('no-activate-tool');
    clearToolRegistryCache();
  });

  test('resolveToolModuleUrl throws when module path missing', async () => {
    const manifest = {
      categories: {},
      tools: [
        {
          id: 'broken-tool',
          name: 'Broken Tool',
          category: 'inspect',
          module: '',
          order: 1,
          icon: 'info'
        }
      ]
    };

    global.fetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifest)
    }));

    const { clearToolRegistryCache, resolveToolModuleUrl } = await import('../extension/core/toolRegistry.js');
    clearToolRegistryCache();
    await expect(resolveToolModuleUrl('broken-tool')).rejects.toThrow('missing module path');
    await expect(resolveToolModuleUrl('missing-tool')).rejects.toThrow('Unknown tool');
  });

  test('toolRegistry resets cache on malformed manifest entries', async () => {
    const malformedManifest = {
      categories: {},
      tools: [
        { name: 'Broken entry without id' }
      ]
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(malformedManifest)
    }));

    const { ensureRegistryLoaded, clearToolRegistryCache } = await import('../extension/core/toolRegistry.js');
    await expect(ensureRegistryLoaded()).rejects.toThrow('Tool manifest entry missing id');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Toolboard: Unable to load tools manifest',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
    clearToolRegistryCache();
  });

  test('fetchManifest handles non-ok responses gracefully', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve({
      ok: false,
      status: 500
    }));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { ensureRegistryLoaded, clearToolRegistryCache } = await import('../extension/core/toolRegistry.js');
    await expect(ensureRegistryLoaded()).rejects.toThrow('Failed to load tools manifest (500)');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Toolboard: Unable to load tools manifest',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
    clearToolRegistryCache();
  });

  test('toolLoader enforces valid identifiers and propagates import errors', async () => {
    const { loadToolModule, clearToolModule } = await import('../extension/core/toolLoader.js');
    const { clearToolRegistryCache, ensureRegistryLoaded } = await import('../extension/core/toolRegistry.js');

    await expect(loadToolModule()).rejects.toThrow('requires a tool id');
    await expect(loadToolModule('unknown-tool')).rejects.toThrow('Unknown tool id');

    const faultyManifest = {
      categories: {},
      tools: [
        {
          id: 'faulty-tool',
          name: 'Faulty Tool',
          category: 'utilities',
          module: 'fixtures/nonExistentModule.js',
          order: 4,
          icon: 'info'
        }
      ]
    };

    global.fetch.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(faultyManifest)
    }));

    chrome.runtime.getURL.mockImplementation((filePath) => {
      if (filePath.startsWith('tools/fixtures/nonExistentModule.js')) {
        return fixturePath('fixtures/non-existent.js');
      }
      return fixturePath(filePath.replace(/^tools\//, ''));
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    clearToolRegistryCache();
    await expect(ensureRegistryLoaded()).resolves.toBeDefined();
    await expect(loadToolModule('faulty-tool')).rejects.toThrow();
    const lastCall = consoleSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('Toolboard: failed to load tool "faulty-tool"');
    expect(lastCall?.[1]).toBeTruthy();
    expect(lastCall?.[1].name).toMatch(/Error$/);
    consoleSpy.mockRestore();
    clearToolModule('faulty-tool');
    chrome.runtime.getURL.mockImplementation(defaultGetUrl);
  });

  test('messageRouter returns false when handler missing and handles rejected promises', async () => {
    const { addMessageListener } = await import('../extension/core/messageRouter.js');
    const rejectingHandler = jest.fn(() => Promise.reject(new Error('async failure')));
    addMessageListener({ TEST_REJECT: rejectingHandler });

    const listener = chrome.runtime.onMessage.addListener.mock.calls.slice(-1)[0][0];
    const missingResponse = jest.fn();
    const result = listener({ type: 'UNKNOWN' }, {}, missingResponse);
    expect(result).toBe(false);
    expect(missingResponse).not.toHaveBeenCalled();

    const rejectionResponse = jest.fn();
    const promiseResult = listener({ type: 'TEST_REJECT' }, {}, rejectionResponse);
    expect(promiseResult).toBe(true);
    await rejectingHandler.mock.results[0].value.catch(() => {});
    expect(rejectingHandler).toHaveBeenCalled();
    expect(rejectionResponse).toHaveBeenCalledWith({ success: false, error: 'async failure' });
  });
});
