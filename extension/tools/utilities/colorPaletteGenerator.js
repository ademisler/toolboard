import { showError, showSuccess, showInfo, showModal, handleError, safeExecute, t, ensureLanguageLoaded } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'color-palette-generator',
  name: 'Color Palette Generator',
  category: 'utilities',
  icon: 'palette',
  permissions: ['activeTab'],
  tags: ['color', 'design', 'palette', 'harmony'],
  keywords: ['color scheme', 'palette', 'harmony', 'contrast', 'accessibility', 'wcag']
};

// Color conversion utilities
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);

  return { r, g, b };
}

// Calculate relative luminance for WCAG contrast
function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Calculate WCAG contrast ratio
function getContrastRatio(color1, color2) {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Get WCAG accessibility level
function getAccessibilityLevel(ratio) {
  if (ratio >= 7) return { level: 'AAA', score: '✓' };
  if (ratio >= 4.5) return { level: 'AA', score: '⚠' };
  return { level: 'Fail', score: '✗' };
}

// Calculate color difference using deltaE2000 approximation
function getColorDifference(color1, color2) {
  const hsl1 = rgbToHsl(color1.r, color1.g, color1.b);
  const hsl2 = rgbToHsl(color2.r, color2.g, color2.b);
  
  const hDiff = Math.abs(hsl1.h - hsl2.h);
  const sDiff = Math.abs(hsl1.s - hsl2.s);
  const lDiff = Math.abs(hsl1.l - hsl2.l);
  
  // Simplified deltaE calculation
  return Math.sqrt(hDiff * hDiff + sDiff * sDiff + lDiff * lDiff);
}

// Extract colors from page elements
function extractPageColors() {
  try {
    const colors = new Map();
    const elements = document.querySelectorAll('*');
    
    elements.forEach(element => {
      try {
        const computedStyle = window.getComputedStyle(element);
        const colorProperties = ['color', 'backgroundColor', 'borderColor'];
        
        colorProperties.forEach(prop => {
          const colorValue = computedStyle[prop];
          if (!colorValue || colorValue === 'transparent' || colorValue === 'rgba(0, 0, 0, 0)') return;
          
          // Convert to hex
          const tempDiv = document.createElement('div');
          tempDiv.style.color = colorValue;
          document.body.appendChild(tempDiv);
          const computedColor = window.getComputedStyle(tempDiv).color;
          document.body.removeChild(tempDiv);
          
          if (computedColor && computedColor !== 'rgb(0, 0, 0)' && computedColor !== 'rgb(255, 255, 255)') {
            const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
              const r = parseInt(rgbMatch[1]);
              const g = parseInt(rgbMatch[2]);
              const b = parseInt(rgbMatch[3]);
              const hex = rgbToHex(r, g, b);
              
              if (colors.has(hex)) {
                colors.set(hex, colors.get(hex) + 1);
              } else {
                colors.set(hex, 1);
              }
            }
          }
        });
      } catch {
        // Skip problematic elements
      }
    });
    
    // Convert to array and sort by frequency
    return Array.from(colors.entries())
      .map(([hex, count]) => ({ hex, count, rgb: hexToRgb(hex) }))
      .filter(color => color.rgb)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Limit to top 20 colors
      
  } catch (error) {
    handleError(error, 'extractPageColors');
    return [];
  }
}

// Group similar colors
function groupSimilarColors(colors) {
  const groups = [];
  const used = new Set();
  
  colors.forEach(color => {
    if (used.has(color.hex)) return;
    
    const group = [color];
    used.add(color.hex);
    
    colors.forEach(otherColor => {
      if (used.has(otherColor.hex) || otherColor.hex === color.hex) return;
      
      const difference = getColorDifference(color.rgb, otherColor.rgb);
      if (difference < 15) { // Similar colors threshold
        group.push(otherColor);
        used.add(otherColor.hex);
      }
    });
    
    groups.push(group);
  });
  
  return groups;
}

