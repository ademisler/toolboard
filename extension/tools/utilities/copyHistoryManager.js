import { 
  showSuccess, 
  showError, 
  handleError, 
  copyText,
  ensureLanguageLoaded,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'copy-history-manager',
  name: 'Copy History Manager',
  category: 'utilities',
  icon: 'clipboard-list',
  permissions: ['activeTab', 'storage'],
  tags: ['clipboard', 'copy', 'history', 'paste'],
  keywords: ['copy', 'clipboard', 'history', 'paste', 'track']
};

// Storage configuration
const STORAGE_KEY = 'toolaryCopyHistoryManagerGlobal';
const LEGACY_PREFIX = 'toolaryCopyHistoryManager_';
const MAX_HISTORY_ITEMS = 200;
const PREVIEW_LENGTH = 100;

// State
let cleanupFunctions = [];
let floatingWidget = null;
let sidebar = null;
let backdrop = null;
let isPanelOpen = false;
let copyHistory = [];
let currentDomain = '';
let isMonitoring = false;
let lastContextLink = null;
let clipboardPollInterval = null;
let lastClipboardText = '';

// Get current domain
function getCurrentDomain() {
  try {
    return window.location.hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Detect if content is URL
function isUrl(text) {
  try {
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    return urlPattern.test(text.trim());
  } catch {
    return false;
  }
}

// Create preview text
function createPreview(text) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= PREVIEW_LENGTH) return trimmed;
  return trimmed.substring(0, PREVIEW_LENGTH) + '...';
}

// Get storage key for global history
function getStorageKey() {
  return STORAGE_KEY;
}

async function migrateLegacyStorage() {
  try {
    const allData = await chrome.storage.local.get(null);
    const legacyKeys = Object.keys(allData).filter(key => 
      key.startsWith(LEGACY_PREFIX) && key !== STORAGE_KEY
    );

    if (!legacyKeys.length) {
      return;
    }

    const seen = new Set();
    let combined = [];

    const pushItem = (item, domainHint = 'unknown') => {
      if (!item || !item.content) return;
      const content = item.content.trim();
      if (!content) return;

      const type = item.type || 'text';
      const domain = item.domain || domainHint || 'unknown';
      const timestamp = item.timestamp || Date.now();
      const key = `${content}::${type}::${domain}`;

      if (seen.has(key)) return;
      seen.add(key);

      combined.push({
        id: item.id || generateId(),
        content,
        type,
        domain,
        timestamp,
        preview: item.preview || createPreview(content)
      });
    };

    legacyKeys.forEach(key => {
      const entry = allData[key];
      if (entry && Array.isArray(entry.history)) {
        const domain = entry.domain || 'unknown';
        entry.history.forEach(item => pushItem(item, domain));
      }
    });

    const existing = allData[STORAGE_KEY];
    if (existing && Array.isArray(existing.history)) {
      existing.history.forEach(item => pushItem(item, item.domain));
    }

    combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (combined.length > MAX_HISTORY_ITEMS) {
      combined = combined.slice(0, MAX_HISTORY_ITEMS);
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        history: combined,
        lastUpdated: Date.now(),
        migratedFromLegacy: true
      }
    });

    await chrome.storage.local.remove(legacyKeys);
    console.log(`Migrated ${combined.length} legacy copy history items`);
  } catch (error) {
    handleError(error, 'migrateLegacyStorage');
  }
}

// Load history from storage
async function loadHistory() {
  try {
    const key = getStorageKey();
    const result = await chrome.storage.local.get([key]);
    const data = result[key];

    if (data && Array.isArray(data.history)) {
      copyHistory = data.history;
    } else {
      copyHistory = [];
    }

    // Normalize legacy items that may be missing domain
    copyHistory = copyHistory.map(item => ({
      ...item,
      domain: item.domain || currentDomain || 'unknown'
    }));

    console.log(`Loaded ${copyHistory.length} history items`);
    if (copyHistory.length > 0) {
      lastClipboardText = copyHistory[0].content;
    }
  } catch (error) {
    handleError(error, 'loadHistory');
    copyHistory = [];
  }
}

