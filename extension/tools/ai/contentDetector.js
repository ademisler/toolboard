import { 
  showSuccess, 
  showError, 
  showInfo,
  showWarning,
  handleError, 
  sanitizeInput, 
  addEventListenerWithCleanup,
  copyText
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'ai-content-detector',
  name: 'AI Content Detector',
  category: 'ai',
  icon: 'sparkles',
  permissions: ['activeTab', 'storage'],
  tags: ['ai', 'detection', 'analysis', 'verification'],
  keywords: ['ai detection', 'ai generated', 'content analysis', 'verification', 'authenticity']
};

// Storage key
const STORAGE_KEY = 'toolaryAIContentDetectorHistory';
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

// State
let cleanupFunctions = [];
let floatingWidget = null;
let sidebar = null;
let backdrop = null;
let backdropClickArea = null;
let isPanelOpen = false;
let currentMode = 'input'; // 'input', 'selection', 'page'
let isAnalyzing = false;
let currentAnalysis = null;
let isSelectingText = false;
let selectedTextForAnalysis = null;
let highlightedElements = []; // Store highlighted elements for cleanup
let isHighlightVisible = false;

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

// Analyze content using AI with multiple metrics
async function analyzeContent(text) {
  try {
    if (!text || text.length < 50) {
      throw new Error('Text too short to analyze (minimum 50 characters)');
    }
    
    // Load AI manager
    const manager = await loadAIManager();
    
    // Limit text length (max 5000 characters)
    let textToAnalyze = text;
    if (text.length > 5000) {
      textToAnalyze = text.substring(0, 5000);
      showWarning(t('textTruncated', 'Text was truncated to 5000 characters for analysis'));
    }
    
    // Run multiple analyses
    updateAnalysisProgress(1, 4, 'writingStyle');
    const styleAnalysis = await analyzeWritingStyle(manager, textToAnalyze);
    
    await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
    
    updateAnalysisProgress(2, 4, 'wordChoice');
    const wordAnalysis = await analyzeWordChoice(manager, textToAnalyze);
    
    await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
    
    updateAnalysisProgress(3, 4, 'structureAnalysis');
    const structureAnalysis = await analyzeStructure(manager, textToAnalyze);
    
    await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
    
    updateAnalysisProgress(4, 4, 'suspiciousSections');
    const suspiciousSections = await detectSuspiciousSections(manager, textToAnalyze);
    
    // Calculate overall AI probability (average of metrics)
    const aiProbability = Math.round(
      (styleAnalysis.score + wordAnalysis.score + structureAnalysis.score) / 3
    );
    
    // Determine confidence level
    let confidence = 'low';
    const scores = [styleAnalysis.score, wordAnalysis.score, structureAnalysis.score];
    const variance = calculateVariance(scores);
    
    if (variance < 100) confidence = 'high';
    else if (variance < 300) confidence = 'medium';
    
    return {
      aiProbability,
      confidence,
      metrics: {
        writingStyle: styleAnalysis,
        wordChoice: wordAnalysis,
        structure: structureAnalysis
      },
      suspiciousSections,
      timestamp: Date.now()
    };
  } catch (error) {
    handleError(error, 'analyzeContent');
    throw error;
  }
}

// Calculate variance for confidence determination
function calculateVariance(scores) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squaredDiffs = scores.map(score => Math.pow(score - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
}

// Analyze writing style
async function analyzeWritingStyle(manager, text) {
  const prompt = `Analyze the writing style of this text for AI generation patterns:
- Consistency and variation in sentence structure
- Natural flow vs. formulaic patterns
- Human quirks and imperfections
- Transition naturalness

Provide a score from 0-100 where:
- 0-30: Very likely human-written (natural inconsistencies, varied style)
- 31-60: Mixed or uncertain (some AI patterns detected)
- 61-100: Very likely AI-generated (consistent patterns, formulaic structure)

Respond ONLY with valid JSON in this exact format:
{
  "score": <number 0-100>,
  "issues": ["issue1", "issue2"],
  "explanation": "brief explanation"
}

Text to analyze:
${text}`;

  try {
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-content-detector'
    });
    
    return parseAIResponse(response, 'writingStyle');
  } catch (error) {
    handleError(error, 'analyzeWritingStyle');
    return { score: 50, issues: ['Analysis failed'], explanation: 'Could not complete analysis' };
  }
}

