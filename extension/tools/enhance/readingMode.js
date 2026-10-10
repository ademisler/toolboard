import { showError, showSuccess, handleError, addEventListenerWithCleanup } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'reading-mode',
  name: 'Reading Mode',
  category: 'enhance',
  icon: 'book-open',
  permissions: ['activeTab', 'storage'],
  tags: ['reading', 'focus', 'clean'],
  keywords: ['reader', 'article', 'focus', 'distraction-free']
};

// Distraction selectors to hide
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

// Content selectors to try in order
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

// Navigation keywords that indicate non-content
const NAV_KEYWORDS = [
  'nav', 'menu', 'sidebar', 'footer', 'header',
  'advertisement', 'ad', 'banner', 'social',
  'comment', 'share', 'related', 'popular',
  'trending', 'newsletter', 'subscribe'
];

// let deactivateCb;
let readerOverlay = null;
let toolbar = null;
let settings = {
  fontSize: 18,
  theme: 'auto',
  toolbarMinimized: false
};
let cleanupFunctions = [];
let toolbarCleanupFunctions = [];
let mutationObserver = null;

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['toolaryReadingMode']);
    if (result.toolaryReadingMode) {
      settings = { ...settings, ...result.toolaryReadingMode };
    }
  } catch (error) {
    handleError(error, 'loadSettings');
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    await chrome.storage.local.set({ toolaryReadingMode: settings });
  } catch (error) {
    handleError(error, 'saveSettings');
  }
}

// Calculate readability score for a node
function scoreNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return 0;
  
  let score = 0;
  const text = node.textContent || '';
  
  // Award points for text content
  const textLength = text.trim().length;
  if (textLength > 100) score += 1;
  if (textLength > 500) score += 2;
  if (textLength > 1000) score += 3;
  
  // Award points for paragraphs
  const paragraphs = node.querySelectorAll('p');
  score += paragraphs.length * 2;
  
  // Award points for headings
  const headings = node.querySelectorAll('h1, h2, h3, h4, h5, h6');
  score += headings.length * 1.5;
  
  // Calculate link density
  const links = node.querySelectorAll('a');
  const linkTextLength = Array.from(links).reduce((sum, link) => sum + (link.textContent || '').length, 0);
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 0;
  
  // Penalize high link density
  if (linkDensity > 0.3) score -= 2;
  if (linkDensity > 0.5) score -= 4;
  
  // Check for navigation keywords in class/id
  const className = (node.className || '').toLowerCase();
  const id = (node.id || '').toLowerCase();
  const classIdText = `${className} ${id}`;
  
  for (const keyword of NAV_KEYWORDS) {
    if (classIdText.includes(keyword)) {
      score -= 3;
    }
  }
  
  // Check for semantic content indicators
  if (node.tagName === 'ARTICLE') score += 5;
  if (node.tagName === 'MAIN') score += 4;
  if (node.getAttribute('role') === 'main') score += 4;
  
  // Penalize very short content
  if (textLength < 200) score -= 2;
  
  return score;
}

