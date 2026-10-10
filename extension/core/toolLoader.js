import { resolveToolModuleUrl, getToolById } from './toolRegistry.js';

const moduleCache = new Map();

function cacheModule(toolId, loader) {
  moduleCache.set(toolId, loader);
  return loader;
}

export function clearToolModule(toolId) {
  if (toolId) {
    moduleCache.delete(toolId);
  } else {
    moduleCache.clear();
  }
}

export async function loadToolModule(toolId) {
  if (!toolId) {
    throw new Error('loadToolModule requires a tool id');
  }

  if (moduleCache.has(toolId)) {
    return moduleCache.get(toolId);
  }

  const modulePromise = (async () => {
    const tool = await getToolById(toolId);
    if (!tool) {
      throw new Error(`Unknown tool id: ${toolId}`);
    }

    const moduleUrl = await resolveToolModuleUrl(toolId);
    const mod = await import(moduleUrl);
    if (mod.metadata) {
      return mod;
    }
    return Object.assign({}, mod, { metadata: { ...tool } });
  })().catch((error) => {
    moduleCache.delete(toolId);
    console.error(`Toolboard: failed to load tool "${toolId}"`, error);
    throw error;
  });

  return cacheModule(toolId, modulePromise);
}

export async function activateTool(toolId, deactivateCallback) {
  const module = await loadToolModule(toolId);
  if (module?.activate) {
    module.activate(deactivateCallback);
    return true;
  }
  console.warn(`Toolboard: tool "${toolId}" does not export activate()`);
  return false;
}