// Analyze word choice
async function analyzeWordChoice(manager, text) {
  const prompt = `Analyze word choice patterns for AI generation indicators:
- Repetitive phrases or patterns
- Overly formal or perfect vocabulary
- Lack of colloquialisms or informal language
- Unnatural word combinations

Provide a score from 0-100 where:
- 0-30: Natural human word choice (varied, colloquial, imperfect)
- 31-60: Mixed patterns (some AI-like vocabulary)
- 61-100: AI-like word choice (repetitive, formal, perfect)

Respond ONLY with valid JSON in this exact format:
{
  "score": <number 0-100>,
  "issues": ["issue1", "issue2"],
  "explanation": "brief explanation"
}

Text to analyze:
${text}`;

  try {
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-content-detector'
    });
    
    return parseAIResponse(response, 'wordChoice');
  } catch (error) {
    handleError(error, 'analyzeWordChoice');
    return { score: 50, issues: ['Analysis failed'], explanation: 'Could not complete analysis' };
  }
}

// Analyze structure
async function analyzeStructure(manager, text) {
  const prompt = `Analyze text structure for AI generation patterns:
- Paragraph organization and flow
- Topic transitions
- Depth vs. breadth balance
- Logical coherence patterns

Provide a score from 0-100 where:
- 0-30: Natural human structure (varied flow, organic transitions)
- 31-60: Mixed structure (some formulaic patterns)
- 61-100: AI-like structure (perfect organization, predictable flow)

Respond ONLY with valid JSON in this exact format:
{
  "score": <number 0-100>,
  "issues": ["issue1", "issue2"],
  "explanation": "brief explanation"
}

Text to analyze:
${text}`;

  try {
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-content-detector'
    });
    
    return parseAIResponse(response, 'structure');
  } catch (error) {
    handleError(error, 'analyzeStructure');
    return { score: 50, issues: ['Analysis failed'], explanation: 'Could not complete analysis' };
  }
}

// Detect suspicious sections
async function detectSuspiciousSections(manager, text) {
  const prompt = `Identify up to 5 specific suspicious text segments that show strong AI generation patterns.
For each segment, provide the exact text (max 100 chars) and reason why it's suspicious.

Respond ONLY with valid JSON array in this exact format:
[
  {"text": "exact text snippet", "reason": "why suspicious"},
  {"text": "another snippet", "reason": "another reason"}
]

If no suspicious sections found, return empty array: []

Text to analyze:
${text}`;

  try {
    const response = await manager.callGeminiAPI(prompt, {
      toolId: 'ai-content-detector'
    });
    
    return parseSuspiciousSections(response);
  } catch (error) {
    handleError(error, 'detectSuspiciousSections');
    return [];
  }
}

// Parse AI response JSON
function parseAIResponse(response, type) {
  try {
    // Try to extract JSON from response
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Try to find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate structure
    if (typeof parsed.score !== 'number' || !Array.isArray(parsed.issues) || typeof parsed.explanation !== 'string') {
      throw new Error('Invalid JSON structure');
    }
    
    // Clamp score to 0-100
    parsed.score = Math.max(0, Math.min(100, parsed.score));
    
    return parsed;
  } catch (error) {
    handleError(error, `parseAIResponse-${type}`);
    console.warn(`Failed to parse AI response for ${type}:`, response);
    return {
      score: 50,
      issues: ['Could not parse AI response'],
      explanation: 'Analysis completed but response format was unexpected'
    };
  }
}

// Parse suspicious sections
function parseSuspiciousSections(response) {
  try {
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Try to find JSON array
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }
    
    // Validate and sanitize each section
    return parsed
      .filter(section => section.text && section.reason)
      .map(section => ({
        text: sanitizeInput(String(section.text).substring(0, 100)),
        reason: sanitizeInput(String(section.reason).substring(0, 200))
      }))
      .slice(0, 5); // Max 5 sections
      
  } catch (error) {
    handleError(error, 'parseSuspiciousSections');
    console.warn('Failed to parse suspicious sections:', response);
    return [];
  }
}

// Update analysis progress
function updateAnalysisProgress(current, total, stage) {
  const loadingIndicator = document.getElementById('toolary-ai-loading');
  if (loadingIndicator) {
    const loadingText = loadingIndicator.querySelector('div:last-child');
    if (loadingText) {
      const stageText = t(stage, stage);
      loadingText.textContent = `${t('analyzing', 'Analyzing...')} (${current}/${total}) - ${stageText}`;
    }
  }
}

