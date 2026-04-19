import { showError, showSuccess, handleError, addEventListenerWithCleanup } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';

export const metadata = {
  id: 'dark-mode-toggle',
  name: 'Dark Mode Toggle',
  category: 'enhance',
  icon: 'moon',
  permissions: ['activeTab', 'storage'],
  tags: ['dark', 'theme', 'mode', 'night'],
  keywords: ['dark mode', 'night mode', 'theme', 'contrast']
};

let toggleButton = null;
let isDarkMode = false;
let cleanupFunctions = [];
let mutationObserver = null;

// Storage key for dark mode state
const STORAGE_KEY = 'toolaryDarkMode';

// Load dark mode state from storage
async function loadDarkModeState() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    // Default to true (dark mode enabled) if no stored state
    return result[STORAGE_KEY]?.enabled ?? true;
  } catch (error) {
    handleError(error, 'loadDarkModeState');
    return true; // Default to dark mode on error
  }
}

// Save dark mode state to storage
async function saveDarkModeState(enabled) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        enabled,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    handleError(error, 'saveDarkModeState');
  }
}


// Create the floating toggle button
function createToggleButton() {
  const button = document.createElement('button');
  button.className = 'toolary-darkmode-toggle';
  
  // Use i18n for accessibility labels
  const ariaLabel = chrome.i18n ? chrome.i18n.getMessage('darkModeToggleTitle') : 'Toggle Dark Mode';
  const title = chrome.i18n ? chrome.i18n.getMessage('darkModeToggleTitle') : 'Toggle Dark Mode';
  
  button.setAttribute('aria-label', ariaLabel);
  button.setAttribute('title', title);
  
  // Create sun icon initially (since we start in dark mode by default)
  const icon = createIconElement('sun', { size: 20, decorative: true });
  button.appendChild(icon);
  
  return button;
}

// Update button appearance based on dark mode state
function updateButtonAppearance() {
  if (!toggleButton) return;
  
  const icon = toggleButton.querySelector('svg');
  if (!icon) return;
  
  // Remove old icon
  icon.remove();
  
  // Add new icon based on state - REVERSED LOGIC
  // Light mode: show sun (click to go dark)
  // Dark mode: show moon (click to go light)
  const newIcon = createIconElement(isDarkMode ? 'sun' : 'moon', { size: 20, decorative: true });
  toggleButton.appendChild(newIcon);
  
  // Update button classes
  toggleButton.classList.toggle('active', isDarkMode);
  
  // Add animation classes
  toggleButton.classList.add('animating', 'color-shift');
  
  // Remove animation classes after animation completes
  setTimeout(() => {
    toggleButton.classList.remove('animating', 'color-shift');
  }, 800); // Increased duration for smoother animation
}

// Apply filter-based dark mode (Dark Reader inspired)
function injectDarkModeStylesheet() {
  const styleId = 'toolary-dark-mode-style';
  let styleElement = document.getElementById(styleId);
  
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.className = 'darkreader darkreader--fallback';
    document.documentElement.appendChild(styleElement);
  }
  
  // Dark Reader style filter-based dark mode
  styleElement.textContent = `
    html {
      filter: invert(100%) hue-rotate(180deg) !important;
      background-color: #fff !important;
    }
    
    /* Re-invert media elements to preserve original colors */
    img, picture, video, canvas, svg, iframe {
      filter: invert(100%) hue-rotate(180deg) !important;
    }
    
    /* Background images */
    [style*="background-image"] {
      filter: invert(100%) hue-rotate(180deg) !important;
    }
    
    /* Preserve toggle button - it should NOT be inverted */
    .toolary-darkmode-toggle {
      filter: none !important;
      background: rgba(255, 255, 255, 0.9) !important;
      color: #FF9500 !important;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1) !important;
    }
    
    .toolary-darkmode-toggle.active {
      background: rgba(45, 45, 45, 0.9) !important;
      color: #2C3E50 !important;
    }
    
    .toolary-darkmode-toggle:hover {
      box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
    }
    
    .toolary-darkmode-toggle svg {
      filter: none !important;
    }
  `;
}

function removeDarkModeStylesheet() {
  const styleElement = document.getElementById('toolary-dark-mode-style');
  if (styleElement) {
    styleElement.remove();
  }
}

