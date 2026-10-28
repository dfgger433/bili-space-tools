// 阶段 2：B 站空间图文页翻页（每页 20 条，与 B 站自动加载批次一致）
// - 复用 shared/pager.js 原生分页条、shared/dom、log、style、toast
// - 数据优先取页面自身的 Vue 实例（WaterfallGrid 的 props.list / onLoadMore），必要时退化为接口抓包
// - 保留 B 站原生的滚到底自动加载：滚到当前页底部会预取下一页 20 条（不渲染，点下一页即时打开）
import { createLogger, waitFor, sleep } from '../shared/log.js';
import { create, observeNode, waitForElement } from '../shared/dom.js';
import { addStyle } from '../shared/style.js';
import { createPager } from '../shared/pager.js';
import { toast } from '../shared/toast.js';
import { PAGE_SIZE, DEFAULT_COLUMN_GUTTER, DEFAULT_ROW_GUTTER, coverDisplaySrc } from '../opus/model.js';
import {
  computeColumnWidth,
  columnsForWidth,
  layoutWaterfall,
  totalPages,
} from '../opus/layout.js';
import { buildOpusCard } from '../opus/cards.js';
import { loadSettings, saveSettings } from '../opus/settings.js';
import {
  installCapture,
  createCaptureState,
  createAdapter,
  getVueApp,
  findWaterfall,
} from '../opus/adapter.js';

const VERSION = '0.1.2';
const SCOPE = 'opus';
const STYLE_ID = 'bili-tools-opus-style';
const ACTIVE_CLASS = 'bili-tools-opus-active';
const WRAP_CLASS = 'bt-opus-wrap';
const PAGER_CLASS = 'bt-opus-pager';
const HEADER_OFFSET = 64;
const BOOT_TIMEOUT = 20000;
const LOAD_TIMEOUT = 20000;

const log = createLogger(SCOPE);
const capture = createCaptureState();

const state = {
  active: false,
  booting: false,
  adapter: null,
  page: 1,
  pageSize: PAGE_SIZE,
  items: [],
  loaded: 0,
  lastLoaded: 0,
  hasMore: true,
  cw: 0,
  columns: 0,
  type: '',
  tab: '',
  busy: false,
  busyText: '',
  renderKey: '',
  feedEl: null,
  opusEl: null,
  wrapEl: null,
  gridEl: null,
  pager: null,
  settings: loadSettings(),
  settingsEl: null,
  settingsInput: null,
  routeKey: '',
  nextBootAt: 0,
  observer: null,
  refreshTimer: null,
  resizeTimer: null,
  pollTimer: null,
};

const CSS = `
.bili-tools-opus-active .opus-body{position:relative}
/* 不直接用 display:none：保留原生 feed 的宽度，WaterfallGrid 在 resize 时才不会把 --container-width 算成最小列数 */
.bili-tools-opus-active .opus-feed{position:absolute!important;left:0;right:0;top:auto;height:0!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important}
.${WRAP_CLASS}{margin:0 auto}
.bt-opus-grid{position:relative;margin:0 auto}
.bt-opus-item{position:absolute;left:0;top:0;max-width:100%}
.bt-opus-title-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all;line-break:anywhere}
.bt-opus-text-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all;line-break:anywhere;white-space:pre-wrap}
.bt-opus-item .opus-card{width:100%}
.bt-opus-pager{margin:8px auto 24px}
.bt-opus-pager .vui_pagenation--btn-side.vui_button--disabled,
.bt-opus-pager .vui_pagenation--btn-more.vui_button--disabled{display:none}
.bili-tools-opus-active .opus-footer{padding:24px 0 32px}
.bt-opus-busy{color:var(--text2,#61666d);font-size:12px;text-align:center;padding-top:8px}
.bt-opus-settings{display:flex;justify-content:center;margin-top:8px}
.bt-opus-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--text2,#61666d);cursor:pointer;user-select:none}
.bt-opus-switch__input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.bt-opus-switch__track{position:relative;flex:none;width:32px;height:18px;border-radius:9px;background:var(--graph_bg_thick,#e3e5e7);transition:background-color .2s}
.bt-opus-switch__thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .2s}
.bt-opus-switch__input:checked+.bt-opus-switch__track{background:var(--brand_blue,#00aeec)}
.bt-opus-switch__input:checked+.bt-opus-switch__track .bt-opus-switch__thumb{transform:translateX(14px)}
.bt-opus-switch__input:focus-visible+.bt-opus-switch__track{outline:2px solid var(--brand_blue,#00aeec);outline-offset:2px}
.bt-opus-switch:hover{color:var(--brand_blue,#00aeec)}
`;