// Save to history
async function saveToHistory(analysis, text, mode) {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const history = result[STORAGE_KEY] || [];
    
    const entry = {
      id: `analysis-${Date.now()}`,
      aiProbability: analysis.aiProbability,
      confidence: analysis.confidence,
      textPreview: text.substring(0, 200),
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
  widget.id = 'toolary-ai-detector-widget';
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
  
  const icon = createIconElement('sparkles', { size: 24, decorative: true });
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
  backdrop.id = 'toolary-ai-detector-backdrop';
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
  if (!document.querySelector('#toolary-ai-detector-animations')) {
    const style = document.createElement('style');
    style.id = 'toolary-ai-detector-animations';
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
  selectedTextForAnalysis = null;
  
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
  icon.textContent = '🔍';
  icon.style.fontSize = '20px';
  
  const text = document.createElement('span');
  text.textContent = t('selectTextToAnalyze', 'Select text on the page to analyze');
  
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
  
  selectedTextForAnalysis = selectedText;
  isSelectingText = false;
  
  // Remove overlay
  const overlay = document.getElementById('toolary-text-selection-overlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  
  // Show panel and automatically analyze
  currentMode = 'selection';
  showPanel();
  
  // Auto-analyze
  setTimeout(() => {
    handleAnalyze();
  }, 300);
}

// Cancel text selection
function cancelTextSelection() {
  isSelectingText = false;
  selectedTextForAnalysis = null;
  
  const overlay = document.getElementById('toolary-text-selection-overlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  
  showPanel();
}

// Highlight suspicious sections on page
function highlightSuspiciousSections(sections) {
  // Clear existing highlights
  clearHighlights();
  
  if (!sections || sections.length === 0) return;
  
  // Get all text nodes in the page
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT, // eslint-disable-line no-undef
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        }
        
        if (parent.closest('[id^="toolary-"]')) {
          return NodeFilter.FILTER_REJECT; // eslint-disable-line no-undef
        }
        
        return NodeFilter.FILTER_ACCEPT; // eslint-disable-line no-undef
      }
    }
  );
  
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }
  
  // Highlight each suspicious section
  sections.forEach(section => {
    const searchText = section.text.trim();
    if (!searchText) return;
    
    // Find text nodes containing this text
    for (const textNode of textNodes) {
      const nodeText = textNode.textContent;
      const index = nodeText.indexOf(searchText);
      
      if (index !== -1) {
        try {
          // Create highlight wrapper
          const highlight = document.createElement('span');
          highlight.className = 'toolary-ai-highlight';
          highlight.style.cssText = `
            background: rgba(255, 193, 7, 0.3);
            border-bottom: 2px solid #ff9800;
            cursor: help;
            position: relative;
          `;
          highlight.title = section.reason;
          highlight.setAttribute('data-reason', section.reason);
          
          // Split text node and wrap the matching part
          const range = document.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + searchText.length);
          range.surroundContents(highlight);
          
          highlightedElements.push(highlight);
          
          // Only highlight first occurrence
          break;
        } catch (error) {
          // Silently fail if we can't highlight this particular text
          console.debug('Could not highlight text:', error);
        }
      }
    }
  });
  
  isHighlightVisible = true;
}

// Clear all highlights
function clearHighlights() {
  highlightedElements.forEach(element => {
    if (element && element.parentNode) {
      // Replace highlight with text content
      const text = document.createTextNode(element.textContent);
      element.parentNode.replaceChild(text, element);
    }
  });
  highlightedElements = [];
  isHighlightVisible = false;
}

// Toggle highlights visibility
function toggleHighlights() {
  if (isHighlightVisible) {
    clearHighlights();
    const btn = document.getElementById('toolary-highlight-toggle-btn');
    if (btn) {
      btn.textContent = t('showHighlights', 'Show Highlights');
    }
  } else {
    if (currentAnalysis && currentAnalysis.suspiciousSections) {
      highlightSuspiciousSections(currentAnalysis.suspiciousSections);
      const btn = document.getElementById('toolary-highlight-toggle-btn');
      if (btn) {
        btn.textContent = t('hideHighlights', 'Hide Highlights');
      }
    }
  }
}

