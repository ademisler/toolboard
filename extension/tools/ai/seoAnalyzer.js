import { aiManager } from '../../core/aiManager.js';
import { addEventListenerWithCleanup, handleError, showError, showSuccess } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'ai-seo-analyzer',
  name: 'AI SEO Analyzer',
  category: 'ai',
  icon: 'search-check',
  permissions: ['activeTab', 'storage'],
  tags: ['ai', 'seo', 'optimization', 'analysis'],
  keywords: ['seo', 'optimization', 'meta', 'keywords', 'ranking', 'search']
};

// State management
let state = {
  isAnalyzing: false,
  analysisResults: null,
  extractedData: null,
  sidebar: null,
  floatingWidget: null,
  cleanupFunctions: []
};
let stylesInjected = false;

// i18n support
let langMap = {};

async function loadLanguage() {
  try {
    // Use the same language detection as popup (UI language only)
    const result = await chrome.storage.local.get(['language']);
    let language = result.language;
    
    // If no stored preference, detect and default to English for unsupported
    if (!language) {
      const browserLang = chrome.i18n?.getUILanguage?.() || navigator.language || 'en';
      const detected = browserLang.split('-')[0].toLowerCase();
      language = ['en', 'tr', 'fr'].includes(detected) ? detected : 'en';
    }
    
    const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
    if (response.ok) {
      langMap = await response.json();
    }
  } catch {
    console.debug('SEO Analyzer: Language loading failed, using fallback');
    langMap = {};
  }
}

function t(key) {
  if (langMap[key]) return langMap[key].message;
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    try {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    } catch {
      // Message not found - using fallback
    }
  }
  return key;
}

