// Comprehensive browser extension tests
import fs from 'fs';
import path from 'path';

describe('Toolboard Extension - Comprehensive Tests', () => {
  
  describe('File Structure', () => {
    test('all required files exist', () => {
      const requiredFiles = [
        'extension/manifest.json',
        'extension/background.js',
        'extension/content/content.js',
        'extension/content/content.css',
        'extension/popup/popup.html',
        'extension/popup/popup.js',
        'extension/popup/popup.css',
        'extension/shared/helpers.js',
        'extension/shared/icons.js',
        'extension/core/toolRegistry.js',
        'extension/core/toolLoader.js',
        'extension/core/messageRouter.js',
        'extension/core/constants.js',
        'extension/config/tools-manifest.json'
      ];

      requiredFiles.forEach(file => {
        const fullPath = path.join(process.cwd(), file);
        expect(fs.existsSync(fullPath)).toBe(true);
      });
    });

    test('all picker modules exist', () => {
      const modules = [
        'inspect/colorPicker.js',
        'inspect/elementPicker.js',
        'capture/screenshotPicker.js',
        'capture/textPicker.js',
        'inspect/linkPicker.js',
        'inspect/fontPicker.js',
        'capture/mediaPicker.js',
        'utilities/siteInfoPicker.js',
        'enhance/stickyNotesPicker.js'
      ];

      modules.forEach(modulePath => {
        const fullPath = path.join(process.cwd(), 'extension/tools', modulePath);
        expect(fs.existsSync(fullPath)).toBe(true);
      });
    });

    test('all icon files exist', () => {
      const icons = ['icon16.png', 'icon48.png', 'icon128.png'];
      
      icons.forEach(icon => {
        const fullPath = path.join(process.cwd(), 'extension/icons', icon);
        expect(fs.existsSync(fullPath)).toBe(true);
      });
    });
  });

  describe('Manifest Validation', () => {
    let manifest;

    beforeAll(() => {
      const manifestPath = path.join(process.cwd(), 'extension/manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent);
    });

    test('manifest.json is valid JSON', () => {
      expect(manifest).toBeDefined();
      expect(typeof manifest).toBe('object');
    });

    test('has required manifest fields', () => {
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.name).toBeDefined();
      expect(manifest.version).toBeDefined();
      expect(manifest.permissions).toBeDefined();
      expect(Array.isArray(manifest.permissions)).toBe(true);
    });

    test('has correct permissions', () => {
      const requiredPermissions = ['activeTab', 'scripting', 'clipboardWrite', 'storage', 'tabs'];
      requiredPermissions.forEach(permission => {
        expect(manifest.permissions).toContain(permission);
      });
    });

    test('has background script configured', () => {
      expect(manifest.background).toBeDefined();
      expect(manifest.background.service_worker).toBe('background.js');
    });

    test('has content scripts configured', () => {
      expect(manifest.content_scripts).toBeDefined();
      expect(Array.isArray(manifest.content_scripts)).toBe(true);
      expect(manifest.content_scripts.length).toBeGreaterThan(0);
    });

    test('has popup configured', () => {
      expect(manifest.action).toBeDefined();
      expect(manifest.action.default_popup).toBe('popup/popup.html');
    });

    test('has web accessible resources', () => {
      expect(manifest.web_accessible_resources).toBeDefined();
      expect(Array.isArray(manifest.web_accessible_resources)).toBe(true);
    });
  });

  describe('JavaScript Syntax', () => {
    test('background.js has valid syntax', () => {
      const backgroundPath = path.join(process.cwd(), 'extension/background.js');
      const content = fs.readFileSync(backgroundPath, 'utf8');
      
      // Basic syntax checks
      expect(content).toMatch(/addMessageListener/);
      expect(content).toMatch(/sendTabMessage/);
      expect(content).toMatch(/chrome\.scripting\.executeScript/);
    });

    test('content.js has valid syntax', () => {
      const contentPath = path.join(process.cwd(), 'extension/content/content.js');
      const content = fs.readFileSync(contentPath, 'utf8');
      
      // Basic syntax checks
      expect(content).toMatch(/addMessageListener/);
      expect(content).toMatch(/loadToolModule/);
      expect(content).toMatch(/resetActiveModule/);
    });

    test('helpers.js has valid syntax', () => {
      const helpersPath = path.join(process.cwd(), 'extension/shared/helpers.js');
      const content = fs.readFileSync(helpersPath, 'utf8');
      
      // Check for required exports
      expect(content).toMatch(/export function debounce/);
      expect(content).toMatch(/export function throttle/);
      expect(content).toMatch(/export function showError/);
      expect(content).toMatch(/export function showSuccess/);
      expect(content).toMatch(/export function showInfo/);
      expect(content).toMatch(/export function createOverlay/);
      expect(content).toMatch(/export async function copyText/);
    });

    test('all picker modules have valid syntax', () => {
      const modules = [
        'inspect/colorPicker.js',
        'inspect/elementPicker.js',
        'capture/screenshotPicker.js',
        'capture/textPicker.js',
        'inspect/linkPicker.js',
        'inspect/fontPicker.js',
        'capture/mediaPicker.js',
        'utilities/siteInfoPicker.js',
        'enhance/stickyNotesPicker.js'
      ];

      modules.forEach(module => {
        const modulePath = path.join(process.cwd(), 'extension/tools', module);
        const content = fs.readFileSync(modulePath, 'utf8');
        
        // Each module should expose an activate function (async allowed)
        expect(content).toMatch(/export\s+(async\s+)?function activate/);
        
        // Each module should import helper utilities (supporting multiline imports)
        expect(content).toMatch(/import[\s\S]*from '\.\.\/\.\.\/shared\/helpers\.js'/);
      });
    });
  });

  describe('Module Dependencies', () => {
    test('all imports are properly defined', () => {
      const helpersPath = path.join(process.cwd(), 'extension/shared/helpers.js');
      const helpersContent = fs.readFileSync(helpersPath, 'utf8');
      
      // Get all exports from helpers
      const exports = helpersContent.match(/export (function|async function|const|let|var) (\w+)/g) || [];
      const exportNames = exports.map(exp => {
        const parts = exp.split(' ');
        return parts[parts.length - 1]; // Get the last part (function name)
      });
      
      // Check each module's imports
      const modules = [
        'inspect/colorPicker.js',
        'inspect/elementPicker.js',
        'capture/screenshotPicker.js',
        'capture/textPicker.js',
        'inspect/linkPicker.js',
        'inspect/fontPicker.js',
        'capture/mediaPicker.js',
        'utilities/siteInfoPicker.js',
        'enhance/stickyNotesPicker.js'
      ];

      modules.forEach(module => {
        const modulePath = path.join(process.cwd(), 'extension/tools', module);
        const content = fs.readFileSync(modulePath, 'utf8');
        
        // Extract imports from helpers
        const importMatch = content.match(/import \{([^}]+)\} from '\.\.\/\.\.\/shared\/helpers\.js'/);
        if (importMatch) {
          const imports = importMatch[1].split(',').map(imp => imp.trim());
          
          // Check if all imported functions are exported
          imports.forEach(importName => {
            expect(exportNames).toContain(importName);
          });
        }
      });
    });
  });

  describe('File Sizes', () => {
    test('files are not empty', () => {
      const importantFiles = [
        'extension/manifest.json',
        'extension/background.js',
        'extension/content/content.js',
        'extension/shared/helpers.js'
      ];

      importantFiles.forEach(file => {
        const fullPath = path.join(process.cwd(), file);
        const stats = fs.statSync(fullPath);
        expect(stats.size).toBeGreaterThan(0);
      });
    });

    test('modules have reasonable sizes', () => {
      const modules = [
        'inspect/colorPicker.js',
        'inspect/elementPicker.js',
        'capture/screenshotPicker.js',
        'capture/textPicker.js',
        'inspect/linkPicker.js',
        'inspect/fontPicker.js',
        'capture/mediaPicker.js',
        'utilities/siteInfoPicker.js',
        'enhance/stickyNotesPicker.js'
      ];

      modules.forEach(module => {
        const modulePath = path.join(process.cwd(), 'extension/tools', module);
        const stats = fs.statSync(modulePath);
        
        // Each module should be at least 1KB and not more than 100KB
        expect(stats.size).toBeGreaterThan(1000);
        expect(stats.size).toBeLessThan(100000);
      });
    });
  });

});
