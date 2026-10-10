import { 
  showSuccess, 
  showError, 
  showInfo,
  showWarning,
  handleError, 
  addEventListenerWithCleanup,
  copyText
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'ai-text-summarizer',
  name: 'AI Summarizer',
  category: 'ai',
  icon: 'brain',
  permissions: ['activeTab', 'storage'],
  tags: ['ai', 'summary', 'analysis', 'text'],
  keywords: ['summarize', 'summary', 'ai', 'keywords', 'extract']
};

// Storage key
const STORAGE_KEY = 'toolaryAISummarizerHistory';
const MAX_HISTORY = 10;

// Language support (same as popup.js)
const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr'];
let langMap = {};

// Content selectors (from readingMode.js)
const CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.post-content',
  '.article-content',
  '.entry-content',
  '.content',
  '#content',
  '.main-content',
  '.article-body',
  '.post-body',
  '.entry-body'
];

// Distraction selectors to remove
const DISTRACTION_SELECTORS = [
  'header', 'nav', 'aside', 'footer',
  '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
  '.sidebar', '.menu', '.advertisement', '.ad', '.ads',
  '#sidebar', '#nav', '#header', '#footer',
  '.comments', '.social-share', '.related-posts',
  '.social-media', '.share-buttons', '.newsletter',
  '.popup', '.modal', '.overlay', '.cookie-banner',
  '.breadcrumb', '.pagination', '.tags', '.categories'
];

// Navigation keywords
const NAV_KEYWORDS = [
  'nav', 'menu', 'sidebar', 'footer', 'header',
  'advertisement', 'ad', 'banner', 'social',
  'comment', 'share', 'related', 'popular',
  'trending', 'newsletter', 'subscribe'
];

// State
let cleanupFunctions = [];
let floatingWidget = null;
let sidebar = null;
let backdrop = null;
let backdropClickArea = null;
let isPanelOpen = false;
let currentMode = 'auto'; // 'auto' or 'manual'
let currentLength = 'medium'; // 'short', 'medium', 'long'
let isGenerating = false;
let currentSummary = null;
let currentKeywords = null;
let isSelectingText = false;
let selectedTextForSummary = null;

// AI Manager (will be dynamically imported)
let aiManager = null;

// Resolve language code (from popup.js)
function resolveLanguage(code = 'en') {
  const normalized = String(code || 'en').trim().toLowerCase();
  if (!normalized) return 'en';
  
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  
  const base = normalized.split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(base)) return base;
  
  return 'en';
}

// Load language file (from popup.js)
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
      console.debug(`Error loading language ${candidate}:`, error);
    }
  }

  return {};
}

// Get translated message
function t(key, defaultValue = '') {
  return langMap[key]?.message || defaultValue || key;
}

// Load user's UI language from popup settings
async function loadUserUILanguage() {
  try {
    // Use the same language detection as popup (UI language only)
    const stored = await chrome.storage.local.get(['language']);
    let lang = stored?.language ? resolveLanguage(stored.language) : null;
    
    if (!lang) {
      // Try multiple sources for language detection
      const sources = [
        chrome.i18n?.getUILanguage?.(),
        navigator.language,
        navigator.languages?.[0]
      ];
      
      for (const source of sources) {
        if (source) {
          const detected = resolveLanguage(source);
          if (detected && SUPPORTED_LANGUAGES.includes(detected)) {
            lang = detected;
            break;
          }
        }
      }
      
      if (!lang) lang = 'en';
    }
    
    // Load language file
    langMap = await loadLang(lang);
    langMap.__current = lang;
  } catch (error) {
    handleError(error, 'loadUserUILanguage');
    langMap = {};
  }
}

// Load AI Manager
async function loadAIManager() {
  if (aiManager) return aiManager;
  
  try {
    const module = await import(chrome.runtime.getURL('core/aiManager.js'));
    aiManager = module.aiManager;
    await aiManager.initialize();
    return aiManager;
  } catch (error) {
    handleError(error, 'loadAIManager');
    throw error;
  }
}

