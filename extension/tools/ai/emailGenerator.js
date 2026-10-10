import { 
  showSuccess, 
  showError, 
  showInfo,
  handleError, 
  addEventListenerWithCleanup,
  copyText
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'ai-email-generator',
  name: 'AI Email Generator',
  category: 'ai',
  icon: 'email',
  permissions: ['activeTab', 'storage'],
  tags: ['ai', 'email', 'writing', 'productivity'],
  keywords: ['email', 'mail', 'compose', 'write', 'professional']
};

// Storage key
const STORAGE_KEY = 'toolaryAIEmailGeneratorHistory';
const MAX_HISTORY = 10;

// Language support (same as popup.js)
const SUPPORTED_LANGUAGES = ['en', 'tr', 'fr'];
let langMap = {};

// Content selectors (from readingMode.js / textSummarizer.js)
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

// Email configuration
const EMAIL_TONES = [
  { id: 'professional', label: 'toneProfessional' },
  { id: 'friendly', label: 'toneFriendly' },
  { id: 'formal', label: 'toneFormal' },
  { id: 'casual', label: 'toneCasual' },
  { id: 'persuasive', label: 'tonePersuasive' }
];

const EMAIL_TYPES = [
  { id: 'follow-up', label: 'typeFollowUp' },
  { id: 'thank-you', label: 'typeThankYou' },
  { id: 'request', label: 'typeRequest' },
  { id: 'complaint', label: 'typeComplaint' },
  { id: 'introduction', label: 'typeIntroduction' },
  { id: 'apology', label: 'typeApology' },
  { id: 'reminder', label: 'typeReminder' },
  { id: 'invitation', label: 'typeInvitation' }
];

const EMAIL_LENGTHS = [
  { id: 'short', label: 'emailLengthShort', words: 50 },
  { id: 'medium', label: 'emailLengthMedium', words: 150 },
  { id: 'long', label: 'emailLengthLong', words: 300 }
];

// State
let cleanupFunctions = [];
let floatingWidget = null;
let sidebar = null;
let backdrop = null;
let backdropClickArea = null;
let isPanelOpen = false;
let currentMode = 'input'; // 'input' or 'page'
let isGenerating = false;
// let currentEmail = null; // Will be used for future features
let currentTone = 'professional';
let currentType = 'follow-up';
let currentLength = 'medium';

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

// Generate email using AI
async function generateEmail(context, tone, type, length) {
  try {
    if (!context || context.length < 10) {
      throw new Error('Context too short to generate email');
    }
    
    // Load AI manager
    const manager = await loadAIManager();
    
    // Get user language
    const langCode = await getUserLanguage();
    const languageName = getLanguageName(langCode);
    
    // Get word count
    const lengthConfig = EMAIL_LENGTHS.find(l => l.id === length);
    const wordCount = lengthConfig ? lengthConfig.words : 150;
    
    // Build prompt
    const prompt = `Generate a professional email based on the following context.

Context: ${context}
Tone: ${tone}
Type: ${type}
Length: approximately ${wordCount} words

Provide:
1. Subject line (concise and relevant)
2. Email body (well-structured, appropriate tone)

Respond in ${languageName}.

IMPORTANT: Use this exact format without any markdown formatting or extra symbols:

Subject: [subject line]
Body: [email body]

Do not use ** or * or --- or any other formatting symbols. Just plain text.`;
    
    // Call AI API
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-email-generator'
    });
    
    // Parse response
    const emails = parseEmailResponse(response);
    
    return {
      emails,
      tone,
      type,
      length,
      wordCount,
      timestamp: Date.now()
    };
  } catch (error) {
    handleError(error, 'generateEmail');
    throw error;
  }
}

