import { createIconElement, getIconDefinition } from './icons.js';

// Helper utilities for Toolboard
const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr'];
let langMap = {};
let userTheme = 'system';
const themedElements = new Set();
const HISTORY_LIMIT = 40;
const STORAGE_KEYS = {
  history: 'toolaryHistory',
  legacyHistory: 'toolaryLegacyHistory'
};
const themeMediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

// Event listener cleanup system
const activeListeners = new Map();

export function addEventListenerWithCleanup(element, event, handler, options = {}) {
  const key = `${element.constructor.name}-${event}`;
  if (!activeListeners.has(key)) {
    activeListeners.set(key, []);
  }
  
  element.addEventListener(event, handler, options);
  activeListeners.get(key).push({ element, handler, options });
  
  return () => {
    element.removeEventListener(event, handler, options);
    const listeners = activeListeners.get(key);
    const index = listeners.findIndex(l => l.element === element && l.handler === handler);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

export function cleanupAllEventListeners() {
  for (const [key, listeners] of activeListeners) {
    for (const { element, handler, options } of listeners) {
      element.removeEventListener(key.split('-')[1], handler, options);
    }
    listeners.length = 0;
  }
  activeListeners.clear();
  console.debug('All event listeners cleaned up');
}

const TYPE_ICON_MAP = {
  color: 'color',
  text: 'text',
  element: 'element',
  link: 'link',
  font: 'font',
  image: 'image',
  screenshot: 'screenshot',
  'site-info': 'site',
  media: 'media',
  notes: 'note',
  sticky: 'note'
};

export function getIconName(type, fallback = 'info') {
  if (!type) return fallback;
  if (TYPE_ICON_MAP[type]) return TYPE_ICON_MAP[type];
  if (getIconDefinition(type)) return type;
  return fallback;
}

export function renderIcon(name, options = {}) {
  return createIconElement(getIconName(name, name), options);
}

export function generateId(prefix = 'id') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch (error) {
    console.debug('generateId randomUUID failed', error);
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

// Performance utilities with enhanced error handling
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  let lastFunc;
  let lastRan;
  
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      lastRan = Date.now();
      inThrottle = true;
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(this, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// Optimized DOM query caching
const queryCache = new Map();
const QUERY_CACHE_SIZE = 50;

export function cachedQuerySelector(selector, context = document) {
  const key = `${context.constructor.name}-${selector}`;
  
  if (queryCache.has(key)) {
    return queryCache.get(key);
  }
  
  if (queryCache.size >= QUERY_CACHE_SIZE) {
    queryCache.clear();
  }
  
  const result = context.querySelector(selector);
  queryCache.set(key, result);
  return result;
}

export function cachedQuerySelectorAll(selector, context = document) {
  const key = `${context.constructor.name}-${selector}-all`;
  
  if (queryCache.has(key)) {
    return queryCache.get(key);
  }
  
  if (queryCache.size >= QUERY_CACHE_SIZE) {
    queryCache.clear();
  }
  
  const result = Array.from(context.querySelectorAll(selector));
  queryCache.set(key, result);
  return result;
}

// Cache for computed styles and DOM queries
const styleCache = new Map();
const MAX_CACHE_SIZE = 100;

export function getCachedComputedStyle(element) {
  const key = `${element.tagName}-${element.id}-${element.className}`;
  if (!styleCache.has(key)) {
    // Check cache size and cleanup if needed
    if (styleCache.size >= MAX_CACHE_SIZE) {
      clearStyleCache();
    }
    styleCache.set(key, getComputedStyle(element));
  }
  return styleCache.get(key);
}

export function clearStyleCache() {
  styleCache.clear();
  console.debug('Style cache cleared');
}

export function getCacheStats() {
  return {
    size: styleCache.size,
    maxSize: MAX_CACHE_SIZE,
    usage: Math.round((styleCache.size / MAX_CACHE_SIZE) * 100)
  };
}


function normalizeLanguageCode(code = 'en') {
  const normalized = String(code || 'en').trim().toLowerCase();
  if (!normalized) {
    return { full: 'en', base: 'en' };
  }
  const [base] = normalized.split('-');
  return { full: normalized, base: base || normalized };
}

function resolveLanguageCode(preferred = 'en') {
  const { full, base } = normalizeLanguageCode(preferred);
  if (SUPPORTED_LANGUAGES.includes(full)) return full;
  if (SUPPORTED_LANGUAGES.includes(base)) return base;
  return 'en';
}

export async function loadLanguage(lang = 'en') {
  const resolved = resolveLanguageCode(lang);
  const baseCandidate = resolveLanguageCode(normalizeLanguageCode(resolved).base);
  const candidates = [...new Set([resolved, baseCandidate, 'en'])];

  if (typeof fetch !== 'function') {
    console.debug('Language file loading skipped: fetch is not available in this context');
    return;
  }

  for (const candidate of candidates) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        const res = await fetch(chrome.runtime.getURL(`_locales/${candidate}/messages.json`));
        if (res.ok) {
          langMap = await res.json();
          langMap.__current = candidate;
          return;
        }
      }
    } catch (error) {
      console.debug(`Language file not found for ${candidate}`, error);
    }
  }

  langMap = {};
}

// Language loading state management
let languageLoadPromise = null;
let languageReady = false;

// Check if language is ready
export function isLanguageReady() {
  return languageReady && langMap && Object.keys(langMap).length > 0;
}

// Ensure language is loaded before proceeding
export async function ensureLanguageLoaded() {
  // If already loaded, return immediately
  if (isLanguageReady()) {
    return;
  }

  // If loading is in progress, wait for it
  if (languageLoadPromise) {
    return languageLoadPromise;
  }

  // Start loading language
  languageLoadPromise = (async () => {
    try {
      // First, try to wait for initializePreferences to complete
      if (typeof chrome !== 'undefined' && chrome.storage) {
        // Wait a bit for initializePreferences to complete
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Check if language is already loaded by initializePreferences
        if (isLanguageReady()) {
          return true;
        }
      }

      // Get current language from storage
      let language = 'en';
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const stored = await chrome.storage.local.get(['language']);
        language = stored.language || 'en';
      }

      // Load the language
      await loadLanguage(language);
      
      // Mark as ready
      languageReady = true;
      
      return true;
    } catch (error) {
      console.error('Failed to load language:', error);
      // Fallback to English
      await loadLanguage('en');
      languageReady = true;
      return false;
    }
  })();

  return languageLoadPromise;
}

