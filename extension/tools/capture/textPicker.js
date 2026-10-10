import { createOverlay, removeOverlay, copyText, showModal, showError, showSuccess, showInfo, showWarning, throttle, handleError, safeExecute, sanitizeInput, addEventListenerWithCleanup } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'text-picker',
  name: 'Text Picker',
  category: 'capture',
  icon: 'text',
  permissions: ['activeTab'],
  tags: ['text', 'content', 'copy'],
  keywords: ['extract', 'text', 'copy', 'selection']
};

let overlay, deactivateCb;
let currentElement = null;
let cleanupFunctions = [];

// Performance optimized move handler with enhanced error handling
const throttledOnMove = throttle((e) => {
  try {
    const target = e.target instanceof Element
      ? e.target
      : (typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(e.clientX ?? 0, e.clientY ?? 0)
        : null);

    if (!(target instanceof Element) || target === overlay) return;

    currentElement = target;
    const rect = target.getBoundingClientRect();
    overlay.style.top = rect.top + window.scrollY + 'px';
    overlay.style.left = rect.left + window.scrollX + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  } catch (error) {
    console.debug('Text picker move handler error:', error);
  }
}, 16);

// Enhanced click handler with comprehensive text analysis and error handling
function onClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!(currentElement instanceof Element)) return;

  try {
    const el = currentElement;
    const text = el.textContent.trim();
    
    if (!text) {
      const message = chrome.i18n ? chrome.i18n.getMessage('noTextContentFoundInElement') : 'No text content found in this element.';
      showWarning(message);
      return;
    }
    
    // Comprehensive text analysis with performance optimization
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    const characterCount = text.length;
    const characterCountNoSpaces = text.replace(/\s/g, '').length;
    
    const textAnalysis = {
      // Basic text content
      text: sanitizeInput(text),
      textLength: text.length,
      wordCount: wordCount,
      characterCount: characterCount,
      characterCountNoSpaces: characterCountNoSpaces,
      
      // Text statistics
      statistics: {
        sentences: text.split(/[.!?]+/).filter(s => s.trim().length > 0).length,
        paragraphs: text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length,
        lines: text.split('\n').length,
        words: words,
        uniqueWords: [...new Set(words.map(w => w.toLowerCase()))].length,
        averageWordLength: wordCount > 0 ? Math.round(words.reduce((sum, word) => sum + word.length, 0) / wordCount * 100) / 100 : 0
      },
      
      // Text formatting
      formatting: {
        hasBold: el.querySelector('b, strong') !== null,
        hasItalic: el.querySelector('i, em') !== null,
        hasUnderline: el.querySelector('u') !== null,
        hasLinks: el.querySelector('a') !== null,
        hasLists: el.querySelector('ul, ol') !== null,
        hasCode: el.querySelector('code, pre') !== null
      },
      
      // Language detection (basic)
      language: {
        detected: safeExecute(() => detectLanguage(text), 'detectLanguage') || 'unknown',
        hasUnicode: /[\u0080-\uFFFF]/.test(text),
        hasEmojis: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(text),
        hasNumbers: /\d/.test(text),
        hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(text)
      },
      
      // Element context
      element: {
        tagName: el.tagName.toLowerCase(),
        className: el.className,
        id: el.id,
        parentElement: el.parentElement?.tagName.toLowerCase(),
        innerHTML: el.innerHTML,
        outerHTML: el.outerHTML
      },
      
      // Text styles
      styles: {
        fontSize: getComputedStyle(el).fontSize,
        fontFamily: getComputedStyle(el).fontFamily,
        fontWeight: getComputedStyle(el).fontWeight,
        color: getComputedStyle(el).color,
        backgroundColor: getComputedStyle(el).backgroundColor,
        textAlign: getComputedStyle(el).textAlign,
        lineHeight: getComputedStyle(el).lineHeight,
        letterSpacing: getComputedStyle(el).letterSpacing,
        textTransform: getComputedStyle(el).textTransform
      },
      
      // Export formats
      formats: {
        plain: text,
        html: el.innerHTML,
        markdown: safeExecute(() => convertToMarkdown(el), 'convertToMarkdown') || 'Failed to convert',
        csv: `"${text.replace(/"/g, '""')}"`,
        xml: `<text>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`
      }
    };
    
    // Add JSON format after textAnalysis is fully defined
    textAnalysis.formats.json = JSON.stringify({ 
      text: sanitizeInput(text), 
      metadata: { 
        wordCount: textAnalysis.wordCount, 
        characterCount: textAnalysis.characterCount 
      } 
    }, null, 2);
    
    // Copy primary format (plain text)
    copyText(text);
    
    const successMessage = chrome.i18n ? chrome.i18n.getMessage('textCopiedToClipboard', [textAnalysis.wordCount]) : `Text copied to clipboard! (${textAnalysis.wordCount} words)`;
    showSuccess(successMessage);
    
    const title = chrome.i18n ? chrome.i18n.getMessage('textTitle') : 'Text Analysis';
    const content = `Text:\n${text}\n\nStatistics:\n- Words: ${textAnalysis.wordCount}\n- Characters: ${textAnalysis.characterCount}\n- Sentences: ${textAnalysis.statistics.sentences}`;
    
    showModal(title, content, 'text', 'text');
    
    // Show coffee message when modal is closed
    setTimeout(() => {
      const modalOverlay = document.querySelector('#toolary-modal-overlay');
      if (modalOverlay) {
        // Override the remove method to show coffee message
        const originalRemove = modalOverlay.remove;
        modalOverlay.remove = function() {
          originalRemove.call(this);
          showCoffeeMessageForTool('text-picker');
        };
        
        // Also override the dismiss button click
        const dismissBtn = modalOverlay.querySelector('button[type="button"]');
        if (dismissBtn) {
          const originalClick = dismissBtn.onclick;
          dismissBtn.onclick = function(e) {
            if (originalClick) originalClick.call(this, e);
            showCoffeeMessageForTool('text-picker');
          };
        }
      }
    }, 100);
    deactivateCb();
    
  } catch (error) {
    handleError(error, 'textPicker');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToAnalyzeText') : 'Failed to analyze text. Please try again.';
    showError(errorMessage);
  }
}

