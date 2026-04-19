import { showSuccess, showError, handleError, safeExecute, sanitizeInput, renderIcon, normalizeUrlForStorage, t, ensureLanguageLoaded } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'sticky-notes-picker',
  name: 'Sticky Notes',
  category: 'enhance',
  icon: 'notes',
  permissions: ['activeTab', 'storage'],
  tags: ['notes', 'storage', 'productivity'],
  keywords: ['sticky', 'notes', 'annotate', 'save']
};

let deactivateCb;
let notes = [];
let noteCounter = 0;
let cleanupFunctions = []; // Array to store cleanup functions for event listeners

// Default note colors
const NOTE_COLORS = [
  { name: 'Yellow', value: '#fff3cd' },
  { name: 'Green', value: '#d4edda' },
  { name: 'Blue', value: '#d1ecf1' },
  { name: 'Pink', value: '#f8d7da' },
  { name: 'Purple', value: '#e2e3f1' },
  { name: 'Orange', value: '#ffeaa7' },
  { name: 'Gray', value: '#f8f9fa' }
];

const STORAGE_PREFIX = 'toolaryStickyNotes_';
const LEGACY_STORAGE_PREFIX = 'stickyNotes_';
const STORAGE_INDEX_KEY = 'toolaryStickyNotesIndex';

function getSiteStorageKey(url) {
  const normalizedUrl = normalizeUrlForStorage(url);
  const keySuffix = normalizedUrl || 'global';
  return `${STORAGE_PREFIX}${keySuffix}`;
}

function getLegacyStorageKey(url) {
  return `${LEGACY_STORAGE_PREFIX}${sanitizeInput(url)}`;
}

function isNotesStorageKey(key) {
  return key.startsWith(STORAGE_PREFIX) || key.startsWith(LEGACY_STORAGE_PREFIX);
}

function getNormalizedCurrentUrl() {
  const currentUrl = safeExecute(() => window.location.href, 'get location href') || '';
  return normalizeUrlForStorage(currentUrl);
}

function normalizeSiteStorageKeys(keys = []) {
  const valid = keys.filter((key) => typeof key === 'string' && key.startsWith(STORAGE_PREFIX));
  return Array.from(new Set(valid));
}

async function readIndexedSiteKeys() {
  const indexData = await chrome.storage.local.get([STORAGE_INDEX_KEY]);
  return normalizeSiteStorageKeys(indexData?.[STORAGE_INDEX_KEY] || []);
}

async function writeIndexedSiteKeys(keys = []) {
  const normalized = normalizeSiteStorageKeys(keys);
  await chrome.storage.local.set({ [STORAGE_INDEX_KEY]: normalized });
  return normalized;
}

async function getNoteStorageKeys() {
  const indexedKeys = await readIndexedSiteKeys();
  if (indexedKeys.length > 0) {
    return indexedKeys;
  }

  const allData = await chrome.storage.local.get();
  const discoveredKeys = Object.keys(allData).filter((key) => key.startsWith(STORAGE_PREFIX));
  await writeIndexedSiteKeys(discoveredKeys);
  return discoveredKeys;
}

async function trackSiteStorageKey(siteKey) {
  if (!siteKey || !siteKey.startsWith(STORAGE_PREFIX)) return;
  const indexed = await readIndexedSiteKeys();
  if (!indexed.includes(siteKey)) {
    indexed.push(siteKey);
    await writeIndexedSiteKeys(indexed);
  }
}

async function untrackSiteStorageKey(siteKey) {
  if (!siteKey || !siteKey.startsWith(STORAGE_PREFIX)) return;
  const indexed = await readIndexedSiteKeys();
  const nextKeys = indexed.filter((key) => key !== siteKey);
  if (nextKeys.length !== indexed.length) {
    await writeIndexedSiteKeys(nextKeys);
  }
}

export async function activate(deactivate) {
  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    deactivateCb = deactivate;
    
    // Get current site URL (not just origin)
    const currentUrl = safeExecute(() => window.location.href, 'get location href') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(currentUrl);

    console.log('Sticky notes activated for URL:', normalizedCurrentUrl || currentUrl);
    
    // Load existing notes for current site only
    loadNotes().then(async () => {
      // Auto-open existing notes for this site
      await loadExistingNotesForCurrentSite();
      
      // Only show manager if there are notes for this site
      const currentSiteNotes = notes.filter(note => {
        return normalizeUrlForStorage(note.siteUrl) === normalizedCurrentUrl;
      });

      console.log(`Found ${currentSiteNotes.length} notes for current URL`);
      
      if (currentSiteNotes.length > 0) {
        showNotesManager();
      } else {
        // No notes for this site, show manager anyway so user can create new notes
        showNotesManager();
        // Show a helpful message
        const successMessage = chrome.i18n ? chrome.i18n.getMessage('noExistingNotesFound') : 'No existing notes found for this page. You can create new notes by clicking on the page.';
        showSuccess(successMessage);
      }
    }).catch(error => {
      handleError(error, 'stickyNotesPicker activation loadNotes');
      const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToLoadExistingNotes') : 'Failed to load existing notes. Please try again.';
      showError(errorMessage);
      deactivate();
    });
  } catch (error) {
    handleError(error, 'stickyNotesPicker activation');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateStickyNotes') : 'Failed to activate sticky notes. Please try again.';
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
    
    // Remove any existing note managers
    const existingManager = safeExecute(() => document.getElementById('toolary-notes-manager'), 'get notes manager');
    if (existingManager) {
      existingManager.remove();
    }
    
    // Clean up global window pollution
    if (typeof window !== 'undefined') {
      delete window.deleteIndividualNote;
      delete window.deleteAllNotes;
      delete window.createStickyNote;
      delete window.showNotesManager;
    }
    
    // Don't remove sticky notes from page - they should persist
    // Only call deactivateCb if it exists and we haven't called it yet
    if (deactivateCb && !deactivateCb.called) {
      deactivateCb.called = true;
      deactivateCb();
    }
  } catch (error) {
    handleError(error, 'stickyNotesPicker deactivation');
  }
}

