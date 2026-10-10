// AI Configuration module for Toolboard
// Defines provider presets, model tiers, and language mapping

export const GEMINI_MODELS = Object.freeze({
  SMART: 'gemini-2.5-flash',
  LITE: 'gemini-2.5-flash-lite'
});

export const AI_MODEL_SELECTION = Object.freeze({
  AUTO: 'auto',
  SMART: 'smart',
  LITE: 'lite'
});

export const AI_LANGUAGES = Object.freeze({
  AUTO: 'auto',
  ENGLISH: 'en',
  TURKISH: 'tr',
  FRENCH: 'fr',
  SPANISH: 'es',
  GERMAN: 'de',
  ITALIAN: 'it',
  PORTUGUESE: 'pt',
  RUSSIAN: 'ru',
  CHINESE: 'zh',
  JAPANESE: 'ja',
  KOREAN: 'ko',
  ARABIC: 'ar',
  DUTCH: 'nl',
  SWEDISH: 'sv',
  NORWEGIAN: 'no',
  DANISH: 'da',
  FINNISH: 'fi',
  POLISH: 'pl',
  CZECH: 'cs',
  HUNGARIAN: 'hu',
  ROMANIAN: 'ro',
  BULGARIAN: 'bg',
  CROATIAN: 'hr',
  SERBIAN: 'sr',
  SLOVAK: 'sk',
  SLOVENIAN: 'sl',
  ESTONIAN: 'et',
  LATVIAN: 'lv',
  LITHUANIAN: 'lt',
  UKRAINIAN: 'uk',
  GREEK: 'el',
  HEBREW: 'he',
  HINDI: 'hi',
  THAI: 'th',
  VIETNAMESE: 'vi',
  INDONESIAN: 'id',
  MALAY: 'ms',
  FILIPINO: 'tl'
});

export const AI_LANGUAGE_NAMES = Object.freeze({
  auto: 'Auto (Browser Language)',
  en: 'English',
  tr: 'Türkçe',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  nl: 'Nederlands',
  sv: 'Svenska',
  no: 'Norsk',
  da: 'Dansk',
  fi: 'Suomi',
  pl: 'Polski',
  cs: 'Čeština',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  hr: 'Hrvatski',
  sr: 'Српски',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  et: 'Eesti',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  uk: 'Українська',
  el: 'Ελληνικά',
  he: 'עברית',
  hi: 'हिन्दी',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  tl: 'Filipino'
});

export const AI_PROVIDERS = Object.freeze({
  gemini: Object.freeze({
    id: 'gemini',
    label: 'Google Gemini',
    requestFormat: 'gemini',
    responseParser: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    path: '',
    authHeader: 'x-goog-api-key',
    authPrefix: '',
    smartModel: GEMINI_MODELS.SMART,
    liteModel: GEMINI_MODELS.LITE,
    defaultModel: GEMINI_MODELS.SMART,
    extraHeaders: {}
  }),
  openrouter: Object.freeze({
    id: 'openrouter',
    label: 'OpenRouter',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'openai/gpt-4.1',
    liteModel: 'openai/gpt-4o-mini',
    defaultModel: 'openai/gpt-4.1',
    extraHeaders: {}
  }),
  minimax: Object.freeze({
    id: 'minimax',
    label: 'MiniMax',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'MiniMax-M2.5',
    liteModel: 'MiniMax-M2.5-highspeed',
    defaultModel: 'MiniMax-M2.5',
    extraHeaders: {}
  }),
  openai: Object.freeze({
    id: 'openai',
    label: 'OpenAI',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'gpt-4.1',
    liteModel: 'gpt-4o-mini',
    defaultModel: 'gpt-4.1',
    extraHeaders: {}
  }),
  groq: Object.freeze({
    id: 'groq',
    label: 'Groq',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'openai/gpt-oss-120b',
    liteModel: 'openai/gpt-oss-20b',
    defaultModel: 'openai/gpt-oss-120b',
    extraHeaders: {}
  }),
  together: Object.freeze({
    id: 'together',
    label: 'Together AI',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    liteModel: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    extraHeaders: {}
  }),
  mistral: Object.freeze({
    id: 'mistral',
    label: 'Mistral',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'mistral-large-latest',
    liteModel: 'mistral-small-latest',
    defaultModel: 'mistral-large-latest',
    extraHeaders: {}
  }),
  fireworks: Object.freeze({
    id: 'fireworks',
    label: 'Fireworks AI',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'accounts/fireworks/models/qwen3-235b-a22b',
    liteModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    defaultModel: 'accounts/fireworks/models/qwen3-235b-a22b',
    extraHeaders: {}
  }),
  deepseek: Object.freeze({
    id: 'deepseek',
    label: 'DeepSeek',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.deepseek.com',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'deepseek-chat',
    liteModel: 'deepseek-chat',
    defaultModel: 'deepseek-chat',
    extraHeaders: {}
  }),
  anthropic: Object.freeze({
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    requestFormat: 'anthropic',
    responseParser: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    path: '/v1/messages',
    authHeader: 'x-api-key',
    authPrefix: '',
    smartModel: 'claude-sonnet-4-20250514',
    liteModel: 'claude-3-5-haiku-latest',
    defaultModel: 'claude-sonnet-4-20250514',
    extraHeaders: {
      'anthropic-version': '2023-06-01'
    }
  }),
  xai: Object.freeze({
    id: 'xai',
    label: 'xAI (Grok)',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'grok-4-1-fast-reasoning',
    liteModel: 'grok-code-fast-1',
    defaultModel: 'grok-4-1-fast-reasoning',
    extraHeaders: {}
  }),
  perplexity: Object.freeze({
    id: 'perplexity',
    label: 'Perplexity',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: 'sonar-pro',
    liteModel: 'sonar',
    defaultModel: 'sonar-pro',
    extraHeaders: {}
  }),
  custom: Object.freeze({
    id: 'custom',
    label: 'Custom (Fetch Wrapper)',
    requestFormat: 'openai',
    responseParser: 'openai',
    baseUrl: '',
    path: '/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    smartModel: '',
    liteModel: '',
    defaultModel: '',
    extraHeaders: {}
  })
});

