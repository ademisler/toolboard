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
  id: 'subtitle-converter',
  name: 'Subtitle Converter',
  category: 'converters',
  icon: 'subtitle-convert',
  permissions: ['activeTab'],
  tags: ['converter', 'subtitle', 'srt', 'vtt'],
  keywords: ['subtitle converter', 'srt to vtt', 'vtt to srt', 'caption convert']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let outputText = '';
let outputExt = 'txt';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-subtitle-convert-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-subtitle-convert-styles';
  style.textContent = `
    #toolary-subtitle-convert-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-subtitle-convert-dialog{width:min(980px,100%);max-height:min(92vh,920px);overflow:auto;border:1px solid var(--toolary-border,#d1d5db);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-subtitle-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
    .toolary-subtitle-title{font-size:16px;}
    .toolary-subtitle-label{display:grid;gap:6px;}
    .toolary-subtitle-label--file{margin-bottom:10px;}
    .toolary-subtitle-caption{font-size:12px;opacity:.85;}
    .toolary-subtitle-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:var(--toolary-subtitle-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-subtitle-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:10px;}
    .toolary-subtitle-textareas{display:grid;gap:10px;grid-template-columns:1fr;margin-bottom:10px;}
    .toolary-subtitle-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
    .toolary-subtitle-btn{height:38px;border-radius:8px;border:1px solid var(--toolary-border,#d1d5db);background:transparent;color:var(--toolary-text,#111);padding:0 14px;cursor:pointer;}
    .toolary-subtitle-btn:disabled{cursor:not-allowed;opacity:.9;}
    .toolary-subtitle-textarea{resize:vertical;}
    #toolary-subtitle-status{font-size:12px;opacity:.9;padding:8px;border:1px solid var(--toolary-border,#d1d5db);border-radius:8px;background:var(--toolary-subtitle-muted-bg,rgba(127,127,127,.08));}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'subtitleConverter.clearCleanup');
    }
  });
  cleanupFns = [];
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

function getEl(selector) {
  return panel?.querySelector(selector) || null;
}

function setStatus(text) {
  const el = getEl('#toolary-subtitle-status');
  if (el) el.textContent = text || '';
}

function setOutput(text, ext) {
  outputText = text || '';
  outputExt = ext || 'txt';
  const output = getEl('#toolary-subtitle-output');
  if (output) output.value = outputText;
  const downloadBtn = getEl('#toolary-subtitle-download');
  const copyBtn = getEl('#toolary-subtitle-copy');
  const hasOutput = Boolean(outputText);
  if (downloadBtn) downloadBtn.disabled = !hasOutput;
  if (copyBtn) copyBtn.disabled = !hasOutput;
}

function normalizeInput(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function timestampToMs(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/^((\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!m) return NaN;
  const hours = Number(m[2] || 0);
  const minutes = Number(m[3] || 0);
  const seconds = Number(m[4] || 0);
  const millis = Number(m[5] || 0);
  return (((hours * 60 + minutes) * 60) + seconds) * 1000 + millis;
}

function msToSrt(ms) {
  const value = Math.max(0, Math.round(ms));
  const h = Math.floor(value / 3600000);
  const m = Math.floor((value % 3600000) / 60000);
  const s = Math.floor((value % 60000) / 1000);
  const msPart = value % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
}

function msToVtt(ms) {
  const value = Math.max(0, Math.round(ms));
  const h = Math.floor(value / 3600000);
  const m = Math.floor((value % 3600000) / 60000);
  const s = Math.floor((value % 60000) / 1000);
  const msPart = value % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`;
}

function parseSrt(text) {
  const content = normalizeInput(text).trim();
  if (!content) return [];
  const blocks = content.split(/\n{2,}/);
  const cues = [];

  blocks.forEach((block) => {
    const lines = block.split('\n').map((line) => line.trimEnd());
    if (!lines.length) return;
    let idx = 0;
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    const timeLine = lines[idx] || '';
    const times = timeLine.split('-->').map((part) => part.trim());
    if (times.length !== 2) return;
    const startMs = timestampToMs(times[0]);
    const endMs = timestampToMs(times[1]);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const payload = lines.slice(idx + 1).join('\n');
    cues.push({ startMs, endMs, text: payload });
  });

  return cues;
}

function parseVtt(text) {
  const content = normalizeInput(text).replace(/^\uFEFF/, '');
  const lines = content.split('\n');
  let i = 0;
  if ((lines[0] || '').trim().startsWith('WEBVTT')) i = 1;
  while (i < lines.length && !lines[i].trim()) i += 1;

  const cues = [];
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i += 1;
    if (i >= lines.length) break;

    let maybeTimeLine = lines[i].trim();
    if (!maybeTimeLine.includes('-->')) {
      i += 1;
      if (i >= lines.length) break;
      maybeTimeLine = lines[i].trim();
    }

    if (!maybeTimeLine.includes('-->')) {
      i += 1;
      continue;
    }

    const [leftRaw, rightRaw] = maybeTimeLine.split('-->');
    const left = leftRaw.trim();
    const right = rightRaw.trim().split(/\s+/)[0];
    const startMs = timestampToMs(left);
    const endMs = timestampToMs(right);
    i += 1;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      continue;
    }

    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i].trimEnd());
      i += 1;
    }
    cues.push({ startMs, endMs, text: textLines.join('\n') });
  }

  return cues;
}