// Generate color harmonies
function generateHarmonies(colors) {
  if (colors.length === 0) return {};
  
  const harmonies = {};
  
  // Get the most prominent color as base
  const baseColor = colors[0];
  const baseHsl = rgbToHsl(baseColor.rgb.r, baseColor.rgb.g, baseColor.rgb.b);
  
  // Complementary (180 degrees)
  const compHue = (baseHsl.h + 180) % 360;
  const compRgb = hslToRgb(compHue, baseHsl.s, baseHsl.l);
  harmonies.complementary = [
    { hex: baseColor.hex, name: 'Primary' },
    { hex: rgbToHex(compRgb.r, compRgb.g, compRgb.b), name: 'Complementary' }
  ];
  
  // Analogous (+/- 30 degrees)
  const anal1Hue = (baseHsl.h + 30) % 360;
  const anal2Hue = (baseHsl.h - 30 + 360) % 360;
  const anal1Rgb = hslToRgb(anal1Hue, baseHsl.s, baseHsl.l);
  const anal2Rgb = hslToRgb(anal2Hue, baseHsl.s, baseHsl.l);
  harmonies.analogous = [
    { hex: rgbToHex(anal2Rgb.r, anal2Rgb.g, anal2Rgb.b), name: 'Analogous 1' },
    { hex: baseColor.hex, name: 'Primary' },
    { hex: rgbToHex(anal1Rgb.r, anal1Rgb.g, anal1Rgb.b), name: 'Analogous 2' }
  ];
  
  // Triadic (120 degrees)
  const tri1Hue = (baseHsl.h + 120) % 360;
  const tri2Hue = (baseHsl.h + 240) % 360;
  const tri1Rgb = hslToRgb(tri1Hue, baseHsl.s, baseHsl.l);
  const tri2Rgb = hslToRgb(tri2Hue, baseHsl.s, baseHsl.l);
  harmonies.triadic = [
    { hex: baseColor.hex, name: 'Primary' },
    { hex: rgbToHex(tri1Rgb.r, tri1Rgb.g, tri1Rgb.b), name: 'Triadic 1' },
    { hex: rgbToHex(tri2Rgb.r, tri2Rgb.g, tri2Rgb.b), name: 'Triadic 2' }
  ];
  
  // Split complementary
  const split1Hue = (baseHsl.h + 150) % 360;
  const split2Hue = (baseHsl.h + 210) % 360;
  const split1Rgb = hslToRgb(split1Hue, baseHsl.s, baseHsl.l);
  const split2Rgb = hslToRgb(split2Hue, baseHsl.s, baseHsl.l);
  harmonies.splitComplementary = [
    { hex: baseColor.hex, name: 'Primary' },
    { hex: rgbToHex(split1Rgb.r, split1Rgb.g, split1Rgb.b), name: 'Split 1' },
    { hex: rgbToHex(split2Rgb.r, split2Rgb.g, split2Rgb.b), name: 'Split 2' }
  ];
  
  return harmonies;
}

// Generate accessibility scores
function generateAccessibilityScores(colors) {
  const scores = [];
  const commonTextColors = [
    { hex: '#000000', name: 'Black', rgb: { r: 0, g: 0, b: 0 } },
    { hex: '#333333', name: 'Dark Gray', rgb: { r: 51, g: 51, b: 51 } },
    { hex: '#666666', name: 'Medium Gray', rgb: { r: 102, g: 102, b: 102 } },
    { hex: '#999999', name: 'Light Gray', rgb: { r: 153, g: 153, b: 153 } },
    { hex: '#ffffff', name: 'White', rgb: { r: 255, g: 255, b: 255 } }
  ];
  
  colors.slice(0, 5).forEach(bgColor => {
    if (!bgColor.rgb) return; // Skip if no RGB data
    
    commonTextColors.forEach(textColor => {
      const contrastRatio = getContrastRatio(bgColor.rgb, textColor.rgb);
      const accessibility = getAccessibilityLevel(contrastRatio);
      
      scores.push({
        background: bgColor.hex,
        backgroundName: bgColor.hex,
        text: textColor.hex,
        textName: textColor.name,
        ratio: contrastRatio.toFixed(1),
        level: accessibility.level,
        score: accessibility.score
      });
    });
  });
  
  return scores.sort((a, b) => parseFloat(b.ratio) - parseFloat(a.ratio));
}

