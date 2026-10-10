const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr'];
const HIDDEN_STORAGE_KEY = 'toolaryHiddenTools';
const USAGE_STORAGE_KEY = 'toolaryToolUsage';
const FAVORITES_STORAGE_KEY = 'toolaryFavoriteTools';
const LEGACY_HIDDEN_KEYS = ['toolaryLegacyHiddenTools', 'hiddenTools'];

const themeMediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const coreModulesPromise = Promise.all([
  import(chrome.runtime.getURL('core/toolRegistry.js')),
  import(chrome.runtime.getURL('core/messageRouter.js'))
]).then(([toolRegistry, messageRouter]) => ({
  toolRegistry,
  messageRouter
})).catch((error) => {
  console.error('Toolboard popup: failed to load core modules', error);
  throw error;
});

const uiComponentsPromise = import(chrome.runtime.getURL('shared/ui-components.js')).catch((error) => {
  console.error('Toolboard popup: failed to load UI components', error);
  throw error;
});


const iconsPromise = import(chrome.runtime.getURL('shared/icons.js')).catch((error) => {
  console.error('Toolboard popup: failed to load icons module', error);
  throw error;
});

const secureStorageModulePromise = import(chrome.runtime.getURL('core/secureStorage.js')).catch((error) => {
  console.error('Toolboard popup: failed to load secure storage module', error);
  return null;
});

const aiConfigModulePromise = import(chrome.runtime.getURL('core/aiConfig.js')).catch((error) => {
  console.error('Toolboard popup: failed to load AI config module', error);
  return null;
});

// Category labels will be localized dynamically
const CATEGORY_KEYS = Object.freeze({
  inspect: 'inspect',
  capture: 'capture', 
  enhance: 'enhance',
  utilities: 'utilities',
  converters: 'converters',
  previewers: 'previewers',
  ai: 'ai'
});

const VALID_CATEGORIES = new Set(['all', ...Object.keys(CATEGORY_KEYS)]);
const NEW_TOOL_IDS = new Set(['macro-recorder']);

const ONBOARDING_STEPS = [
  {
    target: '.logo',
    title: 'Welcome to Toolboard!',
    description: 'Toolboard is your unified web toolkit with 24+ productivity tools. Let\'s take a quick tour!',
    position: 'bottom'
  },
  {
    target: '#tool-search',
    title: 'Search Tools',
    description: 'Quickly find any tool by typing its name, category, or function. Try typing "color" or "screenshot".',
    position: 'bottom'
  },
  {
    target: '#category-menu-btn',
    title: 'Filter by Category',
    description: 'Browse tools by category: Inspect, Capture, Enhance, Utilities, Converters, Previewers, and AI-powered tools.',
    position: 'bottom'
  },
  {
    target: '.tool-card',
    title: 'Tool Cards',
    description: 'Click any tool card to activate it. Each tool has a description to help you understand its purpose.',
    position: 'bottom'
  },
  {
    target: '.tool-card__favorite',
    title: chrome.i18n.getMessage('favoriteTools'),
    description: 'Star your favorite tools to keep them at the top of the list for quick access.',
    position: 'bottom'
  },
  {
    target: '#pagination',
    title: 'Navigate Pages',
    description: 'Use pagination buttons or scroll wheel to browse through all available tools.',
    position: 'top'
  },
  {
    target: '#settings-btn',
    title: 'Settings',
    description: 'Customize your experience: change language, theme, hide tools, and configure AI settings.',
    position: 'bottom'
  },
  {
    target: '.settings-panel__tabs',
    title: 'AI Settings',
    description: 'Go to AI tab to add provider API keys and choose your preferred model and language for AI tools.',
    position: 'top',
    action: 'openSettings',
    tab: 'ai'
  },
  {
    target: '.settings-panel__body',
    title: 'Customize Tools',
    description: 'Hide tools you don\'t use to keep your workspace clean and focused.',
    position: 'top',
    action: 'switchTab',
    tab: 'tools'
  },
  {
    target: '#tool-search',
    title: 'You\'re All Set!',
    description: 'Press "/" to quickly focus search. Click the info icon anytime to see this guide again!',
    position: 'bottom',
    action: 'closeSettings'
  }
];

const state = {
  isInitialized: false,
  toolMetadata: [],
  filteredTools: [],
  toolMap: new Map(),
  hiddenTools: new Set(),
  toolUsage: new Map(),
  favoriteTools: new Set(),
  searchTerm: '',
  rawSearchInput: '',
  searchTokens: [],
  activeCategory: 'all',
  langMap: {},
  // AI settings state
  aiKeys: [],
  aiProvider: 'gemini',
  aiProviderConfig: {},
  aiModel: 'auto',
  aiLanguage: 'auto',
  loading: true,
  currentPage: 1,
  toolsPerPage: 6,
  onboardingActive: false,
  onboardingCompleted: false,
  currentOnboardingStep: 0
};

const elements = {};
const modules = {};
const ui = {};
const icons = {};

let currentThemeSetting = 'system';
let pendingHidden = new Set();

function dedupeStringList(list = []) {
  return Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    )
  );
}

function resolveStoredList(data, primaryKey, legacyKeys = []) {
  const current = dedupeStringList(data?.[primaryKey]);
  if (current.length > 0) {
    return { list: current, migratedFrom: null };
  }

  for (const legacyKey of legacyKeys) {
    const legacyList = dedupeStringList(data?.[legacyKey]);
    if (legacyList.length > 0) {
      return { list: legacyList, migratedFrom: legacyKey };
    }
  }

  return { list: [], migratedFrom: null };
}

// Reserved for future use
// eslint-disable-next-line no-unused-vars
function formatCategoryLabel(category) {
  if (!category) return '';
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

// Reserved for future use
// eslint-disable-next-line no-unused-vars
function parseSearchQuery(raw = '') {
  if (typeof raw !== 'string') {
    return { text: '', tokens: [] };
  }

  const tokens = [];
  const textParts = [];
  const segments = raw.trim().split(/\s+/).filter(Boolean);

  segments.forEach((segment) => {
    const [prefix, ...rest] = segment.split(':');
    if (!rest.length) {
      textParts.push(segment);
      return;
    }

    const value = rest.join(':').trim();
    if (!value) {
      textParts.push(segment);
      return;
    }

    const key = prefix.trim().toLowerCase();
    const normalizedValue = value.toLowerCase();

    switch (key) {
      case 'category':
      case 'cat':
        tokens.push({ type: 'category', value: normalizedValue });
        break;
      case 'tag':
      case 'tags':
        tokens.push({ type: 'tag', value: normalizedValue });
        break;
      case 'id':
        tokens.push({ type: 'id', value: normalizedValue });
        break;
      default:
        textParts.push(segment);
        break;
    }
  });

  return {
    text: textParts.join(' '),
    tokens
  };
}

// Reserved for future use
// eslint-disable-next-line no-unused-vars
function buildSearchInputValue(text = '', tokens = []) {
  const tokenStrings = tokens.map((token) => `${token.type}:${token.value}`);
  return [text.trim(), ...tokenStrings].filter(Boolean).join(' ').trim();
}

// Reserved for future use
// eslint-disable-next-line no-unused-vars
function resolveActiveCategory() {
  const categoryToken = (state.searchTokens || []).find((token) => token.type === 'category' && VALID_CATEGORIES.has(token.value));
  if (categoryToken) {
    return categoryToken.value;
  }
  return VALID_CATEGORIES.has(state.activeCategory) ? state.activeCategory : 'all';
}

// Reserved for future use
// eslint-disable-next-line no-unused-vars
function matchesTokenFilters(tool, tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => {
    if (!token?.type) return true;
    switch (token.type) {
      case 'category':
        // handled separately by resolveActiveCategory
        return true;
      case 'tag':
      case 'tags': {
        const tags = Array.isArray(tool.tags) ? tool.tags : [];
        return tags.some((tag) => tag.toLowerCase().includes(token.value));
      }
      case 'id':
        return typeof tool.id === 'string' && tool.id.toLowerCase().includes(token.value);
      default:
        return true;
    }
  });
}

// Detect browser language (raw, not limited to supported UI languages)
function detectBrowserLanguage() {
  try {
    const sources = [
      chrome.i18n?.getUILanguage?.(),
      navigator.language,
      navigator.languages?.[0]
    ];
    
    for (const source of sources) {
      if (source) {
        const normalized = String(source).trim().toLowerCase();
        const base = normalized.split('-')[0];
        return base; // Return raw language code (de, es, ja, etc.)
      }
    }
    return 'en';
  } catch (error) {
    console.error('Browser language detection failed:', error);
    return 'en';
  }
}

// Detect UI language (limited to en, tr, fr)
function detectUILanguage() {
  const browserLang = detectBrowserLanguage();
  
  // If browser language is supported for UI, use it
  if (['en', 'tr', 'fr'].includes(browserLang)) {
    return browserLang;
  }
  
  // Otherwise, default to English for UI
  return 'en';
}