// Save history to storage
async function saveHistory() {
  try {
    const key = getStorageKey();
    const data = {
      history: copyHistory,
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({ [key]: data });
    console.log(`Saved ${copyHistory.length} history items`);
  } catch (error) {
    handleError(error, 'saveHistory');
  }
}

// Add item to history
async function addToHistory(content, type) {
  if (!content || !content.trim()) return;
  
  const trimmedContent = content.trim();
  const domain = currentDomain || getCurrentDomain() || 'unknown';
  
  // Check if item already exists (avoid duplicates)
  const exists = copyHistory.some(item => 
    item.content === trimmedContent && 
    item.type === type &&
    item.domain === domain
  );
  
  if (exists) return;
  
  const newItem = {
    id: generateId(),
    content: trimmedContent,
    type: type,
    timestamp: Date.now(),
    domain,
    preview: createPreview(trimmedContent)
  };
  
  // Add to beginning of array (newest first)
  copyHistory.unshift(newItem);
  
  // Maintain max items limit (FIFO)
  if (copyHistory.length > MAX_HISTORY_ITEMS) {
    copyHistory = copyHistory.slice(0, MAX_HISTORY_ITEMS);
  }
  
  // Save to storage
  await saveHistory();
  
  // Always update floating widget badge (even when panel is closed)
  updateFloatingWidgetBadge();
  
  // Update UI if panel is open
  if (isPanelOpen) {
    updateHistoryUI();
  }
  
  console.log(`Added ${type} item to history: ${newItem.preview}`);
  lastClipboardText = trimmedContent;
  if (lastContextLink && lastContextLink.url === trimmedContent) {
    lastContextLink = null;
  }
}

// Handle copy event
async function handleCopyEvent(event) {
  if (!isMonitoring) return;

  let text = '';
  try {
    text = event?.clipboardData?.getData('text/plain') || '';
  } catch (error) {
    console.debug('Failed to read text/plain from copy event:', error);
  }

  if (!text) {
    try {
      text = event?.clipboardData?.getData('text/uri-list') || '';
    } catch {
      // ignore
    }
  }

  if (!text && navigator.clipboard?.readText) {
    try {
      text = await navigator.clipboard.readText();
    } catch (error) {
      console.debug('navigator.clipboard.readText failed during copy event:', error);
    }
  }

  if (!text) {
    text = window.getSelection()?.toString() || lastSelection || '';
  }

  if (!text && lastContextLink?.url && (Date.now() - lastContextLink.timestamp) < 5000) {
    text = lastContextLink.url;
  }

  if (!text || !text.trim()) {
    return;
  }

  const trimmedText = text.trim();
  const type = isUrl(trimmedText) ? 'url' : 'text';
  lastSelection = trimmedText;

  try {
    await addToHistory(trimmedText, type);
    showSuccess(t('itemCopied', 'Item added to history'));
    
    // Show coffee message
    showCoffeeMessageForTool('copy-history-manager');
  } catch (error) {
    handleError(error, 'handleCopyEvent.process');
  }
}

// Handle selection change (for right-click copy detection)
let lastSelection = '';
function handleSelectionChange() {
  if (!isMonitoring) return;
  
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (!selectedText) {
    lastSelection = '';
    return;
  }
  
  // Store current selection for potential copy
  if (selectedText && selectedText !== lastSelection) {
    lastSelection = selectedText;
  }
}

function resolveLinkFromElement(target) {
  if (!target) return null;

  const normalizeUrl = (value) => {
    if (!value) return null;
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return value;
    }
  };

  const anchor = target.closest('a[href], area[href]');
  if (anchor?.href) {
    return normalizeUrl(anchor.getAttribute('href') || anchor.href);
  }

  const dataUrl = target.closest('[data-url]')?.getAttribute('data-url');
  if (dataUrl) return normalizeUrl(dataUrl);

  const dataHref = target.closest('[data-href]')?.getAttribute('data-href');
  if (dataHref) return normalizeUrl(dataHref);

  const onclick = target.getAttribute && target.getAttribute('onclick');
  if (onclick) {
    const match = onclick.match(/(?:location\.href|window\.open)\(['"]([^'"]+)['"]/i);
    if (match && match[1]) {
      return normalizeUrl(match[1]);
    }
  }

  return null;
}

function handleContextMenu(event) {
  if (!isMonitoring) return;

  const url = resolveLinkFromElement(event.target);
  if (url) {
    lastContextLink = {
      url,
      timestamp: Date.now()
    };
  }
}

// Handle mouse up (detect right-click copy)
function handleMouseUp(event) {
  if (!isMonitoring) return;
  
  // Check if right-click occurred
  if (event.button === 2) { // Right mouse button
    // Wait a bit for context menu to appear and copy to happen
    setTimeout(async () => {
      try {
        // Check if clipboard has new content
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText || !clipboardText.trim()) return;

        const trimmedText = clipboardText.trim();
        const type = isUrl(trimmedText) ? 'url' : 'text';
        const now = Date.now();

        const selectionMatch = trimmedText === lastSelection;
        const contextMatch = lastContextLink && trimmedText === lastContextLink.url && (now - lastContextLink.timestamp) < 5000;

        if (!selectionMatch && !contextMatch) {
          return;
        }

        await addToHistory(trimmedText, type);
        lastClipboardText = trimmedText;

        if (contextMatch) {
          lastContextLink = null;
        }
        if (selectionMatch) {
          lastSelection = trimmedText;
        }

        // Show brief success feedback
        showSuccess(t('itemCopied', 'Item added to history'));
      } catch (error) {
        // Clipboard access might fail, ignore silently
        console.debug('Could not read clipboard after right-click:', error);

        if (error?.name === 'NotAllowedError' && lastContextLink?.url) {
          const now = Date.now();
          if ((now - lastContextLink.timestamp) < 5000) {
            try {
              await addToHistory(lastContextLink.url, 'url');
              showSuccess(t('itemCopied', 'Item added to history'));
            } catch (fallbackError) {
              handleError(fallbackError, 'handleMouseUp.fallback');
            } finally {
              lastClipboardText = lastContextLink.url;
              lastContextLink = null;
            }
          }
        }
      }
    }, 100);
  }
}