function cuesToSrt(cues) {
  return cues.map((cue, idx) => {
    const body = cue.text || '';
    return `${idx + 1}\n${msToSrt(cue.startMs)} --> ${msToSrt(cue.endMs)}\n${body}`;
  }).join('\n\n').trim();
}

function cuesToVtt(cues) {
  const payload = cues.map((cue) => `${msToVtt(cue.startMs)} --> ${msToVtt(cue.endMs)}\n${cue.text || ''}`).join('\n\n').trim();
  return `WEBVTT\n\n${payload}`.trim();
}

function detectFormat(text) {
  const value = normalizeInput(text).trim();
  if (!value) return 'unknown';
  if (value.startsWith('WEBVTT')) return 'vtt';
  if (/\d{2}:\d{2}:\d{2},\d{3}\s+-->/.test(value)) return 'srt';
  if (/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->/.test(value)) return 'vtt';
  return 'unknown';
}

function suggestFilename(ext) {
  return `subtitles-converted.${ext}`;
}

async function loadFileToInput(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.srt') && !lower.endsWith('.vtt') && !file.type.startsWith('text/')) {
    showError(t('subtitleInvalidFile') || 'Please select an SRT or VTT file.');
    return;
  }

  try {
    const text = await file.text();
    const input = getEl('#toolary-subtitle-input');
    if (input) input.value = normalizeInput(text);

    const formatSelect = getEl('#toolary-subtitle-source');
    if (formatSelect && lower.endsWith('.srt')) formatSelect.value = 'srt';
    if (formatSelect && lower.endsWith('.vtt')) formatSelect.value = 'vtt';

    setStatus(t('subtitleFileLoaded') || 'Subtitle file loaded.');
  } catch (error) {
    handleError(error, 'subtitleConverter.loadFileToInput');
    showError(error.message || t('subtitleLoadFailed') || 'Failed to read subtitle file.');
  }
}

function convertSubtitle() {
  try {
    const inputText = getEl('#toolary-subtitle-input')?.value || '';
    const source = getEl('#toolary-subtitle-source')?.value || 'auto';
    const target = getEl('#toolary-subtitle-target')?.value || 'vtt';
    const normalized = normalizeInput(inputText);

    if (!normalized.trim()) {
      showError(t('subtitleNoInput') || 'Please enter subtitle content first.');
      return;
    }

    let actualSource = source;
    if (source === 'auto') actualSource = detectFormat(normalized);
    if (!['srt', 'vtt'].includes(actualSource)) {
      throw new Error(t('subtitleDetectFailed') || 'Could not detect subtitle format. Please select source format manually.');
    }
    if (actualSource === target) {
      setOutput(normalized.trim(), target);
      setStatus(t('subtitleAlreadyTarget') || 'Source already matches target format.');
      return;
    }

    const cues = actualSource === 'srt' ? parseSrt(normalized) : parseVtt(normalized);
    if (!cues.length) {
      throw new Error(t('subtitleParseFailed') || 'Could not parse subtitle content.');
    }

    const converted = target === 'srt' ? cuesToSrt(cues) : cuesToVtt(cues);
    setOutput(converted, target);
    setStatus((t('subtitleConverted') || 'Converted $1 cues successfully.').replace('$1', String(cues.length)));
    showSuccess(t('subtitleConvertDone') || 'Subtitle converted successfully.');
  } catch (error) {
    handleError(error, 'subtitleConverter.convertSubtitle');
    setStatus('');
    showError(error.message || t('subtitleConvertFailed') || 'Subtitle conversion failed.');
  }
}