// Generate CSS variables
function generateCSSVariables(colors, harmonies) {
  let css = ':root {\n';
  css += '  /* Extracted Colors */\n';
  colors.slice(0, 8).forEach((color, index) => {
    css += `  --color-${index + 1}: ${color.hex};\n`;
  });
  
  css += '\n  /* Harmonic Palettes */\n';
  Object.entries(harmonies).forEach(([name, palette]) => {
    css += `\n  /* ${name.charAt(0).toUpperCase() + name.slice(1)} */\n`;
    palette.forEach((color, index) => {
      css += `  --${name}-${index + 1}: ${color.hex};\n`;
    });
  });
  
  css += '}\n';
  return css;
}

// Generate JSON format
function generateJSON(colors, harmonies, accessibility) {
  return JSON.stringify({
    extractedColors: colors.map(color => ({
      hex: color.hex,
      rgb: `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`,
      frequency: color.count
    })),
    harmonies: harmonies,
    accessibility: accessibility.map(score => ({
      background: score.background,
      text: score.text,
      ratio: score.ratio,
      level: score.level
    })),
    generatedAt: new Date().toISOString()
  }, null, 2);
}

// Generate report text
function generateReportText(colors, harmonies, accessibility) {
  let report = 'COLOR PALETTE ANALYSIS\n\n';
  
  report += `EXTRACTED COLORS (${colors.length})\n`;
  colors.slice(0, 12).forEach((color, index) => {
    report += `${index + 1}. ${color.hex} (used ${color.count} times)\n`;
  });
  
  report += '\nHARMONIC PALETTES\n';
  Object.entries(harmonies).forEach(([name, palette]) => {
    report += `\n${name.charAt(0).toUpperCase() + name.slice(1)}:\n`;
    palette.forEach(color => {
      report += `  • ${color.hex} (${color.name})\n`;
    });
  });
  
  report += '\nACCESSIBILITY SCORES\n';
  report += 'Background/Text Combinations:\n';
  accessibility.slice(0, 10).forEach(score => {
    report += `${score.score} ${score.text} on ${score.background} - ${score.level} (${score.ratio}:1)\n`;
  });
  
  return report;
}

