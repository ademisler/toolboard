import { jest } from '@jest/globals';

function makeStorageGet(data) {
  return jest.fn(async (keys) => {
    if (!keys) return { ...data };
    if (typeof keys === 'string') return { [keys]: data[keys] };
    if (Array.isArray(keys)) {
      const result = {};
      keys.forEach((key) => {
        result[key] = data[key];
      });
      return result;
    }
    if (typeof keys === 'object') {
      const result = {};
      Object.keys(keys).forEach((key) => {
        result[key] = key in data ? data[key] : keys[key];
      });
      return result;
    }
    return {};
  });
}

function setupFetchWithApiHandler(apiHandler) {
  global.fetch = jest.fn(async (url, options) => {
    if (typeof url === 'string' && url.startsWith('chrome-extension://test/_locales/')) {
      return {
        ok: true,
        json: async () => ({})
      };
    }
    return apiHandler(url, options);
  });
}

function getProviderFetchCalls() {
  return global.fetch.mock.calls.filter(([url]) => {
    return typeof url === 'string' && !url.startsWith('chrome-extension://test/_locales/');
  });
}

describe('AI provider config', () => {
  test('resolves provider presets and model tiers', async () => {
    const { getProviderPreset, getProviderConfig, getModelForTool } = await import('../extension/core/aiConfig.js');

    const preset = getProviderPreset('openrouter');
    expect(preset.id).toBe('openrouter');
    expect(preset.requestFormat).toBe('openai');

    const merged = getProviderConfig('openrouter', {
      smartModel: 'custom-smart-model',
      extraHeaders: { 'X-Test': 'ok' }
    });
    expect(merged.smartModel).toBe('custom-smart-model');
    expect(merged.extraHeaders['X-Test']).toBe('ok');

    const autoModel = getModelForTool('ai-text-summarizer', 'auto', 'openrouter', merged);
    const smartModel = getModelForTool('ai-text-summarizer', 'smart', 'openrouter', merged);
    const liteModel = getModelForTool('ai-text-summarizer', 'lite', 'openrouter', merged);

    expect(autoModel).toBe(merged.liteModel || merged.smartModel);
    expect(smartModel).toBe('custom-smart-model');
    expect(liteModel).toBe(merged.liteModel || merged.smartModel);
  });
});