function resolveLanguage(code = 'en') {
  const normalized = String(code || 'en').trim().toLowerCase();
  if (!normalized) return 'en';
  
  // Direct match
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  
  // Extract base language (e.g., 'tr-TR' -> 'tr')
  const base = normalized.split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(base)) return base;
  
  // Country-specific mappings
  const countryMappings = {
    'tr': 'tr',      // Turkey
    'fr': 'fr',      // France
    'fr-ca': 'fr',   // Canada (French)
    'fr-be': 'fr',   // Belgium (French)
    'fr-ch': 'fr',   // Switzerland (French)
    'fr-lu': 'fr',   // Luxembourg (French)
    'fr-mc': 'fr',   // Monaco (French)
    'fr-sn': 'fr',   // Senegal (French)
    'fr-ci': 'fr',   // Ivory Coast (French)
    'fr-ml': 'fr',   // Mali (French)
    'fr-bf': 'fr',   // Burkina Faso (French)
    'fr-ne': 'fr',   // Niger (French)
    'fr-td': 'fr',   // Chad (French)
    'fr-mg': 'fr',   // Madagascar (French)
    'fr-cm': 'fr',   // Cameroon (French)
    'fr-cd': 'fr',   // Democratic Republic of Congo (French)
    'fr-cg': 'fr',   // Republic of Congo (French)
    'fr-gq': 'fr',   // Equatorial Guinea (French)
    'fr-dj': 'fr',   // Djibouti (French)
    'fr-km': 'fr',   // Comoros (French)
    'fr-sc': 'fr',   // Seychelles (French)
    'fr-va': 'fr',   // Vatican (French)
    'fr-re': 'fr',   // Réunion (French)
    'fr-gf': 'fr',   // French Guiana (French)
    'fr-mq': 'fr',   // Martinique (French)
    'fr-gp': 'fr',   // Guadeloupe (French)
    'fr-yt': 'fr',   // Mayotte (French)
    'fr-pf': 'fr',   // French Polynesia (French)
    'fr-nc': 'fr',   // New Caledonia (French)
    'fr-wf': 'fr',   // Wallis and Futuna (French)
    'fr-tf': 'fr',   // French Southern Territories (French)
    'fr-pm': 'fr',   // Saint Pierre and Miquelon (French)
    'fr-bl': 'fr',   // Saint Barthélemy (French)
    'fr-mf': 'fr',   // Saint Martin (French)
  };
  
  // Check country mappings
  if (countryMappings[normalized]) return countryMappings[normalized];
  if (countryMappings[base]) return countryMappings[base];
  
  // Default to English for all other languages
  return 'en';
}

async function loadLang(lang) {
  const resolved = resolveLanguage(lang);
  const candidates = [...new Set([resolved, resolveLanguage(resolved), 'en'])];

  for (const candidate of candidates) {
    try {
      const res = await fetch(chrome.runtime.getURL(`_locales/${candidate}/messages.json`));
      if (res.ok) {
        return res.json();
      }
    } catch (error) {
      console.error(`Error loading language ${candidate}:`, error);
    }
  }

  return {};
}

function applyLang(map) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = map[el.dataset.i18n]?.message || el.textContent;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = map[el.dataset.i18nTitle]?.message || el.title;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = map[el.dataset.i18nPlaceholder]?.message || el.placeholder;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', map[el.dataset.i18nAriaLabel]?.message || el.getAttribute('aria-label'));
  });
  
  // Update category labels in menu
  document.querySelectorAll('.category-menu-item span').forEach(el => {
    const category = el.parentElement.dataset.category;
    if (category && category !== 'all') {
      const categoryKey = CATEGORY_KEYS[category];
      if (categoryKey) {
        el.textContent = map[categoryKey]?.message || el.textContent;
      }
    }
  });
  
  // Update tool names and descriptions in cards
  document.querySelectorAll('.tool-card__title').forEach(el => {
    const toolCard = el.closest('.tool-card');
    if (toolCard) {
      const toolId = toolCard.dataset.toolId;
      const tool = state.toolMap.get(toolId);
      if (tool) {
        const nameKey = tool.i18n?.label || tool.i18n?.title || tool.id;
        const localizedName = map[nameKey]?.message || tool.name;
        el.textContent = localizedName;
        
        // Update description too
        const descriptionEl = toolCard.querySelector('.tool-card__description');
        if (descriptionEl) {
          const descriptionKey = tool.i18n?.description || `${tool.id.replace(/-/g, '')}Description`;
          const localizedDescription = map[descriptionKey]?.message || tool.description || '';
          descriptionEl.textContent = localizedDescription;
        }
      }
    }
  });
  
  // Update tool names in settings
  document.querySelectorAll('.settings-tool-item__name').forEach(el => {
    const toolItem = el.closest('.settings-tool-item');
    if (toolItem) {
      const toolId = toolItem.dataset.toolId;
      const tool = state.toolMap.get(toolId);
      if (tool) {
        const nameKey = tool.i18n?.label || tool.i18n?.title || tool.id;
        const localizedName = map[nameKey]?.message || tool.name;
        el.textContent = localizedName;
      }
    }
  });
  
  // Update category labels in settings
  document.querySelectorAll('.settings-tool-item__category').forEach(el => {
    const toolItem = el.closest('.settings-tool-item');
    if (toolItem) {
      const toolId = toolItem.dataset.toolId;
      const tool = state.toolMap.get(toolId);
      if (tool) {
        const categoryKey = CATEGORY_KEYS[tool.category];
        if (categoryKey) {
          el.textContent = map[categoryKey]?.message || el.textContent;
        }
      }
    }
  });
}

function getEffectiveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  
  // Auto theme detection
  if (theme === 'system' || !theme) {
    // Check system preference
    if (themeMediaQuery && themeMediaQuery.matches) return 'dark';
    
    // Check browser's color scheme preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    // Check time-based detection (optional)
    const hour = new Date().getHours();
    if (hour >= 18 || hour <= 6) return 'dark';
    
    return 'light';
  }
  
  return 'light';
}

function applyTheme(theme) {
  currentThemeSetting = theme;
  const effective = getEffectiveTheme(theme);
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(effective === 'dark' ? 'dark' : 'light');
}

function updateVersionBadge() {
  try {
    const badge = document.getElementById('version-badge');
    if (!badge || !chrome?.runtime?.getManifest) return;
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) {
      badge.textContent = `V${manifest.version}`;
    }
  } catch (error) {
    console.debug('Toolboard popup: unable to update version badge', error);
  }
}

if (themeMediaQuery) {
  const handleThemeChange = () => {
    if (currentThemeSetting === 'system') {
      applyTheme('system');
    }
  };

  if (typeof themeMediaQuery.addEventListener === 'function') {
    themeMediaQuery.addEventListener('change', handleThemeChange);
  } else if (typeof themeMediaQuery.addListener === 'function') {
    themeMediaQuery.addListener(handleThemeChange);
  }
}