// Generate HTML content with color swatches for modal
// eslint-disable-next-line no-unused-vars
function generateHTMLContent(colors, harmonies, accessibility) {
  const html = document.createElement('div');
  html.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
  
  // Title
  const title = document.createElement('h2');
  title.textContent = t('colorPaletteAnalysis', 'Color Palette Analysis');
  title.style.cssText = 'margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: var(--toolary-text, #333);';
  html.appendChild(title);
  
  // Extracted Colors Section
  const colorsSection = document.createElement('div');
  colorsSection.style.marginBottom = '24px';
  
  const colorsTitle = document.createElement('h3');
  colorsTitle.textContent = `Extracted Colors (${colors.length})`;
  colorsTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--toolary-text, #333);';
  colorsSection.appendChild(colorsTitle);
  
  const colorsGrid = document.createElement('div');
  colorsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px;';
  
  colors.slice(0, 12).forEach((color) => {
    const colorCard = document.createElement('div');
    colorCard.style.cssText = 'display: flex; flex-direction: column; align-items: center; padding: 8px; border: 1px solid var(--toolary-border, #ddd); border-radius: 8px; background: var(--toolary-bg, #fff);';
    
    const colorSwatch = document.createElement('div');
    colorSwatch.style.cssText = `width: 40px; height: 40px; background-color: ${color.hex}; border-radius: 6px; border: 1px solid var(--toolary-border, #ddd); margin-bottom: 6px;`;
    
    const colorCode = document.createElement('div');
    colorCode.textContent = color.hex;
    colorCode.style.cssText = 'font-size: 11px; font-family: monospace; color: var(--toolary-text, #333); text-align: center;';
    
    const colorCount = document.createElement('div');
    colorCount.textContent = `${color.count}x`;
    colorCount.style.cssText = 'font-size: 10px; color: var(--toolary-secondary-text, #666); margin-top: 2px;';
    
    colorCard.appendChild(colorSwatch);
    colorCard.appendChild(colorCode);
    colorCard.appendChild(colorCount);
    colorsGrid.appendChild(colorCard);
  });
  
  colorsSection.appendChild(colorsGrid);
  html.appendChild(colorsSection);
  
  // Harmonic Palettes Section
  const harmoniesSection = document.createElement('div');
  harmoniesSection.style.marginBottom = '24px';
  
  const harmoniesTitle = document.createElement('h3');
  harmoniesTitle.textContent = t('harmonicPalettes', 'Harmonic Palettes');
  harmoniesTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--toolary-text, #333);';
  harmoniesSection.appendChild(harmoniesTitle);
  
  Object.entries(harmonies).forEach(([name, palette]) => {
    const harmonyGroup = document.createElement('div');
    harmonyGroup.style.marginBottom = '16px';
    
    const harmonyTitle = document.createElement('h4');
    harmonyTitle.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    harmonyTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: var(--toolary-text, #333);';
    
    const harmonySwatches = document.createElement('div');
    harmonySwatches.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
    
    palette.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.style.cssText = 'display: flex; flex-direction: column; align-items: center;';
      
      const colorBox = document.createElement('div');
      colorBox.style.cssText = `width: 32px; height: 32px; background-color: ${color.hex}; border-radius: 4px; border: 1px solid var(--toolary-border, #ddd); margin-bottom: 4px;`;
      
      const colorLabel = document.createElement('div');
      colorLabel.textContent = color.hex;
      colorLabel.style.cssText = 'font-size: 10px; font-family: monospace; color: var(--toolary-text, #333);';
      
      swatch.appendChild(colorBox);
      swatch.appendChild(colorLabel);
      harmonySwatches.appendChild(swatch);
    });
    
    harmonyGroup.appendChild(harmonyTitle);
    harmonyGroup.appendChild(harmonySwatches);
    harmoniesSection.appendChild(harmonyGroup);
  });
  
  html.appendChild(harmoniesSection);
  
  // Accessibility Section
  const accessibilitySection = document.createElement('div');
  accessibilitySection.style.marginBottom = '24px';
  
  const accessibilityTitle = document.createElement('h3');
  accessibilityTitle.textContent = t('accessibilityScores', 'Accessibility Scores');
  accessibilityTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--toolary-text, #333);';
  accessibilitySection.appendChild(accessibilityTitle);
  
  const accessibilityList = document.createElement('div');
  accessibilityList.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
  
  accessibility.slice(0, 10).forEach(score => {
    const scoreItem = document.createElement('div');
    scoreItem.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--toolary-bg, #fff); border: 1px solid var(--toolary-border, #ddd); border-radius: 4px;';
    
    const statusIcon = document.createElement('span');
    statusIcon.textContent = score.level === 'AAA' ? '✓' : score.level === 'AA' ? '⚠' : '✗';
    statusIcon.style.cssText = `font-size: 14px; color: ${score.level === 'AAA' ? '#22c55e' : score.level === 'AA' ? '#f59e0b' : '#ef4444'};`;
    
    const scoreText = document.createElement('span');
    scoreText.textContent = `${score.text} on ${score.background} - ${score.level} (${score.ratio}:1)`;
    scoreText.style.cssText = 'font-size: 12px; color: var(--toolary-text, #333);';
    
    scoreItem.appendChild(statusIcon);
    scoreItem.appendChild(scoreText);
    accessibilityList.appendChild(scoreItem);
  });
  
  accessibilitySection.appendChild(accessibilityList);
  html.appendChild(accessibilitySection);
  
  // Export buttons
  const exportSection = document.createElement('div');
  exportSection.style.cssText = 'margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--toolary-border, #ddd);';
  
  const exportTitle = document.createElement('h3');
  exportTitle.textContent = t('exportOptions', 'Export Options');
  exportTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--toolary-text, #333);';
  exportSection.appendChild(exportTitle);
  
  const exportButtons = document.createElement('div');
  exportButtons.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
  
  // CSS Export Button
  const cssButton = document.createElement('button');
  cssButton.textContent = t('copyCSS', 'Copy CSS');
  cssButton.style.cssText = 'padding: 8px 16px; background: var(--toolary-primary, #007bff); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
  cssButton.addEventListener('click', () => {
    const css = generateCSSVariables(colors, harmonies);
    navigator.clipboard.writeText(css).then(() => {
      const successMessage = chrome.i18n ? chrome.i18n.getMessage('cssCopiedToClipboard') : 'CSS copied to clipboard!';
      showSuccess(successMessage);
    });
  });
  
  // JSON Export Button
  const jsonButton = document.createElement('button');
  jsonButton.textContent = t('copyJSON', 'Copy JSON');
  jsonButton.style.cssText = 'padding: 8px 16px; background: var(--toolary-secondary, #6c757d); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
  jsonButton.addEventListener('click', () => {
    const json = generateJSON(colors, harmonies, accessibility);
    navigator.clipboard.writeText(json).then(() => {
      const successMessage = chrome.i18n ? chrome.i18n.getMessage('jsonCopiedToClipboard') : 'JSON copied to clipboard!';
      showSuccess(successMessage);
    });
  });
  
  exportButtons.appendChild(cssButton);
  exportButtons.appendChild(jsonButton);
  exportSection.appendChild(exportButtons);
  html.appendChild(exportSection);
  
  return html;
}