function getEffectiveTheme() {
  if (userTheme === 'light' || userTheme === 'dark') {
    return userTheme;
  }
  return themeMediaQuery?.matches ? 'dark' : 'light';
}

export function applyTheme(el) {
  if (!el) return;
  const theme = getEffectiveTheme();
  el.classList.remove('light-theme', 'dark-theme');
  el.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
  themedElements.add(el);
}

function refreshThemedElements() {
  themedElements.forEach(element => {
    if (element.isConnected) {
      element.classList.remove('light-theme', 'dark-theme');
      element.classList.add(getEffectiveTheme() === 'dark' ? 'dark-theme' : 'light-theme');
    } else {
      themedElements.delete(element);
    }
  });
}

if (themeMediaQuery) {
  const handleSystemThemeChange = () => {
    if (userTheme === 'system') {
      refreshThemedElements();
    }
  };
  if (typeof themeMediaQuery.addEventListener === 'function') {
    themeMediaQuery.addEventListener('change', handleSystemThemeChange);
  } else if (typeof themeMediaQuery.addListener === 'function') {
    themeMediaQuery.addListener(handleSystemThemeChange);
  }
}

async function initializePreferences() {
  if (typeof chrome === 'undefined') {
    await loadLanguage('en');
    languageReady = true;
    userTheme = 'system';
    return;
  }

  try {
    const stored = await chrome.storage.local.get(['language', 'theme']);

    let language = stored.language;
    if (!language) {
      const browserLang = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en');
      const detected = resolveLanguageCode(browserLang);
      // Only use detected language if it's supported (en, tr, fr)
      language = ['en', 'tr', 'fr'].includes(detected) ? detected : 'en';
      await chrome.storage.local.set({ language });
    }
    await loadLanguage(language);
    languageReady = true;

    const storedTheme = stored.theme;
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
      userTheme = storedTheme;
    } else {
      userTheme = 'system';
      await chrome.storage.local.set({ theme: 'system' });
    }
  } catch (error) {
    handleError(error, 'initializePreferences');
    await loadLanguage('en');
    languageReady = true;
    userTheme = 'system';
  }
}

if (typeof chrome !== 'undefined') {
  // Initialize preferences and set up language loading
  initializePreferences();

  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.language) {
      // Reset language loading state
      languageLoadPromise = null;
      languageReady = false;
      await loadLanguage(changes.language.newValue || 'en');
      languageReady = true;
    }
    if (changes.theme) {
      const next = changes.theme.newValue;
      userTheme = next === 'light' || next === 'dark' ? next : 'system';
      if (userTheme === 'system') {
        refreshThemedElements();
      }
      if (userTheme !== 'system') {
        refreshThemedElements();
      }
    }
  });
} else {
  loadLanguage('en');
  languageReady = true;
}

// Ensure chrome.i18n.getMessage respects runtime language (fallback to our loaded langMap)
try {
  if (typeof chrome !== 'undefined') {
    const originalGetMessage = chrome.i18n && typeof chrome.i18n.getMessage === 'function'
      ? chrome.i18n.getMessage.bind(chrome.i18n)
      : null;
    chrome.i18n = chrome.i18n || {};
    chrome.i18n.getMessage = (name, substitutions) => {
      try {
        if (langMap && langMap[name] && typeof langMap[name].message === 'string') {
          return formatMessage(langMap[name].message, substitutions);
        }
      } catch {
        // fall through to original
      }
      if (originalGetMessage) {
        try {
          return originalGetMessage(name, substitutions);
        } catch {
          // ignore
        }
      }
      return typeof name === 'string' ? name : '';
    };
  }
} catch {
  // Non-fatal if we cannot override
}

// Format message templates like "$1", "$2" replacements
function formatMessage(template, substitutions) {
  if (template == null) return '';
  if (substitutions == null) return String(template);
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  let output = String(template);
  for (let i = 0; i < values.length; i++) {
    const needle = new RegExp(`\\$${i + 1}`, 'g');
    output = output.replace(needle, String(values[i]));
  }
  return output;
}

export function t(id, substitutions = undefined) {
  if (langMap[id] && typeof langMap[id].message === 'string') {
    return formatMessage(langMap[id].message, substitutions);
  }
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    try {
      const msg = chrome.i18n.getMessage(id, substitutions);
      if (msg) return msg;
    } catch {
      // ignore
    }
  }
  return typeof id === 'string' ? id : '';
}

export function getCurrentUILanguage() {
  return (langMap && langMap.__current) || 'en';
}

export function createOverlay() {
  const box = document.createElement('div');
  box.id = 'toolary-highlight-overlay';
  document.body.appendChild(box);
  return box;
}

export function removeOverlay(box) {
  if (!box) return;

  if (typeof box.remove === 'function') {
    box.remove();
    return;
  }

  if (box.parentNode && typeof box.parentNode.removeChild === 'function') {
    box.parentNode.removeChild(box);
  }
}

export function createTooltip() {
  const tip = document.createElement('div');
  tip.id = 'toolary-tooltip';
  document.body.appendChild(tip);
  return tip;
}

export function removeTooltip(tip) {
  if (!tip) return;

  if (typeof tip.remove === 'function') {
    tip.remove();
    return;
  }

  if (tip.parentNode && typeof tip.parentNode.removeChild === 'function') {
    tip.parentNode.removeChild(tip);
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    // Text copied successfully
  } catch (err) {
    handleError(err, 'copyText primary method');
    // Fallback for browsers that don't support navigator.clipboard.writeText
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed'; // Prevent scrolling to bottom of page in MS Edge.
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      handleError(err, 'copyText fallback method');
      showToast(t('copyFailed'), 3000);
      throw new Error('Copy operation failed');
    }
    document.body.removeChild(textArea);
  }
}

