/**
 * Coffee Toast System
 * Displays friendly developer support messages with Buy Me a Coffee button
 */

import { getCoffeeMessage } from '../core/coffeeMessages.js';

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/ademisler';
const TOAST_DURATION = 6000; // 6 seconds

/**
 * Show coffee message toast for a specific tool
 * @param {string} toolId - The tool identifier
 */
export async function showCoffeeMessageForTool(toolId) {
  try {
    const message = await getCoffeeMessage(toolId);
    if (!message) {
      console.debug(`Coffee Toast: No message available for tool: ${toolId}`);
      return;
    }
    
    await showCoffeeToast(message);
  } catch (error) {
    console.error('Coffee Toast: Error showing message for tool', toolId, error);
  }
}

/**
 * Create and display coffee toast with message and donation button
 * @param {string} message - The coffee message to display
 */
export async function showCoffeeToast(message) {
  try {
    // Remove any existing coffee toasts
    document.querySelectorAll('.toolary-coffee-toast').forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = 'toolary-coffee-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    
    // Add responsive class based on message length
    if (message.length > 100) {
      toast.classList.add('toolary-coffee-toast--long-text');
    } else if (message.length < 30) {
      toast.classList.add('toolary-coffee-toast--short-text');
    }
    
    // Create toast content
    const content = document.createElement('div');
    content.className = 'toolary-coffee-toast__content';
    
    // Coffee emoji and message
    const messageContainer = document.createElement('div');
    messageContainer.className = 'toolary-coffee-toast__message';
    
    const coffeeEmoji = document.createElement('span');
    coffeeEmoji.className = 'toolary-coffee-toast__emoji';
    coffeeEmoji.textContent = '☕';
    
    const messageText = document.createElement('span');
    messageText.className = 'toolary-coffee-toast__text';
    messageText.textContent = message;
    
    messageContainer.appendChild(coffeeEmoji);
    messageContainer.appendChild(messageText);
    
    // Buy Me a Coffee button
    const button = document.createElement('button');
    button.className = 'toolary-coffee-toast__button';
    button.textContent = await getButtonText();
    button.setAttribute('aria-label', 'Support the developer by buying a coffee');
    
    // Button click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBuyMeACoffee();
    });
    
    content.appendChild(messageContainer);
    content.appendChild(button);
    toast.appendChild(content);
    
    // Add to page - ensure it's added after any existing overlays
    // Check if AI Chat backdrop exists and add after it
    const aiChatBackdrop = document.getElementById('toolary-ai-chat-backdrop');
    if (aiChatBackdrop && aiChatBackdrop.parentNode) {
      aiChatBackdrop.parentNode.insertBefore(toast, aiChatBackdrop.nextSibling);
    } else {
      document.body.appendChild(toast);
    }
    
    // Auto-remove after duration
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('toolary-coffee-toast--leaving');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 300); // Match CSS transition duration
      }
    }, TOAST_DURATION);
    
    // Click outside to dismiss
    toast.addEventListener('click', (e) => {
      if (e.target === toast) {
        dismissToast(toast);
      }
    });
    
  } catch (error) {
    console.error('Coffee Toast: Error creating toast', error);
  }
}

/**
 * Open Buy Me a Coffee page in new tab
 */
function openBuyMeACoffee() {
  try {
    // Check if chrome.tabs is available (extension context)
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({
        url: BUY_ME_A_COFFEE_URL,
        active: true
      });
    } else {
      // Fallback for test environment or when chrome.tabs is not available
      window.open(BUY_ME_A_COFFEE_URL, '_blank');
    }
  } catch (error) {
    console.error('Coffee Toast: Error opening Buy Me a Coffee page', error);
    // Final fallback: try to open in current window
    try {
      window.open(BUY_ME_A_COFFEE_URL, '_blank');
    } catch (fallbackError) {
      console.error('Coffee Toast: Fallback also failed', fallbackError);
    }
  }
}

/**
 * Get localized button text
 * @returns {string} Button text in current language
 */
async function getButtonText() {
  try {
    // Try Chrome i18n first
    if (chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage('buyMeACoffee');
      if (message) return message;
    }
    
    // Read from user preference storage
    const stored = await chrome.storage.local.get(['language']);
    let langCode = stored?.language || 'en';
    
    // If no stored preference, detect browser language
    if (!stored?.language) {
      const browserLang = navigator.language || navigator.languages?.[0] || 'en';
      const detected = browserLang.split('-')[0].toLowerCase();
      // Only use if supported, otherwise English
      langCode = ['tr', 'fr'].includes(detected) ? detected : 'en';
    }
    
    switch (langCode) {
      case 'tr': return 'Kahve Ismarla';
      case 'fr': return 'Acheter Café';
      default: return 'Buy Coffee';
    }
  } catch (error) {
    console.debug('Coffee Toast: Error getting button text, using English', error);
    return 'Buy Coffee';
  }
}

/**
 * Dismiss toast with animation
 * @param {HTMLElement} toast - Toast element to dismiss
 */
function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  
  toast.classList.add('toolary-coffee-toast--leaving');
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 300);
}
