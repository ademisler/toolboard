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
import { AI_LANGUAGE_NAMES } from '../../core/aiConfig.js';

export const metadata = {
  id: 'ai-text-translator',
  name: 'AI Translator',
  category: 'ai',
  icon: 'languages',
  permissions: ['activeTab', 'storage'],
  tags: ['ai', 'translation', 'language', 'text'],
  keywords: ['translate', 'translation', 'language', 'multilingual']
};

// Storage key
const STORAGE_KEY = 'toolaryAITranslatorHistory';
const MAX_HISTORY = 10;

// Language support (same as popup.js)
const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr'];
let langMap = {};

// Content selectors - REMOVED (unused constants)
// const CONTENT_SELECTORS = [ ... ];

// Distraction selectors - REMOVED (unused constants)
// const DISTRACTION_SELECTORS = [ ... ];

// Navigation keywords - REMOVED (unused constants)
// const NAV_KEYWORDS = [ ... ];

// State
let cleanupFunctions = [];
let floatingWidget = null;
let sidebar = null;
let backdrop = null;
let backdropClickArea = null;
let isPanelOpen = false;
let currentMode = 'input'; // 'input', 'selection', 'page'
let isTranslating = false;
// let currentTranslation = null;
let isSelectingText = false;
let selectedTextForTranslation = null;
let sourceLang = 'auto';
let targetLang = 'en';
let originalTextNodes = []; // Store original text for restoration
let isPageTranslated = false;
let restoreButton = null;

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
// Score node function - REMOVED (unused function)
// function scoreNode(node) { ... }

// Extract main content from page - REMOVED (unused function)
// function extractPageContent() { ... }

// Clean content function - REMOVED (unused function)
// function cleanContent(content) { ... }

// Get language name for display
function getLanguageName(code) {
  if (code === 'auto') return t('autoDetect', 'Auto Detect');
  return AI_LANGUAGE_NAMES[code] || code.toUpperCase();
}

// Get all visible text nodes from the page
function getAllTextNodes(rootElement = document.body) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT, // eslint-disable-line no-undef
    {
      acceptNode: (node) => {
        // Skip if parent is script, style, or other non-visible elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe', 'object'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        }
        
        // Skip if text is only whitespace
        const text = node.textContent.trim();
        if (!text || text.length < 3) {
          return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        }
        
        // Skip if parent is hidden
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        }
        
        // Skip Toolboard's own elements
        if (parent.closest('[id^="toolary-"]')) {
          return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        }
        
        return NodeFilter.FILTER_ACCEPT; // eslint-disable-line no-undef
      }
    }
  );
  
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }
  
  return textNodes;
}

// Collect text segments with their nodes
function collectTextSegments(textNodes) {
  const segments = [];
  let currentSegment = [];
  let currentText = '';
  
  for (const node of textNodes) {
    const text = node.textContent.trim();
    if (text) {
      currentSegment.push(node);
      currentText += (currentText ? ' ' : '') + text;
      
      // Split into larger chunks for faster translation (3000 chars, 100 nodes)
      // Larger chunks = fewer API calls = faster overall translation
      if (currentText.length > 3000 || currentSegment.length > 100) {
        if (currentSegment.length > 0) {
          segments.push({
            nodes: [...currentSegment],
            text: currentText
          });
        }
        currentSegment = [];
        currentText = '';
      }
    }
  }
  
  // Add remaining segment
  if (currentSegment.length > 0) {
    segments.push({
      nodes: [...currentSegment],
      text: currentText
    });
  }
  
  return segments;
}