// Enhanced error handling system
export class ToolboardError extends Error {
  constructor(message, type = 'UNKNOWN', context = {}) {
    super(message);
    this.name = 'ToolboardError';
    this.type = type;
    this.context = context;
    this.timestamp = Date.now();
  }
}

export function handleError(error, context = '') {
  const errorInfo = {
    message: error.message,
    type: error.type || 'UNKNOWN',
    context: context,
    timestamp: Date.now(),
    stack: error.stack
  };
  
  console.error(`[Toolboard Error] ${context}:`, errorInfo);
  
  // Send to error reporting service if available
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'ERROR_REPORT',
      error: errorInfo
    }).catch(() => {
      // Ignore if background script is not available
    });
  }
  
  return errorInfo;
}

export function safeExecute(fn, context = '', fallback = null) {
  try {
    return fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

export async function safeExecuteAsync(fn, context = '', fallback = null) {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

export function normalizeUrlForStorage(rawUrl) {
  if (rawUrl === null || rawUrl === undefined) return '';

  const trimmed = String(rawUrl).trim();
  if (!trimmed) return '';

  const withoutControlChars = trimmed.replace(/[\u0000-\u001F]/g, '');
  const withoutJavascript = withoutControlChars.replace(/^javascript:/i, '');
  const sanitizedFallback = withoutJavascript.replace(/["'<>`]/g, '');

  const bases = [];
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.href) {
      bases.push(window.location.href);
    }
    if (window.location.origin) {
      bases.push(window.location.origin);
    }
  }
  bases.push(undefined);

  for (const candidate of [withoutJavascript, sanitizedFallback]) {
    if (!candidate) {
      continue;
    }

    const isLikelyUrl = candidate.includes('://') || candidate.startsWith('//') || candidate.startsWith('/');
    if (!isLikelyUrl) {
      continue;
    }

    for (const base of bases) {
      try {
        const parsed = base ? new URL(candidate, base) : new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          continue;
        }
        return parsed.toString();
      } catch {
        // Ignore and try next candidate/base combination
      }
    }
  }

  return sanitizedFallback;
}

// Security utilities
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';

  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function safeSetInnerHTML(element, content) {
  if (!element || typeof content !== 'string') return;
  
  // Use textContent instead of innerHTML for security
  element.textContent = content;
}

// Safe function to create textarea with content
export function createSafeTextarea(content, styles = 'width: 100%; height: 200px;') {
  const textarea = document.createElement('textarea');
  textarea.style.cssText = styles;
  textarea.textContent = content; // Safe: using textContent instead of innerHTML
  return textarea;
}

export function validateUrl(url) {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

export function validateSelector(selector) {
  if (typeof selector !== 'string') return false;
  
  // Basic validation for CSS selectors
  const dangerousPatterns = [
    /javascript:/i,
    /on\w+=/i,
    /<script/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(selector));
}

export function showError(message, duration = 3000) {
  showToast(message, duration, 'error');
}

export function showSuccess(message, duration = 2000) {
  showToast(message, duration, 'success');
}

export function showWarning(message, duration = 2500) {
  showToast(message, duration, 'warning');
}

export function showInfo(message, duration = 2000) {
  showToast(message, duration, 'info');
}

// Show AI API key warning with onboarding-style highlight
export function showAIAPIWarning(toolName = 'AI tool') {
  // Show onboarding-style highlight for settings
  setTimeout(() => {
    showAISettingsHighlight(toolName);
  }, 1000);
}

// Show onboarding-style highlight for AI settings (independent system)
function showAISettingsHighlight(toolName) {
  // Check if we're in popup context
  if (typeof window === 'undefined' || !document.getElementById('popup')) {
    // If not in popup, try to open settings
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'openSettings' });
    }
    return;
  }
  
  // Create AI warning overlay
  createAIWarningOverlay(toolName);
}