function cacheElements() {
  Object.assign(elements, {
    searchInput: document.getElementById('tool-search'),
    categoryMenuBtn: document.getElementById('category-menu-btn'),
    categoryMenu: document.getElementById('category-menu'),
    categoryIcon: document.getElementById('category-icon'),
    toolsSection: document.getElementById('tools-section'),
    toolsGrid: document.querySelector('#tools-section .tools-grid'),
    infoBtn: document.getElementById('info-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsToolList: document.getElementById('settings-tool-list'),
    settingsClose: document.getElementById('close-settings'),
    settingsReset: document.getElementById('settings-reset'),
    settingsSave: document.getElementById('settings-save'),
    // Settings tabs
    settingsTabPreferences: document.getElementById('settings-tab-preferences'),
    settingsTabTools: document.getElementById('settings-tab-tools'),
    settingsTabAI: document.getElementById('settings-tab-ai'),
    settingsTabAbout: document.getElementById('settings-tab-about'),
    settingsContentPreferences: document.getElementById('settings-content-preferences'),
    settingsContentTools: document.getElementById('settings-content-tools'),
    settingsContentAI: document.getElementById('settings-content-ai'),
    settingsContentAbout: document.getElementById('settings-content-about'),
    settingsLangSelect: document.getElementById('settings-lang-select'),
    settingsThemeSelect: document.getElementById('settings-theme-select'),
    // AI settings elements
    settingsAIProviderSelect: document.getElementById('settings-ai-provider-select'),
    settingsAIAdvancedDetails: document.getElementById('settings-ai-advanced-details'),
    settingsAIBaseUrlInput: document.getElementById('settings-ai-base-url-input'),
    settingsAIPathInput: document.getElementById('settings-ai-path-input'),
    settingsAIAuthHeaderInput: document.getElementById('settings-ai-auth-header-input'),
    settingsAIAuthPrefixInput: document.getElementById('settings-ai-auth-prefix-input'),
    settingsAISmartModelInput: document.getElementById('settings-ai-smart-model-input'),
    settingsAILiteModelInput: document.getElementById('settings-ai-lite-model-input'),
    settingsAIResponseParserSelect: document.getElementById('settings-ai-response-parser-select'),
    settingsAIExtraHeadersInput: document.getElementById('settings-ai-extra-headers-input'),
    settingsAIBodyTemplateInput: document.getElementById('settings-ai-body-template-input'),
    settingsAIModelSelect: document.getElementById('settings-ai-model-select'),
    settingsAILanguageSelect: document.getElementById('settings-ai-language-select'),
    addAIKeyBtn: document.getElementById('add-ai-key-btn'),
    aiKeysContainer: document.getElementById('ai-keys-container'),
    pagination: document.getElementById('pagination'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    currentPageEl: document.getElementById('current-page'),
    totalPagesEl: document.getElementById('total-pages')
  });

  elements.paginationDots = document.querySelector('.pagination-dots');
  elements.paginationInfo = document.querySelector('.pagination-info');
}

function createToolCardElement(tool) {
  const card = document.createElement('div');
  card.className = 'tool-card';
  card.setAttribute('data-tool-id', tool.id);

  if (NEW_TOOL_IDS.has(tool.id)) {
    const newBadge = document.createElement('div');
    newBadge.className = 'tool-card__new-badge';
    newBadge.textContent = state.langMap.newBadgeLabel?.message || 'NEW';
    card.appendChild(newBadge);
  }
  
  const icon = document.createElement('div');
  icon.className = 'tool-card__icon';
  
  // Try to use icon definitions directly first, then fallback to SVG files
  if (icons.createIconElement && icons.getIconDefinition) {
    try {
      // Check if icon definition exists (not the default circle)
      const iconDef = icons.getIconDefinition(tool.icon);
      const defaultDef = icons.getIconDefinition('nonexistent');
      const isDefaultIcon = iconDef.title === defaultDef.title && iconDef.elements.length === defaultDef.elements.length;
      
      if (!isDefaultIcon) {
        const iconSvg = icons.createIconElement(tool.icon, { size: 32, decorative: true });
        console.log(`Using icon definition for ${tool.name} (${tool.icon})`);
        icon.appendChild(iconSvg);
      } else {
        console.log(`Icon definition not found for ${tool.name} (${tool.icon}), using SVG file`);
        throw new Error('Icon definition not found, using SVG file');
      }
    } catch (error) {
      console.log(`Icon definition failed for ${tool.name}, trying SVG file:`, error);
       // Fallback to SVG file
       const iconImg = document.createElement('img');
       const iconUrl = chrome.runtime.getURL(`icons/tools/${tool.icon}.svg`);
       iconImg.src = iconUrl;
       iconImg.alt = tool.name;
       iconImg.width = 32;
       iconImg.height = 32;
      iconImg.style.display = 'block';
      
      console.log(`Loading icon for ${tool.name}: ${iconUrl}`);
      
      iconImg.onload = () => {
        console.log(`Icon loaded successfully: ${tool.name}`);
      };
      
      iconImg.onerror = (error) => {
        console.error(`Failed to load icon for ${tool.name}:`, error);
      };
      
      icon.appendChild(iconImg);
    }
  } else {
     // Fallback to SVG file if icons module not available
     const iconImg = document.createElement('img');
     const iconUrl = chrome.runtime.getURL(`icons/tools/${tool.icon}.svg`);
     iconImg.src = iconUrl;
     iconImg.alt = tool.name;
     iconImg.width = 32;
     iconImg.height = 32;
    iconImg.style.display = 'block';
    
    console.log(`Loading icon for ${tool.name}: ${iconUrl}`);
    
    iconImg.onload = () => {
      console.log(`Icon loaded successfully: ${tool.name}`);
    };
    
    iconImg.onerror = (error) => {
      console.error(`Failed to load icon for ${tool.name}:`, error);
    };
    
    icon.appendChild(iconImg);
  }
  
  const content = document.createElement('div');
  content.className = 'tool-card__content';
  
  const title = document.createElement('div');
  title.className = 'tool-card__title';
  
  // Get localized name from i18n
  const nameKey = tool.i18n?.label || tool.i18n?.title || tool.id;
  const localizedName = state.langMap[nameKey]?.message || tool.name;
  title.textContent = localizedName;
  
  const description = document.createElement('div');
  description.className = 'tool-card__description';
  
  // Get description from localization
  const descriptionKey = tool.i18n?.description || `${tool.id.replace(/-/g, '')}Description`;
  const localizedDescription = state.langMap[descriptionKey]?.message || tool.description || '';
  description.textContent = localizedDescription;
  
  // Always show description element, let CSS handle visibility
  description.style.display = '';
  
  content.appendChild(title);
  content.appendChild(description);
  
  card.appendChild(icon);
  card.appendChild(content);
  
  // Add favorite button
  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = 'tool-card__favorite';
  favoriteBtn.setAttribute('aria-label', chrome.i18n.getMessage('toggleFavorite'));
  favoriteBtn.setAttribute('type', 'button');

  const isFavorite = state.favoriteTools.has(tool.id);
  if (isFavorite) {
    favoriteBtn.classList.add('is-favorite');
  }

  // Create star icon using icons module
  const starIcon = icons.createIconElement('star', { size: 16, decorative: true });
  favoriteBtn.appendChild(starIcon);

  // Add click handler
  favoriteBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent tool activation
    toggleFavorite(tool.id);
  });

  card.appendChild(favoriteBtn);
  
  // Add click handler
  card.addEventListener('click', () => {
    if (card.classList.contains('tool-card--disabled')) return;
    activateTool(tool.id);
  });

  return card;
}

async function loadPreferences() {
  const syncKeys = [
    HIDDEN_STORAGE_KEY,
    ...LEGACY_HIDDEN_KEYS
  ];

  const syncData = await chrome.storage.sync.get(syncKeys);
  const hidden = resolveStoredList(syncData, HIDDEN_STORAGE_KEY, LEGACY_HIDDEN_KEYS);

  state.hiddenTools = new Set(hidden.list);

  const migrationTasks = [];
  if (hidden.migratedFrom) {
    migrationTasks.push(chrome.storage.sync.set({ [HIDDEN_STORAGE_KEY]: hidden.list }));
    migrationTasks.push(chrome.storage.sync.remove(hidden.migratedFrom));
  }

  // Load tool usage data
  const localData = await chrome.storage.local.get([USAGE_STORAGE_KEY]);
  const usageData = localData[USAGE_STORAGE_KEY] || {};
  state.toolUsage = new Map(Object.entries(usageData));

  // Load favorite tools
  const favData = await chrome.storage.local.get([FAVORITES_STORAGE_KEY]);
  const favorites = favData[FAVORITES_STORAGE_KEY] || [];
  state.favoriteTools = new Set(favorites);

  // Load AI settings
  await loadAISettings();

  if (migrationTasks.length > 0) {
    Promise.allSettled(migrationTasks).catch((error) => {
      console.warn('Toolboard popup: storage migration warnings', error);
    });
  }
}

async function saveHiddenTools() {
  await chrome.storage.sync.set({ [HIDDEN_STORAGE_KEY]: Array.from(state.hiddenTools) });
}

async function saveToolUsage() {
  const usageData = Object.fromEntries(state.toolUsage);
  await chrome.storage.local.set({ [USAGE_STORAGE_KEY]: usageData });
}

async function saveFavoriteTools() {
  const favorites = Array.from(state.favoriteTools);
  await chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: favorites });
}

function matchesSearch(tool, term) {
  if (!term) return true;
  
  // Get localized name and description
  const nameKey = tool.i18n?.label || tool.i18n?.title || tool.id;
  const descriptionKey = tool.i18n?.description || `${tool.id.replace(/-/g, '')}Description`;
  const localizedName = state.langMap[nameKey]?.message || tool.name;
  const localizedDescription = state.langMap[descriptionKey]?.message || tool.description || '';
  
  // Get localized category name
  const categoryKey = CATEGORY_KEYS[tool.category];
  const localizedCategory = state.langMap[categoryKey]?.message || tool.category;
  
  const haystack = [
    tool.name,                    // Original English name
    tool.description,             // Original English description
    localizedName,               // Localized name (e.g., "Renk" for "Color")
    localizedDescription,        // Localized description
    tool.category,               // Original English category
    localizedCategory,           // Localized category
    ...(tool.tags || []),
    ...(tool.keywords || [])
  ].join(' ').toLowerCase();
  
  return haystack.includes(term);
}


function applyFilters() {
  const term = state.searchTerm.trim().toLowerCase();
  const category = state.activeCategory;

  const filtered = state.toolMetadata.filter((tool) => {
    if (category !== 'all' && tool.category !== category) {
      return false;
    }

    const hidden = state.hiddenTools.has(tool.id);
    if (!term && hidden) {
      return false;
    }

    return matchesSearch(tool, term);
  });


  // Sort by favorite status first, then new tools, then usage count, then manifest order
  filtered.sort((a, b) => {
    const isFavA = state.favoriteTools.has(a.id);
    const isFavB = state.favoriteTools.has(b.id);
    
    // Favorites always come first
    if (isFavA !== isFavB) {
      return isFavB ? 1 : -1;
    }

    const isNewA = NEW_TOOL_IDS.has(a.id);
    const isNewB = NEW_TOOL_IDS.has(b.id);
    if (isNewA !== isNewB) {
      return isNewB ? 1 : -1;
    }
    
    // Within same favorite/new status, sort by usage count
    const usageA = state.toolUsage.get(a.id) || 0;
    const usageB = state.toolUsage.get(b.id) || 0;
    if (usageA !== usageB) {
      return usageB - usageA;
    }

    const orderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return (a.name || '').localeCompare(b.name || '');
  });

  state.filteredTools = filtered;
  state.currentPage = 1; // Reset to first page when filters change
  renderMainToolsGrid();
  updatePagination();
}

function renderToolLists() {
  // Render main tools grid with pagination
  renderMainToolsGrid();
}

function renderMainToolsGrid() {
  if (!elements.toolsGrid || !state.filteredTools) return;
  
  const startIndex = (state.currentPage - 1) * state.toolsPerPage;
  const endIndex = startIndex + state.toolsPerPage;
  const pageTools = state.filteredTools.slice(startIndex, endIndex);
  
  
  elements.toolsGrid.innerHTML = '';
  
  // Fill grid with tools (up to 6)
  for (let i = 0; i < state.toolsPerPage; i++) {
    if (i < pageTools.length) {
      const tool = pageTools[i];
      const card = createToolCardElement(tool);
      elements.toolsGrid.appendChild(card);
    } else {
      // Add empty placeholder for consistent grid layout
      const placeholder = document.createElement('div');
      placeholder.className = 'tool-card-placeholder';
      elements.toolsGrid.appendChild(placeholder);
    }
  }
}


