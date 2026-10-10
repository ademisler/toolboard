import {
  addEventListenerWithCleanup,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { enhanceToolUI } from '../../shared/toolUi.js';

export const metadata = {
  id: 'image-to-pdf-converter',
  name: 'Image to PDF',
  category: 'converters',
  icon: 'image-pdf',
  permissions: ['activeTab'],
  tags: ['converter', 'image', 'pdf', 'jpg', 'png'],
  keywords: ['image to pdf', 'jpg to pdf', 'png to pdf', 'photos to pdf', 'merge images']
};

const PAGE_SIZES = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 }
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let sourceFiles = [];
let outputBlob = null;
let outputUrl = '';
let pdfFilename = '';
let previewImageUrl = '';
let stylesInjected = false;

function mmToPt(mm) {
  return (mm * 72) / 25.4;
}

function roundPdfNumber(value) {
  return Number(value.toFixed(3));
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'imageToPdfConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function cleanupOutputUrl() {
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = '';
  }
}

function cleanupPreviewUrl() {
  if (previewImageUrl) {
    URL.revokeObjectURL(previewImageUrl);
    previewImageUrl = '';
  }
}

function resetOutput() {
  outputBlob = null;
  pdfFilename = '';
  cleanupOutputUrl();
  const outputMeta = panel?.querySelector('#toolary-image-pdf-output-meta');
  if (outputMeta) outputMeta.textContent = '-';
  const downloadBtn = panel?.querySelector('#toolary-image-pdf-download');
  if (downloadBtn) downloadBtn.disabled = true;
}

function setInputPreview(file, totalCount = 0) {
  const previewImage = panel?.querySelector('#toolary-image-pdf-input-preview');
  const previewMeta = panel?.querySelector('#toolary-image-pdf-input-preview-meta');
  if (!previewImage || !previewMeta) return;

  cleanupPreviewUrl();

  if (!file) {
    previewImage.removeAttribute('src');
    previewMeta.textContent = t('imageToPdfNoPreview') || 'No image selected yet.';
    return;
  }

  previewImageUrl = URL.createObjectURL(file);
  previewImage.src = previewImageUrl;

  const extraCount = Math.max(0, totalCount - 1);
  previewMeta.textContent = extraCount > 0
    ? `${file.name} (+${extraCount})`
    : file.name;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-image-pdf-status');
  if (el) el.textContent = text || '';
}

function setInputMeta(text) {
  const el = panel?.querySelector('#toolary-image-pdf-input-meta');
  if (el) el.textContent = text || '-';
}

