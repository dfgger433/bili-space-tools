// 独立脚本：统一“已加载”的图文行高（不依赖图文翻页脚本，也不做分页/预取/菜单）。
// 支持两种网格：
//   1. 原生图文页的 .masonry_grid_v2 .container > .item（不装 02 时）；
//   2. 图文翻页脚本渲染的 .bt-opus-grid > .bt-opus-item（装了 02 时，可选）。
// 行高 = 该行最高卡片；封面按图片真实比例完整显示（不裁剪）；行高富余时展开被省略的标题/正文。
import { DEFAULT_COLUMN_GUTTER, DEFAULT_ROW_GUTTER } from '../opus/model.js';
import { layoutRows } from '../opus/layout.js';
import { createLogger } from '../shared/log.js';
import { addStyle } from '../shared/style.js';

const VERSION = '0.2.1';
const SCOPE = 'opus-row';
const STYLE_ID = 'bili-tools-opus-row-style';
const ROOT_CLASS = 'bt-opus-uniform-root';
const TITLE_LINE_HEIGHT = 16.8;
const TEXT_LINE_HEIGHT = 20;
const COLUMN_GAP = DEFAULT_COLUMN_GUTTER;
const ROW_GAP = DEFAULT_ROW_GUTTER;

const log = createLogger(SCOPE);