// Parse AI response to extract email
function parseEmailResponse(response) {
  try {
    // Clean up the response first
    let cleanResponse = response.trim();
    
    // Remove markdown formatting if present
    cleanResponse = cleanResponse.replace(/\*\*/g, '');
    cleanResponse = cleanResponse.replace(/\*/g, '');
    
    // Extract subject and body with more flexible regex
    const subjectMatch = cleanResponse.match(/Subject:\s*(.+?)(?=\n\s*Body:|$)/is);
    const bodyMatch = cleanResponse.match(/Body:\s*(.+?)$/is);
    
    if (subjectMatch && bodyMatch) {
      let subject = subjectMatch[1].trim();
      let body = bodyMatch[1].trim();
      
      // Clean up subject (remove extra formatting)
      subject = subject.replace(/^\*\*|\*\*$/g, '').trim();
      
      // Clean up body (remove extra formatting and separators)
      body = body.replace(/^---\s*\n?/gm, '').trim();
      body = body.replace(/^\*\*\s*\n?/gm, '').trim();
      body = body.replace(/\n\s*\*\*\s*\n?/g, '\n').trim();
      
      // Remove trailing separators
      body = body.replace(/\n\s*---\s*$/g, '').trim();
      
      return [{
        subject: subject,
        body: body,
        isMain: true,
        alternative: null
      }];
    }
    
    // If parsing failed, try simpler approach
    const lines = cleanResponse.split('\n');
    let currentEmail = { subject: '', body: '', isMain: true, alternative: null };
    let inBody = false;
    let bodyLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.toLowerCase().includes('subject:')) {
        currentEmail.subject = line.replace(/subject:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
      } else if (line.toLowerCase().includes('body:')) {
        inBody = true;
        const bodyStart = line.replace(/body:\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
        if (bodyStart) {
          bodyLines.push(bodyStart);
        }
      } else if (inBody && line) {
        // Skip separator lines
        if (!line.match(/^---\s*$/) && !line.match(/^\*\*\s*$/)) {
          bodyLines.push(line);
        }
      }
    }
    
    currentEmail.body = bodyLines.join('\n').trim();
    
    if (currentEmail.subject && currentEmail.body) {
      return [currentEmail];
    }
    
    // If still no email, create a fallback
    const fallbackSubject = 'Email Subject';
    const fallbackBody = cleanResponse.substring(0, 500);
    
    return [{
      subject: fallbackSubject,
      body: fallbackBody,
      isMain: true,
      alternative: null
    }];
    
  } catch (error) {
    handleError(error, 'parseEmailResponse');
    return [{
      subject: 'Email Subject',
      body: response.substring(0, 500),
      isMain: true,
      alternative: null
    }];
  }
}

