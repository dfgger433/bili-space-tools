// 阶段 1：B站空间动态页翻页（每页 10 条）
// 思路：复用动态列表自身的 Vue 2 实例（vm.list / vm.loadmore），只做“显示哪 10 条”的本地分页；
//       vm 不可用时退化为纯 DOM 模式（滚到底触发原生加载）。
// 不新增任何 API 请求，不涉及 wbi/风控。

import { createLogger, waitFor, sleep } from '../shared/log.js';
import { observeNode, waitForElement, nextFrame } from '../shared/dom.js';
import { addStyle } from '../shared/style.js';
import { createPager } from '../shared/pager.js';
import { toast } from '../shared/toast.js';
import { pageDocument } from '../shared/page.js';

const VERSION = '0.2.1';
const SCOPE = 'dyn';
// 与 B 站动态列表每次自动加载的条数对齐（接口每页约 12 条），
// 这样滚到底触发的原生加载正好是“下一页”，下一页可以立即打开。
const PAGE_SIZE = 12;
const LIST_SELECTOR = '.bili-dyn-list';
const ITEMS_SELECTOR = '.bili-dyn-list__items';
const ITEM_SELECTOR = '.bili-dyn-list__item';
const STYLE_ID = 'bili-tools-dyn-style';
const ACTIVE_CLASS = 'bili-tools-dyn-active';
const PAGER_CLASS = 'bili-tools-dyn-pager';
const HEADER_OFFSET = 64;
const BOOT_TIMEOUT = 20000;
const LOAD_TIMEOUT = 20000;
const API_PAGE_SIZE = 12; // 动态列表接口每页约 12 条，仅用于跳页前的请求次数估算

const log = createLogger(SCOPE);
let running = false;
let mainTimer = null;
let bootTimer = null;

const state = {
  active: false,
  booting: false,
  page: 1,
  listEl: null,
  adapter: null,
  pager: null,
  busy: false,
  busyText: '',
  lastLoaded: 0,
  totalPages: null,
  routeKey: '',
  observer: null,
  navToken: 0,
  nextBootAt: 0,
};

// ---------------------------------------------------------------------------
// 样式：分页条定位 + 原生 vui 变量兜底；按钮/输入框外观完全复用 B 站原生 CSS
// ---------------------------------------------------------------------------
const CSS = `
.bili-tools-pager.bili-tools-dyn-pager{width:fit-content;margin:24px auto 8px;padding:0 8px}
.bili-tools-dyn-pager .vui_pagenation--btns{display:flex;align-items:center}
.bili-tools-dyn-pager .vui_pagenation--btn-side.vui_button--disabled,
.bili-tools-dyn-pager .vui_pagenation--btn-more.vui_button--disabled{display:none}
.bili-tools-dyn-pager .vui_pagenation-go__count{color:var(--text2,#61666d)}
.bili-tools-dyn-pager.is-busy .vui_pagenation--btn{pointer-events:none;opacity:.6}
.bili-tools-dyn-active .bili-dyn-list-no-more{display:none!important}
/* 原生加载条在分页模式下隐藏：滚到底的预取不应把分页条往下顶 */
.bili-tools-dyn-active .bili-dyn-list-loading{display:none!important}
`;

// ---------------------------------------------------------------------------
// 路由 / 启动
// ---------------------------------------------------------------------------
function isDynamicRoute() {
  return /^\/\d+\/dynamic(?:\/|$)/.test(location.pathname);
}

function startStyle() {
  addStyle(STYLE_ID, CSS);
}

function maybeBoot() {
  if (!running) return;
  if (state.active || state.booting) return;
  if (Date.now() < state.nextBootAt) return;
  state.nextBootAt = Date.now() + 3000;
  void boot();
}

async function boot() {
  if (!running) return;
  if (state.active || state.booting) return;
  if (!isDynamicRoute()) return;
  state.booting = true;
  try {
    startStyle();
    const listEl = await waitForElement(LIST_SELECTOR, { timeout: BOOT_TIMEOUT }).catch(() => null);
    if (!running) return;
    if (!listEl) {
      log.info('未找到动态列表，稍后重试');
      return;
    }
    const ready = await waitForData(listEl, 15000);
    if (!running) return;
    if (!ready) {
      log.info('动态列表为空（未登录 / 无内容），暂不启用');
      return;
    }
    activate(listEl);
  } catch (err) {
    log.warn('启动失败', err);
  } finally {
    state.booting = false;
    state.nextBootAt = Date.now() + 3000;
  }
}