function updatePagination() {
  if (!elements.pagination) return;
  
  const totalPages = Math.ceil(state.filteredTools.length / state.toolsPerPage);
  const showPagination = totalPages > 1;
  
  elements.pagination.hidden = !showPagination;
  
  if (!showPagination) return;
  
  // Update pagination buttons
  if (elements.prevPage) {
    elements.prevPage.disabled = state.currentPage <= 1;
  }
  if (elements.nextPage) {
    elements.nextPage.disabled = state.currentPage >= totalPages;
  }
  
  // Update page number display
  if (elements.currentPageEl) {
    elements.currentPageEl.textContent = state.currentPage;
  }
  if (elements.totalPagesEl) {
    elements.totalPagesEl.textContent = totalPages;
  }
  
  // Update pagination dots (if they exist)
  if (elements.paginationDots) {
    elements.paginationDots.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const dot = document.createElement('button');
      dot.className = `pagination-dot ${i === state.currentPage ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Go to page ${i}`);
      dot.addEventListener('click', () => goToPage(i));
      elements.paginationDots.appendChild(dot);
    }
  }
  
  // Update pagination info (if it exists)
  if (elements.paginationInfo) {
    const startItem = (state.currentPage - 1) * state.toolsPerPage + 1;
    const endItem = Math.min(state.currentPage * state.toolsPerPage, state.filteredTools.length);
    elements.paginationInfo.textContent = `${startItem}-${endItem} of ${state.filteredTools.length}`;
  }
}

function goToPage(page) {
  const totalPages = Math.ceil(state.filteredTools.length / state.toolsPerPage);
  if (page < 1 || page > totalPages) return;
  
  state.currentPage = page;
  renderMainToolsGrid();
  updatePagination();
}

function nextPage() {
  const totalPages = Math.ceil(state.filteredTools.length / state.toolsPerPage);
  if (state.currentPage < totalPages) {
    goToPage(state.currentPage + 1);
  }
}

function prevPage() {
  if (state.currentPage > 1) {
    goToPage(state.currentPage - 1);
  }
}

function setLoadingState(isLoading) {
  state.loading = isLoading;
  // Loading state UI removed for compact design
}

function updateSearchHint() {
  // Search hint UI removed for compact design
}

function updateFooterButtons() {
}


async function activateTool(toolId) {
  try {
    // Check if it's an AI tool and if API keys are available
    if (isAITool(toolId)) {
      const hasAPIKeys = await checkAIAPIKeys();
      if (!hasAPIKeys) {
        await showAIAPIWarningInPopup(toolId);
        return;
      }
    }
    
    const { messageRouter } = modules;
    await messageRouter.sendRuntimeMessage(messageRouter.MESSAGE_TYPES.ACTIVATE_TOOL, { toolId });
    
    // Track tool usage
    const currentUsage = state.toolUsage.get(toolId) || 0;
    state.toolUsage.set(toolId, currentUsage + 1);
    await saveToolUsage();
    
    // Re-sort tools to reflect new usage
    applyFilters();
    
    setTimeout(() => window.close(), 80);
  } catch (error) {
    console.error('Toolboard popup: failed to activate tool', error);
  }
}

// Check if a tool is an AI tool
function isAITool(toolId) {
  const aiTools = [
    'ai-chat',
    'ai-text-summarizer', 
    'ai-text-translator',
    'ai-content-detector',
    'ai-email-generator',
    'ai-seo-analyzer'
  ];
  return aiTools.includes(toolId);
}

// Check if AI API keys are available
async function checkAIAPIKeys() {
  try {
    const result = await chrome.storage.local.get(['toolaryAIKeys']);
    const decryptedKeys = await decryptStoredAIKeys(Array.isArray(result.toolaryAIKeys) ? result.toolaryAIKeys : []);
    return decryptedKeys.some((entry) => typeof entry?.value === 'string' && entry.value.trim().length > 0);
  } catch (error) {
    console.error('Failed to check AI API keys:', error);
    return false;
  }
}

// Show AI API warning in popup (onboarding-style)
function showAIAPIWarningInPopup(toolId) {
  const toolName = getToolDisplayName(toolId);
  
  // Show onboarding-style highlight for settings
  setTimeout(() => {
    showAISettingsHighlightInPopup(toolName);
  }, 1000);
}

// Get tool display name
function getToolDisplayName(toolId) {
  if (!state.tools || !Array.isArray(state.tools)) {
    return 'AI tool';
  }
  const tool = state.tools.find(t => t.id === toolId);
  return tool ? tool.name : 'AI tool';
}

function getSelectedProviderLabel() {
  const selectEl = elements.settingsAIProviderSelect;
  if (!selectEl) return 'AI provider';
  const option = selectEl.options?.[selectEl.selectedIndex];
  return option?.textContent?.trim() || 'AI provider';
}

// Show onboarding-style highlight for AI settings in popup
function showAISettingsHighlightInPopup(toolName) {
  // Create AI warning overlay
  createAIWarningOverlayInPopup(toolName);
}

// Create independent AI warning overlay in popup (inspired by onboarding design)
function createAIWarningOverlayInPopup(toolName) {
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
        <h3 class="ai-warning-tooltip__title">${state.langMap.aiApiKeyRequiredTitle?.message || 'AI API Key Required'}</h3>
        <p class="ai-warning-tooltip__description">${state.langMap.aiApiKeyRequiredDescription?.message || `Add your ${getSelectedProviderLabel()} API key in settings to use ${toolName}.`}</p>
        <div class="ai-warning-tooltip__actions">
          <button class="ai-warning-tooltip__btn ai-warning-tooltip__btn--primary" id="ai-warning-open-settings">
            ${state.langMap.openSettings?.message || 'Open Settings'}
          </button>
          <button class="ai-warning-tooltip__btn ai-warning-tooltip__btn--secondary" id="ai-warning-close">
            ${state.langMap.close?.message || 'Close'}
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Position the highlight
  positionAIWarningHighlightInPopup();
  
  // Add event listeners
  overlay.querySelector('#ai-warning-open-settings').addEventListener('click', () => {
    // Open settings panel
    openSettingsPanel();
    // Switch to AI tab
    setTimeout(() => {
      switchSettingsTab('ai');
    }, 100);
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

// Position AI warning highlight in popup
function positionAIWarningHighlightInPopup() {
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
  // Use setTimeout to ensure tooltip is fully rendered
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

async function toggleFavorite(toolId) {
  if (state.favoriteTools.has(toolId)) {
    state.favoriteTools.delete(toolId);
  } else {
    state.favoriteTools.add(toolId);
  }
  
  await saveFavoriteTools();
  
  // Re-sort and re-render with animation
  applyFilters();
}

function handleToolContainerClick(event) {
  const card = event.target.closest('.tool-card');
  if (!card) return;
  activateTool(card.dataset.toolId);
}

function attachContainerListeners() {
  document.querySelectorAll('.tools-virtual-container').forEach((container) => {
    container.addEventListener('click', handleToolContainerClick);
  });
}

function handleSearchInput(event) {
  state.searchTerm = event.target.value;
  updateSearchHint();
  applyFilters();
}

function handleCategoryMenuClick(event) {
  const item = event.target.closest('.category-menu-item');
  if (!item) return;
  const category = item.dataset.category;
  if (!category) {
    closeCategoryMenu();
    return;
  }

  if (category === state.activeCategory) {
    closeCategoryMenu();
    return;
  }

  state.activeCategory = category;
  updateCategoryIcon(category);
  closeCategoryMenu();
  applyFilters();
}

function updateCategoryIcon(category) {
  const iconMap = {
    'all': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'inspect': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    'capture': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'enhance': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1-.365-.567L2.5 4.5a.5.5 0 0 1 .567-.365L9.937 5.5A2 2 0 0 0 11.5 6.937l6.135 1.582a.5.5 0 0 1 .365.567L17.5 19.5a.5.5 0 0 1-.567.365L9.937 15.5Z"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>',
    'utilities': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    'converters': '<path d="m7 7 4-4 4 4"/><path d="M11 3v14"/><path d="m17 17-4 4-4-4"/><path d="M13 21V7"/>',
    'previewers': '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 20h10"/><path d="M12 18v2"/>',
    'ai': '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>'
  };
  
  if (elements.categoryIcon && iconMap[category]) {
    elements.categoryIcon.innerHTML = iconMap[category];
  }
}

function toggleCategoryMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (elements.categoryMenu) {
    const willOpen = elements.categoryMenu.hidden || elements.categoryMenu.classList.contains('hidden');

    if (willOpen) {
      elements.categoryMenu.hidden = false;
      elements.categoryMenu.classList.remove('hidden');
      elements.categoryMenuBtn?.setAttribute('aria-expanded', 'true');

      requestAnimationFrame(() => {
        const firstItem = elements.categoryMenu.querySelector('.category-menu-item');
        firstItem?.focus();
      });
    } else {
      closeCategoryMenu();
    }
  } else {
    closeCategoryMenu();
  }
}

function handleCategoryMenuKeydown(event) {
  if (!elements.categoryMenu) return;

  const items = Array.from(elements.categoryMenu.querySelectorAll('.category-menu-item'));
  if (!items.length) return;

  const currentIndex = items.indexOf(document.activeElement);

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
      break;
    }
    case 'ArrowUp': {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
      break;
    }
    case 'Home': {
      event.preventDefault();
      items[0]?.focus();
      break;
    }
    case 'End': {
      event.preventDefault();
      items[items.length - 1]?.focus();
      break;
    }
    case 'Escape': {
      event.preventDefault();
      closeCategoryMenu();
      elements.categoryMenuBtn?.focus();
      break;
    }
    case 'Enter':
    case ' ': {
      if (document.activeElement && typeof document.activeElement.click === 'function') {
        event.preventDefault();
        document.activeElement.click();
      }
      break;
    }
    default:
      break;
  }
}

function handleCategoryButtonKeydown(event) {
  if (!elements.categoryMenuBtn) return;
  if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    toggleCategoryMenu(event);
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCategoryMenu();
  }
}

function closeCategoryMenu() {
  if (elements.categoryMenu) {
    elements.categoryMenu.hidden = true;
    elements.categoryMenu.classList.add('hidden');
  }
  elements.categoryMenuBtn?.setAttribute('aria-expanded', 'false');
}



