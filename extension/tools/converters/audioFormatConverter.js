import {
  addEventListenerWithCleanup,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'audio-format-converter',
  name: 'Audio Format Converter',
  category: 'converters',
  icon: 'audio-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'audio', 'wav', 'ogg', 'webm'],
  keywords: ['audio converter', 'wav converter', 'ogg converter', 'webm audio']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let sourceFile = null;
let sourceAudioBuffer = null;
let outputBlob = null;
let outputUrl = '';
let isConverting = false;
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-audio-convert-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-audio-convert-styles';
  style.textContent = `
    #toolary-audio-convert-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-audio-convert-dialog{width:min(860px,100%);max-height:min(92vh,920px);overflow:auto;border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-audio-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
    .toolary-audio-title{font-size:16px;}
    .toolary-audio-label{display:grid;gap:6px;}
    .toolary-audio-label--file{margin-bottom:10px;}
    .toolary-audio-caption{font-size:12px;opacity:.85;}
    .toolary-audio-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-audio-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-audio-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:10px;}
    #toolary-audio-convert-realtime-hint{display:none;font-size:12px;opacity:.9;margin-bottom:10px;padding:8px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-audio-muted-bg,rgba(127,127,127,.08));}
    #toolary-audio-convert-realtime-hint.is-visible{display:block;}
    .toolary-audio-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
    .toolary-audio-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-audio-btn:disabled{cursor:not-allowed;opacity:.9;}
    #toolary-audio-convert-status{font-size:12px;opacity:.9;margin-bottom:10px;padding:8px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-audio-muted-bg,rgba(127,127,127,.08));}
    .toolary-audio-meta-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));}
    .toolary-audio-meta-card{border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;padding:10px;}
    .toolary-audio-meta-title{font-size:12px;}
    .toolary-audio-meta-value{font-size:12px;opacity:.85;margin-top:4px;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'audioFormatConverter.clearCleanup');
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

function resetOutput() {
  outputBlob = null;
  cleanupOutputUrl();
  const outputMeta = panel?.querySelector('#toolary-audio-convert-output-meta');
  if (outputMeta) outputMeta.textContent = '-';
  const downloadBtn = panel?.querySelector('#toolary-audio-convert-download');
  if (downloadBtn) downloadBtn.disabled = true;
}

function setStatus(text) {
  const el = panel?.querySelector('#toolary-audio-convert-status');
  if (el) el.textContent = text || '';
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

function formatDuration(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function audioBufferToWav(audioBuffer, targetSampleRate = audioBuffer.sampleRate) {
  const sourceRate = audioBuffer.sampleRate;
  const channels = Math.min(2, audioBuffer.numberOfChannels);
  const duration = audioBuffer.duration;
  const sampleRate = Math.max(8000, Math.min(96000, Number(targetSampleRate) || sourceRate));

  let channelData = [];
  if (Math.abs(sampleRate - sourceRate) < 1) {
    channelData = Array.from({ length: channels }, (_, c) => audioBuffer.getChannelData(c));
  } else {
    const frameCount = Math.max(1, Math.round(duration * sampleRate));
    channelData = Array.from({ length: channels }, (_, c) => {
      const src = audioBuffer.getChannelData(c);
      const out = new Float32Array(frameCount);
      for (let i = 0; i < frameCount; i += 1) {
        const srcIndex = (i * sourceRate) / sampleRate;
        const i0 = Math.floor(srcIndex);
        const i1 = Math.min(src.length - 1, i0 + 1);
        const frac = srcIndex - i0;
        out[i] = (src[i0] * (1 - frac)) + (src[i1] * frac);
      }
      return out;
    });
  }

  const length = channelData[0].length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const s = Math.max(-1, Math.min(1, channelData[c][i]));
      const pcm = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function audioBufferToRecordedBlob(audioBuffer, mimeType) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || typeof window.MediaRecorder === 'undefined') {
    throw new Error(t('audioConverterRecorderUnavailable') || 'This format is not supported in your browser.');
  }

  const ctx = new AudioCtx({ sampleRate: audioBuffer.sampleRate });
  try {
    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(destination);

    const recorder = new window.MediaRecorder(destination.stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };

    const finished = new Promise((resolve, reject) => {
      recorder.onerror = (event) => reject(event?.error || new Error('Recorder error'));
      recorder.onstop = () => resolve();
    });

    recorder.start();
    source.start();
    source.onended = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };

    await finished;
    return new Blob(chunks, { type: mimeType });
  } finally {
    await ctx.close();
  }
}

function getSupportedTargets() {
  const targets = [
    { id: 'wav', label: 'WAV', mime: 'audio/wav', ext: 'wav', realtime: false }
  ];
  if (typeof window.MediaRecorder !== 'undefined') {
    if (window.MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      targets.push({ id: 'ogg', label: 'Ogg Opus', mime: 'audio/ogg;codecs=opus', ext: 'ogg', realtime: true });
    }
    if (window.MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      targets.push({ id: 'webm', label: 'WebM Opus', mime: 'audio/webm;codecs=opus', ext: 'webm', realtime: true });
    }
  }
  return targets;
}

function getSelectedTarget() {
  const select = panel?.querySelector('#toolary-audio-convert-format');
  const targets = getSupportedTargets();
  return targets.find((item) => item.id === select?.value) || targets[0];
}

function suggestFilename(file, ext) {
  const base = String(file?.name || 'audio').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base}-converted.${ext}`;
}