// Create independent AI warning overlay (inspired by onboarding design)
function createAIWarningOverlay(toolName) {
  // Remove existing AI warning if any
  const existingOverlay = document.getElementById('ai-warning-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'ai-warning-overlay';
  overlay.className = 'ai-warning-overlay';
  overlay.innerHTML = `
    <div class="ai-warning-backdrop"></div>
    <div class="ai-warning-spotlight"></div>
    <div class="ai-warning-tooltip">
      <div class="ai-warning-tooltip__header">
        <div class="ai-warning-tooltip__icon">⚠️</div>
        <button class="ai-warning-tooltip__close" aria-label="Close">×</button>
      </div>
      <div class="ai-warning-tooltip__content">
        <h3 class="ai-warning-tooltip__title">${t('aiApiKeyRequiredTitle', 'AI API Key Required')}</h3>
        <p class="ai-warning-tooltip__description">${t('aiApiKeyRequiredDescription', `To use ${toolName}, you need to add your Gemini API key in the settings. Click the settings button to configure AI settings.`)}</p>
        <div class="ai-warning-tooltip__actions">
          <button class="ai-warning-tooltip__btn ai-warning-tooltip__btn--primary" id="ai-warning-open-settings">
            ${t('openSettings', 'Open Settings')}
          </button>
          <button class="ai-warning-tooltip__btn ai-warning-tooltip__btn--secondary" id="ai-warning-close">
            ${t('close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Position the highlight
  positionAIWarningHighlight();
  
  // Add event listeners
  overlay.querySelector('#ai-warning-open-settings').addEventListener('click', () => {
    // Open settings panel
    if (typeof window.openSettingsPanel === 'function') {
      window.openSettingsPanel();
      // Switch to AI tab
      setTimeout(() => {
        if (typeof window.switchSettingsTab === 'function') {
          window.switchSettingsTab('ai');
        }
      }, 100);
    }
    overlay.remove();
  });
  
  overlay.querySelector('#ai-warning-close').addEventListener('click', () => {
    overlay.remove();
  });
  
  overlay.querySelector('.ai-warning-tooltip__close').addEventListener('click', () => {
    overlay.remove();
  });
  
  // Close on backdrop click
  overlay.querySelector('.ai-warning-backdrop').addEventListener('click', () => {
    overlay.remove();
  });
  
  // Auto-close after 30 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.remove();
    }
  }, 30000);
}

// Position AI warning highlight
function positionAIWarningHighlight() {
  const settingsBtn = document.querySelector('#settings-btn');
  if (!settingsBtn) return;
  
  const overlay = document.getElementById('ai-warning-overlay');
  const spotlight = overlay.querySelector('.ai-warning-spotlight');
  const tooltip = overlay.querySelector('.ai-warning-tooltip');
  const backdrop = overlay.querySelector('.ai-warning-backdrop');
  
  const rect = settingsBtn.getBoundingClientRect();
  
  // Position spotlight
  const padding = 8;
  spotlight.style.left = `${rect.left - padding}px`;
  spotlight.style.top = `${rect.top - padding}px`;
  spotlight.style.width = `${rect.width + padding * 2}px`;
  spotlight.style.height = `${rect.height + padding * 2}px`;
  
  // Update backdrop mask for spotlight effect
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) / 2 + 20;
  
  backdrop.style.setProperty('--spotlight-x', `${centerX}px`);
  backdrop.style.setProperty('--spotlight-y', `${centerY}px`);
  backdrop.style.setProperty('--spotlight-radius', `${radius}px`);
  
  // Position tooltip in the center of the popup
  setTimeout(() => {
    const tooltipRect = tooltip.getBoundingClientRect();
    const popupRect = document.body.getBoundingClientRect();
    
    // Center both horizontally and vertically in the popup
    const left = popupRect.left + (popupRect.width - (tooltipRect.width || 290)) / 2;
    const top = popupRect.top + (popupRect.height - (tooltipRect.height || 110)) / 2;
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }, 10);
}

export function showToast(message, duration = 1500, type = 'info', position = 'bottom') {
  // Remove existing toasts
  document.querySelectorAll('#toolary-toast').forEach(toast => toast.remove());
  
  const toast = document.createElement('div');
  toast.id = 'toolary-toast';
  
  // Type-specific styling
  const typeStyles = {
    error: 'background: var(--toolary-error-color, #dc3545);',
    success: 'background: var(--toolary-success-color, #28a745);',
    warning: 'background: var(--toolary-warning-color, #ffc107); color: var(--toolary-text, #333);',
    info: 'background: var(--toolary-info-color, #17a2b8);'
  };

  const positionStyles = {
    bottom: 'bottom: 20px; left: 50%; transform: translateX(-50%);',
    top: 'top: 20px; left: 50%; transform: translateX(-50%);'
  }
  
  toast.style.cssText = `
    position: fixed;
    ${positionStyles[position] || positionStyles.bottom}
    ${typeStyles[type] || typeStyles.info}
    color: #ffffff !important;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 2147483647;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: toolary-toast-slide-in 0.3s ease-out;
    max-width: 90vw;
    word-wrap: break-word;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const iconName = {
    error: 'alert',
    success: 'success',
    warning: 'alert',
    info: 'info'
  }[type] || 'info';

  const icon = renderIcon(iconName, { size: 18, decorative: true });
  icon.style.flexShrink = '0';

  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  messageSpan.style.flex = '1';

  toast.appendChild(icon);
  toast.appendChild(messageSpan);

  // Add animation styles
  if (!document.querySelector('#toolary-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toolary-toast-styles';
    style.textContent = `
      @keyframes toolary-toast-slide-in {
        from {
          transform: translateX(-50%) translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toolary-toast-slide-in 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

async function getHistory() {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.history,
      STORAGE_KEYS.legacyHistory
    ]);

    const currentHistory = Array.isArray(data[STORAGE_KEYS.history])
      ? data[STORAGE_KEYS.history]
      : [];

    if (currentHistory.length > 0) {
      return currentHistory;
    }

    const legacyHistory = Array.isArray(data[STORAGE_KEYS.legacyHistory])
      ? data[STORAGE_KEYS.legacyHistory]
      : [];

    if (legacyHistory.length > 0) {
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: legacyHistory });
      try {
        await chrome.storage.local.remove(STORAGE_KEYS.legacyHistory);
      } catch (cleanupError) {
        console.debug('Legacy history cleanup failed', cleanupError);
      }
      return legacyHistory;
    }

    return [];
  } catch (error) {
    handleError(error, 'getHistory');
    return [];
  }
}

export async function saveHistory(item) {
  try {
    const normalizedItem = { ...item };
    if (!normalizedItem.id) {
      normalizedItem.id = generateId('history');
    }
    if (typeof normalizedItem.favorite !== 'boolean') {
      normalizedItem.favorite = false;
    }
    normalizedItem.type = normalizedItem.type || 'generic';
    normalizedItem.timestamp = normalizedItem.timestamp || Date.now();
    normalizedItem.content = typeof normalizedItem.content === 'string'
      ? normalizedItem.content
      : JSON.stringify(normalizedItem.content ?? '');
    normalizedItem.title = normalizedItem.title || '';
    normalizedItem.url = normalizedItem.url || '';
    normalizedItem.pageTitle = normalizedItem.pageTitle || '';

    const hist = await getHistory();
    const existingIndex = hist.findIndex(entry => entry.id === normalizedItem.id);
    if (existingIndex !== -1) {
      hist.splice(existingIndex, 1);
    }
    hist.unshift(normalizedItem);
    if (hist.length > HISTORY_LIMIT) {
      hist.length = HISTORY_LIMIT;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: hist });
    return normalizedItem;
  } catch (error) {
    handleError(error, 'saveHistory');
    return item;
  }
}

async function updateFavoriteStatus(id, desiredState = null) {
  try {
    const hist = await getHistory();
    const entry = hist.find(i => i.id === id);
    if (!entry) return null;
    entry.favorite = desiredState === null ? !entry.favorite : Boolean(desiredState);
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: hist });
    return entry;
  } catch (error) {
    handleError(error, 'updateFavoriteStatus');
    return null;
  }
}

async function toggleFavorite(payload) {
  try {
    const history = await getHistory();
    const defaultUrl = typeof window !== 'undefined' ? window.location?.href ?? '' : '';
    const defaultPageTitle = typeof document !== 'undefined' ? document.title ?? '' : '';

    let entry = null;
    let context = null;

    if (typeof payload === 'string') {
      entry = history.find(item => item.id === payload);
      if (!entry) {
        const content = payload.trim();
        if (!content) {
          return null;
        }
        context = {
          id: null,
          content,
          type: 'generic',
          title: '',
          url: defaultUrl,
          pageTitle: defaultPageTitle,
          timestamp: Date.now()
        };
      }
    } else if (payload && typeof payload === 'object') {
      const baseContent = typeof payload.content === 'string'
        ? payload.content
        : payload.content != null
          ? JSON.stringify(payload.content)
          : '';

      context = {
        id: payload.id || null,
        content: baseContent,
        type: payload.type || 'generic',
        title: payload.title || '',
        url: payload.url || defaultUrl,
        pageTitle: payload.pageTitle || defaultPageTitle,
        timestamp: payload.timestamp || Date.now()
      };

      if (context.id) {
        entry = history.find(item => item.id === context.id);
      }

      if (!entry && context.content) {
        entry = history.find(item => item.content === context.content && (item.type || 'generic') === context.type && (item.url || '') === context.url);
      }
    } else {
      return null;
    }

    if (entry) {
      const updated = await updateFavoriteStatus(entry.id);
      return updated ? { favorite: !!updated.favorite, id: updated.id, entry: updated } : null;
    }

    if (!context || !context.content || (typeof context.content === 'string' && context.content.trim() === '')) {
      return null;
    }

    const created = await saveHistory({
      ...context,
      favorite: true
    });

    return created ? { favorite: !!created.favorite, id: created.id, entry: created } : null;
  } catch (error) {
    handleError(error, 'toggleFavorite');
    showError(t('failedToUpdateFavorites'));
    return null;
  }
}

export async function showFavorites() {
  try {
    const data = await getHistory();
    const favorites = data.filter(item => item.favorite);
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'toolary-favorites-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--toolary-modal-backdrop, rgba(0, 0, 0, 0.5));
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: toolary-fade-in 0.3s ease-out;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--toolary-bg, #fff);
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      max-width: 80vw;
      max-height: 80vh;
      overflow: hidden;
      color: var(--toolary-text, #333);
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 600px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid var(--toolary-border, #eee);
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--toolary-header-bg, #f8f9fa);
    `;

    const headerTitle = document.createElement('h3');
    headerTitle.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--toolary-text, #333);
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    `;

    const favIcon = renderIcon('favorite', { size: 20, decorative: true });
    headerTitle.appendChild(favIcon);
    const headerText = document.createElement('span');
    headerText.textContent = t('favorites');
    headerTitle.appendChild(headerText);

    const closeFavoritesBtn = document.createElement('button');
    closeFavoritesBtn.id = 'close-favorites-modal';
    closeFavoritesBtn.type = 'button';
    closeFavoritesBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 6px;
      border-radius: 6px;
      color: var(--toolary-secondary-text, #666);
      transition: background 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeFavoritesBtn.appendChild(renderIcon('close', { size: 18, decorative: true }));
    closeFavoritesBtn.addEventListener('mouseenter', () => {
      closeFavoritesBtn.style.background = 'rgba(0,0,0,0.08)';
    });
    closeFavoritesBtn.addEventListener('mouseleave', () => {
      closeFavoritesBtn.style.background = 'transparent';
    });

    header.appendChild(headerTitle);
    header.appendChild(closeFavoritesBtn);

    // Content area
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 0;
    `;

    const list = document.createElement('div');
    list.id = 'toolary-favorites-list';
    list.style.cssText = `
      padding: 0;
    `;

    function renderFavorites() {
      list.innerHTML = '';
      
      if (favorites.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.style.cssText = `
          text-align: center;
          padding: 40px 20px;
          color: var(--toolary-secondary-text, #666);
        `;
        emptyState.textContent = t('noFavoritesYet');
        list.appendChild(emptyState);
        return;
      }

      favorites.forEach((item) => {
        const row = document.createElement('div');
        row.style.cssText = `
          padding: 16px 20px;
          border-bottom: 1px solid var(--toolary-border, #eee);
          cursor: pointer;
          transition: background-color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 16px;
        `;

        const iconWrapper = document.createElement('div');
        iconWrapper.style.cssText = `
          width: 36px;
          height: 36px;
          background: var(--toolary-code-bg, #f8f9fa);
          border: 1px solid var(--toolary-border, #ddd);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        `;
        iconWrapper.appendChild(renderIcon(getIconName(item.type), { size: 18, decorative: true }));

        const body = document.createElement('div');
        body.style.cssText = 'flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;';

        const meta = document.createElement('div');
        meta.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--toolary-secondary-text, #666);';

        const badge = document.createElement('span');
        badge.textContent = item.type;
        badge.style.cssText = `
          background: var(--toolary-primary-color, #007bff);
          color: #fff;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        `;

        const timestamp = document.createElement('span');
        timestamp.textContent = formatTimestamp(item.timestamp);

        const starIcon = renderIcon('star', { size: 14, decorative: true });
        starIcon.style.color = 'var(--toolary-warning-color, #ffc107)';

        meta.appendChild(badge);
        meta.appendChild(timestamp);
        meta.appendChild(starIcon);

        const preview = document.createElement('div');
        preview.style.cssText = 'font-size: 13px; color: var(--toolary-secondary-text, #666); line-height: 1.5; word-break: break-word;';
        const truncated = item.content.length > 160 ? `${item.content.substring(0, 160)}…` : item.content;
        preview.textContent = truncated;

        body.appendChild(meta);
        body.appendChild(preview);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--toolary-primary-color, #007bff);
          color: #fff;
          border: none;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease;
        `;
        const copyIcon = renderIcon('copy', { size: 14, decorative: true });
        copyIcon.style.color = '#3a2900';
        copyButton.appendChild(copyIcon);
        const copyTextLabel = document.createElement('span');
        copyTextLabel.textContent = t('copy');
        copyTextLabel.style.color = '#3a2900';
        copyButton.appendChild(copyTextLabel);

        copyButton.addEventListener('click', (event) => {
          event.stopPropagation();
          copyText(item.content);
          showSuccess(t('copiedToClipboard'));
        });

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--toolary-button-bg, #f0f0f0);
          color: var(--toolary-text, #333);
          border: 1px solid var(--toolary-border, #ddd);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        `;
        removeButton.appendChild(renderIcon('trash', { size: 14, decorative: true }));
        const removeText = document.createElement('span');
        removeText.textContent = t('remove');
        removeButton.appendChild(removeText);

        removeButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          const result = await toggleFavorite(item.id);
          const stillFavorite = result?.favorite ?? false;
          if (!stillFavorite) {
            const index = favorites.indexOf(item);
            if (index > -1) favorites.splice(index, 1);
            renderFavorites();
            showInfo(t('removedFromFavorites'));
          }
        });

        actions.appendChild(copyButton);
        actions.appendChild(removeButton);

        row.appendChild(iconWrapper);
        row.appendChild(body);
        row.appendChild(actions);

        row.addEventListener('click', () => {
          copyText(item.content);
          showSuccess(t('copiedToClipboard'));
        });

        row.addEventListener('mouseenter', () => {
          row.style.backgroundColor = 'rgba(0,0,0,0.04)';
        });

        row.addEventListener('mouseleave', () => {
          row.style.backgroundColor = '';
        });

        list.appendChild(row);
      });
    }

    function formatTimestamp(timestamp) {
      try {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        
        return date.toLocaleDateString();
      } catch {
        return 'Unknown';
      }
    }

    // Initialize with favorites
    renderFavorites();

    // Event listeners
    closeFavoritesBtn.addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Close on Escape key
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Assemble modal
    content.appendChild(list);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

  } catch (error) {
    handleError(error, 'showFavorites');
    showError(t('failedToLoadFavorites'));
  }
}