async function waitForData(listEl, timeout) {
  const start = Date.now();
  for (;;) {
    const vm = getVm(listEl);
    const count = vm ? vm.list.length : listEl.querySelectorAll(ITEM_SELECTOR).length;
    if (count > 0) return true;
    if (Date.now() - start >= timeout) return false;
    await sleep(150);
  }
}

/** 找到动态列表的 Vue 2 实例（.bili-dyn-list 的 __vue__；沙箱下通过 pageDocument 访问） */
function getVm(listEl) {
  let doc = document;
  try {
    doc = pageDocument() || document;
  } catch {
    /* ignore */
  }
  const root = doc.querySelector(LIST_SELECTOR) || listEl;
  if (!root) return null;
  const read = (node) => {
    if (!node) return null;
    const el = node.wrappedJSObject || node;
    const vm = el.__vue__;
    return vm && Array.isArray(vm.list) ? vm : null;
  };
  const candidates = [root, root.querySelector(ITEMS_SELECTOR), root.parentElement];
  for (const el of candidates) {
    const vm = read(el);
    if (vm) return vm;
  }
  let node = root;
  while (node) {
    const vm = read(node);
    if (vm) return vm;
    node = node.parentElement;
  }
  return null;
}

function activate(listEl) {
  if (state.active) return;
  state.active = true;
  state.page = 1;
  state.lastLoaded = 0;
  state.listEl = listEl;
  state.adapter = buildAdapter(listEl);
  document.documentElement.classList.add(ACTIVE_CLASS);
  log.info('已启用', { adapter: state.adapter.kind, version: VERSION });
  bindObserver();
  ensurePager();
  applyPage();
  updatePager();
}

// ---------------------------------------------------------------------------
// 数据适配器
// ---------------------------------------------------------------------------
function buildAdapter(listEl) {
  const vm = getVm(listEl);
  if (vm && typeof vm.list.length === 'number') {
    const hasLoad = typeof vm.loadmore === 'function' || typeof vm._getList === 'function';
    if (hasLoad) return createVmAdapter(vm);
  }
  log.warn('未取得列表实例，使用纯 DOM 回退模式');
  return createDomAdapter(listEl);
}

function createVmAdapter(vm) {
  return {
    kind: 'vm',
    vm,
    getCount: () => (Array.isArray(vm.list) ? vm.list.length : 0),
    canLoad: () => {
      const status = vm.status;
      // ERROR / PAUSED 仍允许重试（交给分页按钮触发），只有明确没有更多/空列表才停止
      return status !== 'NO_MORE' && status !== 'EMPTY';
    },
    getLoading: () => vm.status === 'LOADING',
    getStatus: () => vm.status,
    async load() {
      if (typeof vm.loadmore === 'function') vm.loadmore();
      else if (typeof vm._getList === 'function') vm._getList('NEXT');
    },
    nextTick: () =>
      new Promise((resolve) => {
        try {
          vm.$nextTick(resolve);
        } catch {
          resolve();
        }
      }),
  };
}

/** 纯 DOM 回退：滚到底 + 派发 scroll，等待新条目出现 */
function createDomAdapter(listEl) {
  let inflight = false;
  let noMore = false;
  const count = () => listEl.querySelectorAll(ITEM_SELECTOR).length;
  return {
    kind: 'dom',
    getCount: count,
    canLoad: () => !noMore,
    getLoading: () => inflight,
    getStatus: () => (noMore ? 'NO_MORE' : ''),
    markNoMore() {
      noMore = true;
    },
    async load() {
      if (inflight) return;
      inflight = true;
      const before = count();
      const container = findScrollContainer(listEl);
      const isWindow =
        !container || container === document.scrollingElement || container === document.documentElement;
      const prev = isWindow ? window.scrollY : container.scrollTop;
      try {
        if (isWindow) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
        else container.scrollTop = container.scrollHeight;
        await sleep(80);
        const scrollTarget = isWindow ? window : container;
        scrollTarget.dispatchEvent(new Event('scroll'));
        await waitFor(() => count() > before || noMore, {
          timeout: 8000,
          interval: 150,
          label: 'dom-load-more',
        }).catch(() => {});
        if (count() <= before) {
          const noMoreEl = listEl.querySelector('.bili-dyn-list-no-more');
          if (noMoreEl && getComputedStyle(noMoreEl).display !== 'none') noMore = true;
        }
      } finally {
        if (isWindow) window.scrollTo({ top: prev, behavior: 'auto' });
        else container.scrollTop = prev;
        inflight = false;
      }
    },
  };
}