export async function activate(deactivate) {
  try {
    // Ensure language is loaded before creating UI
    await ensureLanguageLoaded();
    
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('analyzingPageColors') : 'Analyzing page colors...';
    showInfo(infoMessage, 2000);
    
    // Extract colors from page
    const extractedColors = safeExecute(() => extractPageColors(), 'extractPageColors') || [];
    
    if (extractedColors.length === 0) {
      const errorMessage = chrome.i18n ? chrome.i18n.getMessage('noColorsFoundOnPage') : 'No colors found on this page. Try a page with more visual content.';
      showError(errorMessage);
      deactivate();
      return;
    }
    
    // Group similar colors
    const colorGroups = safeExecute(() => groupSimilarColors(extractedColors), 'groupSimilarColors') || [];
    const representativeColors = colorGroups.map(group => group[0]);
    
    // Generate harmonies
    const harmonies = safeExecute(() => generateHarmonies(representativeColors), 'generateHarmonies') || {};
    
    // Generate accessibility scores
    const accessibility = safeExecute(() => generateAccessibilityScores(representativeColors), 'generateAccessibilityScores') || [];
    
    // Generate exports
    const cssExport = safeExecute(() => generateCSSVariables(representativeColors, harmonies), 'generateCSSVariables') || '';
    const jsonExport = safeExecute(() => generateJSON(representativeColors, harmonies, accessibility), 'generateJSON') || '';
    
    // Generate report
    const reportText = safeExecute(() => generateReportText(representativeColors, harmonies, accessibility), 'generateReportText') || '';
    
    const successMessage = chrome.i18n ? chrome.i18n.getMessage('colorAnalysisCompleted') : 'Color analysis completed!';
    showSuccess(successMessage);
    
    // Show modal with results (type 'color-palette' will show color swatches)
    showModal('Color Palette Analysis', reportText, 'palette', 'color-palette');
    
    // Show coffee message when modal is closed
    setTimeout(() => {
      const modalOverlay = document.querySelector('#toolary-modal-overlay');
      if (modalOverlay) {
        // Override the remove method to show coffee message
        const originalRemove = modalOverlay.remove;
        modalOverlay.remove = function() {
          originalRemove.call(this);
          showCoffeeMessageForTool('color-palette-generator');
        };
        
        // Also override the dismiss button click
        const dismissBtn = modalOverlay.querySelector('button[type="button"]');
        if (dismissBtn) {
          const originalClick = dismissBtn.onclick;
          dismissBtn.onclick = function(e) {
            if (originalClick) originalClick.call(this, e);
            showCoffeeMessageForTool('color-palette-generator');
          };
        }
      }
    }, 100);
    
    // Store exports for download functionality
    window.toolaryColorPaletteExports = {
      css: cssExport,
      json: jsonExport,
      colors: representativeColors,
      harmonies: harmonies,
      accessibility: accessibility
    };
    
  } catch (error) {
    handleError(error, 'colorPaletteGenerator activation');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToAnalyzePageColors') : 'Failed to analyze page colors. Please try again.';
    showError(errorMessage);
  } finally {
    // Color palette tool doesn't need immediate deactivation
    // Modal will handle its own cleanup when closed
  }
}

export function deactivate() {
  try {
    // Cleanup any stored exports
    if (window.toolaryColorPaletteExports) {
      delete window.toolaryColorPaletteExports;
    }
  } catch (error) {
    handleError(error, 'colorPaletteGenerator deactivation');
  }
}