export const DEFAULT_AI_PROVIDER = 'gemini';

// Tool-to-model mapping configuration
// Defines which model tier each tool should use by default
export const TOOL_MODEL_MAPPING = Object.freeze({
  'ai-text-summarizer': 'lite',
  'ai-code-explainer': 'smart'
});

function normalizeProviderId(providerId) {
  if (typeof providerId !== 'string' || !providerId.trim()) {
    return DEFAULT_AI_PROVIDER;
  }
  const normalized = providerId.trim().toLowerCase();
  return AI_PROVIDERS[normalized] ? normalized : DEFAULT_AI_PROVIDER;
}

function normalizeProviderConfig(config = {}) {
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
  if (typeof normalized.responseParser === 'string') normalized.responseParser = normalized.responseParser.trim().toLowerCase();
  if (typeof normalized.requestFormat === 'string') normalized.requestFormat = normalized.requestFormat.trim().toLowerCase();
  if (typeof normalized.extraHeadersJson === 'string') normalized.extraHeadersJson = normalized.extraHeadersJson.trim();
  if (typeof normalized.bodyTemplate === 'string') normalized.bodyTemplate = normalized.bodyTemplate;
  return normalized;
}

export function getProviderPreset(providerId = DEFAULT_AI_PROVIDER) {
  const resolved = normalizeProviderId(providerId);
  return { ...AI_PROVIDERS[resolved] };
}

export function getProviderConfig(providerId = DEFAULT_AI_PROVIDER, providerConfig = {}) {
  const preset = getProviderPreset(providerId);
  const overrides = normalizeProviderConfig(providerConfig);
  return {
    ...preset,
    ...overrides,
    extraHeaders: {
      ...(preset.extraHeaders || {}),
      ...(overrides.extraHeaders || {})
    },
    id: normalizeProviderId(providerId)
  };
}

// Model selection logic
export function getModelForTool(toolId, userPreference = 'auto', providerId = DEFAULT_AI_PROVIDER, providerConfig = {}) {
  const provider = getProviderConfig(providerId, providerConfig);

  const smartModel = provider.smartModel || provider.defaultModel || GEMINI_MODELS.SMART;
  const liteModel = provider.liteModel || smartModel || GEMINI_MODELS.LITE;

  // If user has set a specific preference, use it
  if (userPreference !== 'auto') {
    return userPreference === 'smart' ? smartModel : liteModel;
  }

  // Otherwise, use tool-specific mapping
  const toolModel = TOOL_MODEL_MAPPING[toolId];
  if (toolModel) {
    return toolModel === 'smart' ? smartModel : liteModel;
  }

  // Default to smart model if no mapping found
  return smartModel;
}

// API configuration
export const AI_API_CONFIG = Object.freeze({
  RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 60,
    COOLDOWN_PERIOD: 60000 // 1 minute
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    BACKOFF_DELAY: 1000 // 1 second base delay
  },
  REQUEST: {
    TIMEOUT_MS: 45000,
    DEFAULT_MAX_TOKENS: 1024
  }
});