describe('AIManager multi-provider', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('calls OpenAI-compatible provider through callGeminiAPI alias', async () => {
    const storageData = {
      toolaryAIKeys: [{ value: 'key-openai', createdAt: Date.now() }],
      toolaryAIModel: 'smart',
      toolaryAILanguage: 'en',
      toolaryAIProvider: 'openai',
      toolaryAIProviderConfig: {
        smartModel: 'gpt-4.1',
        liteModel: 'gpt-4o-mini'
      }
    };

    chrome.storage.local.get = makeStorageGet(storageData);
    setupFetchWithApiHandler(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello from openai provider' } }]
      })
    }));

    const { aiManager } = await import('../extension/core/aiManager.js');
    const response = await aiManager.callGeminiAPI('Say hello', { toolId: 'ai-chat' });

    expect(response).toContain('hello from openai provider');
    const providerCalls = getProviderFetchCalls();
    expect(providerCalls).toHaveLength(1);
    const [url, req] = providerCalls[0];
    expect(url).toContain('api.openai.com');
    expect(req.headers.Authorization).toBe('Bearer key-openai');
  });

  test('supports Gemini response format with x-goog-api-key header', async () => {
    const storageData = {
      toolaryAIKeys: [{ value: 'gem-key', createdAt: Date.now() }],
      toolaryAIModel: 'smart',
      toolaryAILanguage: 'en',
      toolaryAIProvider: 'gemini',
      toolaryAIProviderConfig: {}
    };

    chrome.storage.local.get = makeStorageGet(storageData);
    setupFetchWithApiHandler(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'gemini response' }] } }]
      })
    }));

    const { aiManager } = await import('../extension/core/aiManager.js');
    const response = await aiManager.callLLMAPI('Summarize this', { toolId: 'ai-text-summarizer' });

    expect(response).toBe('gemini response');
    const providerCalls = getProviderFetchCalls();
    const [url, req] = providerCalls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(req.headers['x-goog-api-key']).toBe('gem-key');
  });

  test('supports Anthropic response format', async () => {
    const storageData = {
      toolaryAIKeys: [{ value: 'anthropic-key', createdAt: Date.now() }],
      toolaryAIProvider: 'anthropic',
      toolaryAIProviderConfig: {},
      toolaryAIModel: 'smart',
      toolaryAILanguage: 'en'
    };

    chrome.storage.local.get = makeStorageGet(storageData);
    setupFetchWithApiHandler(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: 'anthropic response' }]
      })
    }));

    const { aiManager } = await import('../extension/core/aiManager.js');
    const response = await aiManager.callLLMAPI('Explain this', { toolId: 'ai-content-detector' });

    expect(response).toBe('anthropic response');
    const providerCalls = getProviderFetchCalls();
    const [url, req] = providerCalls[0];
    expect(url).toContain('/v1/messages');
    expect(req.headers['x-api-key']).toBe('anthropic-key');
    expect(req.headers['anthropic-version']).toBeDefined();
  });

  test('rotates keys when first key is rate-limited', async () => {
    const storageData = {
      toolaryAIKeys: [
        { value: 'key-1', createdAt: Date.now() },
        { value: 'key-2', createdAt: Date.now() }
      ],
      toolaryAIModel: 'smart',
      toolaryAILanguage: 'en',
      toolaryAIProvider: 'openrouter',
      toolaryAIProviderConfig: {
        smartModel: 'openai/gpt-4.1',
        liteModel: 'openai/gpt-4o-mini'
      }
    };

    chrome.storage.local.get = makeStorageGet(storageData);

    let providerCallCount = 0;
    setupFetchWithApiHandler(async () => {
      providerCallCount += 1;
      if (providerCallCount === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => 'rate limit'
        };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'fallback key worked' } }] })
      };
    });

    const { aiManager } = await import('../extension/core/aiManager.js');
    const response = await aiManager.callLLMAPI('Retry if needed', {
      toolId: 'ai-chat',
      maxRetries: 2
    });

    expect(response).toBe('fallback key worked');
    expect(getProviderFetchCalls()).toHaveLength(2);
  });

  test('returns clear error when no keys configured', async () => {
    const storageData = {
      toolaryAIKeys: [],
      toolaryAIModel: 'auto',
      toolaryAILanguage: 'auto',
      toolaryAIProvider: 'openai',
      toolaryAIProviderConfig: {}
    };

    chrome.storage.local.get = makeStorageGet(storageData);
    setupFetchWithApiHandler(async () => ({
      ok: true,
      json: async () => ({})
    }));

    const { aiManager } = await import('../extension/core/aiManager.js');
    await expect(aiManager.callLLMAPI('x', { toolId: 'ai-chat' })).rejects.toThrow('No API keys configured');
    expect(getProviderFetchCalls()).toHaveLength(0);
  });

  test('validates testAPIKey with provider override', async () => {
    const storageData = {
      toolaryAIKeys: [{ value: 'main-key', createdAt: Date.now() }],
      toolaryAIModel: 'smart',
      toolaryAILanguage: 'en',
      toolaryAIProvider: 'openai',
      toolaryAIProviderConfig: {}
    };

    chrome.storage.local.get = makeStorageGet(storageData);
    setupFetchWithApiHandler(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'API test successful' } }] })
    }));

    const { aiManager } = await import('../extension/core/aiManager.js');
    const result = await aiManager.testAPIKey('override-key', {
      providerId: 'openrouter',
      providerConfig: {
        smartModel: 'openai/gpt-4.1',
        liteModel: 'openai/gpt-4o-mini'
      }
    });

    expect(result.valid).toBe(true);
    const providerCalls = getProviderFetchCalls();
    expect(providerCalls.length).toBeGreaterThan(0);
    const [, req] = providerCalls[0];
    expect(req.headers.Authorization).toBe('Bearer override-key');
  });

  test('handles invalid custom endpoint quickly', async () => {
    const storageData = {
      toolaryAIKeys: [{ value: 'custom-key', createdAt: Date.now() }],
      toolaryAIModel: 'smart',
      toolaryAILanguage: 'en',
      toolaryAIProvider: 'custom',
      toolaryAIProviderConfig: {
        baseUrl: 'not-a-url',
        path: '/chat/completions',
        smartModel: 'any-model',
        liteModel: 'any-model',
        authHeader: 'Authorization',
        authPrefix: 'Bearer '
      }
    };

    chrome.storage.local.get = makeStorageGet(storageData);
    setupFetchWithApiHandler(async () => ({
      ok: true,
      json: async () => ({})
    }));

    const { aiManager } = await import('../extension/core/aiManager.js');
    await expect(aiManager.callLLMAPI('test', { toolId: 'ai-chat' })).rejects.toThrow('Invalid provider endpoint URL');
    expect(getProviderFetchCalls()).toHaveLength(0);
  });
});
