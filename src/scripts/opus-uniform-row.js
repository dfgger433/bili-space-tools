// 独立脚本：统一“所有已加载”的图文行高（不依赖图文翻页脚本，不做分页/预取/菜单）。
// 做法：把原生 WaterfallGrid 里所有已加载的 .item 卡片克隆到一个自己的网格里，按行等高重排；
// 原生网格隐藏但继续负责自动加载，源数据每次变化（滚动加载、tab、翻译等）都会重新克隆/排版。
// 这样不会和原生 WaterfallGrid 的绝对定位互相覆盖，滚动/自动加载后也能持续生效。
import { DEFAULT_COLUMN_GUTTER, DEFAULT_ROW_GUTTER } from '../opus/model.js';
import { layoutRows } from '../opus/layout.js';
import { createLogger } from '../shared/log.js';
import { addStyle } from '../shared/style.js';

const VERSION = '0.3.0';
const SCOPE = 'opus-row';
const STYLE_ID = 'bili-tools-opus-row-style';
const HIDE_CLASS = 'bt-opus-row-hidden';
const WRAP_CLASS = 'bt-opus-row-wrap';
const GRID_CLASS = 'bt-opus-row-grid';
const ITEM_CLASS = 'bt-opus-row-item';
const READY_CLASS = 'bt-opus-row-ready';
const TITLE_LINE_HEIGHT = 16.8;
const TEXT_LINE_HEIGHT = 20;

const log = createLogger(SCOPE);

const CSS = `
.${HIDE_CLASS} .opus-feed{position:absolute!important;left:0;right:0;top:auto;height:0!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important}
.${WRAP_CLASS}{margin:0 auto;width:100%}
.${GRID_CLASS}{position:relative;margin:0 auto}
.${ITEM_CLASS}{position:absolute;left:0;top:0;max-width:100%}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .bili-cover-card{overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card--only-text .opus-card__icons{margin-top:auto}
`;

const state = {
  active: false,
  version: VERSION,
  mode: null,
  items: 0,
  columns: 0,
  rows: 0,
  rowHeights: [],
  lastError: '',
  lastApplyAt: 0,
};

let masonry = null;
let source = null;
let hideHost = null;
let wrap = null;
let grid = null;
let clones = [];
let cloneSignature = '';
let sourceObserver = null;
let rebuildTimer = null;
let layoutTimer = null;
let boundLoad = false;
let boundResize = false;
let applying = false;

function exposeDebug() {
  window.BILI_TOOLS = window.BILI_TOOLS || {};
  window.BILI_TOOLS.row = {
    version: VERSION,
    state,
    apply: () => scheduleRebuild(0),
  };
}

function sourceItems() {
  if (!source) return [];
  const direct = Array.from(source.children).filter(
    (el) => el.classList && el.classList.contains('item'),
  );
  if (direct.length) return direct;
  return Array.from(source.querySelectorAll('.item'));
}

function sourceItemsOf(container) {
  if (!container) return [];
  const direct = Array.from(container.children).filter(
    (el) => el.classList && el.classList.contains('item'),
  );
  if (direct.length) return direct;
  return Array.from(container.querySelectorAll('.item'));
}

function findSource() {
  // 02 正在接管时让位，避免两个网格互相打架；阶段 3 应当单独启用 03。
  const opus = window.BILI_TOOLS && window.BILI_TOOLS.opus;
  if (opus && opus.state && opus.state.active) return null;
  const found = document.querySelector('.masonry_grid_v2');
  if (!found) return null;
  let container = found.querySelector('.container');
  if (!container || !sourceItemsOf(container).length) {
    const sample = found.querySelector('.item');
    container = (sample && sample.parentElement) || container;
  }
  if (!container || !sourceItemsOf(container).length) return null;
  return { masonry: found, source: container };
}

function signatureOf(items) {
  return items
    .map((el) => {
      const link = el.querySelector('.opus-card__title, .bili-cover-card');
      const href = (link && link.getAttribute('href')) || '';
      const title = ((el.querySelector('.opus-card__title') || {}).textContent || '')
        .trim()
        .slice(0, 40);
      const img = el.querySelector('.bili-cover-card img');
      const src = ((img && img.getAttribute('src')) || '').split('@')[0];
      return `${href}|${title}|${src}`;
    })
    .join('~');
}