function resolveThemeVars() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const hasDarkClass = document.documentElement.classList.contains('dark-theme') || document.body?.classList.contains('dark-theme');
  const isDark = Boolean(prefersDark || hasDarkClass);
  if (isDark) {
    return {
      bg: '#2b2b2b',
      text: '#f5f5f5',
      border: '#4b5563',
      controlBg: '#1f2937',
      mutedBg: 'rgba(255,255,255,.08)'
    };
  }
  return {
    bg: '#ffffff',
    text: '#111111',
    border: '#d1d5db',
    controlBg: '#ffffff',
    mutedBg: 'rgba(127,127,127,.08)'
  };
}

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-image-pdf-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-image-pdf-styles';
  style.textContent = `
    .toolary-image-pdf-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-image-pdf-dialog { width: min(920px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 14px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-image-pdf-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
    .toolary-image-pdf-title { font-size: 16px; font-weight: 700; }
    .toolary-image-pdf-label { display: grid; gap: 6px; }
    .toolary-image-pdf-label-text { font-size: 12px; opacity: .85; }
    .toolary-image-pdf-input, .toolary-image-pdf-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-image-pdf-advanced { border: 1px solid var(--toolary-border); border-radius: 10px; padding: 10px; background: var(--toolary-muted-bg); }
    .toolary-image-pdf-advanced-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); margin-top: 10px; }
    .toolary-image-pdf-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-image-pdf-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-image-pdf-status { font-size: 12px; opacity: .92; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-image-pdf-info-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); }
    .toolary-image-pdf-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 10px; }
    .toolary-image-pdf-card-title { font-size: 12px; font-weight: 700; }
    .toolary-image-pdf-card-meta { font-size: 12px; opacity: .85; margin-top: 4px; }
    .toolary-image-pdf-preview-meta { font-size: 12px; opacity: .85; margin: 4px 0 8px; }
    .toolary-image-pdf-preview { width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; background: var(--toolary-muted-bg); }
    @media (max-width: 900px) { .toolary-image-pdf-dialog { width: min(96vw,920px); } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function dataUrlToBytes(dataUrl) {
  const base64Index = dataUrl.indexOf(',');
  if (base64Index < 0) {
    throw new Error(t('imageToPdfInvalidImage') || 'Invalid image data.');
  }
  const base64 = dataUrl.slice(base64Index + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function makePdfDoc(pages) {
  const chunks = [];
  let offset = 0;
  const offsets = [];

  function pushBytes(bytes) {
    chunks.push(bytes);
    offset += bytes.length;
  }

  function pushText(text) {
    pushBytes(new TextEncoder().encode(text));
  }

  function writeObject(id, headerText, streamBytes) {
    offsets[id] = offset;
    pushText(`${id} 0 obj\n${headerText}`);
    if (streamBytes) {
      pushText('\nstream\n');
      pushBytes(streamBytes);
      pushText('\nendstream');
    }
    pushText('\nendobj\n');
  }

  const pageIds = [];
  const imageIds = [];
  const contentIds = [];
  let nextId = 3;

  for (let i = 0; i < pages.length; i += 1) {
    pageIds.push(nextId);
    imageIds.push(nextId + 1);
    contentIds.push(nextId + 2);
    nextId += 3;
  }

  pushText('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  writeObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  writeObject(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const contentText = `q\n${roundPdfNumber(page.drawW)} 0 0 ${roundPdfNumber(page.drawH)} ${roundPdfNumber(page.drawX)} ${roundPdfNumber(page.drawY)} cm\n/Im${i + 1} Do\nQ\n`;
    const contentBytes = new TextEncoder().encode(contentText);

    writeObject(
      pageIds[i],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${roundPdfNumber(page.pageW)} ${roundPdfNumber(page.pageH)}] /Resources << /XObject << /Im${i + 1} ${imageIds[i]} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentIds[i]} 0 R >>`
    );

    writeObject(
      imageIds[i],
      `<< /Type /XObject /Subtype /Image /Width ${page.imageW} /Height ${page.imageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.length} >>`,
      page.imageBytes
    );

    writeObject(
      contentIds[i],
      `<< /Length ${contentBytes.length} >>`,
      contentBytes
    );
  }

  const xrefOffset = offset;
  const totalObjects = nextId - 1;
  pushText(`xref\n0 ${totalObjects + 1}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i <= totalObjects; i += 1) {
    const itemOffset = offsets[i] || 0;
    pushText(`${String(itemOffset).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

function getPageSize(sizeKey, orientation, imageW, imageH) {
  if (sizeKey === 'auto') {
    const w = Math.max(180, (imageW * 72) / 96);
    const h = Math.max(180, (imageH * 72) / 96);
    return { w, h };
  }

  const base = PAGE_SIZES[sizeKey] || PAGE_SIZES.a4;
  let w = base.w;
  let h = base.h;

  const resolvedOrientation = orientation === 'auto'
    ? (imageW > imageH ? 'landscape' : 'portrait')
    : orientation;

  if (resolvedOrientation === 'landscape') {
    [w, h] = [h, w];
  }
  return { w, h };
}

function calculatePlacement(pageW, pageH, imageW, imageH, fitMode, marginPt) {
  const safeMargin = Math.max(0, Math.min(marginPt, Math.min(pageW, pageH) / 3));
  const availableW = Math.max(1, pageW - (safeMargin * 2));
  const availableH = Math.max(1, pageH - (safeMargin * 2));

  const scale = fitMode === 'cover'
    ? Math.max(availableW / imageW, availableH / imageH)
    : Math.min(availableW / imageW, availableH / imageH);

  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const drawX = (pageW - drawW) / 2;
  const drawY = (pageH - drawH) / 2;

  return { drawW, drawH, drawX, drawY };
}

async function imageFileToJpegPayload(file, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(t('imageToPdfImageLoadFailed') || 'Failed to decode image file.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.naturalWidth || img.width || 1);
    canvas.height = Math.max(1, img.naturalHeight || img.height || 1);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('imageToPdfCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const bytes = dataUrlToBytes(dataUrl);

    return {
      imageW: canvas.width,
      imageH: canvas.height,
      imageBytes: bytes
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function suggestFilename(files) {
  if (!files?.length) {
    return `images-${Date.now()}.pdf`;
  }
  const first = String(files[0]?.name || 'images').replace(/\.[a-zA-Z0-9]+$/, '');
  const slug = first.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'images';
  return `${slug}-bundle-${Date.now()}.pdf`;
}

async function buildPdf() {
  if (!sourceFiles.length) {
    showError(t('imageToPdfNoImages') || 'Please select at least one image.');
    return;
  }

  try {
    resetOutput();
    setStatus(t('imageToPdfBuilding') || 'Creating PDF from images...');

    const sizeKey = panel?.querySelector('#toolary-image-pdf-page-size')?.value || 'a4';
    const orientation = panel?.querySelector('#toolary-image-pdf-orientation')?.value || 'auto';
    const fitMode = panel?.querySelector('#toolary-image-pdf-fit')?.value || 'contain';
    const marginMm = Number(panel?.querySelector('#toolary-image-pdf-margin')?.value || 10);
    const quality = Number(panel?.querySelector('#toolary-image-pdf-quality')?.value || 0.92);
    const marginPt = mmToPt(Math.max(0, Math.min(40, marginMm)));

    const pages = [];
    for (let i = 0; i < sourceFiles.length; i += 1) {
      const imagePayload = await imageFileToJpegPayload(sourceFiles[i], Math.max(0.4, Math.min(1, quality)));
      const pageSize = getPageSize(sizeKey, orientation, imagePayload.imageW, imagePayload.imageH);
      const placement = calculatePlacement(pageSize.w, pageSize.h, imagePayload.imageW, imagePayload.imageH, fitMode, marginPt);
      pages.push({
        ...imagePayload,
        pageW: pageSize.w,
        pageH: pageSize.h,
        ...placement
      });
      setStatus((t('imageToPdfProcessingPage') || 'Processing image $1/$2...').replace('$1', String(i + 1)).replace('$2', String(sourceFiles.length)));
    }

    const pdfBlob = makePdfDoc(pages);
    outputBlob = pdfBlob;
    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(pdfBlob);
    pdfFilename = suggestFilename(sourceFiles);

    const outputMeta = panel?.querySelector('#toolary-image-pdf-output-meta');
    if (outputMeta) outputMeta.textContent = `${pages.length} pages • ${Math.round(pdfBlob.size / 1024)} KB`;

    const downloadBtn = panel?.querySelector('#toolary-image-pdf-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('imageToPdfReady') || 'PDF is ready. You can download it now.');
    showSuccess(t('imageToPdfBuilt') || 'PDF created successfully.');
  } catch (error) {
    handleError(error, 'imageToPdfConverter.buildPdf');
    setStatus('');
    showError(error.message || t('imageToPdfBuildFailed') || 'Failed to create PDF.');
  }
}

function downloadPdf() {
  if (!outputBlob || !outputUrl) {
    showError(t('imageToPdfNothingToDownload') || 'No PDF output to download.');
    return;
  }

  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = pdfFilename || `images-${Date.now()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showSuccess(t('imageToPdfDownloaded') || 'PDF downloaded.');
  showCoffeeMessageForTool('image-to-pdf-converter');
}

async function handleFilesSelected(event) {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) {
    sourceFiles = [];
    setInputMeta('-');
    setInputPreview(null);
    resetOutput();
    return;
  }

  const validImages = files.filter((file) => file.type.startsWith('image/'));
  if (!validImages.length) {
    showError(t('imageToPdfInvalidFiles') || 'Please select image files only.');
    sourceFiles = [];
    setInputMeta('-');
    setInputPreview(null);
    resetOutput();
    return;
  }

  sourceFiles = validImages;
  const totalSizeKb = Math.round(validImages.reduce((sum, file) => sum + file.size, 0) / 1024);
  setInputMeta(`${validImages.length} files • ${totalSizeKb} KB`);
  setInputPreview(validImages[0], validImages.length);
  setStatus(t('imageToPdfFilesReady') || 'Images loaded. Click Create PDF.');
  resetOutput();
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-image-pdf-converter-overlay';
  overlay.className = 'toolary-image-pdf-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-image-pdf-converter';
  dialog.className = 'toolary-image-pdf-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-image-pdf-header">
      <strong class="toolary-image-pdf-title">${t('imageToPdfTitle') || 'Image to PDF'}</strong>
      <button id="toolary-image-pdf-close" type="button" class="toolary-image-pdf-btn">${t('close') || 'Close'}</button>
    </div>

    <label class="toolary-image-pdf-label">
      <span class="toolary-image-pdf-label-text">${t('imageToPdfSourceImages') || 'Source Images'}</span>
      <input id="toolary-image-pdf-files" type="file" accept="image/*" multiple class="toolary-image-pdf-input" />
    </label>

    <details class="toolary-image-pdf-advanced">
      <summary>${t('imageToPdfAdvancedOptions') || 'Advanced Options'}</summary>
      <div class="toolary-image-pdf-advanced-grid">
        <label class="toolary-image-pdf-label">
          <span class="toolary-image-pdf-label-text">${t('imageToPdfPageSize') || 'Page Size'}</span>
          <select id="toolary-image-pdf-page-size" class="toolary-image-pdf-select">
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
            <option value="auto">${t('imageToPdfAutoSize') || 'Auto (image size)'}</option>
          </select>
        </label>

        <label class="toolary-image-pdf-label">
          <span class="toolary-image-pdf-label-text">${t('imageToPdfOrientation') || 'Orientation'}</span>
          <select id="toolary-image-pdf-orientation" class="toolary-image-pdf-select">
            <option value="auto">${t('imageToPdfAuto') || 'Auto'}</option>
            <option value="portrait">${t('imageToPdfPortrait') || 'Portrait'}</option>
            <option value="landscape">${t('imageToPdfLandscape') || 'Landscape'}</option>
          </select>
        </label>

        <label class="toolary-image-pdf-label">
          <span class="toolary-image-pdf-label-text">${t('imageToPdfFitMode') || 'Fit Mode'}</span>
          <select id="toolary-image-pdf-fit" class="toolary-image-pdf-select">
            <option value="contain">${t('imageToPdfContain') || 'Contain (keep all)'}</option>
            <option value="cover">${t('imageToPdfCover') || 'Cover (fill page)'}</option>
          </select>
        </label>

        <label class="toolary-image-pdf-label">
          <span class="toolary-image-pdf-label-text">${t('imageToPdfMarginMm') || 'Margin (mm)'}</span>
          <input id="toolary-image-pdf-margin" type="number" min="0" max="40" step="1" value="10" class="toolary-image-pdf-input" />
        </label>

        <label class="toolary-image-pdf-label">
          <span class="toolary-image-pdf-label-text">${t('imageToPdfQuality') || 'Image Quality'}</span>
          <input id="toolary-image-pdf-quality" type="range" min="0.4" max="1" step="0.01" value="0.92" />
        </label>
      </div>
    </details>

    <div class="toolary-image-pdf-actions">
      <button id="toolary-image-pdf-build" type="button" class="toolary-image-pdf-btn">${t('imageToPdfBuild') || 'Create PDF'}</button>
      <button id="toolary-image-pdf-download" type="button" disabled class="toolary-image-pdf-btn">${t('imageToPdfDownload') || 'Download PDF'}</button>
    </div>

    <div id="toolary-image-pdf-status" class="toolary-image-pdf-status">${t('imageToPdfHint') || 'Choose one or more images, then create your PDF.'}</div>

    <div class="toolary-image-pdf-info-grid">
      <div class="toolary-image-pdf-card">
        <strong class="toolary-image-pdf-card-title">${t('imageToPdfInputInfo') || 'Input'}</strong>
        <div id="toolary-image-pdf-input-meta" class="toolary-image-pdf-card-meta">-</div>
      </div>
      <div class="toolary-image-pdf-card">
        <strong class="toolary-image-pdf-card-title">${t('imageToPdfInputPreview') || 'Input Preview'}</strong>
        <div id="toolary-image-pdf-input-preview-meta" class="toolary-image-pdf-preview-meta">${t('imageToPdfNoPreview') || 'No image selected yet.'}</div>
        <img id="toolary-image-pdf-input-preview" alt="${t('toolUiMediaPreviewAlt') || 'Tool preview'}" class="toolary-image-pdf-preview" />
      </div>
      <div class="toolary-image-pdf-card">
        <strong class="toolary-image-pdf-card-title">${t('imageToPdfOutputInfo') || 'Output'}</strong>
        <div id="toolary-image-pdf-output-meta" class="toolary-image-pdf-card-meta">-</div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
  enhanceToolUI(document);

  return overlay;
}

export async function activate(deactivate) {
  try {
    await ensureLanguageLoaded();
    deactivateCb = deactivate;

    if (panel) panel.remove();
    clearCleanup();
    cleanupPreviewUrl();
    sourceFiles = [];
    resetOutput();

    const root = createPanel();
    const closeBtn = panel.querySelector('#toolary-image-pdf-close');
    const fileInput = panel.querySelector('#toolary-image-pdf-files');
    const buildBtn = panel.querySelector('#toolary-image-pdf-build');
    const downloadBtn = panel.querySelector('#toolary-image-pdf-download');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleFilesSelected));
    cleanupFns.push(addEventListenerWithCleanup(buildBtn, 'click', buildPdf));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadPdf));
    cleanupFns.push(addEventListenerWithCleanup(root, 'click', (event) => {
      if (event.target === root) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'imageToPdfConverter.activate');
    showError(error.message || t('imageToPdfBuildFailed') || 'Failed to create PDF.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  cleanupPreviewUrl();
  outputBlob = null;
  sourceFiles = [];
  if (panel) {
    panel.remove();
    panel = null;
  }
  if (typeof deactivateCb === 'function') {
    const cb = deactivateCb;
    deactivateCb = null;
    cb();
  }
}
