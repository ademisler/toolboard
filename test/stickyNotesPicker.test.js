import { jest } from '@jest/globals';

describe('stickyNotesPicker hydrateNotesFromStorage', () => {
  const originalUrl = new URL(window.location.href);

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/?one=1');
  });

  afterEach(() => {
    const path = `${originalUrl.pathname}${originalUrl.search}${originalUrl.hash}` || '/';
    window.history.replaceState({}, '', path);
  });

  test('reuses hydrated note objects for URLs with query parameters', async () => {
    const module = await import('../extension/tools/enhance/stickyNotesPicker.js');
    const { hydrateNotesFromStorage } = module;

    const storedNotes = [{
      id: 'note-1',
      x: 120,
      y: 240,
      color: '#fff3cd',
      content: 'Test note',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      siteUrl: 'http://localhost/?one=1',
      siteTitle: 'Example Page'
    }];

    const firstHydration = hydrateNotesFromStorage(storedNotes);
    expect(firstHydration).toHaveLength(1);
    expect(firstHydration[0].siteUrl).toBe('http://localhost/?one=1');

    storedNotes[0].content = 'Updated note';

    const secondHydration = hydrateNotesFromStorage(storedNotes);
    expect(secondHydration).toHaveLength(1);
    expect(secondHydration[0]).toBe(firstHydration[0]);
    expect(secondHydration[0].content).toBe('Updated note');
  });
});
