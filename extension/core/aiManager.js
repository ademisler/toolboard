/* global AbortController */
// AI Manager Service for Toolboard
// Handles API key rotation, provider selection, and LLM API calls

import {
  AI_LANGUAGE_NAMES,
  AI_API_CONFIG,
  DEFAULT_AI_PROVIDER,
  getModelForTool,
  getProviderConfig,
  getProviderPreset
} from './aiConfig.js';
import { handleError } from '../shared/helpers.js';
import { encryptAIKeyEntries, decryptAIKeyEntries } from './secureStorage.js';

const STORAGE_KEYS = Object.freeze({
  API_KEYS: 'toolaryAIKeys',
  MODEL: 'toolaryAIModel',
  LANGUAGE: 'toolaryAILanguage',
  PROVIDER: 'toolaryAIProvider',
  PROVIDER_CONFIG: 'toolaryAIProviderConfig'
});

function normalizeProviderConfigInput(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }

  const normalized = { ...config };
  if (typeof normalized.baseUrl === 'string') normalized.baseUrl = normalized.baseUrl.trim();
  if (typeof normalized.path === 'string') normalized.path = normalized.path.trim();
  if (typeof normalized.authHeader === 'string') normalized.authHeader = normalized.authHeader.trim();
  if (typeof normalized.authPrefix === 'string') normalized.authPrefix = normalized.authPrefix;
  if (typeof normalized.smartModel === 'string') normalized.smartModel = normalized.smartModel.trim();
  if (typeof normalized.liteModel === 'string') normalized.liteModel = normalized.liteModel.trim();
  if (typeof normalized.defaultModel === 'string') normalized.defaultModel = normalized.defaultModel.trim();
  if (typeof normalized.requestFormat === 'string') normalized.requestFormat = normalized.requestFormat.trim().toLowerCase();
  if (typeof normalized.responseParser === 'string') normalized.responseParser = normalized.responseParser.trim().toLowerCase();
  if (typeof normalized.extraHeadersJson === 'string') normalized.extraHeadersJson = normalized.extraHeadersJson.trim();
  if (typeof normalized.bodyTemplate === 'string') normalized.bodyTemplate = normalized.bodyTemplate;

  return normalized;
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return fallback;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore JSON parse errors and use fallback.
  }

  return fallback;
}

function normalizePath(path = '') {
  if (!path) return '';
  if (path.startsWith('/')) return path;
  return `/${path}`;
}

function buildUrl(baseUrl, path = '') {
  const base = String(baseUrl || '').trim().replace(/\/$/, '');
  const normalizedPath = normalizePath(path);
  return `${base}${normalizedPath}`;
}

