import { showSuccess, showError, handleError, safeExecute, sanitizeInput, normalizeUrlForStorage, addEventListenerWithCleanup, t, ensureLanguageLoaded } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'text-highlighter',
  name: 'Text Highlighter',
  category: 'enhance',
  icon: 'highlighter',
  permissions: ['activeTab', 'storage'],
  tags: ['highlight', 'text', 'annotation', 'reading'],
  keywords: ['highlight', 'mark', 'annotate', 'reading']
};

// Default highlight colors
const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#ffeb3b', bgColor: 'rgba(255, 235, 59, 0.3)' },
  { name: 'Green', value: '#4caf50', bgColor: 'rgba(76, 175, 80, 0.3)' },
  { name: 'Blue', value: '#2196f3', bgColor: 'rgba(33, 150, 243, 0.3)' },
  { name: 'Pink', value: '#e91e63', bgColor: 'rgba(233, 30, 99, 0.3)' },
  { name: 'Orange', value: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.3)' }
];

const STORAGE_PREFIX = 'toolaryHighlights_';
const LEGACY_STORAGE_PREFIX = 'highlights_';

let deactivateCb;
let highlights = [];
let highlightCounter = 0;
let cleanupFunctions = [];
let colorPaletteOverlay = null;
let contextMenuOverlay = null;

function getSiteStorageKey(url) {
  const normalizedUrl = normalizeUrlForStorage(url);
  const keySuffix = normalizedUrl || 'global';
  return `${STORAGE_PREFIX}${keySuffix}`;
}

function getLegacyStorageKey(url) {
  return `${LEGACY_STORAGE_PREFIX}${sanitizeInput(url)}`;
}

// Removed unused functions

// Convert Range to serializable format
function serializeRange(range) {
  try {
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    return {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      startPath: getXPath(startContainer),
      endPath: getXPath(endContainer),
      startText: startContainer.textContent || '',
      endText: endContainer.textContent || ''
    };
  } catch (error) {
    handleError(error, 'serializeRange');
    return null;
  }
}