function ensureSeoStyles() {
  if (stylesInjected || document.getElementById('toolary-seo-analyzer-styles')) return;
  const style = document.createElement('style');
  style.id = 'toolary-seo-analyzer-styles';
  style.textContent = `
    #toolary-seo-sidebar.toolary-seo-sidebar { position: fixed; top: 0; right: 0; width: min(420px, 92vw); height: 100vh; background: #1f1f1f; border-left: 1px solid #3a3a3a; z-index: 2147483647; display: flex; flex-direction: column; color: #f5f5f5; overflow: hidden; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
    .toolary-seo-header { padding: 18px; border-bottom: 1px solid #3a3a3a; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .toolary-seo-title { margin: 0; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .toolary-seo-close { background: none; border: 1px solid #4a4a4a; color: inherit; cursor: pointer; border-radius: 8px; padding: 4px; display: inline-flex; align-items: center; justify-content: center; }
    .toolary-seo-content { flex: 1; overflow-y: auto; padding: 18px; }
    .toolary-seo-loading { text-align: center; padding: 28px 8px; }
    .toolary-seo-spin { animation: toolary-seo-spin 1s linear infinite; }
    .toolary-seo-muted { color: #b0b0b0; margin: 8px 0 0; }
    .toolary-seo-stage { color: #8f8f8f; margin: 8px 0 0; font-size: 13px; }
    .toolary-seo-results { background: #272727; border: 1px solid #3a3a3a; border-radius: 12px; padding: 14px; display: grid; gap: 14px; }
    .toolary-seo-score-wrap { text-align: center; }
    .toolary-seo-score-ring { width: 82px; height: 82px; border-radius: 999px; margin: 0 auto 10px; background: color-mix(in srgb, var(--score-color, #22c55e) 70%, #000 30%); padding: 3px; display: grid; place-items: center; }
    .toolary-seo-score-core { width: 100%; height: 100%; border-radius: 999px; background: #1f1f1f; display: grid; place-items: center; font-weight: 800; font-size: 24px; color: var(--score-color, #22c55e); }
    .toolary-seo-score-title { margin: 0; font-size: 17px; font-weight: 700; }
    .toolary-seo-score-desc { margin: 6px 0 0; color: #d7d7d7; }
    .toolary-seo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .toolary-seo-cat { border: 1px solid #3f3f3f; border-radius: 10px; padding: 10px; background: #232323; display: flex; align-items: center; gap: 8px; min-height: 64px; }
    .toolary-seo-icon { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: #d4d4d4; background: #303030; flex-shrink: 0; }
    .toolary-seo-cat.good .toolary-seo-icon { color: #22c55e; background: color-mix(in srgb, #22c55e 25%, transparent); }
    .toolary-seo-cat.mid .toolary-seo-icon { color: #f59e0b; background: color-mix(in srgb, #f59e0b 25%, transparent); }
    .toolary-seo-cat.bad .toolary-seo-icon { color: #ef4444; background: color-mix(in srgb, #ef4444 25%, transparent); }
    .toolary-seo-cat-score { font-size: 16px; font-weight: 800; }
    .toolary-seo-score-unit { font-size: 10px; opacity: .7; }
    .toolary-seo-cat-label { font-size: 11px; color: #cfcfcf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toolary-seo-cat-body { min-width: 0; }
    .toolary-seo-box { border: 1px solid #3f3f3f; border-radius: 10px; padding: 12px; background: #232323; }
    .toolary-seo-box-title { margin: 0 0 8px; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
    .toolary-seo-box-text { margin: 0; color: #dfdfdf; line-height: 1.45; font-size: 14px; }
    .toolary-seo-btn { width: 100%; border: 1px solid #b68d00; background: linear-gradient(135deg, #e0b300 0%, #c59400 100%); color: #fff; border-radius: 10px; padding: 12px; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .toolary-seo-error { text-align: center; padding: 40px; color: #ff6b6b; }
    .toolary-seo-error-icon { margin-bottom: 16px; }
    .toolary-seo-error-title { margin: 0; font-size: 16px; font-weight: 700; }
    .toolary-seo-error-text { margin: 8px 0 0; color: #b0b0b0; }
    .toolary-seo-error-help { margin: 8px 0 0; color: #888; font-size: 12px; }
    @keyframes toolary-seo-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

// Data extraction functions
function extractMetaTags() {
  const meta = {};
  
  // Title
  meta.title = document.title || '';
  
  // Meta tags
  const metaTags = document.querySelectorAll('meta');
  metaTags.forEach(tag => {
    const name = tag.getAttribute('name') || tag.getAttribute('property');
    const content = tag.getAttribute('content');
    
    if (name && content) {
      switch (name.toLowerCase()) {
        case 'description':
          meta.description = content;
          break;
        case 'keywords':
          meta.keywords = content;
          break;
        case 'viewport':
          meta.viewport = content;
          break;
        case 'robots':
          meta.robots = content;
          break;
        case 'og:title':
          meta.ogTitle = content;
          break;
        case 'og:description':
          meta.ogDescription = content;
          break;
        case 'twitter:title':
          meta.twitterTitle = content;
          break;
        case 'twitter:description':
          meta.twitterDescription = content;
          break;
      }
    }
  });
  
  // Canonical URL
  const canonical = document.querySelector('link[rel="canonical"]');
  meta.canonical = canonical ? canonical.href : '';
  
  return meta;
}

function extractHeadingStructure() {
  const headings = [];
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headingElements.forEach(heading => {
    headings.push({
      level: parseInt(heading.tagName.substring(1)),
      text: heading.textContent.trim(),
      id: heading.id || '',
      className: heading.className || ''
    });
  });
  
  return headings;
}

function extractImages() {
  const images = [];
  const imageElements = document.querySelectorAll('img');
  
  imageElements.forEach(img => {
    images.push({
      src: img.src || '',
      alt: img.alt || '',
      title: img.title || '',
      width: img.width || 0,
      height: img.height || 0,
      loading: img.loading || 'eager'
    });
  });
  
  return images;
}

function extractLinks() {
  const links = {
    internal: [],
    external: [],
    broken: []
  };
  
  const linkElements = document.querySelectorAll('a[href]');
  
  linkElements.forEach(link => {
    const href = link.href;
    const text = link.textContent.trim();
    const rel = link.rel || '';
    const target = link.target || '';
    
    const linkData = {
      href,
      text,
      rel,
      target,
      isNofollow: rel.includes('nofollow'),
      isExternal: target === '_blank' || !href.startsWith(window.location.origin)
    };
    
    if (href.startsWith(window.location.origin)) {
      links.internal.push(linkData);
    } else if (href.startsWith('http')) {
      links.external.push(linkData);
    }
  });
  
  return links;
}

function extractContent() {
  // Use similar approach to readingMode for content extraction
  const contentSelectors = [
    'article', 'main', '[role="main"]', '.post-content', '.article-content',
    '.entry-content', '.content', '#content', '.main-content', '.article-body'
  ];
  
  let mainContent = null;
  
  // Try semantic selectors first
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim().length > 200) {
      mainContent = element;
      break;
    }
  }
  
  // Fallback to body if no semantic content found
  if (!mainContent) {
    mainContent = document.body;
  }
  
  const text = mainContent.textContent || '';
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const paragraphs = mainContent.querySelectorAll('p');
  
  return {
    text: text.substring(0, 3000), // Reduced for faster processing
    wordCount: words.length,
    paragraphCount: paragraphs.length,
    characterCount: text.length
  };
}

function extractSchemaMarkup() {
  const schemas = [];
  
  // JSON-LD scripts
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      schemas.push({
        type: 'json-ld',
        data: data
      });
    } catch {
      console.debug('Invalid JSON-LD');
    }
  });
  
  // Microdata
  const microdataElements = document.querySelectorAll('[itemscope]');
  microdataElements.forEach(element => {
    const itemType = element.getAttribute('itemtype');
    if (itemType) {
      schemas.push({
        type: 'microdata',
        itemType: itemType,
        element: element.tagName
      });
    }
  });
  
  return schemas;
}

function extractPerformanceMetrics() {
  const metrics = {};
  
  if (window.performance && window.performance.timing) {
    const timing = window.performance.timing;
    metrics.loadTime = timing.loadEventEnd - timing.navigationStart;
    metrics.domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
    metrics.firstPaint = timing.responseEnd - timing.navigationStart;
  }
  
  // Navigation API if available
  if (window.performance && window.performance.getEntriesByType) {
    const navigation = window.performance.getEntriesByType('navigation')[0];
    if (navigation) {
      metrics.loadTime = navigation.loadEventEnd - navigation.startTime;
      metrics.domReady = navigation.domContentLoadedEventEnd - navigation.startTime;
    }
  }
  
  return metrics;
}

function analyzeKeywordDensity(content) {
  const words = content.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  const sortedWords = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15) // Reduced for faster processing
    .map(([word, count]) => ({
      word,
      count,
      density: (count / words.length * 100).toFixed(2)
    }));
  
  return sortedWords;
}

// Simple score extraction function
function extractScore(response) {
  try {
    // Clean the response
    let cleanResponse = response.trim();
    
    // Remove any markdown code blocks
    cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Try to find a number between 0-100
    const scoreMatch = cleanResponse.match(/\b(\d{1,2})\b/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1]);
      if (score >= 0 && score <= 100) {
        return score;
      }
    }
    
    // Try to extract from JSON
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.score === 'number' && parsed.score >= 0 && parsed.score <= 100) {
        return parsed.score;
      }
    }
    
    console.debug('Could not extract score from:', response);
    return 50; // Default fallback score
  } catch (error) {
    console.debug('Score extraction failed:', error);
    return 50; // Default fallback score
  }
}

// Simple AI Analysis functions - only return scores
async function analyzeMetaAndTitle(data) {
  const prompt = `Rate meta tags SEO: Title="${data.meta.title}", Description="${data.meta.description || 'Missing'}". Give only a number 0-100.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    return extractScore(response);
  } catch (error) {
    console.debug('Meta analysis failed:', error);
    return 50;
  }
}