function resolveInfo(items) {
  const first = items[0];
  if (!first) return null;
  const firstWidth =
    parseFloat(first.style.width) || first.getBoundingClientRect().width || 0;
  if (!(firstWidth > 0)) return null;
  const containerWidth =
    parseFloat(masonry && masonry.style.getPropertyValue('--container-width')) || 0;
  let columns = containerWidth > 0
    ? Math.round((containerWidth + DEFAULT_COLUMN_GUTTER) / (firstWidth + DEFAULT_COLUMN_GUTTER))
    : 0;
  if (!(columns > 0)) {
    const top = Math.round(first.getBoundingClientRect().top);
    columns = items.filter(
      (el) => Math.abs(Math.round(el.getBoundingClientRect().top) - top) <= 2,
    ).length;
  }
  return { columns: Math.max(1, columns), columnWidth: firstWidth };
}

function clampElement(item) {
  const title =
    item.querySelector('.opus-card__title .vui_ellipsis') ||
    item.querySelector('.opus-card__title .bt-opus-title-text');
  if (title) return { el: title, base: 2, lineHeight: TITLE_LINE_HEIGHT };
  const text =
    item.querySelector('.opus-card--only-text .vui_ellipsis') ||
    item.querySelector('.opus-card--only-text .bt-opus-text-clamp') ||
    item.querySelector('.opus-card--only-text .opus-card__text');
  if (text) return { el: text, base: 3, lineHeight: TEXT_LINE_HEIGHT };
  const titleAnchor = item.querySelector('.opus-card__title');
  if (titleAnchor) return { el: titleAnchor, base: 2, lineHeight: TITLE_LINE_HEIGHT };
  return null;
}

function restoreCloneImage(item) {
  const img = item.querySelector('.bili-cover-card img');
  if (!img) return;
  const src = img.getAttribute('src') || '';
  if (src.includes('@')) {
    // 原生卡片用裁剪缩略图；换成保比例的 640w 图，完整显示封面
    img.setAttribute('src', `${src.split('@')[0]}@640w.webp`);
  }
}

function setCloneCoverRatio(item) {
  const cover = item.querySelector('.bili-cover-card');
  const img = cover && cover.querySelector('img');
  if (!cover || !img || !img.naturalWidth || !img.naturalHeight) return;
  cover.style.setProperty(
    '--bili-cover-card-ratio',
    `${(img.naturalHeight / img.naturalWidth) * 100}%`,
  );
}

function resetClone(item, columnWidth) {
  item.style.removeProperty('height');
  item.style.removeProperty('transform');
  item.style.width = `${columnWidth}px`;
  const clamp = clampElement(item);
  if (clamp) clamp.el.style.setProperty('-webkit-line-clamp', String(clamp.base));
  restoreCloneImage(item);
  setCloneCoverRatio(item);
}

function rebuild() {
  if (!source || !source.isConnected || !grid) {
    attachSource(null);
    return;
  }
  const items = sourceItems();
  if (!items.length) return;
  const info = resolveInfo(items);
  if (!info) return;
  const signature = signatureOf(items);
  if (signature !== cloneSignature || clones.length !== items.length) {
    cloneSignature = signature;
    clones = [];
    grid.replaceChildren();
    for (const srcItem of items) {
      const clone = srcItem.cloneNode(true);
      clone.classList.remove('item');
      clone.classList.add(ITEM_CLASS);
      clone.removeAttribute('style');
      clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      clone.style.width = `${info.columnWidth}px`;
      restoreCloneImage(clone);
      grid.appendChild(clone);
      clones.push(clone);
    }
  }
  layout();
}

function layout() {
  if (!grid || !clones.length) return;
  const items = sourceItems();
  const info = resolveInfo(items);
  if (!info) return;
  if (applying) return;
  applying = true;
  try {
    grid.classList.remove(READY_CLASS);
    for (const clone of clones) resetClone(clone, info.columnWidth);
    void grid.offsetHeight;
    const naturalHeights = clones.map((clone) => {
      const card = clone.querySelector('.opus-card');
      return Math.round(card ? card.offsetHeight : clone.getBoundingClientRect().height);
    });
    const result = layoutRows(
      naturalHeights.map((height) => ({ height })),
      {
        columnWidth: info.columnWidth,
        columns: info.columns,
        rowGutter: DEFAULT_ROW_GUTTER,
        columnGutter: DEFAULT_COLUMN_GUTTER,
      },
    );
    grid.classList.add(READY_CLASS);
    grid.style.width = `${result.width}px`;
    grid.style.height = `${result.height}px`;
    clones.forEach((clone, index) => {
      const pos = result.positions[index];
      clone.style.height = `${pos.height}px`;
      clone.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
      const extra = Math.max(0, pos.height - naturalHeights[index]);
      const clamp = clampElement(clone);
      if (clamp && extra > 0) {
        const lines = clamp.base + Math.min(20, Math.floor(extra / clamp.lineHeight));
        clamp.el.style.setProperty('-webkit-line-clamp', String(lines));
      }
    });
    state.active = true;
    state.mode = 'native';
    state.items = clones.length;
    state.columns = info.columns;
    state.rows = result.rowHeights.length;
    state.rowHeights = result.rowHeights;
    state.lastError = '';
    state.lastApplyAt = Date.now();
  } finally {
    applying = false;
  }
}

