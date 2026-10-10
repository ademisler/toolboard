export const MACRO_RECORDER_STEP_TYPES = Object.freeze({
  CLICK: 'click',
  DELAY: 'delay',
  INPUT_FILL: 'inputFill',
  COPY_TEXT: 'copyText'
});

const LOOP_MAX = 999;
const DELAY_MAX_MS = 300000;
const BEFORE_DELAY_MAX_MS = 30000;

export function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizePositiveInt(value, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function normalizeLoopCount(value) {
  if (value === 0 || value === '0') {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, LOOP_MAX);
}

export function createMacroId(now = Date.now()) {
  return `macro_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createMacro(name = '', now = Date.now()) {
  const trimmedName = String(name || '').trim();
  return {
    id: createMacroId(now),
    name: trimmedName || 'Untitled Macro',
    createdAt: now,
    updatedAt: now,
    steps: []
  };
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeTimestamp(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDelay(value, fallback = 1000) {
  const parsed = normalizePositiveInt(value, fallback, DELAY_MAX_MS);
  return parsed > 0 ? parsed : fallback;
}

function normalizeBeforeDelay(value) {
  return normalizePositiveInt(value, 0, BEFORE_DELAY_MAX_MS);
}

export function normalizeStep(rawStep) {
  if (!rawStep || typeof rawStep !== 'object') {
    return null;
  }

  const type = normalizeString(rawStep.type).trim();
  const timestamp = normalizeTimestamp(rawStep.timestamp, Date.now());

  switch (type) {
    case MACRO_RECORDER_STEP_TYPES.CLICK:
      return {
        type,
        selector: normalizeString(rawStep.selector),
        description: normalizeString(rawStep.description),
        x: Number.isFinite(rawStep.x) ? Math.round(rawStep.x) : undefined,
        y: Number.isFinite(rawStep.y) ? Math.round(rawStep.y) : undefined,
        beforeDelay: normalizeBeforeDelay(rawStep.beforeDelay),
        timestamp
      };
    case MACRO_RECORDER_STEP_TYPES.DELAY:
      return {
        type,
        duration: normalizeDelay(rawStep.duration),
        description: normalizeString(rawStep.description),
        timestamp
      };
    case MACRO_RECORDER_STEP_TYPES.INPUT_FILL:
      return {
        type,
        selector: normalizeString(rawStep.selector),
        value: normalizeString(rawStep.value),
        description: normalizeString(rawStep.description),
        beforeDelay: normalizeBeforeDelay(rawStep.beforeDelay),
        timestamp
      };
    case MACRO_RECORDER_STEP_TYPES.COPY_TEXT:
      return {
        type,
        selector: normalizeString(rawStep.selector),
        description: normalizeString(rawStep.description),
        sampleText: normalizeString(rawStep.sampleText),
        beforeDelay: normalizeBeforeDelay(rawStep.beforeDelay),
        timestamp
      };
    default:
      return null;
  }
}

export function createStep(type, fields = {}) {
  return normalizeStep({
    type,
    ...fields,
    timestamp: fields.timestamp || Date.now()
  });
}

export function updateStep(step, fields = {}) {
  return normalizeStep({
    ...(step || {}),
    ...fields,
    type: fields.type || step?.type
  });
}

export function normalizeMacro(rawMacro, now = Date.now()) {
  if (!rawMacro || typeof rawMacro !== 'object' || Array.isArray(rawMacro)) {
    return null;
  }

  const id = normalizeString(rawMacro.id).trim() || createMacroId(now);
  const name = normalizeString(rawMacro.name).trim() || 'Untitled Macro';
  const createdAt = normalizeTimestamp(rawMacro.createdAt, now);
  const updatedAt = normalizeTimestamp(rawMacro.updatedAt, createdAt);
  const steps = Array.isArray(rawMacro.steps)
    ? rawMacro.steps.map((step) => normalizeStep(step)).filter(Boolean)
    : [];

  return {
    id,
    name,
    createdAt,
    updatedAt,
    steps
  };
}

export function normalizeMacroMap(rawMacros, now = Date.now()) {
  if (!rawMacros || typeof rawMacros !== 'object' || Array.isArray(rawMacros)) {
    return {};
  }

  return Object.values(rawMacros).reduce((acc, macro) => {
    const normalized = normalizeMacro(macro, now);
    if (normalized) {
      acc[normalized.id] = normalized;
    }
    return acc;
  }, {});
}

export function normalizeImportPayload(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { macros: {}, count: 0 };
  }

  const source = (typeof payload.id === 'string' && Array.isArray(payload.steps))
    ? { [payload.id]: payload }
    : payload;

  const macros = normalizeMacroMap(source, now);
  return {
    macros,
    count: Object.keys(macros).length
  };
}

export function reorderSteps(steps, fromIndex, toIndex) {
  const list = Array.isArray(steps) ? steps.map((step) => cloneValue(step)) : [];
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list;
  }

  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
}

function csvEscape(value) {
  const stringValue = String(value ?? '').replace(/"/g, '""');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue}"`;
  }
  return stringValue;
}

export function buildCsvContent(rows) {
  const header = ['timestamp', 'url', 'selector', 'text'];
  const body = (Array.isArray(rows) ? rows : []).map((row) => [
    csvEscape(row?.timestamp || ''),
    csvEscape(row?.url || ''),
    csvEscape(row?.selector || ''),
    csvEscape(row?.text || '')
  ].join(','));

  return [header.join(','), ...body].join('\n');
}