async function analyzeContentQuality(data) {
  const prompt = `Rate content SEO: ${data.content.wordCount} words, Keywords: ${data.keywords.slice(0, 3).map(k => k.word).join(', ')}. Give only a number 0-100.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    return extractScore(response);
  } catch (error) {
    console.debug('Content analysis failed:', error);
    return 50;
  }
}

async function analyzeHeadingStructure(data) {
  const prompt = `Rate heading structure SEO: H1=${data.headings.filter(h => h.level === 1).length}, H2=${data.headings.filter(h => h.level === 2).length}, Total=${data.headings.length}. Give only a number 0-100.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    return extractScore(response);
  } catch (error) {
    console.debug('Heading analysis failed:', error);
    return 50;
  }
}

async function analyzeImageOptimization(data) {
  const prompt = `Rate image SEO: ${data.images.length} images, ${data.images.filter(img => !img.alt).length} missing alt text. Give only a number 0-100.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    return extractScore(response);
  } catch (error) {
    console.debug('Image analysis failed:', error);
    return 50;
  }
}

async function analyzeLinkStrategy(data) {
  const prompt = `Rate link strategy SEO: ${data.links.length} total links, ${data.links.filter(link => link.external).length} external. Give only a number 0-100.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    return extractScore(response);
  } catch (error) {
    console.debug('Link analysis failed:', error);
    return 50;
  }
}

