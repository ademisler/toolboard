import { 
  showError, 
  handleError, 
  addEventListenerWithCleanup
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'ai-chat',
  name: 'AI Chat',
  category: 'ai',
  icon: 'message',
  permissions: ['activeTab', 'storage'],
  tags: ['ai', 'chat', 'assistant', 'conversation'],
  keywords: ['chat', 'ai', 'assistant', 'help', 'question']
};

// Storage key (for future use)
// const STORAGE_KEY = 'toolaryAIChatHistory';
// const MAX_HISTORY = 10;

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

const MAX_PAGE_CONTEXT_CHARS = 16000;

// State
let cleanupFunctions = [];
let floatingWidget = null;
let sidebar = null;
let backdrop = null;
let backdropClickArea = null;
let isPanelOpen = false;
let messages = []; // Array of {role: 'user'|'assistant', content: string, timestamp: number}
let pageContext = null; // Cached page context snapshot
let isAnalyzing = false; // Background analysis state
let isChatting = false; // User message processing state
let messagesContainer = null;
let inputTextarea = null;
let sendButton = null;

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
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return 0;
  
  let score = 0;
  const textLength = node.textContent.trim().length;
  
  // Penalize navigation keywords
  const hasNavKeywords = NAV_KEYWORDS.some(keyword => 
    (node.className || '').toLowerCase().includes(keyword) ||
    (node.id || '').toLowerCase().includes(keyword)
  );
  
  if (hasNavKeywords) {
    score -= 100;
  }
  
  // Calculate link density
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
    
    const candidates = document.querySelectorAll('div, section, article, main, p');
    
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
    
    // Fallback: collect all text content from page
    const allTextElements = document.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th');
    let allText = '';
    
    for (const element of allTextElements) {
      const text = element.textContent.trim();
      if (text.length > 10) { // Only include meaningful text
        const hasNavKeywords = NAV_KEYWORDS.some(keyword => 
          (element.className || '').toLowerCase().includes(keyword) ||
          (element.id || '').toLowerCase().includes(keyword)
        );
        
        if (!hasNavKeywords) {
          allText += text + ' ';
        }
      }
    }
    
    const trimmed = allText.trim();
    if (trimmed) {
      return trimmed;
    }

    const bodyText = document.body?.innerText;
    if (bodyText && bodyText.trim().length > 0) {
      return bodyText.trim();
    }

    return null;
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
    return content.textContent.trim();
  }
}

// Ensure the assistant greets the user once per activation
function ensureWelcomeMessage() {
  const hasWelcome = messages.some(message => message.type === 'welcome');
  if (hasWelcome) return false;

  messages.push({
    role: 'assistant',
    content: t('chatWelcome', 'Hi! I\'m ready to help. Ask me anything!'),
    timestamp: Date.now(),
    type: 'welcome'
  });

  return true;
}

function sanitizePageText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function updatePageContextSnapshot(rawContent) {
  const sanitized = sanitizePageText(rawContent);
  if (!sanitized) {
    pageContext = null;
    return false;
  }

  const snapshot = {
    title: sanitizePageText(document.title || ''),
    url: (window.location && window.location.href) ? window.location.href : '',
    contentLength: sanitized.length,
    truncated: sanitized.length > MAX_PAGE_CONTEXT_CHARS,
    content: sanitized.slice(0, MAX_PAGE_CONTEXT_CHARS),
    updatedAt: Date.now()
  };

  if (pageContext && pageContext.createdAt) {
    snapshot.createdAt = pageContext.createdAt;
  } else {
    snapshot.createdAt = snapshot.updatedAt;
  }

  pageContext = snapshot;
  return true;
}

function getPageContextSnapshot() {
  if (!pageContext) return null;
  return { ...pageContext };
}

// Analyze page content in background
async function analyzePageContent() {
  if (isAnalyzing) return;
  
  isAnalyzing = true;
  updateAnalyzingIndicator();
  
  try {
    const content = extractPageContent();
    if (!content) {
      console.debug('No content extracted from page');
      pageContext = null;
      ensureWelcomeMessage();
      updateChatUI();
      scrollToBottom();
      isAnalyzing = false;
      updateAnalyzingIndicator();
      return;
    }
    
    const hasContext = updatePageContextSnapshot(content);
    if (!hasContext) {
      console.debug('Extracted content was empty after sanitization');
      pageContext = null;
    }
    
    ensureWelcomeMessage();
    updateChatUI();
    scrollToBottom();
    
  } catch (error) {
    handleError(error, 'analyzePageContent');
    console.debug('Page analysis failed, chat will work without context');
    
    pageContext = null;
    
    ensureWelcomeMessage();
    updateChatUI();
    scrollToBottom();
  } finally {
    isAnalyzing = false;
    updateAnalyzingIndicator();
  }
}