function findScrollContainer(el) {
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

// ---------------------------------------------------------------------------
// 分页渲染
// ---------------------------------------------------------------------------
function itemElements() {
  return state.listEl ? Array.from(state.listEl.querySelectorAll(ITEM_SELECTOR)) : [];
}

function applyPage() {
  if (!state.listEl) return;
  const items = itemElements();
  if (!items.length) return;
  const start = (state.page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  for (let i = 0; i < items.length; i += 1) {
    const el = items[i];
    if (i < start || i >= end) {
      if (el.style.display !== 'none') el.style.display = 'none';
    } else if (el.style.display === 'none') {
      el.style.removeProperty('display');
    }
  }
}

function getMountPoint() {
  const listEl = state.listEl;
  return (listEl && listEl.parentElement) || document.body;
}

function ensurePager() {
  if (!state.active || !state.listEl) return;
  if (!state.pager) {
    state.pager = createPager({
      className: PAGER_CLASS,
      onPage: (page) => {
        void goTo(page, { user: true });
      },
      onJump: (page) => {
        void goTo(page, { user: true });
      },
    });
  }
  const mount = getMountPoint();
  const pagerEl = state.pager.el;
  if (pagerEl.parentElement !== mount || pagerEl.previousElementSibling !== state.listEl) {
    mount.insertBefore(pagerEl, state.listEl.nextSibling);
  }
  updatePager();
}

function updatePager() {
  if (!state.pager || !state.adapter) return;
  const loaded = state.adapter.getCount();
  const hasMore = state.adapter.canLoad();
  const totalPages = !hasMore && loaded > 0 ? Math.max(1, Math.ceil(loaded / PAGE_SIZE)) : null;
  state.totalPages = totalPages;
  if (totalPages && state.page > totalPages) state.page = totalPages;
  state.lastLoaded = loaded;
  state.pager.update({
    page: state.page,
    totalPages,
    hasMore,
    loadedCount: loaded,
    totalCount: totalPages ? loaded : null,
    pageSize: PAGE_SIZE,
    busy: state.busy,
    busyText: state.busyText,
  });
}

function scrollToTop() {
  const listEl = state.listEl;
  if (!listEl) return;
  const container = findScrollContainer(listEl);
  if (container && container !== document.scrollingElement && container !== document.documentElement) {
    const rect = listEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const target = Math.max(0, container.scrollTop + (rect.top - containerRect.top) - HEADER_OFFSET);
    if (container.scrollTop > target + 4) container.scrollTop = target;
    return;
  }
  const top = Math.max(0, window.scrollY + listEl.getBoundingClientRect().top - HEADER_OFFSET);
  if (window.scrollY > top + 4) window.scrollTo({ top, behavior: 'auto' });
}

// ---------------------------------------------------------------------------
// 加载 & 翻页
// ---------------------------------------------------------------------------
async function ensureLoaded(adapter, need) {
  const start = Date.now();
  let noGrowth = 0;
  while (adapter.getCount() < need) {
    if (!adapter.canLoad()) break;
    if (adapter.getLoading && adapter.getLoading()) {
      if (Date.now() - start > LOAD_TIMEOUT) throw new Error('加载超时');
      await sleep(150);
      continue;
    }
    const before = adapter.getCount();
    await adapter.load();
    try {
      await waitFor(
        () => {
          if (adapter.getCount() > before) return true;
          if (!adapter.canLoad()) return true;
          // 失败/暂停时不必等满超时
          if (typeof adapter.getStatus === 'function') {
            const status = adapter.getStatus();
            if (status === 'ERROR' || status === 'PAUSED') return true;
          }
          return false;
        },
        {
          timeout: LOAD_TIMEOUT,
          interval: 150,
          label: 'load-more',
        },
      );
    } catch {
      throw new Error('加载超时');
    }
    if (adapter.nextTick) {
      try {
        await adapter.nextTick();
      } catch {
        /* ignore */
      }
    }
    await nextFrame();
    if (adapter.getCount() > before) {
      noGrowth = 0;
    } else {
      noGrowth += 1;
      if (noGrowth >= 3) {
        if (typeof adapter.markNoMore === 'function') adapter.markNoMore();
        break;
      }
    }
  }
}

function estimateRequests(loaded, target) {
  const missing = Math.max(0, target * PAGE_SIZE - loaded);
  return Math.ceil(missing / API_PAGE_SIZE);
}

async function goTo(page, { user = true } = {}) {
  if (!state.active || !state.adapter) return false;
  if (state.busy) return false;
  let target = Math.max(1, Math.floor(Number(page) || 1));
  const loadedBefore = state.adapter.getCount();
  if (state.totalPages && target > state.totalPages) target = state.totalPages;
  const need = target * PAGE_SIZE;
  const token = ++state.navToken;

  if (loadedBefore < need && state.adapter.canLoad()) {
    const requests = estimateRequests(loadedBefore, target);
    const pagesAhead = target - Math.max(1, Math.ceil(loadedBefore / PAGE_SIZE));
    if (pagesAhead > 6 && requests > 6) {
      const ok = window.confirm(
        `跳转到第 ${target} 页还需要加载约 ${requests} 次（当前已加载 ${loadedBefore} 条），继续吗？`,
      );
      if (!ok) return false;
    }
    state.busy = true;
    state.busyText = `正在加载第 ${target} 页（已加载 ${loadedBefore} 条）…`;
    updatePager();
    try {
      await ensureLoaded(state.adapter, need);
    } catch (err) {
      state.busy = false;
      updatePager();
      log.warn('加载失败', err);
      toast(`加载第 ${target} 页失败：${err.message}`, { type: 'error' });
      const loaded = state.adapter.getCount();
      if (loaded > 0) {
        const maxPage = Math.max(1, Math.ceil(loaded / PAGE_SIZE));
        state.page = Math.min(target, maxPage);
        applyPage();
        updatePager();
        if (user) scrollToTop();
      }
      return false;
    }
    if (token !== state.navToken) return false;
    state.busy = false;
  }

  const loaded = state.adapter.getCount();
  if (loaded > 0) {
    const maxPage = Math.max(1, Math.ceil(loaded / PAGE_SIZE));
    if (target > maxPage) {
      target = maxPage;
      toast(`没有更多内容了，已停在最后一页（第 ${maxPage} 页）`, { duration: 2600 });
    }
  }
  state.page = target;
  state.busy = false;
  state.busyText = '';
  applyPage();
  updatePager();
  if (user) scrollToTop();
  log.debug('goTo', target, { loaded, totalPages: state.totalPages });
  return true;
}

// ---------------------------------------------------------------------------
// 观察 & 生命周期
// ---------------------------------------------------------------------------
function isOurNode(node) {
  if (!node || node.nodeType !== 1) return false;
  if (typeof node.closest !== 'function') return false;
  return node.classList.contains('bili-tools-pager') || Boolean(node.closest('.bili-tools-pager'));
}

function observerTarget() {
  return (
    document.querySelector('.space-dynamic') ||
    (state.listEl && state.listEl.parentElement) ||
    document.body
  );
}

function bindObserver() {
  if (state.observer) return;
  const target = observerTarget();
  if (!target) return;
  state.observerTargetEl = target;
  state.observer = observeNode(
    target,
    (mutations) => {
      let relevant = false;
      let listChanged = false;
      for (const mutation of mutations) {
        // 忽略我们自己分页条内部的重绘（update 会重建按钮）
        if (isOurNode(mutation.target)) continue;
        if (mutation.type !== 'childList') continue;
        if (!mutation.addedNodes.length && !mutation.removedNodes.length) continue;
        relevant = true;
        // 列表条目有增删：立即套用可见性，避免自动加载的新条目闪一下 / 把分页条顶下去
        if (state.listEl && (mutation.target === state.listEl || state.listEl.contains(mutation.target))) {
          listChanged = true;
        }
      }
      if (listChanged) applyPage();
      if (relevant) scheduleRescan();
    },
    { childList: true, subtree: true },
  );
}

let rescanTimer = null;
function scheduleRescan() {
  if (rescanTimer) return;
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    rescan();
  }, 120);
}