// Extract main content using hybrid approach
function extractMainContent() {
  try {
    // First, try semantic selectors
    for (const selector of CONTENT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 200) {
        return element.cloneNode(true);
      }
    }
    
    // If no semantic content found, use scoring algorithm
    let bestCandidate = null;
    let bestScore = -Infinity;
    
    // Score all divs and sections
    const candidates = document.querySelectorAll('div, section');
    
    for (const candidate of candidates) {
      const score = scoreNode(candidate);
      if (score > bestScore && candidate.textContent.trim().length > 200) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
    
    // If we found a good candidate, return it
    if (bestCandidate && bestScore > 0) {
      return bestCandidate.cloneNode(true);
    }
    
    // Fallback: try to find the largest text block
    const allElements = document.querySelectorAll('*');
    let largestElement = null;
    let largestTextLength = 0;
    
    for (const element of allElements) {
      const textLength = element.textContent.trim().length;
      if (textLength > largestTextLength && textLength > 200) {
        // Skip if it contains mostly navigation elements
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
    
    return largestElement ? largestElement.cloneNode(true) : null;
  } catch (error) {
    handleError(error, 'extractMainContent');
    return null;
  }
}

// Clean content by removing distracting elements
function cleanContent(content) {
  if (!content) return null;
  
  try {
    const cleaned = content.cloneNode(true);
    
    // Remove distracting elements
    for (const selector of DISTRACTION_SELECTORS) {
      const elements = cleaned.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    }
    
    // Remove all inline styles
    const allElements = cleaned.querySelectorAll('*');
    allElements.forEach(el => {
      el.removeAttribute('style');
    });

    // Remove empty paragraphs and divs
    const emptyElements = cleaned.querySelectorAll('p, div');
    emptyElements.forEach(el => {
      if (!el.textContent.trim() && !el.querySelector('img, video, iframe')) {
        el.remove();
      }
    });
    
    // Remove script and style tags
    const scripts = cleaned.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());
    
    return cleaned;
  } catch (error) {
    handleError(error, 'cleanContent');
    return content;
  }
}

// Get current theme based on settings and system preference
function getCurrentTheme() {
  if (settings.theme === 'auto') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return settings.theme;
}

// Create reader styles
function createReaderStyles() {
  const styleId = 'toolary-reading-mode-styles';
  let styleElement = document.getElementById(styleId);
  
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }
  
  const theme = getCurrentTheme();
  const isDark = theme === 'dark';
  
  styleElement.textContent = `
    .toolary-reading-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: ${isDark ? '#1e1e1e' : '#ffffff'} !important;
      z-index: 2147483647 !important;
      overflow-y: auto !important;
      font-family: Georgia, 'Times New Roman', serif !important;
    }
    
    .toolary-reading-content {
      max-width: 680px !important;
      margin: 0 auto !important;
      padding: 40px 20px !important;
      line-height: 1.8 !important;
      font-size: ${settings.fontSize}px !important;
      color: ${isDark ? '#f5f5f5' : '#1f2937'} !important;
      background: ${isDark ? '#1e1e1e' : '#ffffff'} !important;
    }
    
    .toolary-reading-content h1,
    .toolary-reading-content h2,
    .toolary-reading-content h3,
    .toolary-reading-content h4,
    .toolary-reading-content h5,
    .toolary-reading-content h6 {
      color: ${isDark ? '#f5f5f5' : '#1f2937'} !important;
      margin-top: 2em !important;
      margin-bottom: 1em !important;
      line-height: 1.3 !important;
    }
    
    .toolary-reading-content h1 {
      font-size: 2.2em !important;
    }
    
    .toolary-reading-content h2 {
      font-size: 1.8em !important;
    }
    
    .toolary-reading-content h3 {
      font-size: 1.5em !important;
    }
    
    .toolary-reading-content p {
      margin-bottom: 1.5em !important;
      text-align: justify !important;
    }
    
    .toolary-reading-content img {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 2em auto !important;
      border-radius: 8px !important;
    }
    
    .toolary-reading-content blockquote {
      border-left: 4px solid ${isDark ? '#64b5f6' : '#448aff'} !important;
      padding-left: 1.5em !important;
      margin: 2em 0 !important;
      font-style: italic !important;
      color: ${isDark ? '#cccccc' : '#6b7280'} !important;
    }
    
    .toolary-reading-content code {
      background: ${isDark ? '#3c3c3c' : '#f8f9fa'} !important;
      padding: 0.2em 0.4em !important;
      border-radius: 4px !important;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
      font-size: 0.9em !important;
    }
    
    .toolary-reading-content pre {
      background: ${isDark ? '#3c3c3c' : '#f8f9fa'} !important;
      padding: 1.5em !important;
      border-radius: 8px !important;
      overflow-x: auto !important;
      margin: 2em 0 !important;
    }
    
    .toolary-reading-content pre code {
      background: none !important;
      padding: 0 !important;
    }
    
    .toolary-reading-content a {
      color: ${isDark ? '#64b5f6' : '#448aff'} !important;
      text-decoration: underline !important;
    }
    
    .toolary-reading-content a:hover {
      opacity: 0.8 !important;
    }
    
    .toolary-reading-content ul,
    .toolary-reading-content ol {
      margin: 1.5em 0 !important;
      padding-left: 2em !important;
    }
    
    .toolary-reading-content li {
      margin-bottom: 0.5em !important;
    }
    
    .toolary-reading-toolbar {
      position: fixed !important;
      top: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: ${isDark ? '#2a2a2a' : '#ffffff'} !important;
      border: 1px solid ${isDark ? '#3a3a3a' : '#d1d5db'} !important;
      border-radius: 12px !important;
      padding: 12px 16px !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
      z-index: 2147483648 !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    
    .toolary-reading-toolbar.minimized {
      top: 20px !important;
      right: 20px !important;
      left: auto !important;
      transform: none !important;
      width: 48px !important;
      height: 48px !important;
      border-radius: 50% !important;
      padding: 0 !important;
      justify-content: center !important;
    }

    .toolary-reading-toolbar.minimized .font-size-control,
    .toolary-reading-toolbar.minimized #toolary-reading-exit,
    .toolary-reading-toolbar.minimized #toolary-reading-theme-toggle {
      display: none !important;
    }
    
    .toolary-reading-toolbar button {
      background: none !important;
      border: 1px solid transparent !important;
      border-radius: 8px !important;
      padding: 8px !important;
      color: ${isDark ? '#f5f5f5' : '#1f2937'} !important;
      cursor: pointer !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: 36px !important;
      height: 36px !important;
    }
    
    .toolary-reading-toolbar button:hover {
      background: ${isDark ? '#333333' : '#f3f4f6'} !important;
      border-color: ${isDark ? '#3a3a3a' : '#d1d5db'} !important;
    }
    
    .toolary-reading-toolbar button svg {
      width: 16px !important;
      height: 16px !important;
    }
    
    .toolary-reading-toolbar .font-size-control {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }
    
    .toolary-reading-toolbar input[type="range"] {
      width: 100px !important;
      height: 4px !important;
      background: ${isDark ? '#3a3a3a' : '#d1d5db'} !important;
      border-radius: 2px !important;
      outline: none !important;
      -webkit-appearance: none !important;
    }
    
    .toolary-reading-toolbar input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none !important;
      width: 16px !important;
      height: 16px !important;
      background: ${isDark ? '#64b5f6' : '#448aff'} !important;
      border-radius: 50% !important;
      cursor: pointer !important;
    }
    
    .toolary-reading-toolbar input[type="range"]::-moz-range-thumb {
      width: 16px !important;
      height: 16px !important;
      background: ${isDark ? '#64b5f6' : '#448aff'} !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      border: none !important;
    }
    
    .toolary-reading-toolbar .font-size-label {
      font-size: 12px !important;
      color: ${isDark ? '#b0b0b0' : '#6b7280'} !important;
      min-width: 30px !important;
      text-align: center !important;
    }
    
    @media (max-width: 768px) {
      .toolary-reading-content {
        padding: 20px 15px !important;
        font-size: ${Math.max(14, settings.fontSize - 2)}px !important;
      }
      
      .toolary-reading-toolbar {
        top: 10px !important;
        left: 10px !important;
        right: 10px !important;
        transform: none !important;
        padding: 8px 12px !important;
      }
      
      .toolary-reading-toolbar.minimized {
        transform: translateY(-100px) !important;
      }
    }
  `;
}

