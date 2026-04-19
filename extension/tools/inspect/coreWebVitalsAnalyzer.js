import { addEventListenerWithCleanup, ensureLanguageLoaded, handleError, showError, t } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import { clearCleanup, createPreviewPanel, escapeHtml } from '../previewers/sharedPreviewUtils.js';

export const metadata = {
  id: 'core-web-vitals-analyzer',
  name: 'Core Web Vitals Analyzer',
  category: 'inspect',
  icon: 'web-vitals',
  permissions: ['activeTab'],
  tags: ['performance', 'web vitals', 'lcp', 'cls', 'inp'],
  keywords: ['core web vitals', 'lcp', 'cls', 'inp', 'fid']
};

let panel = null;
let cleanupFns = [];
let deactivateCb = null;
let observers = [];
const STYLES_ID = 'toolary-core-web-vitals-analyzer-styles';

const metrics = {
  lcp: null,
  cls: 0,
  inp: null,
  fid: null,
  active: false
};

const VITAL_RULES = {
  lcp: { label: 'LCP', good: 2500, mid: 4000, unit: 'ms', hint: 'Good <= 2500ms, Needs <= 4000ms' },
  inp: { label: 'INP', good: 200, mid: 500, unit: 'ms', hint: 'Good <= 200ms, Needs <= 500ms' },
  cls: { label: 'CLS', good: 0.1, mid: 0.25, unit: 'score', hint: 'Good <= 0.10, Needs <= 0.25' },
  fid: { label: 'FID', good: 100, mid: 300, unit: 'ms', hint: 'Good <= 100ms, Needs <= 300ms' }
};

function ensureStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .toolary-vitals-metrics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolary-vitals-metric-card,
    .toolary-vitals-summary-card {
      display: grid;
      gap: 8px;
    }
    .toolary-vitals-metric-header,
    .toolary-vitals-overall-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .toolary-vitals-metric-value {
      font-size: 24px;
      line-height: 1.1;
      font-weight: 700;
    }
    .toolary-vitals-overall-row {
      justify-content: flex-start;
      gap: 10px;
    }
    .toolary-vitals-overall-score {
      font-size: 28px;
      line-height: 1;
      font-weight: 800;
    }
    .toolary-vitals-tips {
      margin: 0;
      padding-left: 18px;
    }
    .toolary-vitals-runtime {
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);
}

function disconnectObservers() {
  observers.forEach((observer) => {
    try {
      observer.disconnect();
    } catch {
      // no-op
    }
  });
  observers = [];
  metrics.active = false;
}

function metricLabel(key) {
  const rule = VITAL_RULES[key];
  const value = metrics[key];
  if (!rule || !Number.isFinite(value)) return '-';
  if (rule.unit === 'score') return value.toFixed(3);
  return `${Math.round(value)} ms`;
}

function classifyMetric(key) {
  const rule = VITAL_RULES[key];
  if (!rule) return { grade: 'na', label: t('coreWebVitalsAnalyzerGradeNa') || 'N/A', score: 0 };
  const value = metrics[key];
  if (!Number.isFinite(value)) return { grade: 'na', label: t('coreWebVitalsAnalyzerGradeNa') || 'N/A', score: 0 };
  if (value <= rule.good) return { grade: 'good', label: t('coreWebVitalsAnalyzerGradeGood') || 'Good', score: 100 };
  if (value <= rule.mid) return { grade: 'mid', label: t('coreWebVitalsAnalyzerGradeNeeds') || 'Needs', score: 65 };
  return { grade: 'poor', label: t('coreWebVitalsAnalyzerGradePoor') || 'Poor', score: 30 };
}