function handleKeyboardNavigation(event) {
  const activeElement = document.activeElement;
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
    event.preventDefault();
    elements.searchInput.focus();
    elements.searchInput.select();
    return;
  }

  // Handle pagination with arrow keys
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const isInPagination = activeElement?.closest('.pagination');
    if (isInPagination) {
      event.preventDefault();
      if (event.key === 'ArrowLeft') {
        prevPage();
      } else if (event.key === 'ArrowRight') {
        nextPage();
      }
      return;
    }
  }

  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    const card = activeElement?.closest('.tool-card');
    if (!card) return;
    event.preventDefault();
    const container = card.closest('.tools-grid');
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.tool-card:not([style*="visibility: hidden"])'));
    const index = cards.indexOf(card);
    if (index === -1) return;
    const columns = 3; // Fixed 3-column layout
    let nextIndex = index;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = Math.min(cards.length - 1, index + 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(0, index - 1);
        break;
      case 'ArrowDown':
        nextIndex = Math.min(cards.length - 1, index + columns);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(0, index - columns);
        break;
      default:
        break;
    }
    cards[nextIndex]?.focus();
  }
}

function switchSettingsTab(tabName) {
  // Validate tab name
  const validTabs = ['preferences', 'tools', 'ai', 'about'];
  if (!validTabs.includes(tabName)) {
    console.warn(`Invalid tab name: ${tabName}`);
    return;
  }

  // Hide all content with smooth transition
  document.querySelectorAll('.settings-content').forEach(content => {
    content.classList.remove('active');
    content.setAttribute('aria-hidden', 'true');
    content.setAttribute('tabindex', '-1');
  });
  
  // Remove active from all tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });
  
  // Show selected content
  const content = document.getElementById(`settings-content-${tabName}`);
  if (content) {
    // Use requestAnimationFrame for smooth transition
    requestAnimationFrame(() => {
      content.classList.add('active');
      content.setAttribute('aria-hidden', 'false');
      content.setAttribute('tabindex', '0');
    });
  }
  
  // Activate selected tab
  const tab = document.getElementById(`settings-tab-${tabName}`);
  if (tab) {
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    // Focus after a short delay to ensure smooth transition
    setTimeout(() => tab.focus(), 50);
  }
}

function renderSettingsList() {
  const container = elements.settingsToolList;
  if (!container) return;
  container.innerHTML = '';

  const sorted = [...state.toolMetadata].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach((tool) => {
    const item = document.createElement('div');
    item.className = 'settings-tool-item';

    const label = document.createElement('div');
    label.className = 'settings-tool-item__label';
    const name = document.createElement('span');
    name.className = 'settings-tool-item__name';
    
    // Get localized name from i18n
    const nameKey = tool.i18n?.label || tool.i18n?.title || tool.id;
    const localizedName = state.langMap[nameKey]?.message || tool.name;
    name.textContent = localizedName;

    const category = document.createElement('span');
    category.className = 'settings-tool-item__category';
    
    // Get localized category name
    const categoryKey = CATEGORY_KEYS[tool.category];
    const localizedCategory = state.langMap[categoryKey]?.message || tool.category;
    category.textContent = localizedCategory;

    label.append(name, category);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'toggle';
    toggle.dataset.toolId = tool.id;
    toggle.checked = !pendingHidden.has(tool.id);

    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        pendingHidden.delete(tool.id);
      } else {
        pendingHidden.add(tool.id);
      }
    });

    item.append(label, toggle);
    container.appendChild(item);
  });
}

function openSettingsPanel() {
  // Reset state
  pendingHidden = new Set(state.hiddenTools);
  
  // Show panel first
  elements.settingsPanel.hidden = false;
  elements.settingsPanel.classList.add('is-open');
  elements.settingsBtn.setAttribute('aria-expanded', 'true');
  
  // Initialize settings values
  if (elements.settingsLangSelect) {
    elements.settingsLangSelect.value = state.langMap.__current || 'en';
  }
  if (elements.settingsThemeSelect) {
    elements.settingsThemeSelect.value = currentThemeSetting;
  }
  
  // Render settings list
  renderSettingsList();
  
  // Start with preferences tab after a short delay
  setTimeout(() => {
    switchSettingsTab('preferences');
    
    // Focus first interactive element
    setTimeout(() => {
      const firstToggle = elements.settingsPanel.querySelector('.toggle');
      const firstSelect = elements.settingsPanel.querySelector('select');
      const firstFocusable = firstToggle || firstSelect;
      firstFocusable?.focus();
    }, 100);
  }, 50);
}

function closeSettingsPanel({ save = false } = {}) {
  if (save) {
    state.hiddenTools = new Set(pendingHidden);
    saveHiddenTools();
    applyFilters();
  }
  elements.settingsPanel.classList.remove('is-open');
  elements.settingsPanel.hidden = true;
  elements.settingsBtn.setAttribute('aria-expanded', 'false');
  elements.settingsBtn.focus();
}

function resetSettings() {
  pendingHidden = new Set();
  renderSettingsList();
}



async function initializeLanguageAndTheme() {
  const stored = await chrome.storage.local.get(['language', 'theme', 'browserLanguage']);
  
  // Detect browser language (raw, for AI)
  let browserLang = stored?.browserLanguage;
  if (!browserLang) {
    browserLang = detectBrowserLanguage();
    await chrome.storage.local.set({ browserLanguage: browserLang });
  }
  
  // Detect UI language (en, tr, fr only)
  let uiLang = stored?.language ? resolveLanguage(stored.language) : null;
  if (!uiLang) {
    uiLang = detectUILanguage();
    await chrome.storage.local.set({ language: uiLang });
  }

  // Theme detection (unchanged)
  let theme = stored?.theme;
  if (!['light', 'dark', 'system'].includes(theme)) {
    theme = 'system';
    await chrome.storage.local.set({ theme });
  }

  // Load UI language
  state.langMap = await loadLang(uiLang);
  state.langMap.__current = uiLang;
  applyLang(state.langMap);
  updateFooterButtons(state.langMap);

  // Apply theme
  currentThemeSetting = theme;
  applyTheme(theme);
}

async function loadToolMetadata() {
  setLoadingState(true);
  const { toolRegistry } = modules;
  state.toolMetadata = await toolRegistry.getAllTools();
  state.toolMap = new Map(state.toolMetadata.map(tool => [tool.id, tool]));
  setLoadingState(false);
  
  
  // Apply filters first to set up state.filteredTools
  applyFilters();
  renderSettingsList();
}

function attachEventListeners() {
  elements.searchInput?.addEventListener('input', handleSearchInput);

  if (elements.categoryMenuBtn) {
    elements.categoryMenuBtn.addEventListener('click', (event) => {
      toggleCategoryMenu(event);
    });
    elements.categoryMenuBtn.addEventListener('keydown', handleCategoryButtonKeydown);
  }
  
  if (elements.categoryMenu) {
    elements.categoryMenu.addEventListener('click', handleCategoryMenuClick);
    elements.categoryMenu.addEventListener('keydown', handleCategoryMenuKeydown);
  }
  
  // Close category menu when clicking outside
  document.addEventListener('click', (event) => {
    if (!elements.categoryMenuBtn?.contains(event.target) && !elements.categoryMenu?.contains(event.target)) {
      closeCategoryMenu();
    }
  });


  // Settings tab event listeners
  elements.settingsTabPreferences?.addEventListener('click', () => switchSettingsTab('preferences'));
  elements.settingsTabTools?.addEventListener('click', () => switchSettingsTab('tools'));
  elements.settingsTabAI?.addEventListener('click', () => switchSettingsTab('ai'));
  elements.settingsTabAbout?.addEventListener('click', () => switchSettingsTab('about'));

  // Settings language and theme change handlers
  elements.settingsLangSelect?.addEventListener('change', async (event) => {
    const newLang = resolveLanguage(event.target.value);
    event.target.value = newLang;
    await chrome.storage.local.set({ language: newLang });
    state.langMap = await loadLang(newLang);
    state.langMap.__current = newLang;
    applyLang(state.langMap);
    updateFooterButtons(state.langMap);
    applyFilters();
  });

  elements.settingsThemeSelect?.addEventListener('change', async (event) => {
    const requested = event.target.value;
    const normalized = ['light', 'dark', 'system'].includes(requested) ? requested : 'system';
    event.target.value = normalized;
    await chrome.storage.local.set({ theme: normalized });
    currentThemeSetting = normalized;
    applyTheme(normalized);
  });

  // AI settings event listeners
  elements.settingsAIModelSelect?.addEventListener('change', async (event) => {
    state.aiModel = event.target.value;
    await chrome.storage.local.set({ toolaryAIModel: state.aiModel });
  });

  elements.settingsAILanguageSelect?.addEventListener('change', async (event) => {
    state.aiLanguage = event.target.value;
    await chrome.storage.local.set({ toolaryAILanguage: state.aiLanguage });
  });

  elements.settingsAIProviderSelect?.addEventListener('change', async (event) => {
    const providerId = event.target.value || 'gemini';
    await applyProviderPresetToInputs(providerId);
    await chrome.storage.local.set({
      toolaryAIProvider: state.aiProvider,
      toolaryAIProviderConfig: state.aiProviderConfig
    });
  });

  const handleProviderConfigInput = async () => {
    state.aiProviderConfig = readProviderConfigFromInputs();
    await refreshAdvancedAIConfigState();
    await chrome.storage.local.set({ toolaryAIProviderConfig: state.aiProviderConfig });
  };

  [
    elements.settingsAIBaseUrlInput,
    elements.settingsAIPathInput,
    elements.settingsAIAuthHeaderInput,
    elements.settingsAIAuthPrefixInput,
    elements.settingsAISmartModelInput,
    elements.settingsAILiteModelInput,
    elements.settingsAIResponseParserSelect,
    elements.settingsAIExtraHeadersInput,
    elements.settingsAIBodyTemplateInput
  ].forEach((inputEl) => {
    inputEl?.addEventListener('input', handleProviderConfigInput);
    inputEl?.addEventListener('change', handleProviderConfigInput);
  });

  elements.addAIKeyBtn?.addEventListener('click', addAIKey);

  // AI Keys event delegation for dynamic elements
  elements.aiKeysContainer?.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    if (target.classList.contains('ai-key-toggle-visibility')) {
      toggleKeyVisibility(index);
    } else if (target.classList.contains('ai-key-save-btn')) {
      saveAIKey(index);
    } else if (target.classList.contains('ai-key-remove-btn')) {
      removeAIKey(index);
    } else if (target.classList.contains('ai-key-test-btn')) {
      testAIKey(index);
    }
  });

  elements.aiKeysContainer?.addEventListener('input', (event) => {
    if (event.target.classList.contains('ai-key-input')) {
      const index = parseInt(event.target.dataset.index);
      if (!isNaN(index)) {
        updateAIKey(index, event.target.value);
      }
    }
  });

  elements.settingsBtn?.addEventListener('click', openSettingsPanel);
  elements.settingsClose?.addEventListener('click', () => closeSettingsPanel({ save: false }));
  elements.settingsReset?.addEventListener('click', resetSettings);
  elements.settingsSave?.addEventListener('click', async () => {
    try {
      await saveAISettings();
      closeSettingsPanel({ save: true });
      const message = state.langMap.settingsUpdated?.message || 'Settings updated';
      ui.showToast(message, 'success');
    } catch (error) {
      ui.showToast(error?.message || 'Failed to save AI settings', 'error');
    }
  });
  elements.settingsPanel?.addEventListener('click', (event) => {
    if (event.target === elements.settingsPanel) {
      closeSettingsPanel({ save: false });
    }
  });

  // Pagination event listeners
  elements.prevPage?.addEventListener('click', prevPage);
  elements.nextPage?.addEventListener('click', nextPage);

  // Mouse wheel navigation for pagination
  const toolsContainer = document.querySelector('.tools-virtual-container');
  if (toolsContainer) {
    let wheelTimeout;
    toolsContainer.addEventListener('wheel', (event) => {
      // Only handle wheel events when pagination is visible
      if (elements.pagination && !elements.pagination.hidden) {
        event.preventDefault();
        
        // Debounce wheel events to prevent rapid page changes
        clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
          if (event.deltaY > 0) {
            // Wheel down = next page (right)
            nextPage();
          } else if (event.deltaY < 0) {
            // Wheel up = previous page (left)
            prevPage();
          }
        }, 50); // 50ms debounce
      }
    }, { passive: false });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!elements.settingsPanel.hidden) {
        event.preventDefault();
        closeSettingsPanel({ save: false });
        return;
      }
      window.close();
    }
  });

  document.addEventListener('keydown', handleKeyboardNavigation);
}