function parseOpenAIContent(rawContent) {
  if (typeof rawContent === 'string') {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function extractTextFromResponse(data, parser = 'openai') {
  if (!data || typeof data !== 'object') {
    return '';
  }

  if (parser === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return '';
  }

  if (parser === 'anthropic') {
    const content = data?.content;
    if (Array.isArray(content)) {
      return content
        .map((item) => (typeof item?.text === 'string' ? item.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return '';
  }

  // OpenAI-compatible (default)
  const choiceContent = data?.choices?.[0]?.message?.content;
  const openAiText = parseOpenAIContent(choiceContent);
  if (openAiText) {
    return openAiText.trim();
  }

  if (typeof data?.output_text === 'string') return data.output_text.trim();
  if (typeof data?.text === 'string') return data.text.trim();

  return '';
}

function buildAuthHeaderName(provider = {}) {
  return provider.authHeader || 'Authorization';
}

function buildAuthHeaderValue(provider = {}, apiKey = '') {
  const prefix = typeof provider.authPrefix === 'string' ? provider.authPrefix : 'Bearer ';
  return `${prefix}${apiKey}`;
}

function applyTemplate(template, context) {
  if (typeof template !== 'string' || !template.trim()) {
    return null;
  }

  const replaced = template
    .replace(/\{\{\s*prompt\s*\}\}/g, context.prompt)
    .replace(/\{\{\s*model\s*\}\}/g, context.model)
    .replace(/\{\{\s*languageInstruction\s*\}\}/g, context.languageInstruction || '');

  try {
    return JSON.parse(replaced);
  } catch {
    return null;
  }
}

class AIManager {
  constructor() {
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    this.keyStatus = new Map();
    this.userModelPreference = 'auto';
    this.userLanguagePreference = 'auto';
    this.userProviderPreference = DEFAULT_AI_PROVIDER;
    this.providerConfig = {};
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      await this.loadAPIKeys();
      await this.loadUserPreferences();
      this.isInitialized = true;
    } catch (error) {
      handleError(error, 'AIManager.initialize');
      throw error;
    }
  }

  async loadAPIKeys() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.API_KEYS]);
      const storedKeys = Array.isArray(result[STORAGE_KEYS.API_KEYS]) ? result[STORAGE_KEYS.API_KEYS] : [];
      const decryptedKeys = await decryptAIKeyEntries(storedKeys);
      this.apiKeys = decryptedKeys.map((entry) => ({
        value: entry.value || '',
        createdAt: entry.createdAt || Date.now()
      }));

      this.apiKeys.forEach((_, index) => {
        if (!this.keyStatus.has(index)) {
          this.keyStatus.set(index, {
            isHealthy: true,
            lastUsed: 0,
            errorCount: 0,
            rateLimitedUntil: 0
          });
        }
      });
    } catch (error) {
      handleError(error, 'AIManager.loadAPIKeys');
      this.apiKeys = [];
    }
  }

  async saveAPIKeys(keys) {
    try {
      this.apiKeys = keys.map((key) => ({
        value: key.value || '',
        createdAt: key.createdAt || Date.now()
      }));

      const storedKeys = await encryptAIKeyEntries(this.apiKeys);
      await chrome.storage.local.set({ [STORAGE_KEYS.API_KEYS]: storedKeys });

      this.keyStatus.clear();
      this.apiKeys.forEach((_, index) => {
        this.keyStatus.set(index, {
          isHealthy: true,
          lastUsed: 0,
          errorCount: 0,
          rateLimitedUntil: 0
        });
      });
    } catch (error) {
      handleError(error, 'AIManager.saveAPIKeys');
      throw error;
    }
  }

  async loadUserPreferences() {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.MODEL,
        STORAGE_KEYS.LANGUAGE,
        STORAGE_KEYS.PROVIDER,
        STORAGE_KEYS.PROVIDER_CONFIG
      ]);

      this.userModelPreference = result[STORAGE_KEYS.MODEL] || 'auto';
      this.userLanguagePreference = result[STORAGE_KEYS.LANGUAGE] || 'auto';
      this.userProviderPreference = result[STORAGE_KEYS.PROVIDER] || DEFAULT_AI_PROVIDER;
      this.providerConfig = normalizeProviderConfigInput(result[STORAGE_KEYS.PROVIDER_CONFIG] || {});
    } catch (error) {
      handleError(error, 'AIManager.loadUserPreferences');
      this.userModelPreference = 'auto';
      this.userLanguagePreference = 'auto';
      this.userProviderPreference = DEFAULT_AI_PROVIDER;
      this.providerConfig = {};
    }
  }

  getRuntimeProviderConfig(overrideProviderId = null, overrideProviderConfig = null) {
    const providerId = overrideProviderId || this.userProviderPreference || DEFAULT_AI_PROVIDER;
    const config = overrideProviderConfig ? normalizeProviderConfigInput(overrideProviderConfig) : this.providerConfig;

    const merged = getProviderConfig(providerId, config);
    const extraHeaders = parseJsonObject(merged.extraHeadersJson, merged.extraHeaders || {});

    return {
      ...merged,
      extraHeaders
    };
  }

  getNextAvailableKey() {
    if (this.apiKeys.length === 0) {
      return null;
    }

    const now = Date.now();
    const healthyKeys = [];

    for (let i = 0; i < this.apiKeys.length; i += 1) {
      const status = this.keyStatus.get(i);
      if (status && status.isHealthy && status.rateLimitedUntil <= now) {
        healthyKeys.push({ index: i, key: this.apiKeys[i], status });
      }
    }

    if (healthyKeys.length === 0) {
      return null;
    }

    healthyKeys.sort((a, b) => a.status.lastUsed - b.status.lastUsed);
    const selectedKey = healthyKeys[0];
    selectedKey.status.lastUsed = now;
    return selectedKey;
  }

  selectModel(toolId, userPreference = null, providerId = null, providerConfig = null) {
    const preference = userPreference || this.userModelPreference;
    const runtimeProvider = this.getRuntimeProviderConfig(providerId, providerConfig);
    return getModelForTool(toolId, preference, runtimeProvider.id, runtimeProvider);
  }

  async selectLanguage(userPreference = null) {
    const preference = userPreference || this.userLanguagePreference;

    if (preference === 'auto') {
      try {
        const stored = await chrome.storage.local.get(['browserLanguage', 'language']);

        if (stored?.browserLanguage) {
          return stored.browserLanguage;
        }

        const browserLang = navigator.language || navigator.languages?.[0] || 'en';
        return browserLang.split('-')[0].toLowerCase();
      } catch (error) {
        console.error('AI Manager: Error reading language preference:', error);
        return 'en';
      }
    }

    return preference;
  }

  async getLanguageInstruction(userPreference = null) {
    const language = await this.selectLanguage(userPreference);

    if (language === 'auto') {
      return '';
    }

    const languageName = AI_LANGUAGE_NAMES[language];
    if (languageName) {
      return `\n\nPlease respond in ${languageName}.`;
    }

    return '';
  }

  handleAPIError(error, keyIndex) {
    const status = this.keyStatus.get(keyIndex);
    if (!status) return;

    status.errorCount += 1;

    if (status.errorCount >= 3) {
      status.isHealthy = false;
      console.warn(`API key ${keyIndex} marked as unhealthy after ${status.errorCount} errors`);
    }

    if (error?.status === 429 || String(error?.message || '').includes('429')) {
      status.rateLimitedUntil = Date.now() + AI_API_CONFIG.RATE_LIMIT.COOLDOWN_PERIOD;
      console.warn(`API key ${keyIndex} rate limited until ${new Date(status.rateLimitedUntil)}`);
    }
  }

  resetKeyStatus(keyIndex) {
    const status = this.keyStatus.get(keyIndex);
    if (status) {
      status.errorCount = 0;
      status.isHealthy = true;
    }
  }

  buildRequestPayload(provider, prompt, model, languageInstruction = '') {
    const templatedBody = applyTemplate(provider.bodyTemplate, {
      prompt,
      model,
      languageInstruction
    });
    if (templatedBody) {
      return templatedBody;
    }

    const enhancedPrompt = `${prompt}${languageInstruction || ''}`;

    if (provider.requestFormat === 'gemini') {
      return {
        contents: [{
          parts: [{
            text: enhancedPrompt
          }]
        }]
      };
    }

    if (provider.requestFormat === 'anthropic') {
      return {
        model,
        max_tokens: AI_API_CONFIG.REQUEST.DEFAULT_MAX_TOKENS,
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }]
      };
    }

    // OpenAI-compatible (default)
    return {
      model,
      messages: [{
        role: 'user',
        content: enhancedPrompt
      }],
      temperature: 0.3
    };
  }

  buildRequestUrl(provider, model) {
    const baseUrl = provider.baseUrl || getProviderPreset(provider.id).baseUrl;

    if (provider.requestFormat === 'gemini') {
      const normalizedBase = String(baseUrl || '').trim().replace(/\/$/, '');
      return `${normalizedBase}/models/${model}:generateContent`;
    }

    const path = provider.path || getProviderPreset(provider.id).path || '/chat/completions';
    return buildUrl(baseUrl, path);
  }

  async makeAPIRequest(prompt, model, apiKey, provider, languageInstruction = '') {
    const url = this.buildRequestUrl(provider, model);

    if (!url || !/^https?:\/\//.test(url)) {
      throw new Error('Invalid provider endpoint URL. Check AI provider settings.');
    }

    const authHeaderName = buildAuthHeaderName(provider);
    const authHeaderValue = buildAuthHeaderValue(provider, apiKey);

    const headers = {
      'Content-Type': 'application/json',
      ...(provider.extraHeaders || {})
    };

    if (authHeaderName && apiKey) {
      headers[authHeaderName] = authHeaderValue;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_API_CONFIG.REQUEST.TIMEOUT_MS);

    let response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(this.buildRequestPayload(provider, prompt, model, languageInstruction)),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('LLM request timed out. Please try again.');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`API error: ${response.status}`);
      error.status = response.status;
      error.details = errorText;

      if (response.status === 401 || response.status === 403) {
        error.message = 'API key invalid or insufficient permissions';
      } else if (response.status === 429) {
        error.message = 'Rate limit exceeded';
      } else if (response.status >= 500) {
        error.message = 'Provider service is temporarily unavailable';
      } else if (response.status === 400) {
        error.message = 'Invalid request - check provider/model settings';
      }

      throw error;
    }

    const data = await response.json();
    const parser = provider.responseParser || provider.requestFormat || 'openai';
    const text = extractTextFromResponse(data, parser);

    if (!text) {
      throw new Error('Invalid response format from selected provider');
    }

    return text;
  }

  async callLLMAPI(prompt, options = {}) {
    const {
      toolId = 'unknown',
      maxRetries = AI_API_CONFIG.RETRY.MAX_ATTEMPTS,
      userModelPreference = null,
      userLanguagePreference = null,
      providerId = null,
      providerConfig = null
    } = options;

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.apiKeys.length === 0) {
      const runtimeProvider = this.getRuntimeProviderConfig(providerId, providerConfig);
      const error = new Error(`No API keys configured. Please add at least one API key for ${runtimeProvider.label || runtimeProvider.id}.`);
      error.code = 'NO_API_KEYS';
      throw error;
    }

    const runtimeProvider = this.getRuntimeProviderConfig(providerId, providerConfig);
    const model = this.selectModel(toolId, userModelPreference, runtimeProvider.id, runtimeProvider);
    const languageInstruction = await this.getLanguageInstruction(userLanguagePreference);

    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const keyData = this.getNextAvailableKey();

      if (!keyData) {
        throw new Error('No available API keys. All keys may be rate limited or unhealthy.');
      }

      try {
        const response = await this.makeAPIRequest(
          prompt,
          model,
          keyData.key.value,
          runtimeProvider,
          languageInstruction
        );

        this.resetKeyStatus(keyData.index);
        return response;
      } catch (error) {
        lastError = error;
        this.handleAPIError(error, keyData.index);

        if (attempt < maxRetries - 1) {
          const delay = AI_API_CONFIG.RETRY.BACKOFF_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('API call failed after all retries');
  }

  // Backward-compatible alias
  async callGeminiAPI(prompt, options = {}) {
    return this.callLLMAPI(prompt, options);
  }

  getAPIKeyStatus() {
    const now = Date.now();
    return this.apiKeys.map((_, index) => {
      const status = this.keyStatus.get(index);
      if (!status) {
        return { index, status: 'unknown', isHealthy: false };
      }

      let statusText = 'active';
      if (!status.isHealthy) {
        statusText = 'error';
      } else if (status.rateLimitedUntil > now) {
        statusText = 'rate_limited';
      }

      return {
        index,
        status: statusText,
        isHealthy: status.isHealthy,
        errorCount: status.errorCount,
        rateLimitedUntil: status.rateLimitedUntil
      };
    });
  }

  async setUserModelPreference(preference) {
    this.userModelPreference = preference;
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: preference });
    } catch (error) {
      handleError(error, 'AIManager.setUserModelPreference');
    }
  }

  async setUserLanguagePreference(preference) {
    this.userLanguagePreference = preference;
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: preference });
    } catch (error) {
      handleError(error, 'AIManager.setUserLanguagePreference');
    }
  }

  async setUserProviderPreference(providerId, providerConfig = null) {
    this.userProviderPreference = providerId || DEFAULT_AI_PROVIDER;
    if (providerConfig) {
      this.providerConfig = normalizeProviderConfigInput(providerConfig);
    }

    try {
      const payload = { [STORAGE_KEYS.PROVIDER]: this.userProviderPreference };
      if (providerConfig) {
        payload[STORAGE_KEYS.PROVIDER_CONFIG] = this.providerConfig;
      }
      await chrome.storage.local.set(payload);
    } catch (error) {
      handleError(error, 'AIManager.setUserProviderPreference');
    }
  }

  async testAPIKey(apiKey, options = {}) {
    try {
      const runtimeProvider = this.getRuntimeProviderConfig(options.providerId, options.providerConfig);
      const model = options.model || runtimeProvider.liteModel || runtimeProvider.defaultModel || runtimeProvider.smartModel;
      const response = await this.makeAPIRequest(
        'Hello, please respond with "API test successful"',
        model,
        apiKey,
        runtimeProvider,
        ''
      );

      if (response && response.toLowerCase().includes('successful')) {
        return { valid: true, error: null, response };
      }

      return { valid: true, error: null, response: 'API key is working' };
    } catch (error) {
      let errorMessage = error.message;

      if (String(errorMessage).includes('Rate limit')) {
        errorMessage = 'Rate limit exceeded';
      } else if (String(errorMessage).includes('Invalid request')) {
        errorMessage = 'Invalid request format or model';
      } else if (String(errorMessage).includes('invalid') || String(errorMessage).includes('permissions')) {
        errorMessage = 'API key is invalid or has insufficient permissions';
      }

      return { valid: false, error: errorMessage };
    }
  }
}

export const aiManager = new AIManager();
