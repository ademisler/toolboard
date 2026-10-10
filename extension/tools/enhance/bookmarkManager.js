import { 
  showSuccess, 
  showError, 
  showInfo, 
  showWarning, 
  handleError, 
  sanitizeInput, 
  addEventListenerWithCleanup,
  debounce,
  generateId,
  t,
  ensureLanguageLoaded
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'bookmark-manager',
  name: 'Bookmark Manager',
  category: 'enhance',
  icon: 'bookmark',
  permissions: ['activeTab', 'storage', 'tabs'],
  tags: ['bookmarks', 'organize', 'save', 'productivity'],
  keywords: ['bookmark', 'save', 'organize', 'folder', 'tag', 'search']
};

// Storage key for bookmarks
const STORAGE_KEY = 'toolaryBookmarks';

// Default data structure
const DEFAULT_DATA = {
  bookmarks: [],
  folders: [],
  tags: []
};

// State management
let bookmarks = [];
let folders = [];
let tags = [];
let cleanupFunctions = [];
let floatingWidget = null;
let backdropClickArea = null;
let searchQuery = '';
let currentFilter = 'all'; // 'all', 'favorites', 'folder', 'tag'
let currentFolder = '';
let currentTag = '';

// UI state
let isPanelExpanded = false;
let isAddModalOpen = false;
let isEditModalOpen = false;
let editingBookmarkId = null;

// Load bookmarks from storage
async function loadBookmarks() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const data = result[STORAGE_KEY] || DEFAULT_DATA;
    
    bookmarks = data.bookmarks || [];
    folders = data.folders || [];
    tags = data.tags || [];
    
    console.log(`Bookmark Manager: Loaded ${bookmarks.length} bookmarks, ${folders.length} folders, ${tags.length} tags`);
    return true;
  } catch (error) {
    handleError(error, 'loadBookmarks');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToLoadBookmarks') : 'Failed to load bookmarks';
    showError(errorMessage);
    return false;
  }
}

// Save bookmarks to storage
async function saveBookmarks() {
  try {
    const data = {
      bookmarks,
      folders: [...new Set(folders)].sort(),
      tags: [...new Set(tags)].sort()
    };
    
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    console.log('Bookmark Manager: Saved bookmarks to storage');
    return true;
  } catch (error) {
    handleError(error, 'saveBookmarks');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToSaveBookmarks') : 'Failed to save bookmarks';
    showError(errorMessage);
    return false;
  }
}

// Generate unique ID
function generateBookmarkId() {
  return generateId('bookmark');
}

// Get current page info
async function getCurrentPageInfo() {
  try {
    // Check if we're in a content script context
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      if (!tab) {
        throw new Error('No active tab found');
      }
      
      return {
        title: tab.title || 'Untitled',
        url: tab.url,
        favicon: tab.favIconUrl || null
      };
    } else {
      // Fallback for content script context
      throw new Error('Chrome tabs API not available in content script');
    }
  } catch (error) {
    // Use document fallback when chrome.tabs API is not available
    console.debug('getCurrentPageInfo: Using document fallback', error.message);
    return {
      title: document.title || 'Untitled',
      url: window.location.href,
      favicon: null
    };
  }
}

// Detect bookmark type based on URL
function detectBookmarkType(url) {
  if (!url) return 'other';
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('vimeo.com')) return 'video';
  if (urlLower.includes('github.com') || urlLower.includes('stackoverflow.com')) return 'tool';
  if (urlLower.includes('medium.com') || urlLower.includes('dev.to') || urlLower.includes('blog')) return 'article';
  if (urlLower.includes('docs.') || urlLower.includes('documentation')) return 'docs';
  
  return 'article';
}

// Add new bookmark
async function addBookmark(bookmarkData) {
  try {
    const bookmark = {
      id: generateBookmarkId(),
      title: sanitizeInput(bookmarkData.title || ''),
      url: bookmarkData.url || '',
      folder: bookmarkData.folder || '',
      tags: (bookmarkData.tags || []).map(tag => sanitizeInput(tag.trim())).filter(tag => tag.length > 0),
      notes: sanitizeInput(bookmarkData.notes || ''),
      favicon: bookmarkData.favicon || null,
      addedAt: Date.now(),
      lastVisited: Date.now(),
      visitCount: 1,
      favorite: false,
      type: bookmarkData.type || 'article'
    };
    
    // Check for duplicates
    const existing = bookmarks.find(b => b.url === bookmark.url);
    if (existing) {
      const warningMessage = chrome.i18n ? chrome.i18n.getMessage('urlAlreadyBookmarked') : 'This URL is already bookmarked';
      showWarning(warningMessage);
      return false;
    }
    
    bookmarks.unshift(bookmark);
    
    // Update folders and tags
    if (bookmark.folder && !folders.includes(bookmark.folder)) {
      folders.push(bookmark.folder);
    }
    
    bookmark.tags.forEach(tag => {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    });
    
    await saveBookmarks();
    const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkAddedSuccessfully') : 'Bookmark added successfully!';
    showSuccess(message);
    
    // Show coffee message
    showCoffeeMessageForTool('bookmark-manager');
    renderBookmarkList();
    updateFloatingWidget();
    
    return true;
  } catch (error) {
    handleError(error, 'addBookmark');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToAddBookmark') : 'Failed to add bookmark';
    showError(message);
    return false;
  }
}