function scheduleRebuild(delay = 120) {
  if (!source) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    try {
      rebuild();
    } catch (err) {
      state.lastError = String(err);
      log.warn('统一行高失败', err);
    }
  }, delay);
}

function scheduleLayout(delay = 80) {
  if (!source) return;
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    layoutTimer = null;
    try {
      layout();
    } catch (err) {
      state.lastError = String(err);
      log.warn('统一行高排版失败', err);
    }
  }, delay);
}

function onGridLoad() {
  scheduleLayout(80);
}

function onResize() {
  scheduleRebuild(150);
}

function detachSource() {
  if (sourceObserver) {
    sourceObserver.disconnect();
    sourceObserver = null;
  }
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
  }
  if (layoutTimer) {
    clearTimeout(layoutTimer);
    layoutTimer = null;
  }
  if (grid && boundLoad) {
    grid.removeEventListener('load', onGridLoad, true);
    boundLoad = false;
  }
  if (boundResize) {
    window.removeEventListener('resize', onResize);
    boundResize = false;
  }
  if (hideHost) {
    hideHost.classList.remove(HIDE_CLASS);
    hideHost = null;
  }
  if (wrap) {
    wrap.remove();
    wrap = null;
  }
  grid = null;
  clones = [];
  cloneSignature = '';
  source = null;
  masonry = null;
  state.active = false;
  state.mode = null;
  state.items = 0;
  state.columns = 0;
  state.rows = 0;
  state.rowHeights = [];
}

function attachSource(next) {
  if (source && next && source === next.source && wrap && wrap.isConnected) return;
  if (!source && !next) return;
  detachSource();
  if (!next) return;
  source = next.source;
  masonry = next.masonry;
  hideHost =
    masonry.closest('.opus') ||
    masonry.closest('.opus-body') ||
    masonry.parentElement ||
    document.body;
  hideHost.classList.add(HIDE_CLASS);
  wrap = document.createElement('div');
  wrap.className = WRAP_CLASS;
  grid = document.createElement('div');
  grid.className = GRID_CLASS;
  wrap.appendChild(grid);
  const feed = masonry.closest('.opus-feed');
  const parent = (feed && feed.parentElement) || masonry.parentElement;
  if (feed && feed.nextSibling) parent.insertBefore(wrap, feed.nextSibling);
  else parent.appendChild(wrap);
  sourceObserver = new MutationObserver(() => scheduleRebuild(120));
  sourceObserver.observe(source, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  grid.addEventListener('load', onGridLoad, true);
  boundLoad = true;
  window.addEventListener('resize', onResize, { passive: true });
  boundResize = true;
  state.active = true;
  log.info('已接管原生图文网格，开始统一行高');
  scheduleRebuild(0);
}

function start() {
  addStyle(STYLE_ID, CSS);
  exposeDebug();
  log.info(`统一行高脚本 v${VERSION} 启动`);
  setInterval(() => {
    const next = findSource();
    attachSource(next);
    if (source && source.isConnected) {
      const items = sourceItems();
      if (signatureOf(items) !== cloneSignature) scheduleRebuild(0);
      else if (Date.now() - state.lastApplyAt > 3000) scheduleLayout(0);
    }
  }, 500);
  attachSource(findSource());
}

const GLOBAL_KEY = '__biliToolsOpusRowLoaded__';
const previous = window[GLOBAL_KEY];
// 版本不同的旧实例（例如 0.1.0/0.2.x）可能先写了占位键；这里允许新版本继续运行
if (!previous || previous.version !== VERSION) {
  window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
  start();
} else {
  log.debug('统一行高脚本已注入，跳过重复初始化');
}