export async function showModal(title, content, icon = '', type = '') {
  // Remove existing modals
  document.querySelectorAll('#toolary-modal-overlay').forEach(modal => modal.remove());
  
  const overlay = document.createElement('div');
  overlay.id = 'toolary-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--toolary-modal-backdrop, rgba(0, 0, 0, 0.5));
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: toolary-fade-in 0.3s ease-out;
  `;
  
  const modal = document.createElement('div');
  modal.id = 'toolary-modal-content';
  modal.style.cssText = `
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: toolary-modal-slide-in 0.3s ease-out;
  `;
  
  // Add animation styles
  if (!document.querySelector('#toolary-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'toolary-modal-styles';
    style.textContent = `
      @keyframes toolary-modal-slide-in {
        from {
          transform: scale(0.9);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
      @keyframes toolary-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  applyTheme(overlay);
  applyTheme(modal);

  const normalizedType = type || icon || 'generic';
  const defaultUrl = typeof window !== 'undefined' ? window.location?.href ?? '' : '';
  const defaultPageTitle = typeof document !== 'undefined' ? document.title ?? '' : '';

  const historyContent = typeof content === 'string'
    ? content
    : typeof content === 'number' || typeof content === 'boolean'
      ? String(content)
      : typeof content === 'object' && content !== null
        ? JSON.stringify(content, null, 2)
        : '';

  const shouldPersistHistory = historyContent.trim().length > 0;
  let historyEntry = null;
  const historyPayload = {
    id: null,
    type: normalizedType,
    title: title || '',
    content: historyContent,
    url: defaultUrl,
    pageTitle: defaultPageTitle
  };

  if (shouldPersistHistory) {
    historyEntry = await saveHistory(historyPayload);
    if (historyEntry?.id) {
      historyPayload.id = historyEntry.id;
      historyPayload.content = historyEntry.content;
      historyPayload.favorite = !!historyEntry.favorite;
    }
  }

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 18px 22px;
    border-bottom: 1px solid var(--toolary-border, #eee);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--toolary-header-bg, #f8f9fa);
  `;

  const headerContent = document.createElement('div');
  headerContent.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1;';

  const headerIcon = renderIcon(icon || type || 'info', { size: 20, decorative: true });
  headerContent.appendChild(headerIcon);

  const heading = document.createElement('span');
  heading.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--toolary-text, #333);';
  heading.textContent = title;
  headerContent.appendChild(heading);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    color: var(--toolary-secondary-text, #666);
    transition: background 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  dismissBtn.appendChild(renderIcon('close', { size: 18, decorative: true }));
  dismissBtn.addEventListener('mouseenter', () => {
    dismissBtn.style.background = 'rgba(0,0,0,0.08)';
  });
  dismissBtn.addEventListener('mouseleave', () => {
    dismissBtn.style.background = 'transparent';
  });

  // Create a proper close function
  const closeModal = () => {
    overlay.remove();
    document.removeEventListener('keydown', handleKeydown);
  };
  
  dismissBtn.addEventListener('click', closeModal);

  header.appendChild(headerContent);
  header.appendChild(dismissBtn);

  const body = document.createElement('div');
  body.style.cssText = `
    padding: 20px;
    max-height: 60vh;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.5;
    color: var(--toolary-text, #333);
  `;
  
  // Enhanced content with preview based on type - SECURITY FIX: Use safe textarea creation
  if (type === 'color' && content.includes('#')) {
    const colorMatch = content.match(/#[0-9a-fA-F]{6}/);
    if (colorMatch) {
      const color = escapeHtml(colorMatch[0]);
      const colorPreview = document.createElement('div');
      colorPreview.style.cssText = 'display: flex; gap: 16px; margin-bottom: 16px;';
      const colorBox = document.createElement('div');
      colorBox.style.cssText = `width: 60px; height: 60px; background-color: ${color}; border-radius: 8px; border: 2px solid var(--toolary-border, #ddd);`;
      const colorInfo = document.createElement('div');
      colorInfo.style.flex = '1';
      const colorPreviewTitle = document.createElement('div');
      colorPreviewTitle.style.fontWeight = '600';
      colorPreviewTitle.style.marginBottom = '8px';
      colorPreviewTitle.textContent = 'Color Preview';
      const codePreview = document.createElement('div');
      codePreview.className = 'code-preview';
      codePreview.textContent = color;
      colorInfo.appendChild(colorPreviewTitle);
      colorInfo.appendChild(codePreview);
      colorPreview.appendChild(colorBox);
      colorPreview.appendChild(colorInfo);
      body.appendChild(colorPreview);
      body.appendChild(createSafeTextarea(content));
    } else {
      body.appendChild(createSafeTextarea(content));
    }
  } else if (type === 'color-palette') {
    // Special handling for color palette with visual swatches
    const paletteContainer = document.createElement('div');
    paletteContainer.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
    
    // Parse the content to extract color information
    const colorMatches = content.match(/#[0-9a-fA-F]{6}/g) || [];
    const uniqueColors = [...new Set(colorMatches)].slice(0, 12);
    
    if (uniqueColors.length > 0) {
      const colorsTitle = document.createElement('h3');
      colorsTitle.textContent = `Extracted Colors (${uniqueColors.length})`;
      colorsTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--toolary-text, #333);';
      paletteContainer.appendChild(colorsTitle);
      
      const colorsGrid = document.createElement('div');
      colorsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px;';
      
      uniqueColors.forEach((color) => {
        const colorCard = document.createElement('div');
        colorCard.style.cssText = 'display: flex; flex-direction: column; align-items: center; padding: 8px; border: 1px solid var(--toolary-border, #ddd); border-radius: 8px; background: var(--toolary-bg, #fff);';
        
        const colorSwatch = document.createElement('div');
        colorSwatch.style.cssText = `width: 40px; height: 40px; background-color: ${color}; border-radius: 6px; border: 1px solid var(--toolary-border, #ddd); margin-bottom: 6px;`;
        
        const colorCode = document.createElement('div');
        colorCode.textContent = color;
        colorCode.style.cssText = 'font-size: 11px; font-family: monospace; color: var(--toolary-text, #333); text-align: center;';
        
        colorCard.appendChild(colorSwatch);
        colorCard.appendChild(colorCode);
        colorsGrid.appendChild(colorCard);
      });
      
      paletteContainer.appendChild(colorsGrid);
    }
    
    // Add the text content below the color swatches
    const textContent = document.createElement('div');
    textContent.style.cssText = 'margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--toolary-border, #ddd);';
    textContent.appendChild(createSafeTextarea(content));
    paletteContainer.appendChild(textContent);
    
    body.appendChild(paletteContainer);
  } else if (type === 'image' && content.includes('http')) {
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      const imageUrl = escapeHtml(urlMatch[0]);
      const imagePreview = document.createElement('div');
      imagePreview.style.marginBottom = '16px';
      const imagePreviewTitle = document.createElement('div');
      imagePreviewTitle.style.fontWeight = '600';
      imagePreviewTitle.style.marginBottom = '8px';
      imagePreviewTitle.textContent = 'Image Preview';
      const img = document.createElement('img');
      img.src = imageUrl;
      img.style.cssText = 'max-width: 200px; max-height: 150px; border-radius: 6px; border: 1px solid var(--toolary-border, #ddd);';
      img.onerror = () => img.style.display = 'none';
      imagePreview.appendChild(imagePreviewTitle);
      imagePreview.appendChild(img);
      body.appendChild(imagePreview);
      body.appendChild(createSafeTextarea(content));
    } else {
      body.appendChild(createSafeTextarea(content));
    }
  } else if (type === 'font') {
    const fontPreview = document.createElement('div');
    fontPreview.style.marginBottom = '16px';
    const fontPreviewTitle = document.createElement('div');
    fontPreviewTitle.style.fontWeight = '600';
    fontPreviewTitle.style.marginBottom = '8px';
    fontPreviewTitle.textContent = 'Font Preview';
    const codePreview = document.createElement('div');
    codePreview.className = 'code-preview';
    const fontPreviewText1 = document.createElement('div');
    fontPreviewText1.style.fontSize = '18px';
    fontPreviewText1.style.marginBottom = '8px';
    fontPreviewText1.textContent = 'The quick brown fox jumps over the lazy dog';
    const fontPreviewText2 = document.createElement('div');
    fontPreviewText2.style.fontSize = '14px';
    fontPreviewText2.className = 'secondary-text';
    fontPreviewText2.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    codePreview.appendChild(fontPreviewText1);
    codePreview.appendChild(fontPreviewText2);
    fontPreview.appendChild(fontPreviewTitle);
    fontPreview.appendChild(codePreview);
    body.appendChild(fontPreview);
    body.appendChild(createSafeTextarea(content));
  } else if (type === 'font-simple') {
    body.style.whiteSpace = 'pre-line';
    body.textContent = content;
  } else {
    body.appendChild(createSafeTextarea(content));
  }
  
  const buttons = document.createElement('div');
  buttons.id = 'toolary-modal-buttons';
  buttons.style.cssText = `
    padding: 18px 22px;
    border-top: 1px solid var(--toolary-border, #eee);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    background: var(--toolary-header-bg, #f8f9fa);
  `;

  const styleActionButton = (button, variant = 'ghost') => {
    const base = `
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      border: none;
    `;
    button.style.cssText = base;
    if (variant === 'primary') {
      button.style.background = 'var(--toolary-primary-color, #007bff)';
      button.style.color = '#3a2900';
      button.style.boxShadow = '0 8px 16px rgba(0,0,0,0.08)';
    } else if (variant === 'success') {
      button.style.background = 'var(--toolary-success-color, #28a745)';
      button.style.color = '#3a2900';
    } else if (variant === 'accent') {
      button.style.background = 'var(--toolary-warning-color, #f4b022)';
      button.style.color = '#3a2900';
      button.style.boxShadow = '0 8px 16px rgba(0,0,0,0.08)';
    } else if (variant === 'secondary') {
      button.style.background = 'var(--toolary-button-bg, #f0f0f0)';
      button.style.color = 'var(--toolary-text, #333)';
      button.style.border = '1px solid var(--toolary-border, #ddd)';
    } else {
      button.style.background = 'transparent';
      button.style.color = 'var(--toolary-text, #333)';
      button.style.border = '1px solid var(--toolary-border, #ddd)';
    }

    const baseShadow = button.style.boxShadow;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 10px 20px rgba(0,0,0,0.08)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = baseShadow;
    });
  };

  const closeBtn = document.createElement('button');
  closeBtn.title = t('close');
  closeBtn.appendChild(renderIcon('close', { size: 14, decorative: true }));
  closeBtn.appendChild(Object.assign(document.createElement('span'), { textContent: t('close') }));
  styleActionButton(closeBtn, 'secondary');

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy';
  copyBtn.title = t('copy');
  const copyIcon = renderIcon('copy', { size: 16, decorative: true });
  copyIcon.style.color = '#3a2900';
  copyBtn.appendChild(copyIcon);
  copyBtn.appendChild(Object.assign(document.createElement('span'), { textContent: t('copy') }));
  styleActionButton(copyBtn, 'primary');

  const exportBtn = document.createElement('button');
  exportBtn.title = t('export');
  const exportIcon = renderIcon('export', { size: 16, decorative: true });
  exportIcon.style.color = '#3a2900';
  exportBtn.appendChild(exportIcon);
  exportBtn.appendChild(Object.assign(document.createElement('span'), { textContent: t('export') }));
  styleActionButton(exportBtn, 'success');

  const favBtn = document.createElement('button');
  favBtn.title = t('favorite');
  const favIcon = renderIcon('star', { size: 16, decorative: true });
  favIcon.style.color = '#3a2900';
  favIcon.style.opacity = '0.7';
  favIcon.style.filter = 'none';
  favBtn.appendChild(favIcon);
  favBtn.appendChild(Object.assign(document.createElement('span'), { textContent: t('favorite') }));
  styleActionButton(favBtn, 'accent');

  let isFavorite = historyEntry?.favorite ?? false;
  if (isFavorite) {
    favIcon.style.opacity = '1';
    favBtn.style.background = 'var(--toolary-success-color, #28a745)';
    favBtn.style.color = '#3a2900';
  }
  favBtn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');

  const favoritesBtn = document.createElement('button');
  favoritesBtn.title = t('favorites');
  favoritesBtn.appendChild(renderIcon('favorite', { size: 16, decorative: true }));
  favoritesBtn.appendChild(Object.assign(document.createElement('span'), { textContent: t('favorites') }));
  styleActionButton(favoritesBtn, 'secondary');
  
  // Event handlers
  closeBtn.addEventListener('click', closeModal);
  
  copyBtn.addEventListener('click', async () => {
    const textarea = body.querySelector('textarea');
    if (textarea) {
      await copyText(textarea.value);
      showToast(t('copy'));
    }
  });
  
  exportBtn.addEventListener('click', () => {
    const textarea = body.querySelector('textarea');
    if (textarea) {
      const blob = new Blob([textarea.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `toolary-export-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });
  
  favBtn.addEventListener('click', async () => {
    const textarea = body.querySelector('textarea');
    if (textarea) {
      historyPayload.content = textarea.value;
    }

    const result = await toggleFavorite(historyPayload);
    if (!result) {
      return;
    }

    if (result.id) {
      historyPayload.id = result.id;
    }
    if (result.entry?.content) {
      historyPayload.content = result.entry.content;
    }

    isFavorite = !!result.favorite;
    favIcon.style.opacity = isFavorite ? '1' : '0.7';
    favIcon.style.color = '#3a2900';
    favIcon.style.filter = 'none';
    if (isFavorite) {
      favBtn.style.background = 'var(--toolary-success-color, #28a745)';
      favBtn.style.color = '#3a2900';
    } else {
      favBtn.style.background = 'var(--toolary-warning-color, #f4b022)';
      favBtn.style.color = '#3a2900';
    }
    favBtn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    (isFavorite ? showSuccess : showInfo)(isFavorite ? t('favorite') : t('unfavorite'));
  });
  
  favoritesBtn.addEventListener('click', () => {
    closeModal();
    showFavorites();
  });
  
  buttons.appendChild(closeBtn);
  buttons.appendChild(copyBtn);
  buttons.appendChild(exportBtn);
  buttons.appendChild(favBtn);
  buttons.appendChild(favoritesBtn);
  
  // Add ESC key handler
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', handleKeydown);
  
  // Add click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });
  
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(buttons);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

export function getCssSelector(el) {
  if (!el || !(el instanceof Element)) return '';
  
  // Simple implementation for testing
  if (el.id) {
    return `#${el.id}`;
  }
  
  const path = [];
  let current = el;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase();
    
    // Use ID if available
    if (current.id) {
      const idSelector = `#${current.id}`;
      return idSelector;
    }
    
    // Add class names if they exist
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(cls => cls.length > 0);
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }
    
    // Add nth-of-type if there are siblings with same tag
    const siblings = Array.from(current.parentNode?.children || [])
      .filter(sibling => sibling.nodeName === current.nodeName);
    
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }
    
    path.unshift(selector);
    current = current.parentNode;
  }
  
  return path.join(' > ');
}

export function getXPath(el) {
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let nb = 1;
    let sib = el.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === el.nodeName) nb++;
      sib = sib.previousSibling;
    }
    const part = `${el.nodeName.toLowerCase()}[${nb}]`;
    parts.unshift(part);
    el = el.parentNode;
  }
  return '/' + parts.join('/');
}