// Score node for content extraction (from readingMode.js)
function scoreNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return -Infinity;
  }

  let score = 0;
  const tagName = node.tagName.toLowerCase();
  const className = (node.className || '').toLowerCase();
  const id = (node.id || '').toLowerCase();

  // Positive scoring
  if (['article', 'main'].includes(tagName)) score += 50;
  if (tagName === 'section') score += 20;
  if (tagName === 'div') score += 5;
  if (id.includes('content') || id.includes('article') || id.includes('main')) score += 25;
  if (className.includes('content') || className.includes('article') || className.includes('post')) score += 25;

  // Penalize navigation elements
  for (const keyword of NAV_KEYWORDS) {
    if (className.includes(keyword) || id.includes(keyword)) {
      score -= 25;
    }
  }

  // Score based on text density
  const text = node.textContent || '';
  const textLength = text.trim().length;
  const linkDensity = (node.querySelectorAll('a').length * 50) / (textLength || 1);
  score += Math.min(textLength / 100, 50);
  score -= linkDensity;

  // Penalize empty or very short content
  if (textLength < 200) {
    score -= 50;
  }

  // Bonus for paragraphs
  const paragraphs = node.querySelectorAll('p');
  score += Math.min(paragraphs.length * 5, 50);

  return score;
}

// Extract main content from page
function extractPageContent() {
  try {
    // First, try semantic selectors
    for (const selector of CONTENT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 200) {
        return cleanContent(element.cloneNode(true));
      }
    }
    
    // If no semantic content found, use scoring algorithm
    let bestCandidate = null;
    let bestScore = -Infinity;
    
    const candidates = document.querySelectorAll('div, section, article');
    
    for (const candidate of candidates) {
      const score = scoreNode(candidate);
      if (score > bestScore && candidate.textContent.trim().length > 200) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
    
    if (bestCandidate && bestScore > 0) {
      return cleanContent(bestCandidate.cloneNode(true));
    }
    
    // Fallback: find the largest text block
    const allElements = document.querySelectorAll('*');
    let largestElement = null;
    let largestTextLength = 0;
    
    for (const element of allElements) {
      const textLength = element.textContent.trim().length;
      if (textLength > largestTextLength && textLength > 200) {
        const hasNavKeywords = NAV_KEYWORDS.some(keyword => 
          (element.className || '').toLowerCase().includes(keyword) ||
          (element.id || '').toLowerCase().includes(keyword)
        );
        
        if (!hasNavKeywords) {
          largestTextLength = textLength;
          largestElement = element;
        }
      }
    }
    
    return largestElement ? cleanContent(largestElement.cloneNode(true)) : null;
  } catch (error) {
    handleError(error, 'extractPageContent');
    return null;
  }
}

// Clean content by removing distractions
function cleanContent(content) {
  if (!content) return null;
  
  try {
    const cleaned = content.cloneNode(true);
    
    // Remove distracting elements
    for (const selector of DISTRACTION_SELECTORS) {
      const elements = cleaned.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    }
    
    // Remove scripts and styles
    const scripts = cleaned.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());
    
    // Remove empty elements
    const emptyElements = cleaned.querySelectorAll('p, div, span');
    emptyElements.forEach(el => {
      if (!el.textContent.trim() && !el.querySelector('img, video, iframe')) {
        el.remove();
      }
    });
    
    return cleaned.textContent.trim();
  } catch (error) {
    handleError(error, 'cleanContent');
    return content ? content.textContent.trim() : null;
  }
}

// Get word count for length specification
function getWordCount(length) {
  switch (length) {
    case 'short':
      return 50;
    case 'medium':
      return 150;
    case 'long':
      return 300;
    default:
      return 150;
  }
}

// Get user's language preference
async function getUserLanguage() {
  try {
    const result = await chrome.storage.local.get(['toolaryAILanguage']);
    const lang = result.toolaryAILanguage || 'auto';
    
    if (lang === 'auto') {
      // Read from popup language preference first
      const stored = await chrome.storage.local.get(['language']);
      if (stored?.language) {
        return stored.language;
      }
      
      // Fallback: detect browser language
      const browserLang = navigator.language || navigator.languages?.[0] || 'en';
      const detected = browserLang.split('-')[0].toLowerCase();
      
      // Only use if supported (en, tr, fr), otherwise English
      return ['en', 'tr', 'fr'].includes(detected) ? detected : 'en';
    }
    
    return lang;
  } catch (error) {
    handleError(error, 'getUserLanguage');
    return 'en';
  }
}

