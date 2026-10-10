import { TOOL_CATEGORIES, TOOL_ICON_FALLBACK } from './constants.js';

let manifestPromise = null;
let registry = {
  categories: {},
  tools: [],
  toolsById: new Map()
};

async function fetchManifest() {
  if (manifestPromise) {
    return manifestPromise;
  }

  const manifestUrl = chrome.runtime.getURL('config/tools-manifest.json');
  manifestPromise = fetch(manifestUrl)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load tools manifest (${response.status})`);
      }
      const data = await response.json();
      hydrateRegistry(data);
      return registry;
    })
    .catch((error) => {
      manifestPromise = null;
      console.error('Toolboard: Unable to load tools manifest', error);
      throw error;
    });

  return manifestPromise;
}

function hydrateRegistry(data) {
  const categories = data?.categories || {};
  const tools = Array.isArray(data?.tools) ? data.tools : [];

  const toolsById = new Map(
    tools.map((tool) => {
      const normalized = normalizeTool(tool);
      return [normalized.id, normalized];
    })
  );

  registry = {
    categories: { ...TOOL_CATEGORIES, ...categories },
    tools: Array.from(toolsById.values()),
    toolsById
  };
}

function normalizeTool(tool) {
  const id = tool?.id || '';
  if (!id) {
    throw new Error('Tool manifest entry missing id');
  }

  const category = tool.category && registry.categories?.[tool.category]
    ? tool.category
    : tool.category in TOOL_CATEGORIES
      ? tool.category
      : 'utilities';

  return {
    id,
    name: tool.name || id,
    category,
    module: tool.module || '',
    icon: tool.icon || TOOL_ICON_FALLBACK,
    i18n: typeof tool.i18n === 'object' && tool.i18n ? { ...tool.i18n } : {},
    tags: Array.isArray(tool.tags) ? tool.tags : [],
    keywords: Array.isArray(tool.keywords) ? tool.keywords : [],
    shortcut: tool.shortcut || null,
    permissions: Array.isArray(tool.permissions) ? tool.permissions : [],
    favorite: Boolean(tool.favorite),
    description: tool.description || '',
    order: typeof tool.order === 'number' ? tool.order : Number.MAX_SAFE_INTEGER
  };
}

export async function ensureRegistryLoaded() {
  await fetchManifest();
  return registry;
}

export async function getAllTools() {
  const data = await ensureRegistryLoaded();
  return data.tools.slice().sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
}

export async function getToolById(toolId) {
  if (!toolId) return null;
  const data = await ensureRegistryLoaded();
  return data.toolsById.get(toolId) || null;
}

export async function getToolsByCategory(categoryId) {
  const data = await ensureRegistryLoaded();
  return data.tools.filter((tool) => tool.category === categoryId);
}

export async function getCategories() {
  const data = await ensureRegistryLoaded();
  return Object.values(TOOL_CATEGORIES)
    .map((category) => ({
      ...category,
      ...(data.categories?.[category.id] || {})
    }))
    .sort((a, b) => a.order - b.order);
}

export async function resolveToolModuleUrl(toolId) {
  const tool = await getToolById(toolId);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  const modulePath = tool.module;
  if (!modulePath) {
    throw new Error(`Tool "${toolId}" missing module path`);
  }
  return chrome.runtime.getURL(`tools/${modulePath}`);
}

export function clearToolRegistryCache() {
  manifestPromise = null;
  registry = {
    categories: {},
    tools: [],
    toolsById: new Map()
  };
}