function overallScore(statuses) {
  const available = statuses.filter((item) => item.grade !== 'na');
  if (!available.length) return { score: 0, grade: 'na', label: t('coreWebVitalsAnalyzerGradeNa') || 'N/A' };
  const score = Math.round(available.reduce((sum, item) => sum + item.score, 0) / available.length);
  if (score >= 90) return { score, grade: 'good', label: t('coreWebVitalsAnalyzerOverallHealthy') || 'Healthy' };
  if (score >= 60) return { score, grade: 'mid', label: t('coreWebVitalsAnalyzerOverallNeedsWork') || 'Needs work' };
  return { score, grade: 'poor', label: t('coreWebVitalsAnalyzerOverallCritical') || 'Critical' };
}

function recommendations(statusByKey) {
  const list = [];
  const lcpState = statusByKey.lcp?.grade;
  const inpState = statusByKey.inp?.grade;
  const clsState = statusByKey.cls?.grade;
  const fidState = statusByKey.fid?.grade;

  if (lcpState === 'poor' || lcpState === 'mid') {
    list.push(t('coreWebVitalsAnalyzerTipLcp') || 'Reduce render-blocking resources and optimize hero image/font delivery.');
  }
  if (inpState === 'poor' || inpState === 'mid' || fidState === 'poor' || fidState === 'mid') {
    list.push(t('coreWebVitalsAnalyzerTipInput') || 'Reduce long main-thread tasks and defer non-critical JavaScript work.');
  }
  if (clsState === 'poor' || clsState === 'mid') {
    list.push(t('coreWebVitalsAnalyzerTipCls') || 'Reserve fixed space for media/ads and avoid late layout shifts.');
  }
  if (!list.length) {
    list.push(t('coreWebVitalsAnalyzerTipOk') || 'No critical issue detected in current sample. Capture multiple interactions for a stronger signal.');
  }

  return list;
}