// Translate page in-place (like Google Translate)
async function translatePageInPlace(sourceLang, targetLang) {
  try {
    // Get all text nodes
    const textNodes = getAllTextNodes();
    
    if (textNodes.length === 0) {
      throw new Error(t('noTextToTranslate', 'No text found to translate on this page'));
    }
    
    // Store original texts for restoration
    originalTextNodes = textNodes.map(node => ({
      node: node,
      originalText: node.textContent
    }));
    
    // Collect text segments
    const segments = collectTextSegments(textNodes);
    
    console.log(`Translating ${segments.length} segments with ${textNodes.length} text nodes`);
    
    // Load AI manager
    const manager = await loadAIManager();
    
    // Detect source language from first segment
    let actualSourceLang = sourceLang;
    if (sourceLang === 'auto' && segments.length > 0) {
      actualSourceLang = await detectLanguage(segments[0].text);
      console.log(`Detected language: ${actualSourceLang}`);
    }
    
    const sourceLangName = getLanguageName(actualSourceLang);
    const targetLangName = getLanguageName(targetLang);
    
    // Translate each segment and apply immediately
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Update progress
      updateTranslationProgress(i + 1, segments.length);
      
      // Build translation prompt for the segment
      const prompt = `Translate the following text from ${sourceLangName} to ${targetLangName}.
Provide ONLY the translated text, maintaining the same structure and spacing.
Keep HTML entities, URLs, and numbers unchanged.

Text:
${segment.text}`;
      
      // Call AI API
      const translatedText = await manager.callGeminiAPI(prompt, {
        toolId: 'ai-text-translator'
      });
      
      // Split translated text back to individual nodes
      // Simple approach: split by original word count
      const originalWords = segment.text.split(/\s+/); // eslint-disable-line no-unused-vars
      const translatedWords = translatedText.trim().split(/\s+/);
      
      // Distribute translated words to nodes proportionally
      let wordIndex = 0;
      for (let j = 0; j < segment.nodes.length; j++) {
        const node = segment.nodes[j];
        const originalNodeText = node.textContent.trim();
        const originalNodeWords = originalNodeText.split(/\s+/);
        const wordCount = originalNodeWords.length;
        
        // Get proportional words for this node
        const nodeTranslatedWords = translatedWords.slice(wordIndex, wordIndex + wordCount);
        wordIndex += wordCount;
        
        // Preserve leading/trailing whitespace
        const leadingSpace = node.textContent.match(/^\s*/)[0];
        const trailingSpace = node.textContent.match(/\s*$/)[0];
        
        node.textContent = leadingSpace + nodeTranslatedWords.join(' ') + trailingSpace;
      }
      
      // Small delay between segments to avoid rate limiting
      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    isPageTranslated = true;
    
    // Hide panel and show restore button
    hidePanel();
    showRestoreButton(actualSourceLang, targetLang);
    
    showSuccess(t('pageTranslated', 'Page translated successfully!'));
    
  } catch (error) {
    handleError(error, 'translatePageInPlace');
    throw error;
  }
}

// Update translation progress
function updateTranslationProgress(current, total) {
  const loadingIndicator = document.getElementById('toolary-ai-loading');
  if (loadingIndicator) {
    const loadingText = loadingIndicator.querySelector('div:last-child');
    if (loadingText) {
      const progressText = t('translating', 'Translating...');
      loadingText.textContent = `${progressText} ${current}/${total}`;
    }
  }
}

// Restore original page content
function restoreOriginalPage() {
  try {
    if (originalTextNodes.length === 0) {
      showWarning(t('noTranslationToRestore', 'No translation to restore'));
      return;
    }
    
    // Restore all text nodes
    originalTextNodes.forEach(({ node, originalText }) => {
      if (node && node.parentNode) {
        node.textContent = originalText;
      }
    });
    
    // Clear stored data
    originalTextNodes = [];
    isPageTranslated = false;
    
    // Remove restore button
    if (restoreButton && restoreButton.parentNode) {
      restoreButton.parentNode.removeChild(restoreButton);
      restoreButton = null;
    }
    
    showSuccess(t('pageRestored', 'Original page restored'));
    
  } catch (error) {
    handleError(error, 'restoreOriginalPage');
    showError(t('failedToRestore', 'Failed to restore original page'));
  }
}