async function analyzeTechnicalSEO(data) {
  const prompt = `Rate technical SEO: ${data.schemas.length} schema markup, ${data.performance.loadTime}ms load time. Give only a number 0-100.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    return extractScore(response);
  } catch (error) {
    console.debug('Technical analysis failed:', error);
    return 50;
  }
}

async function generateOverallScore(categoryResults) {
  const prompt = `Analyze these SEO scores and provide a brief summary:

Meta & Title: ${categoryResults.metaAndTitle}/100
Content Quality: ${categoryResults.contentQuality}/100
Heading Structure: ${categoryResults.headingStructure}/100
Image Optimization: ${categoryResults.imageOptimization}/100
Link Strategy: ${categoryResults.linkStrategy}/100
Technical SEO: ${categoryResults.technicalSEO}/100

Write 2-3 sentences summarizing the overall SEO performance. Focus on strengths and weaknesses.`;

  try {
    if (!aiManager.isInitialized) {
      await aiManager.initialize();
    }
    
    const response = await aiManager.callGeminiAPI(prompt, {
      toolId: 'ai-seo-analyzer'
    });
    
    console.log('AI Response for overall score:', response);
    
    // Calculate average score
    const averageScore = Math.round((categoryResults.metaAndTitle + categoryResults.contentQuality + categoryResults.headingStructure + categoryResults.imageOptimization + categoryResults.linkStrategy + categoryResults.technicalSEO) / 6);
    
    // Use AI response as summary, fallback to static description
    const summary = response && response.trim() ? response.trim() : getScoreDescription(averageScore);
    
    console.log('Average score:', averageScore);
    console.log('AI summary:', summary);
    
    return { score: averageScore, summary };
  } catch (error) {
    console.debug('Overall score generation failed:', error);
    const fallbackScore = Math.round((categoryResults.metaAndTitle + categoryResults.contentQuality + categoryResults.headingStructure + categoryResults.imageOptimization + categoryResults.linkStrategy + categoryResults.technicalSEO) / 6);
    return { score: fallbackScore, summary: getScoreDescription(fallbackScore) };
  }
}

// UI Functions

function showPanel() {
  if (state.sidebar) return;
  
  state.sidebar = createSidebar();
  document.body.appendChild(state.sidebar);
}

function hidePanel() {
  if (state.sidebar) {
    state.sidebar.remove();
    state.sidebar = null;
  }
}

function createSidebar() {
  ensureSeoStyles();
  const sidebar = document.createElement('div');
  sidebar.id = 'toolary-seo-sidebar';
  sidebar.className = 'toolary-seo-sidebar';
  
  sidebar.innerHTML = `
    <div class="toolary-seo-header">
      <h2 class="toolary-seo-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
          <path d="m9 11 2 2 4-4"></path>
        </svg>
        ${t('aiSEOAnalyzer')}
      </h2>
      <button id="seo-close-btn" class="toolary-seo-close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"></path>
          <path d="m6 6 12 12"></path>
        </svg>
      </button>
    </div>
    <div id="seo-content" class="toolary-seo-content">
      <div id="seo-loading" class="toolary-seo-loading">
        <div>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-seo-spin">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
          </svg>
        </div>
        <p class="toolary-seo-muted">${t('seoAnalyzing')}</p>
      </div>
    </div>
  `;
  
  // Close button event
  const closeBtn = sidebar.querySelector('#seo-close-btn');
  const cleanup = addEventListenerWithCleanup(closeBtn, 'click', hidePanel);
  state.cleanupFunctions.push(cleanup);
  
  return sidebar;
}

function updateAnalysisProgress(current, total, stage) {
  const loadingEl = document.querySelector('#seo-loading');
  if (loadingEl) {
    loadingEl.innerHTML = `
      <div>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-seo-spin">
          <path d="M21 12a9 9 0 11-6.219-8.56"></path>
        </svg>
      </div>
      <p class="toolary-seo-muted">${t('seoAnalyzing')}</p>
      <p class="toolary-seo-stage">${stage} (${current}/${total})</p>
    `;
  }
}

function getScoreDescription(score) {
  if (score >= 90) return t('seoExcellent');
  if (score >= 80) return t('seoGood');
  if (score >= 70) return t('seoFair');
  if (score >= 60) return t('seoNeedsImprovement');
  return t('seoPoor');
}

function renderLoadingState() {
  const contentEl = document.querySelector('#seo-content');
  if (!contentEl) return;
  
  contentEl.innerHTML = `
    <div class="toolary-seo-results">
      <div class="toolary-seo-loading">
        <div>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-seo-spin">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
          </svg>
        </div>
        <h3 class="toolary-seo-score-title">${t('seoAnalyzing')}</h3>
        <p class="toolary-seo-muted">${t('seoAnalyzingDescription')}</p>
      </div>
      <div class="toolary-seo-box">
        <h4 class="toolary-seo-box-title">${t('seoAnalysisSteps')}</h4>
        <div class="toolary-seo-box-text">
          <div>• ${t('seoStep1')}</div>
          <div>• ${t('seoStep2')}</div>
          <div>• ${t('seoStep3')}</div>
          <div>• ${t('seoStep4')}</div>
        </div>
      </div>
    </div>
  `;
}

function renderAnalysisResult(results) {
  const contentEl = document.querySelector('#seo-content');
  if (!contentEl) return;
  
  const categories = [
    { key: 'metaAndTitle', name: t('seoMetaAndTitle') },
    { key: 'contentQuality', name: t('seoContentQuality') },
    { key: 'headingStructure', name: t('seoHeadingStructure') },
    { key: 'imageOptimization', name: t('seoImageOptimization') },
    { key: 'linkStrategy', name: t('seoLinkStrategy') },
    { key: 'technicalSEO', name: t('seoTechnicalSEO') }
  ];
  
  const getScoreColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };
  const scoreTone = (score) => {
    if (score >= 80) return 'good';
    if (score >= 60) return 'mid';
    return 'bad';
  };
  
  const getCategoryIcon = (categoryKey) => {
    const iconMap = {
      'metaAndTitle': 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
      'contentQuality': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'headingStructure': 'M4 6h16M4 10h16M4 14h16M4 18h16',
      'imageOptimization': 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
      'linkStrategy': 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
      'technicalSEO': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
    };
    return iconMap[categoryKey] || 'M9 12l2 2 4-4';
  };

  const overallColor = getScoreColor(results.overallScore);
  
  contentEl.innerHTML = `
    <div class="toolary-seo-results">
      <div class="toolary-seo-score-wrap">
        <div id="toolary-seo-score-ring" class="toolary-seo-score-ring">
          <div class="toolary-seo-score-core">${results.overallScore}</div>
        </div>
        <h1 class="toolary-seo-score-title">${t('seoOverallScore')}</h1>
        <p class="toolary-seo-score-desc">${getScoreDescription(results.overallScore)}</p>
      </div>
      <div class="toolary-seo-grid">
        ${categories.map((category) => `
          <div class="toolary-seo-cat ${scoreTone(results[category.key])}">
            <div class="toolary-seo-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="${getCategoryIcon(category.key)}"></path>
              </svg>
            </div>
            <div class="toolary-seo-cat-body">
              <div class="toolary-seo-cat-score">${results[category.key]}<span class="toolary-seo-score-unit">/100</span></div>
              <div class="toolary-seo-cat-label" title="${category.name}">${category.name}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="toolary-seo-box">
        <h3 class="toolary-seo-box-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 12l2 2 4-4"></path>
            <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"></path>
          </svg>
          ${t('seoSummary')}
        </h3>
        <p class="toolary-seo-box-text">${results.overallSummary || getScoreDescription(results.overallScore)}</p>
      </div>
      <div>
        <button id="copy-seo-report" class="toolary-seo-btn" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          ${t('seoCopyReport')}
        </button>
      </div>
    </div>
  `;

  const ring = contentEl.querySelector('#toolary-seo-score-ring');
  if (ring) {
    ring.style.setProperty('--score-color', overallColor);
  }
  
  // Add copy functionality
  const copyBtn = document.querySelector('#copy-seo-report');
  if (copyBtn) {
    console.log('Copy button found, adding event listener');
    const cleanup = addEventListenerWithCleanup(copyBtn, 'click', () => {
      console.log('Copy button clicked');
      try {
        const reportText = generateReportText(results);
        console.log('Report text generated:', reportText.substring(0, 100) + '...');
        navigator.clipboard.writeText(reportText).then(() => {
          console.log('Report copied to clipboard successfully');
          showSuccess(t('seoReportCopied'));
        }).catch((error) => {
          console.error('Failed to copy to clipboard:', error);
          showError(t('seoCopyFailed'));
        });
      } catch (error) {
        console.error('Error generating report:', error);
        showError(t('seoCopyFailed'));
      }
    });
    state.cleanupFunctions.push(cleanup);
  } else {
    console.error('Copy button not found!');
  }
}




function generateReportText(results) {
  return `
SEO Analysis Report - ${document.title}
Generated: ${new Date().toLocaleString()}
URL: ${window.location.href}

OVERALL SCORE: ${results.overallScore}/100
${results.overallSummary || getScoreDescription(results.overallScore)}

CATEGORY BREAKDOWN:

Meta & Title: ${results.metaAndTitle}/100
Content Quality: ${results.contentQuality}/100
Heading Structure: ${results.headingStructure}/100
Image Optimization: ${results.imageOptimization}/100
Link Strategy: ${results.linkStrategy}/100
Technical SEO: ${results.technicalSEO}/100

Generated by Toolboard AI SEO Analyzer
  `.trim();
}


// Optimized analysis with parallel processing and reduced delays
async function startAnalysis() {
  if (state.isAnalyzing) return;
  
  state.isAnalyzing = true;
  
  // Show loading state
  renderLoadingState();
  
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.debug('Extension context invalidated, skipping analysis');
      return;
    }
    
    // Initialize AI Manager first
    if (!aiManager.isInitialized) {
      updateAnalysisProgress(1, 4, 'Initializing AI...');
      await aiManager.initialize();
    }
    
    // Extract all data
    updateAnalysisProgress(2, 4, 'Extracting data...');
    state.extractedData = {
      meta: extractMetaTags(),
      headings: extractHeadingStructure(),
      images: extractImages(),
      links: extractLinks(),
      content: extractContent(),
      schemas: extractSchemaMarkup(),
      performance: extractPerformanceMetrics(),
      keywords: analyzeKeywordDensity(state.extractedData?.content?.text || document.body.textContent)
    };
    
    // Run AI analyses in parallel for faster processing
    updateAnalysisProgress(3, 4, 'Analyzing SEO...');
    
    const analyses = [
      { name: 'metaAndTitle', fn: analyzeMetaAndTitle },
      { name: 'contentQuality', fn: analyzeContentQuality },
      { name: 'headingStructure', fn: analyzeHeadingStructure },
      { name: 'imageOptimization', fn: analyzeImageOptimization },
      { name: 'linkStrategy', fn: analyzeLinkStrategy },
      { name: 'technicalSEO', fn: analyzeTechnicalSEO }
    ];
    
    // Run all analyses in parallel
    const analysisPromises = analyses.map(async (analysis) => {
      try {
        const score = await analysis.fn(state.extractedData);
        return { name: analysis.name, score };
      } catch (error) {
        console.debug(`Analysis failed for ${analysis.name}:`, error);
        return { name: analysis.name, score: 50 };
      }
    });
    
    const analysisResults = await Promise.allSettled(analysisPromises);
    const categoryResults = {};
    
    analysisResults.forEach((promiseResult) => {
      if (promiseResult.status === 'fulfilled') {
        const { name, score } = promiseResult.value;
        categoryResults[name] = score;
      } else {
        console.debug(`Analysis promise rejected for ${promiseResult.reason}`);
        categoryResults[promiseResult.reason?.name || 'unknown'] = 50;
      }
    });
    
    // Generate overall score
    updateAnalysisProgress(4, 4, 'Generating overall score...');
    let overallScore, overallSummary;
    try {
      const overallResult = await generateOverallScore(categoryResults);
      overallScore = overallResult.score;
      overallSummary = overallResult.summary;
    } catch (error) {
      console.debug('Overall score generation failed:', error);
      overallScore = Math.round(Object.values(categoryResults).reduce((sum, score) => sum + score, 0) / 6);
      overallSummary = getScoreDescription(overallScore);
    }
    
    // Store results
    state.analysisResults = {
      overallScore,
      overallSummary,
      metaAndTitle: categoryResults.metaAndTitle || 50,
      contentQuality: categoryResults.contentQuality || 50,
      headingStructure: categoryResults.headingStructure || 50,
      imageOptimization: categoryResults.imageOptimization || 50,
      linkStrategy: categoryResults.linkStrategy || 50,
      technicalSEO: categoryResults.technicalSEO || 50
    };
    
    
    // Render results
    renderAnalysisResult(state.analysisResults);
    
    showSuccess(t('seoAnalysisComplete'));
    
    // Show coffee message
    showCoffeeMessageForTool('ai-seo-analyzer');
    
  } catch (error) {
    console.debug('Analysis failed:', error);
    handleError(error, 'seoAnalyzer.startAnalysis');
    console.error('SEO Analysis Error Details:', {
      message: error.message,
      stack: error.stack,
      aiManagerInitialized: aiManager.isInitialized,
      apiKeysCount: aiManager.apiKeys?.length || 0
    });
    
    showError(t('seoAnalysisFailed'));
    
    // Show detailed error state
      const contentEl = document.querySelector('#seo-content');
      if (contentEl) {
        contentEl.innerHTML = `
        <div class="toolary-seo-error">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolary-seo-error-icon">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M15 9l-6 6"></path>
            <path d="M9 9l6 6"></path>
          </svg>
          <p class="toolary-seo-error-title">${t('seoAnalysisFailed')}</p>
          <p class="toolary-seo-error-text">Error: ${error.message}</p>
          <p class="toolary-seo-error-help">Please check your AI settings and try again.</p>
        </div>
      `;
      }
  } finally {
    state.isAnalyzing = false;
  }
}

