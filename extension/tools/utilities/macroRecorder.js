import {
  addEventListenerWithCleanup,
  applyTheme,
  ensureLanguageLoaded,
  escapeHtml,
  handleError,
  sanitizeInput,
  showError,
  showInfo,
  showSuccess,
  t,
  validateSelector
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { createIconElement } from '../../shared/icons.js';
import {
  MACRO_RECORDER_STEP_TYPES,
  buildCsvContent,
  cloneValue,
  createMacro,
  createStep,
  normalizeLoopCount,
  normalizePositiveInt,
  reorderSteps,
  updateStep
} from './macroRecorderModel.js';
import {
  deleteMacro,
  getStoredMacros,
  importMacros,
  saveMacro
} from './macroRecorderStorage.js';
import {
  describeElement,
  generateSelector
} from './macroRecorderSelector.js';

export const metadata = {
  id: 'macro-recorder',
  name: 'Macro Recorder',
  category: 'utilities',
  icon: 'macro-recorder',
  permissions: ['activeTab', 'storage'],
  tags: ['automation', 'macro', 'recorder', 'playback'],
  keywords: ['macro', 'automation', 'record clicks', 'playback', 'workflow']
};

const STYLE_ID = 'toolary-macro-recorder-styles';
const ROOT_ID = 'toolary-macro-recorder-root';
const WIDGET_ID = 'toolary-macro-recorder-widget';
const SIDEBAR_ID = 'toolary-macro-recorder-sidebar';
const FILE_INPUT_ID = 'toolary-macro-recorder-import-file';
const COPY_DEBOUNCE_MS = 800;

let deactivateCallback = null;
let cleanupFns = [];
let recorderCleanupFns = [];
let timerIds = new Set();
let timerResolvers = new Map();
let root = null;
let floatingWidget = null;
let sidebar = null;
let fileInput = null;
let statusBar = null;
let stepBadge = null;
let activeModal = null;
let renderScheduled = false;

const state = createInitialState();

function createInitialState() {
  return {
    macros: {},
    selectedMacroId: null,
    pendingMacroName: '',
    editorNameDraft: '',
    activeView: 'library',
    sidebarCollapsed: false,
    isRecording: false,
    isPlaying: false,
    currentRecordingMacro: null,
    collectedRows: [],
    loopInfinite: false,
    loopCount: 1,
    playback: {
      stopRequested: false,
      currentStep: 0,
      totalSteps: 0,
      currentLoop: 0,
      totalLoops: 1,
      waiting: false
    },
    recorder: {
      stepCount: 0,
      lastHoveredElement: null,
      focusedInput: null,
      focusedInputValue: '',
      lastCopyTime: 0
    },
    dragStepIndex: null
  };
}

function msg(key, fallback) {
  const translated = t(key);
  if (!translated || translated === key) {
    return fallback;
  }
  return translated;
}

function showMacroRecorderSuccess(message, options = {}) {
  const { coffee = false } = options;
  showSuccess(message);
  if (coffee) {
    showCoffeeMessageForTool('macro-recorder');
  }
}

function isSupportedPage() {
  return typeof window !== 'undefined' &&
    typeof window.location?.protocol === 'string' &&
    ['http:', 'https:'].includes(window.location.protocol);
}

function queueRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  Promise.resolve().then(() => {
    renderScheduled = false;
    renderUI();
  });
}

function setSelectedMacro(macroId, view = null) {
  if (macroId && state.macros[macroId]) {
    state.selectedMacroId = macroId;
    state.editorNameDraft = state.macros[macroId].name || '';
  } else {
    state.selectedMacroId = null;
    state.editorNameDraft = '';
  }

  if (view) {
    state.activeView = view;
  }
  queueRender();
}

function getSelectedMacro() {
  if (!state.selectedMacroId) {
    return null;
  }
  return state.macros[state.selectedMacroId] || null;
}

function getSortedMacros() {
  return Object.values(state.macros).sort((left, right) => (
    (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
  ));
}

function registerTimer(timerId, resolver = null) {
  timerIds.add(timerId);
  if (typeof resolver === 'function') {
    timerResolvers.set(timerId, resolver);
  }
  return timerId;
}

function clearAllTimers() {
  timerIds.forEach((timerId) => {
    clearTimeout(timerId);
    const resolver = timerResolvers.get(timerId);
    if (resolver) {
      resolver();
    }
  });
  timerIds.clear();
  timerResolvers.clear();
}

function sleep(ms) {
  return new Promise((resolve) => {
    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timeoutId = registerTimer(setTimeout(() => {
      timerIds.delete(timeoutId);
      timerResolvers.delete(timeoutId);
      finalize();
    }, ms), finalize);
  });
}

function clearCleanupSet(items) {
  items.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      handleError(error, 'macroRecorder.clearCleanupSet');
    }
  });
  items.length = 0;
}

function resetPlaybackState() {
  state.isPlaying = false;
  state.playback = {
    stopRequested: false,
    currentStep: 0,
    totalSteps: 0,
    currentLoop: 0,
    totalLoops: 1,
    waiting: false
  };
}

function resetRecorderState() {
  state.isRecording = false;
  state.currentRecordingMacro = null;
  state.recorder = {
    stepCount: 0,
    lastHoveredElement: null,
    focusedInput: null,
    focusedInputValue: '',
    lastCopyTime: 0
  };
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '-';
  }
}

function safeFilename(input, fallback = 'macro-recorder') {
  const normalized = String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u00C0-\u024F]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || fallback;
}

function removeElement(element) {
  if (!element) return;
  if (typeof element.remove === 'function') {
    element.remove();
    return;
  }
  if (element.parentNode?.removeChild) {
    element.parentNode.removeChild(element);
  }
}

function dispatchSyntheticEvent(element, constructorName, eventName, options) {
  const EventConstructor = window?.[constructorName];
  if (typeof EventConstructor !== 'function') {
    return;
  }

  try {
    element.dispatchEvent(new EventConstructor(eventName, options));
  } catch {
    return;
  }
}

function isToolElement(node) {
  if (!node || typeof node.closest !== 'function') {
    return false;
  }
  return Boolean(node.closest(`#${ROOT_ID}, .toolary-macro-recorder-status-bar, .toolary-macro-recorder-step-badge`));
}

function isTextInputElement(element) {
  if (!element?.tagName) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;

  const type = String(element.type || 'text').toLowerCase();
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit'
  ].includes(type);
}