function rescan() {
  if (!state.active) return;
  const listEl = document.querySelector(LIST_SELECTOR);
  if (!listEl) {
    teardown();
    return;
  }
  if (listEl !== state.listEl) {
    log.debug('列表节点变更，重新绑定');
    state.listEl = listEl;
    state.adapter = buildAdapter(listEl);
    state.page = 1;
    state.lastLoaded = 0;
    if (state.observer && state.observerTargetEl !== observerTarget()) {
      state.observer();
      state.observer = null;
      bindObserver();
    }
  }
  const loaded = state.adapter.getCount();
  if (loaded < state.lastLoaded && state.page > 1) {
    state.page = 1;
  }
  ensurePager();
  applyPage();
  updatePager();
}

function teardown() {
  if (rescanTimer) {
    clearTimeout(rescanTimer);
    rescanTimer = null;
  }
  if (state.observer) {
    state.observer();
    state.observer = null;
  }
  if (state.listEl) {
    for (const el of state.listEl.querySelectorAll(ITEM_SELECTOR)) {
      el.style.removeProperty('display');
    }
  }
  if (state.pager) {
    state.pager.destroy();
    state.pager = null;
  }
  document.documentElement.classList.remove(ACTIVE_CLASS);
  log.info('已停止（离开动态页或列表消失）');
  Object.assign(state, {
    active: false,
    page: 1,
    listEl: null,
    adapter: null,
    busy: false,
    busyText: '',
    lastLoaded: 0,
    totalPages: null,
    navToken: 0,
  });
}