async function checkClipboardForAddressBar() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  if (!document.hasFocus() && document.visibilityState !== 'visible') return;

  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) return;

    const trimmed = text.trim();
    if (trimmed === lastClipboardText) return;

    const matchesCurrentUrl = typeof window.location?.href === 'string' && trimmed === window.location.href;
    const matchesContext = lastContextLink && trimmed === lastContextLink.url && (Date.now() - lastContextLink.timestamp) < 5000;

    if (!matchesCurrentUrl && !matchesContext) {
      if (lastContextLink && (Date.now() - lastContextLink.timestamp) > 8000) {
        lastContextLink = null;
      }
      return;
    }

    const type = isUrl(trimmed) ? 'url' : 'text';
    await addToHistory(trimmed, type);
    lastClipboardText = trimmed;

    if (matchesContext) {
      lastContextLink = null;
    }
  } catch (error) {
    if (error && error.name === 'NotAllowedError') {
      console.debug('Clipboard read denied while polling');
    } else {
      console.debug('Clipboard polling error:', error);
    }
  }
}

function startClipboardPolling() {
  if (clipboardPollInterval) return;
  if (!navigator.clipboard || !navigator.clipboard.readText) return;

  clipboardPollInterval = setInterval(checkClipboardForAddressBar, 1200);
}

function stopClipboardPolling() {
  if (!clipboardPollInterval) return;
  clearInterval(clipboardPollInterval);
  clipboardPollInterval = null;
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkClipboardForAddressBar();
  }
}

// Start monitoring copy events
function startMonitoring() {
  if (isMonitoring) return;
  
  isMonitoring = true;
  
  // Add copy event listener (for Ctrl+C)
  document.addEventListener('copy', handleCopyEvent, true);
  
  // Add selection change listener (for right-click copy)
  document.addEventListener('selectionchange', handleSelectionChange, true);
  
  // Add mouseup listener (for right-click copy)
  document.addEventListener('mouseup', handleMouseUp, true);

  // Track context menu targets for link copies
  document.addEventListener('contextmenu', handleContextMenu, true);
  window.addEventListener('focus', checkClipboardForAddressBar, true);
  document.addEventListener('visibilitychange', handleVisibilityChange, true);

  startClipboardPolling();
  
  console.log('Started monitoring copy events');
}

// Stop monitoring copy events
function stopMonitoring() {
  if (!isMonitoring) return;
  
  isMonitoring = false;
  
  // Remove all event listeners
  document.removeEventListener('copy', handleCopyEvent, true);
  document.removeEventListener('selectionchange', handleSelectionChange, true);
  document.removeEventListener('mouseup', handleMouseUp, true);
  document.removeEventListener('contextmenu', handleContextMenu, true);
  window.removeEventListener('focus', checkClipboardForAddressBar, true);
  document.removeEventListener('visibilitychange', handleVisibilityChange, true);

  stopClipboardPolling();
  lastContextLink = null;

  console.log('Stopped monitoring copy events');
}

