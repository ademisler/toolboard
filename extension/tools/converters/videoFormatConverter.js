import {
  addEventListenerWithCleanup,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { openToolFullscreen } from '../../shared/toolUi.js';

export const metadata = {
  id: 'video-format-converter',
  name: 'Video Format Converter',
  category: 'converters',
  icon: 'video-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'video', 'webm', 'mp4'],
  keywords: ['video converter', 'webm converter', 'mp4 converter', 're-encode video']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let sourceFile = null;
let sourceMeta = null;
let outputBlob = null;
let outputUrl = '';
let isConverting = false;
let stylesInjected = false;

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'videoFormatConverter.clearCleanup');
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

function safeReloadMedia(mediaEl) {
  if (!mediaEl || typeof mediaEl.load !== 'function') return;
  const userAgent = String(window?.navigator?.userAgent || '');
  if (/jsdom/i.test(userAgent)) return;
  try {
    mediaEl.load();
  } catch {
    // Ignore environments that do not implement HTMLMediaElement.load (e.g. jsdom).
  }
}

function resetOutput() {
  outputBlob = null;
  cleanupOutputUrl();
  const outputMeta = panel?.querySelector('#toolary-video-convert-output-meta');
  if (outputMeta) outputMeta.textContent = '-';
  const downloadBtn = panel?.querySelector('#toolary-video-convert-download');
  if (downloadBtn) downloadBtn.disabled = true;
  const outputPreview = panel?.querySelector('#toolary-video-convert-preview-output');
  if (outputPreview) {
    outputPreview.removeAttribute('src');
    safeReloadMedia(outputPreview);
  }
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-video-convert-status');
  if (el) el.textContent = text || '';
}

async function openOutputFullscreen() {
  const preview = panel?.querySelector('#toolary-video-convert-preview-output');
  if (!preview || !preview.currentSrc) {
    showError(t('videoConverterNothingToPreview') || 'No converted video preview available.');
    return;
  }
  if (openToolFullscreen(preview)) return;
  showError(t('toolUiFullscreenNotSupported') || 'Fullscreen is not supported on this page.');
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
  if (stylesInjected || document.getElementById('toolary-video-convert-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-video-convert-styles';
  style.textContent = `
    .toolary-video-convert-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483646; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .toolary-video-convert-dialog { width: min(920px,100%); max-height: min(92vh,920px); overflow: auto; padding: 16px; border-radius: 14px; border: 1px solid var(--toolary-border); background: var(--toolary-bg); color: var(--toolary-text); box-shadow: 0 12px 36px rgba(0,0,0,.24); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display: grid; gap: 10px; }
    .toolary-video-convert-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .toolary-video-convert-title { font-size: 16px; font-weight: 700; }
    .toolary-video-convert-label { display: grid; gap: 6px; }
    .toolary-video-convert-label-text { font-size: 12px; opacity: .85; }
    .toolary-video-convert-input, .toolary-video-convert-select { padding: 8px; border-radius: 8px; border: 1px solid var(--toolary-border); background: var(--toolary-control-bg); color: var(--toolary-text); }
    .toolary-video-convert-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); }
    .toolary-video-convert-note { font-size: 12px; opacity: .92; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-video-convert-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .toolary-video-convert-btn { height: 38px; border-radius: 8px; border: 1px solid var(--toolary-border); color: var(--toolary-text); background: transparent; padding: 0 14px; cursor: pointer; }
    .toolary-video-convert-status { font-size: 12px; opacity: .92; padding: 8px; border: 1px solid var(--toolary-border); border-radius: 8px; background: var(--toolary-muted-bg); }
    .toolary-video-convert-meta-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); }
    .toolary-video-convert-card { border: 1px solid var(--toolary-border); border-radius: 8px; padding: 10px; }
    .toolary-video-convert-card-title { font-size: 12px; font-weight: 700; }
    .toolary-video-convert-card-meta { font-size: 12px; opacity: .85; margin-top: 4px; }
    .toolary-video-convert-preview-wrap { margin-top: 10px; border: 1px solid var(--toolary-border); border-radius: 8px; padding: 10px; background: var(--toolary-control-bg); }
    .toolary-video-convert-preview-label { font-size: 12px; display: block; margin-bottom: 8px; font-weight: 700; }
    .toolary-video-convert-preview { width: 100%; max-height: 360px; border-radius: 6px; background: var(--toolary-muted-bg); }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function formatDuration(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getSupportedTargets() {
  const targets = [];
  if (typeof window.MediaRecorder === 'undefined') return targets;

  const options = [
    { id: 'webm-vp9', label: 'WebM (VP9)', mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { id: 'webm-vp8', label: 'WebM (VP8)', mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { id: 'webm', label: 'WebM', mime: 'video/webm', ext: 'webm' },
    { id: 'mp4', label: 'MP4 (if supported)', mime: 'video/mp4', ext: 'mp4' }
  ];

  options.forEach((opt) => {
    if (window.MediaRecorder.isTypeSupported(opt.mime)) {
      targets.push(opt);
    }
  });
  return targets;
}

function getSelectedTarget() {
  const select = panel?.querySelector('#toolary-video-convert-format');
  const targets = getSupportedTargets();
  return targets.find((item) => item.id === select?.value) || targets[0];
}

function suggestFilename(file, ext) {
  const base = String(file?.name || 'video').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base}-converted.${ext}`;
}

function getScaledDimensions(srcW, srcH, mode) {
  const width = srcW || 1280;
  const height = srcH || 720;
  if (mode === 'original') return { width, height };

  const targetLongSide = Number(mode);
  if (!Number.isFinite(targetLongSide) || targetLongSide <= 0) {
    return { width, height };
  }

  const isLandscape = width >= height;
  const longSide = isLandscape ? width : height;
  const ratio = targetLongSide >= longSide ? 1 : (targetLongSide / longSide);

  let outW = Math.round(width * ratio);
  let outH = Math.round(height * ratio);
  outW = Math.max(2, outW - (outW % 2));
  outH = Math.max(2, outH - (outH % 2));
  return { width: outW, height: outH };
}

async function loadVideoMetadata(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video metadata load failed'));
    });
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function handleSourceFileChange(event) {
  const file = event?.target?.files?.[0];
  sourceFile = null;
  sourceMeta = null;
  resetOutput();

  if (!file) {
    const inputMeta = panel?.querySelector('#toolary-video-convert-input-meta');
    if (inputMeta) inputMeta.textContent = '-';
    return;
  }

  if (!file.type.startsWith('video/')) {
    showError(t('videoConverterInvalidFile') || 'Please select a video file.');
    return;
  }

  try {
    setStatus(t('videoConverterLoading') || 'Loading video metadata...');
    const meta = await loadVideoMetadata(file);
    sourceFile = file;
    sourceMeta = meta;
    const inputMeta = panel?.querySelector('#toolary-video-convert-input-meta');
    if (inputMeta) {
      inputMeta.textContent = `${meta.width}x${meta.height} • ${formatDuration(meta.duration)} • ${Math.round(file.size / 1024)} KB`;
    }
    setStatus(t('videoConverterReady') || 'Video loaded. Click Convert.');
  } catch (error) {
    handleError(error, 'videoFormatConverter.handleSourceFileChange');
    sourceFile = null;
    sourceMeta = null;
    showError(error.message || t('videoConverterLoadFailed') || 'Failed to load video file.');
    setStatus('');
  }
}

async function convertVideo() {
  if (isConverting) return;
  if (!sourceFile || !sourceMeta) {
    showError(t('videoConverterNoFile') || 'Please choose a video file first.');
    return;
  }

  const target = getSelectedTarget();
  if (!target) {
    showError(t('videoConverterFormatUnsupported') || 'No supported output format in this browser.');
    return;
  }

  try {
    isConverting = true;
    resetOutput();
    setStatus(t('videoConverterPreparing') || 'Preparing conversion...');

    const fps = Math.max(10, Math.min(60, Number(panel?.querySelector('#toolary-video-convert-fps')?.value || 30)));
    const scaleMode = panel?.querySelector('#toolary-video-convert-resolution')?.value || 'original';
    const bitrateKbps = Math.max(300, Math.min(20000, Number(panel?.querySelector('#toolary-video-convert-bitrate')?.value || 2500)));
    const dims = getScaledDimensions(sourceMeta.width, sourceMeta.height, scaleMode);

    const sourceUrl = URL.createObjectURL(sourceFile);
    const video = document.createElement('video');
    video.src = sourceUrl;
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(t('videoConverterCanvasUnavailable') || 'Canvas rendering is unavailable.');
    }

    await new Promise((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(t('videoConverterLoadFailed') || 'Failed to load video file.'));
    });

    const sourceStream = typeof video.captureStream === 'function'
      ? video.captureStream()
      : (typeof video.webkitCaptureStream === 'function' ? video.webkitCaptureStream() : null);
    if (!sourceStream) {
      throw new Error(t('videoConverterCaptureUnsupported') || 'Video capture is not supported in this browser.');
    }

    const canvasStream = canvas.captureStream(fps);
    const outputStream = new window.MediaStream();
    const canvasTrack = canvasStream.getVideoTracks()[0];
    if (!canvasTrack) {
      throw new Error(t('videoConverterCaptureUnsupported') || 'Video capture is not supported in this browser.');
    }
    outputStream.addTrack(canvasTrack);

    sourceStream.getAudioTracks().forEach((track) => outputStream.addTrack(track));

    const recorder = new window.MediaRecorder(outputStream, {
      mimeType: target.mime,
      videoBitsPerSecond: bitrateKbps * 1000
    });

    const chunks = [];
    recorder.ondataavailable = (evt) => {
      if (evt.data?.size) chunks.push(evt.data);
    };

    let rafId = 0;
    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, dims.width, dims.height);
      if (!video.paused && !video.ended) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const finished = new Promise((resolve, reject) => {
      recorder.onerror = (evt) => reject(evt?.error || new Error('Recorder error'));
      recorder.onstop = () => resolve();
    });

    recorder.start(250);
    setStatus(t('videoConverterConvertingRealtime') || 'Converting video in real time...');
    await video.play();
    drawFrame();

    await new Promise((resolve) => {
      video.onended = () => resolve();
    });

    if (rafId) window.cancelAnimationFrame(rafId);
    if (recorder.state !== 'inactive') recorder.stop();

    await finished;
    outputBlob = new Blob(chunks, { type: target.mime });
    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(outputBlob);
    URL.revokeObjectURL(sourceUrl);

    const outputMeta = panel?.querySelector('#toolary-video-convert-output-meta');
    if (outputMeta) {
      outputMeta.textContent = `${dims.width}x${dims.height} • ${Math.round(outputBlob.size / 1024)} KB • ${target.label}`;
    }
    const outputPreview = panel?.querySelector('#toolary-video-convert-preview-output');
    if (outputPreview) {
      outputPreview.src = outputUrl;
      safeReloadMedia(outputPreview);
    }
    const downloadBtn = panel?.querySelector('#toolary-video-convert-download');
    if (downloadBtn) downloadBtn.disabled = false;

    setStatus(t('videoConverterConverted') || 'Conversion completed. Ready to download.');
    showSuccess(t('videoConverterConverted') || 'Conversion completed. Ready to download.');
  } catch (error) {
    handleError(error, 'videoFormatConverter.convertVideo');
    setStatus('');
    showError(error.message || t('videoConverterConvertFailed') || 'Video conversion failed.');
  } finally {
    isConverting = false;
  }
}

