import { enhanceToolUI } from '../extension/shared/toolUi.js';

function createOverlayHtml(inner = '<img id="toolary-test-image" src="data:image/png;base64,AA==" />') {
  return `
    <div id="toolary-test-overlay">
      <section id="toolary-test-dialog">
        ${inner}
      </section>
    </div>
  `;
}

describe('toolUi media enhancement', () => {
  let root;

  beforeEach(() => {
    root = document.createElement('div');
  });

  afterEach(() => {
    root?.remove();
    root = null;
  });

  test('enhances overlay and wraps media with fullscreen-enabled shell', () => {
    root.innerHTML = createOverlayHtml();

    enhanceToolUI(root);

    const overlay = root.querySelector('#toolary-test-overlay');
    const dialog = root.querySelector('#toolary-test-dialog');
    const image = root.querySelector('#toolary-test-image');
    const shell = image?.closest('.toolary-media-shell');

    expect(overlay?.getAttribute('data-toolary-ui-enhanced')).toBe('true');
    expect(overlay?.classList.contains('toolary-ui-overlay')).toBe(true);
    expect(dialog?.classList.contains('toolary-ui-surface')).toBe(true);

    expect(image?.getAttribute('data-toolary-media-enhanced')).toBe('true');
    expect(image?.classList.contains('toolary-media-el')).toBe(true);
    expect(shell).toBeTruthy();
    expect(shell?.classList.contains('toolary-media-can-fullscreen')).toBe(true);
    expect(shell?.getAttribute('data-toolary-media-fullscreen-enhanced')).toBe('true');
  });

  test('re-enhances newly rendered media inside an already-enhanced overlay', () => {
    root.innerHTML = createOverlayHtml();
    enhanceToolUI(root);

    const dialog = root.querySelector('#toolary-test-dialog');
    dialog.innerHTML = '<img id="toolary-test-image-2" src="data:image/png;base64,AA==" />';

    enhanceToolUI(root);

    const newImage = root.querySelector('#toolary-test-image-2');
    const shell = newImage?.closest('.toolary-media-shell');

    expect(newImage?.getAttribute('data-toolary-media-enhanced')).toBe('true');
    expect(shell).toBeTruthy();
    expect(shell?.classList.contains('toolary-media-can-fullscreen')).toBe(true);
  });

  test('does not create nested media shells when media is already wrapped', () => {
    root.innerHTML = createOverlayHtml(`
      <div class="toolary-media-shell">
        <img id="toolary-test-image-3" src="data:image/png;base64,AA==" />
      </div>
    `);

    enhanceToolUI(root);
    enhanceToolUI(root);

    const shells = root.querySelectorAll('.toolary-media-shell');
    const image = root.querySelector('#toolary-test-image-3');

    expect(shells).toHaveLength(1);
    expect(image?.getAttribute('data-toolary-media-enhanced')).toBe('true');
  });

  test('enhances action buttons with shared ui class', () => {
    root.innerHTML = `
      <div id="toolary-test-2-overlay">
        <section id="toolary-test-dialog-2">
          <button id="toolary-action-btn" data-action="run">Run</button>
        </section>
      </div>
    `;

    enhanceToolUI(root);

    const button = root.querySelector('#toolary-action-btn');
    expect(button?.classList.contains('toolary-ui-btn')).toBe(true);
    expect(button?.dataset.toolaryBtnTone).toBeTruthy();
  });
});