// Create toolbar
function createToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolary-reading-toolbar';
  if (settings.toolbarMinimized) {
    toolbar.classList.add('minimized');
  }
  
  const theme = getCurrentTheme();
  const isDark = theme === 'dark';
  
  toolbar.innerHTML = `
    <button id="toolary-reading-exit" title="${chrome.i18n ? chrome.i18n.getMessage('exitReadingMode') : 'Exit Reading Mode'}">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18"></path>
        <path d="m6 6 12 12"></path>
      </svg>
    </button>
    
    <div class="font-size-control">
      <button id="toolary-reading-font-decrease" title="${chrome.i18n ? chrome.i18n.getMessage('decreaseFontSize') : 'Decrease font size'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"></path>
        </svg>
      </button>
      <span class="font-size-label">${settings.fontSize}px</span>
      <input type="range" id="toolary-reading-font-slider" min="14" max="24" value="${settings.fontSize}">
      <button id="toolary-reading-font-increase" title="${chrome.i18n ? chrome.i18n.getMessage('increaseFontSize') : 'Increase font size'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"></path>
          <path d="M12 5v14"></path>
        </svg>
      </button>
    </div>
    
    <button id="toolary-reading-theme-toggle" title="${chrome.i18n ? chrome.i18n.getMessage('toggleTheme') : 'Toggle theme'}">
      ${isDark ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2"></path>
          <path d="M12 21v2"></path>
          <path d="M4.22 4.22l1.42 1.42"></path>
          <path d="M18.36 18.36l1.42 1.42"></path>
          <path d="M1 12h2"></path>
          <path d="M21 12h2"></path>
          <path d="M4.22 19.78l1.42-1.42"></path>
          <path d="M18.36 5.64l1.42-1.42"></path>
        </svg>
      ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `}
    </button>
    
    <button id="toolary-reading-minimize" title="${settings.toolbarMinimized ? (chrome.i18n ? chrome.i18n.getMessage('showToolbar') : 'Show toolbar') : (chrome.i18n ? chrome.i18n.getMessage('hideToolbar') : 'Hide toolbar')}">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
        <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
        <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
        <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
      </svg>
    </button>
  `;
  
  return toolbar;
}

// Create reader view
function createReaderView(content) {
  const overlay = document.createElement('div');
  overlay.className = 'toolary-reading-overlay';
  
  const readerContent = document.createElement('div');
  readerContent.className = 'toolary-reading-content';
  readerContent.appendChild(content);
  
  overlay.appendChild(readerContent);
  
  return { overlay, readerContent };
}

// Update font size
function updateFontSize(newSize) {
  console.log('Reading Mode: Updating font size from', settings.fontSize, 'to', newSize);
  settings.fontSize = Math.max(14, Math.min(24, newSize));
  
  // Regenerate styles to apply the new font size
  createReaderStyles();
  
  const label = document.querySelector('.font-size-label');
  if (label) {
    label.textContent = `${settings.fontSize}px`;
    console.log('Reading Mode: Font size label updated to', settings.fontSize + 'px');
  }
  
  const slider = document.querySelector('#toolary-reading-font-slider');
  if (slider) {
    slider.value = settings.fontSize;
    console.log('Reading Mode: Font size slider updated to', settings.fontSize);
  }
  
  saveSettings();
  console.log('Reading Mode: Font size update completed');
}

// Toggle theme
function toggleTheme() {
  console.log('Reading Mode: Toggling theme from', settings.theme);
  if (settings.theme === 'auto') {
    const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    settings.theme = systemTheme === 'light' ? 'dark' : 'light';
  } else {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
  }
  
  createReaderStyles();
  
  // Update the theme toggle button icon
  const themeToggle = document.getElementById('toolary-reading-theme-toggle');
  if (themeToggle) {
    const isDark = getCurrentTheme() === 'dark';
    themeToggle.innerHTML = isDark ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2"></path>
          <path d="M12 21v2"></path>
          <path d="M4.22 4.22l1.42 1.42"></path>
          <path d="M18.36 18.36l1.42 1.42"></path>
          <path d="M1 12h2"></path>
          <path d="M21 12h2"></path>
          <path d="M4.22 19.78l1.42-1.42"></path>
          <path d="M18.36 5.64l1.42-1.42"></path>
        </svg>
      ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `;
  }
  
  saveSettings();
  console.log('Reading Mode: Theme toggled successfully to', settings.theme);
}