// Update existing bookmark
async function updateBookmark(id, bookmarkData) {
  try {
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) {
      const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkNotFound') : 'Bookmark not found';
    showError(message);
      return false;
    }
    
    const bookmark = bookmarks[index];
    const updatedBookmark = {
      ...bookmark,
      title: sanitizeInput(bookmarkData.title || bookmark.title),
      url: bookmarkData.url || bookmark.url,
      folder: bookmarkData.folder || bookmark.folder,
      tags: (bookmarkData.tags || bookmark.tags).map(tag => sanitizeInput(tag.trim())).filter(tag => tag.length > 0),
      notes: sanitizeInput(bookmarkData.notes || bookmark.notes),
      type: bookmarkData.type || bookmark.type
    };
    
    bookmarks[index] = updatedBookmark;
    
    // Update folders and tags
    if (updatedBookmark.folder && !folders.includes(updatedBookmark.folder)) {
      folders.push(updatedBookmark.folder);
    }
    
    updatedBookmark.tags.forEach(tag => {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    });
    
    await saveBookmarks();
    const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkUpdated') : 'Bookmark updated!';
    showSuccess(message);
    renderBookmarkList();
    
    return true;
  } catch (error) {
    handleError(error, 'updateBookmark');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToUpdateBookmark') : 'Failed to update bookmark';
    showError(message);
    return false;
  }
}

// Delete bookmark
async function deleteBookmark(id) {
  try {
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) {
      const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkNotFound') : 'Bookmark not found';
    showError(message);
      return false;
    }
    
    bookmarks.splice(index, 1);
    await saveBookmarks();
    const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkDeleted') : 'Bookmark deleted!';
    showSuccess(message);
    renderBookmarkList();
    updateFloatingWidget();
    
    return true;
  } catch (error) {
    handleError(error, 'deleteBookmark');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToDeleteBookmark') : 'Failed to delete bookmark';
    showError(message);
    return false;
  }
}

// Toggle favorite status
async function toggleFavorite(id) {
  try {
    const bookmark = bookmarks.find(b => b.id === id);
    if (!bookmark) {
      const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkNotFound') : 'Bookmark not found';
    showError(message);
      return false;
    }
    
    bookmark.favorite = !bookmark.favorite;
    await saveBookmarks();
    renderBookmarkList();
    updateFloatingWidget();
    
    return true;
  } catch (error) {
    handleError(error, 'toggleFavorite');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToUpdateFavoriteStatus') : 'Failed to update favorite status';
    showError(message);
    return false;
  }
}

// Search bookmarks
function searchBookmarks(query) {
  if (!query || query.trim() === '') {
    return bookmarks;
  }
  
  const normalized = query.toLowerCase().trim();
  return bookmarks.filter(bookmark => {
    return bookmark.title.toLowerCase().includes(normalized) ||
           bookmark.url.toLowerCase().includes(normalized) ||
           bookmark.tags.some(tag => tag.toLowerCase().includes(normalized)) ||
           bookmark.folder.toLowerCase().includes(normalized) ||
           (bookmark.notes && bookmark.notes.toLowerCase().includes(normalized));
  });
}

// Filter bookmarks by current filter
function getFilteredBookmarks() {
  let filtered = bookmarks;
  
  // Apply search filter
  if (searchQuery) {
    filtered = searchBookmarks(searchQuery);
  }
  
  // Apply category filter
  switch (currentFilter) {
    case 'favorites':
      filtered = filtered.filter(b => b.favorite);
      break;
    case 'folder':
      if (currentFolder) {
        filtered = filtered.filter(b => b.folder === currentFolder);
      }
      break;
    case 'tag':
      if (currentTag) {
        filtered = filtered.filter(b => b.tags.includes(currentTag));
      }
      break;
  }
  
  return filtered;
}