// Create sidebar panel
function createSidebar() {
  const panel = document.createElement('div');
  panel.id = 'toolary-ai-detector-panel';
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
  
  const titleIcon = createIconElement('sparkles', { size: 18, decorative: true });
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(t('aiContentDetectorTitle', 'AI Content Detector')));
  
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
  content.id = 'toolary-ai-detector-content';
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
    { id: 'input', label: t('analyzeInput', 'Enter Text'), icon: 'text' },
    { id: 'selection', label: t('analyzeSelection', 'Select Text'), icon: 'element' },
    { id: 'page', label: t('analyzePage', 'Page Content'), icon: 'book-open' }
  ];
  
  modes.forEach(mode => {
    const btn = createModeButton(mode.id, mode.label, mode.icon);
    modeSelector.appendChild(btn);
  });
  
  content.appendChild(modeSelector);
  
  // Input section (for manual mode)
  const inputSection = document.createElement('div');
  inputSection.id = 'toolary-input-section';
  inputSection.style.cssText = `
    display: ${currentMode === 'input' ? 'block' : 'none'};
    margin-bottom: 16px;
  `;
  
  const inputLabel = document.createElement('label');
  inputLabel.textContent = t('enterTextToAnalyze', 'Enter text to analyze');
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
  
  // Analyze button
  const analyzeBtn = document.createElement('button');
  analyzeBtn.id = 'toolary-analyze-btn';
  analyzeBtn.style.cssText = `
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
  
  const analyzeIcon = createIconElement('sparkles', { size: 16, decorative: true });
  analyzeBtn.appendChild(analyzeIcon);
  analyzeBtn.appendChild(document.createTextNode(t('analyze', 'Analyze Content')));
  
  const analyzeCleanup = addEventListenerWithCleanup(analyzeBtn, 'click', handleAnalyze);
  cleanupFunctions.push(analyzeCleanup);
  
  content.appendChild(analyzeBtn);
  
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
  loadingText.textContent = t('analyzing', 'Analyzing content...');
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

// Handle analyze button click
async function handleAnalyze() {
  if (isAnalyzing) return;
  
  try {
    isAnalyzing = true;
    
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    const resultsSection = document.getElementById('toolary-ai-results');
    const analyzeBtn = document.getElementById('toolary-analyze-btn');
    
    // Disable button and show loading
    if (analyzeBtn) analyzeBtn.disabled = true;
    
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }
    
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
    
    // Get text based on mode
    let text;
    if (currentMode === 'input') {
      const inputTextarea = document.getElementById('toolary-input-text');
      text = inputTextarea ? inputTextarea.value.trim() : '';
      if (!text) {
        throw new Error(t('pleaseEnterText', 'Please enter text to analyze'));
      }
    } else if (currentMode === 'selection') {
      if (!selectedTextForAnalysis) {
        throw new Error(t('pleaseSelectText', 'Please select text on the page'));
      }
      text = selectedTextForAnalysis;
    } else if (currentMode === 'page') {
      const content = extractPageContent();
      if (!content) {
        throw new Error(t('noContentToAnalyze', 'No content found to analyze'));
      }
      text = content;
    }
    
    // Analyze
    const analysis = await analyzeContent(text);
    
    // Store result
    currentAnalysis = analysis;
    
    // Display result
    renderAnalysisResult(analysis, text);
    
    // Save to history
    await saveToHistory(analysis, text, currentMode);
    
    // Show success message
    showSuccess(t('analysisComplete', 'Analysis complete!'));
    
    // Show coffee message
    showCoffeeMessageForTool('ai-content-detector');
    
  } catch (error) {
    handleError(error, 'handleAnalyze');
    const message = error.message || t('failedToAnalyze', 'Failed to analyze content');
    showError(message);
    
    // Hide loading
    const loadingIndicator = document.getElementById('toolary-ai-loading');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  } finally {
    isAnalyzing = false;
    const analyzeBtn = document.getElementById('toolary-analyze-btn');
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

// Render analysis result
function renderAnalysisResult(analysis) {
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
  
  // AI Probability gauge
  const probabilitySection = document.createElement('div');
  probabilitySection.style.cssText = `
    text-align: center;
    margin-bottom: 20px;
    padding: 16px;
    background: var(--toolary-bg, #fff);
    border-radius: 6px;
  `;
  
  const probabilityLabel = document.createElement('div');
  probabilityLabel.textContent = t('aiProbability', 'AI Probability');
  probabilityLabel.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 12px;
  `;
  
  const probabilityValue = document.createElement('div');
  probabilityValue.textContent = `${analysis.aiProbability}%`;
  probabilityValue.style.cssText = `
    font-size: 48px;
    font-weight: 700;
    color: ${getProbabilityColor(analysis.aiProbability)};
    margin-bottom: 8px;
  `;
  
  const confidenceBadge = document.createElement('div');
  confidenceBadge.textContent = t(`${analysis.confidence}Confidence`, getConfidenceLabel(analysis.confidence));
  confidenceBadge.style.cssText = `
    display: inline-block;
    padding: 4px 12px;
    background: ${getConfidenceColor(analysis.confidence)};
    color: #fff;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  `;
  
  probabilitySection.appendChild(probabilityLabel);
  probabilitySection.appendChild(probabilityValue);
  probabilitySection.appendChild(confidenceBadge);
  
  // Metrics breakdown
  const metricsSection = document.createElement('div');
  metricsSection.style.cssText = `margin-bottom: 16px;`;
  
  const metricsTitle = document.createElement('h4');
  metricsTitle.textContent = t('detailedMetrics', 'Detailed Analysis');
  metricsTitle.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--toolary-text, #333);
  `;
  
  metricsSection.appendChild(metricsTitle);
  
  // Render each metric
  const metrics = [
    { key: 'writingStyle', label: t('writingStyle', 'Writing Style') },
    { key: 'wordChoice', label: t('wordChoice', 'Word Choice') },
    { key: 'structure', label: t('structureAnalysis', 'Structure') }
  ];
  
  metrics.forEach(metric => {
    const data = analysis.metrics[metric.key];
    const metricCard = createMetricCard(metric.label, data);
    metricsSection.appendChild(metricCard);
  });
  
  // Suspicious sections
  if (analysis.suspiciousSections && analysis.suspiciousSections.length > 0) {
    const sectionsContainer = document.createElement('div');
    sectionsContainer.style.cssText = `margin-bottom: 16px;`;
    
    const sectionsTitle = document.createElement('h4');
    sectionsTitle.textContent = t('suspiciousSections', 'Suspicious Sections');
    sectionsTitle.style.cssText = `
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--toolary-text, #333);
    `;
    
    sectionsContainer.appendChild(sectionsTitle);
    
    analysis.suspiciousSections.forEach(section => {
      const sectionCard = document.createElement('div');
      sectionCard.style.cssText = `
        padding: 10px;
        background: var(--toolary-bg, #fff);
        border-left: 3px solid #ff9800;
        border-radius: 4px;
        margin-bottom: 8px;
      `;
      
      const sectionText = document.createElement('div');
      sectionText.textContent = `"${section.text}"`;
      sectionText.style.cssText = `
        font-size: 13px;
        color: var(--toolary-text, #333);
        margin-bottom: 4px;
        font-style: italic;
      `;
      
      const sectionReason = document.createElement('div');
      sectionReason.textContent = section.reason;
      sectionReason.style.cssText = `
        font-size: 12px;
        color: var(--toolary-secondary-text, #666);
      `;
      
      sectionCard.appendChild(sectionText);
      sectionCard.appendChild(sectionReason);
      sectionsContainer.appendChild(sectionCard);
    });
    
    metricsSection.appendChild(sectionsContainer);
  }
  
  // Action buttons
  const actionsContainer = document.createElement('div');
  actionsContainer.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 16px;
  `;
  
  const copyBtn = document.createElement('button');
  copyBtn.textContent = t('copyResults', 'Copy Results');
  copyBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  const copyCleanup = addEventListenerWithCleanup(copyBtn, 'click', () => handleCopyResults(analysis));
  cleanupFunctions.push(copyCleanup);
  
  const highlightBtn = document.createElement('button');
  highlightBtn.id = 'toolary-highlight-toggle-btn';
  highlightBtn.textContent = t('showHighlights', 'Show Highlights');
  highlightBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: var(--toolary-button-bg, #fff);
    color: var(--toolary-text, #333);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  const highlightCleanup = addEventListenerWithCleanup(highlightBtn, 'click', toggleHighlights);
  cleanupFunctions.push(highlightCleanup);
  
  actionsContainer.appendChild(copyBtn);
  actionsContainer.appendChild(highlightBtn);
  
  // Assemble results
  resultsSection.appendChild(probabilitySection);
  resultsSection.appendChild(metricsSection);
  resultsSection.appendChild(actionsContainer);
  
  resultsSection.style.display = 'block';
}

// Create metric card
function createMetricCard(label, data) {
  const card = document.createElement('div');
  card.style.cssText = `
    padding: 12px;
    background: var(--toolary-bg, #fff);
    border-radius: 4px;
    margin-bottom: 8px;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  `;
  
  const metricLabel = document.createElement('div');
  metricLabel.textContent = label;
  metricLabel.style.cssText = `
    font-size: 13px;
    font-weight: 600;
    color: var(--toolary-text, #333);
  `;
  
  const metricScore = document.createElement('div');
  metricScore.textContent = `${data.score}%`;
  metricScore.style.cssText = `
    font-size: 14px;
    font-weight: 700;
    color: ${getProbabilityColor(data.score)};
  `;
  
  header.appendChild(metricLabel);
  header.appendChild(metricScore);
  
  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    width: 100%;
    height: 6px;
    background: var(--toolary-border, #ddd);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  `;
  
  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    width: ${data.score}%;
    height: 100%;
    background: ${getProbabilityColor(data.score)};
    transition: width 0.3s ease;
  `;
  
  progressBar.appendChild(progressFill);
  
  // Explanation
  const explanation = document.createElement('div');
  explanation.textContent = data.explanation;
  explanation.style.cssText = `
    font-size: 12px;
    color: var(--toolary-secondary-text, #666);
    line-height: 1.4;
  `;
  
  card.appendChild(header);
  card.appendChild(progressBar);
  card.appendChild(explanation);
  
  return card;
}

// Get probability color
function getProbabilityColor(score) {
  if (score < 30) return '#28a745'; // Green (likely human)
  if (score < 60) return '#ffc107'; // Yellow (uncertain)
  return '#dc3545'; // Red (likely AI)
}

// Get confidence color
function getConfidenceColor(confidence) {
  if (confidence === 'high') return '#28a745';
  if (confidence === 'medium') return '#ffc107';
  return '#dc3545';
}

// Get confidence label
function getConfidenceLabel(confidence) {
  const labels = {
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence'
  };
  return labels[confidence] || confidence;
}

// Handle copy results
function handleCopyResults(analysis) {
  try {
    let text = `AI Content Detection Results\n`;
    text += `${'='.repeat(30)}\n\n`;
    text += `AI Probability: ${analysis.aiProbability}%\n`;
    text += `Confidence: ${analysis.confidence}\n\n`;
    text += `Detailed Metrics:\n`;
    text += `- Writing Style: ${analysis.metrics.writingStyle.score}%\n`;
    text += `- Word Choice: ${analysis.metrics.wordChoice.score}%\n`;
    text += `- Structure: ${analysis.metrics.structure.score}%\n`;
    
    if (analysis.suspiciousSections && analysis.suspiciousSections.length > 0) {
      text += `\nSuspicious Sections:\n`;
      analysis.suspiciousSections.forEach((section, i) => {
        text += `${i + 1}. "${section.text}" - ${section.reason}\n`;
      });
    }
    
    copyText(text);
    showSuccess(t('resultsCopied', 'Results copied to clipboard!'));
  } catch (error) {
    handleError(error, 'handleCopyResults');
    showError(t('failedToCopy', 'Failed to copy results'));
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
    
    const message = t('detectorActivated', 'AI Content Detector activated');
    showInfo(message);
    
  } catch (error) {
    handleError(error, 'contentDetector.activate');
    const message = t('failedToActivate', 'Failed to activate detector');
    showError(message);
    deactivate();
  }
}

// Deactivation
export function deactivate() {
  try {
    // Clear highlights
    clearHighlights();
    
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
    currentMode = 'input';
    isAnalyzing = false;
    currentAnalysis = null;
    isSelectingText = false;
    selectedTextForAnalysis = null;
    highlightedElements = [];
    isHighlightVisible = false;
    isActive = false;
    langMap = {};
    
  } catch (error) {
    handleError(error, 'contentDetector.deactivate');
  }
}