function updateRealtimeHint() {
  const selected = getSelectedTarget();
  const hint = panel?.querySelector('#toolary-audio-convert-realtime-hint');
  if (!hint) return;
  hint.classList.toggle('is-visible', Boolean(selected?.realtime));
}

async function handleSourceFileChange(event) {
  const file = event?.target?.files?.[0];
  sourceFile = null;
  sourceAudioBuffer = null;
  resetOutput();

  if (!file) {
    const inputMeta = panel?.querySelector('#toolary-audio-convert-input-meta');
    if (inputMeta) inputMeta.textContent = '-';
    return;
  }

  if (!file.type.startsWith('audio/')) {
    showError(t('audioConverterInvalidFile') || 'Please select an audio file.');
    return;
  }

  try {
    setStatus(t('audioConverterLoading') || 'Loading audio file...');
    const bytes = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      throw new Error(t('audioConverterDecodeUnavailable') || 'Audio decoding is not supported in this browser.');
    }
    const ctx = new AudioCtx();
    try {
      sourceAudioBuffer = await ctx.decodeAudioData(bytes.slice(0));
    } finally {
      await ctx.close();
    }
    sourceFile = file;

    const inputMeta = panel?.querySelector('#toolary-audio-convert-input-meta');
    if (inputMeta) {
      inputMeta.textContent = `${formatDuration(sourceAudioBuffer.duration)} • ${Math.round(file.size / 1024)} KB • ${sourceAudioBuffer.sampleRate} Hz`;
    }
    setStatus(t('audioConverterReady') || 'Audio loaded. Click Convert.');
  } catch (error) {
    handleError(error, 'audioFormatConverter.handleSourceFileChange');
    sourceFile = null;
    sourceAudioBuffer = null;
    showError(error.message || t('audioConverterDecodeFailed') || 'Failed to decode audio file.');
    setStatus('');
  }
}

async function convertAudio() {
  if (isConverting) return;
  if (!sourceFile || !sourceAudioBuffer) {
    showError(t('audioConverterNoFile') || 'Please choose an audio file first.');
    return;
  }

  try {
    isConverting = true;
    resetOutput();
    const target = getSelectedTarget();
    const sampleRate = Number(panel?.querySelector('#toolary-audio-convert-samplerate')?.value || sourceAudioBuffer.sampleRate);

    if (target.realtime) {
      setStatus(t('audioConverterConvertingRealtime') || 'Converting audio in real time...');
      outputBlob = await audioBufferToRecordedBlob(sourceAudioBuffer, target.mime);
    } else {
      setStatus(t('audioConverterConverting') || 'Converting audio...');
      outputBlob = audioBufferToWav(sourceAudioBuffer, sampleRate);
    }

    cleanupOutputUrl();
    outputUrl = URL.createObjectURL(outputBlob);
    const outputMeta = panel?.querySelector('#toolary-audio-convert-output-meta');
    if (outputMeta) {
      outputMeta.textContent = `${Math.round(outputBlob.size / 1024)} KB • ${target.label}`;
    }
    const downloadBtn = panel?.querySelector('#toolary-audio-convert-download');
    if (downloadBtn) downloadBtn.disabled = false;
    setStatus(t('audioConverterConverted') || 'Conversion completed. Ready to download.');
    showSuccess(t('audioConverterConverted') || 'Conversion completed. Ready to download.');
  } catch (error) {
    handleError(error, 'audioFormatConverter.convertAudio');
    setStatus('');
    showError(error.message || t('audioConverterConvertFailed') || 'Audio conversion failed.');
  } finally {
    isConverting = false;
  }
}