// Export bookmarks
function exportBookmarks() {
  try {
    const exportData = {
      version: '1.0',
      exported: Date.now(),
      bookmarks,
      folders,
      tags
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toolary-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    const message = chrome.i18n ? chrome.i18n.getMessage('bookmarksExportedSuccessfully') : 'Bookmarks exported successfully!';
    showSuccess(message);
  } catch (error) {
    handleError(error, 'exportBookmarks');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToExportBookmarks') : 'Failed to export bookmarks';
    showError(message);
  }
}

// Import bookmarks
async function importBookmarks(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
      throw new Error('Invalid bookmark file format');
    }
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const bookmark of data.bookmarks) {
      const existing = bookmarks.find(b => b.url === bookmark.url);
      if (existing) {
        skippedCount++;
        continue;
      }
      
      const newBookmark = {
        id: generateBookmarkId(),
        title: sanitizeInput(bookmark.title || ''),
        url: bookmark.url || '',
        folder: bookmark.folder || '',
        tags: (bookmark.tags || []).map(tag => sanitizeInput(tag.trim())).filter(tag => tag.length > 0),
        notes: sanitizeInput(bookmark.notes || ''),
        favicon: bookmark.favicon || null,
        addedAt: bookmark.addedAt || Date.now(),
        lastVisited: Date.now(),
        visitCount: 1,
        favorite: bookmark.favorite || false,
        type: bookmark.type || 'article'
      };
      
      bookmarks.push(newBookmark);
      importedCount++;
    }
    
    // Import folders and tags
    if (data.folders && Array.isArray(data.folders)) {
      data.folders.forEach(folder => {
        if (!folders.includes(folder)) {
          folders.push(folder);
        }
      });
    }
    
    if (data.tags && Array.isArray(data.tags)) {
      data.tags.forEach(tag => {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      });
    }
    
    await saveBookmarks();
    const skippedText = skippedCount > 0 ? `, skipped ${skippedCount} duplicates` : '';
    const message = chrome.i18n ? chrome.i18n.getMessage('importedBookmarks', [importedCount, skippedText]) : `Imported ${importedCount} bookmarks${skippedText}`;
    showSuccess(message);
    renderBookmarkList();
    updateFloatingWidget();
    
  } catch (error) {
    handleError(error, 'importBookmarks');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToImportBookmarks') : 'Failed to import bookmarks. Please check the file format.';
    showError(message);
  }
}