function watchRoute() {
  const key = location.pathname;
  const changed = key !== state.routeKey;
  if (changed) {
    state.routeKey = key;
    if (state.active) teardown();
  }
  if (!isDynamicRoute()) {
    if (state.active) teardown();
    return;
  }
  if (!state.active && !state.booting) {
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = setTimeout(maybeBoot, changed ? 250 : 0);
  }
}

// ---------------------------------------------------------------------------
// 调试入口
// ---------------------------------------------------------------------------
function exposeDebug() {
  window.BILI_TOOLS = window.BILI_TOOLS || {};
  window.BILI_TOOLS.dyn = {
    version: VERSION,
    get active() {
      return state.active;
    },
    get page() {
      return state.page;
    },
    get totalPages() {
      return state.totalPages;
    },
    get adapter() {
      return state.adapter ? state.adapter.kind : null;
    },
    get state() {
      return {
        active: state.active,
        page: state.page,
        totalPages: state.totalPages,
        busy: state.busy,
        adapter: state.adapter ? state.adapter.kind : null,
        loaded: state.adapter ? state.adapter.getCount() : 0,
        hasMore: state.adapter ? state.adapter.canLoad() : false,
        status: state.adapter && state.adapter.getStatus ? state.adapter.getStatus() : '',
      };
    },
    goTo: (page) => goTo(page),
    next: () => goTo(state.page + 1),
    prev: () => goTo(state.page - 1),
    refresh: () => {
      if (!state.active) {
        void boot();
        return;
      }
      rescan();
      toast('已刷新分页状态', { duration: 1500 });
    },
    teardown,
  };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
function start() {
  if (running) return;
  running = true;
  window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
  startStyle();
  exposeDebug();
  window.addEventListener('popstate', watchRoute);
  window.addEventListener('hashchange', watchRoute);
  mainTimer = setInterval(watchRoute, 500);
  watchRoute();
}

function stop() {
  if (!running) return;
  running = false;
  if (mainTimer) {
    clearInterval(mainTimer);
    mainTimer = null;
  }
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  window.removeEventListener('popstate', watchRoute);
  window.removeEventListener('hashchange', watchRoute);
  teardown();
  state.booting = false;
  state.nextBootAt = 0;
  state.routeKey = '';
  delete window[GLOBAL_KEY];
  log.info('动态翻页脚本已停止');
}

export { start, stop, VERSION };

const GLOBAL_KEY = '__biliToolsDynLoaded__';
if (!__BILI_TOOLS_COMBINED__) {
  if (!window[GLOBAL_KEY]) {
    start();
  } else {
    // 已经注入过：保留原实例的调试入口，不要用当前空状态覆盖
    log.debug('动态脚本已注入，跳过重复初始化');
  }
}