// Get language name for prompt
function getLanguageName(code) {
  const languages = {
    en: 'English',
    tr: 'Turkish',
    fr: 'French',
    es: 'Spanish',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic'
  };
  
  return languages[code] || 'English';
}

// Summarize text using AI
async function summarizeText(text, length) {
  try {
    if (!text || text.length < 50) {
      throw new Error('Text too short to summarize');
    }
    
    // Load AI manager
    const manager = await loadAIManager();
    
    // Get user language
    const langCode = await getUserLanguage();
    const languageName = getLanguageName(langCode);
    
    // Get word count
    const wordCount = getWordCount(length);
    
    // Build prompt
    const prompt = `Summarize the following text in approximately ${wordCount} words.
Provide a clear, concise summary that captures the main points.
Respond in ${languageName}.

Text:
${text}

Format your response as:
Summary: [your summary here]
Keywords: [5-8 relevant keywords separated by commas]`;
    
    // Call AI API
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-text-summarizer'
    });
    
    // Parse response
    const summaryMatch = response.match(/Summary:\s*(.+?)(?=\nKeywords:|$)/is);
    const keywordsMatch = response.match(/Keywords:\s*(.+?)$/is);
    
    const summary = summaryMatch ? summaryMatch[1].trim() : response;
    const keywords = keywordsMatch ? keywordsMatch[1].trim() : '';
    
    return {
      summary,
      keywords,
      length,
      wordCount,
      timestamp: Date.now()
    };
  } catch (error) {
    handleError(error, 'summarizeText');
    throw error;
  }
}

// Save to history
async function saveToHistory(summary, keywords, text, mode, length) {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const history = result[STORAGE_KEY] || [];
    
    const entry = {
      summary,
      keywords,
      textPreview: text.substring(0, 200),
      mode,
      length,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now()
    };
    
    history.unshift(entry);
    
    // Keep only last MAX_HISTORY entries
    if (history.length > MAX_HISTORY) {
      history.splice(MAX_HISTORY);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEY]: history });
  } catch (error) {
    handleError(error, 'saveToHistory');
  }
}