// Basic language detection with enhanced error handling
function detectLanguage(text) {
  try {
    if (!text || typeof text !== 'string') return 'unknown';
    
    const patterns = {
      english: /^[a-zA-Z\s.,!?;:'"()-]+$/,
      turkish: /[çğıöşüÇĞIİÖŞÜ]/,
      arabic: /[\u0600-\u06FF]/,
      chinese: /[\u4e00-\u9fff]/,
      japanese: /[\u3040-\u309f\u30a0-\u30ff]/,
      korean: /[\uac00-\ud7af]/,
      cyrillic: /[\u0400-\u04ff]/,
      hindi: /[\u0900-\u097f]/
    };
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    
    return 'unknown';
  } catch (error) {
    handleError(error, 'detectLanguage');
    return 'unknown';
  }
}

// Convert HTML to Markdown (basic) with enhanced error handling
function convertToMarkdown(el) {
  try {
    if (!el || !el.innerHTML) return '';
    
    let markdown = el.innerHTML;
    
    // Basic conversions
    markdown = markdown.replace(/<strong>|<b>/g, '**').replace(/<\/strong>|<\/b>/g, '**');
    markdown = markdown.replace(/<em>|<i>/g, '*').replace(/<\/em>|<\/i>/g, '*');
    markdown = markdown.replace(/<u>/g, '').replace(/<\/u>/g, '');
    markdown = markdown.replace(/<br\s*\/?>/g, '\n');
    markdown = markdown.replace(/<p>/g, '\n\n').replace(/<\/p>/g, '');
    markdown = markdown.replace(/<h1>/g, '# ').replace(/<\/h1>/g, '\n');
    markdown = markdown.replace(/<h2>/g, '## ').replace(/<\/h2>/g, '\n');
    markdown = markdown.replace(/<h3>/g, '### ').replace(/<\/h3>/g, '\n');
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, '[$2]($1)');
    
    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]*>/g, '');
    
    return markdown.trim();
  } catch (error) {
    handleError(error, 'convertToMarkdown');
    return '';
  }
}

// Keyboard navigation with enhanced error handling
function onKeyDown(e) {
  try {
    if (!overlay || !currentElement) return;
    
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        onClick({ target: currentElement, preventDefault: () => {}, stopPropagation: () => {} });
        break;
      case 'Escape':
        e.preventDefault();
        deactivateCb();
        break;
    }
  } catch (error) {
    handleError(error, 'onKeyDown');
  }
}

export function activate(deactivate) {
  deactivateCb = deactivate;
  
  try {
    overlay = createOverlay();
    
    // Enhanced overlay styling for text picker
    overlay.style.cssText = `
      position: absolute;
      background-color: var(--toolary-highlight-bg, rgba(156, 39, 176, 0.2));
      border: 2px solid var(--toolary-primary-color, #9c27b0);
      border-radius: 4px;
      z-index: 2147483646;
      pointer-events: none;
      box-sizing: border-box;
      box-shadow: 0 0 6px var(--toolary-highlight-shadow, rgba(156, 39, 176, 0.6));
      transition: all 0.15s ease-out;
      animation: toolary-fade-in 0.2s ease-out;
    `;
    
    document.body.style.cursor = 'crosshair';
    
    // Add event listeners with cleanup tracking
    const cleanupMove = addEventListenerWithCleanup(document, 'mousemove', throttledOnMove, true);
    const cleanupClick = addEventListenerWithCleanup(document, 'click', onClick, true);
    const cleanupKeydown = addEventListenerWithCleanup(document, 'keydown', onKeyDown, true);
    
    cleanupFunctions.push(cleanupMove, cleanupClick, cleanupKeydown);
    
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('hoverToAnalyzeText') : 'Hover over text elements to analyze • Click to select • Enter to select • Esc to cancel';
    showInfo(infoMessage, 3000);
    
  } catch (error) {
    handleError(error, 'textPicker activation');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateTextPicker') : 'Failed to activate text picker. Please try again.';
    showError(errorMessage);
    deactivate();
  }
}

export function deactivate() {
  try {
    // Cleanup all event listeners
    cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        handleError(error, 'event listener cleanup');
      }
    });
    cleanupFunctions.length = 0;
    
    removeOverlay(overlay);
    overlay = null;
    currentElement = null;
    
    document.body.style.cursor = '';
    
  } catch (error) {
    handleError(error, 'textPicker deactivation');
  }
}