async function decryptStoredAIKeys(rawKeys = []) {
  const secureStorage = await secureStorageModulePromise;
  if (secureStorage?.decryptAIKeyEntries) {
    const decryptedEntries = await secureStorage.decryptAIKeyEntries(rawKeys);
    return decryptedEntries.map((entry, index) => {
      const original = rawKeys[index];
      const value = entry.value || '';
      return {
        value,
        status: original?.status || 'active',
        visible: false,
        savedValue: value,
        createdAt: entry.createdAt
      };
    });
  }

  return rawKeys.map((entry) => {
    const value = typeof entry === 'string'
      ? entry
      : typeof entry?.value === 'string'
        ? entry.value
        : '';

    return {
      value,
      status: entry?.status || 'active',
      visible: false,
      savedValue: value,
      createdAt: entry?.createdAt || Date.now()
    };
  });
}

async function encryptAIKeysForStorage(keys = []) {
  const secureStorage = await secureStorageModulePromise;
  const entries = keys.map((key) => ({
    value: typeof key?.value === 'string' ? key.value : '',
    createdAt: key?.createdAt || Date.now()
  }));

  if (secureStorage?.encryptAIKeyEntries) {
    return secureStorage.encryptAIKeyEntries(entries);
  }

  return entries.map((entry) => ({
    value: entry.value,
    createdAt: entry.createdAt
  }));
}

function normalizeProviderConfigForState(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }
  return {
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '',
    path: typeof config.path === 'string' ? config.path.trim() : '',
    authHeader: typeof config.authHeader === 'string' ? config.authHeader.trim() : '',
    authPrefix: typeof config.authPrefix === 'string' ? config.authPrefix : '',
    smartModel: typeof config.smartModel === 'string' ? config.smartModel.trim() : '',
    liteModel: typeof config.liteModel === 'string' ? config.liteModel.trim() : '',
    responseParser: typeof config.responseParser === 'string' ? config.responseParser.trim().toLowerCase() : '',
    extraHeadersJson: typeof config.extraHeadersJson === 'string' ? config.extraHeadersJson : '',
    bodyTemplate: typeof config.bodyTemplate === 'string' ? config.bodyTemplate : ''
  };
}

async function getProviderPreset(providerId) {
  const aiConfigModule = await aiConfigModulePromise;
  if (!aiConfigModule?.getProviderPreset) {
    return {
      id: providerId || 'gemini',
      baseUrl: '',
      path: '',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      smartModel: '',
      liteModel: '',
      responseParser: 'openai'
    };
  }

  try {
    return aiConfigModule.getProviderPreset(providerId);
  } catch (error) {
    console.warn('Failed to resolve provider preset', error);
    return aiConfigModule.getProviderPreset('gemini');
  }
}

function readProviderConfigFromInputs() {
  return normalizeProviderConfigForState({
    baseUrl: elements.settingsAIBaseUrlInput?.value,
    path: elements.settingsAIPathInput?.value,
    authHeader: elements.settingsAIAuthHeaderInput?.value,
    authPrefix: elements.settingsAIAuthPrefixInput?.value,
    smartModel: elements.settingsAISmartModelInput?.value,
    liteModel: elements.settingsAILiteModelInput?.value,
    responseParser: elements.settingsAIResponseParserSelect?.value,
    extraHeadersJson: elements.settingsAIExtraHeadersInput?.value,
    bodyTemplate: elements.settingsAIBodyTemplateInput?.value
  });
}

function writeProviderConfigToInputs(config = {}) {
  const normalized = normalizeProviderConfigForState(config);
  if (elements.settingsAIBaseUrlInput) elements.settingsAIBaseUrlInput.value = normalized.baseUrl || '';
  if (elements.settingsAIPathInput) elements.settingsAIPathInput.value = normalized.path || '';
  if (elements.settingsAIAuthHeaderInput) elements.settingsAIAuthHeaderInput.value = normalized.authHeader || '';
  if (elements.settingsAIAuthPrefixInput) elements.settingsAIAuthPrefixInput.value = normalized.authPrefix || '';
  if (elements.settingsAISmartModelInput) elements.settingsAISmartModelInput.value = normalized.smartModel || '';
  if (elements.settingsAILiteModelInput) elements.settingsAILiteModelInput.value = normalized.liteModel || '';
  if (elements.settingsAIResponseParserSelect) elements.settingsAIResponseParserSelect.value = normalized.responseParser || 'openai';
  if (elements.settingsAIExtraHeadersInput) elements.settingsAIExtraHeadersInput.value = normalized.extraHeadersJson || '';
  if (elements.settingsAIBodyTemplateInput) elements.settingsAIBodyTemplateInput.value = normalized.bodyTemplate || '';
}

function setAdvancedAIConfigOpen(isOpen) {
  if (!elements.settingsAIAdvancedDetails) return;
  elements.settingsAIAdvancedDetails.open = Boolean(isOpen);
}

async function refreshAdvancedAIConfigState() {
  if (state.aiProvider === 'custom') {
    setAdvancedAIConfigOpen(true);
    return;
  }

  const normalized = normalizeProviderConfigForState(readProviderConfigFromInputs());
  const preset = await getProviderPreset(state.aiProvider);
  const presetHeadersJson = preset.extraHeaders && Object.keys(preset.extraHeaders).length
    ? JSON.stringify(preset.extraHeaders, null, 2)
    : '';

  const hasOverride = (
    normalized.baseUrl !== (preset.baseUrl || '') ||
    normalized.path !== (preset.path || '') ||
    normalized.authHeader !== (preset.authHeader || '') ||
    normalized.authPrefix !== (preset.authPrefix || '') ||
    normalized.smartModel !== (preset.smartModel || '') ||
    normalized.liteModel !== (preset.liteModel || '') ||
    normalized.responseParser !== (preset.responseParser || preset.requestFormat || 'openai') ||
    normalized.extraHeadersJson !== presetHeadersJson ||
    Boolean(normalized.bodyTemplate)
  );

  setAdvancedAIConfigOpen(hasOverride);
}

async function applyProviderPresetToInputs(providerId) {
  const preset = await getProviderPreset(providerId || 'gemini');
  state.aiProvider = preset.id || providerId || 'gemini';
  state.aiProviderConfig = normalizeProviderConfigForState({
    baseUrl: preset.baseUrl || '',
    path: preset.path || '',
    authHeader: preset.authHeader || '',
    authPrefix: preset.authPrefix || '',
    smartModel: preset.smartModel || '',
    liteModel: preset.liteModel || '',
    responseParser: preset.responseParser || preset.requestFormat || 'openai',
    extraHeadersJson: preset.extraHeaders && Object.keys(preset.extraHeaders).length ? JSON.stringify(preset.extraHeaders, null, 2) : '',
    bodyTemplate: ''
  });
  writeProviderConfigToInputs(state.aiProviderConfig);
  setAdvancedAIConfigOpen(providerId === 'custom');
}