// Create floating widget
function createFloatingWidget() {
  const widget = document.createElement('div');
  widget.id = 'toolary-bookmark-widget';
  widget.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    background: var(--toolary-primary-color, #007bff);
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: pointer;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    border: 2px solid var(--toolary-bg, #fff);
  `;
  
  const icon = createIconElement('bookmark', { size: 24, decorative: true });
  if (icon) {
    icon.style.color = '#fff';
    widget.appendChild(icon);
  }
  
  // Add badge for bookmark count
  const badge = document.createElement('div');
  badge.id = 'toolary-bookmark-badge';
  badge.style.cssText = `
    position: absolute;
    top: -5px;
    right: -5px;
    background: var(--toolary-error-color, #dc3545);
    color: #fff;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--toolary-bg, #fff);
  `;
  widget.appendChild(badge);
  
  // Event listeners
  const cleanupClick = addEventListenerWithCleanup(widget, 'click', (e) => {
    e.stopPropagation();
    togglePanel();
  });
  
  const cleanupHover = addEventListenerWithCleanup(widget, 'mouseenter', () => {
    widget.style.transform = 'scale(1.1)';
    widget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  });
  
  const cleanupLeave = addEventListenerWithCleanup(widget, 'mouseleave', () => {
    widget.style.transform = 'scale(1)';
    widget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  });
  
  cleanupFunctions.push(cleanupClick, cleanupHover, cleanupLeave);
  
  return widget;
}

// Update floating widget badge
function updateFloatingWidget() {
  const badge = document.getElementById('toolary-bookmark-badge');
  if (badge) {
    badge.textContent = bookmarks.length;
    badge.style.display = bookmarks.length > 0 ? 'flex' : 'none';
  }
}

// Toggle panel visibility
function togglePanel() {
  if (isPanelExpanded) {
    hidePanel();
  } else {
    showPanel();
  }
}

// Show bookmark panel
function showPanel() {
  if (isPanelExpanded) return;
  
  isPanelExpanded = true;
  createBookmarkPanel();
  
  // Add backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'toolary-bookmark-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    z-index: 2147483645;
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
    z-index: 2147483644;
    pointer-events: auto;
    background: transparent;
  `;
  
  const cleanupBackdrop = addEventListenerWithCleanup(backdropClickArea, 'click', () => {
    hidePanel();
  });
  
  cleanupFunctions.push(cleanupBackdrop);
  document.body.appendChild(backdropClickArea);
  document.body.appendChild(backdrop);
}

// Hide bookmark panel
function hidePanel() {
  if (!isPanelExpanded) return;
  
  isPanelExpanded = false;
  
  // Remove click area first
  if (backdropClickArea && backdropClickArea.parentNode) {
    backdropClickArea.parentNode.removeChild(backdropClickArea);
  }
  
  const panel = document.getElementById('toolary-bookmark-panel');
  const backdrop = document.getElementById('toolary-bookmark-backdrop');
  
  if (panel) panel.remove();
  if (backdrop) backdrop.remove();
  
  backdropClickArea = null;
}

// Create bookmark panel
function createBookmarkPanel() {
  const panel = document.createElement('div');
  panel.id = 'toolary-bookmark-panel';
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
  
  // Add animation styles
  if (!document.querySelector('#toolary-bookmark-animations')) {
    const style = document.createElement('style');
    style.id = 'toolary-bookmark-animations';
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
  
  const titleIcon = createIconElement('bookmark', { size: 18, decorative: true });
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(t('bookmarkManager')));
  
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
  
  // Search bar
  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--toolary-border, #eee);
  `;
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = t('searchBookmarks', 'Search bookmarks...');
  searchInput.value = searchQuery;
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
  `;
  
  const debouncedSearch = debounce((query) => {
    searchQuery = query;
    renderBookmarkList();
  }, 300);
  
  const cleanupSearch = addEventListenerWithCleanup(searchInput, 'input', (e) => {
    debouncedSearch(e.target.value);
  });
  cleanupFunctions.push(cleanupSearch);
  
  searchContainer.appendChild(searchInput);
  
  // Filter buttons
  const filterContainer = document.createElement('div');
  filterContainer.style.cssText = `
    padding: 12px 20px;
    border-bottom: 1px solid var(--toolary-border, #eee);
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  `;
  
  const filterButtons = [
    { id: 'all', label: t('all'), icon: 'list' },
    { id: 'favorites', label: t('favorites'), icon: 'star' },
    { id: 'folder', label: t('folders'), icon: 'folder' },
    { id: 'tag', label: t('tags'), icon: 'tag' }
  ];
  
  filterButtons.forEach(filter => {
    const btn = document.createElement('button');
    btn.id = `filter-${filter.id}`;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 16px;
      background: ${currentFilter === filter.id ? 'var(--toolary-primary-color, #007bff)' : 'var(--toolary-bg, #fff)'};
      color: ${currentFilter === filter.id ? '#fff' : 'var(--toolary-text, #333)'};
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    
    btn.appendChild(createIconElement(filter.icon, { size: 14, decorative: true }));
    btn.appendChild(document.createTextNode(filter.label));
    
    const cleanupFilter = addEventListenerWithCleanup(btn, 'click', () => {
      currentFilter = filter.id;
      currentFolder = '';
      currentTag = '';
      renderFilterButtons();
      renderBookmarkList();
    });
    cleanupFunctions.push(cleanupFilter);
    
    filterContainer.appendChild(btn);
  });
  
  // Content area
  const content = document.createElement('div');
  content.id = 'toolary-bookmark-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 0;
  `;
  
  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 16px 20px;
    border-top: 1px solid var(--toolary-border, #eee);
    display: flex;
    gap: 8px;
    background: var(--toolary-header-bg, #f8f9fa);
  `;
  
  const addBtn = document.createElement('button');
  addBtn.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  addBtn.appendChild(createIconElement('plus', { size: 16, decorative: true }));
  addBtn.appendChild(document.createTextNode(t('addBookmark')));
  
  const cleanupAdd = addEventListenerWithCleanup(addBtn, 'click', () => {
    showAddModal();
  });
  cleanupFunctions.push(cleanupAdd);
  
  const exportBtn = document.createElement('button');
  exportBtn.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    background: var(--toolary-button-bg, #f0f0f0);
    color: var(--toolary-text, #333);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  exportBtn.appendChild(createIconElement('download', { size: 16, decorative: true }));
  
  const cleanupExport = addEventListenerWithCleanup(exportBtn, 'click', () => {
    exportBookmarks();
  });
  cleanupFunctions.push(cleanupExport);
  
  const importBtn = document.createElement('button');
  importBtn.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    background: var(--toolary-button-bg, #f0f0f0);
    color: var(--toolary-text, #333);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  importBtn.appendChild(createIconElement('upload', { size: 16, decorative: true }));
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  
  const cleanupImport = addEventListenerWithCleanup(importBtn, 'click', () => {
    fileInput.click();
  });
  
  const cleanupFile = addEventListenerWithCleanup(fileInput, 'change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importBookmarks(file);
    }
  });
  
  cleanupFunctions.push(cleanupImport, cleanupFile);
  
  footer.appendChild(addBtn);
  footer.appendChild(exportBtn);
  footer.appendChild(importBtn);
  footer.appendChild(fileInput);
  
  // Assemble panel
  panel.appendChild(header);
  panel.appendChild(searchContainer);
  panel.appendChild(filterContainer);
  panel.appendChild(content);
  panel.appendChild(footer);
  
  document.body.appendChild(panel);
  
  // Render initial content
  renderFilterButtons();
  renderBookmarkList();
  
  // bookmarkPanel = panel;
}

// Render filter buttons
function renderFilterButtons() {
  const filterButtons = document.querySelectorAll('[id^="filter-"]');
  filterButtons.forEach(btn => {
    const filterId = btn.id.replace('filter-', '');
    const isActive = currentFilter === filterId;
    
    btn.style.background = isActive ? 'var(--toolary-primary-color, #007bff)' : 'var(--toolary-bg, #fff)';
    btn.style.color = isActive ? '#fff' : 'var(--toolary-text, #333)';
  });
}

// Render bookmark list
function renderBookmarkList() {
  const content = document.getElementById('toolary-bookmark-content');
  if (!content) return;
  
  const filteredBookmarks = getFilteredBookmarks();
  
  if (filteredBookmarks.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      padding: 40px 20px;
      text-align: center;
      color: var(--toolary-secondary-text, #666);
    `;
    
    if (searchQuery) {
      emptyState.textContent = t('noBookmarksFound', 'No bookmarks found matching your search');
    } else if (currentFilter === 'favorites') {
      emptyState.textContent = t('noFavoriteBookmarksYet', 'No favorite bookmarks yet');
    } else {
      emptyState.textContent = t('noBookmarksYet', 'No bookmarks yet. Click + to add your first bookmark!');
    }
    
    content.innerHTML = '';
    content.appendChild(emptyState);
    return;
  }
  
  // Group by folder if showing all bookmarks
  let groupedBookmarks = filteredBookmarks;
  if (currentFilter === 'all' && !searchQuery) {
    const groups = {};
    filteredBookmarks.forEach(bookmark => {
      const folder = bookmark.folder || 'Unorganized';
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(bookmark);
    });
    
    groupedBookmarks = Object.entries(groups).map(([folder, bookmarks]) => ({
      type: 'folder',
      name: folder,
      bookmarks
    }));
  }
  
  content.innerHTML = '';
  
  groupedBookmarks.forEach(group => {
    if (group.type === 'folder') {
      // Folder group
      const folderHeader = document.createElement('div');
      folderHeader.style.cssText = `
        padding: 12px 20px 8px;
        background: var(--toolary-code-bg, #f8f9fa);
        border-bottom: 1px solid var(--toolary-border, #eee);
        font-weight: 600;
        font-size: 14px;
        color: var(--toolary-text, #333);
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      
      folderHeader.appendChild(createIconElement('folder', { size: 16, decorative: true }));
      folderHeader.appendChild(document.createTextNode(`${group.name} (${group.bookmarks.length})`));
      
      content.appendChild(folderHeader);
      
      group.bookmarks.forEach(bookmark => {
        content.appendChild(createBookmarkCard(bookmark));
      });
    } else {
      // Individual bookmark
      content.appendChild(createBookmarkCard(group));
    }
  });
}

// Create bookmark card
function createBookmarkCard(bookmark) {
  const card = document.createElement('div');
  card.style.cssText = `
    padding: 12px 20px;
    border-bottom: 1px solid var(--toolary-border, #eee);
    cursor: pointer;
    transition: background-color 0.2s ease;
    position: relative;
  `;
  
  const cleanupHover = addEventListenerWithCleanup(card, 'mouseenter', () => {
    card.style.backgroundColor = 'rgba(0,0,0,0.04)';
  });
  
  const cleanupLeave = addEventListenerWithCleanup(card, 'mouseleave', () => {
    card.style.backgroundColor = '';
  });
  
  cleanupFunctions.push(cleanupHover, cleanupLeave);
  
  // Title
  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    color: var(--toolary-text, #333);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const typeIcon = createIconElement(getBookmarkTypeIcon(bookmark.type), { size: 14, decorative: true });
  title.appendChild(typeIcon);
  title.appendChild(document.createTextNode(bookmark.title));
  
  // URL
  const url = document.createElement('div');
  url.style.cssText = `
    font-size: 12px;
    color: var(--toolary-secondary-text, #666);
    margin-bottom: 6px;
    word-break: break-all;
  `;
  url.textContent = bookmark.url;
  
  // Tags
  if (bookmark.tags && bookmark.tags.length > 0) {
    const tagsContainer = document.createElement('div');
    tagsContainer.style.cssText = `
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    `;
    
    bookmark.tags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.style.cssText = `
        background: var(--toolary-primary-color, #007bff);
        color: #fff;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 500;
      `;
      tagEl.textContent = tag;
      tagsContainer.appendChild(tagEl);
    });
    
    card.appendChild(tagsContainer);
  }
  
  // Actions
  const actions = document.createElement('div');
  actions.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;
  
  const cleanupCardHover = addEventListenerWithCleanup(card, 'mouseenter', () => {
    actions.style.opacity = '1';
  });
  
  const cleanupCardLeave = addEventListenerWithCleanup(card, 'mouseleave', () => {
    actions.style.opacity = '0';
  });
  
  cleanupFunctions.push(cleanupCardHover, cleanupCardLeave);
  
  // Favorite button
  const favBtn = document.createElement('button');
  favBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: ${bookmark.favorite ? 'var(--toolary-warning-color, #ffc107)' : 'var(--toolary-secondary-text, #666)'};
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  favBtn.appendChild(createIconElement('star', { size: 14, decorative: true }));
  
  const cleanupFav = addEventListenerWithCleanup(favBtn, 'click', (e) => {
    e.stopPropagation();
    toggleFavorite(bookmark.id);
  });
  cleanupFunctions.push(cleanupFav);
  
  // Edit button
  const editBtn = document.createElement('button');
  editBtn.style.cssText = `
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
  editBtn.appendChild(createIconElement('edit', { size: 14, decorative: true }));
  
  const cleanupEdit = addEventListenerWithCleanup(editBtn, 'click', (e) => {
    e.stopPropagation();
    showEditModal(bookmark);
  });
  cleanupFunctions.push(cleanupEdit);
  
  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--toolary-error-color, #dc3545);
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  deleteBtn.appendChild(createIconElement('trash', { size: 14, decorative: true }));
  
  const cleanupDelete = addEventListenerWithCleanup(deleteBtn, 'click', (e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this bookmark?')) {
      deleteBookmark(bookmark.id);
    }
  });
  cleanupFunctions.push(cleanupDelete);
  
  actions.appendChild(favBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  
  // Main click handler
  const cleanupClick = addEventListenerWithCleanup(card, 'click', () => {
    // Open bookmark in new tab
    window.open(bookmark.url, '_blank');
    
    // Update visit count
    bookmark.lastVisited = Date.now();
    bookmark.visitCount = (bookmark.visitCount || 0) + 1;
    saveBookmarks();
  });
  cleanupFunctions.push(cleanupClick);
  
  card.appendChild(title);
  card.appendChild(url);
  card.appendChild(actions);
  
  return card;
}

// Get bookmark type icon
function getBookmarkTypeIcon(type) {
  const typeIcons = {
    article: 'file-text',
    video: 'play',
    tool: 'wrench',
    docs: 'book',
    other: 'link'
  };
  return typeIcons[type] || 'link';
}

// Show add bookmark modal
async function showAddModal() {
  if (isAddModalOpen) return;
  
  isAddModalOpen = true;
  
  try {
    const pageInfo = await getCurrentPageInfo();
    
    const modal = document.createElement('div');
    modal.id = 'toolary-bookmark-add-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 2147483648;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: toolary-fade-in 0.3s ease-out;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--toolary-bg, #fff);
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--toolary-text, #333);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    title.appendChild(createIconElement('bookmark', { size: 20, decorative: true }));
    title.appendChild(document.createTextNode(t('addBookmark')));
    
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      color: var(--toolary-secondary-text, #666);
    `;
    closeBtn.appendChild(createIconElement('close', { size: 18, decorative: true }));
    
    const cleanupClose = addEventListenerWithCleanup(closeBtn, 'click', () => {
      hideAddModal();
    });
    cleanupFunctions.push(cleanupClose);
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Form
    const form = document.createElement('form');
    form.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;
    
    // Title field
    const titleGroup = document.createElement('div');
    titleGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
    
    const titleLabel = document.createElement('label');
    titleLabel.textContent = t('title', 'Title');
    titleLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
    
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = pageInfo.title;
    titleInput.required = true;
    titleInput.style.cssText = `
      padding: 8px 12px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 6px;
      font-size: 14px;
      background: var(--toolary-bg, #fff);
      color: var(--toolary-text, #333);
    `;
    
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    
    // URL field
    const urlGroup = document.createElement('div');
    urlGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
    
    const urlLabel = document.createElement('label');
    urlLabel.textContent = t('url', 'URL');
    urlLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
    
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.value = pageInfo.url;
    urlInput.required = true;
    urlInput.style.cssText = `
      padding: 8px 12px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 6px;
      font-size: 14px;
      background: var(--toolary-bg, #fff);
      color: var(--toolary-text, #333);
    `;
    
    urlGroup.appendChild(urlLabel);
    urlGroup.appendChild(urlInput);
    
    // Folder field
    const folderGroup = document.createElement('div');
    folderGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
    
    const folderLabel = document.createElement('label');
    folderLabel.textContent = t('folder', 'Folder');
    folderLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
    
    const folderInput = document.createElement('input');
    folderInput.type = 'text';
    folderInput.placeholder = t('folderPlaceholder', 'e.g., Work/Projects');
    folderInput.style.cssText = `
      padding: 8px 12px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 6px;
      font-size: 14px;
      background: var(--toolary-bg, #fff);
      color: var(--toolary-text, #333);
    `;
    
    folderGroup.appendChild(folderLabel);
    folderGroup.appendChild(folderInput);
    
    // Tags field
    const tagsGroup = document.createElement('div');
    tagsGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
    
    const tagsLabel = document.createElement('label');
    tagsLabel.textContent = t('tagsCommaSeparated', 'Tags (comma-separated)');
    tagsLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
    
    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.placeholder = t('tagsPlaceholder', 'e.g., javascript, tools, tutorial');
    tagsInput.style.cssText = `
      padding: 8px 12px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 6px;
      font-size: 14px;
      background: var(--toolary-bg, #fff);
      color: var(--toolary-text, #333);
    `;
    
    tagsGroup.appendChild(tagsLabel);
    tagsGroup.appendChild(tagsInput);
    
    // Notes field
    const notesGroup = document.createElement('div');
    notesGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
    
    const notesLabel = document.createElement('label');
    notesLabel.textContent = t('notes', 'Notes');
    notesLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
    
    const notesInput = document.createElement('textarea');
    notesInput.placeholder = t('notesPlaceholder', 'Optional notes about this bookmark...');
    notesInput.rows = 3;
    notesInput.style.cssText = `
      padding: 8px 12px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 6px;
      font-size: 14px;
      background: var(--toolary-bg, #fff);
      color: var(--toolary-text, #333);
      resize: vertical;
      font-family: inherit;
    `;
    
    notesGroup.appendChild(notesLabel);
    notesGroup.appendChild(notesInput);
    
    // Buttons
    const buttons = document.createElement('div');
    buttons.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 8px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('cancel', 'Cancel');
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 6px;
      background: var(--toolary-button-bg, #f0f0f0);
      color: var(--toolary-text, #333);
      cursor: pointer;
      font-size: 14px;
    `;
    
    const cleanupCancel = addEventListenerWithCleanup(cancelBtn, 'click', () => {
      hideAddModal();
    });
    cleanupFunctions.push(cleanupCancel);
    
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = t('addBookmark', 'Add Bookmark');
    saveBtn.style.cssText = `
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      background: var(--toolary-primary-color, #007bff);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    `;
    
    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    
    // Form submission
    const cleanupSubmit = addEventListenerWithCleanup(form, 'submit', async (e) => {
      e.preventDefault();
      
      const bookmarkData = {
        title: titleInput.value.trim(),
        url: urlInput.value.trim(),
        folder: folderInput.value.trim(),
        tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
        notes: notesInput.value.trim(),
        favicon: pageInfo.favicon,
        type: detectBookmarkType(urlInput.value)
      };
      
      if (await addBookmark(bookmarkData)) {
        hideAddModal();
      }
    });
    cleanupFunctions.push(cleanupSubmit);
    
    form.appendChild(titleGroup);
    form.appendChild(urlGroup);
    form.appendChild(folderGroup);
    form.appendChild(tagsGroup);
    form.appendChild(notesGroup);
    form.appendChild(buttons);
    
    dialog.appendChild(header);
    dialog.appendChild(form);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
  } catch (error) {
    handleError(error, 'showAddModal');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToOpenAddBookmarkDialog') : 'Failed to open add bookmark dialog';
    showError(message);
    isAddModalOpen = false;
  }
}

// Hide add bookmark modal
function hideAddModal() {
  const modal = document.getElementById('toolary-bookmark-add-modal');
  if (modal) {
    modal.remove();
  }
  isAddModalOpen = false;
}

// Show edit bookmark modal
function showEditModal(bookmark) {
  if (isEditModalOpen) return;
  
  isEditModalOpen = true;
  editingBookmarkId = bookmark.id;
  
  const modal = document.createElement('div');
  modal.id = 'toolary-bookmark-edit-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 2147483648;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: toolary-fade-in 0.3s ease-out;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  `;
  
  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  title.appendChild(createIconElement('edit', { size: 20, decorative: true }));
  title.appendChild(document.createTextNode(t('editBookmark')));
  
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--toolary-secondary-text, #666);
  `;
  closeBtn.appendChild(createIconElement('close', { size: 18, decorative: true }));
  
  const cleanupClose = addEventListenerWithCleanup(closeBtn, 'click', () => {
    hideEditModal();
  });
  cleanupFunctions.push(cleanupClose);
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Form (similar to add modal but with existing values)
  const form = document.createElement('form');
  form.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
  `;
  
  // Title field
  const titleGroup = document.createElement('div');
  titleGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
  
  const titleLabel = document.createElement('label');
  titleLabel.textContent = t('title', 'Title');
  titleLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
  
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = bookmark.title;
  titleInput.required = true;
  titleInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
  `;
  
  titleGroup.appendChild(titleLabel);
  titleGroup.appendChild(titleInput);
  
  // URL field
  const urlGroup = document.createElement('div');
  urlGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
  
  const urlLabel = document.createElement('label');
  urlLabel.textContent = t('url', 'URL');
  urlLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
  
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.value = bookmark.url;
  urlInput.required = true;
  urlInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
  `;
  
  urlGroup.appendChild(urlLabel);
  urlGroup.appendChild(urlInput);
  
  // Folder field
  const folderGroup = document.createElement('div');
  folderGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
  
  const folderLabel = document.createElement('label');
  folderLabel.textContent = t('folder', 'Folder');
  folderLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
  
  const folderInput = document.createElement('input');
  folderInput.type = 'text';
  folderInput.value = bookmark.folder;
  folderInput.placeholder = t('folderPlaceholder', 'e.g., Work/Projects');
  folderInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
  `;
  
  folderGroup.appendChild(folderLabel);
  folderGroup.appendChild(folderInput);
  
  // Tags field
  const tagsGroup = document.createElement('div');
  tagsGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
  
  const tagsLabel = document.createElement('label');
  tagsLabel.textContent = t('tagsCommaSeparated', 'Tags (comma-separated)');
  tagsLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
  
  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.value = bookmark.tags.join(', ');
  tagsInput.placeholder = t('tagsPlaceholder', 'e.g., javascript, tools, tutorial');
  tagsInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
  `;
  
  tagsGroup.appendChild(tagsLabel);
  tagsGroup.appendChild(tagsInput);
  
  // Notes field
  const notesGroup = document.createElement('div');
  notesGroup.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;
  
  const notesLabel = document.createElement('label');
  notesLabel.textContent = t('notes', 'Notes');
  notesLabel.style.cssText = `font-weight: 600; color: var(--toolary-text, #333);`;
  
  const notesInput = document.createElement('textarea');
  notesInput.value = bookmark.notes;
  notesInput.placeholder = t('notesPlaceholder', 'Optional notes about this bookmark...');
  notesInput.rows = 3;
  notesInput.style.cssText = `
    padding: 8px 12px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    font-size: 14px;
    background: var(--toolary-bg, #fff);
    color: var(--toolary-text, #333);
    resize: vertical;
    font-family: inherit;
  `;
  
  notesGroup.appendChild(notesLabel);
  notesGroup.appendChild(notesInput);
  
  // Buttons
  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 8px;
  `;
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = t('cancel', 'Cancel');
  cancelBtn.style.cssText = `
    padding: 10px 20px;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 6px;
    background: var(--toolary-button-bg, #f0f0f0);
    color: var(--toolary-text, #333);
    cursor: pointer;
    font-size: 14px;
  `;
  
  const cleanupCancel = addEventListenerWithCleanup(cancelBtn, 'click', () => {
    hideEditModal();
  });
  cleanupFunctions.push(cleanupCancel);
  
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = t('updateBookmark', 'Update Bookmark');
  saveBtn.style.cssText = `
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  `;
  
  buttons.appendChild(cancelBtn);
  buttons.appendChild(saveBtn);
  
  // Form submission
  const cleanupSubmit = addEventListenerWithCleanup(form, 'submit', async (e) => {
    e.preventDefault();
    
    const bookmarkData = {
      title: titleInput.value.trim(),
      url: urlInput.value.trim(),
      folder: folderInput.value.trim(),
      tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
      notes: notesInput.value.trim(),
      type: detectBookmarkType(urlInput.value)
    };
    
    if (await updateBookmark(editingBookmarkId, bookmarkData)) {
      hideEditModal();
    }
  });
  cleanupFunctions.push(cleanupSubmit);
  
  form.appendChild(titleGroup);
  form.appendChild(urlGroup);
  form.appendChild(folderGroup);
  form.appendChild(tagsGroup);
  form.appendChild(notesGroup);
  form.appendChild(buttons);
  
  dialog.appendChild(header);
  dialog.appendChild(form);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
}

// Hide edit bookmark modal
function hideEditModal() {
  const modal = document.getElementById('toolary-bookmark-edit-modal');
  if (modal) {
    modal.remove();
  }
  isEditModalOpen = false;
  editingBookmarkId = null;
}

// Main activation function
export async function activate(deactivate) {
  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    // Store deactivate callback for cleanup
    // const deactivateCb = deactivate;
    
    console.log('Bookmark Manager: Activating...');
    
    // Load existing bookmarks
    const loaded = await loadBookmarks();
    if (!loaded) {
      const message = chrome.i18n ? chrome.i18n.getMessage('failedToLoadBookmarks') : 'Failed to load bookmarks';
    showError(message);
      deactivate();
      return;
    }
    
    // Create floating widget
    floatingWidget = createFloatingWidget();
    document.body.appendChild(floatingWidget);
    
    // Update widget badge
    updateFloatingWidget();
    
    // Show panel directly on activation
    showPanel();
    
    const message = chrome.i18n ? chrome.i18n.getMessage('bookmarkManagerActivated') : 'Bookmark Manager activated. Click the bookmark icon to manage your bookmarks!';
    showInfo(message);
    
  } catch (error) {
    handleError(error, 'bookmarkManager activation');
    const message = chrome.i18n ? chrome.i18n.getMessage('failedToActivateBookmarkManager') : 'Failed to activate Bookmark Manager';
    showError(message);
    deactivate();
  }
}

// Main deactivation function
export function deactivate() {
  try {
    console.log('Bookmark Manager: Deactivating...');
    
    // Cleanup all event listeners
    cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        handleError(error, 'event listener cleanup');
      }
    });
    cleanupFunctions.length = 0;
    
    // Remove UI elements
    if (floatingWidget) {
      floatingWidget.remove();
      floatingWidget = null;
    }
    
    hidePanel();
    hideAddModal();
    hideEditModal();
    
    // Reset state
    isPanelExpanded = false;
    isAddModalOpen = false;
    isEditModalOpen = false;
    editingBookmarkId = null;
    searchQuery = '';
    currentFilter = 'all';
    currentFolder = '';
    currentTag = '';
    backdropClickArea = null;
    
    console.log('Bookmark Manager: Deactivated');
    
  } catch (error) {
    handleError(error, 'bookmarkManager deactivation');
  }
}