// ---------------------------------------------------------------------------
// 路由 / 启动
// ---------------------------------------------------------------------------
function isOpusRoute() {
  return /^\/\d+\/upload\/opus(?:\/|$)/.test(location.pathname);
}

function startStyle() {
  addStyle(STYLE_ID, CSS);
}

function maybeBoot() {
  if (state.active || state.booting) return;
  if (!isOpusRoute()) return;
  if (Date.now() < state.nextBootAt) return;
  state.nextBootAt = Date.now() + 3000;
  void boot();
}

async function boot() {
  if (state.active || state.booting || !isOpusRoute()) return;
  state.booting = true;
  try {
    startStyle();
    const feed = await waitForElement('.opus-feed', { timeout: BOOT_TIMEOUT }).catch(() => null);
    if (!feed) {
      log.info('未找到 .opus-feed，稍后重试');
      return;
    }
    const ready = await waitForData(15000);
    if (!ready) {
      log.info('图文列表暂无可接管的数据（未登录 / 空列表），稍后重试');
      return;
    }
    activate(feed);
  } catch (err) {
    log.warn('启动失败', err);
  } finally {
    state.booting = false;
    state.nextBootAt = Date.now() + 3000;
  }
}

async function waitForData(timeout) {
  const start = Date.now();
  for (;;) {
    if (capture.items.length > 0) return true;
    const inst = findWaterfall(getVueApp());
    if (inst && Array.isArray(inst.props.list) && inst.props.list.length > 0) return true;
    if (Date.now() - start >= timeout) return false;
    await sleep(150);
  }
}

function activate(feed) {
  if (state.active) return;
  state.active = true;
  state.feedEl = feed;
  state.opusEl = feed.closest('.opus') || document.querySelector('.opus') || document.body;
  state.opusEl.classList.add(ACTIVE_CLASS);
  state.adapter = createAdapter(capture);
  if (!state.adapter) {
    log.warn('没有可用的数据通道');
    teardown();
    return;
  }
  state.type = capture.type;
  state.tab = activeTabText();
  log.info('已启用', { adapter: state.adapter.kind, version: VERSION });
  ensureWrap();
  ensurePager();
  bindObservers();
  refresh(true);
}

// ---------------------------------------------------------------------------
// 抓包回调
// ---------------------------------------------------------------------------
function onCapture(evt) {
  capture.onResponse(evt);
  if (!state.active) return;
  const page = Number(evt.params && evt.params.page) || 1;
  const type = (evt.params && evt.params.type) || capture.type;
  if (page <= 1) {
    if (state.type && type !== state.type) {
      state.page = 1;
      state.tab = activeTabText();
    }
    state.type = type;
  }
  scheduleRefresh(60);
}

function activeTabText() {
  const el = document.querySelector('.opus-header .content-tab.active');
  return el ? (el.textContent || '').trim() : '';
}

// ---------------------------------------------------------------------------
// 刷新 / 渲染
// ---------------------------------------------------------------------------
function isOurNode(node) {
  if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return false;
  return Boolean(node.closest(`.${WRAP_CLASS}`) || node.closest(`.${PAGER_CLASS}`));
}

function feedElement() {
  return document.querySelector('.opus-feed');
}