// AI Settings Functions
async function loadAISettings() {
  try {
    const { 
      toolaryAIKeys, 
      toolaryAIModel, 
      toolaryAILanguage,
      toolaryAIProvider,
      toolaryAIProviderConfig
    } = await chrome.storage.local.get([
      'toolaryAIKeys', 
      'toolaryAIModel',
      'toolaryAILanguage',
      'toolaryAIProvider',
      'toolaryAIProviderConfig'
    ]);
    
    const decryptedKeys = await decryptStoredAIKeys(Array.isArray(toolaryAIKeys) ? toolaryAIKeys : []);
    state.aiKeys = decryptedKeys;
    state.aiModel = toolaryAIModel || 'auto';
    state.aiProvider = toolaryAIProvider || 'gemini';
    state.aiProviderConfig = normalizeProviderConfigForState(toolaryAIProviderConfig || {});
    
    // AI language initialization logic
    if (toolaryAILanguage) {
      // User has manually set AI language
      state.aiLanguage = toolaryAILanguage;
    } else {
      // First time: use browser language or 'auto'
      // 'auto' will resolve to browserLanguage in AI Manager
      state.aiLanguage = 'auto';
      
      // Save initial setting
      await chrome.storage.local.set({ toolaryAILanguage: 'auto' });
    }
    
    renderAIKeys();
    if (elements.settingsAIProviderSelect) {
      elements.settingsAIProviderSelect.value = state.aiProvider;
    }
    if (!state.aiProviderConfig || Object.values(state.aiProviderConfig).every((value) => !value)) {
      await applyProviderPresetToInputs(state.aiProvider);
    } else {
      writeProviderConfigToInputs(state.aiProviderConfig);
      await refreshAdvancedAIConfigState();
    }
    if (elements.settingsAIModelSelect) {
      elements.settingsAIModelSelect.value = state.aiModel;
    }
    if (elements.settingsAILanguageSelect) {
      elements.settingsAILanguageSelect.value = state.aiLanguage;
    }
  } catch (error) {
    console.error('Failed to load AI settings:', error);
  }
}

function renderAIKeys() {
  if (!elements.aiKeysContainer) return;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const normalizeStatus = (status) => (
    ['active', 'error', 'rate_limited', 'unknown'].includes(status) ? status : 'unknown'
  );

  // Security warning for API keys
  const securityNotice = escapeHtml(state.langMap.securityNotice?.message || 'Security Notice');
  const apiKeySecurityWarning = escapeHtml(state.langMap.apiKeySecurityWarning?.message || 'API keys are encrypted and stored locally on your device. Keep your device secure and do not share screenshots containing API keys.');
  const testLabel = escapeHtml(state.langMap.testApiKey?.message || 'Test');
  const saveLabel = escapeHtml(state.langMap.saveApiKey?.message || 'Save');

  const securityWarning = `
    <div class="ai-key-security-warning" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 13px; color: #856404;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
         <strong>${securityNotice}</strong>
       </div>
       <div>${apiKeySecurityWarning}</div>
    </div>
  `;
  
  if (state.aiKeys.length === 0) {
    elements.aiKeysContainer.innerHTML = securityWarning + `
      <div class="ai-key-empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <div>${escapeHtml(state.langMap.noApiKeys?.message || 'No API keys added yet')}</div>
      </div>
    `;
    return;
  }

  elements.aiKeysContainer.innerHTML = securityWarning + state.aiKeys.map((key, index) => `
    <div class="ai-key-item" data-key-index="${index}">
      <div class="ai-key-input-container">
        <input type="${key.visible ? 'text' : 'password'}" 
               class="ai-key-input" 
               value=""
               data-index="${index}"
               placeholder="${escapeHtml(state.langMap.apiKeyPlaceholder?.message || 'Enter API key')}">
        <button class="ai-key-toggle-visibility" 
                data-index="${index}" 
                title="${escapeHtml(key.visible ? (state.langMap.hideApiKey?.message || 'Hide API key') : (state.langMap.showApiKey?.message || 'Show API key'))}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${key.visible ? 
              '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>' :
              '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
            }
          </svg>
        </button>
      </div>
      <div class="ai-key-actions">
        <div class="ai-key-actions-left">
          <button class="ai-key-test-btn" 
                  data-index="${index}"
                  title="${escapeHtml(state.langMap.testApiKey?.message || 'Test API key')}"
                  ${!key.value ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v4"></path>
              <path d="M16 2v4"></path>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <path d="M9 9h6"></path>
              <path d="M9 13h6"></path>
              <path d="M9 17h4"></path>
            </svg>
            ${testLabel}
          </button>
          <button class="ai-key-save-btn" 
                  data-index="${index}"
                  title="${escapeHtml(state.langMap.saveApiKey?.message || 'Save API key')}"
                  style="display: ${key.value && key.value !== key.savedValue ? 'flex' : 'none'}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17,21 17,13 7,13 7,21"></polyline>
              <polyline points="7,3 7,8 15,8"></polyline>
            </svg>
            ${saveLabel}
          </button>
        </div>
        <div class="ai-key-actions-right">
          <span class="ai-key-status ${normalizeStatus(key.status || 'active')}">${escapeHtml(getStatusText(normalizeStatus(key.status || 'active')))}</span>
          <button class="ai-key-remove-btn" 
                  data-index="${index}" 
                  title="${escapeHtml(state.langMap.removeApiKeyTooltip?.message || 'Remove API key')}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  elements.aiKeysContainer.querySelectorAll('input.ai-key-input[data-index]').forEach((input) => {
    const idx = Number.parseInt(input.dataset.index, 10);
    if (Number.isInteger(idx) && state.aiKeys[idx]) {
      input.value = state.aiKeys[idx].value || '';
    }
  });
}

function getStatusText(status) {
  const statusMap = {
    'active': state.langMap.active?.message || 'Active',
    'error': state.langMap.error?.message || 'Error',
    'rate_limited': state.langMap.rateLimited?.message || 'Rate Limited',
    'unknown': state.langMap.unknown?.message || 'Unknown'
  };
  return statusMap[status] || state.langMap.unknown?.message || 'Unknown';
}

function addAIKey() {
  state.aiKeys.push({ value: '', status: 'active', visible: false, savedValue: '' });
  renderAIKeys();
  
  // Focus the new input
  setTimeout(() => {
    const newInput = elements.aiKeysContainer.querySelector(`input[data-index="${state.aiKeys.length - 1}"]`);
    if (newInput) {
      newInput.focus();
    }
  }, 100);
}

function updateAIKey(index, value) {
  if (state.aiKeys[index]) {
    state.aiKeys[index].value = value;
    renderAIKeys(); // Re-render to update save button visibility
  }
}

function saveAIKey(index) {
  if (state.aiKeys[index]) {
    state.aiKeys[index].savedValue = state.aiKeys[index].value;
    state.aiKeys[index].status = 'active';
    saveAISettings();
    renderAIKeys();
    const message = state.langMap.apiKeySaved?.message || 'API key saved';
    ui.showToast(message, 'success');
  }
}

function toggleKeyVisibility(index) {
  if (state.aiKeys[index]) {
    state.aiKeys[index].visible = !state.aiKeys[index].visible;
    renderAIKeys();
  }
}

async function testAIKey(index) {
  if (!state.aiKeys[index] || !state.aiKeys[index].value) {
    const message = state.langMap.enterApiKeyFirst?.message || 'Please enter an API key first';
    ui.showToast(message, 'error');
    return;
  }

  const testBtn = elements.aiKeysContainer.querySelector(`button[data-index="${index}"].ai-key-test-btn`);
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      ${state.langMap.testing?.message || 'Testing...'}
    `;
  }

  try {
    // Import aiManager dynamically to avoid circular imports
    const { aiManager } = await import('../core/aiManager.js');
    
    // Test the API key
    const testKey = state.aiKeys[index].value;
    const result = await aiManager.testAPIKey(testKey, {
      providerId: state.aiProvider,
      providerConfig: readProviderConfigFromInputs()
    });
    
    if (result.valid) {
      state.aiKeys[index].status = 'active';
      const message = state.langMap.apiKeyValid?.message || 'API key is valid!';
      ui.showToast(message, 'success');
    } else {
      state.aiKeys[index].status = 'error';
      const errorMsg = result.error || state.langMap.unknownError?.message || 'Unknown error';
      const failedMsg = state.langMap.apiKeyTestFailed?.message || 'API key test failed';
      ui.showToast(`${failedMsg}: ${errorMsg}`, 'error');
    }
  } catch (error) {
    state.aiKeys[index].status = 'error';
    const testFailedMsg = state.langMap.apiKeyTestFailed?.message || 'API key test failed';
    ui.showToast(`${testFailedMsg}: ${error.message}`, 'error');
  } finally {
    renderAIKeys();
  }
}

function removeAIKey(index) {
  if (state.aiKeys.length > 0) {
    state.aiKeys.splice(index, 1);
    renderAIKeys();
    saveAISettings();
  }
}

async function saveAISettings() {
  try {
    state.aiProviderConfig = readProviderConfigFromInputs();

    if (state.aiProviderConfig.extraHeadersJson) {
      try {
        const parsedHeaders = JSON.parse(state.aiProviderConfig.extraHeadersJson);
        if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
          throw new Error('Extra headers must be a JSON object.');
        }
      } catch (error) {
        throw new Error(`Extra headers JSON is invalid: ${error.message}`);
      }
    }

    if (state.aiProviderConfig.bodyTemplate) {
      try {
        JSON.parse(
          state.aiProviderConfig.bodyTemplate
            .replace(/\{\{\s*prompt\s*\}\}/g, 'TEST_PROMPT')
            .replace(/\{\{\s*model\s*\}\}/g, 'TEST_MODEL')
            .replace(/\{\{\s*languageInstruction\s*\}\}/g, '')
        );
      } catch (error) {
        throw new Error(`Body template JSON is invalid: ${error.message}`);
      }
    }

    const storageReadyKeys = await encryptAIKeysForStorage(state.aiKeys);
    await chrome.storage.local.set({
      toolaryAIKeys: storageReadyKeys,
      toolaryAIModel: state.aiModel,
      toolaryAILanguage: state.aiLanguage,
      toolaryAIProvider: state.aiProvider,
      toolaryAIProviderConfig: state.aiProviderConfig
    });
  } catch (error) {
    console.error('Failed to save AI settings:', error);
    throw error;
  }
}