function downloadOutput() {
  if (!outputBlob || !outputUrl || !sourceFile) {
    showError(t('audioConverterNothingToDownload') || 'No converted audio to download.');
    return;
  }
  const target = getSelectedTarget();
  const link = document.createElement('a');
  link.href = outputUrl;
  link.download = suggestFilename(sourceFile, target.ext);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showSuccess(t('audioConverterDownloaded') || 'Converted audio downloaded.');
  showCoffeeMessageForTool('audio-format-converter');
}

function createPanel() {
  const theme = resolveThemeVars();
  const supported = getSupportedTargets();
  const targetOptions = supported.map((item) => `<option value="${item.id}">${item.label}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'toolary-audio-convert-overlay';
  overlay.style.setProperty('--toolary-audio-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-audio-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-audio-convert-dialog';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-audio-header">
      <strong class="toolary-audio-title">${t('audioConverterTitle') || 'Audio Format Converter'}</strong>
      <button id="toolary-audio-convert-close" class="toolary-audio-btn" type="button">${t('close') || 'Close'}</button>
    </div>

    <label class="toolary-audio-label toolary-audio-label--file">
      <span class="toolary-audio-caption">${t('audioConverterSourceFile') || 'Source Audio File'}</span>
      <input id="toolary-audio-convert-file" class="toolary-audio-control" type="file" accept="audio/*" />
    </label>

    <div class="toolary-audio-grid">
      <label class="toolary-audio-label">
        <span class="toolary-audio-caption">${t('audioConverterTargetFormat') || 'Target Format'}</span>
        <select id="toolary-audio-convert-format" class="toolary-audio-control">${targetOptions}</select>
      </label>
      <label class="toolary-audio-label">
        <span class="toolary-audio-caption">${t('audioConverterSampleRate') || 'WAV Sample Rate'}</span>
        <select id="toolary-audio-convert-samplerate" class="toolary-audio-control">
          <option value="22050">22050 Hz</option>
          <option value="44100" selected>44100 Hz</option>
          <option value="48000">48000 Hz</option>
        </select>
      </label>
    </div>

    <div id="toolary-audio-convert-realtime-hint">${t('audioConverterRealtimeHint') || 'This format uses real-time recording in browser. Conversion may take as long as the audio duration.'}</div>

    <div class="toolary-audio-actions">
      <button id="toolary-audio-convert-run" class="toolary-audio-btn" type="button">${t('audioConverterConvert') || 'Convert Audio'}</button>
      <button id="toolary-audio-convert-download" class="toolary-audio-btn" type="button" disabled>${t('audioConverterDownload') || 'Download Audio'}</button>
    </div>

    <div id="toolary-audio-convert-status">${t('audioConverterHint') || 'Choose an audio file, then click Convert.'}</div>

    <div class="toolary-audio-meta-grid">
      <div class="toolary-audio-meta-card">
        <strong class="toolary-audio-meta-title">${t('audioConverterInputInfo') || 'Input'}</strong>
        <div id="toolary-audio-convert-input-meta" class="toolary-audio-meta-value">-</div>
      </div>
      <div class="toolary-audio-meta-card">
        <strong class="toolary-audio-meta-title">${t('audioConverterOutputInfo') || 'Output'}</strong>
        <div id="toolary-audio-convert-output-meta" class="toolary-audio-meta-value">-</div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  panel = overlay;
}

export async function activate(deactivate) {
  try {
    await ensureLanguageLoaded();
    ensureStyles();
    deactivateCb = deactivate;
    sourceFile = null;
    sourceAudioBuffer = null;
    outputBlob = null;
    isConverting = false;

    if (panel) panel.remove();
    clearCleanup();
    createPanel();
    resetOutput();
    updateRealtimeHint();

    const closeBtn = panel.querySelector('#toolary-audio-convert-close');
    const fileInput = panel.querySelector('#toolary-audio-convert-file');
    const formatSelect = panel.querySelector('#toolary-audio-convert-format');
    const convertBtn = panel.querySelector('#toolary-audio-convert-run');
    const downloadBtn = panel.querySelector('#toolary-audio-convert-download');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleSourceFileChange));
    cleanupFns.push(addEventListenerWithCleanup(formatSelect, 'change', updateRealtimeHint));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', convertAudio));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadOutput));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'audioFormatConverter.activate');
    showError(error.message || t('audioConverterConvertFailed') || 'Audio conversion failed.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  cleanupOutputUrl();
  sourceFile = null;
  sourceAudioBuffer = null;
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