function ensureWrap() {
  const feed = feedElement();
  if (!feed) {
    teardown();
    return;
  }
  if (feed !== state.feedEl) {
    state.feedEl = feed;
    state.opusEl = feed.closest('.opus') || document.querySelector('.opus') || document.body;
  }
  state.opusEl.classList.add(ACTIVE_CLASS);
  if (!state.wrapEl) {
    state.wrapEl = create('div', { className: WRAP_CLASS });
    state.gridEl = create('div', { className: 'bt-opus-grid' });
    state.wrapEl.appendChild(state.gridEl);
  }
  const parent = feed.parentElement;
  if (parent && (state.wrapEl.parentElement !== parent || state.wrapEl.previousElementSibling !== feed)) {
    parent.insertBefore(state.wrapEl, feed.nextSibling);
  }
}

function ensurePager() {
  if (!state.pager) {
    state.pager = createPager({
      className: PAGER_CLASS,
      onPage: (page) => {
        void goTo(page);
      },
      onJump: (page) => {
        void goTo(page);
      },
    });
  }
  const footer = document.querySelector('.opus-footer') || state.opusEl;
  if (footer && state.pager.el.parentElement !== footer) {
    footer.appendChild(state.pager.el);
  }
  ensureSettingsUi(footer);
}

function buildSettingsUi() {
  const wrap = create('div', { className: 'bt-opus-settings' });
  const label = create('label', {
    className: 'bt-opus-switch',
    attrs: { title: '开启后加载压缩后的封面（更快、省流量）；关闭则加载原图' },
  });
  const input = create('input', {
    className: 'bt-opus-switch__input',
    attrs: { type: 'checkbox', 'aria-label': '图片压缩' },
  });
  input.addEventListener('change', () => setCompressImages(input.checked));
  label.appendChild(input);
  const track = create('span', { className: 'bt-opus-switch__track' });
  track.appendChild(create('span', { className: 'bt-opus-switch__thumb' }));
  label.appendChild(track);
  label.appendChild(create('span', { className: 'bt-opus-switch__label', text: '图片压缩' }));
  wrap.appendChild(label);
  state.settingsInput = input;
  input.checked = Boolean(state.settings.compressImages);
  return wrap;
}

function ensureSettingsUi(footer) {
  if (!state.settingsEl) state.settingsEl = buildSettingsUi();
  const target = footer || document.querySelector('.opus-footer') || state.opusEl;
  if (target && state.settingsEl.parentElement !== target) target.appendChild(state.settingsEl);
  if (state.settingsInput) state.settingsInput.checked = Boolean(state.settings.compressImages);
}

function setCompressImages(value) {
  const next = Boolean(value);
  if (state.settings.compressImages === next) return;
  state.settings.compressImages = next;
  saveSettings(state.settings);
  if (state.settingsInput) state.settingsInput.checked = next;
  preloadedCovers.clear();
  refresh(true);
  toast(next ? '已开启图片压缩（封面加载更快）' : '已关闭图片压缩（封面加载原图）', { duration: 1800 });
}

function resolveLayout() {
  let cw = state.adapter ? state.adapter.getColumnWidth() : 0;
  let columns = 0;
  let containerWidth = 0;
  const masonry = document.querySelector('.masonry_grid_v2');
  if (masonry) {
    const raw =
      masonry.style.getPropertyValue('--container-width') ||
      getComputedStyle(masonry).getPropertyValue('--container-width');
    const num = parseFloat(raw);
    if (Number.isFinite(num) && num > 0) containerWidth = num;
  }
  if (!(containerWidth > 0)) {
    // 原生 feed 还没算出宽度时的兜底：用 .opus-body 内容宽度
    const body = document.querySelector('.opus-body');
    if (body) {
      const cs = getComputedStyle(body);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      containerWidth = Math.max(0, body.clientWidth - pad);
    }
  }
  if (!cw || cw <= 0) {
    const fallback = computeColumnWidth(window.innerWidth);
    cw = fallback.columnWidth;
    columns = fallback.columns;
  }
  if (containerWidth > 0 && cw > 0) {
    const derived = columnsForWidth(containerWidth, cw, DEFAULT_COLUMN_GUTTER);
    if (derived >= 1) columns = derived;
  }
  if (!columns) {
    columns = computeColumnWidth(window.innerWidth).columns;
  }
  return {
    columnWidth: Math.round(cw * 100) / 100,
    columns: Math.max(1, columns),
  };
}