function downloadOutput() {
  if (!outputBlob || !outputUrl || !sourceFile) {
    showError(t('videoConverterNothingToDownload') || 'No converted video to download.');
    return;
  }
  const target = getSelectedTarget();
  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = suggestFilename(sourceFile, target?.ext || 'webm');
  document.body.appendChild(link);
  link.click();
  link.remove();
  showSuccess(t('videoConverterDownloaded') || 'Converted video downloaded.');
  showCoffeeMessageForTool('video-format-converter');
}

function createPanel() {
  const theme = resolveThemeVars();
  ensureStyles();
  const supported = getSupportedTargets();
  const optionHtml = supported.length
    ? supported.map((item) => `<option value="${item.id}">${item.label}</option>`).join('')
    : `<option value="">${t('videoConverterNoFormats') || 'No supported output formats'}</option>`;

  const overlay = document.createElement('div');
  overlay.id = 'toolary-video-convert-overlay';
  overlay.className = 'toolary-video-convert-overlay';

  const dialog = document.createElement('div');
  dialog.id = 'toolary-video-convert-dialog';
  dialog.className = 'toolary-video-convert-dialog';
  dialog.style.cssText = `--toolary-bg:${theme.bg};--toolary-text:${theme.text};--toolary-border:${theme.border};--toolary-control-bg:${theme.controlBg};--toolary-muted-bg:${theme.mutedBg};`;

  dialog.innerHTML = `
    <div class="toolary-video-convert-header">
      <strong class="toolary-video-convert-title">${t('videoConverterTitle') || 'Video Format Converter'}</strong>
      <button id="toolary-video-convert-close" type="button" class="toolary-video-convert-btn">${t('close') || 'Close'}</button>
    </div>

    <label class="toolary-video-convert-label">
      <span class="toolary-video-convert-label-text">${t('videoConverterSourceFile') || 'Source Video File'}</span>
      <input id="toolary-video-convert-file" type="file" accept="video/*" class="toolary-video-convert-input" />
    </label>

    <div class="toolary-video-convert-grid">
      <label class="toolary-video-convert-label">
        <span class="toolary-video-convert-label-text">${t('videoConverterTargetFormat') || 'Target Format'}</span>
        <select id="toolary-video-convert-format" class="toolary-video-convert-select">${optionHtml}</select>
      </label>
      <label class="toolary-video-convert-label">
        <span class="toolary-video-convert-label-text">${t('videoConverterResolution') || 'Resolution'}</span>
        <select id="toolary-video-convert-resolution" class="toolary-video-convert-select">
          <option value="original">${t('videoConverterResolutionOriginal') || 'Original'}</option>
          <option value="1080">1080p</option>
          <option value="720">720p</option>
          <option value="480">480p</option>
        </select>
      </label>
      <label class="toolary-video-convert-label">
        <span class="toolary-video-convert-label-text">${t('videoConverterFps') || 'FPS'}</span>
        <select id="toolary-video-convert-fps" class="toolary-video-convert-select">
          <option value="30">30</option>
          <option value="24">24</option>
          <option value="15">15</option>
        </select>
      </label>
      <label class="toolary-video-convert-label">
        <span class="toolary-video-convert-label-text">${t('videoConverterBitrate') || 'Bitrate (kbps)'}</span>
        <input id="toolary-video-convert-bitrate" type="number" min="300" max="20000" step="100" value="2500" class="toolary-video-convert-input" />
      </label>
    </div>

    <div class="toolary-video-convert-note">${t('videoConverterRealtimeHint') || 'Video conversion runs in real time in browser. A 2-minute video may take about 2 minutes.'}</div>

    <div class="toolary-video-convert-actions">
      <button id="toolary-video-convert-run" type="button" class="toolary-video-convert-btn">${t('videoConverterConvert') || 'Convert Video'}</button>
      <button id="toolary-video-convert-download" type="button" disabled class="toolary-video-convert-btn">${t('videoConverterDownload') || 'Download Video'}</button>
      <button id="toolary-video-convert-fullscreen" type="button" class="toolary-video-convert-btn">${t('toolUiFullscreenOpen') || 'Fullscreen'}</button>
    </div>

    <div id="toolary-video-convert-status" class="toolary-video-convert-status">${t('videoConverterHint') || 'Choose a video file, then click Convert.'}</div>

    <div class="toolary-video-convert-meta-grid">
      <div class="toolary-video-convert-card">
        <strong class="toolary-video-convert-card-title">${t('videoConverterInputInfo') || 'Input'}</strong>
        <div id="toolary-video-convert-input-meta" class="toolary-video-convert-card-meta">-</div>
      </div>
      <div class="toolary-video-convert-card">
        <strong class="toolary-video-convert-card-title">${t('videoConverterOutputInfo') || 'Output'}</strong>
        <div id="toolary-video-convert-output-meta" class="toolary-video-convert-card-meta">-</div>
      </div>
    </div>

    <div class="toolary-video-convert-preview-wrap">
      <strong class="toolary-video-convert-preview-label">${t('videoConverterPreview') || 'Preview'}</strong>
      <video id="toolary-video-convert-preview-output" controls preload="metadata" class="toolary-video-convert-preview"></video>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
}

export async function activate(deactivate) {
  try {
    await ensureLanguageLoaded();
    deactivateCb = deactivate;
    sourceFile = null;
    sourceMeta = null;
    outputBlob = null;
    isConverting = false;

    if (panel) panel.remove();
    clearCleanup();
    createPanel();
    resetOutput();

    const closeBtn = panel.querySelector('#toolary-video-convert-close');
    const fileInput = panel.querySelector('#toolary-video-convert-file');
    const runBtn = panel.querySelector('#toolary-video-convert-run');
    const downloadBtn = panel.querySelector('#toolary-video-convert-download');
    const fullscreenBtn = panel.querySelector('#toolary-video-convert-fullscreen');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleSourceFileChange));
    cleanupFns.push(addEventListenerWithCleanup(runBtn, 'click', convertVideo));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadOutput));
    cleanupFns.push(addEventListenerWithCleanup(fullscreenBtn, 'click', openOutputFullscreen));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'videoFormatConverter.activate');
    showError(error.message || t('videoConverterConvertFailed') || 'Video conversion failed.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  sourceFile = null;
  sourceMeta = null;
  outputBlob = null;
  isConverting = false;
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