function renderMetrics() {
  const output = panel?.querySelector('#toolary-web-vitals-output');
  if (!output) return;

  const statuses = Object.keys(VITAL_RULES).map((key) => ({
    key,
    ...classifyMetric(key)
  }));
  const statusByKey = statuses.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});
  const overall = overallScore(statuses);
  const tips = recommendations(statusByKey);

  output.innerHTML = `
    <div class="toolary-preview-grid-2 toolary-vitals-metrics-grid">
      ${Object.entries(VITAL_RULES).map(([key, rule]) => {
        const state = statusByKey[key];
        return `
          <div class="toolary-preview-card toolary-vitals-metric-card">
            <div class="toolary-vitals-metric-header">
              <strong>${escapeHtml(rule.label)}</strong>
              <span class="toolary-preview-badge is-${escapeHtml(state.grade)}">${escapeHtml(state.label)}</span>
            </div>
            <div class="toolary-vitals-metric-value">${escapeHtml(metricLabel(key))}</div>
            <div class="toolary-preview-muted">${escapeHtml(rule.hint)}</div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="toolary-preview-grid-2">
      <div class="toolary-preview-card toolary-vitals-summary-card">
        <strong>${escapeHtml(t('coreWebVitalsAnalyzerOverall') || 'Overall')}</strong>
        <div class="toolary-vitals-overall-row">
          <div class="toolary-vitals-overall-score">${overall.grade === 'na' ? '-' : `${overall.score}/100`}</div>
          <span class="toolary-preview-badge is-${escapeHtml(overall.grade)}">${escapeHtml(overall.label)}</span>
        </div>
      </div>
      <div class="toolary-preview-card toolary-vitals-summary-card">
        <strong>${escapeHtml(t('coreWebVitalsAnalyzerSuggestions') || 'Actionable suggestions')}</strong>
        <ul class="toolary-vitals-tips">
          ${tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="toolary-preview-muted toolary-vitals-runtime">
      ${escapeHtml(metrics.active
        ? (t('coreWebVitalsAnalyzerRunning') || 'Collecting vitals. Interact with page to improve INP/FID signal.')
        : (t('coreWebVitalsAnalyzerStopped') || 'Analyzer is stopped.'))}
    </div>
  `;
}

function makeObserver(type, cb) {
  const PerfObserver = window?.PerformanceObserver;
  if (typeof PerfObserver !== 'function') return null;
  try {
    const observer = new PerfObserver((list) => {
      list.getEntries().forEach((entry) => cb(entry));
      renderMetrics();
    });
    observer.observe({ type, buffered: true });
    return observer;
  } catch {
    return null;
  }
}

function startAnalyzer() {
  disconnectObservers();
  metrics.active = true;

  const lcpObserver = makeObserver('largest-contentful-paint', (entry) => {
    const candidate = entry.renderTime || entry.loadTime || entry.startTime;
    if (Number.isFinite(candidate)) metrics.lcp = candidate;
  });

  const clsObserver = makeObserver('layout-shift', (entry) => {
    if (!entry.hadRecentInput && Number.isFinite(entry.value)) {
      metrics.cls += entry.value;
    }
  });

  const inpObserver = makeObserver('event', (entry) => {
    if (!Number.isFinite(entry.duration)) return;
    if (entry.duration < 40) return;
    metrics.inp = Math.max(metrics.inp || 0, entry.duration);
  });

  const fidObserver = makeObserver('first-input', (entry) => {
    const delay = entry.processingStart - entry.startTime;
    if (Number.isFinite(delay)) metrics.fid = delay;
  });

  observers = [lcpObserver, clsObserver, inpObserver, fidObserver].filter(Boolean);
  renderMetrics();
}

function stopAnalyzer() {
  disconnectObservers();
  renderMetrics();
  showCoffeeMessageForTool('core-web-vitals-analyzer');
}

function resetAnalyzer() {
  disconnectObservers();
  metrics.lcp = null;
  metrics.cls = 0;
  metrics.inp = null;
  metrics.fid = null;
  renderMetrics();
}

function createPanel() {
  ensureStyles();
  const { overlay, cleanup } = createPreviewPanel({
    id: 'toolary-core-web-vitals-analyzer',
    title: t('coreWebVitalsAnalyzerTitle') || 'Core Web Vitals Analyzer',
    width: 920,
    onClose: () => deactivateCb?.(),
    bodyHtml: `
      <div class="toolary-preview-stack">
        <div class="toolary-preview-actions">
          <button class="toolary-ui-btn" data-action="start">${t('coreWebVitalsAnalyzerStart') || 'Start'}</button>
          <button class="toolary-ui-btn" data-action="stop">${t('coreWebVitalsAnalyzerStop') || 'Stop'}</button>
          <button class="toolary-ui-btn" data-action="reset">${t('coreWebVitalsAnalyzerReset') || 'Reset'}</button>
        </div>
        <div class="toolary-preview-help toolary-preview-muted">${escapeHtml(t('coreWebVitalsAnalyzerHint') || 'Start collection, interact with the page, then review grades and optimization suggestions.')}</div>
        <section id="toolary-web-vitals-output"></section>
      </div>
    `
  });

  panel = overlay;
  cleanupFns = cleanup;

  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="start"]'), 'click', startAnalyzer));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="stop"]'), 'click', stopAnalyzer));
  cleanupFns.push(addEventListenerWithCleanup(panel.querySelector('[data-action="reset"]'), 'click', resetAnalyzer));

  renderMetrics();
}

export async function activate(deactivate) {
  deactivateCb = deactivate;
  try {
    await ensureLanguageLoaded();
    if (panel) panel.remove();
    createPanel();
  } catch (error) {
    handleError(error, 'coreWebVitalsAnalyzer.activate');
    showError(t('failedToActivateTool') || 'Failed to activate tool');
    deactivateCb?.();
  }
}

export function deactivate() {
  disconnectObservers();
  clearCleanup(cleanupFns, 'coreWebVitalsAnalyzer');
  cleanupFns = [];
  if (panel) panel.remove();
  panel = null;
  deactivateCb = null;
}