// Create a new sticky note with enhanced error handling
function createStickyNote(x, y, color = NOTE_COLORS[0].value) {
  try {
    const noteId = `note-${++noteCounter}`;
    const currentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const note = {
      id: sanitizeInput(noteId),
      x: safeExecute(() => Math.max(0, Math.min(window.innerWidth - 250, x)), 'constrain x') || 0,
      y: safeExecute(() => Math.max(0, Math.min(window.innerHeight - 150, y)), 'constrain y') || 0,
      color: sanitizeInput(color),
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      siteUrl: normalizeUrlForStorage(currentUrl),
      siteTitle: sanitizeInput(safeExecute(() => document.title, 'get title') || '')
    };
    
    notes.push(note);
    renderStickyNote(note);
    saveNotes(); // No notification for creating notes
    
    return note;
  } catch (error) {
    handleError(error, 'createStickyNote');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToCreateStickyNote') : 'Failed to create sticky note. Please try again.';
    showError(errorMessage);
    return null;
  }
}

// Render a sticky note on the page
export function renderStickyNote(note) {
  const noteElement = document.createElement('div');
  noteElement.className = 'toolary-sticky-note';
  noteElement.id = note.id;
  noteElement.style.cssText = `
    position: absolute;
    left: ${note.x}px;
    top: ${note.y}px;
    width: 250px;
    min-height: 150px;
    background: ${note.color};
    border: 2px solid var(--toolary-border, #ddd);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    cursor: move;
    user-select: none;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  `;
  
  // Note header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--toolary-border, #ddd);
    background: rgba(255,255,255,0.3);
    border-radius: 6px 6px 0 0;
  `;
  
  const title = document.createElement('span');
  // Show site name or domain instead of "Sticky Note"
  let siteName = note.siteTitle;
  if (!siteName) {
    const safeUrl = normalizeUrlForStorage(note.siteUrl || '');
    if (safeUrl) {
      try {
        siteName = new URL(safeUrl).hostname;
      } catch (error) {
        handleError(error, 'renderStickyNote parse url');
        siteName = safeUrl;
      }
    }
  }
  if (!siteName) {
    siteName = 'Sticky Note';
  }
  title.textContent = siteName.length > 20 ? siteName.substring(0, 20) + '...' : siteName;
  title.style.cssText = `
    font-weight: 600;
    color: #000000;
    font-size: 12px;
  `;
  
  const controls = document.createElement('div');
  controls.style.cssText = `
    display: flex;
    gap: 4px;
  `;
  
  // Color picker button
  const colorBtn = document.createElement('button');
  colorBtn.appendChild(renderIcon('color', { size: 14, decorative: true }));
  colorBtn.title = 'Change color';
  colorBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 2px;
    border-radius: 3px;
    color: #000000;
  `;
  
  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorPicker(note);
  });
  
  // Close button (instead of delete)
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close note';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    padding: 2px 4px;
    border-radius: 3px;
    color: var(--toolary-secondary-text, #666);
    font-weight: bold;
  `;
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Just hide the note, don't delete it
    noteElement.style.display = 'none';
  });
  
  controls.appendChild(colorBtn);
  controls.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(controls);
  
  // Make header clickable to focus the note
  header.addEventListener('click', (e) => {
    // Don't trigger if clicking on buttons
    if (e.target === colorBtn || e.target === closeBtn) return;
    
    e.stopPropagation();
    focusNote(noteElement);
  });
  
  // Note content
  const content = document.createElement('textarea');
  content.value = note.content;
  content.placeholder = t('clickToAddNote', 'Click to add note...');
  content.style.cssText = `
    width: 100%;
    min-height: 100px;
    border: none;
    background: transparent;
    padding: 12px;
    font-family: inherit;
    font-size: inherit;
    color: #000000;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  `;
  
  content.addEventListener('input', (e) => {
    note.content = e.target.value;
    note.updatedAt = new Date().toISOString();
    saveNotes();
  });
  
  content.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  noteElement.appendChild(header);
  noteElement.appendChild(content);
  
  // Make note draggable
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = noteElement.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    noteElement.style.transform = 'scale(1.05)';
    noteElement.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    
    e.preventDefault();
  });
  
  function handleDrag(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    
    // Constrain to viewport with better bounds
    const maxX = window.innerWidth - 250;
    const maxY = window.innerHeight - 150;
    
    const constrainedX = Math.max(0, Math.min(maxX, x));
    const constrainedY = Math.max(0, Math.min(maxY, y));
    
    noteElement.style.left = constrainedX + 'px';
    noteElement.style.top = constrainedY + 'px';
    
    // Update note position in real-time
    note.x = constrainedX;
    note.y = constrainedY;
  }
  
  function handleDragEnd() {
    isDragging = false;
    noteElement.style.transform = '';
    noteElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', handleDragEnd);
    
    // Update note with timestamp and save
    note.updatedAt = new Date().toISOString();
    saveNotes();
  }
  
  // Add to page
  document.body.appendChild(noteElement);
  
  // Focus the textarea
  setTimeout(() => content.focus(), 100);
}

