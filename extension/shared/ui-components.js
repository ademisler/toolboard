import { showToast as showHelperToast } from './helpers.js';

const DEFAULT_CARD_ICON = '../icons/tools/info.svg';

export function showToast(message, variant = 'info', options = {}) {
  try {
    const region = document.getElementById('popup-toast-region');
    if (!region) {
      showHelperToast?.(message, 1600, variant);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    region.appendChild(toast);

    const lifetime = typeof options.duration === 'number' ? options.duration : 3200;
    setTimeout(() => {
      toast.classList.add('toast--leaving');
      setTimeout(() => toast.remove(), 200);
    }, lifetime);
  } catch (error) {
    console.debug('Toast display failed', error);
    showHelperToast?.(message, 1600, variant);
  }
}

export function createFavoriteButton({ isFavorite = false, tooltip = 'Toggle favorite' } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `favorite-toggle ${isFavorite ? 'is-favorite' : ''}`;
  btn.setAttribute('aria-pressed', String(isFavorite));
  btn.setAttribute('title', tooltip);
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 17.27 18.18 21l-1.63-7 5.45-4.73-7.19-.62L12 2 9.19 8.65l-7.19.62L7.45 14l-1.63 7z" />
    </svg>
    <span class="sr-only">${isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
  `;
  return btn;
}

export function createToolCard(tool, {
  isFavorite = false,
  isRecent = false,
  hidden = false
} = {}) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `tool-card${isRecent ? ' is-recent' : ''}${hidden ? ' is-hidden' : ''}`;
  card.dataset.toolId = tool.id;
  card.dataset.category = tool.category;
  card.dataset.keywords = (tool.keywords || []).join(' ').toLowerCase();
  card.dataset.tags = (tool.tags || []).join(' ').toLowerCase();
  card.setAttribute('role', 'gridcell');
  card.setAttribute('aria-label', tool.name);

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'tool-card__icon';
  const icon = document.createElement('img');
  icon.src = `../icons/tools/${tool.icon || 'info'}.svg`;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  icon.loading = 'lazy';
  icon.onerror = () => { icon.src = DEFAULT_CARD_ICON; };
  iconWrapper.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'tool-card__content';

  const title = document.createElement('span');
  title.className = 'tool-card__title';
  title.textContent = tool.name;

  const meta = document.createElement('div');
  meta.className = 'tool-card__meta';
  if (tool.shortcut?.default || tool.shortcut) {
    const shortcut = document.createElement('kbd');
    shortcut.className = 'tool-card__shortcut';
    shortcut.textContent = tool.shortcut?.default || tool.shortcut;
    meta.append(shortcut);
  }
  if (Array.isArray(tool.tags) && tool.tags.length > 0) {
    const tag = document.createElement('span');
    tag.className = 'tool-card__tag';
    tag.textContent = tool.tags[0];
    meta.append(tag);
  }

  const description = document.createElement('p');
  description.className = 'tool-card__description';
  description.textContent = tool.description || tool.i18n?.description || `Quick access to ${tool.name}.`;

  content.append(title, meta, description);

  const controls = document.createElement('div');
  controls.className = 'tool-card__controls';
  const favBtn = createFavoriteButton({ isFavorite });
  favBtn.dataset.toolId = tool.id;
  controls.appendChild(favBtn);

  card.append(iconWrapper, content, controls);

  return card;
}

export class VirtualizedGrid {
  constructor(root, { rowHeight = 96, overscan = 6, threshold = 24 } = {}) {
    this.root = root;
    this.grid = root.querySelector('.tools-grid');
    this.rowHeight = rowHeight;
    this.overscan = overscan;
    this.threshold = threshold;

    this.data = [];
    this.renderer = null;
    this.rendered = new Map();

    this.onScroll = this.onScroll.bind(this);
    root.addEventListener('scroll', this.onScroll, { passive: true });
  }

  destroy() {
    this.root.removeEventListener('scroll', this.onScroll);
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  setData(data) {
    this.data = Array.isArray(data) ? data : [];
    if (this.data.length <= this.threshold) {
      this.renderAll();
      return;
    }
    this.virtualize();
  }

  renderAll() {
    this.grid.innerHTML = '';
    this.rendered.clear();
    if (!this.renderer) return;
    this.data.forEach((item, index) => {
      const node = this.renderer(item, index);
      if (node) {
        node.dataset.virtualIndex = String(index);
        this.grid.appendChild(node);
        this.rendered.set(index, node);
      }
    });
    this.grid.style.position = '';
    this.grid.style.height = '';
  }

  virtualize() {
    const visibleHeight = this.root.clientHeight || 1;
    const itemsPerColumn = Math.max(1, Math.floor(visibleHeight / this.rowHeight));
    const scrollTop = this.root.scrollTop;
    const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) * 3 - this.overscan);
    const visibleCount = itemsPerColumn * 3 + this.overscan * 2;

    const endIndex = Math.min(this.data.length, startIndex + visibleCount);

    // cleanup nodes outside range
    for (const [index, node] of this.rendered.entries()) {
      if (index < startIndex || index >= endIndex) {
        node.remove();
        this.rendered.delete(index);
      }
    }

    if (!this.renderer) return;

    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i += 1) {
      if (this.rendered.has(i)) continue;
      const node = this.renderer(this.data[i], i);
      if (!node) continue;
      node.style.transform = `translateY(${i * this.rowHeight}px)`;
      node.dataset.virtualIndex = String(i);
      node.classList.add('is-virtualized');
      fragment.appendChild(node);
      this.rendered.set(i, node);
    }

    this.grid.appendChild(fragment);
    this.grid.style.position = 'relative';
    this.grid.style.height = `${this.data.length * this.rowHeight}px`;
  }

  onScroll() {
    if (this.data.length <= this.threshold) return;
    window.requestAnimationFrame(() => this.virtualize());
  }
}