function refresh(force = false) {
  if (!state.active) return;
  ensureWrap();
  if (!state.feedEl) return;
  if (!state.adapter || (state.adapter.isValid && !state.adapter.isValid())) {
    state.adapter = createAdapter(capture);
    if (!state.adapter) {
      teardown();
      return;
    }
  }
  const layout = resolveLayout();
  const items = state.adapter.getItems(layout.columnWidth) || [];
  const loaded = items.length;
  const hasMoreRaw = state.adapter.getHasMore();
  const tab = activeTabText();
  if (tab && tab !== state.tab) {
    state.tab = tab;
    state.page = 1;
  }
  if (loaded < state.lastLoaded) state.page = 1;
  state.items = items;
  state.loaded = loaded;
  state.lastLoaded = loaded;
  state.cw = layout.columnWidth;
  state.columns = layout.columns;
  state.hasMore = hasMoreRaw !== false;

  if (state.hasMore) {
    const maxLoadedPage = Math.max(1, Math.ceil(loaded / PAGE_SIZE));
    if (state.page > maxLoadedPage + 1) state.page = maxLoadedPage;
  } else {
    const last = totalPages(loaded, PAGE_SIZE);
    if (state.page > last) state.page = last;
  }

  ensurePager();
  if (loaded > 0) {
    maybeRender(force);
    // 预热下两页的封面缩略图：翻页时直接命中浏览器缓存，避免整页灰块
    const preloadStart = state.page * PAGE_SIZE;
    preloadCovers(state.items.slice(preloadStart, preloadStart + PAGE_SIZE * 2));
  }
  updatePager();
}

