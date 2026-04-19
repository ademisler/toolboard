const UNSTABLE_DATA_PREFIXES = [
  'data-v-',
  'data-reactid',
  'data-react-',
  'data-ember',
  'data-ng-',
  'data-bind',
  'data-key',
  'data-index'
];

function cssEscape(value) {
  if (typeof globalThis.CSS?.escape === 'function') {
    return globalThis.CSS.escape(String(value));
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function getQueryRoot(root, element) {
  if (root && typeof root.querySelectorAll === 'function') {
    return root;
  }
  return element?.ownerDocument || document;
}

export function testSelector(selector, root = document) {
  try {
    const matches = getQueryRoot(root).querySelectorAll(selector);
    return {
      valid: true,
      count: matches.length,
      unique: matches.length === 1,
      element: matches.length === 1 ? matches[0] : null
    };
  } catch {
    return {
      valid: false,
      count: 0,
      unique: false,
      element: null
    };
  }
}

function isUnique(selector, root) {
  const result = testSelector(selector, root);
  return result.valid && result.unique;
}

function getIdSelector(element, root) {
  const id = element?.getAttribute?.('id');
  if (!id || !/^[a-zA-Z]/.test(id) || id.includes(' ')) {
    return null;
  }

  const lowerId = id.toLowerCase();
  if (
    lowerId.startsWith('mount_') ||
    lowerId.startsWith('react') ||
    lowerId.startsWith('ember') ||
    lowerId.startsWith('ui-id-') ||
    lowerId.startsWith('__') ||
    lowerId.startsWith('toolary-') ||
    (lowerId.length > 15 && /\d/.test(lowerId) && /_/.test(lowerId))
  ) {
    return null;
  }

  const selector = `#${cssEscape(id)}`;
  return isUnique(selector, root) ? selector : null;
}

function getDataAttrSelector(element, root) {
  if (!element?.attributes) {
    return null;
  }

  for (const attribute of element.attributes) {
    if (!attribute.name.startsWith('data-')) continue;
    if (UNSTABLE_DATA_PREFIXES.some((prefix) => attribute.name.startsWith(prefix))) continue;
    if (!attribute.value || attribute.value.length > 80) continue;
    if (/^[0-9a-f]{8,}$/i.test(attribute.value)) continue;

    const selector = `${element.tagName.toLowerCase()}[${attribute.name}="${cssEscape(attribute.value)}"]`;
    if (isUnique(selector, root)) {
      return selector;
    }
  }

  return null;
}

function getNameSelector(element, root) {
  const name = element?.getAttribute?.('name');
  if (!name) {
    return null;
  }
  const selector = `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
  return isUnique(selector, root) ? selector : null;
}

function getAriaSelector(element, root) {
  const ariaLabel = element?.getAttribute?.('aria-label');
  if (!ariaLabel || ariaLabel.length > 80) {
    return null;
  }
  const selector = `${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`;
  return isUnique(selector, root) ? selector : null;
}

function getClassSelector(element, root) {
  const className = element?.getAttribute?.('class');
  if (!className) {
    return null;
  }

  const tag = element.tagName.toLowerCase();
  const classes = className.trim().split(/\s+/).filter((value) => (
    value &&
    value.length < 50 &&
    !/^[0-9]/.test(value) &&
    !value.includes(':') &&
    !value.includes('[') &&
    !value.includes('/') &&
    !value.startsWith('toolary-')
  ));

  for (const classToken of classes) {
    const selector = `${tag}.${cssEscape(classToken)}`;
    if (isUnique(selector, root)) {
      return selector;
    }
  }

  if (classes.length >= 2) {
    for (let i = 0; i < Math.min(classes.length, 5); i += 1) {
      for (let j = i + 1; j < Math.min(classes.length, 5); j += 1) {
        const selector = `${tag}.${cssEscape(classes[i])}.${cssEscape(classes[j])}`;
        if (isUnique(selector, root)) {
          return selector;
        }
      }
    }
  }

  if (classes.length > 0) {
    const selector = `${tag}.${classes.map((token) => cssEscape(token)).join('.')}`;
    if (isUnique(selector, root)) {
      return selector;
    }
  }

  return null;
}

function getNthChildPath(element, root) {
  const doc = element?.ownerDocument || document;
  if (!element || element === doc.body || element === doc.documentElement) {
    return 'body';
  }

  const path = [];
  let current = element;

  while (current && current !== doc.body && current !== doc.documentElement) {
    const stableId = getIdSelector(current, root);
    if (stableId) {
      path.unshift(stableId);
      break;
    }

    const parent = current.parentElement;
    if (!parent) {
      break;
    }

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((node) => node.tagName === current.tagName);
    if (siblings.length === 1) {
      path.unshift(tag);
    } else {
      const siblingIndex = Array.from(parent.children).indexOf(current) + 1;
      path.unshift(`${tag}:nth-child(${siblingIndex})`);
    }

    current = parent;
  }

  return path.length ? path.join(' > ') : 'body';
}

export function generateSelector(element, root = document) {
  const doc = element?.ownerDocument || document;
  const queryRoot = getQueryRoot(root, element);

  if (!element || element === doc.body || element === doc.documentElement) {
    return 'body';
  }

  return (
    getIdSelector(element, queryRoot) ||
    getDataAttrSelector(element, queryRoot) ||
    getNameSelector(element, queryRoot) ||
    getAriaSelector(element, queryRoot) ||
    getClassSelector(element, queryRoot) ||
    getNthChildPath(element, queryRoot)
  );
}

export function describeElement(element) {
  if (!element || !element.tagName) {
    return '';
  }

  const tag = element.tagName.toLowerCase();
  const ariaLabel = element.getAttribute('aria-label');
  const placeholder = element.getAttribute('placeholder');
  const title = element.getAttribute('title');
  const alt = element.getAttribute('alt');
  const text = (element.textContent || '').trim().slice(0, 50);
  const id = element.getAttribute('id');
  const className = element.getAttribute('class');

  if (ariaLabel) return `${tag}: "${ariaLabel}"`;
  if (element.value && tag === 'input') return `input: "${String(element.value).slice(0, 30)}"`;
  if (placeholder) return `${tag}: "${placeholder}"`;
  if (alt) return `${tag}: "${alt}"`;
  if (title) return `${tag}: "${title}"`;
  if (text) return `${tag}: "${text}${element.textContent.trim().length > 50 ? '...' : ''}"`;
  if (id) return `${tag}#${id}`;
  if (className && typeof className === 'string') {
    return `${tag}.${className.trim().split(/\s+/)[0]}`;
  }
  return tag;
}