// Onboarding System
const onboarding = {
  currentStep: 0,
  isActive: false,
  
  async init() {
    const { onboardingCompleted } = await chrome.storage.local.get('onboardingCompleted');
    
    if (!onboardingCompleted) {
      // First time user - start onboarding after language is loaded
      // Wait for langMap to be populated before starting onboarding
      const checkLangMap = () => {
        if (state.langMap && Object.keys(state.langMap).length > 0) {
          setTimeout(() => this.start(), 100);
        } else {
          setTimeout(checkLangMap, 50);
        }
      };
      checkLangMap();
    }
  },
  
  start() {
    this.isActive = true;
    this.currentStep = 0;
    const overlay = document.getElementById('onboarding-overlay');
    overlay.hidden = false;
    this.showStep(0);
  },
  
  stop() {
    this.isActive = false;
    const overlay = document.getElementById('onboarding-overlay');
    overlay.hidden = true;
    chrome.storage.local.set({ onboardingCompleted: true });
    
    // Close settings if open
    if (!elements.settingsPanel.hidden) {
      closeSettingsPanel({ save: false });
    }
  },
  
  showStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= ONBOARDING_STEPS.length) {
      this.stop();
      return;
    }
    
    this.currentStep = stepIndex;
    const step = ONBOARDING_STEPS[stepIndex];
    
    // Handle special actions
    if (step.action === 'openSettings' && elements.settingsPanel.hidden) {
      openSettingsPanel();
      setTimeout(() => {
        if (step.tab) {
          switchSettingsTab(step.tab);
        }
        this.positionTooltip(step);
      }, 100);
    } else if (step.action === 'switchTab' && !elements.settingsPanel.hidden) {
      switchSettingsTab(step.tab);
      setTimeout(() => {
        this.positionTooltip(step);
      }, 100);
    } else if (step.action === 'closeSettings' && !elements.settingsPanel.hidden) {
      closeSettingsPanel({ save: false });
      setTimeout(() => {
        this.positionTooltip(step);
      }, 100);
    } else {
      this.positionTooltip(step);
    }
    
    // Update tooltip content
    const tooltip = document.querySelector('.onboarding-tooltip');
    const stepEl = tooltip.querySelector('.onboarding-tooltip__step');
    const titleEl = tooltip.querySelector('.onboarding-tooltip__title');
    const descEl = tooltip.querySelector('.onboarding-tooltip__description');
    
    // Get localized step counter
    const stepText = state.langMap.onboardingStep?.message || 'Step';
    const ofText = state.langMap.onboardingOf?.message || 'of';
    stepEl.textContent = `${stepText} ${stepIndex + 1} ${ofText} ${ONBOARDING_STEPS.length}`;
    
    // Get localized content
    const titleKey = `onboarding_step${stepIndex + 1}_title`;
    const descKey = `onboarding_step${stepIndex + 1}_desc`;
    titleEl.textContent = state.langMap[titleKey]?.message || step.title;
    descEl.textContent = state.langMap[descKey]?.message || step.description;
    
    // Update buttons with localized text
    const prevBtn = document.getElementById('onboarding-prev');
    const nextBtn = document.getElementById('onboarding-next');
    const skipBtn = document.getElementById('onboarding-skip');
    
    prevBtn.disabled = stepIndex === 0;
    prevBtn.textContent = state.langMap.onboardingPrevious?.message || 'Previous';
    nextBtn.textContent = stepIndex === ONBOARDING_STEPS.length - 1 
      ? (state.langMap.onboardingFinish?.message || 'Finish')
      : (state.langMap.onboardingNext?.message || 'Next');
    skipBtn.textContent = state.langMap.onboardingSkip?.message || 'Skip';
  },
  
  positionTooltip(step) {
    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      console.warn('Onboarding target not found:', step.target);
      return;
    }
    
    const spotlight = document.querySelector('.onboarding-spotlight');
    const tooltip = document.querySelector('.onboarding-tooltip');
    const backdrop = document.querySelector('.onboarding-backdrop');
    const rect = targetEl.getBoundingClientRect();
    
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
    
    // Position tooltip
    const tooltipRect = tooltip.getBoundingClientRect();
    let left, top;
    
    switch (step.position) {
      case 'bottom':
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        top = rect.bottom + 30; // Increased distance from target
        break;
      case 'top':
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        top = rect.top - tooltipRect.height - 30; // Increased distance from target
        break;
      case 'left':
        left = rect.left - tooltipRect.width - 30; // Increased distance from target
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        left = rect.right + 30; // Increased distance from target
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        break;
      default:
        left = rect.left;
        top = rect.bottom + 30; // Increased distance from target
    }
    
    // Keep tooltip in viewport with better positioning
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipRect.width - 20));
    top = Math.max(20, Math.min(top, window.innerHeight - tooltipRect.height - 20));
    
    // Special handling for settings panel steps to avoid overlap
    if (step.target.includes('settings') || step.target.includes('panel')) {
      const settingsPanel = document.querySelector('.settings-panel');
      if (settingsPanel && !settingsPanel.hidden) {
        const panelRect = settingsPanel.getBoundingClientRect();
        
        // For settings panel tabs (step 8), position tooltip above the panel
        if (step.target === '.settings-panel__tabs') {
          left = panelRect.left + (panelRect.width / 2) - (tooltipRect.width / 2);
          top = panelRect.top - tooltipRect.height - 20;
          
          // If it goes above viewport, position it below
          if (top < 20) {
            top = panelRect.bottom + 20;
          }
        } else if (step.target === '.settings-panel__body') {
          // For settings panel body (step 9), position tooltip above the panel
          left = panelRect.left + (panelRect.width / 2) - (tooltipRect.width / 2);
          top = panelRect.top - tooltipRect.height - 20;
          
          // If it goes above viewport, position it below
          if (top < 20) {
            top = panelRect.bottom + 20;
          }
        } else if (step.target === '#settings-tab-tools') {
          // For settings tab buttons, position tooltip above the panel
          left = panelRect.left + (panelRect.width / 2) - (tooltipRect.width / 2);
          top = panelRect.top - tooltipRect.height - 20;
          
          // If it goes above viewport, position it below
          if (top < 20) {
            top = panelRect.bottom + 20;
          }
        } else {
          // For other settings elements, position below the panel
          left = panelRect.left + (panelRect.width / 2) - (tooltipRect.width / 2);
          top = panelRect.bottom + 20;
          
          // If it goes outside viewport, position it above
          if (top + tooltipRect.height > window.innerHeight - 20) {
            top = panelRect.top - tooltipRect.height - 20;
          }
          
          // If still outside, position it to the left
          if (top < 20) {
            left = panelRect.left - tooltipRect.width - 20;
            top = panelRect.top + 50;
          }
        }
        
        // Final viewport check
        left = Math.max(20, Math.min(left, window.innerWidth - tooltipRect.width - 20));
        top = Math.max(20, Math.min(top, window.innerHeight - tooltipRect.height - 20));
      }
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  },
  
  next() {
    this.showStep(this.currentStep + 1);
  },
  
  prev() {
    this.showStep(this.currentStep - 1);
  }
};

// Event listeners for onboarding
function attachOnboardingListeners() {
  elements.onboardingNext = document.getElementById('onboarding-next');
  elements.onboardingPrev = document.getElementById('onboarding-prev');
  elements.onboardingSkip = document.getElementById('onboarding-skip');
  elements.onboardingClose = document.getElementById('onboarding-close');
  
  elements.infoBtn?.addEventListener('click', () => onboarding.start());
  elements.onboardingNext?.addEventListener('click', () => onboarding.next());
  elements.onboardingPrev?.addEventListener('click', () => onboarding.prev());
  elements.onboardingSkip?.addEventListener('click', () => onboarding.stop());
  elements.onboardingClose?.addEventListener('click', () => onboarding.stop());
  
  // Close on backdrop click
  document.getElementById('onboarding-overlay')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('onboarding-backdrop')) {
      onboarding.stop();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && onboarding.isActive) {
      e.stopPropagation();
      onboarding.stop();
    }
  });
}

// Make functions globally available for inline event handlers
window.updateAIKey = updateAIKey;
window.removeAIKey = removeAIKey;
window.toggleKeyVisibility = toggleKeyVisibility;

document.addEventListener('DOMContentLoaded', async () => {
  if (state.isInitialized) return;
  state.isInitialized = true;

  const [{ toolRegistry, messageRouter }, uiModule, iconsModule] = await Promise.all([
    coreModulesPromise,
    uiComponentsPromise,
    iconsPromise
  ]);
  Object.assign(modules, { toolRegistry, messageRouter });
  Object.assign(ui, uiModule);
  Object.assign(icons, iconsModule);

  cacheElements();
  updateVersionBadge();
  attachContainerListeners();
  attachEventListeners();
  attachOnboardingListeners();

  await initializeLanguageAndTheme();
  await loadPreferences();
  await loadToolMetadata();
  updateCategoryIcon(state.activeCategory);
  updateSearchHint();
  renderToolLists();
  await onboarding.init();
});
