// Test file for helpers.js module
import { 
  debounce, 
  throttle, 
  showError, 
  showSuccess, 
  showInfo, 
  createOverlay,
  removeOverlay,
  copyText,
  getCssSelector,
  getXPath,
  normalizeUrlForStorage
} from '../extension/shared/helpers.js';

describe('Helpers Module', () => {
  
  describe('debounce', () => {
    test('should debounce function calls', (done) => {
      let callCount = 0;
      const debouncedFn = debounce(() => {
        callCount++;
      }, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 150);
    });
  });

  describe('throttle', () => {
    test('should throttle function calls', (done) => {
      let callCount = 0;
      const throttledFn = throttle(() => {
        callCount++;
      }, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 50);
    });
  });

  describe('showError', () => {
    test('should create error toast', () => {
      showError('Test error');
      expect(document.createElement).toHaveBeenCalled();
    });
  });

  describe('showSuccess', () => {
    test('should create success toast', () => {
      showSuccess('Test success');
      expect(document.createElement).toHaveBeenCalled();
    });
  });

  describe('showInfo', () => {
    test('should create info toast', () => {
      showInfo('Test info');
      expect(document.createElement).toHaveBeenCalled();
    });
  });

  describe('createOverlay', () => {
    test('should create overlay element', () => {
      const overlay = createOverlay();
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
    });
  });

  describe('removeOverlay', () => {
    test('should remove overlay element', () => {
      const mockOverlay = {
        parentNode: { removeChild: jest.fn() }
      };
      removeOverlay(mockOverlay);
      expect(mockOverlay.parentNode.removeChild).toHaveBeenCalledWith(mockOverlay);
    });
  });

  describe('copyText', () => {
    test('should copy text to clipboard', async () => {
      await copyText('test text');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
    });
  });

  describe('getCssSelector', () => {
    test('should generate CSS selector for element with ID', () => {
      const mockElement = {
        id: 'test-id',
        tagName: 'DIV',
        className: 'test-class',
        parentNode: null,
        nodeType: 1
      };
      
      // Mock Element constructor
      Object.setPrototypeOf(mockElement, Element.prototype);
      
      global.document.querySelectorAll = jest.fn((selector) => 
        selector === '#test-id' ? [mockElement] : []
      );

      const selector = getCssSelector(mockElement);
      expect(selector).toBe('#test-id');
    });
  });

  describe('getXPath', () => {
    test('should generate XPath for element with ID', () => {
      const mockElement = {
        id: 'test-id',
        tagName: 'DIV',
        parentNode: null,
        nodeType: 1
      };

      const xpath = getXPath(mockElement);
      expect(xpath).toBe('//*[@id="test-id"]');
    });
  });

  describe('normalizeUrlForStorage', () => {
    const originalHref = window.location.href;

    afterAll(() => {
      window.location.href = originalHref;
    });

    test('preserves query parameters and hashes', () => {
      const input = 'https://example.com/path?one=1&two=2#section';
      expect(normalizeUrlForStorage(input)).toBe(input);
    });

    test('removes javascript protocol while keeping path', () => {
      const normalized = normalizeUrlForStorage('javascript:https://example.com/path');
      expect(normalized).toBe('https://example.com/path');
    });

    test('strips unsafe javascript URLs without fabricating domains', () => {
      const normalized = normalizeUrlForStorage('javascript:alert(1)');
      expect(normalized).toBe('alert(1)');
    });
  });

});