// Build a prompt conversation history without truncating earlier context unnecessarily
function getConversationHistoryForPrompt(maxCharacters = 20000) {
  const relevant = [];
  let remaining = maxCharacters;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    if (message.type === 'welcome') {
      continue;
    }

    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }

    const serialized = `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}\n`;

    if (serialized.length > maxCharacters && relevant.length === 0) {
      relevant.push(message);
      break;
    }

    if (remaining - serialized.length < 0) {
      break;
    }

    relevant.push(message);
    remaining -= serialized.length;
  }

  return relevant.reverse();
}

// Build prompt for AI
function buildPrompt(conversationHistory, contextSnapshot) {
  const userLanguage = langMap.__current || 'en';
  
  let prompt = `You are a helpful AI assistant integrated into a Chrome extension called Toolboard. The user is currently viewing a webpage and may ask about it.

Respond in the user's language: ${userLanguage}
Keep responses concise and helpful (max 200 words unless asked for details).

`;

  if (contextSnapshot?.content) {
    prompt += `PAGE DETAILS:
- Title: ${contextSnapshot.title || 'Not available'}
- URL: ${contextSnapshot.url || 'Not available'}
- Content length: ${contextSnapshot.contentLength} characters${contextSnapshot.truncated ? ' (truncated to fit tool limits)' : ''}

FULL PAGE CONTEXT (authoritative copy of the current page — rely on this instead of asking the user):
"""
${contextSnapshot.content}
"""

Instructions:
- You already have the page content above. Never say you cannot see the page, and do not ask the user to send it.
- When the user asks about the page, extract the answer from the provided context. If the information is missing, state that the supplied page context does not include it.
- Keep track of the conversation history and stay consistent with earlier answers.

`;
  } else {
    prompt += `PAGE CONTEXT: Not available. If the user asks about the page, let them know that no readable content could be extracted yet.

`;
  }

  prompt += `Conversation History:
`;
  
  conversationHistory.forEach(msg => {
    prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
  });
  
  prompt += `\nUser Message:
Please respond to the user's latest message. If it's about the page content, use the page context provided above.

Response:`;
  
  return prompt;
}

// Send message to AI
async function sendMessage(userMessage) {
  if (!userMessage.trim() || isChatting) return;
  
  isChatting = true;
  updateSendButton();
  
  try {
    // Add user message
    messages.push({ 
      role: 'user', 
      content: userMessage.trim(), 
      timestamp: Date.now() 
    });
    
    updateChatUI();
    scrollToBottom();
    
    // Clear input
    inputTextarea.value = '';
    updateSendButton();
    
    // Always extract fresh page context for every message
    try {
      const content = extractPageContent();
      if (content) {
        const hasContext = updatePageContextSnapshot(content);
        if (!hasContext) {
          console.debug('Fresh page extraction resulted in empty content snapshot');
        }
      }
    } catch (error) {
      console.debug('Failed to extract page content:', error);
    }
    
    // Prepare conversation history with generous retention to avoid losing context
    const conversationHistory = getConversationHistoryForPrompt();
    
    const ai = await loadAIManager();
    const prompt = buildPrompt(conversationHistory, getPageContextSnapshot());
    
    const response = await ai.callGeminiAPI(prompt, {
      toolId: 'ai-chat',
      userModelPreference: 'auto'
    });
    
    // Add AI response
    messages.push({
      role: 'assistant',
      content: response.trim(),
      timestamp: Date.now()
    });
    
    updateChatUI();
    scrollToBottom();
    
  } catch (error) {
    handleError(error, 'sendMessage');
    
    // Add error message
    messages.push({
      role: 'assistant',
      content: t('errorMessage', 'Sorry, I encountered an error. Please try again.'),
      timestamp: Date.now()
    });
    
    updateChatUI();
    scrollToBottom();
    showError(t('sendError', 'Failed to send message'));
    
  } finally {
    isChatting = false;
    updateSendButton();
  }
}