function getTrackableValue(element) {
  if (!element) return '';
  if (element.tagName?.toLowerCase() === 'select') {
    return String(element.value || '');
  }
  if (element.isContentEditable || element.contentEditable === 'true') {
    return String(element.textContent || '').trim();
  }
  return String(element.value || '');
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}{
      position:fixed;
      inset:auto 20px 20px auto;
      z-index:2147483644;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:var(--toolary-text,#111827);
      --toolary-macro-recorder-blue:#4f8ef7;
      --toolary-macro-recorder-purple:#8b5cf6;
      --toolary-macro-recorder-green:#22c55e;
      --toolary-macro-recorder-red:#ef4444;
      --toolary-macro-recorder-orange:#f59e0b;
      --toolary-macro-recorder-teal:#14b8a6;
      --toolary-macro-recorder-ink:#111827;
      --toolary-macro-recorder-panel:var(--toolary-code-bg,#f3f4f6);
      --toolary-macro-recorder-panel-strong:var(--toolary-button-bg,#ffffff);
      --toolary-macro-recorder-subtle-text:var(--toolary-secondary-text,var(--toolary-text-secondary,#6b7280));
    }
    #${WIDGET_ID}{
      width:58px;
      height:58px;
      border-radius:18px;
      border:1px solid rgba(79,142,247,.28);
      background:linear-gradient(135deg,var(--toolary-macro-recorder-blue),var(--toolary-macro-recorder-purple));
      color:#ffffff;
      box-shadow:0 18px 42px rgba(79,142,247,.28);
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      position:relative;
      transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
    }
    #${WIDGET_ID}:hover{
      transform:translateY(-1px);
      box-shadow:0 22px 48px rgba(79,142,247,.34);
    }
    #${WIDGET_ID}.is-recording{
      background:linear-gradient(135deg,var(--toolary-macro-recorder-red),#dc2626);
      border-color:rgba(239,68,68,.3);
      box-shadow:0 22px 48px rgba(239,68,68,.28);
    }
    #${WIDGET_ID}.is-playing{
      background:linear-gradient(135deg,var(--toolary-macro-recorder-green),#16a34a);
      border-color:rgba(34,197,94,.3);
      box-shadow:0 22px 48px rgba(34,197,94,.24);
    }
    .toolary-macro-recorder-widget-count{
      position:absolute;
      right:-4px;
      top:-4px;
      min-width:20px;
      height:20px;
      padding:0 6px;
      border-radius:999px;
      background:#0f172a;
      color:#ffffff;
      font-size:11px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:2px solid rgba(255,255,255,.92);
      box-sizing:border-box;
      box-shadow:0 10px 20px rgba(15,23,42,.2);
    }
    .toolary-macro-recorder-widget-count.is-recording{
      background:#7f1d1d;
    }
    .toolary-macro-recorder-widget-count.is-playing{
      background:#166534;
    }
    #${SIDEBAR_ID}{
      position:fixed;
      top:20px;
      right:20px;
      width:min(430px,calc(100vw - 40px));
      max-height:calc(100vh - 40px);
      background:var(--toolary-bg,#ffffff);
      color:var(--toolary-text,#111827);
      border:1px solid var(--toolary-border,#d1d5db);
      border-radius:22px;
      box-shadow:0 26px 60px rgba(15,23,42,.2);
      display:flex;
      flex-direction:column;
      overflow:hidden;
      transform:translateX(0);
      opacity:1;
      transition:transform .22s ease, opacity .22s ease;
    }
    #${SIDEBAR_ID}.is-collapsed{
      transform:translateX(calc(100% + 28px));
      opacity:0;
      pointer-events:none;
    }
    .toolary-macro-recorder-header{
      padding:16px 18px 14px;
      display:flex;
      justify-content:space-between;
      gap:12px;
      border-bottom:1px solid var(--toolary-border,#d1d5db);
      background:linear-gradient(180deg,rgba(15,23,42,.04),transparent);
    }
    .toolary-macro-recorder-title-wrap{
      display:flex;
      gap:12px;
      align-items:flex-start;
      min-width:0;
    }
    .toolary-macro-recorder-title-copy{
      display:flex;
      flex-direction:column;
      gap:6px;
      min-width:0;
    }
    .toolary-macro-recorder-title-row{
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
    }
    .toolary-macro-recorder-title{
      font-size:17px;
      font-weight:700;
      line-height:1.2;
    }
    .toolary-macro-recorder-subtitle{
      font-size:12px;
      color:var(--toolary-macro-recorder-subtle-text);
      line-height:1.45;
    }
    .toolary-macro-recorder-status-pill{
      display:inline-flex;
      align-items:center;
      gap:7px;
      min-height:28px;
      padding:5px 10px;
      border-radius:999px;
      border:1px solid rgba(127,127,127,.18);
      background:rgba(15,23,42,.06);
      color:var(--toolary-text,#111827);
      font-size:11px;
      font-weight:700;
      white-space:nowrap;
    }
    .toolary-macro-recorder-status-pill-dot{
      width:8px;
      height:8px;
      border-radius:999px;
      background:#6b7280;
      flex-shrink:0;
      box-shadow:0 0 0 5px rgba(107,114,128,.14);
    }
    .toolary-macro-recorder-status-pill.is-idle{
      border-color:rgba(79,142,247,.14);
      background:rgba(79,142,247,.08);
      color:#1d4ed8;
    }
    .toolary-macro-recorder-status-pill.is-idle .toolary-macro-recorder-status-pill-dot{
      background:var(--toolary-macro-recorder-blue);
      box-shadow:0 0 0 5px rgba(79,142,247,.14);
    }
    .toolary-macro-recorder-status-pill.is-recording{
      border-color:rgba(239,68,68,.18);
      background:rgba(239,68,68,.1);
      color:#b91c1c;
    }
    .toolary-macro-recorder-status-pill.is-recording .toolary-macro-recorder-status-pill-dot{
      background:var(--toolary-macro-recorder-red);
      box-shadow:0 0 0 5px rgba(239,68,68,.12);
    }
    .toolary-macro-recorder-status-pill.is-playing{
      border-color:rgba(34,197,94,.18);
      background:rgba(34,197,94,.11);
      color:#15803d;
    }
    .toolary-macro-recorder-status-pill.is-playing .toolary-macro-recorder-status-pill-dot{
      background:var(--toolary-macro-recorder-green);
      box-shadow:0 0 0 5px rgba(34,197,94,.12);
    }
    .toolary-macro-recorder-header-actions{
      display:flex;
      gap:8px;
      align-items:flex-start;
      flex-shrink:0;
    }
    .toolary-macro-recorder-shell-btn,
    .toolary-macro-recorder-btn,
    .toolary-macro-recorder-icon-btn,
    .toolary-macro-recorder-tab{
      border:1px solid var(--toolary-border,#d1d5db);
      background:var(--toolary-macro-recorder-panel-strong);
      color:var(--toolary-text,#111827);
      cursor:pointer;
      transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease;
    }
    .toolary-macro-recorder-shell-btn:hover,
    .toolary-macro-recorder-btn:hover,
    .toolary-macro-recorder-icon-btn:hover,
    .toolary-macro-recorder-tab:hover{
      transform:translateY(-1px);
    }
    .toolary-macro-recorder-shell-btn,
    .toolary-macro-recorder-icon-btn{
      width:36px;
      height:36px;
      border-radius:12px;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .toolary-macro-recorder-body{
      display:flex;
      flex-direction:column;
      min-height:0;
      overflow:hidden;
      flex:1;
    }
    .toolary-macro-recorder-tabs{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:8px;
      padding:14px 18px 0;
    }
    .toolary-macro-recorder-tab{
      border-radius:999px;
      padding:9px 14px;
      font-size:12px;
      font-weight:600;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      box-shadow:0 1px 0 rgba(255,255,255,.06) inset;
      color:var(--toolary-macro-recorder-subtle-text);
    }
    .toolary-macro-recorder-tab.is-active{
      background:rgba(79,142,247,.12);
      border-color:rgba(79,142,247,.22);
      color:#1d4ed8;
      box-shadow:none;
    }
    .toolary-macro-recorder-tab.is-active .toolary-macro-recorder-btn-icon{
      color:inherit;
    }
    .toolary-macro-recorder-panels{
      padding:14px 18px 18px;
      overflow:auto;
      min-height:0;
      flex:1;
      display:flex;
      flex-direction:column;
      gap:12px;
    }
    .toolary-macro-recorder-panel{
      display:none;
      flex-direction:column;
      gap:14px;
      min-height:0;
    }
    .toolary-macro-recorder-panel.is-active{
      display:flex;
    }
    .toolary-macro-recorder-card{
      border:1px solid var(--toolary-border,#d1d5db);
      border-radius:18px;
      padding:14px;
      background:var(--toolary-macro-recorder-panel-strong);
      display:flex;
      flex-direction:column;
      gap:12px;
    }
    .toolary-macro-recorder-card-title{
      font-size:13px;
      font-weight:700;
    }
    .toolary-macro-recorder-card-copy{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:5px;
    }
    .toolary-macro-recorder-card-note{
      font-size:12px;
      line-height:1.45;
      color:var(--toolary-macro-recorder-subtle-text);
    }
    .toolary-macro-recorder-muted-text{
      font-size:12px;
      line-height:1.45;
      color:var(--toolary-macro-recorder-subtle-text);
    }
    .toolary-macro-recorder-aux-actions{
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      gap:8px;
      justify-content:space-between;
    }
    .toolary-macro-recorder-aux-actions .toolary-macro-recorder-btn{
      min-height:36px;
      padding:8px 12px;
    }
    .toolary-macro-recorder-inline{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      align-items:center;
    }
    .toolary-macro-recorder-field{
      display:flex;
      flex-direction:column;
      gap:6px;
      min-width:0;
      flex:1;
    }
    .toolary-macro-recorder-label{
      font-size:12px;
      color:var(--toolary-macro-recorder-subtle-text);
      font-weight:600;
    }
    .toolary-macro-recorder-input,
    .toolary-macro-recorder-textarea,
    .toolary-macro-recorder-select{
      width:100%;
      border:1px solid var(--toolary-border,#d1d5db);
      border-radius:12px;
      padding:10px 12px;
      background:var(--toolary-macro-recorder-panel-strong);
      color:var(--toolary-text,#111827);
      box-sizing:border-box;
      font:inherit;
    }
    .toolary-macro-recorder-textarea{
      min-height:96px;
      resize:vertical;
    }
    .toolary-macro-recorder-btn{
      border-radius:12px;
      padding:10px 12px;
      font-size:12px;
      font-weight:700;
      display:inline-flex;
      gap:8px;
      align-items:center;
      justify-content:center;
      min-height:40px;
      color:inherit;
    }
    .toolary-macro-recorder-btn.is-primary{
      background:#111827;
      border-color:#111827;
      color:#ffffff;
    }
    .toolary-macro-recorder-btn.is-danger{
      background:#7f1d1d;
      border-color:#7f1d1d;
      color:#ffffff;
    }
    .toolary-macro-recorder-btn.is-muted{
      background:var(--toolary-macro-recorder-panel);
      color:var(--toolary-text,#111827);
    }
    .toolary-macro-recorder-btn[disabled]{
      opacity:.55;
      cursor:not-allowed;
      transform:none;
    }
    .toolary-macro-recorder-list{
      display:flex;
      flex-direction:column;
      gap:10px;
    }
    .toolary-macro-recorder-empty{
      padding:22px 16px;
      border-radius:16px;
      border:1px dashed var(--toolary-border,#d1d5db);
      text-align:center;
      font-size:13px;
      color:var(--toolary-macro-recorder-subtle-text);
      background:var(--toolary-macro-recorder-panel);
    }
    .toolary-macro-recorder-macro,
    .toolary-macro-recorder-step{
      display:flex;
      gap:12px;
      align-items:flex-start;
      padding:12px;
      border-radius:16px;
      border:1px solid var(--toolary-border,#d1d5db);
      background:var(--toolary-macro-recorder-panel);
    }
    .toolary-macro-recorder-macro.is-selected{
      border-color:#111827;
      box-shadow:inset 0 0 0 1px rgba(17,24,39,.12);
      background:rgba(17,24,39,.06);
    }
    .toolary-macro-recorder-step{
      cursor:grab;
    }
    .toolary-macro-recorder-step.is-drag-target{
      border-color:#111827;
      background:rgba(17,24,39,.08);
    }
    .toolary-macro-recorder-step.dragging{
      opacity:.55;
    }
    .toolary-macro-recorder-step-handle,
    .toolary-macro-recorder-type-badge{
      width:34px;
      height:34px;
      border-radius:12px;
      border:1px solid var(--toolary-border,#d1d5db);
      background:var(--toolary-bg,#ffffff);
      display:flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
    }
    .toolary-macro-recorder-type-badge{
      font-size:11px;
      font-weight:700;
      text-transform:uppercase;
    }
    .toolary-macro-recorder-macro-body,
    .toolary-macro-recorder-step-body{
      display:flex;
      flex-direction:column;
      gap:6px;
      min-width:0;
      flex:1;
    }
    .toolary-macro-recorder-macro-name,
    .toolary-macro-recorder-step-title{
      font-size:13px;
      font-weight:700;
      line-height:1.35;
      word-break:break-word;
    }
    .toolary-macro-recorder-step-meta,
    .toolary-macro-recorder-macro-meta{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      font-size:11px;
      opacity:.8;
    }
    .toolary-macro-recorder-chip{
      padding:4px 8px;
      border-radius:999px;
      background:var(--toolary-macro-recorder-panel);
      border:1px solid var(--toolary-border,#d1d5db);
      display:inline-flex;
      align-items:center;
      gap:4px;
      color:var(--toolary-macro-recorder-subtle-text);
    }
    .toolary-macro-recorder-actions{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      align-items:center;
    }
    .toolary-macro-recorder-row-actions{
      display:flex;
      flex-direction:column;
      gap:8px;
      flex-shrink:0;
    }
    .toolary-macro-recorder-checkbox{
      display:inline-flex;
      align-items:center;
      gap:8px;
      font-size:12px;
      font-weight:600;
    }
    .toolary-macro-recorder-progress{
      display:flex;
      flex-direction:column;
      gap:8px;
      font-size:12px;
    }
    .toolary-macro-recorder-progress-bar{
      width:100%;
      height:8px;
      border-radius:999px;
      background:rgba(127,127,127,.14);
      overflow:hidden;
    }
    .toolary-macro-recorder-progress-fill{
      height:100%;
      width:0;
      border-radius:999px;
      background:#111827;
      transition:width .2s ease;
    }
    .toolary-macro-recorder-status-bar{
      position:fixed;
      top:20px;
      left:50%;
      transform:translateX(-50%);
      z-index:2147483645;
      border-radius:999px;
      padding:10px 16px;
      border:1px solid var(--toolary-border,#d1d5db);
      background:var(--toolary-bg,#ffffff);
      color:var(--toolary-text,#111827);
      box-shadow:0 14px 34px rgba(15,23,42,.16);
      display:flex;
      align-items:center;
      gap:10px;
      font-size:13px;
      font-weight:700;
    }
    .toolary-macro-recorder-status-dot{
      width:10px;
      height:10px;
      border-radius:999px;
      background:#6b7280;
      flex-shrink:0;
    }
    .toolary-macro-recorder-status-bar.is-recording .toolary-macro-recorder-status-dot{
      background:#dc2626;
      box-shadow:0 0 0 8px rgba(220,38,38,.12);
    }
    .toolary-macro-recorder-status-bar.is-playing .toolary-macro-recorder-status-dot{
      background:#059669;
      box-shadow:0 0 0 8px rgba(5,150,105,.12);
    }
    .toolary-macro-recorder-step-badge{
      position:fixed;
      left:50%;
      bottom:20px;
      transform:translateX(-50%);
      z-index:2147483645;
      max-width:min(520px,calc(100vw - 40px));
      border-radius:16px;
      padding:10px 14px;
      border:1px solid var(--toolary-border,#d1d5db);
      background:var(--toolary-bg,#ffffff);
      color:var(--toolary-text,#111827);
      box-shadow:0 12px 30px rgba(15,23,42,.16);
      font-size:12px;
      line-height:1.4;
      text-align:center;
    }
    .toolary-macro-recorder-hover-highlight{
      outline:2px solid rgba(59,130,246,.9) !important;
      outline-offset:2px !important;
    }
    .toolary-macro-recorder-click-flash,
    .toolary-macro-recorder-play-highlight{
      box-shadow:0 0 0 4px rgba(16,185,129,.25),0 0 0 2px rgba(16,185,129,.85) inset !important;
      transition:box-shadow .18s ease;
    }
    .toolary-macro-recorder-modal{
      position:fixed;
      inset:0;
      z-index:2147483646;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:18px;
      background:rgba(15,23,42,.42);
      box-sizing:border-box;
    }
    .toolary-macro-recorder-modal-card{
      width:min(560px,100%);
      max-height:calc(100vh - 36px);
      overflow:auto;
      background:var(--toolary-bg,#ffffff);
      color:var(--toolary-text,#111827);
      border:1px solid var(--toolary-border,#d1d5db);
      border-radius:20px;
      box-shadow:0 24px 60px rgba(15,23,42,.28);
      padding:18px;
      display:flex;
      flex-direction:column;
      gap:14px;
    }
    .toolary-macro-recorder-modal-header{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:12px;
    }
    .toolary-macro-recorder-modal-title{
      font-size:16px;
      font-weight:700;
    }
    .toolary-macro-recorder-modal-subtitle{
      font-size:12px;
      opacity:.78;
      margin-top:4px;
      line-height:1.45;
    }
    .toolary-macro-recorder-modal-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      flex-wrap:wrap;
    }
    #${SIDEBAR_ID}{
      width:min(468px,calc(100vw - 40px));
    }
    .toolary-macro-recorder-header{
      padding:18px 18px 16px;
      background:linear-gradient(180deg, rgba(79,142,247,.08), rgba(79,142,247,0));
    }
    .toolary-macro-recorder-title-wrap{
      align-items:center;
    }
    .toolary-macro-recorder-title-emblem{
      width:42px;
      height:42px;
      border-radius:14px;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
      color:#ffffff;
      background:linear-gradient(135deg,#4f8ef7,#8b5cf6);
      box-shadow:0 14px 26px rgba(79,142,247,.24);
    }
    .toolary-macro-recorder-title{
      font-size:18px;
      letter-spacing:-.02em;
    }
    .toolary-macro-recorder-subtitle{
      font-size:12.5px;
      opacity:1;
    }
    .toolary-macro-recorder-card{
      padding:15px;
      gap:14px;
      background:var(--toolary-macro-recorder-panel-strong);
      border-color:var(--toolary-border,#d1d5db);
      box-shadow:none;
    }
    .toolary-macro-recorder-card.is-hero{
      border-color:rgba(79,142,247,.22);
      background:var(--toolary-macro-recorder-panel-strong);
    }
    .toolary-macro-recorder-card-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
    }
    .toolary-macro-recorder-card-title{
      font-size:14px;
      letter-spacing:-.01em;
    }
    .toolary-macro-recorder-btn-group,
    .toolary-macro-recorder-step-tools{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(136px,1fr));
      gap:10px;
    }
    .toolary-macro-recorder-step-tools{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
    .toolary-macro-recorder-btn,
    .toolary-macro-recorder-row-btn{
      min-height:40px;
      border-radius:12px;
      padding:10px 12px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      font-weight:700;
      line-height:1.2;
      background:var(--toolary-macro-recorder-panel);
      border:1px solid var(--toolary-border,#d1d5db);
      color:var(--toolary-text,#111827);
      box-shadow:none;
    }
    .toolary-macro-recorder-row-btn{
      min-height:32px;
      padding:8px 12px;
      font-size:11.5px;
      font-weight:700;
      white-space:nowrap;
    }
    .toolary-macro-recorder-btn:hover,
    .toolary-macro-recorder-row-btn:hover{
      background:rgba(79,142,247,.08);
      border-color:rgba(79,142,247,.2);
      transform:translateY(-1px);
    }
    .toolary-macro-recorder-btn.is-primary,
    .toolary-macro-recorder-row-btn.is-primary{
      background:linear-gradient(135deg,#111827,#1f2937);
      border-color:#111827;
      color:#ffffff;
      box-shadow:none;
    }
    .toolary-macro-recorder-btn.is-record{
      background:linear-gradient(135deg,#ef4444,#dc2626);
      border-color:#dc2626;
      color:#ffffff;
      box-shadow:none;
    }
    .toolary-macro-recorder-btn.is-play{
      background:linear-gradient(135deg,#22c55e,#16a34a);
      border-color:#16a34a;
      color:#ffffff;
      box-shadow:none;
    }
    .toolary-macro-recorder-btn.is-secondary{
      background:linear-gradient(135deg,#374151,#1f2937);
      border-color:#374151;
      color:#ffffff;
    }
    .toolary-macro-recorder-btn.is-muted,
    .toolary-macro-recorder-row-btn.is-muted{
      background:var(--toolary-macro-recorder-panel);
      border-color:var(--toolary-border,#d1d5db);
      color:var(--toolary-text,#111827);
    }
    .toolary-macro-recorder-btn.is-danger,
    .toolary-macro-recorder-row-btn.is-danger{
      background:rgba(220,38,38,.10);
      border-color:rgba(220,38,38,.24);
      color:#b91c1c;
    }
    .toolary-macro-recorder-btn.is-step-action.is-click{
      background:rgba(79,142,247,.11);
      border-color:rgba(79,142,247,.22);
      color:#2563eb;
    }
    .toolary-macro-recorder-btn.is-step-action.is-delay{
      background:rgba(245,158,11,.12);
      border-color:rgba(245,158,11,.24);
      color:#b45309;
    }
    .toolary-macro-recorder-btn.is-step-action.is-input{
      background:rgba(139,92,246,.12);
      border-color:rgba(139,92,246,.24);
      color:#7c3aed;
    }
    .toolary-macro-recorder-btn.is-step-action.is-copy{
      background:rgba(20,184,166,.12);
      border-color:rgba(20,184,166,.24);
      color:#0f766e;
    }
    .toolary-macro-recorder-btn-icon,
    .toolary-macro-recorder-type-icon{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
      color:inherit;
    }
    .toolary-macro-recorder-icon-only-btn{
      width:32px;
      height:32px;
      border-radius:10px;
      padding:0;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border:1px solid var(--toolary-border,#d1d5db);
      background:var(--toolary-macro-recorder-panel-strong);
      color:var(--toolary-text,#111827);
      cursor:pointer;
      transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease;
    }
    .toolary-macro-recorder-icon-only-btn:hover{
      background:rgba(79,142,247,.08);
      border-color:rgba(79,142,247,.2);
      transform:translateY(-1px);
    }
    .toolary-macro-recorder-icon-only-btn.is-danger{
      color:#b91c1c;
    }
    .toolary-macro-recorder-icon-only-btn.is-danger:hover{
      background:rgba(220,38,38,.08);
      border-color:rgba(220,38,38,.22);
    }
    .toolary-macro-recorder-icon-only-btn[disabled]{
      opacity:.55;
      cursor:not-allowed;
      transform:none;
    }
    .toolary-macro-recorder-macro,
    .toolary-macro-recorder-step{
      align-items:center;
      background:var(--toolary-macro-recorder-panel);
      border-color:var(--toolary-border,#d1d5db);
      box-shadow:none;
    }
    .toolary-macro-recorder-macro:hover,
    .toolary-macro-recorder-step:hover{
      border-color:rgba(79,142,247,.24);
      background:rgba(79,142,247,.055);
    }
    .toolary-macro-recorder-macro.is-selected{
      border-color:rgba(79,142,247,.4);
      box-shadow:0 0 0 1px rgba(79,142,247,.18) inset;
      background:rgba(79,142,247,.09);
    }
    .toolary-macro-recorder-type-badge{
      border:none;
      box-shadow:none;
    }
    .toolary-macro-recorder-type-badge.is-macro{
      background:rgba(79,142,247,.12);
      color:#2563eb;
    }
    .toolary-macro-recorder-type-badge.is-click{
      background:rgba(79,142,247,.12);
      color:#2563eb;
    }
    .toolary-macro-recorder-type-badge.is-delay{
      background:rgba(245,158,11,.12);
      color:#b45309;
    }
    .toolary-macro-recorder-type-badge.is-input{
      background:rgba(139,92,246,.12);
      color:#7c3aed;
    }
    .toolary-macro-recorder-type-badge.is-copy{
      background:rgba(20,184,166,.12);
      color:#0f766e;
    }
    .toolary-macro-recorder-type-badge.is-neutral{
      background:rgba(127,127,127,.12);
      color:var(--toolary-text,#111827);
    }
    .toolary-macro-recorder-step-handle{
      border-color:rgba(127,127,127,.2);
      background:rgba(15,23,42,.04);
      font-weight:700;
    }
    .toolary-macro-recorder-row-actions{
      flex-direction:row;
      flex-wrap:wrap;
      align-items:center;
      justify-content:flex-end;
      gap:6px;
      padding:0;
      border-radius:0;
      background:transparent;
      border:none;
    }
    .toolary-macro-recorder-macro-body.is-selectable{
      cursor:pointer;
    }
    .toolary-macro-recorder-loop-row{
      align-items:flex-end;
    }
    .toolary-macro-recorder-field--loop-count{
      flex:0 0 116px;
      max-width:116px;
    }
    .toolary-macro-recorder-input--loop-count{
      max-width:116px;
      text-align:center;
    }
    .toolary-macro-recorder-progress{
      padding:12px;
      border-radius:14px;
      background:var(--toolary-macro-recorder-panel);
      border:1px solid var(--toolary-border,#d1d5db);
    }
    .toolary-macro-recorder-progress-fill{
      background:linear-gradient(90deg,#2563eb,#22c55e);
    }
    #${ROOT_ID}.light-theme{
      --toolary-macro-recorder-shell-bg:#ffffff;
      --toolary-macro-recorder-panel:#f3f4f6;
      --toolary-macro-recorder-panel-strong:#ffffff;
      --toolary-macro-recorder-strong-text:#111827;
      --toolary-macro-recorder-subtle-text:#4b5563;
      --toolary-macro-recorder-placeholder:#6b7280;
    }
    #${ROOT_ID}.dark-theme{
      --toolary-macro-recorder-shell-bg:#24262b;
      --toolary-macro-recorder-panel:#343841;
      --toolary-macro-recorder-panel-strong:#3d434d;
      --toolary-macro-recorder-strong-text:#f8fafc;
      --toolary-macro-recorder-subtle-text:#d1d5db;
      --toolary-macro-recorder-placeholder:#9ca3af;
      --toolary-border:#5d6572;
    }
    #${SIDEBAR_ID}{
      background:var(--toolary-macro-recorder-shell-bg,var(--toolary-bg,#ffffff));
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
    }
    .toolary-macro-recorder-header{
      background:transparent;
    }
    .toolary-macro-recorder-title,
    .toolary-macro-recorder-card-title,
    .toolary-macro-recorder-macro-name,
    .toolary-macro-recorder-step-title,
    .toolary-macro-recorder-modal-title{
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
    }
    .toolary-macro-recorder-subtitle,
    .toolary-macro-recorder-card-note,
    .toolary-macro-recorder-muted-text,
    .toolary-macro-recorder-label,
    .toolary-macro-recorder-empty,
    .toolary-macro-recorder-chip,
    .toolary-macro-recorder-step-meta,
    .toolary-macro-recorder-macro-meta,
    .toolary-macro-recorder-modal-subtitle{
      color:var(--toolary-macro-recorder-subtle-text);
      opacity:1;
    }
    .toolary-macro-recorder-shell-btn,
    .toolary-macro-recorder-tab,
    .toolary-macro-recorder-icon-only-btn,
    .toolary-macro-recorder-btn.is-muted,
    .toolary-macro-recorder-row-btn.is-muted{
      background:var(--toolary-macro-recorder-panel);
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
      border-color:var(--toolary-border,#d1d5db);
    }
    .toolary-macro-recorder-shell-btn .toolary-icon,
    .toolary-macro-recorder-tab .toolary-icon,
    .toolary-macro-recorder-btn .toolary-icon,
    .toolary-macro-recorder-icon-only-btn .toolary-icon{
      stroke-width:2.2;
      color:currentColor;
    }
    .toolary-macro-recorder-tab{
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
    }
    .toolary-macro-recorder-tab.is-active{
      background:rgba(37,99,235,.18);
      border-color:rgba(96,165,250,.34);
      color:#dbeafe;
    }
    #${ROOT_ID}.light-theme .toolary-macro-recorder-tab.is-active{
      color:#1d4ed8;
    }
    .toolary-macro-recorder-status-pill{
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
    }
    .toolary-macro-recorder-status-pill.is-idle{
      background:rgba(37,99,235,.16);
      border-color:rgba(96,165,250,.28);
      color:#dbeafe;
    }
    #${ROOT_ID}.light-theme .toolary-macro-recorder-status-pill.is-idle{
      color:#1d4ed8;
    }
    .toolary-macro-recorder-status-pill.is-recording{
      background:rgba(220,38,38,.18);
      border-color:rgba(248,113,113,.28);
      color:#fee2e2;
    }
    #${ROOT_ID}.light-theme .toolary-macro-recorder-status-pill.is-recording{
      color:#b91c1c;
    }
    .toolary-macro-recorder-status-pill.is-playing{
      background:rgba(22,163,74,.18);
      border-color:rgba(74,222,128,.28);
      color:#dcfce7;
    }
    #${ROOT_ID}.light-theme .toolary-macro-recorder-status-pill.is-playing{
      color:#15803d;
    }
    .toolary-macro-recorder-input,
    .toolary-macro-recorder-textarea,
    .toolary-macro-recorder-select{
      background:var(--toolary-macro-recorder-panel);
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
      border-color:var(--toolary-border,#d1d5db);
      box-shadow:none;
      caret-color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
    }
    #${ROOT_ID}.light-theme .toolary-macro-recorder-input,
    #${ROOT_ID}.light-theme .toolary-macro-recorder-textarea,
    #${ROOT_ID}.light-theme .toolary-macro-recorder-select{
      background:#ffffff;
    }
    .toolary-macro-recorder-input::placeholder,
    .toolary-macro-recorder-textarea::placeholder{
      color:var(--toolary-macro-recorder-placeholder);
      opacity:1;
    }
    .toolary-macro-recorder-input:disabled,
    .toolary-macro-recorder-textarea:disabled,
    .toolary-macro-recorder-select:disabled{
      opacity:1;
      color:var(--toolary-macro-recorder-subtle-text);
      background:var(--toolary-macro-recorder-panel);
    }
    .toolary-macro-recorder-checkbox{
      color:var(--toolary-macro-recorder-strong-text,var(--toolary-text,#111827));
    }
    .toolary-macro-recorder-checkbox input{
      width:16px;
      height:16px;
      accent-color:#2563eb;
      flex-shrink:0;
    }
    .toolary-macro-recorder-chip{
      background:transparent;
      border-color:rgba(148,163,184,.26);
    }
    .toolary-macro-recorder-empty{
      background:transparent;
    }
    .toolary-macro-recorder-card-head{
      align-items:flex-start;
    }
    .toolary-macro-recorder-btn[disabled],
    .toolary-macro-recorder-icon-only-btn[disabled]{
      opacity:.72;
    }
    @media (max-width: 640px){
      #${ROOT_ID}{
        inset:auto 14px 14px auto;
      }
      #${SIDEBAR_ID}{
        top:14px;
        right:14px;
        left:14px;
        width:auto;
        max-height:calc(100vh - 28px);
      }
      .toolary-macro-recorder-title-row{
        align-items:flex-start;
      }
      .toolary-macro-recorder-tabs{
        grid-template-columns:1fr;
      }
      .toolary-macro-recorder-step-tools{
        grid-template-columns:1fr;
      }
      .toolary-macro-recorder-field--loop-count,
      .toolary-macro-recorder-input--loop-count{
        max-width:none;
      }
      .toolary-macro-recorder-row-actions{
        width:100%;
        justify-content:stretch;
      }
      .toolary-macro-recorder-row-btn{
        flex:1 1 0;
      }
    }
  `;

  document.head.appendChild(style);
}

function createRoot() {
  removeElement(document.getElementById(ROOT_ID));

  root = document.createElement('div');
  root.id = ROOT_ID;

  floatingWidget = document.createElement('button');
  floatingWidget.id = WIDGET_ID;
  floatingWidget.type = 'button';
  floatingWidget.setAttribute('aria-label', msg('macroRecorderWidgetAriaLabel', 'Open macro recorder'));
  floatingWidget.appendChild(createIconElement('macro-recorder', { size: 24 }));

  const widgetCount = document.createElement('span');
  widgetCount.className = 'toolary-macro-recorder-widget-count';
  widgetCount.id = 'toolary-macro-recorder-widget-count';
  floatingWidget.appendChild(widgetCount);

  sidebar = document.createElement('aside');
  sidebar.id = SIDEBAR_ID;

  fileInput = document.createElement('input');
  fileInput.id = FILE_INPUT_ID;
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.style.display = 'none';

  root.appendChild(floatingWidget);
  root.appendChild(sidebar);
  root.appendChild(fileInput);
  document.body.appendChild(root);
  applyTheme(root);

  attachStaticListeners();
  renderUI();
}

function createShellIconButton(action, iconName, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolary-macro-recorder-shell-btn';
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.appendChild(createIconElement(iconName, { size: 18 }));
  return button;
}

function buildDataAttributes(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([name, value]) => ` data-${escapeHtml(name)}="${escapeHtml(String(value))}"`)
    .join('');
}

function renderInlineIcon(iconName, size = 16, className = 'toolary-macro-recorder-btn-icon') {
  return `<span class="${escapeHtml(className)}" data-toolary-icon="${escapeHtml(iconName)}" data-icon-size="${escapeHtml(String(size))}" aria-hidden="true"></span>`;
}

function renderTabButton(view, iconName, label) {
  return `
    <button
      type="button"
      class="toolary-macro-recorder-tab${state.activeView === view ? ' is-active' : ''}"
      data-action="switch-view"
      data-view="${escapeHtml(view)}"
    >
      ${renderInlineIcon(iconName, 14, 'toolary-macro-recorder-btn-icon')}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderIconOnlyButton({
  action,
  label,
  iconName,
  tone = '',
  disabled = false,
  data = {}
}) {
  const classes = ['toolary-macro-recorder-icon-only-btn', tone].filter(Boolean).join(' ');
  return `
    <button
      type="button"
      class="${escapeHtml(classes)}"
      data-action="${escapeHtml(action)}"${buildDataAttributes(data)}
      ${disabled ? 'disabled' : ''}
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    >
      ${renderInlineIcon(iconName, 14, 'toolary-macro-recorder-btn-icon')}
    </button>
  `;
}

function hydrateInlineIcons(container) {
  if (!container) return;
  container.querySelectorAll('[data-toolary-icon]').forEach((slot) => {
    const iconName = slot.dataset.toolaryIcon;
    if (!iconName) return;

    const size = Number.parseInt(slot.dataset.iconSize || '16', 10) || 16;
    slot.textContent = '';
    slot.appendChild(createIconElement(iconName, { size, decorative: true }));
  });
}

function renderActionButton({
  action,
  label,
  iconName = null,
  tone = '',
  className = 'toolary-macro-recorder-btn',
  disabled = false,
  data = {}
}) {
  const classes = [className, tone].filter(Boolean).join(' ');
  const iconSize = className === 'toolary-macro-recorder-row-btn' ? 13 : 14;

  return `
    <button
      type="button"
      class="${escapeHtml(classes)}"
      data-action="${escapeHtml(action)}"${buildDataAttributes(data)}
      ${disabled ? 'disabled' : ''}
      title="${escapeHtml(label)}"
    >
      ${iconName ? renderInlineIcon(iconName, iconSize) : ''}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function getStepAppearance(type) {
  switch (type) {
    case MACRO_RECORDER_STEP_TYPES.CLICK:
      return { iconName: 'macro-recorder', toneClass: 'is-click' };
    case MACRO_RECORDER_STEP_TYPES.DELAY:
      return { iconName: 'file-text', toneClass: 'is-delay' };
    case MACRO_RECORDER_STEP_TYPES.INPUT_FILL:
      return { iconName: 'edit', toneClass: 'is-input' };
    case MACRO_RECORDER_STEP_TYPES.COPY_TEXT:
      return { iconName: 'copy', toneClass: 'is-copy' };
    default:
      return { iconName: 'list', toneClass: 'is-neutral' };
  }
}

function renderTypeBadge(type, fallbackTone = 'is-neutral') {
  const appearance = type ? getStepAppearance(type) : { iconName: 'list', toneClass: fallbackTone };
  return `
    <div class="toolary-macro-recorder-type-badge ${escapeHtml(appearance.toneClass || fallbackTone)}">
      ${renderInlineIcon(appearance.iconName, 15, 'toolary-macro-recorder-type-icon')}
    </div>
  `;
}

function attachStaticListeners() {
  cleanupFns.push(addEventListenerWithCleanup(floatingWidget, 'click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    queueRender();
  }));

  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'click', handleSidebarClick));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'input', handleSidebarInput));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'change', handleSidebarChange));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'dragstart', handleStepDragStart));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'dragover', handleStepDragOver));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'dragleave', handleStepDragLeave));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'drop', handleStepDrop));
  cleanupFns.push(addEventListenerWithCleanup(sidebar, 'dragend', handleStepDragEnd));
  cleanupFns.push(addEventListenerWithCleanup(fileInput, 'change', handleImportFileChange));

  cleanupFns.push(addEventListenerWithCleanup(document, 'keydown', handleGlobalKeydown, true));
}

function getModeLabel() {
  if (state.isRecording) {
    return msg('macroRecorderModeRecording', 'Recording');
  }
  if (state.isPlaying) {
    return msg('macroRecorderModePlaying', 'Playing');
  }
  return msg('macroRecorderModeIdle', 'Idle');
}

function getProgressPercent() {
  if (!state.playback.totalSteps) return 0;
  const percent = (state.playback.currentStep / state.playback.totalSteps) * 100;
  return Math.max(0, Math.min(100, percent));
}

function getStatusSummaryText() {
  if (state.isRecording) {
    return msg('macroRecorderRecordingSummary', '$1 steps captured')
      .replace('$1', String(state.recorder.stepCount));
  }
  if (state.isPlaying) {
    return msg('macroRecorderPlayingSummary', 'Step $1 of $2')
      .replace('$1', String(state.playback.currentStep || 0))
      .replace('$2', String(state.playback.totalSteps || 0));
  }
  return msg('macroRecorderIdleSummary', 'Ready on this page');
}

function renderUI() {
  if (!root || !sidebar || !floatingWidget) return;

  const selectedMacro = getSelectedMacro();
  const sortedMacros = getSortedMacros();
  const modeToneClass = state.isRecording
    ? 'is-recording'
    : (state.isPlaying ? 'is-playing' : 'is-idle');
  const widgetCount = root.querySelector('#toolary-macro-recorder-widget-count');
  const countValue = state.isRecording
    ? String(state.recorder.stepCount)
    : String(sortedMacros.length);

  floatingWidget.classList.toggle('is-recording', state.isRecording);
  floatingWidget.classList.toggle('is-playing', state.isPlaying);
  if (widgetCount) {
    widgetCount.textContent = countValue;
    widgetCount.classList.toggle('is-recording', state.isRecording);
    widgetCount.classList.toggle('is-playing', state.isPlaying);
  }

  sidebar.classList.toggle('is-collapsed', state.sidebarCollapsed);
  floatingWidget.setAttribute(
    'aria-label',
    state.sidebarCollapsed
      ? msg('macroRecorderWidgetExpand', 'Open macro recorder')
      : msg('macroRecorderWidgetCollapse', 'Collapse macro recorder')
  );

  sidebar.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'toolary-macro-recorder-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'toolary-macro-recorder-title-wrap';

  const titleEmblem = document.createElement('div');
  titleEmblem.className = 'toolary-macro-recorder-title-emblem';
  titleEmblem.appendChild(createIconElement('macro-recorder', { size: 18 }));
  titleWrap.appendChild(titleEmblem);

  const titleCopy = document.createElement('div');
  titleCopy.className = 'toolary-macro-recorder-title-copy';
  titleCopy.innerHTML = `
    <div class="toolary-macro-recorder-title-row">
      <div class="toolary-macro-recorder-title">${escapeHtml(msg('macroRecorderTitle', 'Macro Recorder'))}</div>
      <span class="toolary-macro-recorder-status-pill ${modeToneClass}">
        <span class="toolary-macro-recorder-status-pill-dot"></span>
        <span>${escapeHtml(getModeLabel())}</span>
      </span>
    </div>
    <div class="toolary-macro-recorder-subtitle">${escapeHtml(getStatusSummaryText())}</div>
  `;
  titleWrap.appendChild(titleCopy);

  const headerActions = document.createElement('div');
  headerActions.className = 'toolary-macro-recorder-header-actions';
  headerActions.appendChild(createShellIconButton(
    'close-tool',
    'close',
    msg('macroRecorderCloseButton', 'Close tool')
  ));

  header.appendChild(titleWrap);
  header.appendChild(headerActions);

  const body = document.createElement('div');
  body.className = 'toolary-macro-recorder-body';

  const tabs = document.createElement('div');
  tabs.className = 'toolary-macro-recorder-tabs';
  tabs.innerHTML = `
    ${renderTabButton('library', 'list', msg('macroRecorderTabLibrary', 'Library'))}
    ${renderTabButton('editor', 'edit', msg('macroRecorderTabEditor', 'Editor'))}
  `;

  const panels = document.createElement('div');
  panels.className = 'toolary-macro-recorder-panels';

  const libraryPanel = document.createElement('section');
  libraryPanel.className = `toolary-macro-recorder-panel${state.activeView === 'library' ? ' is-active' : ''}`;
  libraryPanel.innerHTML = renderLibraryPanel(sortedMacros, selectedMacro);

  const editorPanel = document.createElement('section');
  editorPanel.className = `toolary-macro-recorder-panel${state.activeView === 'editor' ? ' is-active' : ''}`;
  editorPanel.innerHTML = renderEditorPanel(selectedMacro);

  panels.appendChild(libraryPanel);
  panels.appendChild(editorPanel);

  body.appendChild(tabs);
  body.appendChild(panels);

  sidebar.appendChild(header);
  sidebar.appendChild(body);
  hydrateInlineIcons(sidebar);

  updateRuntimeDecorations();
}

function renderLibraryPanel(macros, selectedMacro) {
  const playbackDisabled = !selectedMacro || state.isRecording;
  const csvCount = state.collectedRows.length;
  const progressFill = getProgressPercent();
  const loopCount = normalizeLoopCount(state.loopCount);
  const recordingPrimaryAction = state.isRecording
    ? renderActionButton({
      action: 'stop-recording',
      label: msg('macroRecorderStopRecording', 'Stop and save'),
      iconName: 'close',
      tone: 'is-secondary'
    })
    : renderActionButton({
      action: 'start-recording',
      label: msg('macroRecorderStartRecording', 'Start recording'),
      iconName: 'macro-recorder',
      tone: 'is-record',
      disabled: state.isPlaying
    });
  const playbackPrimaryAction = state.isPlaying
    ? renderActionButton({
      action: 'stop-playback',
      label: msg('macroRecorderStopPlayback', 'Stop playback'),
      iconName: 'close',
      tone: 'is-secondary'
    })
    : renderActionButton({
      action: 'start-playback',
      label: msg('macroRecorderStartPlayback', 'Play macro'),
      iconName: 'play',
      tone: 'is-play',
      disabled: playbackDisabled
    });

  const macroListMarkup = macros.length
    ? macros.map((macro) => {
      const stepCount = Array.isArray(macro.steps) ? macro.steps.length : 0;
      const isSelected = macro.id === state.selectedMacroId;
      return `
        <div class="toolary-macro-recorder-macro${isSelected ? ' is-selected' : ''}">
          ${renderTypeBadge(null, 'is-macro')}
          <div
            class="toolary-macro-recorder-macro-body is-selectable"
            data-action="select-macro"
            data-macro-id="${escapeHtml(macro.id)}"
          >
            <div class="toolary-macro-recorder-macro-name">${escapeHtml(macro.name)}</div>
            <div class="toolary-macro-recorder-macro-meta">
              <span class="toolary-macro-recorder-chip">${escapeHtml(msg('macroRecorderStepCount', '$1 steps').replace('$1', String(stepCount)))}</span>
              <span class="toolary-macro-recorder-chip">${escapeHtml(formatDateTime(macro.updatedAt || macro.createdAt))}</span>
            </div>
          </div>
          <div class="toolary-macro-recorder-row-actions">
            ${renderIconOnlyButton({
              action: 'open-editor',
              label: msg('macroRecorderEditShort', 'Edit'),
              iconName: 'edit',
              data: { 'macro-id': macro.id }
            })}
            ${renderIconOnlyButton({
              action: 'delete-macro',
              label: msg('macroRecorderDeleteShort', 'Del'),
              iconName: 'trash',
              tone: 'is-danger',
              data: { 'macro-id': macro.id }
            })}
          </div>
        </div>
      `;
    }).join('')
    : `<div class="toolary-macro-recorder-empty">${escapeHtml(msg('macroRecorderEmptyState', 'No macros saved yet. Record one on this page to start.'))}</div>`;

  const playbackCardMarkup = selectedMacro ? `
    <div class="toolary-macro-recorder-card">
      <div class="toolary-macro-recorder-card-head">
        <div class="toolary-macro-recorder-card-copy">
          <div class="toolary-macro-recorder-card-title">${escapeHtml(msg('macroRecorderPlaybackTitle', 'Playback'))}</div>
          <div class="toolary-macro-recorder-card-note">${escapeHtml(selectedMacro.name)}</div>
        </div>
      </div>
      <div class="toolary-macro-recorder-inline toolary-macro-recorder-loop-row">
        <div class="toolary-macro-recorder-field toolary-macro-recorder-field--loop-count">
          <label class="toolary-macro-recorder-label" for="toolary-macro-recorder-loop-count">${escapeHtml(msg('macroRecorderLoopCount', 'Loop count'))}</label>
          <input id="toolary-macro-recorder-loop-count" class="toolary-macro-recorder-input toolary-macro-recorder-input--loop-count" type="number" min="1" max="999" value="${escapeHtml(String(loopCount))}" ${state.loopInfinite ? 'disabled' : ''} />
        </div>
        <label class="toolary-macro-recorder-checkbox">
          <input id="toolary-macro-recorder-loop-infinite" type="checkbox" ${state.loopInfinite ? 'checked' : ''} />
          <span>${escapeHtml(msg('macroRecorderInfiniteLoop', 'Infinite loop'))}</span>
        </label>
      </div>
      <div class="toolary-macro-recorder-btn-group">
        ${playbackPrimaryAction}
      </div>
      <div class="toolary-macro-recorder-progress">
        <div>${escapeHtml(state.isPlaying ? msg('macroRecorderProgressDetail', 'Loop $1, step $2 / $3').replace('$1', String(state.playback.currentLoop || 1)).replace('$2', String(state.playback.currentStep || 0)).replace('$3', String(state.playback.totalSteps || 0)) : msg('macroRecorderProgressIdle', 'Playback is idle.'))}</div>
        <div class="toolary-macro-recorder-progress-bar">
          <div class="toolary-macro-recorder-progress-fill" style="width:${progressFill}%"></div>
        </div>
      </div>
      ${csvCount ? `
        <div class="toolary-macro-recorder-aux-actions">
          <div class="toolary-macro-recorder-muted-text">${escapeHtml(msg('macroRecorderCsvCount', '$1 rows collected').replace('$1', String(csvCount)))}</div>
          <div class="toolary-macro-recorder-inline">
            ${renderActionButton({
              action: 'download-csv',
              label: msg('macroRecorderDownloadCsv', 'Download CSV'),
              iconName: 'download',
              tone: 'is-muted'
            })}
            ${renderActionButton({
              action: 'clear-csv',
              label: msg('macroRecorderClearCsv', 'Clear CSV'),
              iconName: 'trash',
              tone: 'is-muted'
            })}
          </div>
        </div>
      ` : ''}
    </div>
  ` : '';

  return `
    <div class="toolary-macro-recorder-card is-hero">
      <div class="toolary-macro-recorder-card-head">
        <div class="toolary-macro-recorder-card-copy">
          <div class="toolary-macro-recorder-card-title">${escapeHtml(msg('macroRecorderRecordCardTitle', 'Record on this page'))}</div>
          <div class="toolary-macro-recorder-card-note">${escapeHtml(getStatusSummaryText())}</div>
        </div>
      </div>
      <div class="toolary-macro-recorder-field">
        <label class="toolary-macro-recorder-label" for="toolary-macro-recorder-name-input">${escapeHtml(msg('macroRecorderNameLabel', 'Macro name'))}</label>
        <input id="toolary-macro-recorder-name-input" class="toolary-macro-recorder-input" type="text" value="${escapeHtml(state.pendingMacroName)}" placeholder="${escapeHtml(msg('macroRecorderNamePlaceholder', 'Checkout flow'))}" />
      </div>
      <div class="toolary-macro-recorder-btn-group">
        ${recordingPrimaryAction}
      </div>
      <div class="toolary-macro-recorder-aux-actions">
        <div class="toolary-macro-recorder-muted-text">${escapeHtml(state.isRecording ? msg('macroRecorderRecordingBadge', '$1 steps captured').replace('$1', String(state.recorder.stepCount)) : msg('macroRecorderStorageBadge', '$1 macros saved').replace('$1', String(macros.length)))}</div>
        ${renderActionButton({
          action: 'open-import',
          label: msg('macroRecorderImportJson', 'Import JSON'),
          iconName: 'upload',
          tone: 'is-muted'
        })}
      </div>
    </div>
    <div class="toolary-macro-recorder-card">
      <div class="toolary-macro-recorder-card-head">
        <div class="toolary-macro-recorder-card-copy">
          <div class="toolary-macro-recorder-card-title">${escapeHtml(msg('macroRecorderLibraryTitle', 'Macro library'))}</div>
        </div>
        <span class="toolary-macro-recorder-chip">${escapeHtml(String(macros.length))}</span>
      </div>
      <div class="toolary-macro-recorder-list">${macroListMarkup}</div>
    </div>
    ${playbackCardMarkup}
  `;
}

function getTypeLabel(type) {
  switch (type) {
    case MACRO_RECORDER_STEP_TYPES.CLICK:
      return msg('macroRecorderTypeClick', 'Click');
    case MACRO_RECORDER_STEP_TYPES.DELAY:
      return msg('macroRecorderTypeDelay', 'Delay');
    case MACRO_RECORDER_STEP_TYPES.INPUT_FILL:
      return msg('macroRecorderTypeInputFill', 'Input');
    case MACRO_RECORDER_STEP_TYPES.COPY_TEXT:
      return msg('macroRecorderTypeCopyText', 'Copy');
    default:
      return msg('macroRecorderTypeUnknown', 'Step');
  }
}

function renderStepMeta(step) {
  const chips = [];
  if (step.selector) {
    chips.push(`<span class="toolary-macro-recorder-chip">${escapeHtml(step.selector)}</span>`);
  }
  if (step.value) {
    chips.push(`<span class="toolary-macro-recorder-chip">${escapeHtml(msg('macroRecorderValueChip', 'Value: $1').replace('$1', step.value.slice(0, 36)))}</span>`);
  }
  if (step.duration) {
    chips.push(`<span class="toolary-macro-recorder-chip">${escapeHtml(msg('macroRecorderDurationChip', '$1 ms').replace('$1', String(step.duration)))}</span>`);
  }
  if (step.beforeDelay) {
    chips.push(`<span class="toolary-macro-recorder-chip">${escapeHtml(msg('macroRecorderBeforeDelayChip', 'Before: $1 ms').replace('$1', String(step.beforeDelay)))}</span>`);
  }
  if (step.sampleText) {
    chips.push(`<span class="toolary-macro-recorder-chip">${escapeHtml(msg('macroRecorderSampleTextChip', 'Sample: $1').replace('$1', step.sampleText.slice(0, 30)))}</span>`);
  }
  return chips.join('');
}

function renderEditorPanel(selectedMacro) {
  if (!selectedMacro) {
    return `
      <div class="toolary-macro-recorder-card">
        <div class="toolary-macro-recorder-empty">${escapeHtml(msg('macroRecorderEditorEmpty', 'Select a macro from the library to edit its steps.'))}</div>
      </div>
    `;
  }

  const stepsMarkup = selectedMacro.steps.length
    ? selectedMacro.steps.map((step, index) => `
      <div class="toolary-macro-recorder-step" draggable="true" data-step-index="${index}">
        <div class="toolary-macro-recorder-step-handle" title="${escapeHtml(msg('macroRecorderDragHandle', 'Drag to reorder'))}">
          ${escapeHtml(String(index + 1))}
        </div>
        ${renderTypeBadge(step.type)}
        <div class="toolary-macro-recorder-step-body">
          <div class="toolary-macro-recorder-step-title">${escapeHtml(step.description || getTypeLabel(step.type))}</div>
          <div class="toolary-macro-recorder-step-meta">
            <span class="toolary-macro-recorder-chip">${escapeHtml(getTypeLabel(step.type))}</span>
            ${renderStepMeta(step)}
          </div>
        </div>
        <div class="toolary-macro-recorder-row-actions">
          ${renderIconOnlyButton({
            action: 'edit-step',
            label: msg('macroRecorderEditShort', 'Edit'),
            iconName: 'edit',
            data: { 'step-index': index }
          })}
          ${renderIconOnlyButton({
            action: 'delete-step',
            label: msg('macroRecorderDeleteShort', 'Del'),
            iconName: 'trash',
            tone: 'is-danger',
            data: { 'step-index': index }
          })}
        </div>
      </div>
    `).join('')
    : `<div class="toolary-macro-recorder-empty">${escapeHtml(msg('macroRecorderStepsEmpty', 'No steps yet. Add one manually or record on the page.'))}</div>`;

  return `
    <div class="toolary-macro-recorder-card">
      <div class="toolary-macro-recorder-card-head">
        <div class="toolary-macro-recorder-card-copy">
          <div class="toolary-macro-recorder-card-title">${escapeHtml(msg('macroRecorderEditorTitle', 'Edit macro'))}</div>
          <div class="toolary-macro-recorder-card-note">${escapeHtml(msg('macroRecorderUpdatedMeta', 'Updated: $1').replace('$1', formatDateTime(selectedMacro.updatedAt || selectedMacro.createdAt)))}</div>
        </div>
        <span class="toolary-macro-recorder-chip">${escapeHtml(msg('macroRecorderStepCount', '$1 steps').replace('$1', String(selectedMacro.steps.length)))}</span>
      </div>
      <div class="toolary-macro-recorder-field">
        <label class="toolary-macro-recorder-label" for="toolary-macro-recorder-editor-name">${escapeHtml(msg('macroRecorderNameLabel', 'Macro name'))}</label>
        <input id="toolary-macro-recorder-editor-name" class="toolary-macro-recorder-input" type="text" value="${escapeHtml(state.editorNameDraft || selectedMacro.name)}" />
      </div>
      <div class="toolary-macro-recorder-btn-group">
        ${renderActionButton({
          action: 'save-macro-name',
          label: msg('macroRecorderSaveName', 'Save name'),
          iconName: 'edit',
          tone: 'is-primary'
        })}
        ${renderActionButton({
          action: 'export-json',
          label: msg('macroRecorderExportJson', 'Export JSON'),
          iconName: 'export',
          tone: 'is-muted'
        })}
      </div>
    </div>
    <div class="toolary-macro-recorder-card">
      <div class="toolary-macro-recorder-card-copy">
        <div class="toolary-macro-recorder-card-title">${escapeHtml(msg('macroRecorderAddStepTitle', 'Add step'))}</div>
      </div>
      <div class="toolary-macro-recorder-step-tools">
        ${renderActionButton({
          action: 'add-step',
          label: msg('macroRecorderAddClick', 'Add click'),
          iconName: 'macro-recorder',
          tone: 'is-step-action is-click',
          data: { 'step-type': 'click' }
        })}
        ${renderActionButton({
          action: 'add-step',
          label: msg('macroRecorderAddDelay', 'Add delay'),
          iconName: 'file-text',
          tone: 'is-step-action is-delay',
          data: { 'step-type': 'delay' }
        })}
        ${renderActionButton({
          action: 'add-step',
          label: msg('macroRecorderAddInputFill', 'Add input fill'),
          iconName: 'edit',
          tone: 'is-step-action is-input',
          data: { 'step-type': 'inputFill' }
        })}
        ${renderActionButton({
          action: 'add-step',
          label: msg('macroRecorderAddCopyText', 'Add copy text'),
          iconName: 'copy',
          tone: 'is-step-action is-copy',
          data: { 'step-type': 'copyText' }
        })}
      </div>
    </div>
    <div class="toolary-macro-recorder-card">
      <div class="toolary-macro-recorder-card-head">
        <div class="toolary-macro-recorder-card-copy">
          <div class="toolary-macro-recorder-card-title">${escapeHtml(msg('macroRecorderStepsTitle', 'Steps'))}</div>
          <div class="toolary-macro-recorder-card-note">${escapeHtml(msg('macroRecorderDragHandle', 'Drag to reorder'))}</div>
        </div>
        <span class="toolary-macro-recorder-chip">${escapeHtml(String(selectedMacro.steps.length))}</span>
      </div>
      <div class="toolary-macro-recorder-list">${stepsMarkup}</div>
    </div>
  `;
}

function updateRuntimeDecorations() {
  updateStatusBar();
  updateStepBadge();
}

function ensureStatusBar() {
  if (statusBar) return statusBar;
  statusBar = document.createElement('div');
  statusBar.className = 'toolary-macro-recorder-status-bar';
  statusBar.innerHTML = `
    <span class="toolary-macro-recorder-status-dot"></span>
    <span class="toolary-macro-recorder-status-text"></span>
  `;
  document.body.appendChild(statusBar);
  applyTheme(statusBar);
  return statusBar;
}

function ensureStepBadge() {
  if (stepBadge) return stepBadge;
  stepBadge = document.createElement('div');
  stepBadge.className = 'toolary-macro-recorder-step-badge';
  document.body.appendChild(stepBadge);
  applyTheme(stepBadge);
  return stepBadge;
}

function updateStatusBar() {
  if (!state.isRecording && !state.isPlaying) {
    removeElement(statusBar);
    statusBar = null;
    return;
  }

  const bar = ensureStatusBar();
  bar.classList.toggle('is-recording', state.isRecording);
  bar.classList.toggle('is-playing', state.isPlaying);

  const textNode = bar.querySelector('.toolary-macro-recorder-status-text');
  if (textNode) {
    if (state.isRecording) {
      const name = state.currentRecordingMacro?.name || msg('macroRecorderUntitledMacro', 'Untitled Macro');
      textNode.textContent = msg('macroRecorderStatusRecording', 'Recording: $1').replace('$1', name);
    } else {
      const selectedMacro = getSelectedMacro();
      const loopText = state.loopInfinite
        ? msg('macroRecorderLoopInfiniteShort', 'infinite')
        : String(state.playback.totalLoops || 1);
      textNode.textContent = msg('macroRecorderStatusPlaying', 'Playing: $1 (loop $2)')
        .replace('$1', selectedMacro?.name || msg('macroRecorderUntitledMacro', 'Untitled Macro'))
        .replace('$2', loopText);
    }
  }
}

function updateStepBadge() {
  if (!state.isRecording && !state.isPlaying) {
    removeElement(stepBadge);
    stepBadge = null;
    return;
  }

  const badge = ensureStepBadge();
  if (state.isRecording) {
    badge.textContent = msg('macroRecorderBadgeRecording', '$1 steps recorded')
      .replace('$1', String(state.recorder.stepCount));
    return;
  }

  if (state.playback.waiting) {
    badge.textContent = msg('macroRecorderBadgeWaiting', 'Step $1 of $2 waiting')
      .replace('$1', String(state.playback.currentStep))
      .replace('$2', String(state.playback.totalSteps));
    return;
  }

  badge.textContent = msg('macroRecorderBadgePlayback', 'Step $1 of $2')
    .replace('$1', String(state.playback.currentStep || 0))
    .replace('$2', String(state.playback.totalSteps || 0));
}

async function loadMacrosFromStorage() {
  state.macros = await getStoredMacros();
  if (state.selectedMacroId && state.macros[state.selectedMacroId]) {
    state.editorNameDraft = state.macros[state.selectedMacroId].name || '';
  } else {
    state.selectedMacroId = null;
    state.editorNameDraft = '';
  }
}

function buildDefaultMacroName() {
  const timestamp = new Date().toLocaleTimeString();
  return msg('macroRecorderDefaultMacroName', 'Macro $1').replace('$1', timestamp);
}

function buildStepDescription(stepType, fields) {
  switch (stepType) {
    case MACRO_RECORDER_STEP_TYPES.CLICK:
      return `${msg('macroRecorderDescClick', 'Click')}: ${fields.description || fields.selector || msg('macroRecorderFallbackElement', 'target')}`;
    case MACRO_RECORDER_STEP_TYPES.DELAY:
      return `${msg('macroRecorderDescDelay', 'Delay')}: ${fields.duration || 0} ${msg('macroRecorderMsShort', 'ms')}`;
    case MACRO_RECORDER_STEP_TYPES.INPUT_FILL:
      return `${msg('macroRecorderDescInputFill', 'Fill')}: ${fields.selector || msg('macroRecorderFallbackField', 'field')}`;
    case MACRO_RECORDER_STEP_TYPES.COPY_TEXT:
      return `${msg('macroRecorderDescCopyText', 'Copy')}: ${fields.selector || msg('macroRecorderFallbackText', 'text')}`;
    default:
      return msg('macroRecorderTypeUnknown', 'Step');
  }
}

async function persistSelectedMacro(nextMacro) {
  if (!nextMacro) return null;
  nextMacro.updatedAt = Date.now();
  const saved = await saveMacro(nextMacro);
  state.macros[saved.id] = cloneValue(saved);
  setSelectedMacro(saved.id, null);
  return saved;
}

function addRecordedStep(step) {
  if (!state.currentRecordingMacro) return;
  state.currentRecordingMacro.steps.push(step);
  state.currentRecordingMacro.updatedAt = Date.now();
  state.recorder.stepCount = state.currentRecordingMacro.steps.length;
  updateRuntimeDecorations();
  queueRender();
}

function removeRecorderHighlight() {
  const element = state.recorder.lastHoveredElement;
  if (element?.classList) {
    element.classList.remove('toolary-macro-recorder-hover-highlight');
  }
  state.recorder.lastHoveredElement = null;
}

function handleRecorderMouseOver(event) {
  if (!state.isRecording || isToolElement(event.target)) return;
  removeRecorderHighlight();
  if (event.target?.classList) {
    event.target.classList.add('toolary-macro-recorder-hover-highlight');
    state.recorder.lastHoveredElement = event.target;
  }
}

function handleRecorderMouseOut(event) {
  if (!state.isRecording) return;
  if (event.target?.classList) {
    event.target.classList.remove('toolary-macro-recorder-hover-highlight');
  }
  if (state.recorder.lastHoveredElement === event.target) {
    state.recorder.lastHoveredElement = null;
  }
}

function handleRecorderMouseDown(event) {
  if (!state.isRecording || isToolElement(event.target)) return;

  const originalTarget = event.target;
  let element = originalTarget;
  if (typeof element.closest === 'function') {
    const ancestor = element.closest(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], input, select, textarea'
    );
    if (ancestor) {
      element = ancestor;
    }
  }

  if (isTextInputElement(element)) {
    return;
  }

  if (originalTarget?.classList) {
    originalTarget.classList.remove('toolary-macro-recorder-hover-highlight');
  }
  if (state.recorder.lastHoveredElement === originalTarget) {
    state.recorder.lastHoveredElement = null;
  }

  const rect = element.getBoundingClientRect();
  const selector = generateSelector(element);
  const description = describeElement(element) || selector || element.tagName?.toLowerCase() || '';
  const step = createStep(MACRO_RECORDER_STEP_TYPES.CLICK, {
    selector,
    description: `${msg('macroRecorderDescClick', 'Click')}: ${description}`,
    x: Math.round(event.clientX - rect.left),
    y: Math.round(event.clientY - rect.top),
    beforeDelay: 0
  });

  element.classList.add('toolary-macro-recorder-click-flash');
  const timerId = registerTimer(setTimeout(() => {
    timerIds.delete(timerId);
    timerResolvers.delete(timerId);
    element.classList.remove('toolary-macro-recorder-click-flash');
  }, 500));

  addRecordedStep(step);
}

function handleRecorderFocus(event) {
  if (!state.isRecording || isToolElement(event.target)) return;
  const element = event.target;
  if (isTextInputElement(element)) {
    state.recorder.focusedInput = element;
    state.recorder.focusedInputValue = getTrackableValue(element);
  }
}

function handleRecorderBlur(event) {
  if (!state.isRecording) return;
  const element = event.target;
  if (element !== state.recorder.focusedInput || !isTextInputElement(element)) {
    return;
  }

  const nextValue = getTrackableValue(element);
  if (nextValue !== state.recorder.focusedInputValue) {
    const selector = generateSelector(element);
    const placeholder = element.getAttribute?.('placeholder');
    const name = element.name || element.id || '';
    const label = placeholder || name || element.tagName?.toLowerCase() || msg('macroRecorderFallbackField', 'field');

    addRecordedStep(createStep(MACRO_RECORDER_STEP_TYPES.INPUT_FILL, {
      selector,
      value: nextValue,
      beforeDelay: 0,
      description: msg('macroRecorderDescInputFillTarget', 'Fill "$1"').replace('$1', label)
    }));
  }

  state.recorder.focusedInput = null;
  state.recorder.focusedInputValue = '';
}

function handleRecorderChange(event) {
  if (!state.isRecording || isToolElement(event.target)) return;
  const element = event.target;
  if (element?.tagName?.toLowerCase() !== 'select') return;

  const selector = generateSelector(element);
  const name = element.name || element.id || msg('macroRecorderFallbackDropdown', 'dropdown');
  const selectedText = element.options?.[element.selectedIndex]?.text || element.value;

  addRecordedStep(createStep(MACRO_RECORDER_STEP_TYPES.INPUT_FILL, {
    selector,
    value: String(element.value || ''),
    beforeDelay: 0,
    description: msg('macroRecorderDescSelectTarget', 'Select "$1" in $2')
      .replace('$1', String(selectedText || element.value || ''))
      .replace('$2', name)
  }));
}

function handleRecorderCopy() {
  if (!state.isRecording) return;

  const now = Date.now();
  if (now - state.recorder.lastCopyTime < COPY_DEBOUNCE_MS) {
    return;
  }
  state.recorder.lastCopyTime = now;

  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return;

  const selectedText = selection.toString().trim();
  if (!selectedText) return;

  const anchorNode = selection.anchorNode;
  if (!anchorNode) return;

  const anchorElement = anchorNode.nodeType === Node.TEXT_NODE
    ? anchorNode.parentElement
    : (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : null);

  if (!anchorElement || isToolElement(anchorElement)) {
    return;
  }

  const container = anchorElement.closest?.('td, th, li, p, span, a, h1, h2, h3, h4, h5, h6, div') || anchorElement;
  const selector = generateSelector(container);
  addRecordedStep(createStep(MACRO_RECORDER_STEP_TYPES.COPY_TEXT, {
    selector,
    sampleText: selectedText.substring(0, 100),
    beforeDelay: 0,
    description: msg('macroRecorderDescCopyTarget', 'Copy "$1"')
      .replace('$1', `${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}`)
  }));
}

function attachRecorderListeners() {
  clearCleanupSet(recorderCleanupFns);

  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'mouseover', handleRecorderMouseOver, true));
  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'mouseout', handleRecorderMouseOut, true));
  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'mousedown', handleRecorderMouseDown, true));
  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'focus', handleRecorderFocus, true));
  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'blur', handleRecorderBlur, true));
  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'change', handleRecorderChange, true));
  recorderCleanupFns.push(addEventListenerWithCleanup(document, 'copy', handleRecorderCopy, true));
}

function detachRecorderListeners() {
  clearCleanupSet(recorderCleanupFns);
  removeRecorderHighlight();
}

async function startRecording() {
  if (state.isRecording) {
    showInfo(msg('macroRecorderAlreadyRecording', 'Recording is already active.'));
    return;
  }
  if (state.isPlaying) {
    showError(msg('macroRecorderStopPlaybackFirst', 'Stop playback before starting a new recording.'));
    return;
  }

  const macroName = sanitizeInput(state.pendingMacroName || '').trim() || buildDefaultMacroName();
  state.currentRecordingMacro = createMacro(macroName, Date.now());
  state.currentRecordingMacro.steps = [];
  state.sidebarCollapsed = true;
  state.isRecording = true;
  state.recorder.stepCount = 0;
  state.recorder.focusedInput = null;
  state.recorder.focusedInputValue = '';
  state.recorder.lastCopyTime = 0;
  attachRecorderListeners();
  updateRuntimeDecorations();
  queueRender();
  showMacroRecorderSuccess(msg('macroRecorderRecordingStarted', 'Recording started.'));
}

async function stopRecording() {
  if (!state.isRecording) {
    return;
  }

  detachRecorderListeners();
  const macroToSave = state.currentRecordingMacro
    ? cloneValue(state.currentRecordingMacro)
    : createMacro(buildDefaultMacroName(), Date.now());
  macroToSave.name = sanitizeInput(macroToSave.name || '').trim() || buildDefaultMacroName();
  macroToSave.updatedAt = Date.now();

  try {
    const saved = await saveMacro(macroToSave);
    state.macros[saved.id] = cloneValue(saved);
    state.pendingMacroName = '';
    resetRecorderState();
    state.sidebarCollapsed = false;
    setSelectedMacro(saved.id, 'editor');
    showMacroRecorderSuccess(msg('macroRecorderRecordingSaved', 'Macro saved.'), { coffee: true });
  } catch (error) {
    handleError(error, 'macroRecorder.stopRecording');
    showError(msg('macroRecorderRecordingSaveFailed', 'Failed to save the recording.'));
    resetRecorderState();
  } finally {
    updateRuntimeDecorations();
    queueRender();
  }
}

function findElement(selector) {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function simulateClick(element, relX, relY) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + (Number.isFinite(relX) ? relX : rect.width / 2);
  const y = rect.top + (Number.isFinite(relY) ? relY : rect.height / 2);
  const options = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  };

  dispatchSyntheticEvent(element, 'PointerEvent', 'pointerover', { ...options, pointerId: 1, pointerType: 'mouse' });
  dispatchSyntheticEvent(element, 'PointerEvent', 'pointerenter', { ...options, bubbles: false, pointerId: 1, pointerType: 'mouse' });
  dispatchSyntheticEvent(element, 'PointerEvent', 'pointerdown', { ...options, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 });
  dispatchSyntheticEvent(element, 'MouseEvent', 'mouseover', options);
  dispatchSyntheticEvent(element, 'MouseEvent', 'mouseenter', { ...options, bubbles: false });
  dispatchSyntheticEvent(element, 'MouseEvent', 'mousemove', options);
  dispatchSyntheticEvent(element, 'MouseEvent', 'mousedown', { ...options, button: 0, buttons: 1 });

  try {
    element.focus?.();
  } catch {
    // ignore focus errors
  }

  dispatchSyntheticEvent(element, 'PointerEvent', 'pointerup', { ...options, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 0 });
  dispatchSyntheticEvent(element, 'MouseEvent', 'mouseup', { ...options, button: 0, buttons: 0 });
  dispatchSyntheticEvent(element, 'MouseEvent', 'click', { ...options, button: 0, buttons: 0, detail: 1 });

  const tag = element.tagName?.toLowerCase();
  const isNativeClickable = ['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tag);
  if (!isNativeClickable) {
    try {
      element.click?.();
    } catch {
      // ignore click fallback errors
    }
  }
}

async function executeClickStep(step) {
  let element = findElement(step.selector);
  if (!element) {
    await sleep(1000);
    element = findElement(step.selector);
  }
  if (!element) {
    throw new Error(msg('macroRecorderElementNotFound', 'Element not found.'));
  }

  element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  await sleep(300);
  element.classList?.add('toolary-macro-recorder-play-highlight');
  simulateClick(element, step.x, step.y);
  const timerId = registerTimer(setTimeout(() => {
    timerIds.delete(timerId);
    timerResolvers.delete(timerId);
    element.classList?.remove('toolary-macro-recorder-play-highlight');
  }, 600));
}

async function executeInputFillStep(step) {
  let element = findElement(step.selector);
  if (!element) {
    await sleep(1000);
    element = findElement(step.selector);
  }
  if (!element) {
    throw new Error(msg('macroRecorderInputNotFound', 'Input element not found.'));
  }

  element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  await sleep(200);
  element.classList?.add('toolary-macro-recorder-play-highlight');

  try {
    element.focus?.();
  } catch {
    // ignore focus errors
  }

  await sleep(50);
  const value = step.value || '';

  if (element.isContentEditable || element.contentEditable === 'true') {
    element.textContent = value;
    dispatchSyntheticEvent(element, 'InputEvent', 'input', { bubbles: true, data: value });
    dispatchSyntheticEvent(element, 'Event', 'change', { bubbles: true });
  } else {
    const tag = element.tagName?.toLowerCase();
    const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype || {}, 'value')?.set;
    const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype || {}, 'value')?.set;
    const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement?.prototype || {}, 'value')?.set;

    try {
      if (tag === 'textarea' && textareaSetter) {
        textareaSetter.call(element, value);
      } else if (tag === 'select' && selectSetter) {
        selectSetter.call(element, value);
      } else if (inputSetter) {
        inputSetter.call(element, value);
      } else {
        element.value = value;
      }
    } catch {
      element.value = value;
    }

    ['input', 'change'].forEach((eventName) => {
      dispatchSyntheticEvent(element, 'Event', eventName, { bubbles: true, cancelable: true });
    });
  }

  const timerId = registerTimer(setTimeout(() => {
    timerIds.delete(timerId);
    timerResolvers.delete(timerId);
    element.classList?.remove('toolary-macro-recorder-play-highlight');
  }, 600));
}

async function executeCopyTextStep(step) {
  let element = findElement(step.selector);
  if (!element) {
    await sleep(1000);
    element = findElement(step.selector);
  }
  if (!element) {
    throw new Error(msg('macroRecorderCopyTargetMissing', 'Copy target not found.'));
  }

  element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  await sleep(200);

  const text = String(element.innerText || element.textContent || element.value || '').trim();
  element.classList?.add('toolary-macro-recorder-play-highlight');
  const timerId = registerTimer(setTimeout(() => {
    timerIds.delete(timerId);
    timerResolvers.delete(timerId);
    element.classList?.remove('toolary-macro-recorder-play-highlight');
  }, 600));

  state.collectedRows.push({
    selector: step.selector || '',
    text,
    url: window.location.href,
    timestamp: new Date().toISOString()
  });
  queueRender();
}

async function executeDelayStep(step) {
  const duration = normalizePositiveInt(step.duration, 1000, 300000);
  const startedAt = Date.now();

  while (!state.playback.stopRequested) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= duration) {
      state.playback.waiting = false;
      updateStepBadge();
      return;
    }
    state.playback.waiting = true;
    updateStepBadge();
    await sleep(Math.min(100, duration - elapsed));
  }
}

function stopPlayback() {
  if (!state.isPlaying) {
    return;
  }
  state.playback.stopRequested = true;
  state.playback.waiting = false;
  updateRuntimeDecorations();
  queueRender();
}

async function startPlayback() {
  const macro = getSelectedMacro();
  if (!macro) {
    showError(msg('macroRecorderSelectMacroPrompt', 'Choose a macro first.'));
    return;
  }
  if (state.isRecording) {
    showError(msg('macroRecorderStopRecordingFirst', 'Stop recording before starting playback.'));
    return;
  }
  if (state.isPlaying) {
    showInfo(msg('macroRecorderPlaybackAlreadyRunning', 'Playback is already running.'));
    return;
  }

  state.isPlaying = true;
  state.playback.stopRequested = false;
  state.playback.currentStep = 0;
  state.playback.totalSteps = macro.steps.length;
  state.playback.currentLoop = 0;
  state.playback.totalLoops = state.loopInfinite ? 0 : normalizeLoopCount(state.loopCount);
  state.playback.waiting = false;
  state.collectedRows = [];
  state.activeView = 'library';
  state.sidebarCollapsed = false;
  updateRuntimeDecorations();
  queueRender();

  const maxLoops = state.loopInfinite ? Number.POSITIVE_INFINITY : normalizeLoopCount(state.loopCount);
  let loopNumber = 0;

  try {
    while (loopNumber < maxLoops && !state.playback.stopRequested) {
      loopNumber += 1;
      state.playback.currentLoop = loopNumber;
      queueRender();
      updateRuntimeDecorations();

      for (let index = 0; index < macro.steps.length; index += 1) {
        if (state.playback.stopRequested) break;
        const step = macro.steps[index];

        state.playback.currentStep = index + 1;
        state.playback.totalSteps = macro.steps.length;
        state.playback.waiting = false;
        queueRender();
        updateRuntimeDecorations();

        if (step.beforeDelay && step.beforeDelay > 0) {
          state.playback.waiting = true;
          updateRuntimeDecorations();
          await sleep(step.beforeDelay);
          state.playback.waiting = false;
          if (state.playback.stopRequested) break;
        }

        try {
          if (step.type === MACRO_RECORDER_STEP_TYPES.CLICK) {
            await executeClickStep(step);
          } else if (step.type === MACRO_RECORDER_STEP_TYPES.DELAY) {
            await executeDelayStep(step);
          } else if (step.type === MACRO_RECORDER_STEP_TYPES.INPUT_FILL) {
            await executeInputFillStep(step);
          } else if (step.type === MACRO_RECORDER_STEP_TYPES.COPY_TEXT) {
            await executeCopyTextStep(step);
          }
        } catch (stepError) {
          handleError(stepError, `macroRecorder.play.step.${index}`);
        }

        if (!state.playback.stopRequested && step.type !== MACRO_RECORDER_STEP_TYPES.DELAY) {
          await sleep(300);
        }
      }

      if (!state.playback.stopRequested && loopNumber < maxLoops) {
        await sleep(500);
      }
    }

    if (!state.playback.stopRequested) {
      showMacroRecorderSuccess(msg('macroRecorderPlaybackFinished', 'Playback finished.'), { coffee: true });
    }
  } catch (error) {
    handleError(error, 'macroRecorder.startPlayback');
    showError(msg('macroRecorderPlaybackFailed', 'Playback failed.'));
  } finally {
    resetPlaybackState();
    updateRuntimeDecorations();
    queueRender();
  }
}

function downloadTextFile(content, filename, mimeType) {
  if (typeof URL?.createObjectURL !== 'function') {
    showError(msg('macroRecorderDownloadUnsupported', 'Download is not supported in this context.'));
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadSelectedMacroJson() {
  const macro = getSelectedMacro();
  if (!macro) {
    showError(msg('macroRecorderSelectMacroPrompt', 'Choose a macro first.'));
    return;
  }

  downloadTextFile(
    JSON.stringify(macro, null, 2),
    `${safeFilename(macro.name, 'macro')}.json`,
    'application/json'
  );
  showMacroRecorderSuccess(msg('macroRecorderJsonExported', 'Macro exported.'), { coffee: true });
}

function downloadCsv() {
  if (!state.collectedRows.length) {
    showError(msg('macroRecorderNoCsvRows', 'No CSV rows collected yet.'));
    return;
  }

  const csv = buildCsvContent(state.collectedRows);
  downloadTextFile(
    csv,
    `macro-recorder-data-${Date.now()}.csv`,
    'text/csv;charset=utf-8;'
  );
  state.collectedRows = [];
  queueRender();
  showMacroRecorderSuccess(msg('macroRecorderCsvDownloaded', 'CSV downloaded.'), { coffee: true });
}

async function saveSelectedMacroName() {
  const macro = getSelectedMacro();
  if (!macro) {
    return;
  }

  const nextName = sanitizeInput(state.editorNameDraft || '').trim() || msg('macroRecorderUntitledMacro', 'Untitled Macro');
  if (nextName === macro.name) {
    showInfo(msg('macroRecorderNameUnchanged', 'Name is unchanged.'));
    return;
  }

  try {
    const updatedMacro = {
      ...cloneValue(macro),
      name: nextName,
      updatedAt: Date.now()
    };
    await persistSelectedMacro(updatedMacro);
    showMacroRecorderSuccess(msg('macroRecorderNameSaved', 'Macro name saved.'), { coffee: true });
  } catch (error) {
    handleError(error, 'macroRecorder.saveSelectedMacroName');
    showError(msg('macroRecorderNameSaveFailed', 'Failed to save macro name.'));
  }
}

async function removeSelectedMacroStep(stepIndex) {
  const macro = getSelectedMacro();
  if (!macro || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= macro.steps.length) {
    return;
  }

  const confirmed = await openConfirmModal({
    title: msg('macroRecorderDeleteStepConfirmTitle', 'Delete step'),
    message: msg('macroRecorderDeleteStepConfirmBody', 'Delete this step from the macro?'),
    confirmLabel: msg('macroRecorderDeleteShort', 'Del'),
    danger: true
  });
  if (!confirmed) {
    return;
  }

  const nextMacro = cloneValue(macro);
  nextMacro.steps.splice(stepIndex, 1);

  try {
    await persistSelectedMacro(nextMacro);
    showMacroRecorderSuccess(msg('macroRecorderStepDeleted', 'Step deleted.'), { coffee: true });
  } catch (error) {
    handleError(error, 'macroRecorder.removeSelectedMacroStep');
    showError(msg('macroRecorderStepDeleteFailed', 'Failed to delete step.'));
  }
}

async function deleteMacroById(macroId) {
  const macro = state.macros[macroId];
  if (!macro) return;

  const confirmed = await openConfirmModal({
    title: msg('macroRecorderDeleteMacroConfirmTitle', 'Delete macro'),
    message: msg('macroRecorderDeleteMacroConfirmBody', 'Delete "$1"? This cannot be undone.').replace('$1', macro.name),
    confirmLabel: msg('macroRecorderDeleteShort', 'Del'),
    danger: true
  });
  if (!confirmed) return;

  try {
    await deleteMacro(macroId);
    delete state.macros[macroId];
    if (state.selectedMacroId === macroId) {
      setSelectedMacro(null, 'library');
    } else {
      queueRender();
    }
    showMacroRecorderSuccess(msg('macroRecorderMacroDeleted', 'Macro deleted.'), { coffee: true });
  } catch (error) {
    handleError(error, 'macroRecorder.deleteMacroById');
    showError(msg('macroRecorderMacroDeleteFailed', 'Failed to delete macro.'));
  }
}

async function reorderSelectedMacroSteps(fromIndex, toIndex) {
  const macro = getSelectedMacro();
  if (!macro) return;

  const nextSteps = reorderSteps(macro.steps, fromIndex, toIndex);
  if (JSON.stringify(nextSteps) === JSON.stringify(macro.steps)) {
    return;
  }

  try {
    await persistSelectedMacro({
      ...cloneValue(macro),
      steps: nextSteps
    });
    showMacroRecorderSuccess(msg('macroRecorderStepReordered', 'Step reordered.'), { coffee: true });
  } catch (error) {
    handleError(error, 'macroRecorder.reorderSelectedMacroSteps');
    showError(msg('macroRecorderStepReorderFailed', 'Failed to reorder steps.'));
  }
}

function buildStepModalConfig(stepType, step, stepIndex = null) {
  const isEditing = Number.isInteger(stepIndex);
  const baseTitle = isEditing
    ? msg('macroRecorderEditStep', 'Edit step')
    : msg('macroRecorderAddStepTitle', 'Add step');
  const saveLabel = isEditing
    ? msg('macroRecorderSaveStep', 'Save step')
    : msg('macroRecorderAddStepButton', 'Add step');

  switch (stepType) {
    case MACRO_RECORDER_STEP_TYPES.CLICK:
      return {
        title: `${baseTitle}: ${getTypeLabel(stepType)}`,
        subtitle: msg('macroRecorderClickModalHint', 'Use a stable selector for the click target.'),
        fields: [
          { name: 'selector', label: msg('macroRecorderSelectorLabel', 'Selector'), type: 'text', value: step?.selector || '', required: true },
          { name: 'description', label: msg('macroRecorderDescriptionLabel', 'Description'), type: 'text', value: step?.description || '' },
          { name: 'beforeDelay', label: msg('macroRecorderBeforeDelayLabel', 'Before delay (ms)'), type: 'number', value: step?.beforeDelay || 0 }
        ],
        saveLabel
      };
    case MACRO_RECORDER_STEP_TYPES.DELAY:
      return {
        title: `${baseTitle}: ${getTypeLabel(stepType)}`,
        subtitle: msg('macroRecorderDelayModalHint', 'Delay is stored in milliseconds.'),
        fields: [
          { name: 'duration', label: msg('macroRecorderDurationLabel', 'Duration (ms)'), type: 'number', value: step?.duration || 1000, required: true },
          { name: 'description', label: msg('macroRecorderDescriptionLabel', 'Description'), type: 'text', value: step?.description || '' }
        ],
        saveLabel
      };
    case MACRO_RECORDER_STEP_TYPES.INPUT_FILL:
      return {
        title: `${baseTitle}: ${getTypeLabel(stepType)}`,
        subtitle: msg('macroRecorderInputModalHint', 'Selector and value are required for fill steps.'),
        fields: [
          { name: 'selector', label: msg('macroRecorderSelectorLabel', 'Selector'), type: 'text', value: step?.selector || '', required: true },
          { name: 'value', label: msg('macroRecorderValueLabel', 'Value'), type: 'textarea', value: step?.value || '' },
          { name: 'description', label: msg('macroRecorderDescriptionLabel', 'Description'), type: 'text', value: step?.description || '' },
          { name: 'beforeDelay', label: msg('macroRecorderBeforeDelayLabel', 'Before delay (ms)'), type: 'number', value: step?.beforeDelay || 0 }
        ],
        saveLabel
      };
    case MACRO_RECORDER_STEP_TYPES.COPY_TEXT:
      return {
        title: `${baseTitle}: ${getTypeLabel(stepType)}`,
        subtitle: msg('macroRecorderCopyModalHint', 'Copy steps collect text content from the matched element during playback.'),
        fields: [
          { name: 'selector', label: msg('macroRecorderSelectorLabel', 'Selector'), type: 'text', value: step?.selector || '', required: true },
          { name: 'description', label: msg('macroRecorderDescriptionLabel', 'Description'), type: 'text', value: step?.description || '' },
          { name: 'sampleText', label: msg('macroRecorderSampleTextLabel', 'Sample text'), type: 'textarea', value: step?.sampleText || '' },
          { name: 'beforeDelay', label: msg('macroRecorderBeforeDelayLabel', 'Before delay (ms)'), type: 'number', value: step?.beforeDelay || 0 }
        ],
        saveLabel
      };
    default:
      return null;
  }
}

function collectModalValues(overlay) {
  const values = {};
  overlay.querySelectorAll('[data-field-name]').forEach((field) => {
    values[field.dataset.fieldName] = field.value;
  });
  return values;
}

function renderModalField(field) {
  const value = field.value ?? '';
  if (field.type === 'textarea') {
    return `
      <div class="toolary-macro-recorder-field">
        <label class="toolary-macro-recorder-label" for="toolary-macro-recorder-modal-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
        <textarea id="toolary-macro-recorder-modal-${escapeHtml(field.name)}" class="toolary-macro-recorder-textarea" data-field-name="${escapeHtml(field.name)}">${escapeHtml(String(value))}</textarea>
      </div>
    `;
  }

  return `
    <div class="toolary-macro-recorder-field">
      <label class="toolary-macro-recorder-label" for="toolary-macro-recorder-modal-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
      <input id="toolary-macro-recorder-modal-${escapeHtml(field.name)}" class="toolary-macro-recorder-input" data-field-name="${escapeHtml(field.name)}" type="${escapeHtml(field.type)}" value="${escapeHtml(String(value))}" ${field.required ? 'required' : ''} />
    </div>
  `;
}

function closeActiveModal(reason = 'cancel') {
  if (!activeModal) return;
  const { overlay, cleanupFns: modalCleanupFns, onClose } = activeModal;
  activeModal = null;
  if (typeof onClose === 'function') {
    onClose(reason);
  }
  removeElement(overlay);
  clearCleanupSet(modalCleanupFns);
}

function openModalCard({ title, subtitle, bodyMarkup, submitLabel, danger = false, onSubmit, onClose = null }) {
  closeActiveModal();

  const overlay = document.createElement('div');
  overlay.className = 'toolary-macro-recorder-modal';
  overlay.innerHTML = `
    <div class="toolary-macro-recorder-modal-card">
      <div class="toolary-macro-recorder-modal-header">
        <div>
          <div class="toolary-macro-recorder-modal-title">${escapeHtml(title)}</div>
          <div class="toolary-macro-recorder-modal-subtitle">${escapeHtml(subtitle || '')}</div>
        </div>
        <button type="button" class="toolary-macro-recorder-shell-btn" data-modal-action="cancel" aria-label="${escapeHtml(msg('macroRecorderCloseButton', 'Close tool'))}">X</button>
      </div>
      <form class="toolary-macro-recorder-modal-form">
        ${bodyMarkup}
        <div class="toolary-macro-recorder-modal-actions">
          <button type="button" class="toolary-macro-recorder-btn" data-modal-action="cancel">${escapeHtml(msg('macroRecorderCancel', 'Cancel'))}</button>
          <button type="submit" class="toolary-macro-recorder-btn ${danger ? 'is-danger' : 'is-primary'}">${escapeHtml(submitLabel)}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  applyTheme(overlay);

  const cleanupFnsLocal = [];
  const form = overlay.querySelector('.toolary-macro-recorder-modal-form');

  cleanupFnsLocal.push(addEventListenerWithCleanup(overlay, 'click', (event) => {
    if (event.target === overlay || event.target.closest('[data-modal-action="cancel"]')) {
      closeActiveModal('cancel');
    }
  }));

  cleanupFnsLocal.push(addEventListenerWithCleanup(form, 'submit', async (event) => {
    event.preventDefault();
    try {
      await onSubmit(overlay);
    } catch (error) {
      handleError(error, 'macroRecorder.openModalCard.submit');
    }
  }));

  activeModal = {
    overlay,
    cleanupFns: cleanupFnsLocal,
    onClose
  };

  const firstField = overlay.querySelector('[data-field-name]');
  firstField?.focus?.();
}

function openStepModal(stepType, stepIndex = null) {
  const macro = getSelectedMacro();
  if (!macro) {
    showError(msg('macroRecorderSelectMacroPrompt', 'Choose a macro first.'));
    return;
  }

  const existingStep = Number.isInteger(stepIndex) ? macro.steps[stepIndex] : null;
  const config = buildStepModalConfig(stepType, existingStep, stepIndex);
  if (!config) return;

  openModalCard({
    title: config.title,
    subtitle: config.subtitle,
    bodyMarkup: config.fields.map(renderModalField).join(''),
    submitLabel: config.saveLabel,
    onSubmit: async (overlay) => {
      const values = collectModalValues(overlay);
      if (values.selector && !validateSelector(values.selector)) {
        showError(msg('macroRecorderInvalidSelector', 'Enter a valid selector.'));
        return;
      }

      const nextFields = {
        selector: values.selector?.trim?.() || '',
        description: sanitizeInput(values.description || '').trim(),
        value: values.value ?? '',
        sampleText: values.sampleText ?? '',
        duration: normalizePositiveInt(values.duration, 1000, 300000),
        beforeDelay: normalizePositiveInt(values.beforeDelay, 0, 30000)
      };

      if (!nextFields.description) {
        nextFields.description = buildStepDescription(stepType, nextFields);
      }

      const nextStep = existingStep
        ? updateStep(existingStep, nextFields)
        : createStep(stepType, nextFields);

      if (!nextStep) {
        showError(msg('macroRecorderInvalidStep', 'Step data is invalid.'));
        return;
      }

      const nextMacro = cloneValue(macro);
      if (Number.isInteger(stepIndex)) {
        nextMacro.steps[stepIndex] = nextStep;
      } else {
        nextMacro.steps.push(nextStep);
      }

      await persistSelectedMacro(nextMacro);
      closeActiveModal();
      showMacroRecorderSuccess(
        Number.isInteger(stepIndex)
          ? msg('macroRecorderStepSaved', 'Step saved.')
          : msg('macroRecorderStepAdded', 'Step added.'),
        { coffee: true }
      );
    }
  });
}

function openConfirmModal({ title, message, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    openModalCard({
      title,
      subtitle: '',
      bodyMarkup: `<div class="toolary-macro-recorder-field"><div>${escapeHtml(message)}</div></div>`,
      submitLabel: confirmLabel,
      danger,
      onClose: (reason) => {
        resolve(reason === 'submit');
      },
      onSubmit: async () => {
        closeActiveModal('submit');
      }
    });
  });
}

async function handleImportFileChange(event) {
  const file = event.target.files?.[0];
  fileInput.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const response = await importMacros(parsed);
    state.macros = response.macros;
    setSelectedMacro(null, 'library');
    showMacroRecorderSuccess(
      msg('macroRecorderImportSuccess', '$1 macros imported.').replace('$1', String(response.count)),
      { coffee: true }
    );
  } catch (error) {
    handleError(error, 'macroRecorder.handleImportFileChange');
    showError(msg('macroRecorderImportFailed', 'Failed to import JSON.'));
  }
}

function handleSidebarInput(event) {
  const target = event.target;
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

  if (target.id === 'toolary-macro-recorder-name-input') {
    state.pendingMacroName = target.value;
    return;
  }

  if (target.id === 'toolary-macro-recorder-editor-name') {
    state.editorNameDraft = target.value;
    return;
  }

  if (target.id === 'toolary-macro-recorder-loop-count') {
    state.loopCount = normalizeLoopCount(target.value);
    queueRender();
  }
}

function handleSidebarChange(event) {
  const target = event.target;
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

  if (target.id === 'toolary-macro-recorder-loop-infinite') {
    state.loopInfinite = Boolean(target.checked);
    queueRender();
    return;
  }

  if (target.id === 'toolary-macro-recorder-loop-count') {
    state.loopCount = normalizeLoopCount(target.value);
    queueRender();
  }
}

async function handleSidebarClick(event) {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;

  const { action } = actionTarget.dataset;
  switch (action) {
    case 'toggle-sidebar':
      state.sidebarCollapsed = !state.sidebarCollapsed;
      queueRender();
      break;
    case 'close-tool':
      deactivateCallback?.();
      break;
    case 'switch-view':
      state.activeView = actionTarget.dataset.view || 'library';
      queueRender();
      break;
    case 'select-macro':
      setSelectedMacro(actionTarget.dataset.macroId, 'library');
      break;
    case 'open-editor':
      setSelectedMacro(actionTarget.dataset.macroId, 'editor');
      break;
    case 'delete-macro':
      await deleteMacroById(actionTarget.dataset.macroId);
      break;
    case 'start-recording':
      await startRecording();
      break;
    case 'stop-recording':
      await stopRecording();
      break;
    case 'start-playback':
      await startPlayback();
      break;
    case 'stop-playback':
      stopPlayback();
      break;
    case 'open-import':
      fileInput.click();
      break;
    case 'export-json':
      downloadSelectedMacroJson();
      break;
    case 'download-csv':
      downloadCsv();
      break;
    case 'clear-csv':
      state.collectedRows = [];
      queueRender();
      showMacroRecorderSuccess(msg('macroRecorderCsvCleared', 'CSV data cleared.'));
      break;
    case 'save-macro-name':
      await saveSelectedMacroName();
      break;
    case 'add-step':
      openStepModal(actionTarget.dataset.stepType);
      break;
    case 'edit-step':
      openStepModal(getSelectedMacro()?.steps?.[Number.parseInt(actionTarget.dataset.stepIndex, 10)]?.type, Number.parseInt(actionTarget.dataset.stepIndex, 10));
      break;
    case 'delete-step':
      await removeSelectedMacroStep(Number.parseInt(actionTarget.dataset.stepIndex, 10));
      break;
    default:
      break;
  }
}

function handleStepDragStart(event) {
  const step = event.target.closest('.toolary-macro-recorder-step');
  if (!step) return;
  state.dragStepIndex = Number.parseInt(step.dataset.stepIndex, 10);
  step.classList.add('dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', step.dataset.stepIndex || '');
  }
}

function handleStepDragOver(event) {
  const step = event.target.closest('.toolary-macro-recorder-step');
  if (!step) return;
  event.preventDefault();
  step.classList.add('is-drag-target');
}

function handleStepDragLeave(event) {
  const step = event.target.closest('.toolary-macro-recorder-step');
  if (!step) return;
  step.classList.remove('is-drag-target');
}

async function handleStepDrop(event) {
  const step = event.target.closest('.toolary-macro-recorder-step');
  if (!step) return;
  event.preventDefault();
  const toIndex = Number.parseInt(step.dataset.stepIndex, 10);
  const fromIndex = Number.isInteger(state.dragStepIndex)
    ? state.dragStepIndex
    : Number.parseInt(event.dataTransfer?.getData('text/plain') || '', 10);

  step.classList.remove('is-drag-target');
  state.dragStepIndex = null;
  await reorderSelectedMacroSteps(fromIndex, toIndex);
}

function handleStepDragEnd(event) {
  state.dragStepIndex = null;
  event.target.closest('.toolary-macro-recorder-step')?.classList.remove('dragging');
  sidebar?.querySelectorAll('.toolary-macro-recorder-step.is-drag-target').forEach((node) => {
    node.classList.remove('is-drag-target');
  });
}

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape') return;

  if (activeModal) {
    event.preventDefault();
    event.stopPropagation();
    closeActiveModal('escape');
    return;
  }

  if (state.isRecording) {
    event.preventDefault();
    event.stopPropagation();
    void stopRecording();
    return;
  }

  if (state.isPlaying) {
    event.preventDefault();
    event.stopPropagation();
    stopPlayback();
  }
}

export async function activate(deactivate) {
  deactivateCallback = deactivate;

  try {
    await ensureLanguageLoaded();

    if (!isSupportedPage()) {
      showError(msg('macroRecorderUnsupportedPage', 'Macro Recorder works on normal http/https pages only.'));
      deactivateCallback?.();
      return;
    }

    ensureStyles();
    await loadMacrosFromStorage();

    if (!state.pendingMacroName) {
      state.pendingMacroName = buildDefaultMacroName();
    }

    createRoot();
    queueRender();
  } catch (error) {
    handleError(error, 'macroRecorder.activate');
    showError(msg('macroRecorderActivateFailed', 'Failed to activate Macro Recorder.'));
    deactivateCallback?.();
  }
}

export function deactivate() {
  clearCleanupSet(cleanupFns);
  clearCleanupSet(recorderCleanupFns);
  stopPlayback();
  clearAllTimers();
  closeActiveModal();
  removeRecorderHighlight();
  resetRecorderState();
  resetPlaybackState();
  state.collectedRows = [];
  state.selectedMacroId = null;
  state.editorNameDraft = '';
  state.pendingMacroName = '';
  state.activeView = 'library';
  state.sidebarCollapsed = false;
  state.dragStepIndex = null;

  removeElement(statusBar);
  removeElement(stepBadge);
  removeElement(root);
  removeElement(document.getElementById(STYLE_ID));

  statusBar = null;
  stepBadge = null;
  root = null;
  floatingWidget = null;
  sidebar = null;
  fileInput = null;
  activeModal = null;
  deactivateCallback = null;
}