const preloadedCovers = new Set();
function preloadCovers(items) {
  // 关闭压缩时原图很大，不主动预热，按需加载即可
  if (!state.settings.compressImages) return;
  for (const item of items) {
    const src = coverDisplaySrc(item.cover, true);
    if (!src || preloadedCovers.has(src)) continue;
    preloadedCovers.add(src);
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}

function currentSlice() {
  let page = state.page;
  let start = (page - 1) * PAGE_SIZE;
  let slice = state.items.slice(start, start + PAGE_SIZE);
  if (!slice.length && state.loaded > 0) {
    page = totalPages(state.loaded, PAGE_SIZE);
    state.page = page;
    start = (page - 1) * PAGE_SIZE;
    slice = state.items.slice(start, start + PAGE_SIZE);
  }
  return { page, slice };
}

function maybeRender(force = false) {
  const { page, slice } = currentSlice();
  const key = [
    page,
    state.cw,
    state.columns,
    slice.map((item) => item.key).join(','),
  ].join('|');
  if (!force && key === state.renderKey) return;
  state.renderKey = key;
  renderGrid(slice);
}

function renderGrid(slice) {
  const grid = state.gridEl;
  if (!grid) return;
  const layout = layoutWaterfall(slice, {
    columnWidth: state.cw,
    columns: state.columns,
    rowGutter: DEFAULT_ROW_GUTTER,
    columnGutter: DEFAULT_COLUMN_GUTTER,
  });
  grid.style.width = `${layout.width}px`;
  grid.style.height = `${layout.height}px`;
  const frag = document.createDocumentFragment();
  slice.forEach((item, index) => {
    const pos = layout.positions[index] || { left: 0, top: 0 };
    const el = create('div', {
      className: 'bt-opus-item',
      style: {
        width: `${state.cw}px`,
        height: `${Math.max(0, item.height)}px`,
        transform: `translate(${pos.left}px, ${pos.top}px)`,
      },
    });
    el.appendChild(
      buildOpusCard(item, { compressImages: Boolean(state.settings.compressImages) }),
    );
    frag.appendChild(el);
  });
  grid.replaceChildren(frag);
}

function updatePager() {
  if (!state.pager) return;
  const total = state.hasMore ? null : totalPages(state.loaded, PAGE_SIZE);
  state.pager.update({
    page: state.page,
    totalPages: total,
    hasMore: state.hasMore,
    loadedCount: state.loaded,
    totalCount: total ? state.loaded : null,
    pageSize: PAGE_SIZE,
    busy: state.busy,
    busyText: state.busyText,
  });
}

function scrollToFeedTop() {
  const el = state.wrapEl || state.feedEl;
  if (!el) return;
  const top = Math.max(0, window.scrollY + el.getBoundingClientRect().top - HEADER_OFFSET);
  if (window.scrollY > top + 4) window.scrollTo({ top, behavior: 'auto' });
}

// ---------------------------------------------------------------------------
// 翻页 / 加载
// ---------------------------------------------------------------------------
function loadedNow() {
  return state.adapter ? state.adapter.getLoaded() : state.loaded;
}

async function ensureLoaded(need) {
  const start = Date.now();
  let noGrowth = 0;
  while (loadedNow() < need) {
    if (!state.hasMore) break;
    if (Date.now() - start > LOAD_TIMEOUT) throw new Error('加载超时');
    if (state.adapter.getLoading && state.adapter.getLoading()) {
      await sleep(150);
      continue;
    }
    const before = loadedNow();
    await state.adapter.loadMore();
    try {
      await waitFor(
        () => loadedNow() > before || state.adapter.getHasMore() === false,
        { timeout: LOAD_TIMEOUT, interval: 150, label: 'opus-load-more' },
      );
    } catch {
      throw new Error('加载超时');
    }
    refresh();
    if (loadedNow() > before) {
      noGrowth = 0;
    } else {
      noGrowth += 1;
      if (noGrowth >= 3) {
        state.hasMore = false;
        break;
      }
    }
  }
  refresh();
}

async function goTo(page) {
  if (!state.active || !state.adapter || state.busy) return false;
  if (!state.loaded) return false;
  let target = Math.max(1, Math.floor(Number(page) || 1));
  if (!state.hasMore) {
    target = Math.min(target, totalPages(state.loaded, PAGE_SIZE));
  }
  const need = target * PAGE_SIZE;
  if (state.loaded < need && state.hasMore) {
    const pagesAhead = target - Math.max(1, Math.ceil(state.loaded / PAGE_SIZE));
    const requests = Math.ceil((need - state.loaded) / PAGE_SIZE);
    if (pagesAhead > 6 && requests > 6) {
      const ok = window.confirm(`跳转到第 ${target} 页还需要加载约 ${requests} 次，继续吗？`);
      if (!ok) return false;
    }
    state.busy = true;
    state.busyText = `正在加载第 ${target} 页（已加载 ${state.loaded} 个）…`;
    updatePager();
    try {
      await ensureLoaded(need);
    } catch (err) {
      state.busy = false;
      updatePager();
      toast(`加载第 ${target} 页失败：${err.message}`, { type: 'error' });
      return false;
    }
    state.busy = false;
    state.busyText = '';
  }
  const last = totalPages(state.loaded, PAGE_SIZE);
  if (target > last) {
    target = last;
    toast(`没有更多内容了，已停在最后一页（第 ${last} 页）`, { duration: 2600 });
  }
  state.page = target;
  refresh(true);
  updatePager();
  scrollToFeedTop();
  return true;
}

// ---------------------------------------------------------------------------
// 观察器 / 生命周期
// ---------------------------------------------------------------------------
function scheduleRefresh(delay = 80) {
  if (state.refreshTimer) return;
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null;
    refresh();
  }, delay);
}

