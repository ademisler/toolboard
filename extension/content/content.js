// Guard against duplicate injections
if (window.toolaryContentScriptLoaded) {
  console.log('Toolboard content script already loaded, skipping...');
} else {
  window.toolaryContentScriptLoaded = true;

  const coreModulesPromise = Promise.all([
    import(chrome.runtime.getURL('core/toolLoader.js')),
    import(chrome.runtime.getURL('core/messageRouter.js')),
    import(chrome.runtime.getURL('core/toolRegistry.js')),
    import(chrome.runtime.getURL('shared/helpers.js')),
    import(chrome.runtime.getURL('shared/toolUi.js'))
  ]).then(([toolLoader, messageRouter, toolRegistry, helpers, toolUi]) => ({
    toolLoader,
    messageRouter,
    toolRegistry,
    helpers,
    toolUi
  })).catch(error => {
    console.error('Toolboard: failed to load core modules in content script', error);
    throw error;
  });

  if (!window.__toolaryIconLoader) {
    window.__toolaryIconLoader = {
      promise: null,
      async load() {
        try {
          if (!this.promise) {
            this.promise = import(chrome.runtime.getURL('shared/icons.js'))?.catch(error => {
              console.debug('Toolboard: icon loader failed', error);
              this.promise = null;
              return null;
            });
          }
          return await this.promise;
        } catch (error) {
          console.debug('Toolboard: icon loader failed', error);
          this.promise = null;
          return null;
        }
      }
    };
  }

  if (window.toolaryInitialized) {
    console.log('Toolboard already initialized, skipping...');
  } else {
    window.toolaryInitialized = true;

  const getIconsModule = () => window.__toolaryIconLoader.load();
  let activeModule = null;
  const NOTES_STORAGE_PREFIX = 'toolaryStickyNotes_';
  const LEGACY_NOTES_STORAGE_PREFIX = 'stickyNotes_';

  function resetActiveModule() {
    if (activeModule && typeof activeModule.deactivate === 'function') {
      try {
        activeModule.deactivate();
      } catch (error) {
        console.error('Toolboard: error deactivating module', error);
      }
    }
    activeModule = null;
    document.body.style.cursor = '';
  }

  async function signalReady() {
    try {
      const { messageRouter } = await coreModulesPromise;
      const { sendRuntimeMessage, MESSAGE_TYPES } = messageRouter;
      await sendRuntimeMessage(MESSAGE_TYPES.CONTENT_SCRIPT_READY);
    } catch {
      chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {});
    }
  }

  async function showToolboardOverlay() {
    const existingOverlay = document.getElementById('toolary-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const icons = await getIconsModule();
    const getSvg = (name, size = 18) => {
      try {
        if (icons?.getIconSvg) {
          const svgString = icons.getIconSvg(name, { size });
          const wrapper = document.createElement('div');
          wrapper.innerHTML = svgString;
          return wrapper.firstChild;
        }
      } catch (error) {
        console.debug('Toolboard: failed to render icon', name, error);
      }
      return null;
    };

    const overlay = document.createElement('div');
    overlay.id = 'toolary-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: toolary-fade-in 0.3s ease-out;
    `;

    const popup = document.createElement('div');
    popup.style.cssText = `
      background: var(--toolary-bg, #fff);
      border: 1px solid var(--toolary-border, #ddd);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      color: var(--toolary-text, #333);
      min-width: 300px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; flex-direction: column; gap: 10px; align-items: center;';

    const title = document.createElement('h2');
    title.style.cssText = 'margin: 0; color: var(--toolary-text, #333); display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 600;';
    const logoIcon = getSvg('star', 20);
    if (logoIcon) {
      title.appendChild(logoIcon);
    }
    title.appendChild(Object.assign(document.createElement('span'), { textContent: 'Toolboard' }));

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'margin: 0; color: var(--toolary-secondary-text, #666); font-size: 14px;';
    subtitle.textContent = 'Use the extension icon in your toolbar to access every tool instantly.';

    header.appendChild(title);
    header.appendChild(subtitle);
    popup.appendChild(header);

    const featureGrid = document.createElement('div');
    featureGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, minmax(120px, 160px)); gap: 12px; justify-content: center;';
    [
      { icon: 'color', label: 'Color Picker' },
      { icon: 'text', label: 'Text Picker' },
      { icon: 'element', label: 'Element Picker' },
      { icon: 'screenshot', label: 'Screenshot' }
    ].forEach(({ icon, label }) => {
      const card = document.createElement('div');
      card.style.cssText = 'padding: 14px; background: var(--toolary-code-bg, #f8f9fa); border-radius: 10px; border: 1px solid var(--toolary-border, #ddd); display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--toolary-text, #333);';
      const iconHolder = document.createElement('div');
      iconHolder.style.cssText = 'width: 32px; height: 32px; border-radius: 12px; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center;';
      const iconSvg = getSvg(icon, 18);
      if (iconSvg) {
        iconHolder.appendChild(iconSvg);
      }
      card.appendChild(iconHolder);
      card.appendChild(Object.assign(document.createElement('div'), { textContent: label }));
      featureGrid.appendChild(card);
    });

    popup.appendChild(featureGrid);

    const closeButton = document.createElement('button');
    closeButton.id = 'close-toolary-overlay';
    closeButton.type = 'button';
    closeButton.style.cssText = 'margin: 0 auto; padding: 10px 20px; border: 1px solid var(--toolary-border, #ddd); background: var(--toolary-button-bg, #f0f0f0); border-radius: 999px; cursor: pointer; font-size: 14px; color: var(--toolary-text, #333); display: inline-flex; align-items: center; gap: 8px; font-weight: 600;';
    const closeIconSvg = getSvg('close', 16);
    if (closeIconSvg) {
      closeButton.appendChild(closeIconSvg);
    }
    closeButton.appendChild(Object.assign(document.createElement('span'), { textContent: 'Close' }));
    popup.appendChild(closeButton);

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    document.getElementById('close-toolary-overlay').addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  coreModulesPromise.then(({ messageRouter, toolLoader, toolUi }) => {
    toolUi?.startToolUIObserver?.();
    const { addMessageListener, MESSAGE_TYPES } = messageRouter;

    addMessageListener({
      [MESSAGE_TYPES.ACTIVATE_TOOL_ON_PAGE]: async ({ toolId }) => {
        if (!toolId) {
          throw new Error('Missing tool id');
        }

        resetActiveModule();

        const module = await toolLoader.loadToolModule(toolId);
        if (module && typeof module.activate === 'function') {
          activeModule = module;
          module.activate(resetActiveModule);
          toolUi?.enhanceToolUI?.(document);
          console.log('Toolboard: tool activated', toolId);
          return { toolId };
        }

        throw new Error(`Tool "${toolId}" missing activate() export`);
      },
      [MESSAGE_TYPES.GET_PAGE_DIMENSIONS]: () => {
        const rect = document.documentElement.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight
        };
      },
      [MESSAGE_TYPES.GET_PAGE_INFO]: () => ({
        width: Math.max(
          document.body.scrollWidth,
          document.body.offsetWidth,
          document.documentElement.clientWidth,
          document.documentElement.scrollWidth,
          document.documentElement.offsetWidth
        ),
        height: Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        ),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        title: document.title,
        url: window.location.href,
        timestamp: Date.now()
      }),
      [MESSAGE_TYPES.SHOW_POPUP]: () => {
        showToolboardOverlay();
        return true;
      },
      [MESSAGE_TYPES.SHOW_FAVORITES]: async () => {
        const { helpers } = await coreModulesPromise;
        if (helpers?.showFavorites) {
          helpers.showFavorites();
          return true;
        }
        throw new Error('Favorites helper unavailable');
      },
      [MESSAGE_TYPES.TRIGGER_PRINT]: () => {
        // Hide all toolary overlays and notifications before printing
        const toolaryElements = document.querySelectorAll('[id*="toolary"], [class*="toolary"]');
        const hiddenElements = [];
        
        toolaryElements.forEach(element => {
          if (element.style.display !== 'none') {
            hiddenElements.push({
              element,
              originalDisplay: element.style.display
            });
            element.style.display = 'none';
          }
        });

        // No instruction overlay - direct print for clean PDF

        // Trigger print dialog
        window.print();

        // Clean up after print dialog closes
        setTimeout(() => {
          // Restore hidden toolary elements
          hiddenElements.forEach(({ element, originalDisplay }) => {
            element.style.display = originalDisplay;
          });
        }, 1000);
        
        return { success: true, method: 'window.print' };
      }
    });
  }).catch(error => {
    console.error('Toolboard: failed to register message listeners', error);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      resetActiveModule();
    }
  });

  async function autoLoadStickyNotes() {
    try {
      const currentUrl = window.location.href;
      if (!currentUrl) return;

      const { helpers } = await coreModulesPromise;
      const normalizeUrlForStorage = helpers?.normalizeUrlForStorage || ((url) => url || '');
      const sanitizedLegacy = helpers?.sanitizeInput || ((value) => value || '');

      const normalizedCurrentUrl = normalizeUrlForStorage(currentUrl);
      const siteKey = `${NOTES_STORAGE_PREFIX}${normalizedCurrentUrl || 'global'}`;
      const legacyNormalizedKey = `${LEGACY_NOTES_STORAGE_PREFIX}${normalizedCurrentUrl || 'global'}`;
      const legacySanitizedKey = `${LEGACY_NOTES_STORAGE_PREFIX}${sanitizedLegacy(currentUrl)}`;

      const keysToFetch = [siteKey, legacyNormalizedKey];
      if (legacySanitizedKey !== legacyNormalizedKey) {
        keysToFetch.push(legacySanitizedKey);
      }

      const result = await chrome.storage.local.get(keysToFetch);
      const notes = result[siteKey] || result[legacyNormalizedKey] || result[legacySanitizedKey] || [];

      console.log(`Toolboard: auto-loading sticky notes for ${currentUrl}, ${notes.length} found`);

      if (notes.length > 0) {
        const stickyNotesModule = await import(chrome.runtime.getURL('tools/enhance/stickyNotesPicker.js'));
        if (stickyNotesModule) {
          const hydrateNotes = stickyNotesModule.hydrateNotesFromStorage || ((data) => data);
          const renderStickyNote = stickyNotesModule.renderStickyNote;
          const hydratedNotes = Array.isArray(notes) ? hydrateNotes(notes) : [];

          hydratedNotes.forEach(note => {
            if (!document.getElementById(note.id) && typeof renderStickyNote === 'function') {
              renderStickyNote(note);
              console.log(`Toolboard: auto-rendered note ${note.id}`);
            }
          });
        }
      }
    } catch (error) {
      console.log('Toolboard: auto-load sticky notes failed', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      signalReady();
      setTimeout(autoLoadStickyNotes, 500);
    });
  } else {
    signalReady();
    setTimeout(autoLoadStickyNotes, 500);
  }
  }
}