// Toggle toolbar minimize
function toggleToolbarMinimize() {
  console.log('Reading Mode: Toggling toolbar minimize from', settings.toolbarMinimized, 'to', !settings.toolbarMinimized);
  settings.toolbarMinimized = !settings.toolbarMinimized;
  const toolbar = document.querySelector('.toolary-reading-toolbar');
  if (toolbar) {
    if (settings.toolbarMinimized) {
      toolbar.classList.add('minimized');
    } else {
      toolbar.classList.remove('minimized');
    }
    
    // Update button title and icon
    const minimizeBtn = document.getElementById('toolary-reading-minimize');
    if (minimizeBtn) {
      minimizeBtn.setAttribute('title', settings.toolbarMinimized ? (chrome.i18n ? chrome.i18n.getMessage('showToolbar') : 'Show toolbar') : (chrome.i18n ? chrome.i18n.getMessage('hideToolbar') : 'Hide toolbar'));
      if (settings.toolbarMinimized) {
        // Change to tool icon
        minimizeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
</svg>`;
      } else {
        // Change back to minimize icon
        minimizeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
        <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
        <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
        <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
      </svg>`;
      }
    }
  }
  saveSettings();
  console.log('Reading Mode: Toolbar minimize toggled successfully');
}

// Setup toolbar event listeners
function setupToolbarEventListeners() {
  console.log('Reading Mode: Setting up toolbar event listeners...');
  
  // Exit button
  const exitBtn = document.getElementById('toolary-reading-exit');
  if (exitBtn) {
    const cleanup = addEventListenerWithCleanup(exitBtn, 'click', () => {
      console.log('Reading Mode: Exit button clicked');
      deactivate();
    });
    toolbarCleanupFunctions.push(cleanup);
  }
  
  // Font size controls
  const fontDecrease = document.getElementById('toolary-reading-font-decrease');
  if (fontDecrease) {
    const cleanup = addEventListenerWithCleanup(fontDecrease, 'click', () => {
      console.log('Reading Mode: Font decrease clicked');
      updateFontSize(settings.fontSize - 1);
    });
    toolbarCleanupFunctions.push(cleanup);
  }
  
  const fontIncrease = document.getElementById('toolary-reading-font-increase');
  if (fontIncrease) {
    const cleanup = addEventListenerWithCleanup(fontIncrease, 'click', () => {
      console.log('Reading Mode: Font increase clicked');
      updateFontSize(settings.fontSize + 1);
    });
    toolbarCleanupFunctions.push(cleanup);
  }
  
  const fontSlider = document.getElementById('toolary-reading-font-slider');
  if (fontSlider) {
    const cleanup = addEventListenerWithCleanup(fontSlider, 'input', (e) => {
      console.log('Reading Mode: Font slider changed to', e.target.value);
      updateFontSize(parseInt(e.target.value, 10));
    });
    toolbarCleanupFunctions.push(cleanup);
  }
  
  // Theme toggle
  const themeToggle = document.getElementById('toolary-reading-theme-toggle');
  if (themeToggle) {
    const cleanup = addEventListenerWithCleanup(themeToggle, 'click', () => {
      console.log('Reading Mode: Theme toggle clicked');
      toggleTheme();
    });
    toolbarCleanupFunctions.push(cleanup);
  }
  
  // Minimize toggle
  const minimizeBtn = document.getElementById('toolary-reading-minimize');
  if (minimizeBtn) {
    const cleanup = addEventListenerWithCleanup(minimizeBtn, 'click', () => {
      console.log('Reading Mode: Minimize toggle clicked');
      toggleToolbarMinimize();
    });
    toolbarCleanupFunctions.push(cleanup);
  }
  
  console.log('Reading Mode: Toolbar event listeners set up successfully');
}

