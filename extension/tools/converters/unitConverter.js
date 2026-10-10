import {
  addEventListenerWithCleanup,
  copyText,
  ensureLanguageLoaded,
  handleError,
  showError,
  showSuccess,
  t
} from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'unit-converter',
  name: 'Unit Converter',
  category: 'converters',
  icon: 'wrench',
  permissions: ['activeTab'],
  tags: ['converter', 'units', 'measurement'],
  keywords: ['unit conversion', 'length', 'weight', 'temperature', 'speed', 'data size']
};

const UNIT_GROUPS = {
  length: {
    label: 'Length',
    units: {
      mm: { label: 'Millimeter (mm)', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      cm: { label: 'Centimeter (cm)', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      m: { label: 'Meter (m)', toBase: (v) => v, fromBase: (v) => v },
      km: { label: 'Kilometer (km)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      in: { label: 'Inch (in)', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
      ft: { label: 'Foot (ft)', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
      yd: { label: 'Yard (yd)', toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
      mi: { label: 'Mile (mi)', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 }
    }
  },
  mass: {
    label: 'Mass',
    units: {
      mg: { label: 'Milligram (mg)', toBase: (v) => v / 1000000, fromBase: (v) => v * 1000000 },
      g: { label: 'Gram (g)', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      kg: { label: 'Kilogram (kg)', toBase: (v) => v, fromBase: (v) => v },
      t: { label: 'Ton (t)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      oz: { label: 'Ounce (oz)', toBase: (v) => v * 0.028349523125, fromBase: (v) => v / 0.028349523125 },
      lb: { label: 'Pound (lb)', toBase: (v) => v * 0.45359237, fromBase: (v) => v / 0.45359237 }
    }
  },
  temperature: {
    label: 'Temperature',
    units: {
      c: {
        label: 'Celsius (°C)',
        toBase: (v) => v,
        fromBase: (v) => v
      },
      f: {
        label: 'Fahrenheit (°F)',
        toBase: (v) => (v - 32) * (5 / 9),
        fromBase: (v) => v * (9 / 5) + 32
      },
      k: {
        label: 'Kelvin (K)',
        toBase: (v) => v - 273.15,
        fromBase: (v) => v + 273.15
      }
    }
  },
  speed: {
    label: 'Speed',
    units: {
      'm/s': { label: 'Meter/second (m/s)', toBase: (v) => v, fromBase: (v) => v },
      'km/h': { label: 'Kilometer/hour (km/h)', toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
      mph: { label: 'Mile/hour (mph)', toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
      kn: { label: 'Knot (kn)', toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 }
    }
  },
  volume: {
    label: 'Volume',
    units: {
      ml: { label: 'Milliliter (mL)', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      l: { label: 'Liter (L)', toBase: (v) => v, fromBase: (v) => v },
      'm3': { label: 'Cubic meter (m³)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      'ft3': { label: 'Cubic foot (ft³)', toBase: (v) => v * 28.316846592, fromBase: (v) => v / 28.316846592 },
      gal: { label: 'US gallon (gal)', toBase: (v) => v * 3.785411784, fromBase: (v) => v / 3.785411784 }
    }
  },
  area: {
    label: 'Area',
    units: {
      'm2': { label: 'Square meter (m²)', toBase: (v) => v, fromBase: (v) => v },
      'km2': { label: 'Square kilometer (km²)', toBase: (v) => v * 1000000, fromBase: (v) => v / 1000000 },
      'ft2': { label: 'Square foot (ft²)', toBase: (v) => v * 0.09290304, fromBase: (v) => v / 0.09290304 },
      'yd2': { label: 'Square yard (yd²)', toBase: (v) => v * 0.83612736, fromBase: (v) => v / 0.83612736 },
      ha: { label: 'Hectare (ha)', toBase: (v) => v * 10000, fromBase: (v) => v / 10000 },
      ac: { label: 'Acre (ac)', toBase: (v) => v * 4046.8564224, fromBase: (v) => v / 4046.8564224 }
    }
  },
  data: {
    label: 'Data',
    units: {
      b: { label: 'Byte (B)', toBase: (v) => v, fromBase: (v) => v },
      kb: { label: 'Kilobyte (KB)', toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
      mb: { label: 'Megabyte (MB)', toBase: (v) => v * 1024 * 1024, fromBase: (v) => v / (1024 * 1024) },
      gb: { label: 'Gigabyte (GB)', toBase: (v) => v * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024) },
      tb: { label: 'Terabyte (TB)', toBase: (v) => v * 1024 * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024 * 1024) }
    }
  }
};

const GROUP_LABEL_KEYS = {
  length: 'unitConverterGroupLength',
  mass: 'unitConverterGroupMass',
  temperature: 'unitConverterGroupTemperature',
  speed: 'unitConverterGroupSpeed',
  volume: 'unitConverterGroupVolume',
  area: 'unitConverterGroupArea',
  data: 'unitConverterGroupData'
};

const UNIT_LABEL_KEYS = {
  length: {
    mm: 'unitConverterUnitMillimeter',
    cm: 'unitConverterUnitCentimeter',
    m: 'unitConverterUnitMeter',
    km: 'unitConverterUnitKilometer',
    in: 'unitConverterUnitInch',
    ft: 'unitConverterUnitFoot',
    yd: 'unitConverterUnitYard',
    mi: 'unitConverterUnitMile'
  },
  mass: {
    mg: 'unitConverterUnitMilligram',
    g: 'unitConverterUnitGram',
    kg: 'unitConverterUnitKilogram',
    t: 'unitConverterUnitTon',
    oz: 'unitConverterUnitOunce',
    lb: 'unitConverterUnitPound'
  },
  temperature: {
    c: 'unitConverterUnitCelsius',
    f: 'unitConverterUnitFahrenheit',
    k: 'unitConverterUnitKelvin'
  },
  speed: {
    'm/s': 'unitConverterUnitMeterPerSecond',
    'km/h': 'unitConverterUnitKilometerPerHour',
    mph: 'unitConverterUnitMilePerHour',
    kn: 'unitConverterUnitKnot'
  },
  volume: {
    ml: 'unitConverterUnitMilliliter',
    l: 'unitConverterUnitLiter',
    m3: 'unitConverterUnitCubicMeter',
    ft3: 'unitConverterUnitCubicFoot',
    gal: 'unitConverterUnitUSGallon'
  },
  area: {
    m2: 'unitConverterUnitSquareMeter',
    km2: 'unitConverterUnitSquareKilometer',
    ft2: 'unitConverterUnitSquareFoot',
    yd2: 'unitConverterUnitSquareYard',
    ha: 'unitConverterUnitHectare',
    ac: 'unitConverterUnitAcre'
  },
  data: {
    b: 'unitConverterUnitByte',
    kb: 'unitConverterUnitKilobyte',
    mb: 'unitConverterUnitMegabyte',
    gb: 'unitConverterUnitGigabyte',
    tb: 'unitConverterUnitTerabyte'
  }
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let lastResult = '';
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || document.getElementById('toolary-unit-converter-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-unit-converter-styles';
  style.textContent = `
    #toolary-unit-converter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;}
    #toolary-unit-converter{width:min(460px,100%);border:1px solid var(--toolary-border,#ddd);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.24);padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--toolary-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-unit-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;}
    .toolary-unit-title{font-size:16px;}
    .toolary-unit-grid{display:grid;gap:10px;}
    .toolary-unit-label{display:grid;gap:6px;}
    .toolary-unit-caption{font-size:12px;opacity:.85;}
    .toolary-unit-control{padding:8px;border-radius:8px;border:1px solid var(--toolary-border,#ddd);background:var(--toolary-unit-control-bg,#fff);color:var(--toolary-text,#111);}
    .toolary-unit-conversion{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;}
    .toolary-unit-result{display:grid;gap:6px;margin-top:2px;}
    #toolary-unit-output{min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--toolary-border,#ddd);background:var(--toolary-unit-muted-bg,rgba(127,127,127,.08));white-space:pre-wrap;}
    .toolary-unit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;}
    .toolary-unit-btn{border-radius:8px;border:1px solid var(--toolary-border,#ddd);background:transparent;color:var(--toolary-text,#111);padding:8px 12px;cursor:pointer;}
    .toolary-unit-btn--swap{height:36px;padding:0 10px;}
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function clearCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      handleError(error, 'unitConverter.clearCleanup');
    }
  });
  cleanupFns = [];
}

function parseInputNumber(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const normalized = rawValue.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000000 || (Math.abs(value) > 0 && Math.abs(value) < 0.000001)) {
    return value.toExponential(8);
  }
  return Number(value.toFixed(8)).toString();
}

function convertValue(groupKey, value, fromUnit, toUnit) {
  const group = UNIT_GROUPS[groupKey];
  if (!group) return null;
  const from = group.units[fromUnit];
  const to = group.units[toUnit];
  if (!from || !to) return null;

  const baseValue = from.toBase(value);
  return to.fromBase(baseValue);
}

function buildUnitOptions(groupKey, selectedUnit) {
  const group = UNIT_GROUPS[groupKey];
  if (!group) return '';

  return Object.entries(group.units)
    .map(([unitKey, unit]) => `<option value="${unitKey}" ${unitKey === selectedUnit ? 'selected' : ''}>${getUnitLabel(groupKey, unitKey, unit.label)}</option>`)
    .join('');
}

function getGroupLabel(groupKey) {
  const group = UNIT_GROUPS[groupKey];
  if (!group) return groupKey;
  const labelKey = GROUP_LABEL_KEYS[groupKey];
  return (labelKey && t(labelKey)) || group.label || groupKey;
}

function getUnitLabel(groupKey, unitKey, fallbackLabel = unitKey) {
  const labelKey = UNIT_LABEL_KEYS[groupKey]?.[unitKey];
  if (!labelKey) return fallbackLabel;
  return t(labelKey) || fallbackLabel;
}

function readFormState() {
  return {
    group: panel?.querySelector('#toolary-unit-group')?.value || 'length',
    fromUnit: panel?.querySelector('#toolary-unit-from')?.value || 'm',
    toUnit: panel?.querySelector('#toolary-unit-to')?.value || 'km',
    input: panel?.querySelector('#toolary-unit-input')?.value || ''
  };
}

function setResultText(text) {
  const output = panel?.querySelector('#toolary-unit-output');
  if (!output) return;
  output.textContent = text;
}

function updateUnitsForGroup(groupKey) {
  const group = UNIT_GROUPS[groupKey];
  if (!group) return;

  const unitKeys = Object.keys(group.units);
  const defaultFrom = unitKeys[0];
  const defaultTo = unitKeys[Math.min(1, unitKeys.length - 1)] || unitKeys[0];

  const fromSelect = panel?.querySelector('#toolary-unit-from');
  const toSelect = panel?.querySelector('#toolary-unit-to');
  if (!fromSelect || !toSelect) return;

  fromSelect.innerHTML = buildUnitOptions(groupKey, defaultFrom);
  toSelect.innerHTML = buildUnitOptions(groupKey, defaultTo);
}

function runConversion() {
  const { group, fromUnit, toUnit, input } = readFormState();
  const numericValue = parseInputNumber(input);

  if (numericValue === null) {
    lastResult = '';
    setResultText(t('unitConverterInvalidNumber') || 'Enter a valid number.');
    return;
  }

  const converted = convertValue(group, numericValue, fromUnit, toUnit);
  if (converted === null) {
    lastResult = '';
    setResultText(t('unitConverterConversionFailed') || 'Conversion failed.');
    return;
  }

  const fromLabel = getUnitLabel(group, fromUnit, UNIT_GROUPS[group].units[fromUnit]?.label || fromUnit);
  const toLabel = getUnitLabel(group, toUnit, UNIT_GROUPS[group].units[toUnit]?.label || toUnit);
  const outputText = `${formatNumber(numericValue)} ${fromLabel} = ${formatNumber(converted)} ${toLabel}`;

  lastResult = outputText;
  setResultText(outputText);
}

function createPanel() {
  const overlay = document.createElement('div');
  overlay.id = 'toolary-unit-converter-overlay';
  overlay.style.setProperty('--toolary-unit-control-bg', 'var(--toolary-bg, #fff)');
  overlay.style.setProperty('--toolary-unit-muted-bg', 'rgba(127,127,127,.08)');

  const dialog = document.createElement('div');
  dialog.id = 'toolary-unit-converter';

  dialog.innerHTML = `
    <div class="toolary-unit-header">
      <strong class="toolary-unit-title">${t('unitConverterTitle') || 'Unit Converter'}</strong>
      <button id="toolary-unit-close" class="toolary-unit-btn" type="button">${t('close') || 'Close'}</button>
    </div>
    <div class="toolary-unit-grid">
      <label class="toolary-unit-label">
        <span class="toolary-unit-caption">${t('unitConverterCategory') || 'Category'}</span>
        <select id="toolary-unit-group" class="toolary-unit-control">
          ${Object.entries(UNIT_GROUPS).map(([key]) => `<option value="${key}">${getGroupLabel(key)}</option>`).join('')}
        </select>
      </label>
      <label class="toolary-unit-label">
        <span class="toolary-unit-caption">${t('unitConverterValue') || 'Value'}</span>
        <input id="toolary-unit-input" class="toolary-unit-control" type="text" inputmode="decimal" placeholder="${t('unitConverterInputPlaceholder') || '0'}" />
      </label>
      <div class="toolary-unit-conversion">
        <label class="toolary-unit-label">
          <span class="toolary-unit-caption">${t('unitConverterFrom') || 'From'}</span>
          <select id="toolary-unit-from" class="toolary-unit-control"></select>
        </label>
        <button id="toolary-unit-swap" class="toolary-unit-btn toolary-unit-btn--swap" type="button">${t('unitConverterSwap') || 'Swap'}</button>
        <label class="toolary-unit-label">
          <span class="toolary-unit-caption">${t('unitConverterTo') || 'To'}</span>
          <select id="toolary-unit-to" class="toolary-unit-control"></select>
        </label>
      </div>
      <div class="toolary-unit-result">
        <span class="toolary-unit-caption">${t('unitConverterResult') || 'Result'}</span>
        <div id="toolary-unit-output"></div>
      </div>
      <div class="toolary-unit-actions">
        <button id="toolary-unit-copy" class="toolary-unit-btn" type="button">${t('unitConverterCopyResult') || 'Copy Result'}</button>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  panel = overlay;
  updateUnitsForGroup('length');
  runConversion();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;

  try {
    await ensureLanguageLoaded();
    ensureStyles();

    if (panel) {
      panel.remove();
      panel = null;
    }

    createPanel();

    const closeBtn = panel.querySelector('#toolary-unit-close');
    const groupEl = panel.querySelector('#toolary-unit-group');
    const fromEl = panel.querySelector('#toolary-unit-from');
    const toEl = panel.querySelector('#toolary-unit-to');
    const inputEl = panel.querySelector('#toolary-unit-input');
    const swapBtn = panel.querySelector('#toolary-unit-swap');
    const copyBtn = panel.querySelector('#toolary-unit-copy');

    cleanupFns.push(addEventListenerWithCleanup(closeBtn, 'click', () => deactivateCb?.()));
    cleanupFns.push(addEventListenerWithCleanup(panel, 'click', (event) => {
      if (event.target === panel) {
        deactivateCb?.();
      }
    }));

    cleanupFns.push(addEventListenerWithCleanup(groupEl, 'change', () => {
      updateUnitsForGroup(groupEl.value);
      runConversion();
    }));

    cleanupFns.push(addEventListenerWithCleanup(fromEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(toEl, 'change', runConversion));
    cleanupFns.push(addEventListenerWithCleanup(inputEl, 'input', runConversion));

    cleanupFns.push(addEventListenerWithCleanup(swapBtn, 'click', () => {
      const currentFrom = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = currentFrom;
      runConversion();
    }));

    cleanupFns.push(addEventListenerWithCleanup(copyBtn, 'click', async () => {
      if (!lastResult) {
        showError(t('unitConverterInvalidNumber') || 'Enter a valid number.');
        return;
      }
      await copyText(lastResult);
      showSuccess(t('unitConverterCopied') || 'Result copied.');
      showCoffeeMessageForTool('unit-converter');
    }));

    inputEl.focus();
    inputEl.select();
  } catch (error) {
    handleError(error, 'unitConverter.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  clearCleanup();

  if (panel) {
    panel.remove();
    panel = null;
  }

  lastResult = '';
  deactivateCb = null;
}
