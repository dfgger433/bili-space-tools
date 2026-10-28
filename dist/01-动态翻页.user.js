/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站动态翻页（每页12条）
// @name:zh-CN   B站动态翻页（每页12条）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.2.1
// @description  把 B 站用户空间动态页改为翻页浏览，每页 12 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生分页样式。
// @description:zh-CN 把 B 站用户空间动态页改为翻页浏览，每页 12 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生分页样式。
// @author       bili-space-tools
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://*.bilibili.com/*/dynamic
// @match        *://*.bilibili.com/*/dynamic/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  // src/shared/log.js
  var NS = "bili-tools";
  var DEBUG_KEY = `${NS}:debug`;
  function debugEnabled() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function createLogger(scope) {
    const prefix = `[${NS}/${scope}]`;
    return {
      debug: (...args) => {
        if (debugEnabled()) console.log(prefix, ...args);
      },
      info: (...args) => console.info(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args)
    };
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function waitFor(predicate, { timeout = 15e3, interval = 100, label = "condition" } = {}) {
    const start = Date.now();
    for (; ; ) {
      let value;
      try {
        value = await predicate();
      } catch (err) {
        value = false;
      }
      if (value) return value;
      if (Date.now() - start >= timeout) {
        throw new Error(`waitFor timeout: ${label}`);
      }
      await sleep(interval);
    }
  }

  // src/shared/dom.js
  function create(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.text != null) el.textContent = String(options.text);
    if (options.html != null) el.innerHTML = options.html;
    if (options.attrs) {
      for (const [key, value] of Object.entries(options.attrs)) {
        if (value == null || value === false) continue;
        el.setAttribute(key, value === true ? "" : String(value));
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
  function observeNode(target, callback, options = { childList: true, subtree: true }) {
    if (!target) return () => {
    };
    const observer = new MutationObserver(callback);
    observer.observe(target, options);
    return () => observer.disconnect();
  }
  async function waitForElement(selector, { root = document, timeout = 15e3, interval = 100 } = {}) {
    const start = Date.now();
    for (; ; ) {
      const el = root.querySelector(selector);
      if (el) return el;
      if (Date.now() - start >= timeout) {
        throw new Error(`waitForElement timeout: ${selector}`);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  // src/shared/style.js
  function addStyle(id, css) {
    const existing = document.getElementById(id);
    if (existing) {
      existing.textContent = css;
      return existing;
    }
    const style = document.createElement("style");
    style.id = id;
    style.type = "text/css";
    style.textContent = css;
    const attach = () => {
      const root = document.head || document.documentElement;
      if (!root) return false;
      if (!style.isConnected) root.appendChild(style);
      return true;
    };
    if (!attach()) {
      const timer = setInterval(() => {
        if (attach()) clearInterval(timer);
      }, 10);
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          if (attach()) clearInterval(timer);
        },
        { once: true }
      );
    }
    return style;
  }

  // src/shared/pager.js
  var DEFAULT_LABELS = {
    prev: "上一页",
    next: "下一页",
    pageUnit: "页",
    jumpTo: "跳至",
    loading: "加载中…"
  };
  var BASE_BTN = "vui_button vui_pagenation--btn";
  var NUM_BTN = `${BASE_BTN} vui_pagenation--btn-num`;
  var MORE_BTN = `${BASE_BTN} vui_pagenation--btn-more`;
  var SIDE_BTN = `${BASE_BTN} vui_pagenation--btn-side`;
  var NO_TRANSITION = "vui_button--no-transition";
  var ACTIVE_CLASSES = "vui_button--active vui_button--active-blue";
  function computePagerModel(input = {}) {
    const pageSize = Math.max(1, Math.floor(Number(input.pageSize) || 10));
    const loadedCount = Math.max(0, Math.floor(Number(input.loadedCount) || 0));
    const totalPagesRaw = Number(input.totalPages);
    const totalPages = Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? Math.floor(totalPagesRaw) : null;
    const hasMore = Boolean(input.hasMore);
    const known = totalPages != null;
    const rawPage = Math.max(1, Math.floor(Number(input.page) || 1));
    const page = known ? Math.min(rawPage, totalPages) : rawPage;
    const prevDisabled = page <= 1;
    const nextDisabled = known ? page >= totalPages : !hasMore;
    const items = [];
    let activePage = page;
    const pushNum = (n) => items.push({ type: "page", page: n, active: n === activePage });
    const pushMore = (delta, disabled = false) => items.push({ type: "more", delta, disabled });
    const pushEllipsis = () => items.push({ type: "ellipsis" });
    if (known) {
      if (totalPages <= 9) {
        for (let n = 1; n <= totalPages; n += 1) pushNum(n);
      } else {
        const showFirstBlock = page > 5;
        const showLastBlock = totalPages - page > 4;
        let start;
        let end;
        if (page <= 5) {
          start = 1;
          end = 7;
        } else if (totalPages - page > 4) {
          start = page - 2;
          end = page + 2;
        } else {
          start = totalPages - 6;
          end = totalPages;
        }
        if (showFirstBlock) {
          pushNum(1);
          pushMore(-5, page - 5 < 1);
        }
        for (let n = start; n <= end; n += 1) pushNum(n);
        if (showLastBlock) {
          pushMore(5, page + 5 > totalPages);
          pushNum(totalPages);
        }
      }
    } else {
      const maxKnownPage = hasMore ? Number.POSITIVE_INFINITY : Math.max(1, Math.ceil(loadedCount / pageSize));
      const current = Math.min(page, maxKnownPage);
      activePage = current;
      const start = Math.max(1, current - 2);
      const end = Math.min(current + 2, maxKnownPage);
      if (start > 1) {
        pushNum(1);
        if (start > 2) pushEllipsis();
      }
      for (let n = start; n <= end; n += 1) pushNum(n);
      if (hasMore) pushMore(5, false);
    }
    return {
      page: activePage,
      pageSize,
      loadedCount,
      totalPages,
      hasMore,
      known,
      prevDisabled,
      nextDisabled,
      jumpEnabled: known || hasMore,
      items,
      /** 末页时返回总页数，否则 null */
      settledTotalPages: known && !hasMore ? totalPages : known ? totalPages : null
    };
  }
  function formatPagerCount({ page, totalPages, loadedCount, totalCount, pageSize, labels = DEFAULT_LABELS }) {
    if (totalPages != null) {
      const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : loadedCount;
      return `共 ${totalPages} 页 / ${total} 个，${labels.jumpTo}`;
    }
    return `第 ${page} 页 · 已加载 ${loadedCount} 个，${labels.jumpTo}`;
  }
  function createPager(options = {}) {
    const labels = { ...DEFAULT_LABELS, ...options.labels || {} };
    const onPage = typeof options.onPage === "function" ? options.onPage : () => {
    };
    const onJump = typeof options.onJump === "function" ? options.onJump : onPage;
    const root = create("div", {
      className: `vui_pagenation vui_pagenation--jump bili-tools-pager ${options.className || ""}`.trim(),
      attrs: { role: "navigation", "aria-label": "分页" }
    });
    const btns = create("div", { className: "vui_pagenation--btns" });
    const go = create("div", { className: "vui_pagenation-go" });
    const count = create("span", { className: "vui_pagenation-go__count" });
    const inputWrapOuter = create("div", { className: "vui_input", attrs: { "aria-label": "输入要跳转的页码" } });
    const inputWrap = create("div", { className: "vui_input-wrapper" });
    const input = create("input", {
      attrs: {
        type: "number",
        min: "1",
        "aria-label": "输入要跳转的页码"
      },
      className: "vui_input__input vui_input__input-resizable"
    });
    const unit = create("span", { className: "vui_pagenation-go__page", text: labels.pageUnit });
    inputWrap.appendChild(input);
    inputWrapOuter.appendChild(inputWrap);
    go.appendChild(count);
    go.appendChild(inputWrapOuter);
    go.appendChild(unit);
    root.appendChild(btns);
    root.appendChild(go);
    let state2 = {
      page: 1,
      totalPages: null,
      hasMore: true,
      loadedCount: 0,
      totalCount: null,
      pageSize: 10,
      busy: false,
      busyText: ""
    };
    let destroyed = false;
    let lastSignature = "";
    let lastRenderedPage = 0;
    function emitPage(page) {
      if (!page || page < 1) return;
      if (Number.isFinite(state2.totalPages) && state2.totalPages > 0) {
        page = Math.min(page, state2.totalPages);
      }
      if (page === state2.page) return;
      onPage(page);
    }
    function renderSideButtons() {
      const prev = create("button", {
        className: SIDE_BTN,
        text: labels.prev,
        attrs: {
          type: "button",
          "aria-label": labels.prev,
          disabled: state2.prevDisabled ? "" : null
        },
        on: {
          click: (event) => {
            event.preventDefault();
            emitPage(state2.page - 1);
          }
        }
      });
      const next = create("button", {
        className: SIDE_BTN,
        text: labels.next,
        attrs: {
          type: "button",
          "aria-label": labels.next,
          disabled: state2.nextDisabled ? "" : null
        },
        on: {
          click: (event) => {
            event.preventDefault();
            emitPage(state2.page + 1);
          }
        }
      });
      if (state2.prevDisabled) prev.classList.add("vui_button--disabled");
      if (state2.nextDisabled) next.classList.add("vui_button--disabled");
      return { prev, next };
    }
    function renderItems() {
      const model = computePagerModel(state2);
      const { prev, next } = renderSideButtons();
      const nodes = [prev];
      for (const item of model.items) {
        if (item.type === "page") {
          const btn = create("button", {
            className: `${NUM_BTN} ${NO_TRANSITION}${item.active ? ` ${ACTIVE_CLASSES}` : ""}`.trim(),
            text: item.page,
            attrs: {
              type: "button",
              "aria-label": item.active ? `第 ${item.page} 页，当前页` : `第 ${item.page} 页`,
              "aria-current": item.active ? "page" : null
            },
            on: {
              click: (event) => {
                event.preventDefault();
                emitPage(item.page);
              }
            }
          });
          nodes.push(btn);
        } else if (item.type === "more") {
          const btn = create("button", {
            className: `${MORE_BTN} ${NO_TRANSITION}`,
            text: "...",
            attrs: {
              type: "button",
              "aria-label": item.delta > 0 ? `向后 ${item.delta} 页` : `向前 ${-item.delta} 页`,
              disabled: item.disabled ? "" : null
            },
            on: {
              click: (event) => {
                event.preventDefault();
                emitPage(state2.page + item.delta);
              }
            }
          });
          if (item.disabled) btn.classList.add("vui_button--disabled");
          nodes.push(btn);
        } else {
          nodes.push(create("span", { className: "vui_pagenation--extend", text: "...", attrs: { "aria-hidden": "true" } }));
        }
      }
      nodes.push(next);
      btns.replaceChildren(...nodes);
    }
    function update(nextState = {}) {
      if (destroyed) return;
      state2 = { ...state2, ...nextState };
      const model = computePagerModel(state2);
      state2.prevDisabled = model.prevDisabled;
      state2.nextDisabled = model.nextDisabled;
      state2.items = model.items;
      state2.totalPages = model.totalPages;
      const signature = JSON.stringify({
        page: model.page,
        totalPages: model.totalPages,
        items: model.items,
        loadedCount: state2.loadedCount,
        totalCount: state2.totalCount,
        busy: Boolean(state2.busy),
        busyText: state2.busyText || "",
        jumpEnabled: model.jumpEnabled
      });
      if (signature === lastSignature) return model;
      lastSignature = signature;
      if (model.page !== lastRenderedPage) {
        lastRenderedPage = model.page;
        input.value = "";
      }
      renderItems();
      const busyText = state2.busy ? state2.busyText || labels.loading : "";
      count.textContent = busyText || formatPagerCount({
        page: state2.page,
        totalPages: model.totalPages,
        loadedCount: state2.loadedCount,
        totalCount: state2.totalCount,
        pageSize: state2.pageSize,
        labels
      });
      input.disabled = !model.jumpEnabled || state2.busy;
      root.classList.toggle("is-busy", Boolean(state2.busy));
      root.classList.toggle("is-empty", !model.jumpEnabled && model.items.length === 0);
      return model;
    }
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.keyCode !== 13) return;
      event.preventDefault();
      const value = Math.floor(Number(input.value));
      input.value = "";
      if (!Number.isFinite(value) || value < 1) return;
      if (Number.isFinite(state2.totalPages) && state2.totalPages > 0 && value > state2.totalPages) {
        onJump(state2.totalPages);
        return;
      }
      onJump(value);
    });
    return {
      el: root,
      update,
      /** 只更新 busy 状态，不改变其它字段 */
      setBusy(busy, text = "") {
        return update({ busy: Boolean(busy), busyText: text });
      },
      getState: () => ({ ...state2 }),
      destroy() {
        destroyed = true;
        root.remove();
      }
    };
  }

  // src/shared/toast.js
  var STYLE_ID = "bili-tools-toast-style";
  var CSS = `
.bili-tools-toast-layer{position:fixed;top:76px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.bili-tools-toast{pointer-events:none;max-width:80vw;padding:9px 16px;border-radius:8px;font-size:14px;line-height:22px;
  color:var(--text1,#18191c);background:var(--bg1,#fff);border:1px solid var(--line_regular,#e3e5e7);
  box-shadow:0 4px 16px rgba(0,0,0,.12);opacity:0;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease}
.bili-tools-toast.show{opacity:1;transform:translateY(0)}
.bili-tools-toast--error{color:var(--stress_red,#f85a54)}
.bili-tools-toast--progress{color:var(--brand_blue,#00aeec)}
`;
  function layer() {
    let el = document.querySelector(".bili-tools-toast-layer");
    if (!el) {
      el = create("div", { className: "bili-tools-toast-layer" });
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(message, { type = "info", duration = 3200 } = {}) {
    addStyle(STYLE_ID, CSS);
    const root = layer();
    const el = create("div", {
      className: `bili-tools-toast bili-tools-toast--${type}`,
      text: message
    });
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    let timer = null;
    const close = () => {
      if (timer) clearTimeout(timer);
      el.classList.remove("show");
      setTimeout(() => el.remove(), 220);
    };
    if (duration > 0) timer = setTimeout(close, duration);
    return {
      close,
      setText(text) {
        el.textContent = text;
      },
      setType(nextType) {
        el.className = `bili-tools-toast bili-tools-toast--${nextType} show`;
      }
    };
  }

  // src/scripts/dyn-pagination.js
  var VERSION = "0.2.1";
  var SCOPE = "dyn";
  var PAGE_SIZE = 12;
  var LIST_SELECTOR = ".bili-dyn-list";
  var ITEMS_SELECTOR = ".bili-dyn-list__items";
  var ITEM_SELECTOR = ".bili-dyn-list__item";
  var STYLE_ID2 = "bili-tools-dyn-style";
  var ACTIVE_CLASS = "bili-tools-dyn-active";
  var PAGER_CLASS = "bili-tools-dyn-pager";
  var HEADER_OFFSET = 64;
  var BOOT_TIMEOUT = 2e4;
  var LOAD_TIMEOUT = 2e4;
  var API_PAGE_SIZE = 12;
  var log = createLogger(SCOPE);
  var state = {
    active: false,
    booting: false,
    page: 1,
    listEl: null,
    adapter: null,
    pager: null,
    busy: false,
    busyText: "",
    lastLoaded: 0,
    totalPages: null,
    routeKey: "",
    observer: null,
    navToken: 0,
    nextBootAt: 0
  };
  var CSS2 = `
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
  function isDynamicRoute() {
    return /^\/\d+\/dynamic(?:\/|$)/.test(location.pathname);
  }
  function startStyle() {
    addStyle(STYLE_ID2, CSS2);
  }
  function maybeBoot() {
    if (state.active || state.booting) return;
    if (Date.now() < state.nextBootAt) return;
    state.nextBootAt = Date.now() + 3e3;
    void boot();
  }
  async function boot() {
    if (state.active || state.booting) return;
    if (!isDynamicRoute()) return;
    state.booting = true;
    try {
      startStyle();
      const listEl = await waitForElement(LIST_SELECTOR, { timeout: BOOT_TIMEOUT }).catch(() => null);
      if (!listEl) {
        log.info("未找到动态列表，稍后重试");
        return;
      }
      const ready = await waitForData(listEl, 15e3);
      if (!ready) {
        log.info("动态列表为空（未登录 / 无内容），暂不启用");
        return;
      }
      activate(listEl);
    } catch (err) {
      log.warn("启动失败", err);
    } finally {
      state.booting = false;
      state.nextBootAt = Date.now() + 3e3;
    }
  }
  async function waitForData(listEl, timeout) {
    const start = Date.now();
    for (; ; ) {
      const vm = getVm(listEl);
      const count = vm ? vm.list.length : listEl.querySelectorAll(ITEM_SELECTOR).length;
      if (count > 0) return true;
      if (Date.now() - start >= timeout) return false;
      await sleep(150);
    }
  }
  function getVm(listEl) {
    if (!listEl) return null;
    const candidates = [listEl, listEl.querySelector(ITEMS_SELECTOR), listEl.parentElement];
    for (const el of candidates) {
      if (el && el.__vue__ && Array.isArray(el.__vue__.list)) return el.__vue__;
    }
    let node = listEl;
    while (node) {
      if (node.__vue__ && Array.isArray(node.__vue__.list)) return node.__vue__;
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
    log.info("已启用", { adapter: state.adapter.kind, version: VERSION });
    bindObserver();
    ensurePager();
    applyPage();
    updatePager();
  }
  function buildAdapter(listEl) {
    const vm = getVm(listEl);
    if (vm && typeof vm.list.length === "number") {
      const hasLoad = typeof vm.loadmore === "function" || typeof vm._getList === "function";
      if (hasLoad) return createVmAdapter(vm);
    }
    log.warn("未取得列表实例，使用纯 DOM 回退模式");
    return createDomAdapter(listEl);
  }
  function createVmAdapter(vm) {
    return {
      kind: "vm",
      vm,
      getCount: () => Array.isArray(vm.list) ? vm.list.length : 0,
      canLoad: () => {
        const status = vm.status;
        return status !== "NO_MORE" && status !== "EMPTY";
      },
      getLoading: () => vm.status === "LOADING",
      getStatus: () => vm.status,
      async load() {
        if (typeof vm.loadmore === "function") vm.loadmore();
        else if (typeof vm._getList === "function") vm._getList("NEXT");
      },
      nextTick: () => new Promise((resolve) => {
        try {
          vm.$nextTick(resolve);
        } catch {
          resolve();
        }
      })
    };
  }
  function createDomAdapter(listEl) {
    let inflight = false;
    let noMore = false;
    const count = () => listEl.querySelectorAll(ITEM_SELECTOR).length;
    return {
      kind: "dom",
      getCount: count,
      canLoad: () => !noMore,
      getLoading: () => inflight,
      getStatus: () => noMore ? "NO_MORE" : "",
      markNoMore() {
        noMore = true;
      },
      async load() {
        if (inflight) return;
        inflight = true;
        const before = count();
        const container = findScrollContainer(listEl);
        const isWindow = !container || container === document.scrollingElement || container === document.documentElement;
        const prev = isWindow ? window.scrollY : container.scrollTop;
        try {
          if (isWindow) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
          else container.scrollTop = container.scrollHeight;
          await sleep(80);
          const scrollTarget = isWindow ? window : container;
          scrollTarget.dispatchEvent(new Event("scroll"));
          await waitFor(() => count() > before || noMore, {
            timeout: 8e3,
            interval: 150,
            label: "dom-load-more"
          }).catch(() => {
          });
          if (count() <= before) {
            const noMoreEl = listEl.querySelector(".bili-dyn-list-no-more");
            if (noMoreEl && getComputedStyle(noMoreEl).display !== "none") noMore = true;
          }
        } finally {
          if (isWindow) window.scrollTo({ top: prev, behavior: "auto" });
          else container.scrollTop = prev;
          inflight = false;
        }
      }
    };
  }
  function findScrollContainer(el) {
    let node = el && el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
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
        if (el.style.display !== "none") el.style.display = "none";
      } else if (el.style.display === "none") {
        el.style.removeProperty("display");
      }
    }
  }
  function getMountPoint() {
    const listEl = state.listEl;
    return listEl && listEl.parentElement || document.body;
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
        }
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
      busyText: state.busyText
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
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: "auto" });
  }
  async function ensureLoaded(adapter, need) {
    const start = Date.now();
    let noGrowth = 0;
    while (adapter.getCount() < need) {
      if (!adapter.canLoad()) break;
      if (adapter.getLoading && adapter.getLoading()) {
        if (Date.now() - start > LOAD_TIMEOUT) throw new Error("加载超时");
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
            if (typeof adapter.getStatus === "function") {
              const status = adapter.getStatus();
              if (status === "ERROR" || status === "PAUSED") return true;
            }
            return false;
          },
          {
            timeout: LOAD_TIMEOUT,
            interval: 150,
            label: "load-more"
          }
        );
      } catch {
        throw new Error("加载超时");
      }
      if (adapter.nextTick) {
        try {
          await adapter.nextTick();
        } catch {
        }
      }
      await nextFrame();
      if (adapter.getCount() > before) {
        noGrowth = 0;
      } else {
        noGrowth += 1;
        if (noGrowth >= 3) {
          if (typeof adapter.markNoMore === "function") adapter.markNoMore();
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
          `跳转到第 ${target} 页还需要加载约 ${requests} 次（当前已加载 ${loadedBefore} 条），继续吗？`
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
        log.warn("加载失败", err);
        toast(`加载第 ${target} 页失败：${err.message}`, { type: "error" });
        const loaded2 = state.adapter.getCount();
        if (loaded2 > 0) {
          const maxPage = Math.max(1, Math.ceil(loaded2 / PAGE_SIZE));
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
    state.busyText = "";
    applyPage();
    updatePager();
    if (user) scrollToTop();
    log.debug("goTo", target, { loaded, totalPages: state.totalPages });
    return true;
  }
  function isOurNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (typeof node.closest !== "function") return false;
    return node.classList.contains("bili-tools-pager") || Boolean(node.closest(".bili-tools-pager"));
  }
  function observerTarget() {
    return document.querySelector(".space-dynamic") || state.listEl && state.listEl.parentElement || document.body;
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
          if (isOurNode(mutation.target)) continue;
          if (mutation.type !== "childList") continue;
          if (!mutation.addedNodes.length && !mutation.removedNodes.length) continue;
          relevant = true;
          if (state.listEl && (mutation.target === state.listEl || state.listEl.contains(mutation.target))) {
            listChanged = true;
          }
        }
        if (listChanged) applyPage();
        if (relevant) scheduleRescan();
      },
      { childList: true, subtree: true }
    );
  }
  var rescanTimer = null;
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
      log.debug("列表节点变更，重新绑定");
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
        el.style.removeProperty("display");
      }
    }
    if (state.pager) {
      state.pager.destroy();
      state.pager = null;
    }
    document.documentElement.classList.remove(ACTIVE_CLASS);
    log.info("已停止（离开动态页或列表消失）");
    Object.assign(state, {
      active: false,
      page: 1,
      listEl: null,
      adapter: null,
      busy: false,
      busyText: "",
      lastLoaded: 0,
      totalPages: null,
      navToken: 0
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
      setTimeout(maybeBoot, changed ? 250 : 0);
    }
  }
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
          status: state.adapter && state.adapter.getStatus ? state.adapter.getStatus() : ""
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
        toast("已刷新分页状态", { duration: 1500 });
      },
      teardown
    };
  }
  function main() {
    startStyle();
    exposeDebug();
    window.addEventListener("popstate", watchRoute);
    window.addEventListener("hashchange", watchRoute);
    setInterval(watchRoute, 500);
    watchRoute();
  }
  var GLOBAL_KEY = "__biliToolsDynLoaded__";
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
    main();
  } else {
    log.debug("动态脚本已注入，跳过重复初始化");
  }
})();