export async function activate(deactivate) {
  try {
    // Check if extension context is valid
    if (!chrome.runtime?.id) {
      console.debug('Extension context invalidated, cannot activate SEO analyzer');
      deactivate();
      return;
    }
    
    // Load language
    await loadLanguage();
    
    // Load AI manager
    await import('../../core/aiManager.js');
    
    // Create sidebar directly (no toggle)
    console.log('Creating sidebar...');
    showPanel();
    console.log('Sidebar created and shown');
    
    // Start analysis immediately
    console.log('Starting analysis...');
    await startAnalysis();
    console.log('Analysis started');
    
    console.log('AI SEO Analyzer activated');
    
  } catch (error) {
    console.debug('SEO analyzer activation failed:', error);
    handleError(error, 'seoAnalyzer.activate');
    showError(t('seoAnalysisFailed'));
    deactivate();
  }
}

export function deactivate() {
  try {
    // Clean up event listeners
    state.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.debug('Error cleaning up event listener:', error);
      }
    });
    state.cleanupFunctions = [];
    
    // Remove UI elements safely
    if (state.floatingWidget && state.floatingWidget.parentNode) {
      state.floatingWidget.remove();
      state.floatingWidget = null;
    }
    
    if (state.sidebar && state.sidebar.parentNode) {
      state.sidebar.remove();
      state.sidebar = null;
    }
    
    // Reset state
    state.isAnalyzing = false;
    state.analysisResults = null;
    state.extractedData = null;
    
  } catch (error) {
    console.debug('SEO analyzer deactivation error:', error);
    handleError(error, 'seoAnalyzer.deactivate');
  }
}
