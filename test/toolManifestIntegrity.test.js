import fs from 'fs';
import path from 'path';
import { hasCoffeeMessage } from '../extension/core/coffeeMessages.js';
import { ICON_NAMES } from '../extension/shared/icons.js';

describe('Tool manifest integrity', () => {
  const workspaceRoot = process.cwd();
  const extensionRoot = path.join(workspaceRoot, 'extension');
  const manifestPath = path.join(extensionRoot, 'config', 'tools-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
  const localeCodes = ['en', 'tr', 'fr'];
  const locales = Object.fromEntries(
    localeCodes.map((code) => {
      const localePath = path.join(extensionRoot, '_locales', code, 'messages.json');
      return [code, JSON.parse(fs.readFileSync(localePath, 'utf8'))];
    })
  );

  test('all manifest tool ids are unique', () => {
    const ids = tools.map((tool) => tool.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(new Set(duplicates).size).toBe(0);
  });

  test('all manifest tool ids are kebab-case', () => {
    const invalid = tools
      .map((tool) => tool.id)
      .filter((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));

    expect(invalid).toEqual([]);
  });

  test('all manifest modules exist on disk', () => {
    const missingModules = tools
      .map((tool) => path.join(extensionRoot, 'tools', tool.module))
      .filter((modulePath) => !fs.existsSync(modulePath));

    expect(missingModules).toEqual([]);
  });

  test('all manifest modules export metadata/activate/deactivate consistently', async () => {
    for (const tool of tools) {
      const modulePath = path.join(extensionRoot, 'tools', tool.module);
      const moduleUrl = `file://${modulePath}`;
      // eslint-disable-next-line no-await-in-loop
      const toolModule = await import(moduleUrl);

      expect(toolModule.metadata).toBeDefined();
      expect(toolModule.metadata.id).toBe(tool.id);
      expect(typeof toolModule.activate).toBe('function');
      expect(typeof toolModule.deactivate).toBe('function');
    }
  });

  test('all manifest tool icons are registered', () => {
    const iconSet = new Set(ICON_NAMES);
    const missingIcons = tools
      .filter((tool) => !iconSet.has(tool.icon))
      .map((tool) => `${tool.id}:${tool.icon}`);

    expect(missingIcons).toEqual([]);
  });

  test('all manifest i18n keys exist in en/tr/fr locale files', () => {
    const missingKeys = [];

    tools.forEach((tool) => {
      const i18nValues = Object.values(tool.i18n || {}).filter(Boolean);
      i18nValues.forEach((key) => {
        localeCodes.forEach((localeCode) => {
          if (!locales[localeCode][key]) {
            missingKeys.push(`${tool.id}:${key}:${localeCode}`);
          }
        });
      });
    });

    Object.entries(manifest.categories || {}).forEach(([categoryId, category]) => {
      if (!category?.description) return;
      localeCodes.forEach((localeCode) => {
        if (!locales[localeCode][category.description]) {
          missingKeys.push(`category:${categoryId}:${category.description}:${localeCode}`);
        }
      });
    });

    expect(missingKeys).toEqual([]);
  });

  test('all manifest tools have coffee messages', () => {
    const missingCoffeeMessages = tools
      .filter((tool) => !hasCoffeeMessage(tool.id))
      .map((tool) => tool.id);

    expect(missingCoffeeMessages).toEqual([]);
  });

  test('tools calling showCoffeeMessageForTool use their manifest id', () => {
    const mismatches = [];

    tools.forEach((tool) => {
      const modulePath = path.join(extensionRoot, 'tools', tool.module);
      const source = fs.readFileSync(modulePath, 'utf8');
      const literalCalls = [...source.matchAll(/showCoffeeMessageForTool\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((match) => match[1]);

      if (literalCalls.length && !literalCalls.includes(tool.id)) {
        mismatches.push(`${tool.id}=>${literalCalls.join(',')}`);
      }
    });

    expect(mismatches).toEqual([]);
  });
});