// Get XPath for an element
function getXPath(element) {
  if (!element || element === document) return '';
  
  if (element.nodeType === Node.TEXT_NODE) {
    const parent = element.parentNode;
    const parentXPath = getXPath(parent);
    const textNodes = Array.from(parent.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    const index = textNodes.indexOf(element);
    return `${parentXPath}/text()[${index + 1}]`;
  }
  
  if (element.nodeType === Node.ELEMENT_NODE) {
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentNode;
    
    if (!parent || parent === document) {
      return `/${tagName}`;
    }
    
    const siblings = Array.from(parent.children).filter(sibling => sibling.tagName.toLowerCase() === tagName);
    const index = siblings.indexOf(element);
    
    if (siblings.length === 1) {
      return `${getXPath(parent)}/${tagName}`;
    } else {
      return `${getXPath(parent)}/${tagName}[${index + 1}]`;
    }
  }
  
  return '';
}

// Create Range from serialized data
function deserializeRange(serializedRange) {
  try {
    if (!serializedRange || !serializedRange.startPath || !serializedRange.endPath) {
      return null;
    }
    
    const startElement = document.evaluate(serializedRange.startPath, document, null, window.XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const endElement = document.evaluate(serializedRange.endPath, document, null, window.XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    
    if (!startElement || !endElement) {
      return null;
    }
    
    const range = document.createRange();
    range.setStart(startElement, serializedRange.startOffset);
    range.setEnd(endElement, serializedRange.endOffset);
    
    return range;
  } catch (error) {
    handleError(error, 'deserializeRange');
    return null;
  }
}

// Create highlight element
function createHighlightElement(highlight) {
  const mark = document.createElement('mark');
  mark.className = 'toolary-highlight';
  mark.setAttribute('data-highlight-id', highlight.id);
  mark.setAttribute('data-toolary-highlight', 'true');
  mark.style.cssText = `
    background-color: ${highlight.bgColor} !important;
    color: ${highlight.color} !important;
    padding: 1px 2px !important;
    border-radius: 3px !important;
    cursor: pointer !important;
    position: relative !important;
    z-index: 1000 !important;
    display: inline !important;
    text-decoration: none !important;
    box-shadow: none !important;
    border: none !important;
    outline: none !important;
    margin: 0 !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    line-height: inherit !important;
    text-align: inherit !important;
    vertical-align: baseline !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    hyphens: auto !important;
    -webkit-hyphens: auto !important;
    -moz-hyphens: auto !important;
    -ms-hyphens: auto !important;
    /* Ensure it works in all HTML contexts */
    float: none !important;
    clear: none !important;
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    /* Preserve text formatting */
    font-family: inherit !important;
    font-style: inherit !important;
    font-variant: inherit !important;
    text-transform: inherit !important;
    letter-spacing: inherit !important;
    word-spacing: inherit !important;
    text-indent: inherit !important;
    /* Ensure visibility in all contexts */
    opacity: 1 !important;
    visibility: visible !important;
    /* Reset any potential conflicts */
    transform: none !important;
    transition: none !important;
    animation: none !important;
  `;
  
  return mark;
}

// Apply highlight to selected text
function applyHighlight(selection, color) {
  try {
    if (!selection || typeof selection.rangeCount !== 'number' || selection.rangeCount === 0) {
      return null;
    }
    
    const range = selection.getRangeAt(0);
    if (!range) {
      return null;
    }
    
    const text = range.toString().trim();
    
    if (!text) {
      return null;
    }
    
    const highlightId = `highlight-${++highlightCounter}`;
    const currentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedUrl = normalizeUrlForStorage(currentUrl);
    
    const highlight = {
      id: sanitizeInput(highlightId),
      text: sanitizeInput(text),
      color: sanitizeInput(color.value),
      bgColor: sanitizeInput(color.bgColor),
      range: serializeRange(range),
      createdAt: new Date().toISOString(),
      siteUrl: normalizedUrl
    };
    
    if (!highlight.range) {
      throw new Error('Failed to serialize range');
    }
    
    // Create highlight element
    const mark = createHighlightElement(highlight);
    
    // Check if range spans multiple elements or contains block elements
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    // Check if we're dealing with complex HTML structures
    const hasBlockElements = range.cloneContents().querySelector('h1, h2, h3, h4, h5, h6, p, div, li, ul, ol, table, tr, td, th, blockquote, pre, code, span, strong, em, b, i, a, img, br, hr');
    const spansMultipleElements = startContainer !== endContainer || 
                                 (startContainer.nodeType === Node.ELEMENT_NODE && endContainer.nodeType === Node.ELEMENT_NODE) ||
                                 (startContainer.parentNode !== endContainer.parentNode);
    
    if (hasBlockElements || spansMultipleElements) {
      // For complex HTML structures, use a more robust approach
      highlightComplexRange(range, mark);
    } else {
      // For simple text selections, use the standard approach
      try {
        range.surroundContents(mark);
      } catch {
        // Fallback to extractContents approach
        const clonedRange = range.cloneRange();
        const contents = clonedRange.extractContents();
        mark.appendChild(contents);
        clonedRange.insertNode(mark);
      }
    }
    
    // Add to highlights array
    highlights.push(highlight);
    
    // Save to storage
    saveHighlights();
    
    // Clear selection
    selection.removeAllRanges();
    
    return highlight;
  } catch (error) {
    handleError(error, 'applyHighlight');
    return null;
  }
}

// Handle complex HTML structures (lists, headings, tables, etc.)
function highlightComplexRange(range, mark) {
  try {
    // Clone the range to avoid modifying the original
    const clonedRange = range.cloneRange();
    
    // Get all text nodes in the range
    const textNodes = getTextNodesInRange(clonedRange);
    
    if (textNodes.length === 0) {
      // Fallback to standard approach
      const contents = clonedRange.extractContents();
      mark.appendChild(contents);
      clonedRange.insertNode(mark);
      return;
    }
    
    // Process each text node
    const processedNodes = [];
    
    textNodes.forEach((textNode, index) => {
      const nodeRange = document.createRange();
      nodeRange.selectNode(textNode);
      
      // Check if this text node is fully within our selection
      if (range.compareBoundaryPoints(window.Range.START_TO_START, nodeRange) <= 0 && 
          range.compareBoundaryPoints(window.Range.END_TO_END, nodeRange) >= 0) {
        // Entire text node is selected
        const markClone = mark.cloneNode(true);
        const parent = textNode.parentNode;
        parent.insertBefore(markClone, textNode);
        markClone.appendChild(textNode);
        processedNodes.push(markClone);
      } else {
        // Partial text node selection
        const startOffset = index === 0 ? range.startOffset : 0;
        const endOffset = index === textNodes.length - 1 ? range.endOffset : textNode.textContent.length;
        
        if (startOffset < endOffset) {
          const partialRange = document.createRange();
          partialRange.setStart(textNode, startOffset);
          partialRange.setEnd(textNode, endOffset);
          
          const markClone = mark.cloneNode(true);
          const contents = partialRange.extractContents();
          markClone.appendChild(contents);
          partialRange.insertNode(markClone);
          processedNodes.push(markClone);
        }
      }
    });
    
    // If no text nodes were processed, fallback to standard approach
    if (processedNodes.length === 0) {
      const contents = clonedRange.extractContents();
      mark.appendChild(contents);
      clonedRange.insertNode(mark);
    }
    
  } catch {
    // Final fallback
    const clonedRange = range.cloneRange();
    const contents = clonedRange.extractContents();
    mark.appendChild(contents);
    clonedRange.insertNode(mark);
  }
}

// Get all text nodes within a range
function getTextNodesInRange(range) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    window.NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Check if the text node is within the range
        if (range.comparePoint(node, 0) >= 0 && range.comparePoint(node, node.textContent.length) <= 0) {
          return window.NodeFilter.FILTER_ACCEPT;
        }
        return window.NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }
  
  return textNodes;
}

// Remove highlight
function removeHighlight(highlightId) {
  try {
    const sanitizedId = sanitizeInput(highlightId);
    const highlightElement = document.querySelector(`[data-highlight-id="${sanitizedId}"]`);
    
    if (highlightElement) {
      // Unwrap the mark element
      const parent = highlightElement.parentNode;
      if (parent) {
        while (highlightElement.firstChild) {
          parent.insertBefore(highlightElement.firstChild, highlightElement);
        }
        parent.removeChild(highlightElement);
      }
    }
    
    // Remove from highlights array
    const index = highlights.findIndex(h => h.id === sanitizedId);
    if (index !== -1) {
      highlights.splice(index, 1);
      saveHighlights();
    }
    
    const message = chrome.i18n ? chrome.i18n.getMessage('highlightRemoved') : 'Highlight removed';
    showSuccess(message);
  } catch (error) {
    handleError(error, 'removeHighlight');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToRemoveHighlight') : 'Failed to remove highlight';
    showError(message);
  }
}

// Show color palette
function showColorPalette() {
  if (colorPaletteOverlay) {
    colorPaletteOverlay.remove();
  }
  
  colorPaletteOverlay = document.createElement('div');
  colorPaletteOverlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 280px;
  `;
  
  const title = document.createElement('h3');
  title.textContent = t('chooseHighlightColor', 'Choose Highlight Color');
  title.style.cssText = 'margin: 0; font-size: 16px; font-weight: 600; color: var(--toolary-text, #333); text-align: center;';
  colorPaletteOverlay.appendChild(title);
  
  const colorsGrid = document.createElement('div');
  colorsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;';
  
  HIGHLIGHT_COLORS.forEach(color => {
    const colorBtn = document.createElement('button');
    colorBtn.style.cssText = `
      width: 40px;
      height: 40px;
      border: 2px solid var(--toolary-border, #ddd);
      border-radius: 8px;
      background: ${color.bgColor};
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
    `;
    colorBtn.title = color.name;
    
    colorBtn.addEventListener('click', () => {
      const currentSelection = window.getSelection();
      const highlight = applyHighlight(currentSelection, color);
      if (highlight) {
        showSuccess(`Text highlighted with ${color.name}`);
      } else {
        const message = chrome.i18n ? chrome.i18n.getMessage('failedToHighlightText') : 'Failed to highlight text';
        showError(message);
      }
      colorPaletteOverlay.remove();
      colorPaletteOverlay = null;
    });
    
    colorBtn.addEventListener('mouseenter', () => {
      colorBtn.style.transform = 'scale(1.1)';
      colorBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    });
    
    colorBtn.addEventListener('mouseleave', () => {
      colorBtn.style.transform = 'scale(1)';
      colorBtn.style.boxShadow = 'none';
    });
    
    colorsGrid.appendChild(colorBtn);
  });
  
  colorPaletteOverlay.appendChild(colorsGrid);
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = t('cancel', 'Cancel');
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--toolary-button-bg, #f0f0f0);
    color: var(--toolary-text, #333);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  `;
  cancelBtn.addEventListener('click', () => {
    colorPaletteOverlay.remove();
    colorPaletteOverlay = null;
  });
  
  colorPaletteOverlay.appendChild(cancelBtn);
  document.body.appendChild(colorPaletteOverlay);
}

// Show context menu
function showContextMenu(event, highlightId) {
  event.preventDefault();
  event.stopPropagation();
  
  if (contextMenuOverlay) {
    contextMenuOverlay.remove();
    contextMenuOverlay = null;
  }
  
  contextMenuOverlay = document.createElement('div');
  contextMenuOverlay.style.cssText = `
    position: fixed;
    top: ${event.clientY + 5}px;
    left: ${event.clientX + 5}px;
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-width: 120px;
  `;
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = t('removeHighlight', 'Remove Highlight');
  removeBtn.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--toolary-danger-color, #dc3545);
    cursor: pointer;
    font-size: 13px;
    text-align: left;
    border-radius: 6px;
  `;
  removeBtn.addEventListener('click', () => {
    removeHighlight(highlightId);
    if (contextMenuOverlay) {
      contextMenuOverlay.remove();
      contextMenuOverlay = null;
    }
    document.removeEventListener('click', closeHandler);
  });
  
  contextMenuOverlay.appendChild(removeBtn);
  document.body.appendChild(contextMenuOverlay);
  
  // Close on outside click
  const closeHandler = (e) => {
    if (contextMenuOverlay && !contextMenuOverlay.contains(e.target)) {
      contextMenuOverlay.remove();
      contextMenuOverlay = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 100);
}

// Handle text selection
function handleTextSelection() {
  try {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text && text.length > 0) {
      // Use setTimeout to ensure the selection is stable
      setTimeout(() => {
        showColorPalette();
      }, 10);
    }
  } catch (error) {
    handleError(error, 'handleTextSelection');
  }
}

// Handle context menu on highlights
function handleHighlightContextMenu(event) {
  const highlightElement = event.target.closest('[data-toolary-highlight="true"]');
  if (highlightElement) {
    const highlightId = highlightElement.getAttribute('data-highlight-id');
    if (highlightId) {
      showContextMenu(event, highlightId);
    }
  }
}

// Restore highlights from storage
function restoreHighlights() {
  try {
    highlights.forEach(highlight => {
      // Check if highlight already exists
      const existingHighlight = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
      if (existingHighlight) {
        return; // Skip if already exists
      }
      
      const range = deserializeRange(highlight.range);
      if (range) {
        const mark = createHighlightElement(highlight);
        
        // Check if this is a complex HTML structure
        const hasBlockElements = range.cloneContents().querySelector('h1, h2, h3, h4, h5, h6, p, div, li, ul, ol, table, tr, td, th, blockquote, pre, code, span, strong, em, b, i, a, img, br, hr');
        const spansMultipleElements = range.startContainer !== range.endContainer || 
                                     (range.startContainer.nodeType === Node.ELEMENT_NODE && range.endContainer.nodeType === Node.ELEMENT_NODE) ||
                                     (range.startContainer.parentNode !== range.endContainer.parentNode);
        
        if (hasBlockElements || spansMultipleElements) {
          // Use complex highlighting for HTML structures
          highlightComplexRange(range, mark);
        } else {
          // Use simple highlighting for plain text
          try {
            range.surroundContents(mark);
          } catch {
            // If surroundContents fails, fall back to extractContents
            const contents = range.extractContents();
            mark.appendChild(contents);
            range.insertNode(mark);
          }
        }
      }
    });
  } catch (error) {
    handleError(error, 'restoreHighlights');
  }
}

// Watch for DOM changes and restore highlights if they're lost (for React/Next.js)
function watchForDOMChanges() {
  const observer = new window.MutationObserver((mutations) => {
    let shouldRestore = false;
    
    mutations.forEach((mutation) => {
      // Check if any highlight elements were removed
      if (mutation.type === 'childList') {
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.hasAttribute && node.hasAttribute('data-toolary-highlight')) {
              shouldRestore = true;
            }
            // Also check child nodes
            if (node.querySelector && node.querySelector('[data-toolary-highlight]')) {
              shouldRestore = true;
            }
          }
        });
      }
    });
    
    if (shouldRestore) {
      // Debounce the restoration to avoid excessive calls
      clearTimeout(window.toolaryRestoreTimeout);
      window.toolaryRestoreTimeout = setTimeout(() => {
        restoreHighlights();
      }, 100);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });
  
  return observer;
}

// Save highlights to storage
async function saveHighlights() {
  try {
    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.debug('Chrome storage not available, skipping save');
      return;
    }

    const rawCurrentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(rawCurrentUrl);
    if (!normalizedCurrentUrl) {
      throw new Error('No current URL available');
    }

    const siteKey = getSiteStorageKey(rawCurrentUrl);
    const highlightsToPersist = highlights.filter(highlight => {
      return normalizeUrlForStorage(highlight.siteUrl) === normalizedCurrentUrl;
    });

    const normalizedHighlights = highlightsToPersist.map(highlight => ({
      ...highlight,
      siteUrl: normalizedCurrentUrl
    }));

    await safeExecute(async () =>
      await chrome.storage.local.set({ [siteKey]: normalizedHighlights }), 'save highlights to storage');

  } catch (error) {
    handleError(error, 'saveHighlights');
  }
}

// Load highlights from storage
async function loadHighlights() {
  try {
    const rawCurrentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(rawCurrentUrl);
    if (!normalizedCurrentUrl) {
      throw new Error('No current URL available');
    }

    const siteKey = getSiteStorageKey(rawCurrentUrl);

    const siteData = await safeExecute(async () =>
      await chrome.storage.local.get([siteKey]), 'load highlights from storage') || {};

    let loadedHighlights = siteData[siteKey] || [];

    // Migration: Check for old URL-based keys and migrate them
    if (loadedHighlights.length === 0) {
      const legacyKey = getLegacyStorageKey(rawCurrentUrl);
      const legacyData = await safeExecute(async () =>
        await chrome.storage.local.get([legacyKey]), 'load legacy highlights') || {};

      if (legacyData[legacyKey] && legacyData[legacyKey].length > 0) {
        loadedHighlights = legacyData[legacyKey];
        const migratedHighlights = loadedHighlights.map(highlight => ({
          ...highlight,
          siteUrl: normalizeUrlForStorage(highlight.siteUrl || normalizedCurrentUrl) || normalizedCurrentUrl
        }));
        // Migrate to new format
        await chrome.storage.local.set({ [siteKey]: migratedHighlights });
        // Remove old key
        await chrome.storage.local.remove([legacyKey]);
        loadedHighlights = migratedHighlights;
      }
    }

    const normalizedHighlights = loadedHighlights.map(highlight => ({
      ...highlight,
      siteUrl: normalizeUrlForStorage(highlight.siteUrl || normalizedCurrentUrl) || normalizedCurrentUrl
    }));

    highlights = normalizedHighlights;
    
    // Update counter
    highlightCounter = highlights.reduce((max, highlight) => {
      const match = highlight.id?.match(/highlight-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return Math.max(max, num);
      }
      return max;
    }, 0);

  } catch (error) {
    handleError(error, 'loadHighlights');
    highlights = [];
    highlightCounter = 0;
  }
}

export async function activate(deactivate) {
  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    deactivateCb = deactivate;
    
    const currentUrl = safeExecute(() => window.location.href, 'get location href') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(currentUrl);

    console.log('Text highlighter activated for URL:', normalizedCurrentUrl || currentUrl);
    
    // Load existing highlights for current site
    loadHighlights().then(() => {
      // Restore highlights on page
      restoreHighlights();
      
      // Start watching for DOM changes (for React/Next.js compatibility)
      const domObserver = watchForDOMChanges();
      cleanupFunctions.push(() => domObserver.disconnect());
      
      // Add event listeners
      const cleanupMouseUp = addEventListenerWithCleanup(document, 'mouseup', handleTextSelection, true);
      const cleanupContextMenu = addEventListenerWithCleanup(document, 'contextmenu', handleHighlightContextMenu, true);
      
      cleanupFunctions.push(cleanupMouseUp, cleanupContextMenu);
      
      // Show coffee message
      showCoffeeMessageForTool('text-highlighter');
    }).catch(error => {
      handleError(error, 'textHighlighter activation loadHighlights');
      deactivate();
    });
    
  } catch (error) {
    handleError(error, 'textHighlighter activation');
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
    
    // Remove overlays
    if (colorPaletteOverlay) {
      colorPaletteOverlay.remove();
      colorPaletteOverlay = null;
    }
    
    if (contextMenuOverlay) {
      contextMenuOverlay.remove();
      contextMenuOverlay = null;
    }
    
    // Don't remove highlights from page - they should persist
    if (deactivateCb && !deactivateCb.called) {
      deactivateCb.called = true;
      deactivateCb();
    }
    
  } catch (error) {
    handleError(error, 'textHighlighter deactivation');
  }
}