function downloadOutput() {
  if (!outputText) {
    showError(t('subtitleNothingToDownload') || 'No converted subtitle to download.');
    return;
  }
  const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestFilename(outputExt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showSuccess(t('subtitleDownloaded') || 'Subtitle file downloaded.');
  showCoffeeMessageForTool('subtitle-converter');
}

async function copyOutput() {
  if (!outputText) {
    showError(t('subtitleNothingToCopy') || 'No converted subtitle to copy.');
    return;
  }
  try {
    await navigator.clipboard.writeText(outputText);
    showSuccess(t('subtitleCopied') || 'Converted subtitle copied.');
    showCoffeeMessageForTool('subtitle-converter');
  } catch (error) {
    handleError(error, 'subtitleConverter.copyOutput');
    showError(error.message || t('subtitleCopyFailed') || 'Failed to copy subtitle text.');
  }
}

function createPanel() {
  const theme = resolveThemeVars();
  const overlay = document.createElement('div');
  overlay.id = 'toolary-subtitle-convert-overlay';
  overlay.style.setProperty('--toolary-subtitle-control-bg', theme.controlBg);
  overlay.style.setProperty('--toolary-subtitle-muted-bg', theme.mutedBg);

  const dialog = document.createElement('div');
  dialog.id = 'toolary-subtitle-convert-dialog';
  dialog.style.setProperty('--toolary-bg', theme.bg);
  dialog.style.setProperty('--toolary-text', theme.text);
  dialog.style.setProperty('--toolary-border', theme.border);

  dialog.innerHTML = `
    <div class="toolary-subtitle-header">
      <strong class="toolary-subtitle-title">${t('subtitleTitle') || 'Subtitle Converter (SRT/VTT)'}</strong>
      <button id="toolary-subtitle-close" class="toolary-subtitle-btn" type="button">${t('close') || 'Close'}</button>
    </div>

    <label class="toolary-subtitle-label toolary-subtitle-label--file">
      <span class="toolary-subtitle-caption">${t('subtitleFile') || 'Subtitle File'}</span>
      <input id="toolary-subtitle-file" class="toolary-subtitle-control" type="file" accept=".srt,.vtt,text/plain" />
    </label>

    <div class="toolary-subtitle-grid">
      <label class="toolary-subtitle-label">
        <span class="toolary-subtitle-caption">${t('subtitleSource') || 'Source Format'}</span>
        <select id="toolary-subtitle-source" class="toolary-subtitle-control">
          <option value="auto">${t('subtitleAuto') || 'Auto Detect'}</option>
          <option value="srt">SRT</option>
          <option value="vtt">VTT</option>
        </select>
      </label>
      <label class="toolary-subtitle-label">
        <span class="toolary-subtitle-caption">${t('subtitleTarget') || 'Target Format'}</span>
        <select id="toolary-subtitle-target" class="toolary-subtitle-control">
          <option value="vtt">VTT</option>
          <option value="srt">SRT</option>
        </select>
      </label>
    </div>

    <div class="toolary-subtitle-textareas">
      <label class="toolary-subtitle-label">
        <span class="toolary-subtitle-caption">${t('subtitleInput') || 'Input Subtitle'}</span>
        <textarea id="toolary-subtitle-input" rows="8" class="toolary-subtitle-control toolary-subtitle-textarea" placeholder="${t('subtitleInputPlaceholder') || 'Paste SRT or VTT text here...'}"></textarea>
      </label>
      <label class="toolary-subtitle-label">
        <span class="toolary-subtitle-caption">${t('subtitleOutput') || 'Output Subtitle'}</span>
        <textarea id="toolary-subtitle-output" rows="8" readonly class="toolary-subtitle-control toolary-subtitle-textarea"></textarea>
      </label>
    </div>

    <div class="toolary-subtitle-actions">
      <button id="toolary-subtitle-convert" class="toolary-subtitle-btn" type="button">${t('subtitleConvert') || 'Convert Subtitle'}</button>
      <button id="toolary-subtitle-download" class="toolary-subtitle-btn" type="button" disabled>${t('subtitleDownload') || 'Download'}</button>
      <button id="toolary-subtitle-copy" class="toolary-subtitle-btn" type="button" disabled>${t('subtitleCopy') || 'Copy'}</button>
    </div>

    <div id="toolary-subtitle-status">${t('subtitleHint') || 'Load subtitle file or paste subtitle text, then convert.'}</div>
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
    outputText = '';
    outputExt = 'txt';

    if (panel) panel.remove();
    clearCleanup();
    createPanel();
    setOutput('', 'txt');

    const closeBtn = getEl('#toolary-subtitle-close');
    const fileInput = getEl('#toolary-subtitle-file');
    const convertBtn = getEl('#toolary-subtitle-convert');
    const downloadBtn = getEl('#toolary-subtitle-download');
    const copyBtn = getEl('#toolary-subtitle-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivate()));
    cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', loadFileToInput));
    cleanupFns.push(addEventListenerWithCleanup(convertBtn, 'click', convertSubtitle));
    cleanupFns.push(addEventListenerWithCleanup(downloadBtn, 'click', downloadOutput));
    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', copyOutput));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) deactivate();
    }));
    cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', (event) => {
      if (event.key === 'Escape') deactivate();
    }));
  } catch (error) {
    handleError(error, 'subtitleConverter.activate');
    showError(error.message || t('subtitleConvertFailed') || 'Subtitle conversion failed.');
    deactivate();
  }
}

export function deactivate() {
  clearCleanup();
  outputText = '';
  outputExt = 'txt';
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