// Apply dark mode using filter-based approach (Dark Reader style)
function applyDarkMode() {
  document.body.classList.add('toolary-dark-mode-active');
  
  // Inject filter CSS
  injectDarkModeStylesheet();
  
  // Dispatch custom event for sites that listen to theme changes
  window.dispatchEvent(new window.CustomEvent('toolary-dark-mode', { detail: { enabled: true } }));
}

// Remove dark mode
function removeDarkMode() {
  document.body.classList.remove('toolary-dark-mode-active');
  
  // Remove CSS injection
  removeDarkModeStylesheet();
  
  // Dispatch custom event
  window.dispatchEvent(new window.CustomEvent('toolary-dark-mode', { detail: { enabled: false } }));
}

// Handle toggle button click
function handleToggleClick() {
  isDarkMode = !isDarkMode;
  
  if (isDarkMode) {
    applyDarkMode();
    const message = chrome.i18n ? chrome.i18n.getMessage('darkModeEnabled') : 'Dark mode enabled';
    showSuccess(message);
    
    // Show coffee message
    showCoffeeMessageForTool('dark-mode-toggle');
  } else {
    removeDarkMode();
    const message = chrome.i18n ? chrome.i18n.getMessage('darkModeDisabled') : 'Dark mode disabled';
    showSuccess(message);
    
    // Show coffee message
    showCoffeeMessageForTool('dark-mode-toggle');
  }
  
  updateButtonAppearance();
  saveDarkModeState(isDarkMode);
}

// Setup MutationObserver to handle dynamic content (simplified for filter mode)
function setupMutationObserver() {
  if (mutationObserver) return;
  
  mutationObserver = new window.MutationObserver((mutations) => {
    if (!isDarkMode) return;
    
    // For filter-based approach, we don't need to handle framework changes
    // The filter will automatically apply to all new content
    mutations.forEach(mutation => {
      // Only reapply if our style element was removed
      if (mutation.type === 'childList') {
        const styleElement = document.getElementById('toolary-dark-mode-style');
        if (!styleElement && isDarkMode) {
          // Re-inject if somehow removed
          injectDarkModeStylesheet();
        }
      }
    });
  });
  
  // Watch for changes to document head and body
  mutationObserver.observe(document.head, {
    childList: true,
    subtree: true
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Clean up mutation observer
function cleanupMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

// Handle page visibility changes (simplified for filter mode)
function handleVisibilityChange() {
  if (document.hidden) return;
  
  // Reapply dark mode when page becomes visible again
  if (isDarkMode) {
    setTimeout(() => {
      // Check if our style element still exists
      const styleElement = document.getElementById('toolary-dark-mode-style');
      if (!styleElement) {
        injectDarkModeStylesheet();
      }
    }, 100);
  }
}

export async function activate(deactivate) {
  try {
    // Load current dark mode state
    isDarkMode = await loadDarkModeState();
    
    // Create toggle button
    toggleButton = createToggleButton();
    document.body.appendChild(toggleButton);
    
    // Set up event listeners
    const clickCleanup = addEventListenerWithCleanup(toggleButton, 'click', handleToggleClick);
    cleanupFunctions.push(clickCleanup);
    
    const visibilityCleanup = addEventListenerWithCleanup(document, 'visibilitychange', handleVisibilityChange);
    cleanupFunctions.push(visibilityCleanup);
    
    // Set up mutation observer for dynamic content
    setupMutationObserver();
    
    // Apply dark mode if it was previously enabled
    if (isDarkMode) {
      applyDarkMode();
    }
    
    // Update button appearance
    updateButtonAppearance();
    
    console.log('Dark Mode Toggle activated');
    
  } catch (error) {
    handleError(error, 'dark-mode-toggle.activate');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateDarkModeToggle') : 'Failed to activate dark mode toggle';
    showError(errorMessage);
    deactivate();
  }
}

export function deactivate() {
  try {
    // Remove toggle button
    if (toggleButton && toggleButton.parentNode) {
      toggleButton.parentNode.removeChild(toggleButton);
      toggleButton = null;
    }
    
    // Remove dark mode class
    document.body.classList.remove('toolary-dark-mode-active');
    
    // Clean up event listeners
    cleanupFunctions.forEach(cleanup => cleanup());
    cleanupFunctions = [];
    
    // Clean up mutation observer
    cleanupMutationObserver();
    
    console.log('Dark Mode Toggle deactivated');
    
  } catch (error) {
    handleError(error, 'dark-mode-toggle.deactivate');
  }
}