// Save to history
async function saveToHistory(emails, context, tone, type, length) {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const history = result[STORAGE_KEY] || [];
    
    const entry = {
      emails,
      contextPreview: context.substring(0, 200),
      tone,
      type,
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

// Create floating widget (Dark gray like AI Summarizer)
function createFloatingWidget() {
  const widget = document.createElement('div');
  widget.id = 'toolary-ai-email-generator-widget';
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
  
  const icon = createIconElement('email', { size: 24, decorative: true });
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
  backdrop.id = 'toolary-ai-email-generator-backdrop';
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
  if (!document.querySelector('#toolary-ai-email-generator-animations')) {
    const style = document.createElement('style');
    style.id = 'toolary-ai-email-generator-animations';
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

// Create sidebar panel
function createSidebar() {
  const panel = document.createElement('div');
  panel.id = 'toolary-ai-email-generator-panel';
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
  
  const titleIcon = createIconElement('email', { size: 18, decorative: true });
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(t('aiEmailGeneratorTitle', 'AI Email Generator')));
  
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
  content.id = 'toolary-ai-email-generator-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  `;
  
  // Mode selector (tabs)
  const modeSelector = document.createElement('div');
  modeSelector.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
  `;
  
  const modes = [
    { id: 'input', label: t('enterContext', 'Enter Context'), icon: 'text' },
    { id: 'page', label: t('pageContextMode', 'Page Context'), icon: 'book-open' }
  ];
  
  modes.forEach(mode => {
    const btn = createModeButton(mode.id, mode.label, mode.icon);
    modeSelector.appendChild(btn);
  });
  
  content.appendChild(modeSelector);
  
  // Configuration section
  const configSection = document.createElement('div');
  configSection.style.cssText = `
    background: var(--toolary-header-bg, #f8f9fa);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    padding: 14px;
    margin-bottom: 16px;
  `;
  
  // Email Type
  const typeGroup = document.createElement('div');
  typeGroup.style.cssText = `margin-bottom: 12px;`;
  
  const typeLabel = document.createElement('label');
  typeLabel.textContent = t('emailType', 'Email Type');
  typeLabel.style.cssText = `
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    margin-bottom: 6px;
  `;
  
  const typeSelect = document.createElement('select');
  typeSelect.id = 'toolary-email-type';
  typeSelect.style.cssText = `
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    font-size: 13px;
    cursor: pointer;
  `;
  
  EMAIL_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = t(type.label, type.id);
    if (type.id === currentType) option.selected = true;
    typeSelect.appendChild(option);
  });
  
  const typeCleanup = addEventListenerWithCleanup(typeSelect, 'change', () => {
    currentType = typeSelect.value;
  });
  cleanupFunctions.push(typeCleanup);
  
  typeGroup.appendChild(typeLabel);
  typeGroup.appendChild(typeSelect);
  
  // Tone
  const toneGroup = document.createElement('div');
  toneGroup.style.cssText = `margin-bottom: 12px;`;
  
  const toneLabel = document.createElement('label');
  toneLabel.textContent = t('emailTone', 'Email Tone');
  toneLabel.style.cssText = `
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    margin-bottom: 6px;
  `;
  
  const toneSelect = document.createElement('select');
  toneSelect.id = 'toolary-email-tone';
  toneSelect.style.cssText = `
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    font-size: 13px;
    cursor: pointer;
  `;
  
  EMAIL_TONES.forEach(tone => {
    const option = document.createElement('option');
    option.value = tone.id;
    option.textContent = t(tone.label, tone.id);
    if (tone.id === currentTone) option.selected = true;
    toneSelect.appendChild(option);
  });
  
  const toneCleanup = addEventListenerWithCleanup(toneSelect, 'change', () => {
    currentTone = toneSelect.value;
  });
  cleanupFunctions.push(toneCleanup);
  
  toneGroup.appendChild(toneLabel);
  toneGroup.appendChild(toneSelect);
  
  // Length
  const lengthGroup = document.createElement('div');
  
  const lengthLabel = document.createElement('label');
  lengthLabel.textContent = t('emailLength', 'Email Length');
  lengthLabel.style.cssText = `
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    margin-bottom: 6px;
  `;
  
  const lengthSelect = document.createElement('select');
  lengthSelect.id = 'toolary-email-length';
  lengthSelect.style.cssText = `
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    font-size: 13px;
    cursor: pointer;
  `;
  
  EMAIL_LENGTHS.forEach(length => {
    const option = document.createElement('option');
    option.value = length.id;
    option.textContent = t(length.label, length.id);
    if (length.id === currentLength) option.selected = true;
    lengthSelect.appendChild(option);
  });
  
  const lengthCleanup = addEventListenerWithCleanup(lengthSelect, 'change', () => {
    currentLength = lengthSelect.value;
  });
  cleanupFunctions.push(lengthCleanup);
  
  lengthGroup.appendChild(lengthLabel);
  lengthGroup.appendChild(lengthSelect);
  
  configSection.appendChild(typeGroup);
  configSection.appendChild(toneGroup);
  configSection.appendChild(lengthGroup);
  content.appendChild(configSection);
  
  // Input section (for manual mode)
  const inputSection = document.createElement('div');
  inputSection.id = 'toolary-input-section';
  inputSection.style.cssText = `
    display: ${currentMode === 'input' ? 'block' : 'none'};
    margin-bottom: 16px;
  `;
  
  const inputLabel = document.createElement('label');
  inputLabel.textContent = t('enterEmailContext', 'Enter email context');
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
    width: calc(100% - 20px);
    padding: 8px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
  `;
  
  inputSection.appendChild(inputLabel);
  inputSection.appendChild(inputTextarea);
  content.appendChild(inputSection);
  
  // Generate button
  const generateBtn = document.createElement('button');
  generateBtn.id = 'toolary-generate-email-btn';
  generateBtn.style.cssText = `
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
  
  const generateIcon = createIconElement('email', { size: 16, decorative: true });
  generateBtn.appendChild(generateIcon);
  generateBtn.appendChild(document.createTextNode(t('generateEmail', 'Generate Email')));
  
  const generateCleanup = addEventListenerWithCleanup(generateBtn, 'click', handleGenerateEmail);
  cleanupFunctions.push(generateCleanup);
  
  content.appendChild(generateBtn);
  
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
  loadingText.textContent = t('generatingEmail', 'Generating email...');
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
  });
  
  cleanupFunctions.push(cleanup);
  
  return btn;
}

// Update mode UI
function updateModeUI() {
  // Update mode buttons
  const modes = ['input', 'page'];
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

// Handle generate email button click
async function handleGenerateEmail() {
  if (isGenerating) return;
  
  try {
    isGenerating = true;
    
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    const resultsSection = document.getElementById('toolary-ai-results');
    const generateBtn = document.getElementById('toolary-generate-email-btn');
    
    // Disable button and show loading
    if (generateBtn) generateBtn.disabled = true;
    
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }
    
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
    
    // Get context based on mode
    let context;
    if (currentMode === 'input') {
      const inputTextarea = document.getElementById('toolary-input-text');
      context = inputTextarea ? inputTextarea.value.trim() : '';
      if (!context) {
        throw new Error(t('pleaseEnterEmailContext', 'Please enter email context'));
      }
    } else {
      const content = extractPageContent();
      if (!content) {
        throw new Error(t('noContentToGenerateEmail', 'No content found to generate email'));
      }
      context = content;
    }
    
    // Limit context length (max 3000 characters)
    if (context.length > 3000) {
      context = context.substring(0, 3000) + '...';
    }
    
    // Generate email
    const result = await generateEmail(context, currentTone, currentType, currentLength);
    
    // Store result
    // currentEmail = result; // Will be used for future features
    
    // Display result
    renderEmailResult(result.emails);
    
    // Save to history
    await saveToHistory(result.emails, context, currentTone, currentType, currentLength);
    
    // Show success message
    showSuccess(t('emailGenerated', 'Email generated successfully!'));
    
    // Show coffee message
    showCoffeeMessageForTool('ai-email-generator');
    
  } catch (error) {
    handleError(error, 'handleGenerateEmail');
    const message = error.message || t('failedToGenerateEmail', 'Failed to generate email');
    showError(message);
    
    // Hide loading
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  } finally {
    isGenerating = false;
    const generateBtn = document.getElementById('toolary-generate-email-btn');
    if (generateBtn) generateBtn.disabled = false;
  }
}

// Render email result
function renderEmailResult(emails) {
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
  
  // Main email (only one email now)
  const mainEmail = emails[0];
  if (mainEmail) {
    const emailCard = createEmailCard(mainEmail);
    resultsSection.appendChild(emailCard);
  }
  
  resultsSection.style.display = 'block';
}

// Create email card
function createEmailCard(email) {
  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 12px;
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  `;
  
  const title = document.createElement('h4');
  title.textContent = t('generatedEmail', 'Generated Email');
  title.style.cssText = `
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--toolary-text, #333);
  `;
  
  const copyBtn = document.createElement('button');
  copyBtn.textContent = t('copyEmail', 'Copy Email');
  copyBtn.style.cssText = `
    padding: 6px 12px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  const copyCleanup = addEventListenerWithCleanup(copyBtn, 'click', () => handleCopyEmail(email));
  cleanupFunctions.push(copyCleanup);
  
  header.appendChild(title);
  header.appendChild(copyBtn);
  
  // Subject line
  const subjectSection = document.createElement('div');
  subjectSection.style.cssText = `margin-bottom: 12px;`;
  
  const subjectLabel = document.createElement('div');
  subjectLabel.textContent = t('subjectLine', 'Subject Line');
  subjectLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 6px;
  `;
  
  const subjectText = document.createElement('div');
  subjectText.textContent = email.subject;
  subjectText.style.cssText = `
    font-size: 14px;
    font-weight: 500;
    color: var(--toolary-text, #333);
    padding: 8px;
    background: var(--toolary-header-bg, #f8f9fa);
    border-radius: 4px;
    border-left: 3px solid var(--toolary-primary-color, #007bff);
  `;
  
  subjectSection.appendChild(subjectLabel);
  subjectSection.appendChild(subjectText);
  
  // Email body
  const bodySection = document.createElement('div');
  
  const bodyLabel = document.createElement('div');
  bodyLabel.textContent = t('emailBody', 'Email Body');
  bodyLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 6px;
  `;
  
  const bodyText = document.createElement('div');
  bodyText.textContent = email.body;
  bodyText.style.cssText = `
    font-size: 13px;
    line-height: 1.6;
    color: var(--toolary-text, #333);
    padding: 12px;
    background: var(--toolary-header-bg, #f8f9fa);
    border-radius: 4px;
    white-space: pre-wrap;
    max-height: 300px;
    overflow-y: auto;
    /* Fix scrollbar background color */
    scrollbar-width: thin;
    scrollbar-color: var(--toolary-border, #ddd) transparent;
  `;
  
  // Add webkit scrollbar styles for better appearance
  const scrollbarStyle = document.createElement('style');
  scrollbarStyle.textContent = `
    #toolary-ai-email-generator-panel ::-webkit-scrollbar {
      width: 8px;
    }
    #toolary-ai-email-generator-panel ::-webkit-scrollbar-track {
      background: var(--toolary-header-bg, #f8f9fa);
      border-radius: 4px;
    }
    #toolary-ai-email-generator-panel ::-webkit-scrollbar-thumb {
      background: var(--toolary-border, #ddd);
      border-radius: 4px;
    }
    #toolary-ai-email-generator-panel ::-webkit-scrollbar-thumb:hover {
      background: var(--toolary-secondary-text, #666);
    }
  `;
  
  // Only add the style once
  if (!document.querySelector('#toolary-email-scrollbar-style')) {
    scrollbarStyle.id = 'toolary-email-scrollbar-style';
    document.head.appendChild(scrollbarStyle);
  }
  
  bodySection.appendChild(bodyLabel);
  bodySection.appendChild(bodyText);
  
  // Assemble card
  card.appendChild(header);
  card.appendChild(subjectSection);
  card.appendChild(bodySection);
  
  return card;
}

// Handle copy email
function handleCopyEmail(email) {
  try {
    const emailText = `Subject: ${email.subject}\n\n${email.body}`;
    copyText(emailText);
    
    showSuccess(t('emailCopied', 'Email copied to clipboard!'));
  } catch (error) {
    handleError(error, 'handleCopyEmail');
    showError(t('failedToCopyEmail', 'Failed to copy email'));
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
    
    const message = t('emailGeneratorActivated', 'AI Email Generator activated');
    showInfo(message);
    
  } catch (error) {
    handleError(error, 'emailGenerator.activate');
    const message = t('failedToActivateEmailGenerator', 'Failed to activate email generator');
    showError(message);
    deactivate();
  }
}

// Deactivation
export function deactivate() {
  try {
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
    currentMode = 'input';
    isGenerating = false;
    // currentEmail = null; // Will be used for future features
    currentTone = 'professional';
    currentType = 'follow-up';
    currentLength = 'medium';
    isActive = false;
    langMap = {};
    
  } catch (error) {
    handleError(error, 'emailGenerator.deactivate');
  }
}
