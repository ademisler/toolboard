import {
  cloneValue,
  createMacro,
  normalizeImportPayload,
  normalizeMacro,
  normalizeMacroMap
} from './macroRecorderModel.js';

export const MACRO_RECORDER_STORAGE_KEY = 'toolaryMacroRecorderMacros';

async function readStorage() {
  const data = await chrome.storage.local.get(MACRO_RECORDER_STORAGE_KEY);
  return normalizeMacroMap(data?.[MACRO_RECORDER_STORAGE_KEY], Date.now());
}

async function writeStorage(macros) {
  await chrome.storage.local.set({
    [MACRO_RECORDER_STORAGE_KEY]: normalizeMacroMap(macros, Date.now())
  });
}

export async function getStoredMacros() {
  return readStorage();
}

export async function saveStoredMacros(macros) {
  await writeStorage(macros);
  return getStoredMacros();
}

export async function saveMacro(rawMacro) {
  const normalized = normalizeMacro(rawMacro, Date.now());
  if (!normalized) {
    throw new Error('Invalid macro.');
  }

  const macros = await readStorage();
  normalized.updatedAt = Date.now();
  macros[normalized.id] = cloneValue(normalized);
  await writeStorage(macros);
  return macros[normalized.id];
}

export async function createAndStoreMacro(name = '') {
  const macro = createMacro(name, Date.now());
  await saveMacro(macro);
  return macro;
}

export async function deleteMacro(macroId) {
  const macros = await readStorage();
  delete macros[macroId];
  await writeStorage(macros);
  return true;
}

export async function importMacros(payload) {
  const macros = await readStorage();
  const normalized = normalizeImportPayload(payload, Date.now());

  Object.entries(normalized.macros).forEach(([macroId, macro]) => {
    macros[macroId] = {
      ...cloneValue(macro),
      updatedAt: Date.now()
    };
  });

  await writeStorage(macros);
  return {
    macros,
    count: normalized.count
  };
}