export function hydrateNotesFromStorage(storedNotes = []) {
  try {
    const normalizedCurrentUrl = getNormalizedCurrentUrl();
    const rawCurrentUrl = safeExecute(() => window.location.href, 'get location href') || '';
    const fallbackUrl = normalizedCurrentUrl || normalizeUrlForStorage(rawCurrentUrl);
    const inputNotes = Array.isArray(storedNotes) ? storedNotes : [];
    const existingNotesById = new Map();
    notes.forEach(note => {
      if (note && typeof note === 'object' && note.id) {
        existingNotesById.set(note.id, note);
      }
    });

    const hydratedForCurrentSite = [];
    const processedCurrentIds = new Set();
    let maxCounter = noteCounter;

    inputNotes.forEach((rawNote) => {
      if (!rawNote || typeof rawNote !== 'object') {
        return;
      }

      const targetSiteUrl = normalizeUrlForStorage(rawNote.siteUrl || normalizedCurrentUrl || fallbackUrl);
      if (!targetSiteUrl) {
        return;
      }

      let id = typeof rawNote.id === 'string' ? rawNote.id.trim() : '';

      const idMatch = id.match(/note-(\d+)/);
      if (idMatch) {
        const parsed = parseInt(idMatch[1], 10);
        if (Number.isFinite(parsed)) {
          maxCounter = Math.max(maxCounter, parsed);
        }
      }

      if (!id) {
        maxCounter += 1;
        id = `note-${maxCounter}`;
      }

      let noteRef = existingNotesById.get(id);
      if (!noteRef) {
        while (existingNotesById.has(id)) {
          maxCounter += 1;
          id = `note-${maxCounter}`;
        }

        noteRef = {
          id,
          x: Number.isFinite(rawNote.x) ? rawNote.x : 0,
          y: Number.isFinite(rawNote.y) ? rawNote.y : 0,
          color: typeof rawNote.color === 'string' && rawNote.color.trim() ? rawNote.color : NOTE_COLORS[0].value,
          content: typeof rawNote.content === 'string' ? rawNote.content : '',
          createdAt: rawNote.createdAt || new Date().toISOString(),
          updatedAt: rawNote.updatedAt || rawNote.createdAt || new Date().toISOString(),
          siteUrl: targetSiteUrl,
          siteTitle: typeof rawNote.siteTitle === 'string' ? rawNote.siteTitle : ''
        };
        notes.push(noteRef);
        existingNotesById.set(id, noteRef);
      } else {
        noteRef.x = Number.isFinite(rawNote.x) ? rawNote.x : (Number.isFinite(noteRef.x) ? noteRef.x : 0);
        noteRef.y = Number.isFinite(rawNote.y) ? rawNote.y : (Number.isFinite(noteRef.y) ? noteRef.y : 0);
        noteRef.color = typeof rawNote.color === 'string' && rawNote.color.trim() ? rawNote.color : noteRef.color || NOTE_COLORS[0].value;
        noteRef.content = typeof rawNote.content === 'string' ? rawNote.content : noteRef.content || '';
        noteRef.createdAt = rawNote.createdAt || noteRef.createdAt || new Date().toISOString();
        noteRef.updatedAt = rawNote.updatedAt || rawNote.createdAt || noteRef.updatedAt || new Date().toISOString();
        noteRef.siteUrl = targetSiteUrl;
        noteRef.siteTitle = typeof rawNote.siteTitle === 'string' ? rawNote.siteTitle : noteRef.siteTitle || '';
      }

      if (noteRef.siteUrl === normalizedCurrentUrl) {
        if (!processedCurrentIds.has(noteRef.id)) {
          hydratedForCurrentSite.push(noteRef);
          processedCurrentIds.add(noteRef.id);
        }
      }
    });

    const validCurrentIds = new Set(processedCurrentIds);
    const seenIds = new Set();
    notes = notes.filter(note => {
      if (!note || typeof note !== 'object' || !note.id) {
        return false;
      }

      note.siteUrl = normalizeUrlForStorage(note.siteUrl || normalizedCurrentUrl || fallbackUrl);

      if (note.siteUrl === normalizedCurrentUrl) {
        if (validCurrentIds.size === 0) {
          return false;
        }
        if (!validCurrentIds.has(note.id)) {
          return false;
        }
      }

      if (!note.siteUrl) {
        return false;
      }

      if (seenIds.has(note.id)) {
        return false;
      }
      seenIds.add(note.id);
      return true;
    });

    noteCounter = notes.reduce((max, note) => {
      const match = typeof note.id === 'string' && note.id.match(/note-(\d+)/);
      if (!match) {
        return max;
      }
      const parsed = parseInt(match[1], 10);
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, Math.max(noteCounter, maxCounter));

    return hydratedForCurrentSite;
  } catch (error) {
    handleError(error, 'hydrateNotesFromStorage');
    return [];
  }
}

// Show color picker for note
function showColorPicker(note) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Choose Color</h3>
      <button id="cancel-color" style="
        position: absolute;
        top: 12px;
        right: 12px;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: var(--toolary-secondary-text, #666);
        padding: 4px 8px;
        border-radius: 4px;
      ">×</button>
    </div>
    
    <div style="padding: 20px;">
      <div class="grid-4" style="margin-bottom: 16px;">
        ${NOTE_COLORS.map(color => `
          <button class="color-option" data-color="${color.value}" style="
            width: 40px;
            height: 40px;
            border: 2px solid ${color.value === note.color ? 'var(--toolary-text, #333)' : 'transparent'};
            border-radius: 6px;
            background: ${color.value};
            cursor: pointer;
            transition: transform 0.2s ease;
          " title="${color.name}"></button>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners
  modal.querySelectorAll('.color-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      note.color = color;
      const noteElement = document.getElementById(note.id);
      if (noteElement) {
        noteElement.style.background = color;
      }
      saveNotes();
      modal.remove();
    });
    
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
    });
  });
  
  document.getElementById('cancel-color').addEventListener('click', () => {
    modal.remove();
  });
}


// Show notes manager
function showNotesManager() {
  // Remove existing manager if any
  const existingManager = document.getElementById('toolary-notes-manager');
  if (existingManager) {
    existingManager.remove();
  }
  
  // Show coffee message when manager opens
  showCoffeeMessageForTool('sticky-notes-picker');
  
  const manager = document.createElement('div');
  manager.id = 'toolary-notes-manager';
  manager.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--toolary-bg, #fff);
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    z-index: 2147483647;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 18px 22px;
    border-bottom: 1px solid var(--toolary-border, #eee);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--toolary-header-bg, #f8f9fa);
    position: relative;
  `;

  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--toolary-text, #333);
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  title.appendChild(renderIcon('note', { size: 20, decorative: true }));
  title.appendChild(Object.assign(document.createElement('span'), { textContent: 'Sticky Notes Manager' }));
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    color: var(--toolary-secondary-text, #666);
    position: absolute;
    top: 16px;
    right: 16px;
    transition: background 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.appendChild(renderIcon('close', { size: 18, decorative: true }));
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(0,0,0,0.08)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'transparent';
  });
  closeBtn.addEventListener('click', () => manager.remove());
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.style.cssText = 'padding: 22px; display: flex; flex-direction: column; gap: 18px;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;';

  const createBtn = document.createElement('button');
  createBtn.id = 'create-new-note';
  createBtn.type = 'button';
  createBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 999px;
    background: var(--toolary-primary-color, #007bff);
    color: #fff;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 16px 32px rgba(0,0,0,0.12);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  `;
  createBtn.appendChild(renderIcon('plus', { size: 18, decorative: true }));
  createBtn.appendChild(Object.assign(document.createElement('span'), { textContent: 'Add New Note' }));
  createBtn.addEventListener('mouseenter', () => {
    createBtn.style.transform = 'translateY(-2px)';
    createBtn.style.boxShadow = '0 20px 40px rgba(0,0,0,0.16)';
  });
  createBtn.addEventListener('mouseleave', () => {
    createBtn.style.transform = 'translateY(0)';
    createBtn.style.boxShadow = '0 16px 32px rgba(0,0,0,0.12)';
  });

  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-all-notes';
  clearBtn.type = 'button';
  clearBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 999px;
    background: var(--toolary-danger-color, #dc3545);
    color: #fff;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  `;
  clearBtn.appendChild(renderIcon('trash', { size: 18, decorative: true }));
  clearBtn.appendChild(Object.assign(document.createElement('span'), { textContent: 'Clear All' }));
  clearBtn.addEventListener('mouseenter', () => {
    clearBtn.style.transform = 'translateY(-2px)';
    clearBtn.style.boxShadow = '0 16px 32px rgba(220,53,69,0.35)';
  });
  clearBtn.addEventListener('mouseleave', () => {
    clearBtn.style.transform = 'translateY(0)';
    clearBtn.style.boxShadow = 'none';
  });

  actions.appendChild(createBtn);
  actions.appendChild(clearBtn);

  const listContainer = document.createElement('div');
  listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

  const listHeading = document.createElement('div');
  listHeading.style.cssText = 'font-weight: 600; color: var(--toolary-text, #333); text-align: center;';
  listHeading.textContent = t('allNotesFromAllSites', 'All Notes from All Sites');

  const list = document.createElement('div');
  list.id = 'all-notes-list';
  list.style.cssText = `
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--toolary-border, #ddd);
    border-radius: 12px;
    padding: 16px;
    background: var(--toolary-code-bg, #f8f9fa);
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;

  listContainer.appendChild(listHeading);
  listContainer.appendChild(list);

  body.appendChild(actions);
  body.appendChild(listContainer);

  manager.appendChild(header);
  manager.appendChild(body);

  document.body.appendChild(manager);

  createBtn.addEventListener('click', () => {
    manager.remove();
    const centerX = window.innerWidth / 2 - 125;
    const centerY = window.innerHeight / 2 - 75;
    createStickyNote(centerX, centerY);
  });

  const refreshManagerList = async () => {
    try {
      const allNotes = await loadAllNotes();
      renderAllNotesList(list, allNotes);
    } catch (error) {
      handleError(error, 'load all notes for manager');
      list.innerHTML = '<div style="text-align: center; color: var(--toolary-error-color, #dc3545); padding: 20px;">Failed to load notes</div>';
    }
  };

  clearBtn.addEventListener('click', async () => {
    if (!window.confirm('This will remove sticky notes from every site. Continue?')) {
      return;
    }

    try {
      const noteKeys = await getNoteStorageKeys();
      if (noteKeys.length) {
        await chrome.storage.local.remove(noteKeys);
      }
      await writeIndexedSiteKeys([]);

      document.querySelectorAll('.toolary-sticky-note').forEach(el => el.remove());
      notes = [];
      noteCounter = 0;
      const successMessage = chrome.i18n ? chrome.i18n.getMessage('allStickyNotesRemoved') : 'All sticky notes removed';
      showSuccess(successMessage);
      await refreshManagerList();
    } catch (error) {
      handleError(error, 'clear all notes');
      const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToClearNotes') : 'Failed to clear notes. Please try again.';
      showError(errorMessage);
    }
  });

  refreshManagerList();
  
}

// Load existing notes for current site and display them
export async function loadExistingNotesForCurrentSite() {
  try {
    // Get current site URL if not already set
    const normalizedCurrentUrl = getNormalizedCurrentUrl();

    if (!normalizedCurrentUrl) {
      console.log('No current URL available for loading notes');
      return;
    }

    // Filter notes to only include current site
    const currentSiteNotes = notes.filter(note => {
      return normalizeUrlForStorage(note.siteUrl) === normalizedCurrentUrl;
    });

    console.log(`Loading ${currentSiteNotes.length} notes for URL: ${normalizedCurrentUrl}`);

    currentSiteNotes.forEach(note => {
      // Check if note is already rendered on the page
      const existingNote = document.getElementById(note.id);
      if (!existingNote) {
        renderStickyNote(note);
        console.log(`Rendered note: ${note.id}`);
      }
    });
  } catch (error) {
    handleError(error, 'loadExistingNotesForCurrentSite');
  }
}

// Save notes to storage (site-specific) with enhanced error handling
async function saveNotes(showNotification = false) {
  try {
    const rawCurrentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(rawCurrentUrl);
    if (!normalizedCurrentUrl) {
      throw new Error('No current URL available');
    }

    const siteKey = getSiteStorageKey(rawCurrentUrl);
    const notesToPersist = notes.filter(note => {
      return normalizeUrlForStorage(note.siteUrl) === normalizedCurrentUrl;
    });

    const normalizedNotes = notesToPersist.map(note => ({
      ...note,
      siteUrl: normalizedCurrentUrl
    }));

    await safeExecute(async () =>
      await chrome.storage.local.set({ [siteKey]: normalizedNotes }), 'save notes to storage');

    if (normalizedNotes.length > 0) {
      await trackSiteStorageKey(siteKey);
    } else {
      await chrome.storage.local.remove([siteKey]);
      await untrackSiteStorageKey(siteKey);
    }

    // Only show notifications when explicitly requested
    if (showNotification) {
      const successMessage = chrome.i18n ? chrome.i18n.getMessage('notesSavedSuccessfully') : 'Notes saved successfully!';
      showSuccess(successMessage);
      
      // Show coffee message
      showCoffeeMessageForTool('sticky-notes-picker');
    }
  } catch (error) {
    handleError(error, 'saveNotes');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToSaveNotes') : 'Failed to save notes';
    showError(errorMessage);
  }
}

// Load notes from storage (site-specific) with enhanced error handling
async function loadNotes() {
  try {
    const rawCurrentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(rawCurrentUrl);
    if (!normalizedCurrentUrl) {
      throw new Error('No current URL available');
    }

    const siteKey = getSiteStorageKey(rawCurrentUrl);

    const siteData = await safeExecute(async () =>
      await chrome.storage.local.get([siteKey]), 'load notes from storage') || {};

    let loadedNotes = siteData[siteKey] || [];

    // Migration: Check for old URL-based keys and migrate them
    if (loadedNotes.length === 0) {
      const legacyKey = getLegacyStorageKey(rawCurrentUrl);
      const legacyData = await safeExecute(async () =>
        await chrome.storage.local.get([legacyKey]), 'load legacy notes') || {};

      if (legacyData[legacyKey] && legacyData[legacyKey].length > 0) {
        loadedNotes = legacyData[legacyKey];
        const migratedNotes = loadedNotes.map(note => ({
          ...note,
          siteUrl: normalizeUrlForStorage(note.siteUrl || normalizedCurrentUrl) || normalizedCurrentUrl
        }));
        // Migrate to new format
        await chrome.storage.local.set({ [siteKey]: migratedNotes });
        await trackSiteStorageKey(siteKey);
        // Remove old key
        await chrome.storage.local.remove([legacyKey]);
        loadedNotes = migratedNotes;
      }
    }

    const normalizedNotes = loadedNotes.map(note => ({
      ...note,
      siteUrl: normalizeUrlForStorage(note.siteUrl || normalizedCurrentUrl) || normalizedCurrentUrl
    }));

    if (normalizedNotes.length > 0) {
      await trackSiteStorageKey(siteKey);
    } else {
      await untrackSiteStorageKey(siteKey);
    }

    hydrateNotesFromStorage(normalizedNotes);

  } catch (error) {
    handleError(error, 'loadNotes');
    notes = [];
    noteCounter = 0;
  }
}

// Load all notes from all sites with enhanced error handling
async function loadAllNotes() {
  try {
    const noteKeys = await getNoteStorageKeys();
    if (!noteKeys.length) {
      return [];
    }

    const result = await safeExecute(async () =>
      await chrome.storage.local.get(noteKeys), 'get notes storage keys') || {};
    const allNotes = [];
    
    for (const [key, value] of Object.entries(result)) {
      try {
        if (isNotesStorageKey(key) && Array.isArray(value)) {
          value.forEach(note => {
            allNotes.push({
              ...note,
              siteUrl: normalizeUrlForStorage(note.siteUrl || '')
            });
          });
        }
      } catch (error) {
        handleError(error, `process storage key ${key}`);
      }
    }
    
    return allNotes;
  } catch (error) {
    handleError(error, 'loadAllNotes');
    return [];
  }
}

// Export notes as JSON with enhanced error handling
/*
function exportNotes() {
  try {
    const dataStr = safeExecute(() => JSON.stringify(notes, null, 2), 'stringify notes');
    if (!dataStr) {
      throw new Error('Failed to serialize notes');
    }
    
    const dataBlob = safeExecute(() => new Blob([dataStr], { type: 'application/json' }), 'create blob');
    if (!dataBlob) {
      throw new Error('Failed to create data blob');
    }
    
    const url = safeExecute(() => URL.createObjectURL(dataBlob), 'create object URL');
    if (!url) {
      throw new Error('Failed to create download URL');
    }
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `sticky-notes-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove(); // Modern API: use remove() instead of deprecated removeChild()
    
    safeExecute(() => URL.revokeObjectURL(url), 'revoke object URL');
    
    const successMessage = chrome.i18n ? chrome.i18n.getMessage('notesExportedSuccessfully') : 'Notes exported successfully!';
    showSuccess(successMessage);
  } catch (error) {
    handleError(error, 'exportNotes');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToExportNotes') : 'Failed to export notes';
    showError(errorMessage);
  }
}
*/

/*
async function refreshNotesManagerListIfPresent() {
  const listElement = document.getElementById('all-notes-list');
  if (!listElement) {
    return;
  }

  try {
    const allNotes = await loadAllNotes();
    renderAllNotesList(listElement, allNotes);
  } catch (error) {
    handleError(error, 'refreshNotesManagerListIfPresent');
  }
}
*/

// Import notes from JSON with enhanced error handling
/*
function importNotes() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    const cleanup = addEventListenerWithCleanup(input, 'change', (e) => {
      try {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();

          const readerCleanup = addEventListenerWithCleanup(reader, 'load', async (e) => {
            try {
              const importedNotes = safeExecute(() => JSON.parse(e.target.result), 'parse imported notes');
              if (!importedNotes) {
                throw new Error('Failed to parse notes file');
              }

              if (Array.isArray(importedNotes)) {
                const normalizedCurrentUrl = getNormalizedCurrentUrl();
                const normalizedImports = importedNotes.map(note => ({
                  ...note,
                  siteUrl: normalizeUrlForStorage(note?.siteUrl || normalizedCurrentUrl) || normalizedCurrentUrl
                }));

                hydrateNotesFromStorage(normalizedImports);
                await saveNotes(true); // Show notification for import
                await loadExistingNotesForCurrentSite();
                await refreshNotesManagerListIfPresent();
                const successMessage = chrome.i18n ? chrome.i18n.getMessage('notesImportedSuccessfully') : 'Notes imported successfully!';
                showSuccess(successMessage);
              } else {
                const errorMessage = chrome.i18n ? chrome.i18n.getMessage('invalidNotesFileFormat') : 'Invalid notes file format';
                showError(errorMessage);
              }
            } catch (error) {
              handleError(error, 'import notes file reader load');
              const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToParseNotesFile') : 'Failed to parse notes file';
              showError(errorMessage);
            }
          });
          cleanupFunctions.push(readerCleanup);
          
          safeExecute(() => reader.readAsText(file), 'read file as text');
        }
      } catch (error) {
        handleError(error, 'import notes input change');
        const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToProcessSelectedFile') : 'Failed to process selected file';
        showError(errorMessage);
      }
    });
    cleanupFunctions.push(cleanup);
    
    input.click();
  } catch (error) {
    handleError(error, 'importNotes');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToImportNotes') : 'Failed to import notes';
    showError(errorMessage);
  }
}
*/

// Delete a note with enhanced error handling
/*
function deleteNote(noteId) {
  try {
    if (!noteId || typeof noteId !== 'string') {
      throw new Error('Invalid note ID');
    }
    
    const sanitizedNoteId = sanitizeInput(noteId);
    
    if (window.confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      // Remove from DOM
      const noteElement = safeExecute(() => document.getElementById(sanitizedNoteId), 'get note element');
      if (noteElement) {
        noteElement.remove();
      }
      
      // Remove from notes array
      const noteIndex = notes.findIndex(note => note.id === sanitizedNoteId);
      if (noteIndex !== -1) {
        notes.splice(noteIndex, 1);
        saveNotes(true); // Show notification for delete
        const successMessage = chrome.i18n ? chrome.i18n.getMessage('noteDeletedSuccessfully') : 'Note deleted successfully';
        showSuccess(successMessage);
      }
    }
  } catch (error) {
    handleError(error, 'deleteNote');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToDeleteNote') : 'Failed to delete note';
    showError(errorMessage);
  }
}
*/

// Focus a note with enhanced error handling
/*
function focusNoteById(noteId) {
  try {
    if (!noteId || typeof noteId !== 'string') {
      throw new Error('Invalid note ID');
    }
    
    const sanitizedNoteId = sanitizeInput(noteId);
    const noteElement = safeExecute(() => document.getElementById(sanitizedNoteId), 'get note element');
    if (noteElement) {
      safeExecute(() => noteElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 'scroll into view');
      noteElement.style.transform = 'scale(1.1)';
      noteElement.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
      setTimeout(() => {
        try {
          noteElement.style.transform = 'scale(1)';
          noteElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        } catch (error) {
          handleError(error, 'focus note timeout');
        }
      }, 1000);
    }
  } catch (error) {
    handleError(error, 'focusNoteById');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToFocusNote') : 'Failed to focus note';
    showError(errorMessage);
  }
}
*/

// Render all notes from all sites with enhanced error handling
function renderAllNotesList(targetElement, allNotes) {
  try {
    targetElement.innerHTML = '';

    if (!allNotes || allNotes.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = 'text-align: center; padding: 40px 20px; color: var(--toolary-secondary-text, #666); display: flex; flex-direction: column; align-items: center; gap: 16px;';

      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'width: 56px; height: 56px; border-radius: 18px; background: rgba(0,123,255,0.1); display: flex; align-items: center; justify-content: center;';
      iconWrap.appendChild(renderIcon('note', { size: 28, decorative: true }));

      const heading = document.createElement('h3');
      heading.style.cssText = 'margin: 0; color: var(--toolary-text, #333);';
      heading.textContent = t('noStickyNotesYet', 'No sticky notes yet');

      const description = document.createElement('p');
      description.style.cssText = 'margin: 0; line-height: 1.6; font-size: 13px; max-width: 320px;';
      description.textContent = t('createFirstNoteHint', 'Click anywhere on the page to create your first sticky note. Each note stays pinned to its site.');

      emptyState.appendChild(iconWrap);
      emptyState.appendChild(heading);
      emptyState.appendChild(description);
      targetElement.appendChild(emptyState);
      return;
    }

    allNotes.forEach(note => {
      try {
        const card = document.createElement('div');
        card.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid var(--toolary-border, #ddd);
          background: var(--toolary-bg, #fff);
          box-shadow: 0 8px 16px rgba(0,0,0,0.05);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        `;

        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-2px)';
          card.style.boxShadow = '0 16px 32px rgba(0,0,0,0.08)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.05)';
        });

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;';

        const siteInfo = document.createElement('div');
        siteInfo.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const siteTitle = document.createElement('button');
        siteTitle.type = 'button';
        siteTitle.style.cssText = 'background: none; border: none; padding: 0; text-align: left; font-weight: 600; color: var(--toolary-text, #333); font-size: 14px; cursor: pointer;';
        const hostname = safeExecute(() => new URL(note.siteUrl).hostname, 'get hostname') || 'Unknown site';
        siteTitle.textContent = sanitizeInput(note.siteTitle || hostname);
        siteTitle.addEventListener('click', (event) => {
          event.stopPropagation();
          window.open(note.siteUrl, '_blank', 'noopener');
        });

        const meta = document.createElement('span');
        meta.style.cssText = 'font-size: 12px; color: var(--toolary-secondary-text, #666);';
        meta.textContent = safeExecute(() => new Date(note.createdAt).toLocaleString(), 'format note timestamp') || t('unknownDate', 'Unknown date');

        siteInfo.appendChild(siteTitle);
        siteInfo.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px;';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--toolary-danger-color, #dc3545);
          color: #fff;
          border: none;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease;
        `;
        deleteBtn.appendChild(renderIcon('trash', { size: 14, decorative: true }));
        deleteBtn.appendChild(Object.assign(document.createElement('span'), { textContent: 'Delete' }));
        deleteBtn.addEventListener('mouseenter', () => {
          deleteBtn.style.transform = 'translateY(-1px)';
        });
        deleteBtn.addEventListener('mouseleave', () => {
          deleteBtn.style.transform = 'translateY(0)';
        });
        deleteBtn.addEventListener('click', async (event) => {
          event.stopPropagation();
          await deleteIndividualNote(note.id);
          const refreshedNotes = await loadAllNotes();
          renderAllNotesList(targetElement, refreshedNotes);
        });

        actions.appendChild(deleteBtn);

        headerRow.appendChild(siteInfo);
        headerRow.appendChild(actions);
        card.appendChild(headerRow);

        const preview = document.createElement('p');
        preview.style.cssText = 'margin: 0; font-size: 13px; line-height: 1.6; color: var(--toolary-text, #333);';
        const summary = (note.content || '').trim();
        preview.textContent = summary ? `${summary.slice(0, 160)}${summary.length > 160 ? '…' : ''}` : t('emptyNote', 'Empty note');
        card.appendChild(preview);

        card.addEventListener('click', () => {
          const noteElement = document.getElementById(note.id);
          if (noteElement) {
            noteElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            noteElement.classList.add('toolary-note-highlight');
            setTimeout(() => noteElement.classList.remove('toolary-note-highlight'), 1200);
          } else {
            window.open(note.siteUrl, '_blank', 'noopener');
          }
        });

        targetElement.appendChild(card);
      } catch (error) {
        handleError(error, 'render note card');
      }
    });
  } catch (error) {
    handleError(error, 'renderAllNotesList');
    targetElement.innerHTML = '<div style="text-align: center; color: var(--toolary-error-color, #dc3545); padding: 20px;">Failed to load notes</div>';
  }
}


// Focus a specific note (bring to front and highlight) with enhanced error handling
function focusNote(noteElement) {
  try {
    if (!noteElement) {
      throw new Error('No note element provided');
    }
    
    // Bring to front
    noteElement.style.zIndex = '2147483647';
    
    // Add highlight effect
    noteElement.style.transform = 'scale(1.05)';
    noteElement.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
    
    // Focus the textarea
    const textarea = safeExecute(() => noteElement.querySelector('textarea'), 'get textarea');
    if (textarea) {
      safeExecute(() => textarea.focus(), 'focus textarea');
    }
    
    // Remove highlight after 2 seconds
    setTimeout(() => {
      try {
        noteElement.style.transform = '';
        noteElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      } catch (error) {
        handleError(error, 'focus note cleanup');
      }
    }, 2000);
  } catch (error) {
    handleError(error, 'focusNote');
  }
}

// Delete all notes for current site with enhanced error handling
/*
function deleteAllNotes() {
  try {
    const currentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(currentUrl);
    if (!normalizedCurrentUrl) {
      throw new Error('No current URL available');
    }

    // Filter notes to only include current site
    const currentSiteNotes = notes.filter(note => {
      return normalizeUrlForStorage(note.siteUrl) === normalizedCurrentUrl;
    });

    if (currentSiteNotes.length === 0) {
      const successMessage = chrome.i18n ? chrome.i18n.getMessage('noNotesToDeleteForSite') : 'No notes to delete for this site.';
      showSuccess(successMessage);
      return;
    }

    // Remove all notes for current site from array
    notes = notes.filter(note => {
      return normalizeUrlForStorage(note.siteUrl) !== normalizedCurrentUrl;
    });

    // Remove all note elements from DOM
    currentSiteNotes.forEach(note => {
      const noteElement = document.getElementById(note.id);
      if (noteElement) {
        noteElement.remove();
      }
    });

    // Save changes
    saveNotes(true); // Show notification for bulk delete

    const successMessage = chrome.i18n ? chrome.i18n.getMessage('deletedNotesSuccessfully', [currentSiteNotes.length]) : `Deleted ${currentSiteNotes.length} notes successfully!`;
    showSuccess(successMessage);
  } catch (error) {
    handleError(error, 'deleteAllNotes');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToDeleteAllNotes') : 'Failed to delete all notes. Please try again.';
    showError(errorMessage);
  }
}
*/

// Delete individual note from all notes list (works for any site)
async function deleteIndividualNote(noteId) {
  try {
    const noteIdSanitized = sanitizeInput(noteId);
    if (!noteIdSanitized) {
      throw new Error('Invalid note ID');
    }

    const noteKeys = await getNoteStorageKeys();
    const allStorageData = noteKeys.length
      ? await chrome.storage.local.get(noteKeys)
      : {};
    let noteToDelete = null;
    let siteKeyToUpdate = null;
    
    // Find the note in all storage keys
    for (const [key, value] of Object.entries(allStorageData)) {
      if (isNotesStorageKey(key) && Array.isArray(value)) {
        const foundNote = value.find(note => note.id === noteIdSanitized);
        if (foundNote) {
          noteToDelete = foundNote;
          siteKeyToUpdate = key;
          break;
        }
      }
    }
    
    if (!noteToDelete || !siteKeyToUpdate) {
      throw new Error('Note not found in storage');
    }

    // Remove from DOM
    const noteElement = document.getElementById(noteIdSanitized);
    if (noteElement) {
      noteElement.remove();
    }

    // Remove from storage
    const siteNotes = allStorageData[siteKeyToUpdate] || [];
    const updatedSiteNotes = siteNotes.filter(note => note.id !== noteIdSanitized);
    
    // Save updated notes back to storage
    if (updatedSiteNotes.length > 0) {
      await chrome.storage.local.set({ [siteKeyToUpdate]: updatedSiteNotes });
      await trackSiteStorageKey(siteKeyToUpdate);
    } else {
      await chrome.storage.local.remove([siteKeyToUpdate]);
      await untrackSiteStorageKey(siteKeyToUpdate);
    }

    // If the deleted note is from current site, update local notes array
    const currentUrl = safeExecute(() => window.location.href, 'get current url') || '';
    const normalizedCurrentUrl = normalizeUrlForStorage(currentUrl);
    if (normalizeUrlForStorage(noteToDelete.siteUrl) === normalizedCurrentUrl) {
      const localNoteIndex = notes.findIndex(note => note.id === noteIdSanitized);
      if (localNoteIndex !== -1) {
        notes.splice(localNoteIndex, 1);
        saveNotes();
      }
    }

    const successMessage = chrome.i18n ? chrome.i18n.getMessage('noteDeletedSuccessfullyExclamation') : 'Note deleted successfully!';
    showSuccess(successMessage);
  } catch (error) {
    handleError(error, 'deleteIndividualNote');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToDeleteNoteExclamation') : 'Failed to delete note. Please try again.';
    showError(errorMessage);
  }
}

// Expose functions globally in a controlled way to avoid pollution
if (typeof window !== 'undefined') {
  // Functions are now exposed in showNotesManager() when needed
  // This prevents global pollution when module is loaded but not activated
}
