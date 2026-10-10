#!/usr/bin/env node

import fs from 'node:fs';

const MANIFEST_PATH = 'extension/config/tools-manifest.json';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function replaceInFile(path, replacers) {
  let content = fs.readFileSync(path, 'utf8');
  let changed = false;

  for (const { pattern, replacement } of replacers) {
    const next = content.replace(pattern, replacement);
    if (next !== content) {
      content = next;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(path, content, 'utf8');
    console.log(`updated: ${path}`);
  } else {
    console.log(`no change: ${path}`);
  }
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  const count = Array.isArray(manifest.tools) ? manifest.tools.length : 0;

  if (!count) {
    throw new Error('Tool count is 0 or manifest.tools is invalid.');
  }

  const countStr = String(count);

  replaceInFile('package.json', [
    {
      pattern: /with \d+\+? web productivity tools/gi,
      replacement: `with ${countStr} web productivity tools`
    }
  ]);

  replaceInFile('README.md', [
    {
      pattern: /with \d+\+? web productivity tools/gi,
      replacement: `with ${countStr} web productivity tools`
    },
    {
      pattern: /\*\*\d+\+? Tools\*\*/g,
      replacement: `**${countStr} Tools**`
    },
    {
      pattern: /Expanded toolkit to \d+\+? tools/gi,
      replacement: `Expanded toolkit to ${countStr} tools`
    }
  ]);

  replaceInFile('extension/_locales/en/messages.json', [
    {
      pattern: /with \d+\+? web productivity tools/gi,
      replacement: `with ${countStr} web productivity tools`
    },
    {
      pattern: /"\d+\+? Productivity Tools"/g,
      replacement: `"${countStr} Productivity Tools"`
    },
    {
      pattern: /with \d+\+? productivity tools/gi,
      replacement: `with ${countStr} productivity tools`
    }
  ]);

  replaceInFile('extension/_locales/tr/messages.json', [
    {
      pattern: /ile \d+\+? web verimlilik aracı/gi,
      replacement: `ile ${countStr} web verimlilik aracı`
    },
    {
      pattern: /"\d+\+? Verimlilik Aracı"/g,
      replacement: `"${countStr} Verimlilik Aracı"`
    },
    {
      pattern: /,\s*\d+\+? verimlilik aracı ile/gi,
      replacement: `, ${countStr} verimlilik aracı ile`
    }
  ]);

  replaceInFile('extension/_locales/fr/messages.json', [
    {
      pattern: /avec \d+\+? outils de productivité/gi,
      replacement: `avec ${countStr} outils de productivité`
    },
    {
      pattern: /"\d+\+? Outils de Productivité"/g,
      replacement: `"${countStr} Outils de Productivité"`
    },
    {
      pattern: /avec \d+\+? outils de productivité/gi,
      replacement: `avec ${countStr} outils de productivité`
    }
  ]);

  console.log(`done: synchronized tool count = ${countStr}`);
}

main();