// Setup event listeners
function setupEventListeners() {
  // Setup toolbar event listeners
  setupToolbarEventListeners();
  
  // ESC key to exit
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      console.log('Reading Mode: ESC key pressed');
      deactivate();
    }
  };
  document.addEventListener('keydown', escHandler);
  cleanupFunctions.push(() => {
    document.removeEventListener('keydown', escHandler);
  });
  
  // Click outside to exit
  const overlay = document.querySelector('.toolary-reading-overlay');
  if (overlay) {
    const clickHandler = (e) => {
      if (e.target === overlay) {
        console.log('Reading Mode: Clicked outside reader');
        deactivate();
      }
    };
    const cleanup = addEventListenerWithCleanup(overlay, 'click', clickHandler);
    cleanupFunctions.push(cleanup);
  }
}

// Handle dynamic content changes
function setupContentWatcher() {
  // eslint-disable-next-line no-undef
  mutationObserver = new MutationObserver((mutations) => {
    let shouldReextract = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if significant content was added
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const textLength = node.textContent?.trim().length || 0;
            if (textLength > 500) {
              shouldReextract = true;
              break;
            }
          }
        }
      }
    }
    
    if (shouldReextract) {
      // Debounce re-extraction
      clearTimeout(window.toolaryReadingReextractTimeout);
      window.toolaryReadingReextractTimeout = setTimeout(() => {
        const newContent = extractMainContent();
        if (newContent) {
          const cleanedContent = cleanContent(newContent);
          if (cleanedContent) {
            const readerContent = document.querySelector('.toolary-reading-content');
            if (readerContent) {
              readerContent.innerHTML = '';
              readerContent.appendChild(cleanedContent);
            }
          }
        }
      }, 1000);
    }
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