// Create restore button (floating button to restore original)
function showRestoreButton(sourceLang, targetLang) {
  if (restoreButton) return;
  
  const button = document.createElement('div');
  button.id = 'toolary-translator-restore-btn';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #ffffff;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    border: 2px solid #374151;
  `;
  
  // Info text
  const infoText = document.createElement('span');
  infoText.textContent = `${getLanguageName(sourceLang)} → ${getLanguageName(targetLang)}`;
  infoText.style.cssText = `
    font-size: 12px;
    color: #9ca3af;
  `;
  
  // Restore button
  const restoreBtn = document.createElement('button');
  restoreBtn.style.cssText = `
    padding: 6px 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  `;
  
  const icon = createIconElement('book-open', { size: 14, decorative: true });
  restoreBtn.appendChild(icon);
  restoreBtn.appendChild(document.createTextNode(t('restoreOriginal', 'Restore Original')));
  
  const cleanupRestore = addEventListenerWithCleanup(restoreBtn, 'click', (e) => {
    e.stopPropagation();
    restoreOriginalPage();
  });
  
  cleanupFunctions.push(cleanupRestore);
  
  // Hover effects
  const cleanupHover = addEventListenerWithCleanup(button, 'mouseenter', () => {
    button.style.transform = 'translateX(-50%) scale(1.05)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  });
  
  const cleanupLeave = addEventListenerWithCleanup(button, 'mouseleave', () => {
    button.style.transform = 'translateX(-50%) scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  });
  
  cleanupFunctions.push(cleanupHover, cleanupLeave);
  
  button.appendChild(infoText);
  button.appendChild(restoreBtn);
  
  document.body.appendChild(button);
  restoreButton = button;
}

// Detect language using AI
async function detectLanguage(text) {
  try {
    if (!text || text.length < 10) {
      return 'en'; // Default fallback
    }
    
    // Load AI manager
    const manager = await loadAIManager();
    
    // Build detection prompt
    const prompt = `Detect the language of the following text. Respond with ONLY the ISO 639-1 language code (e.g., 'en', 'fr', 'tr', 'es', 'de'). Do not include any explanation.

Text:
${text.substring(0, 500)}`;
    
    // Call AI API
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-text-translator'
    });
    
    // Parse response - extract just the language code
    const detected = response.trim().toLowerCase().substring(0, 2);
    
    // Validate it's a known language code
    if (AI_LANGUAGE_NAMES[detected]) {
      return detected;
    }
    
    return 'en'; // Default if detection fails
  } catch (error) {
    handleError(error, 'detectLanguage');
    return 'en'; // Default on error
  }
}

// Translate text using AI
async function translateText(text, sourceLang, targetLang) {
  try {
    if (!text || text.length < 1) {
      throw new Error('Text too short to translate');
    }
    
    // Load AI manager
    const manager = await loadAIManager();
    
    // Detect source language if auto
    let actualSourceLang = sourceLang;
    if (sourceLang === 'auto') {
      actualSourceLang = await detectLanguage(text);
    }
    
    // Get language names
    const sourceLangName = getLanguageName(actualSourceLang);
    const targetLangName = getLanguageName(targetLang);
    
    // Limit text length (max 5000 characters for translation)
    let textToTranslate = text;
    if (text.length > 5000) {
      textToTranslate = text.substring(0, 5000);
      showWarning(t('textTruncated', 'Text was truncated to 5000 characters for translation'));
    }
    
    // Build translation prompt
    const prompt = `Translate the following text from ${sourceLangName} to ${targetLangName}.
Provide ONLY the translation without any explanations, introductions, or additional text.
Maintain the original formatting and structure as much as possible.

Text to translate:
${textToTranslate}`;
    
    // Call AI API
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-text-translator'
    });
    
    return {
      translatedText: response.trim(),
      detectedSourceLang: actualSourceLang,
      sourceLangName,
      targetLangName,
      timestamp: Date.now()
    };
  } catch (error) {
    handleError(error, 'translateText');
    throw error;
  }
}

// Save to history
async function saveToHistory(sourceText, translation, mode) {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const history = result[STORAGE_KEY] || [];
    
    const entry = {
      id: `trans-${Date.now()}`,
      sourceText: sourceText.substring(0, 500),
      translatedText: translation.translatedText.substring(0, 500),
      sourceLang: translation.detectedSourceLang,
      targetLang: targetLang,
      mode,
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

// Create floating widget (Dark gray like AI Summarizer)
function createFloatingWidget() {
  const widget = document.createElement('div');
  widget.id = 'toolary-ai-translator-widget';
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
  
  const icon = createIconElement('languages', { size: 24, decorative: true });
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
  backdrop.id = 'toolary-ai-translator-backdrop';
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
  if (!document.querySelector('#toolary-ai-translator-animations')) {
    const style = document.createElement('style');
    style.id = 'toolary-ai-translator-animations';
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
  selectedTextForTranslation = null;
  
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
  icon.textContent = '🌐';
  icon.style.fontSize = '20px';
  
  const text = document.createElement('span');
  text.textContent = t('selectTextToTranslate', 'Select text on the page to translate');
  
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
  if (selectedText.length < 10) return; // Minimum text length
  
  selectedTextForTranslation = selectedText;
  isSelectingText = false;
  
  // Remove overlay
  const overlay = document.getElementById('toolary-text-selection-overlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  
  // Show panel and automatically translate
  currentMode = 'selection';
  showPanel();
  
  // Auto-translate
  setTimeout(() => {
    handleTranslate();
  }, 300);
}

// Cancel text selection
function cancelTextSelection() {
  isSelectingText = false;
  selectedTextForTranslation = null;
  
  const overlay = document.getElementById('toolary-text-selection-overlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  
  showPanel();
}

// Create sidebar panel
function createSidebar() {
  const panel = document.createElement('div');
  panel.id = 'toolary-ai-translator-panel';
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
  
  // Header
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
  
  const titleIcon = createIconElement('languages', { size: 18, decorative: true });
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(t('aiTextTranslatorTitle', 'AI Text Translator')));
  
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
  content.id = 'toolary-ai-translator-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  `;
  
  // Mode selector (tabs)
  const modeSelector = document.createElement('div');
  modeSelector.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
  `;
  
  const modes = [
    { id: 'input', label: t('translateInput', 'Enter Text'), icon: 'text' },
    { id: 'selection', label: t('translateSelection', 'Select Text'), icon: 'element' },
    { id: 'page', label: t('translatePage', 'Page Content'), icon: 'book-open' }
  ];
  
  modes.forEach(mode => {
    const btn = createModeButton(mode.id, mode.label, mode.icon);
    modeSelector.appendChild(btn);
  });
  
  content.appendChild(modeSelector);
  
  // Language selectors
  const languageSection = document.createElement('div');
  languageSection.style.cssText = `
    background: var(--toolary-header-bg, #f8f9fa);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    padding: 14px;
    margin-bottom: 16px;
  `;
  
  // Source language
  const sourceGroup = document.createElement('div');
  sourceGroup.style.cssText = `margin-bottom: 12px;`;
  
  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = t('sourceLanguage', 'Source Language');
  sourceLabel.style.cssText = `
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    margin-bottom: 6px;
  `;
  
  const sourceSelect = document.createElement('select');
  sourceSelect.id = 'toolary-source-lang';
  sourceSelect.style.cssText = `
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    font-size: 13px;
    cursor: pointer;
  `;
  
  // Add auto-detect option
  const autoOption = document.createElement('option');
  autoOption.value = 'auto';
  autoOption.textContent = t('autoDetect', 'Auto Detect');
  autoOption.selected = true;
  sourceSelect.appendChild(autoOption);
  
  // Add all languages
  Object.entries(AI_LANGUAGE_NAMES).forEach(([code, name]) => {
    if (code !== 'auto') {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      sourceSelect.appendChild(option);
    }
  });
  
  const sourceCleanup = addEventListenerWithCleanup(sourceSelect, 'change', () => {
    sourceLang = sourceSelect.value;
  });
  cleanupFunctions.push(sourceCleanup);
  
  sourceGroup.appendChild(sourceLabel);
  sourceGroup.appendChild(sourceSelect);
  
  // Target language
  const targetGroup = document.createElement('div');
  
  const targetLabel = document.createElement('label');
  targetLabel.textContent = t('targetLanguage', 'Target Language');
  targetLabel.style.cssText = `
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    margin-bottom: 6px;
  `;
  
  const targetSelect = document.createElement('select');
  targetSelect.id = 'toolary-target-lang';
  targetSelect.style.cssText = `
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    font-size: 13px;
    cursor: pointer;
  `;
  
  // Add all languages (no auto for target)
  Object.entries(AI_LANGUAGE_NAMES).forEach(([code, name]) => {
    if (code !== 'auto') {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      if (code === 'en') option.selected = true;
      targetSelect.appendChild(option);
    }
  });
  
  const targetCleanup = addEventListenerWithCleanup(targetSelect, 'change', () => {
    targetLang = targetSelect.value;
  });
  cleanupFunctions.push(targetCleanup);
  
  targetGroup.appendChild(targetLabel);
  targetGroup.appendChild(targetSelect);
  
  languageSection.appendChild(sourceGroup);
  languageSection.appendChild(targetGroup);
  content.appendChild(languageSection);
  
  // Input section (for manual mode)
  const inputSection = document.createElement('div');
  inputSection.id = 'toolary-input-section';
  inputSection.style.cssText = `
    display: ${currentMode === 'input' ? 'block' : 'none'};
    margin-bottom: 16px;
  `;
  
  const inputLabel = document.createElement('label');
  inputLabel.textContent = t('enterTextToTranslate', 'Enter text to translate');
  inputLabel.style.cssText = `
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    margin-bottom: 6px;
  `;
  
  const inputTextarea = document.createElement('textarea');
  inputTextarea.id = 'toolary-input-text';
  inputTextarea.placeholder = t('typeOrPasteText', 'Type or paste text here...');
  inputTextarea.rows = 6;
  inputTextarea.style.cssText = `
    width: 100%;
    padding: 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.5;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    resize: vertical;
    font-family: inherit;
  `;
  
  inputSection.appendChild(inputLabel);
  inputSection.appendChild(inputTextarea);
  content.appendChild(inputSection);
  
  // Translate button
  const translateBtn = document.createElement('button');
  translateBtn.id = 'toolary-translate-btn';
  translateBtn.style.cssText = `
    width: 100%;
    padding: 12px 20px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  `;
  
  const translateIcon = createIconElement('languages', { size: 16, decorative: true });
  translateBtn.appendChild(translateIcon);
  translateBtn.appendChild(document.createTextNode(t('translate', 'Translate')));
  
  const translateCleanup = addEventListenerWithCleanup(translateBtn, 'click', handleTranslate);
  cleanupFunctions.push(translateCleanup);
  
  content.appendChild(translateBtn);
  
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
  loadingText.textContent = t('translating', 'Translating...');
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
  
  content.appendChild(loadingIndicator);
  
  // Results section
  const resultsSection = document.createElement('div');
  resultsSection.id = 'toolary-ai-results';
  resultsSection.style.cssText = `display: none;`;
  content.appendChild(resultsSection);
  
  // Assemble panel
  panel.appendChild(header);
  panel.appendChild(content);
  
  return panel;
}

// Create mode button
function createModeButton(modeId, label, iconName) {
  const btn = document.createElement('button');
  btn.id = `mode-${modeId}`;
  btn.style.cssText = `
    padding: 10px 8px;
    background: ${currentMode === modeId ? 'var(--toolary-primary-color, #007bff)' : 'var(--toolary-bg, #fff)'};
    color: ${currentMode === modeId ? '#ffffff' : 'var(--toolary-text, #333)'};
    border: ${currentMode === modeId ? 'none' : '1px solid var(--toolary-border, #ddd)'};
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
  `;
  
  const icon = createIconElement(iconName, { size: 16, decorative: true });
  const textSpan = document.createElement('span');
  textSpan.textContent = label;
  textSpan.style.fontSize = '11px';
  
  btn.appendChild(icon);
  btn.appendChild(textSpan);
  
  const cleanup = addEventListenerWithCleanup(btn, 'click', () => {
    currentMode = modeId;
    updateModeUI();
    
    // Handle special modes
    if (modeId === 'selection') {
      startTextSelection();
    }
  });
  
  cleanupFunctions.push(cleanup);
  
  return btn;
}

// Update mode UI
function updateModeUI() {
  // Update mode buttons
  const modes = ['input', 'selection', 'page'];
  modes.forEach(mode => {
    const btn = document.getElementById(`mode-${mode}`);
    if (btn) {
      const isActive = currentMode === mode;
      btn.style.background = isActive ? 'var(--toolary-primary-color, #007bff)' : 'var(--toolary-bg, #fff)';
      btn.style.color = isActive ? '#ffffff' : 'var(--toolary-text, #333)';
      btn.style.border = isActive ? 'none' : '1px solid var(--toolary-border, #ddd)';
    }
  });
  
  // Show/hide input section
  const inputSection = document.getElementById('toolary-input-section');
  if (inputSection) {
    inputSection.style.display = currentMode === 'input' ? 'block' : 'none';
  }
}

// Handle translate button click
async function handleTranslate() {
  if (isTranslating) return;
  
  try {
    isTranslating = true;
    
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    const resultsSection = document.getElementById('toolary-ai-results');
    const translateBtn = document.getElementById('toolary-translate-btn');
    
    // Disable button and show loading
    if (translateBtn) translateBtn.disabled = true;
    
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }
    
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
    
    // Handle page mode differently (in-place translation)
    if (currentMode === 'page') {
      await translatePageInPlace(sourceLang, targetLang);
      return; // Early return - don't show results in sidebar
    }
    
    // Get text for input/selection modes
    let text;
    if (currentMode === 'input') {
      const inputTextarea = document.getElementById('toolary-input-text');
      text = inputTextarea ? inputTextarea.value.trim() : '';
      if (!text) {
        throw new Error(t('pleaseEnterText', 'Please enter text to translate'));
      }
    } else if (currentMode === 'selection') {
      if (!selectedTextForTranslation) {
        throw new Error(t('pleaseSelectText', 'Please select text on the page'));
      }
      text = selectedTextForTranslation;
    }
    
    // Translate (for input/selection modes)
    const translation = await translateText(text, sourceLang, targetLang);
    
    // Store result
    // currentTranslation = {
    //   sourceText: text,
    //   ...translation
    // };
    
    // Display result in sidebar
    renderTranslationResult(text, translation);
    
    // Save to history
    await saveToHistory(text, translation, currentMode);
    
    // Show success message
    showSuccess(t('translationCompleted', 'Translation completed!'));
    
    // Show coffee message
    showCoffeeMessageForTool('ai-text-translator');
    
  } catch (error) {
    handleError(error, 'handleTranslate');
    const message = error.message || t('failedToTranslate', 'Failed to translate text');
    showError(message);
    
    // Hide loading
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  } finally {
    isTranslating = false;
    const translateBtn = document.getElementById('toolary-translate-btn');
    if (translateBtn) translateBtn.disabled = false;
  }
}

// Render translation result
function renderTranslationResult(sourceText, translation) {
  const resultsSection = document.getElementById('toolary-ai-results');
  if (!resultsSection) return;
  
  // Hide loading
  const loadingIndicator = document.getElementById('toolary-ai-loading');
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
  
  resultsSection.innerHTML = '';
  resultsSection.style.cssText = `
    display: block;
    padding: 16px;
    background: var(--toolary-header-bg, #f8f9fa);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
  `;
  
  // Original text section
  const originalSection = document.createElement('div');
  originalSection.style.cssText = `margin-bottom: 16px;`;
  
  const originalLabel = document.createElement('div');
  originalLabel.textContent = `${t('originalText', 'Original')} (${translation.sourceLangName})`;
  originalLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 8px;
  `;
  
  const originalText = document.createElement('div');
  originalText.style.cssText = `
    font-size: 13px;
    line-height: 1.6;
    color: var(--toolary-text, #333);
    padding: 10px;
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    max-height: 150px;
    overflow-y: auto;
  `;
  originalText.textContent = sourceText.length > 500 ? sourceText.substring(0, 500) + '...' : sourceText;
  
  originalSection.appendChild(originalLabel);
  originalSection.appendChild(originalText);
  
  // Translated text section
  const translatedSection = document.createElement('div');
  translatedSection.style.cssText = `margin-bottom: 12px;`;
  
  const translatedLabel = document.createElement('div');
  translatedLabel.textContent = `${t('translatedText', 'Translation')} (${translation.targetLangName})`;
  translatedLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 8px;
  `;
  
  const translatedText = document.createElement('div');
  translatedText.style.cssText = `
    font-size: 13px;
    line-height: 1.6;
    color: var(--toolary-text, #333);
    padding: 10px;
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
  `;
  translatedText.textContent = translation.translatedText;
  
  translatedSection.appendChild(translatedLabel);
  translatedSection.appendChild(translatedText);
  
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.style.cssText = `
    width: 100%;
    padding: 10px 16px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  `;
  
  const copyIcon = createIconElement('copy', { size: 14, decorative: true });
  copyBtn.appendChild(copyIcon);
  copyBtn.appendChild(document.createTextNode(t('copyTranslation', 'Copy Translation')));
  
  const copyCleanup = addEventListenerWithCleanup(copyBtn, 'click', async () => {
    try {
      await copyText(translation.translatedText);
      showSuccess(t('translationCopied', 'Translation copied!'));
      
      // Visual feedback
      copyBtn.textContent = t('copied', 'Copied!');
      copyBtn.style.background = 'var(--toolary-success-color, #28a745)';
      
      setTimeout(() => {
        copyBtn.innerHTML = '';
        copyBtn.appendChild(createIconElement('copy', { size: 14, decorative: true }));
        copyBtn.appendChild(document.createTextNode(t('copyTranslation', 'Copy Translation')));
        copyBtn.style.background = 'var(--toolary-primary-color, #007bff)';
      }, 2000);
    } catch (error) {
      handleError(error, 'copyTranslation');
      showError(t('failedToCopy', 'Failed to copy'));
    }
  });
  cleanupFunctions.push(copyCleanup);
  
  // Assemble results
  resultsSection.appendChild(originalSection);
  resultsSection.appendChild(translatedSection);
  resultsSection.appendChild(copyBtn);
  
  resultsSection.style.display = 'block';
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
    
    const message = t('translatorActivated', 'AI Translator activated');
    showInfo(message);
    
  } catch (error) {
    handleError(error, 'textTranslator.activate');
    const message = t('failedToActivate', 'Failed to activate translator');
    showError(message);
    deactivate();
  }
}

// Deactivation
export function deactivate() {
  try {
    // Restore page if it was translated
    if (isPageTranslated && originalTextNodes.length > 0) {
      restoreOriginalPage();
    }
    
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
    
    // Remove restore button if exists
    if (restoreButton && restoreButton.parentNode) {
      restoreButton.parentNode.removeChild(restoreButton);
      restoreButton = null;
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
    currentMode = 'input';
    isTranslating = false;
    // currentTranslation = null;
    isSelectingText = false;
    selectedTextForTranslation = null;
    sourceLang = 'auto';
    targetLang = 'en';
    originalTextNodes = [];
    isPageTranslated = false;
    isActive = false;
    langMap = {};
    
  } catch (error) {
    handleError(error, 'textTranslator.deactivate');
  }
}

