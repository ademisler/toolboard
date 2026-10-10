import { JSDOM } from 'jsdom';
import {
  buildCsvContent,
  normalizeImportPayload,
  normalizeLoopCount,
  reorderSteps
} from '../extension/tools/utilities/macroRecorderModel.js';
import { generateSelector, testSelector } from '../extension/tools/utilities/macroRecorderSelector.js';
import {
  getStoredMacros,
  importMacros,
  MACRO_RECORDER_STORAGE_KEY,
  saveMacro
} from '../extension/tools/utilities/macroRecorderStorage.js';

describe('Macro Recorder model helpers', () => {
  test('supports Clicky single-macro imports', () => {
    const payload = {
      id: 'macro-one',
      name: 'Macro One',
      steps: [{ type: 'delay', duration: 500 }]
    };

    const result = normalizeImportPayload(payload, 1700000000000);

    expect(result.count).toBe(1);
    expect(result.macros['macro-one']).toBeDefined();
    expect(result.macros['macro-one'].steps[0].type).toBe('delay');
  });

  test('normalizes loop counts and preserves infinite mode', () => {
    expect(normalizeLoopCount(0)).toBe(0);
    expect(normalizeLoopCount('0')).toBe(0);
    expect(normalizeLoopCount(-5)).toBe(1);
    expect(normalizeLoopCount('2000')).toBe(999);
  });

  test('reorders steps without mutating the source array', () => {
    const source = [
      { type: 'click', selector: '#one' },
      { type: 'delay', duration: 200 },
      { type: 'copyText', selector: '#three' }
    ];

    const result = reorderSteps(source, 0, 2);

    expect(result.map((step) => step.type)).toEqual(['delay', 'copyText', 'click']);
    expect(source.map((step) => step.type)).toEqual(['click', 'delay', 'copyText']);
  });

  test('builds CSV output with the exact Clicky header and escaped fields', () => {
    const csv = buildCsvContent([
      {
        timestamp: '2026-04-15T10:00:00.000Z',
        url: 'https://example.com/page?a=1,b=2',
        selector: 'button[data-role="cta"]',
        text: 'Click "Buy"'
      }
    ]);

    expect(csv.split('\n')[0]).toBe('timestamp,url,selector,text');
    expect(csv).toContain('"https://example.com/page?a=1,b=2"');
    expect(csv).toContain('"Click ""Buy"""');
  });
});

describe('Macro Recorder selector helpers', () => {
  test('prefers unique ids first', () => {
    const dom = new JSDOM('<body><button id="checkout-cta">Buy</button></body>');
    const button = dom.window.document.querySelector('button');

    expect(generateSelector(button, dom.window.document)).toBe('#checkout-cta');
  });

  test('falls back to stable data attributes when id is absent', () => {
    const dom = new JSDOM('<body><button data-testid="checkout">Buy</button></body>');
    const button = dom.window.document.querySelector('button');
    const selector = generateSelector(button, dom.window.document);

    expect(selector).toBe('button[data-testid="checkout"]');
    expect(testSelector(selector, dom.window.document).unique).toBe(true);
  });

  test('builds an nth-child path as a final fallback', () => {
    const dom = new JSDOM(`
      <body>
        <div>
          <button class="same">One</button>
          <button class="same">Two</button>
        </div>
      </body>
    `);
    const button = dom.window.document.querySelectorAll('button')[1];
    const selector = generateSelector(button, dom.window.document);

    expect(selector).toContain('button:nth-child(2)');
    expect(testSelector(selector, dom.window.document).unique).toBe(true);
  });
});

describe('Macro Recorder storage helpers', () => {
  let storageState;

  beforeEach(() => {
    storageState = {};

    chrome.storage.local.get.mockImplementation(async (key) => {
      if (!key) {
        return storageState;
      }

      if (Array.isArray(key)) {
        return key.reduce((acc, currentKey) => {
          acc[currentKey] = storageState[currentKey];
          return acc;
        }, {});
      }

      return { [key]: storageState[key] };
    });

    chrome.storage.local.set.mockImplementation(async (value) => {
      Object.assign(storageState, value);
    });
  });

  test('imports both single macros and stores them under the Toolboard key', async () => {
    await importMacros({
      id: 'macro-imported',
      name: 'Imported Macro',
      steps: [{ type: 'delay', duration: 750 }]
    });

    const macros = await getStoredMacros();

    expect(macros['macro-imported']).toBeDefined();
    expect(storageState[MACRO_RECORDER_STORAGE_KEY]).toBeDefined();
  });

  test('persists saved macros and preserves their ids', async () => {
    await saveMacro({
      id: 'macro-save',
      name: 'Saved Macro',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      steps: [{ type: 'click', selector: '#save' }]
    });

    const macros = await getStoredMacros();

    expect(macros['macro-save']).toBeDefined();
    expect(macros['macro-save'].steps[0].selector).toBe('#save');
  });
});

describe('Macro Recorder module smoke test', () => {
  test('activates and deactivates without throwing', async () => {
    const module = await import('../extension/tools/utilities/macroRecorder.js');
    const mockDeactivate = jest.fn();

    await expect(module.activate(mockDeactivate)).resolves.toBeUndefined();
    expect(() => module.deactivate()).not.toThrow();
  });
});