let isActive = false;

export async function activate(deactivate) {
  if (isActive) return;
  isActive = true;
  try {
    // deactivateCb = deactivate;
    
    // Load settings
    await loadSettings();
    
    // Extract main content
    const mainContent = extractMainContent();
    if (!mainContent) {
      const message = chrome.i18n ? chrome.i18n.getMessage('noReadableContentFound') : 'No readable content found on this page';
      showError(message);
      deactivate();
      return;
    }
    
    // Clean content
    const cleanedContent = cleanContent(mainContent);
    if (!cleanedContent) {
      const message = chrome.i18n ? chrome.i18n.getMessage('unableToCleanContent') : 'Unable to clean content for reading';
      showError(message);
      deactivate();
      return;
    }
    
    // Create reader view
    const { overlay } = createReaderView(cleanedContent);
    readerOverlay = overlay;
    
    // Create toolbar
    toolbar = createToolbar();
    
    // Create styles
    createReaderStyles();
    
    // Add to page
    document.body.appendChild(overlay);
    document.body.appendChild(toolbar);
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup content watcher for dynamic content
    setupContentWatcher();
    
    const message = chrome.i18n ? chrome.i18n.getMessage('readingModeActivated') : 'Reading Mode activated';
    showSuccess(message);
    
    // Show coffee message
    showCoffeeMessageForTool('reading-mode');
    
  } catch (error) {
    handleError(error, 'readingMode.activate');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToActivateReadingMode') : 'Failed to activate Reading Mode';
    showError(message);
    deactivate();
  }
}

export function deactivate() {
  try {
    // Clean up event listeners
    cleanupFunctions.forEach(cleanup => cleanup());
    cleanupFunctions = [];
    
    // Clean up toolbar event listeners
    toolbarCleanupFunctions.forEach(cleanup => cleanup());
    toolbarCleanupFunctions = [];
    
    // Stop mutation observer
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    
    // Clear timeout
    if (window.toolaryReadingReextractTimeout) {
      clearTimeout(window.toolaryReadingReextractTimeout);
      delete window.toolaryReadingReextractTimeout;
    }
    
    // Remove reader elements
    if (readerOverlay) {
      readerOverlay.remove();
      readerOverlay = null;
    }
    
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
    
    // Remove styles
    const styleElement = document.getElementById('toolary-reading-mode-styles');
    if (styleElement) {
      styleElement.remove();
    }
    
    isActive = false;
    
  } catch (error) {
    handleError(error, 'readingMode.deactivate');
  }
}