// Create floating widget (Dark gray like popup theme)
function createFloatingWidget() {
  const widget = document.createElement('div');
  widget.id = 'toolary-ai-summarizer-widget';
  widget.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 56px;
    height: 56px;
    background: #1f2937;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: pointer;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    border: 2px solid #374151;
  `;
  
  const icon = createIconElement('brain', { size: 24, decorative: true });
  icon.style.color = '#60a5fa';
  widget.appendChild(icon);
  
  // Hover effects
  const cleanupHover = addEventListenerWithCleanup(widget, 'mouseenter', () => {
    widget.style.transform = 'scale(1.1)';
    widget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  });
  
  const cleanupLeave = addEventListenerWithCleanup(widget, 'mouseleave', () => {
    widget.style.transform = 'scale(1)';
    widget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  });
  
  // Click handler
  const cleanupClick = addEventListenerWithCleanup(widget, 'click', () => {
    togglePanel();
  });
  
  cleanupFunctions.push(cleanupHover, cleanupLeave, cleanupClick);
  
  return widget;
}

// Toggle panel visibility
function togglePanel() {
  if (isPanelOpen) {
    hidePanel();
  } else {
    showPanel();
  }
}

// Show sidebar panel
function showPanel() {
  if (isPanelOpen) return;
  
  isPanelOpen = true;
  
  // Create backdrop
  backdrop = document.createElement('div');
  backdrop.id = 'toolary-ai-summarizer-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    z-index: 2147483646;
    animation: toolary-fade-in 0.3s ease-out;
    pointer-events: none;
  `;
  
  // Create invisible clickable area for backdrop
  backdropClickArea = document.createElement('div');
  backdropClickArea.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483645;
    pointer-events: auto;
    background: transparent;
  `;
  
  const cleanupBackdrop = addEventListenerWithCleanup(backdropClickArea, 'click', () => {
    hidePanel();
  });
  cleanupFunctions.push(cleanupBackdrop);
  
  // Create sidebar
  sidebar = createSidebar();
  
  // Add animations
  if (!document.querySelector('#toolary-ai-summarizer-animations')) {
    const style = document.createElement('style');
    style.id = 'toolary-ai-summarizer-animations';
    style.textContent = `
      @keyframes toolary-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes toolary-slide-in-right {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(backdropClickArea);
  document.body.appendChild(backdrop);
  document.body.appendChild(sidebar);
}

// Hide sidebar panel
function hidePanel() {
  if (!isPanelOpen) return;
  
  isPanelOpen = false;
  
  // Remove click area first
  if (backdropClickArea && backdropClickArea.parentNode) {
    backdropClickArea.parentNode.removeChild(backdropClickArea);
  }
  
  if (backdrop && backdrop.parentNode) {
    backdrop.parentNode.removeChild(backdrop);
  }
  if (sidebar && sidebar.parentNode) {
    sidebar.parentNode.removeChild(sidebar);
  }
  
  backdrop = null;
  backdropClickArea = null;
  sidebar = null;
}

// Start text selection mode
function startTextSelection() {
  isSelectingText = true;
  selectedTextForSummary = null;
  
  // Hide panel
  hidePanel();
  
  // Show instruction overlay
  const overlay = document.createElement('div');
  overlay.id = 'toolary-text-selection-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #ffffff;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: toolary-fade-in 0.3s ease-out;
  `;
  
  const icon = document.createElement('span');
  icon.textContent = '✨';
  icon.style.fontSize = '20px';
  
  const text = document.createElement('span');
  text.textContent = t('selectTextOnPage', 'Select text on the page to summarize');
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = t('cancel', 'Cancel');
  cancelBtn.style.cssText = `
    padding: 6px 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  `;
  
  const cleanupCancelClick = addEventListenerWithCleanup(cancelBtn, 'click', () => {
    cancelTextSelection();
  });
  cleanupFunctions.push(cleanupCancelClick);
  
  overlay.appendChild(icon);
  overlay.appendChild(text);
  overlay.appendChild(cancelBtn);
  
  document.body.appendChild(overlay);
  
  // Listen for text selection
  const cleanupMouseUp = addEventListenerWithCleanup(document, 'mouseup', handleTextSelection);
  cleanupFunctions.push(cleanupMouseUp);
}

// Handle text selection
function handleTextSelection() {
  if (!isSelectingText) return;
  
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  
  const selectedText = selection.toString().trim();
  if (selectedText.length < 50) return; // Minimum text length
  
  selectedTextForSummary = selectedText;
  isSelectingText = false;
  
  // Remove overlay
  const overlay = document.getElementById('toolary-text-selection-overlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  
  // Show panel and automatically generate summary
  currentMode = 'manual';
  showPanel();
  
  // Auto-generate summary
  setTimeout(() => {
    handleGenerateSummary();
  }, 300);
}

// Cancel text selection
function cancelTextSelection() {
  isSelectingText = false;
  selectedTextForSummary = null;
  
  const overlay = document.getElementById('toolary-text-selection-overlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  
  showPanel();
}

// Create sidebar panel (Exact colors from bookmarkManager)
function createSidebar() {
  const panel = document.createElement('div');
  panel.id = 'toolary-ai-summarizer-panel';
  panel.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: var(--toolary-bg, #fff);
    border-left: 1px solid var(--toolary-border, #ddd);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 12px rgba(0,0,0,0.15);
    animation: toolary-slide-in-right 0.3s ease-out;
  `;
  
  // Header (Exact style from bookmarkManager)
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--toolary-border, #eee);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--toolary-header-bg, #f8f9fa);
  `;
  
  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const titleIcon = createIconElement('brain', { size: 18, decorative: true });
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(t('aiTextSummarizerTitle', 'AI Text Summarizer')));
  
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--toolary-secondary-text, #666);
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.appendChild(createIconElement('close', { size: 16, decorative: true }));
  
  const cleanupClose = addEventListenerWithCleanup(closeBtn, 'click', () => {
    hidePanel();
  });
  cleanupFunctions.push(cleanupClose);
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Content
  const content = document.createElement('div');
  content.id = 'toolary-ai-summarizer-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  `;
  
  // Results section (Show at top when available)
  const resultsSection = document.createElement('div');
  resultsSection.id = 'toolary-ai-results';
  resultsSection.style.cssText = `
    display: none;
    padding: 16px;
    background: var(--toolary-header-bg, #f8f9fa);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    margin-bottom: 20px;
  `;
  
  const resultsHeader = document.createElement('div');
  resultsHeader.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  `;
  
  const resultsTitle = document.createElement('h4');
  resultsTitle.textContent = t('summary', 'Summary');
  resultsTitle.style.cssText = `
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--toolary-text, #333);
  `;
  
  const copyBtn = document.createElement('button');
  copyBtn.id = 'toolary-ai-copy-btn';
  copyBtn.textContent = t('copySummary', 'Copy');
  copyBtn.style.cssText = `
    padding: 6px 12px;
    background: var(--toolary-button-bg, #fff);
    color: var(--toolary-text, #333);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  const copyCleanup = addEventListenerWithCleanup(copyBtn, 'click', handleCopySummary);
  cleanupFunctions.push(copyCleanup);
  
  resultsHeader.appendChild(resultsTitle);
  resultsHeader.appendChild(copyBtn);
  
  const summaryText = document.createElement('div');
  summaryText.id = 'toolary-ai-summary-text';
  summaryText.style.cssText = `
    font-size: 14px;
    line-height: 1.6;
    color: var(--toolary-text, #333);
    margin-bottom: 12px;
    white-space: pre-wrap;
  `;
  
  const keywordsContainer = document.createElement('div');
  keywordsContainer.id = 'toolary-ai-keywords-container';
  keywordsContainer.style.cssText = `
    display: none;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--toolary-border, #ddd);
  `;
  
  const keywordsLabel = document.createElement('div');
  keywordsLabel.textContent = t('extractedKeywords', 'Keywords');
  keywordsLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 8px;
  `;
  
  const keywordsList = document.createElement('div');
  keywordsList.id = 'toolary-ai-keywords-list';
  keywordsList.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `;
  
  keywordsContainer.appendChild(keywordsLabel);
  keywordsContainer.appendChild(keywordsList);
  
  resultsSection.appendChild(resultsHeader);
  resultsSection.appendChild(summaryText);
  resultsSection.appendChild(keywordsContainer);
  
  // Loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'toolary-ai-loading';
  loadingIndicator.style.cssText = `
    display: none;
    text-align: center;
    padding: 32px 20px;
    margin-bottom: 20px;
  `;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 40px;
    height: 40px;
    border: 3px solid var(--toolary-border, #ddd);
    border-top-color: var(--toolary-primary-color, #007bff);
    border-radius: 50%;
    animation: toolary-spin 1s linear infinite;
    margin: 0 auto 12px;
  `;
  
  const loadingText = document.createElement('div');
  loadingText.textContent = t('generating', 'Generating summary...');
  loadingText.style.cssText = `
    font-size: 14px;
    color: var(--toolary-secondary-text, #666);
  `;
  
  loadingIndicator.appendChild(spinner);
  loadingIndicator.appendChild(loadingText);
  
  // Add spin animation
  if (!document.querySelector('#toolary-ai-spin-animation')) {
    const style = document.createElement('style');
    style.id = 'toolary-ai-spin-animation';
    style.textContent = `
      @keyframes toolary-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Compact controls section
  const controlsSection = document.createElement('div');
  controlsSection.style.cssText = `
    background: var(--toolary-header-bg, #f8f9fa);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    padding: 14px;
  `;
  
  // Action buttons (side by side)
  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  `;
  
  const autoBtn = createCompactButton('auto', t('summarizeAuto', 'Page Content'), 'book');
  const selectBtn = createCompactButton('select', t('summarizeManual', 'Select Text'), 'text');
  
  actionsRow.appendChild(autoBtn);
  actionsRow.appendChild(selectBtn);
  
  // Length selector (compact dropdown)
  const lengthRow = document.createElement('div');
  lengthRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const lengthLabel = document.createElement('label');
  lengthLabel.textContent = t('length', 'Length') + ':';
  lengthLabel.style.cssText = `
    font-size: 13px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    white-space: nowrap;
  `;
  
  const lengthSelect = document.createElement('select');
  lengthSelect.id = 'toolary-length-select';
  lengthSelect.style.cssText = `
    flex: 1;
    padding: 8px 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    background: var(--toolary-button-bg, #fff);
    color: var(--toolary-text, #333);
    font-size: 13px;
    cursor: pointer;
  `;
  
  const shortOption = document.createElement('option');
  shortOption.value = 'short';
  shortOption.textContent = t('summaryLengthShort', 'Short (~50 words)');
  
  const mediumOption = document.createElement('option');
  mediumOption.value = 'medium';
  mediumOption.textContent = t('summaryLengthMedium', 'Medium (~150 words)');
  mediumOption.selected = true;
  
  const longOption = document.createElement('option');
  longOption.value = 'long';
  longOption.textContent = t('summaryLengthLong', 'Long (~300 words)');
  
  lengthSelect.appendChild(shortOption);
  lengthSelect.appendChild(mediumOption);
  lengthSelect.appendChild(longOption);
  
  const lengthSelectCleanup = addEventListenerWithCleanup(lengthSelect, 'change', () => {
    currentLength = lengthSelect.value;
  });
  cleanupFunctions.push(lengthSelectCleanup);
  
  lengthRow.appendChild(lengthLabel);
  lengthRow.appendChild(lengthSelect);
  
  controlsSection.appendChild(actionsRow);
  controlsSection.appendChild(lengthRow);
  
  // Assemble content (Results first, then controls)
  content.appendChild(resultsSection);
  content.appendChild(loadingIndicator);
  content.appendChild(controlsSection);
  
  // Assemble panel
  panel.appendChild(header);
  panel.appendChild(content);
  
  return panel;
}

// Create compact button
function createCompactButton(type, label, iconName) {
  const btn = document.createElement('button');
  btn.id = type === 'auto' ? 'toolary-auto-btn' : 'toolary-select-text-btn';
  btn.style.cssText = `
    padding: 10px 12px;
    background: ${type === 'auto' ? 'var(--toolary-primary-color, #007bff)' : 'var(--toolary-button-bg, #fff)'};
    color: ${type === 'auto' ? '#ffffff' : 'var(--toolary-text, #333)'};
    border: ${type === 'auto' ? 'none' : '1px solid var(--toolary-border, #ddd)'};
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  `;
  
  const icon = createIconElement(iconName, { size: 16, decorative: true });
  const textSpan = document.createElement('span');
  textSpan.textContent = label;
  
  btn.appendChild(icon);
  btn.appendChild(textSpan);
  
  const cleanup = addEventListenerWithCleanup(btn, 'click', () => {
    if (type === 'auto') {
      currentMode = 'auto';
      selectedTextForSummary = null;
      handleGenerateSummary();
    } else {
      startTextSelection();
    }
  });
  
  cleanupFunctions.push(cleanup);
  
  return btn;
}

// Handle generate summary
async function handleGenerateSummary() {
  if (isGenerating) return;
  
  try {
    isGenerating = true;
    
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    const resultsSection = document.getElementById('toolary-ai-results');
    const autoBtn = document.getElementById('toolary-auto-btn');
    const selectBtn = document.getElementById('toolary-select-text-btn');
    
    // Disable buttons and show loading
    if (autoBtn) autoBtn.disabled = true;
    if (selectBtn) selectBtn.disabled = true;
    
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }
    
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
    
    // Get text based on mode
    let text;
    if (currentMode === 'auto') {
      const content = extractPageContent();
      if (!content) {
        throw new Error(t('noContentToSummarize', 'No content found to summarize'));
      }
      text = content;
    } else {
      if (!selectedTextForSummary) {
        const message = t('selectTextFirst', 'Please select text on the page first');
        showWarning(message);
        throw new Error(message);
      }
      text = selectedTextForSummary;
    }
    
    // Limit text length (max 10000 characters)
    if (text.length > 10000) {
      text = text.substring(0, 10000) + '...';
    }
    
    // Generate summary
    const result = await summarizeText(text, currentLength);
    
    // Store result
    currentSummary = result.summary;
    currentKeywords = result.keywords;
    
    // Display result
    const summaryTextEl = document.getElementById('toolary-ai-summary-text');
    const keywordsContainer = document.getElementById('toolary-ai-keywords-container');
    const keywordsList = document.getElementById('toolary-ai-keywords-list');
    
    if (summaryTextEl) {
      summaryTextEl.textContent = result.summary;
    }
    
    // Display keywords
    if (result.keywords && keywordsContainer && keywordsList) {
      keywordsList.innerHTML = '';
      const keywords = result.keywords.split(',').map(k => k.trim()).filter(k => k);
      
      keywords.forEach(keyword => {
        const tag = document.createElement('span');
        tag.textContent = keyword;
        tag.style.cssText = `
          padding: 4px 10px;
          background: var(--toolary-button-bg, #fff);
          color: var(--toolary-text, #333);
          border: 1px solid var(--toolary-border, #ddd);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        `;
        keywordsList.appendChild(tag);
      });
      
      keywordsContainer.style.display = 'block';
    }
    
    // Show results
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    if (resultsSection) {
      resultsSection.style.display = 'block';
    }
    
    // Save to history
    await saveToHistory(result.summary, result.keywords, text, currentMode, currentLength);
    
    // Show success message
    const message = t('summaryGenerated', 'Summary generated!');
    showSuccess(message);
    
    // Show coffee message
    showCoffeeMessageForTool('ai-text-summarizer');
    
  } catch (error) {
    handleError(error, 'handleGenerateSummary');
    const message = error.message || t('failedToGenerateSummary', 'Failed to generate summary');
    showError(message);
    
    // Hide loading
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  } finally {
    isGenerating = false;
    const autoBtn = document.getElementById('toolary-auto-btn');
    const selectBtn = document.getElementById('toolary-select-text-btn');
    if (autoBtn) autoBtn.disabled = false;
    if (selectBtn) selectBtn.disabled = false;
  }
}

// Handle copy summary
function handleCopySummary() {
  if (!currentSummary) return;
  
  try {
    let textToCopy = currentSummary;
    
    if (currentKeywords) {
      textToCopy += `\n\nKeywords: ${currentKeywords}`;
    }
    
    copyText(textToCopy);
    
    // Update button
    const copyBtn = document.getElementById('toolary-ai-copy-btn');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = t('copied', 'Copied!');
      copyBtn.style.background = 'var(--toolary-success-color, #28a745)';
      copyBtn.style.color = 'white';
      copyBtn.style.borderColor = 'var(--toolary-success-color, #28a745)';
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = 'var(--toolary-button-bg, #fff)';
        copyBtn.style.color = 'var(--toolary-text, #333)';
        copyBtn.style.borderColor = 'var(--toolary-border, #ddd)';
      }, 2000);
    }
  } catch (error) {
    handleError(error, 'handleCopySummary');
    showError(t('failedToCopy', 'Failed to copy'));
  }
}

// Activation
let isActive = false;

export async function activate(deactivate) {
  if (isActive) return;
  isActive = true;
  
  try {
    // Load UI language first
    await loadUserUILanguage();
    
    // Load AI manager
    await loadAIManager();
    
    // Create floating widget
    floatingWidget = createFloatingWidget();
    document.body.appendChild(floatingWidget);
    
    // Automatically open sidebar panel
    showPanel();
    
    const message = t('aiSummarizerActivated', 'AI Text Summarizer activated');
    showInfo(message);
    
  } catch (error) {
    handleError(error, 'textSummarizer.activate');
    const message = t('failedToActivate', 'Failed to activate');
    showError(message);
    deactivate();
  }
}

// Deactivation
export function deactivate() {
  try {
    // Cancel text selection if active
    if (isSelectingText) {
      cancelTextSelection();
    }
    
    // Hide panel if open
    hidePanel();
    
    // Remove floating widget
    if (floatingWidget && floatingWidget.parentNode) {
      floatingWidget.parentNode.removeChild(floatingWidget);
    }
    
    // Cleanup event listeners
    cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.debug('Cleanup error:', error);
      }
    });
    cleanupFunctions = [];
    
    // Reset state
    floatingWidget = null;
    sidebar = null;
    backdrop = null;
    backdropClickArea = null;
    isPanelOpen = false;
    currentMode = 'auto';
    currentLength = 'medium';
    isGenerating = false;
    currentSummary = null;
    currentKeywords = null;
    isSelectingText = false;
    selectedTextForSummary = null;
    isActive = false;
    langMap = {};
    
  } catch (error) {
    handleError(error, 'textSummarizer.deactivate');
  }
}