const CSS = `
.${ROOT_CLASS} > .bt-opus-item .opus-card,.${ROOT_CLASS} > .item .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${ROOT_CLASS} > .bt-opus-item .bili-cover-card,.${ROOT_CLASS} > .item .bili-cover-card{overflow:hidden}
.${ROOT_CLASS} > .bt-opus-item .bili-cover-card__thumbnail img,.${ROOT_CLASS} > .item .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${ROOT_CLASS} > .bt-opus-item .opus-card--only-text,.${ROOT_CLASS} > .item .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${ROOT_CLASS} > .bt-opus-item .opus-card--only-text .opus-card__icons,.${ROOT_CLASS} > .item .opus-card--only-text .opus-card__icons{margin-top:auto}
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

let target = null;
let observer = null;
let attrObserver = null;
let applyTimer = null;
let applying = false;
let ignoreStyleUntil = 0;

function exposeDebug() {
  window.BILI_TOOLS = window.BILI_TOOLS || {};
  window.BILI_TOOLS.row = {
    version: VERSION,
    state,
    apply: () => scheduleApply(0),
  };
}

function itemsOf(t) {
  if (!t) return [];
  if (t.mode === 'bt') {
    return Array.from(t.root.children).filter(
      (el) => el.classList && el.classList.contains('bt-opus-item'),
    );
  }
  return Array.from(t.root.children).filter((el) => el.classList && el.classList.contains('item'));
}

function findTarget() {
  const btGrid = document.querySelector('.bt-opus-grid');
  if (btGrid && itemsOf({ mode: 'bt', root: btGrid }).length) {
    return { mode: 'bt', root: btGrid, grid: btGrid };
  }
  const masonry = document.querySelector('.masonry_grid_v2');
  if (!masonry) return null;
  let root = masonry.querySelector('.container');
  if (!root || !itemsOf({ mode: 'native', root }).length) {
    // 兼容不同版本/插件的 WaterfallGrid 包装：以 .item 的父元素作为容器
    const sample = masonry.querySelector('.item');
    root = (sample && sample.parentElement) || root;
  }
  if (root && itemsOf({ mode: 'native', root }).length) {
    return { mode: 'native', root, grid: masonry };
  }
  return null;
}

function resolveInfo(t, items) {
  const first = items[0];
  const firstWidth = first ? first.getBoundingClientRect().width : 0;
  if (t.mode === 'bt') {
    const opusState = window.BILI_TOOLS && window.BILI_TOOLS.opus && window.BILI_TOOLS.opus.state;
    if (opusState && opusState.columns > 0 && opusState.columnWidth > 0) {
      return { columns: opusState.columns, columnWidth: opusState.columnWidth };
    }
  }
  if (!first || firstWidth <= 0) return null;
  let columns = 0;
  const containerWidth = parseFloat(t.grid.style.getPropertyValue('--container-width')) || 0;
  if (containerWidth > 0) {
    columns = Math.round((containerWidth + COLUMN_GAP) / (firstWidth + COLUMN_GAP));
  }
  if (!(columns > 0)) {
    // 后备：按当前同一行的 item 数反推
    const top = Math.round(first.getBoundingClientRect().top);
    columns = items.filter(
      (el) => Math.abs(Math.round(el.getBoundingClientRect().top) - top) <= 2,
    ).length;
  }
  return { columns: Math.max(1, columns), columnWidth: firstWidth };
}

function clampElement(item) {
  // 注意：不要把 .opus-card__title 放进同一个 querySelector 列表，
  // 否则浏览器按树顺序会先返回标题外层 <a>，导致真正的 clamp 元素没被设置。
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

function resetItem(item) {
  item.style.removeProperty('height');
  item.style.removeProperty('transform');
  const clamp = clampElement(item);
  if (clamp) clamp.el.style.setProperty('-webkit-line-clamp', String(clamp.base));
}

function setCoverRatio(item) {
  const cover = item.querySelector('.bili-cover-card');
  const img = cover && cover.querySelector('img');
  if (!cover || !img || !img.naturalWidth || !img.naturalHeight) return;
  cover.style.setProperty(
    '--bili-cover-card-ratio',
    `${(img.naturalHeight / img.naturalWidth) * 100}%`,
  );
}

function restoreNativeCover(item) {
  if (!target || target.mode !== 'native') return;
  const img = item.querySelector('.bili-cover-card img');
  if (!img) return;
  const src = img.getAttribute('src') || '';
  if (src.includes('@') && img.getAttribute('data-bt-full') !== '1') {
    img.setAttribute('data-bt-full', '1');
    // 原生卡片用的是裁剪缩略图；去掉 @430w_324h_1c.webp 等参数，换成保比例的 640w 图（完整画面、体积小）
    img.setAttribute('src', `${src.replace(/@[^/]*$/, '')}@640w.webp`);
  }
}

function apply() {
  const t = target;
  if (!t || !t.root.isConnected) {
    attachTarget(null);
    return;
  }
  const items = itemsOf(t);
  if (!items.length) return;
  const info = resolveInfo(t, items);
  if (!info) return;
  if (applying) return;
  applying = true;
  try {
    t.root.classList.remove(ROOT_CLASS);
    t.root.style.removeProperty('height');
    if (t.grid) t.grid.style.removeProperty('height');
    for (const item of items) resetItem(item);
    for (const item of items) {
      restoreNativeCover(item);
      setCoverRatio(item);
    }
    void t.root.offsetHeight;
    const naturalHeights = items.map((item) => {
      const card = item.querySelector('.opus-card');
      return Math.round(card ? card.offsetHeight : item.getBoundingClientRect().height);
    });
    const layout = layoutRows(
      naturalHeights.map((height) => ({ height })),
      {
        columnWidth: info.columnWidth,
        columns: info.columns,
        rowGutter: ROW_GAP,
        columnGutter: COLUMN_GAP,
      },
    );
    t.root.classList.add(ROOT_CLASS);
    if (t.mode === 'bt') {
      t.root.style.width = `${layout.width}px`;
      t.root.style.height = `${layout.height}px`;
    } else {
      t.root.style.height = `${layout.height}px`;
      if (t.grid) {
        t.grid.style.setProperty('--container-height', `${layout.height}px`);
        t.grid.style.height = `${layout.height}px`;
      }
    }
    items.forEach((item, index) => {
      const pos = layout.positions[index];
      item.style.width = `${info.columnWidth}px`;
      item.style.height = `${pos.height}px`;
      item.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
      const extra = Math.max(0, pos.height - naturalHeights[index]);
      const clamp = clampElement(item);
      if (clamp && extra > 0) {
        const lines = clamp.base + Math.min(20, Math.floor(extra / clamp.lineHeight));
        clamp.el.style.setProperty('-webkit-line-clamp', String(lines));
      }
    });
    state.active = true;
    state.mode = t.mode;
    state.items = items.length;
    state.columns = info.columns;
    state.rows = layout.rowHeights.length;
    state.rowHeights = layout.rowHeights;
    state.lastError = '';
    state.lastApplyAt = Date.now();
    ignoreStyleUntil = Date.now() + 220;
  } finally {
    applying = false;
  }
}

function scheduleApply(delay = 60) {
  if (!target) return;
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    applyTimer = null;
    try {
      apply();
    } catch (err) {
      state.lastError = String(err);
      log.warn('统一行高失败', err);
    }
  }, delay);
}

function onImageLoad() {
  scheduleApply(80);
}

function onResize() {
  scheduleApply(120);
}

function onStylesChanged() {
  if (applying) return;
  if (Date.now() < ignoreStyleUntil) return;
  scheduleApply(80);
}

function detachTarget() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (attrObserver) {
    attrObserver.disconnect();
    attrObserver = null;
  }
  if (target) {
    target.root.classList.remove(ROOT_CLASS);
    target.root.removeEventListener('load', onImageLoad, true);
  }
  window.removeEventListener('resize', onResize);
  target = null;
  state.active = false;
  state.mode = null;
  state.items = 0;
  state.columns = 0;
  state.rows = 0;
  state.rowHeights = [];
}

function attachTarget(next) {
  if (target && next && target.mode === next.mode && target.root === next.root) return;
  if (!target && !next) return;
  detachTarget();
  target = next;
  if (!next) return;
  next.root.classList.add(ROOT_CLASS);
  observer = new MutationObserver(() => scheduleApply(30));
  observer.observe(next.root, { childList: true, subtree: true });
  if (next.mode === 'native') {
    attrObserver = new MutationObserver(onStylesChanged);
    attrObserver.observe(next.root, { attributes: true, attributeFilter: ['style'], subtree: true });
  }
  next.root.addEventListener('load', onImageLoad, true);
  window.addEventListener('resize', onResize, { passive: true });
  state.active = true;
  log.info(`已连接（${next.mode}），开始统一行高`);
  scheduleApply(0);
}

function start() {
  addStyle(STYLE_ID, CSS);
  exposeDebug();
  log.info(`统一行高脚本 v${VERSION} 启动`);
  setInterval(() => {
    const next = findTarget();
    attachTarget(next);
    // 看门狗：原生组件重排/异常后，最多 3 秒内重新应用一次
    if (target && Date.now() - state.lastApplyAt > 3000) scheduleApply(0);
  }, 500);
  attachTarget(findTarget());
}

const GLOBAL_KEY = '__biliToolsOpusRowLoaded__';
const previous = window[GLOBAL_KEY];
// 版本不同的旧实例（例如 v0.1.0）可能先把占位键写上；这里允许新版本继续运行
if (!previous || previous.version !== VERSION) {
  window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
  start();
} else {
  log.debug('统一行高脚本已注入，跳过重复初始化');
}