// Create floating widget
function createFloatingWidget() {
  const widget = document.createElement('div');
  widget.id = 'toolary-ai-chat-widget';
  widget.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    background: var(--toolary-primary, #FFDE00);
    border-radius: 50%;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    cursor: pointer;
    z-index: 2147483645;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: toolary-fade-in 0.3s ease-out;
  `;
  
  const icon = createIconElement('message', { size: 28, decorative: true });
  icon.style.color = '#1f2937';
  widget.appendChild(icon);
  
  const cleanupClick = addEventListenerWithCleanup(widget, 'click', () => {
    togglePanel();
  });
  cleanupFunctions.push(cleanupClick);
  
  const cleanupHover = addEventListenerWithCleanup(widget, 'mouseenter', () => {
    widget.style.transform = 'scale(1.1)';
    widget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
  });
  cleanupFunctions.push(cleanupHover);
  
  const cleanupLeave = addEventListenerWithCleanup(widget, 'mouseleave', () => {
    widget.style.transform = 'scale(1)';
    widget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
  });
  cleanupFunctions.push(cleanupLeave);
  
  return widget;
}

// Create sidebar panel
function createSidebar() {
  const panel = document.createElement('div');
  panel.id = 'toolary-ai-chat-sidebar';
  panel.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: var(--toolary-bg, #f8f9fa);
    border-left: 1px solid var(--toolary-border, #d1d5db);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    animation: toolary-slide-in-right 0.3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--toolary-border, #d1d5db);
    background: var(--toolary-bg, #f8f9fa);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  `;
  
  const titleContainer = document.createElement('div');
  titleContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  const icon = createIconElement('message', { size: 20, decorative: true });
  icon.style.color = 'var(--toolary-text, #1f2937)';
  titleContainer.appendChild(icon);
  
  const title = document.createElement('span');
  title.textContent = t('aiChat', 'AI Chat');
  title.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: var(--toolary-text, #1f2937);
  `;
  titleContainer.appendChild(title);
  
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    color: var(--toolary-text-secondary, #6b7280);
    transition: background 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  const closeIcon = createIconElement('close', { size: 18, decorative: true });
  closeBtn.appendChild(closeIcon);
  
  const cleanupClose = addEventListenerWithCleanup(closeBtn, 'click', () => {
    hidePanel();
  });
  cleanupFunctions.push(cleanupClose);
  
  const cleanupCloseHover = addEventListenerWithCleanup(closeBtn, 'mouseenter', () => {
    closeBtn.style.background = 'rgba(0,0,0,0.08)';
  });
  cleanupFunctions.push(cleanupCloseHover);
  
  const cleanupCloseLeave = addEventListenerWithCleanup(closeBtn, 'mouseleave', () => {
    closeBtn.style.background = 'transparent';
  });
  cleanupFunctions.push(cleanupCloseLeave);
  
  header.appendChild(titleContainer);
  header.appendChild(closeBtn);
  
  // Analyzing indicator
  const analyzingIndicator = document.createElement('div');
  analyzingIndicator.id = 'analyzing-indicator';
  analyzingIndicator.style.cssText = `
    padding: 12px 20px;
    background: var(--toolary-warning-color, #ffc107);
    color: #1f2937;
    font-size: 14px;
    display: none;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  `;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 16px;
    height: 16px;
    border: 2px solid rgba(31, 41, 55, 0.3);
    border-top: 2px solid #1f2937;
    border-radius: 50%;
    animation: toolary-spin 1s linear infinite;
  `;
  
  const analyzingText = document.createElement('span');
  analyzingText.textContent = t('analyzing', 'Analyzing page...');
  
  analyzingIndicator.appendChild(spinner);
  analyzingIndicator.appendChild(analyzingText);
  
  // Messages container
  messagesContainer = document.createElement('div');
  messagesContainer.id = 'messages-container';
  messagesContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  
  // Input area
  const inputArea = document.createElement('div');
  inputArea.style.cssText = `
    padding: 16px 20px;
    border-top: 1px solid var(--toolary-border, #d1d5db);
    background: var(--toolary-bg, #f8f9fa);
    flex-shrink: 0;
  `;
  
  const inputContainer = document.createElement('div');
  inputContainer.style.cssText = `
    display: flex;
    gap: 10px;
    align-items: stretch;
    min-height: 48px;
  `;
  
  inputTextarea = document.createElement('textarea');
  inputTextarea.style.cssText = `
    flex: 1;
    min-height: 48px;
    max-height: 96px;
    padding: 14px 16px;
    border: 1px solid var(--toolary-border, #d1d5db);
    border-radius: var(--toolary-border-radius-small, 8px);
    background: var(--toolary-button-bg, #ffffff);
    color: var(--toolary-text, #1f2937);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.4;
    resize: none;
    outline: none;
    transition: border-color 0.2s ease;
  `;
  
  inputTextarea.placeholder = t('typeMessage', 'Type your message...');
  inputTextarea.maxLength = 500;
  
  sendButton = document.createElement('button');
  sendButton.style.cssText = `
    width: 48px;
    height: 48px;
    background: var(--toolary-primary, #FFDE00);
    border: none;
    border-radius: var(--toolary-border-radius-small, 8px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  `;
  
  const sendIcon = createIconElement('play', { size: 16, decorative: true });
  sendIcon.style.color = '#1f2937';
  sendIcon.style.transform = 'rotate(90deg)';
  sendButton.appendChild(sendIcon);
  
  // Event listeners for input
  const cleanupInputKeydown = addEventListenerWithCleanup(inputTextarea, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = inputTextarea.value.trim();
      if (message) {
        sendMessage(message);
      }
    }
  });
  cleanupFunctions.push(cleanupInputKeydown);
  
  const cleanupInputInput = addEventListenerWithCleanup(inputTextarea, 'input', () => {
    updateSendButton();
    autoResizeTextarea();
  });
  cleanupFunctions.push(cleanupInputInput);
  
  const cleanupSendClick = addEventListenerWithCleanup(sendButton, 'click', () => {
    const message = inputTextarea.value.trim();
    if (message) {
      sendMessage(message);
    }
  });
  cleanupFunctions.push(cleanupSendClick);
  
  const cleanupSendHover = addEventListenerWithCleanup(sendButton, 'mouseenter', () => {
    if (!isChatting && inputTextarea.value.trim()) {
      sendButton.style.transform = 'scale(1.05)';
      sendButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    }
  });
  cleanupFunctions.push(cleanupSendHover);
  
  const cleanupSendLeave = addEventListenerWithCleanup(sendButton, 'mouseleave', () => {
    sendButton.style.transform = 'scale(1)';
    sendButton.style.boxShadow = 'none';
  });
  cleanupFunctions.push(cleanupSendLeave);
  
  inputContainer.appendChild(inputTextarea);
  inputContainer.appendChild(sendButton);
  inputArea.appendChild(inputContainer);
  
  panel.appendChild(header);
  panel.appendChild(analyzingIndicator);
  panel.appendChild(messagesContainer);
  panel.appendChild(inputArea);
  
  return panel;
}

// Auto-resize textarea
function autoResizeTextarea() {
  if (!inputTextarea) return;
  
  inputTextarea.style.height = '48px'; // Reset to minimum height (same as button)
  const scrollHeight = inputTextarea.scrollHeight;
  const maxHeight = 96; // 4 lines max (24px per line)
  
  inputTextarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
}

// Update send button state
function updateSendButton() {
  if (!sendButton || !inputTextarea) return;
  
  const hasText = inputTextarea.value.trim().length > 0;
  const canSend = hasText && !isChatting;
  
  sendButton.disabled = !canSend;
  sendButton.style.opacity = canSend ? '1' : '0.5';
  sendButton.style.cursor = canSend ? 'pointer' : 'not-allowed';
}

// Update analyzing indicator
function updateAnalyzingIndicator() {
  const indicator = document.getElementById('analyzing-indicator');
  if (!indicator) return;
  
  indicator.style.display = isAnalyzing ? 'flex' : 'none';
}

// Create message bubble
function createMessageBubble(message) {
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    max-width: ${message.role === 'user' ? '75%' : '80%'};
    align-self: ${message.role === 'user' ? 'flex-end' : 'flex-start'};
    animation: toolary-fade-in 0.2s ease-out;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 12px 16px;
    border-radius: ${message.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};
    font-size: 14px;
    line-height: 1.6;
    word-wrap: break-word;
    white-space: pre-wrap;
    ${message.role === 'user' ? 
      'background: #FFDE00; color: #1f2937; box-shadow: 0 2px 4px rgba(0,0,0,0.1);' :
      'background: var(--toolary-button-bg, #ffffff); color: var(--toolary-text, #1f2937); border: 1px solid var(--toolary-border, #d1d5db);'
    }
  `;
  
  // Format AI messages with better styling
  if (message.role === 'assistant') {
    content.innerHTML = formatAIMessage(message.content);
  } else {
    content.textContent = message.content;
  }
  
  bubble.appendChild(content);
  
  return bubble;
}

// Format AI message with better styling
function formatAIMessage(text) {
  if (!text) return '';
  
  // Escape HTML first
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Convert markdown-style formatting
  formatted = formatted
    // Bold text **text** or __text__
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic text *text* or _text_
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // Code `code`
    .replace(/`(.*?)`/g, '<code style="background: rgba(0,0,0,0.1); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>')
    // Bullet points
    .replace(/^\* (.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px;">$1</li>')
    .replace(/^- (.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px;">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin: 4px 0; padding-left: 8px;">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br>');
  
  // Wrap lists in ul tags
  if (formatted.includes('<li')) {
    formatted = formatted.replace(/(<li[^>]*>.*<\/li>)/gs, '<ul style="margin: 8px 0; padding-left: 16px;">$1</ul>');
  }
  
  return formatted;
}

// Create loading indicator
function createLoadingIndicator() {
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    max-width: 80%;
    align-self: flex-start;
    animation: toolary-fade-in 0.2s ease-out;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 12px 16px;
    border-radius: 12px 12px 12px 4px;
    background: var(--toolary-button-bg, #ffffff);
    color: var(--toolary-text, #1f2937);
    border: 1px solid var(--toolary-border, #d1d5db);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const dots = document.createElement('div');
  dots.style.cssText = `
    display: flex;
    gap: 4px;
  `;
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `
      width: 6px;
      height: 6px;
      background: var(--toolary-text-secondary, #6b7280);
      border-radius: 50%;
      animation: toolary-pulse-dots 0.6s ease-in-out infinite;
      animation-delay: ${i * 0.2}s;
    `;
    dots.appendChild(dot);
  }
  
  content.appendChild(dots);
  bubble.appendChild(content);
  
  return bubble;
}

// Update chat UI
function updateChatUI() {
  if (!messagesContainer) return;
  
  messagesContainer.innerHTML = '';
  
  messages.forEach(message => {
    const bubble = createMessageBubble(message);
    messagesContainer.appendChild(bubble);
  });
  
  // Add loading indicator only when AI is actually responding
  // Double check to ensure we only show loading when truly chatting
  if (isChatting && messages.length > 0 && messages[messages.length - 1].role === 'user') {
    const loadingBubble = createLoadingIndicator();
    messagesContainer.appendChild(loadingBubble);
  }
}

// Scroll to bottom
function scrollToBottom() {
  if (!messagesContainer) return;
  
  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 100);
}

// Show sidebar panel
function showPanel() {
  if (isPanelOpen) return;
  
  isPanelOpen = true;
  
  // Create backdrop
  backdrop = document.createElement('div');
  backdrop.id = 'toolary-ai-chat-backdrop';
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
  if (!document.querySelector('#toolary-ai-chat-animations')) {
    const style = document.createElement('style');
    style.id = 'toolary-ai-chat-animations';
    style.textContent = `
      @keyframes toolary-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes toolary-slide-in-right {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
      @keyframes toolary-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes toolary-pulse-dots {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(backdropClickArea);
  document.body.appendChild(backdrop);
  document.body.appendChild(sidebar);
  
  // Focus input
  setTimeout(() => {
    if (inputTextarea) {
      inputTextarea.focus();
    }
  }, 300);
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
  messagesContainer = null;
  inputTextarea = null;
  sendButton = null;
}

// Toggle panel
function togglePanel() {
  if (isPanelOpen) {
    hidePanel();
  } else {
    showPanel();
  }
}

// Main activation function
export async function activate(deactivate) {
  try {
    console.log('AI Chat activated');
    
    // Load language and AI manager first
    await loadUserUILanguage();
    await loadAIManager();
    
    // Show coffee message
    showCoffeeMessageForTool('ai-chat');
    
    // Reset state
    messages = [];
    pageContext = null;
    isAnalyzing = false;
    isChatting = false;
    
    // Create floating widget
    floatingWidget = createFloatingWidget();
    document.body.appendChild(floatingWidget);
    
    // Open chat panel directly
    showPanel();
    
    // Analyze the active page to prime chat context and greetings
    await analyzePageContent();
    
  } catch (error) {
    handleError(error, 'ai-chat.activate');
    showError(t('activationError', 'Failed to activate AI Chat'));
    deactivate();
  }
}

// Deactivation function
export function deactivate() {
  console.log('AI Chat deactivated');
  
  // Clean up event listeners
  cleanupFunctions.forEach(cleanup => cleanup());
  cleanupFunctions = [];
  
  // Remove UI elements
  if (floatingWidget && floatingWidget.parentNode) {
    floatingWidget.parentNode.removeChild(floatingWidget);
  }
  
  hidePanel();
  
  // Reset state
  floatingWidget = null;
  sidebar = null;
  backdrop = null;
  backdropClickArea = null;
  messagesContainer = null;
  inputTextarea = null;
  sendButton = null;
  messages = [];
  pageContext = null;
  isAnalyzing = false;
  isChatting = false;
  aiManager = null;
}
