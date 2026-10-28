// DOM 小工具
export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function create(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text != null) el.textContent = String(options.text);
  if (options.html != null) el.innerHTML = options.html;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value == null || value === false) continue;
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  if (options.style) {
    for (const [key, value] of Object.entries(options.style)) {
      if (value == null) continue;
      el.style.setProperty(key, String(value));
    }
  }
  if (options.children) {
    for (const child of options.children) {
      if (child) el.appendChild(child);
    }
  }
  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) {
      el.addEventListener(type, handler);
    }
  }
  return el;
}

export function observeNode(target, callback, options = { childList: true, subtree: true }) {
  if (!target) return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(target, options);
  return () => observer.disconnect();
}

export async function waitForElement(selector, { root = document, timeout = 15000, interval = 100 } = {}) {
  const start = Date.now();
  for (;;) {
    const el = root.querySelector(selector);
    if (el) return el;
    if (Date.now() - start >= timeout) {
      throw new Error(`waitForElement timeout: ${selector}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function isVisible(el) {
  if (!el) return false;
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** 找到元素最近的纵向滚动容器；找不到返回 document.scrollingElement。 */
export function findScrollParent(el) {
  let node = el && el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export function scrollToY(y, { container = null } = {}) {
  const top = Math.max(0, Math.round(y));
  if (container && container !== document.scrollingElement && container !== document.documentElement) {
    container.scrollTop = top;
    return;
  }
  window.scrollTo({ top, behavior: 'auto' });
}

export function scrollElementIntoView(el, offset = 64) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const y = window.scrollY + rect.top - offset;
  scrollToY(y);
}
