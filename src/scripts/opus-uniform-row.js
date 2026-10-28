// 独立脚本：只做“统一行高”，不包含分页/菜单/预取。
// 依赖“B站图文翻页”脚本（02）渲染出的 .bt-opus-grid / .bt-opus-item；
// 它只在这个网格上重新排列每行、统一行高，并把行高富余空间用于展开被省略的标题/正文。
import { DEFAULT_COLUMN_GUTTER, DEFAULT_ROW_GUTTER } from '../opus/model.js';
import { layoutRows } from '../opus/layout.js';
import { createLogger } from '../shared/log.js';
import { addStyle } from '../shared/style.js';

const VERSION = '0.1.0';
const SCOPE = 'opus-row';
const STYLE_ID = 'bili-tools-opus-row-style';
const GRID_CLASS = 'bt-opus-uniform';
const GRID_SELECTOR = '.bt-opus-grid';
const TITLE_LINE_HEIGHT = 16.8;
const TEXT_LINE_HEIGHT = 20;

const log = createLogger(SCOPE);

const CSS = `
.${GRID_CLASS} .bt-opus-item .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${GRID_CLASS} .bt-opus-item .bili-cover-card{overflow:hidden}
.${GRID_CLASS} .bt-opus-item .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${GRID_CLASS} .bt-opus-item .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${GRID_CLASS} .bt-opus-item .opus-card--only-text .opus-card__icons{margin-top:auto}
`;

const state = {
  active: false,
  version: VERSION,
  grid: null,
  rows: 0,
  columns: 0,
  rowHeights: [],
  items: 0,
};

let observer = null;
let applyTimer = null;

function exposeDebug() {
  window.BILI_TOOLS = window.BILI_TOOLS || {};
  window.BILI_TOOLS.row = {
    version: VERSION,
    state,
    apply: () => scheduleApply(0),
  };
}

function resolveGridInfo(grid, items) {
  const opusState = window.BILI_TOOLS && window.BILI_TOOLS.opus && window.BILI_TOOLS.opus.state;
  const first = items[0];
  const firstWidth = first ? first.getBoundingClientRect().width : 0;
  if (opusState && opusState.columns > 0 && opusState.columnWidth > 0) {
    return { columns: opusState.columns, columnWidth: opusState.columnWidth };
  }
  // 后备：按“同一行 left 递增、第一行 top 相同”反推列数与列宽
  if (!first || firstWidth <= 0) return null;
  const firstTop = Math.round(first.getBoundingClientRect().top);
  const columns = items.filter((el) => Math.abs(Math.round(el.getBoundingClientRect().top) - firstTop) <= 2).length;
  return { columns: Math.max(1, columns), columnWidth: firstWidth };
}

function clearInlineLayout(items) {
  for (const item of items) {
    item.style.removeProperty('height');
    item.style.removeProperty('transform');
    const title = item.querySelector('.bt-opus-title-text');
    const text = item.querySelector('.bt-opus-text-clamp');
    if (title) title.style.removeProperty('-webkit-line-clamp');
    if (text) text.style.removeProperty('-webkit-line-clamp');
  }
}

function setNaturalCoverRatio(item) {
  const cover = item.querySelector('.bili-cover-card');
  const img = cover && cover.querySelector('img');
  if (!cover || !img || !img.naturalWidth || !img.naturalHeight) return;
  // 用图片真实宽高设置封面盒子的比例：保留完整画面，不裁剪
  cover.style.setProperty('--bili-cover-card-ratio', `${(img.naturalHeight / img.naturalWidth) * 100}%`);
}

function apply() {
  const grid = state.grid;
  if (!grid || !grid.isConnected) {
    attachGrid(null);
    return;
  }
  const items = Array.from(grid.children).filter(
    (el) => el.classList && el.classList.contains('bt-opus-item'),
  );
  if (!items.length) return;
  const info = resolveGridInfo(grid, items);
  if (!info) return;
  const { columns, columnWidth } = info;

  // 测量自然高度时必须先移除本脚本的等高样式，否则卡片会被当前行高/100% 撑开
  grid.classList.remove(GRID_CLASS);
  clearInlineLayout(items);
  grid.style.removeProperty('height');
  for (const item of items) setNaturalCoverRatio(item);
  void grid.offsetHeight;
  const naturalHeights = items.map((item) => {
    const card = item.querySelector('.opus-card');
    return Math.round(card ? card.offsetHeight : item.getBoundingClientRect().height);
  });

  const layout = layoutRows(
    naturalHeights.map((height) => ({ height })),
    {
      columnWidth,
      columns,
      rowGutter: DEFAULT_ROW_GUTTER,
      columnGutter: DEFAULT_COLUMN_GUTTER,
    },
  );

  grid.classList.add(GRID_CLASS);
  grid.style.width = `${layout.width}px`;
  grid.style.height = `${layout.height}px`;

  items.forEach((item, index) => {
    const pos = layout.positions[index];
    item.style.width = `${columnWidth}px`;
    item.style.height = `${pos.height}px`;
    item.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
    const extra = Math.max(0, pos.height - naturalHeights[index]);
    const title = item.querySelector('.bt-opus-title-text');
    const text = item.querySelector('.bt-opus-text-clamp');
    if (title && extra > 0) {
      const lines = 2 + Math.min(20, Math.floor(extra / TITLE_LINE_HEIGHT));
      title.style.setProperty('-webkit-line-clamp', String(lines));
    } else if (text && extra > 0) {
      const lines = 3 + Math.min(20, Math.floor(extra / TEXT_LINE_HEIGHT));
      text.style.setProperty('-webkit-line-clamp', String(lines));
    }
  });

  state.active = true;
  state.grid = grid;
  state.rows = layout.rowHeights.length;
  state.columns = columns;
  state.rowHeights = layout.rowHeights;
  state.items = items.length;
}

function scheduleApply(delay = 60) {
  if (!state.grid) return;
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    applyTimer = null;
    try {
      apply();
    } catch (err) {
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

function attachGrid(grid) {
  if (grid === state.grid && grid) return;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (state.grid) {
    state.grid.classList.remove(GRID_CLASS);
    state.grid.removeEventListener('load', onImageLoad, true);
  }
  window.removeEventListener('resize', onResize);
  state.grid = grid || null;
  state.active = false;
  state.rows = 0;
  state.columns = 0;
  state.rowHeights = [];
  state.items = 0;
  if (!grid) return;

  grid.classList.add(GRID_CLASS);
  observer = new MutationObserver(() => scheduleApply(30));
  observer.observe(grid, { childList: true, subtree: true });
  grid.addEventListener('load', onImageLoad, true);
  window.addEventListener('resize', onResize, { passive: true });
  state.active = true;
  log.info('已连接到图文翻页网格，开始统一行高');
  scheduleApply(0);
}

function start() {
  addStyle(STYLE_ID, CSS);
  exposeDebug();
  setInterval(() => {
    const grid = document.querySelector(GRID_SELECTOR);
    if (grid !== state.grid || (grid && !grid.isConnected)) attachGrid(grid && grid.isConnected ? grid : null);
  }, 500);
  const initial = document.querySelector(GRID_SELECTOR);
  if (initial) attachGrid(initial);
}

const GLOBAL_KEY = '__biliToolsOpusRowLoaded__';
if (!window[GLOBAL_KEY]) {
  window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
  start();
} else {
  log.debug('统一行高脚本已注入，跳过重复初始化');
}