function bindObservers() {
  if (!state.observer && state.opusEl) {
    state.observer = observeNode(
      state.opusEl,
      (mutations) => {
        let relevant = false;
        for (const mutation of mutations) {
          if (isOurNode(mutation.target)) continue;
          if (mutation.type !== 'childList') continue;
          if (!mutation.addedNodes.length && !mutation.removedNodes.length) continue;
          relevant = true;
          break;
        }
        if (relevant) scheduleRefresh(120);
      },
      { childList: true, subtree: true },
    );
  }
  if (!state.onResize) {
    state.onResize = () => {
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        state.resizeTimer = null;
        refresh(true);
      }, 320);
    };
    window.addEventListener('resize', state.onResize, { passive: true });
  }
  if (!state.onTabClick) {
    state.onTabClick = (event) => {
      const tab = event.target && event.target.closest && event.target.closest('.content-tab');
      if (!tab) return;
      setTimeout(() => {
        state.page = 1;
        state.tab = activeTabText();
        refresh(true);
      }, 120);
    };
    document.addEventListener('click', state.onTabClick, true);
  }
  if (!state.pollTimer) {
    state.pollTimer = setInterval(() => {
      if (state.active) refresh();
    }, 800);
  }
}

function teardown() {
  if (state.observer) {
    state.observer();
    state.observer = null;
  }
  if (state.onResize) {
    window.removeEventListener('resize', state.onResize);
    state.onResize = null;
  }
  if (state.onTabClick) {
    document.removeEventListener('click', state.onTabClick, true);
    state.onTabClick = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }
  if (state.resizeTimer) {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = null;
  }
  if (state.pager) {
    state.pager.destroy();
    state.pager = null;
  }
  if (state.settingsEl) {
    state.settingsEl.remove();
    state.settingsEl = null;
    state.settingsInput = null;
  }
  if (state.wrapEl) {
    state.wrapEl.remove();
    state.wrapEl = null;
    state.gridEl = null;
  }
  if (state.opusEl) state.opusEl.classList.remove(ACTIVE_CLASS);
  log.info('已停止（离开图文页或列表消失）');
  Object.assign(state, {
    active: false,
    adapter: null,
    page: 1,
    items: [],
    loaded: 0,
    lastLoaded: 0,
    hasMore: true,
    cw: 0,
    columns: 0,
    type: '',
    tab: '',
    busy: false,
    busyText: '',
    renderKey: '',
    feedEl: null,
    opusEl: null,
  });
}

function watchRoute() {
  const key = location.pathname;
  const changed = key !== state.routeKey;
  if (changed) {
    state.routeKey = key;
    if (state.active) teardown();
  }
  if (!isOpusRoute()) {
    if (state.active) teardown();
    return;
  }
  if (!state.active && !state.booting) {
    setTimeout(maybeBoot, changed ? 250 : 0);
  }
}

// ---------------------------------------------------------------------------
// 调试入口 / 入口
// ---------------------------------------------------------------------------
function exposeDebug() {
  window.BILI_TOOLS = window.BILI_TOOLS || {};
  window.BILI_TOOLS.opus = {
    version: VERSION,
    get active() {
      return state.active;
    },
    get state() {
      return {
        active: state.active,
        page: state.page,
        totalPages: state.hasMore ? null : totalPages(state.loaded, PAGE_SIZE),
        loaded: state.loaded,
        hasMore: state.hasMore,
        adapter: state.adapter ? state.adapter.kind : null,
        columnWidth: state.cw,
        columns: state.columns,
        tab: state.tab,
        busy: state.busy,
        compressImages: Boolean(state.settings.compressImages),
      };
    },
    goTo: (page) => goTo(page),
    next: () => goTo(state.page + 1),
    prev: () => goTo(state.page - 1),
    setCompressImages: (value) => setCompressImages(value),
    refresh: () => {
      if (state.active) refresh(true);
      else void boot();
    },
    teardown,
  };
}

function main() {
  startStyle();
  installCapture(onCapture);
  exposeDebug();
  window.addEventListener('popstate', watchRoute);
  window.addEventListener('hashchange', watchRoute);
  setInterval(watchRoute, 500);
  watchRoute();
}

const GLOBAL_KEY = '__biliToolsOpusLoaded__';
if (!window[GLOBAL_KEY]) {
  window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
  main();
} else {
  // 已经注入过：保留原实例的调试入口，不要用当前空状态覆盖
  log.debug('opus 脚本已注入，跳过重复初始化');
}