// Create floating widget
function createFloatingWidget() {
  const widget = document.createElement('div');
  widget.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    background: var(--toolary-button-bg, #ffffff);
    border: 2px solid var(--toolary-border, #d1d5db);
    border-radius: 50%;
    cursor: pointer;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    user-select: none;
  `;
  
  // Add hover effects
  widget.addEventListener('mouseenter', () => {
    widget.style.transform = 'scale(1.05)';
    widget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
  });
  
  widget.addEventListener('mouseleave', () => {
    widget.style.transform = 'scale(1)';
    widget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  });
  
  // Create icon
  const icon = createIconElement('clipboard-list', { size: 24, decorative: true });
  widget.appendChild(icon);
  
  // Create badge for item count
  const badge = document.createElement('div');
  badge.style.cssText = `
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    background: #ef4444;
    color: white;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: 2px solid var(--toolary-button-bg, #ffffff);
  `;
  badge.textContent = copyHistory.length.toString();
  widget.appendChild(badge);
  
  // Click handler
  widget.addEventListener('click', () => {
    if (isPanelOpen) {
      hidePanel();
    } else {
      showPanel();
    }
  });
  
  return widget;
}

// Update floating widget badge
function updateFloatingWidgetBadge() {
  if (!floatingWidget) return;
  
  const badge = floatingWidget.querySelector('div');
  if (badge) {
    badge.textContent = copyHistory.length.toString();
    badge.style.display = copyHistory.length > 0 ? 'flex' : 'none';
  }
}

// Create sidebar panel
function createSidebar() {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: var(--toolary-button-bg, #ffffff);
    border-left: 1px solid var(--toolary-border, #d1d5db);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--toolary-border, #d1d5db);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--toolary-bg, #f9fafb);
  `;
  
  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--toolary-text, #1f2937);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const titleIcon = createIconElement('clipboard-list', { size: 20, decorative: true });
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(t('copyHistoryManager', 'Copy History')));
  
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--toolary-text-secondary, #6b7280);
    transition: all 0.2s ease;
  `;
  
  const closeIcon = createIconElement('close', { size: 16, decorative: true });
  closeBtn.appendChild(closeIcon);
  
  closeBtn.addEventListener('click', hidePanel);
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.backgroundColor = 'var(--toolary-hover-bg, #f3f4f6)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.backgroundColor = 'transparent';
  });
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Search bar
  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--toolary-border, #d1d5db);
  `;
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = t('searchHistory', 'Search history...');
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #d1d5db);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-button-bg, #ffffff);
    color: var(--toolary-text, #1f2937);
    outline: none;
    transition: border-color 0.2s ease;
  `;
  
  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = 'var(--toolary-primary, #3b82f6)';
  });
  
  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = 'var(--toolary-border, #d1d5db)';
  });
  
  searchContainer.appendChild(searchInput);
  
  // History list container
  const historyContainer = document.createElement('div');
  historyContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 0;
  `;
  
  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 16px 20px;
    border-top: 1px solid var(--toolary-border, #d1d5db);
    background: var(--toolary-bg, #f9fafb);
  `;
  
  const clearBtn = document.createElement('button');
  clearBtn.style.cssText = `
    width: 100%;
    padding: 10px 16px;
    background: var(--toolary-danger, #ef4444);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  `;
  
  clearBtn.textContent = t('clearAllHistory', 'Clear All History');
  
  clearBtn.addEventListener('click', async () => {
    if (confirm(t('confirmClearAll', 'Are you sure you want to clear all history?'))) {
      await clearAllHistory();
    }
  });
  
  clearBtn.addEventListener('mouseenter', () => {
    clearBtn.style.backgroundColor = '#dc2626';
  });
  
  clearBtn.addEventListener('mouseleave', () => {
    clearBtn.style.backgroundColor = 'var(--toolary-danger, #ef4444)';
  });
  
  footer.appendChild(clearBtn);
  
  // Assemble panel
  panel.appendChild(header);
  panel.appendChild(searchContainer);
  panel.appendChild(historyContainer);
  panel.appendChild(footer);
  
  // Store references for later use
  panel.searchInput = searchInput;
  panel.historyContainer = historyContainer;
  
  return panel;
}

// Create backdrop
function createBackdrop() {
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    z-index: 9998;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  
  backdrop.addEventListener('click', hidePanel);
  
  return backdrop;
}

// Show panel
function showPanel() {
  if (isPanelOpen) return;
  
  isPanelOpen = true;

  if (!isMonitoring) {
    startMonitoring();
  }
  
  // Create elements if they don't exist
  if (!sidebar) {
    sidebar = createSidebar();
    document.body.appendChild(sidebar);
  }
  
  if (!backdrop) {
    backdrop = createBackdrop();
    document.body.appendChild(backdrop);
  }
  
  // Show with animation
  setTimeout(() => {
    sidebar.style.transform = 'translateX(0)';
    backdrop.style.opacity = '1';
  }, 10);
  
  // Update history display
  updateHistoryUI();
  
  // Focus search input
  if (sidebar.searchInput) {
    setTimeout(() => sidebar.searchInput.focus(), 300);
  }
  
  console.log('Copy History panel opened');
}

// Hide panel
function hidePanel() {
  if (!isPanelOpen) return;
  
  isPanelOpen = false;
  
  if (sidebar) {
    sidebar.style.transform = 'translateX(100%)';
  }
  
  if (backdrop) {
    backdrop.style.opacity = '0';
  }
  
  // Remove elements after animation
  setTimeout(() => {
    if (sidebar && sidebar.parentNode) {
      sidebar.parentNode.removeChild(sidebar);
      sidebar = null;
    }
    
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
      backdrop = null;
    }
  }, 300);

  stopMonitoring();
  console.log('Copy History panel closed - monitoring stopped');
}

// Create history item element
function createHistoryItem(item) {
  const itemEl = document.createElement('div');
  itemEl.style.cssText = `
    padding: 12px 20px;
    border-bottom: 1px solid var(--toolary-border-light, #f3f4f6);
    cursor: pointer;
    transition: background-color 0.2s ease;
  `;
  
  // Header with timestamp and type badge
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  `;
  
  const metaContainer = document.createElement('div');
  metaContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  `;

  if (item.domain && item.domain !== 'unknown') {
    const domainBadge = document.createElement('span');
    domainBadge.style.cssText = `
      max-width: 160px;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--toolary-hover-bg, #f3f4f6);
      color: var(--toolary-text-secondary, #4b5563);
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    `;
    domainBadge.textContent = item.domain;
    metaContainer.appendChild(domainBadge);
  }

  const timestamp = document.createElement('span');
  timestamp.style.cssText = `
    font-size: 12px;
    color: var(--toolary-text-secondary, #6b7280);
  `;
  timestamp.textContent = new Date(item.timestamp).toLocaleString();
  metaContainer.appendChild(timestamp);

  const typeBadge = document.createElement('span');
  typeBadge.style.cssText = `
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    ${item.type === 'url' ? 
      'background: #dbeafe; color: #1e40af;' : 
      'background: #f3f4f6; color: #374151;'
    }
  `;
  typeBadge.textContent = item.type;
  
  header.appendChild(metaContainer);
  header.appendChild(typeBadge);
  
  // Content preview
  const content = document.createElement('div');
  content.style.cssText = `
    font-size: 14px;
    color: var(--toolary-text, #1f2937);
    line-height: 1.4;
    word-break: break-word;
    margin-bottom: 8px;
  `;
  content.textContent = item.preview;
  
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.style.cssText = `
    background: var(--toolary-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    opacity: 0;
  `;
  copyBtn.textContent = t('copyAgain', 'Copy');
  
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await copyText(item.content);
    showSuccess(t('copiedToClipboard', 'Copied to clipboard'));
  });
  
  // Hover effects
  itemEl.addEventListener('mouseenter', () => {
    itemEl.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    copyBtn.style.opacity = '1';
  });
  
  itemEl.addEventListener('mouseleave', () => {
    itemEl.style.backgroundColor = 'transparent';
    copyBtn.style.opacity = '0';
  });
  
  // Click to copy
  itemEl.addEventListener('click', async () => {
    await copyText(item.content);
    showSuccess(t('copiedToClipboard', 'Copied to clipboard'));
  });
  
  copyBtn.addEventListener('mouseenter', () => {
    copyBtn.style.backgroundColor = '#2563eb';
  });
  
  copyBtn.addEventListener('mouseleave', () => {
    copyBtn.style.backgroundColor = 'var(--toolary-primary, #3b82f6)';
  });
  
  // Assemble item
  itemEl.appendChild(header);
  itemEl.appendChild(content);
  itemEl.appendChild(copyBtn);
  
  return itemEl;
}

// Update history UI
function updateHistoryUI() {
  if (!sidebar || !sidebar.historyContainer) return;
  
  const container = sidebar.historyContainer;
  container.innerHTML = '';
  
  if (copyHistory.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      padding: 40px 20px;
      text-align: center;
      color: var(--toolary-text-secondary, #6b7280);
    `;
    
    const icon = createIconElement('clipboard-list', { size: 48, decorative: true });
    icon.style.cssText = `
      opacity: 0.3;
      margin-bottom: 16px;
    `;
    
    emptyState.appendChild(icon);
    
    const message = document.createElement('div');
    message.style.cssText = `
      font-size: 14px;
      margin-bottom: 8px;
    `;
    message.textContent = t('noItemsYet', 'No items yet');
    
    const hint = document.createElement('div');
    hint.style.cssText = `
      font-size: 12px;
      opacity: 0.7;
    `;
    hint.textContent = t('startCopyingHint', 'Start copying text to see it here');
    
    emptyState.appendChild(message);
    emptyState.appendChild(hint);
    container.appendChild(emptyState);
    return;
  }
  
  // Filter items based on search
  const searchTerm = sidebar.searchInput ? sidebar.searchInput.value.toLowerCase() : '';
  const filteredItems = copyHistory.filter(item => {
    if (!searchTerm) return true;
    const domain = item.domain ? item.domain.toLowerCase() : '';
    return item.content.toLowerCase().includes(searchTerm) ||
      item.preview.toLowerCase().includes(searchTerm) ||
      domain.includes(searchTerm);
  });
  
  // Create items
  filteredItems.forEach(item => {
    const itemEl = createHistoryItem(item);
    container.appendChild(itemEl);
  });
  
  // Update search functionality
  if (sidebar.searchInput && !sidebar.searchInput._toolaryBound) {
    sidebar.searchInput.addEventListener('input', () => {
      updateHistoryUI();
    });
    sidebar.searchInput._toolaryBound = true;
  }
}

// Clear all history
async function clearAllHistory() {
  try {
    copyHistory = [];
    await saveHistory();
    updateHistoryUI();
    updateFloatingWidgetBadge();
    lastClipboardText = '';
    showSuccess(t('historyCleared', 'History cleared'));
  } catch (error) {
    handleError(error, 'clearAllHistory');
    showError(t('clearHistoryError', 'Failed to clear history'));
  }
}

// Main activation function
export async function activate(deactivate) {
  try {
    console.log('Copy History Manager activated');
    
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    // Get current domain
    currentDomain = getCurrentDomain();
    lastSelection = '';
    lastContextLink = null;

    // Migrate any legacy per-domain records
    await migrateLegacyStorage();
    
    // Load existing history
    await loadHistory();
    
    // Create floating widget
    floatingWidget = createFloatingWidget();
    document.body.appendChild(floatingWidget);
    
    // Update widget badge
    updateFloatingWidgetBadge();
    
    // Open sidebar directly when activated from popup
    showPanel();
    
    // Add cleanup function
    cleanupFunctions.push(() => {
      stopMonitoring();
      
      if (floatingWidget && floatingWidget.parentNode) {
        floatingWidget.parentNode.removeChild(floatingWidget);
        floatingWidget = null;
      }
      
      hidePanel();
    });
    
    console.log(`Copy History Manager ready (active domain: ${currentDomain || 'unknown'})`);
    
  } catch (error) {
    handleError(error, 'copy-history-manager.activate');
    showError(t('activationError', 'Failed to activate Copy History Manager'));
    deactivate();
  }
}

// Deactivation function
export function deactivate() {
  console.log('Copy History Manager deactivated');
  
  // Run all cleanup functions
  cleanupFunctions.forEach(cleanup => {
    try {
      cleanup();
    } catch (error) {
      handleError(error, 'copy-history-manager.cleanup');
    }
  });
  
  cleanupFunctions = [];
  
  // Reset state
  isPanelOpen = false;
  isMonitoring = false;
  copyHistory = [];
  currentDomain = '';
  
}
