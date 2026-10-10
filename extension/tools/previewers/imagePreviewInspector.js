import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml, formatBytes, readFileAsArrayBuffer } from './sharedPreviewUtils.js';
import { enhanceToolUI } from '../../shared/toolUi.js';

export const metadata = {
  id: 'image-preview-inspector',
  name: 'Image Preview Inspector',
  category: 'previewers',
  icon: 'image-inspector',
  permissions: ['activeTab'],
  tags: ['preview', 'image', 'exif', 'metadata'],
  keywords: ['image', 'exif', 'dimensions', 'icc', 'color profile']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;

function readUint16(view, offset, littleEndian) {
  return view.getUint16(offset, littleEndian);
}

function parseExif(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return {};

    let offset = 2;
    while (offset < view.byteLength - 1) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xe1) {
        const exifOffset = offset + 4;
        if (String.fromCharCode(view.getUint8(exifOffset), view.getUint8(exifOffset + 1), view.getUint8(exifOffset + 2), view.getUint8(exifOffset + 3)) !== 'Exif') {
          break;
        }

        const tiff = exifOffset + 6;
        const little = view.getUint16(tiff) === 0x4949;
        const ifdOffset = view.getUint32(tiff + 4, little);
        const entries = view.getUint16(tiff + ifdOffset, little);
        const tags = {};

        for (let i = 0; i < entries; i += 1) {
          const entry = tiff + ifdOffset + 2 + i * 12;
          const tag = readUint16(view, entry, little);
          const type = readUint16(view, entry + 2, little);
          const count = view.getUint32(entry + 4, little);
          const valueOffset = entry + 8;

          const extractAscii = () => {
            const ptr = count > 4 ? tiff + view.getUint32(valueOffset, little) : valueOffset;
            let text = '';
            for (let c = 0; c < count - 1; c += 1) {
              text += String.fromCharCode(view.getUint8(ptr + c));
            }
            return text;
          };

          if (tag === 0x010f && type === 2) tags.make = extractAscii();
          if (tag === 0x0110 && type === 2) tags.model = extractAscii();
          if (tag === 0x0132 && type === 2) tags.dateTime = extractAscii();
          if (tag === 0x0112) tags.orientation = view.getUint16(valueOffset, little);
        }

        return tags;
      }
      if (marker === 0xda || marker === 0xd9) break;
      offset += 2 + view.getUint16(offset + 2);
    }
    return {};
  } catch {
    return {};
  }
}

function detectIccProfile(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = new TextEncoder().encode('ICC_PROFILE');

  for (let i = 0; i < bytes.length - signature.length; i += 1) {
    let matched = true;
    for (let j = 0; j < signature.length; j += 1) {
      if (bytes[i + j] !== signature[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

async function inspectImage(file) {
  const preview = panel?.querySelector('#toolary-image-preview');
  const info = panel?.querySelector('#toolary-image-info');
  if (!preview || !info) return;

  if (!file) {
    showError(t('imagePreviewInspectorMissingFile') || 'Please select an image file.');
    return;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    preview.innerHTML = `
      <div class="toolary-media-shell is-loading" style="min-height:260px;">
        <img alt="${escapeHtml(t('toolUiMediaPreviewAlt') || 'Tool preview')}" class="toolary-media-el" />
        <div class="toolary-media-placeholder">
          <div class="toolary-media-spinner"></div>
          <div class="toolary-media-text" data-toolary-error-label="${escapeHtml(t('toolUiMediaPreviewUnavailable') || 'Preview unavailable')}">${escapeHtml(t('loading') || 'Loading')}</div>
        </div>
      </div>
    `;
    enhanceToolUI(document);
    const shell = preview.querySelector('.toolary-media-shell');
    const shellImg = preview.querySelector('.toolary-media-el');
    img.onload = async () => {
      if (shellImg) shellImg.src = objectUrl;
      shell?.classList.remove('is-loading');
      shell?.classList.add('is-ready');

      const buffer = await readFileAsArrayBuffer(file);
      const exif = parseExif(buffer);
      const hasIcc = detectIccProfile(buffer);

      info.innerHTML = `
        <div><strong>${t('imagePreviewInspectorFile') || 'File'}:</strong> ${escapeHtml(file.name)}</div>
        <div><strong>${t('imagePreviewInspectorType') || 'Type'}:</strong> ${escapeHtml(file.type || '-')}</div>
        <div><strong>${t('imagePreviewInspectorSize') || 'Size'}:</strong> ${escapeHtml(formatBytes(file.size))}</div>
        <div><strong>${t('imagePreviewInspectorDimensions') || 'Dimensions'}:</strong> ${img.naturalWidth} x ${img.naturalHeight}</div>
        <div><strong>${t('imagePreviewInspectorMake') || 'Make'}:</strong> ${escapeHtml(exif.make || '-')}</div>
        <div><strong>${t('imagePreviewInspectorModel') || 'Model'}:</strong> ${escapeHtml(exif.model || '-')}</div>
        <div><strong>${t('imagePreviewInspectorDateTime') || 'DateTime'}:</strong> ${escapeHtml(exif.dateTime || '-')}</div>
        <div><strong>${t('imagePreviewInspectorOrientation') || 'Orientation'}:</strong> ${escapeHtml(exif.orientation || '-')}</div>
        <div><strong>${t('imagePreviewInspectorIcc') || 'Color Profile (ICC)'}:</strong> ${hasIcc ? (t('imagePreviewInspectorIccPresent') || 'Present') : (t('imagePreviewInspectorIccNotDetected') || 'Not detected')}</div>
      `;
      showCoffeeMessageForTool('image-preview-inspector');
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      shell?.classList.remove('is-loading');
      shell?.classList.add('is-error');
      showError(t('imagePreviewInspectorLoadFailed') || 'Failed to load image.');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  } catch (error) {
    showError(`${t('imagePreviewInspectorFailed') || 'Failed to inspect image.'} ${error.message || ''}`.trim());
  }
}

function createPanel() {
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-image-preview-inspector',
    title: t('imagePreviewInspectorTitle') || 'Image Preview Inspector',
    width: 1080,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-row">
          <input id="toolary-image-file" type="file" accept="image/*" />
          <button class="toolary-ui-btn" data-action="inspect">${t('imagePreviewInspectorInspect') || 'Inspect image'}</button>
        </div>
        <div class="toolary-preview-grid-2" style="grid-template-columns:1.1fr .9fr;align-items:start;">
          <div id="toolary-image-preview" class="toolary-preview-card" style="display:flex;align-items:center;justify-content:center;min-height:220px;"></div>
          <div id="toolary-image-info" class="toolary-preview-card" style="display:grid;gap:6px;"></div>
        </div>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  const fileInput = panel.querySelector('#toolary-image-file');
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="inspect"]'), 'click', () => inspectImage(fileInput.files?.[0])));
  cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', () => inspectImage(fileInput.files?.[0])));
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'imagePreviewInspector.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup(cleanupFns, 'imagePreviewInspector');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
