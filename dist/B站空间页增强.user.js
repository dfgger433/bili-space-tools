/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站空间页增强（动态翻页/图文翻页/统一行高）
// @name:zh-CN   B站空间页增强（动态翻页/图文翻页/统一行高）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      1.0.0
// @description  单个脚本包含动态翻页、图文翻页、图文统一行高三个模块；油猴菜单里可分别开关三个模块，并保留图片压缩开关。
// @description:zh-CN 单个脚本包含动态翻页、图文翻页、图文统一行高三个模块；油猴菜单里可分别开关三个模块，并保留图片压缩开关。
// @author       bili-space-tools
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://*.bilibili.com/*/dynamic
// @match        *://*.bilibili.com/*/dynamic/*
// @match        *://*.bilibili.com/*/upload/opus
// @match        *://*.bilibili.com/*/upload/opus/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
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
    const start5 = Date.now();
    for (; ; ) {
      let value;
      try {
        value = await predicate();
      } catch (err) {
        value = false;
      }
      if (value) return value;
      if (Date.now() - start5 >= timeout) {
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
    const start5 = Date.now();
    for (; ; ) {
      const el = root.querySelector(selector);
      if (el) return el;
      if (Date.now() - start5 >= timeout) {
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
    const totalPages2 = Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? Math.floor(totalPagesRaw) : null;
    const hasMore = Boolean(input.hasMore);
    const known = totalPages2 != null;
    const rawPage = Math.max(1, Math.floor(Number(input.page) || 1));
    const page = known ? Math.min(rawPage, totalPages2) : rawPage;
    const prevDisabled = page <= 1;
    const nextDisabled = known ? page >= totalPages2 : !hasMore;
    const items = [];
    let activePage = page;
    const pushNum = (n) => items.push({ type: "page", page: n, active: n === activePage });
    const pushMore = (delta, disabled = false) => items.push({ type: "more", delta, disabled });
    const pushEllipsis = () => items.push({ type: "ellipsis" });
    if (known) {
      if (totalPages2 <= 9) {
        for (let n = 1; n <= totalPages2; n += 1) pushNum(n);
      } else {
        const showFirstBlock = page > 5;
        const showLastBlock = totalPages2 - page > 4;
        let start5;
        let end;
        if (page <= 5) {
          start5 = 1;
          end = 7;
        } else if (totalPages2 - page > 4) {
          start5 = page - 2;
          end = page + 2;
        } else {
          start5 = totalPages2 - 6;
          end = totalPages2;
        }
        if (showFirstBlock) {
          pushNum(1);
          pushMore(-5, page - 5 < 1);
        }
        for (let n = start5; n <= end; n += 1) pushNum(n);
        if (showLastBlock) {
          pushMore(5, page + 5 > totalPages2);
          pushNum(totalPages2);
        }
      }
    } else {
      const maxKnownPage = hasMore ? Number.POSITIVE_INFINITY : Math.max(1, Math.ceil(loadedCount / pageSize));
      const current = Math.min(page, maxKnownPage);
      activePage = current;
      const start5 = Math.max(1, current - 2);
      const end = Math.min(current + 2, maxKnownPage);
      if (start5 > 1) {
        pushNum(1);
        if (start5 > 2) pushEllipsis();
      }
      for (let n = start5; n <= end; n += 1) pushNum(n);
      if (hasMore) pushMore(5, false);
    }
    return {
      page: activePage,
      pageSize,
      loadedCount,
      totalPages: totalPages2,
      hasMore,
      known,
      prevDisabled,
      nextDisabled,
      jumpEnabled: known || hasMore,
      items,
      /** 末页时返回总页数，否则 null */
      settledTotalPages: known && !hasMore ? totalPages2 : known ? totalPages2 : null
    };
  }
  function formatPagerCount({ page, totalPages: totalPages2, loadedCount, totalCount, pageSize, labels = DEFAULT_LABELS }) {
    if (totalPages2 != null) {
      const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : loadedCount;
      return `共 ${totalPages2} 页 / ${total} 个，${labels.jumpTo}`;
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
    let state5 = {
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
      if (Number.isFinite(state5.totalPages) && state5.totalPages > 0) {
        page = Math.min(page, state5.totalPages);
      }
      if (page === state5.page) return;
      onPage(page);
    }
    function renderSideButtons() {
      const prev = create("button", {
        className: SIDE_BTN,
        text: labels.prev,
        attrs: {
          type: "button",
          "aria-label": labels.prev,
          disabled: state5.prevDisabled ? "" : null
        },
        on: {
          click: (event) => {
            event.preventDefault();
            emitPage(state5.page - 1);
          }
        }
      });
      const next = create("button", {
        className: SIDE_BTN,
        text: labels.next,
        attrs: {
          type: "button",
          "aria-label": labels.next,
          disabled: state5.nextDisabled ? "" : null
        },
        on: {
          click: (event) => {
            event.preventDefault();
            emitPage(state5.page + 1);
          }
        }
      });
      if (state5.prevDisabled) prev.classList.add("vui_button--disabled");
      if (state5.nextDisabled) next.classList.add("vui_button--disabled");
      return { prev, next };
    }
    function renderItems() {
      const model = computePagerModel(state5);
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
                emitPage(state5.page + item.delta);
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
      state5 = { ...state5, ...nextState };
      const model = computePagerModel(state5);
      state5.prevDisabled = model.prevDisabled;
      state5.nextDisabled = model.nextDisabled;
      state5.items = model.items;
      state5.totalPages = model.totalPages;
      const signature = JSON.stringify({
        page: model.page,
        totalPages: model.totalPages,
        items: model.items,
        loadedCount: state5.loadedCount,
        totalCount: state5.totalCount,
        busy: Boolean(state5.busy),
        busyText: state5.busyText || "",
        jumpEnabled: model.jumpEnabled
      });
      if (signature === lastSignature) return model;
      lastSignature = signature;
      if (model.page !== lastRenderedPage) {
        lastRenderedPage = model.page;
        input.value = "";
      }
      renderItems();
      const busyText = state5.busy ? state5.busyText || labels.loading : "";
      count.textContent = busyText || formatPagerCount({
        page: state5.page,
        totalPages: model.totalPages,
        loadedCount: state5.loadedCount,
        totalCount: state5.totalCount,
        pageSize: state5.pageSize,
        labels
      });
      input.disabled = !model.jumpEnabled || state5.busy;
      root.classList.toggle("is-busy", Boolean(state5.busy));
      root.classList.toggle("is-empty", !model.jumpEnabled && model.items.length === 0);
      return model;
    }
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.keyCode !== 13) return;
      event.preventDefault();
      const value = Math.floor(Number(input.value));
      input.value = "";
      if (!Number.isFinite(value) || value < 1) return;
      if (Number.isFinite(state5.totalPages) && state5.totalPages > 0 && value > state5.totalPages) {
        onJump(state5.totalPages);
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
      getState: () => ({ ...state5 }),
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

  // src/shared/page.js
  function pageWindow() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow) return unsafeWindow;
    } catch {
    }
    return window;
  }
  function pageDocument() {
    try {
      const win = pageWindow();
      if (win && win.document) return win.document;
    } catch {
    }
    return document;
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
  var running = false;
  var mainTimer = null;
  var bootTimer = null;
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
    if (!running) return;
    if (state.active || state.booting) return;
    if (Date.now() < state.nextBootAt) return;
    state.nextBootAt = Date.now() + 3e3;
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
        log.info("未找到动态列表，稍后重试");
        return;
      }
      const ready = await waitForData(listEl, 15e3);
      if (!running) return;
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
    const start5 = Date.now();
    for (; ; ) {
      const vm = getVm(listEl);
      const count = vm ? vm.list.length : listEl.querySelectorAll(ITEM_SELECTOR).length;
      if (count > 0) return true;
      if (Date.now() - start5 >= timeout) return false;
      await sleep(150);
    }
  }
  function getVm(listEl) {
    let doc = document;
    try {
      doc = pageDocument() || document;
    } catch {
    }
    const root = doc.querySelector(LIST_SELECTOR) || listEl;
    if (!root) return null;
    const read = (node2) => {
      if (!node2) return null;
      const el = node2.wrappedJSObject || node2;
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
    const start5 = (state.page - 1) * PAGE_SIZE;
    const end = start5 + PAGE_SIZE;
    for (let i = 0; i < items.length; i += 1) {
      const el = items[i];
      if (i < start5 || i >= end) {
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
    const totalPages2 = !hasMore && loaded > 0 ? Math.max(1, Math.ceil(loaded / PAGE_SIZE)) : null;
    state.totalPages = totalPages2;
    if (totalPages2 && state.page > totalPages2) state.page = totalPages2;
    state.lastLoaded = loaded;
    state.pager.update({
      page: state.page,
      totalPages: totalPages2,
      hasMore,
      loadedCount: loaded,
      totalCount: totalPages2 ? loaded : null,
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
    const start5 = Date.now();
    let noGrowth = 0;
    while (adapter.getCount() < need) {
      if (!adapter.canLoad()) break;
      if (adapter.getLoading && adapter.getLoading()) {
        if (Date.now() - start5 > LOAD_TIMEOUT) throw new Error("加载超时");
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
      if (bootTimer) clearTimeout(bootTimer);
      bootTimer = setTimeout(maybeBoot, changed ? 250 : 0);
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
  function start() {
    if (running) return;
    running = true;
    window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
    startStyle();
    exposeDebug();
    window.addEventListener("popstate", watchRoute);
    window.addEventListener("hashchange", watchRoute);
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
    window.removeEventListener("popstate", watchRoute);
    window.removeEventListener("hashchange", watchRoute);
    teardown();
    state.booting = false;
    state.nextBootAt = 0;
    state.routeKey = "";
    delete window[GLOBAL_KEY];
    log.info("动态翻页脚本已停止");
  }
  var GLOBAL_KEY = "__biliToolsDynLoaded__";
  if (false) {
    if (!window[GLOBAL_KEY]) {
      start();
    } else {
      log.debug("动态脚本已注入，跳过重复初始化");
    }
  }

  // src/opus/model.js
  var PAGE_SIZE2 = 20;
  var DEFAULT_ROW_GUTTER = 18;
  var DEFAULT_COLUMN_GUTTER = 20;
  var THRESHOLD_OF_WATERFALL = 10;
  var COVER_THUMB_WIDTH = 640;
  function normalizeUrl(url) {
    if (!url) return "";
    const value = String(url);
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("http://")) return `https://${value.slice(7)}`;
    return value;
  }
  function coverThumbUrl(url, width = COVER_THUMB_WIDTH) {
    const value = normalizeUrl(url);
    if (!value || !/^https?:\/\//i.test(value)) return value;
    if (value.includes("@")) return value;
    const w = Math.max(160, Math.round(Number(width) || COVER_THUMB_WIDTH));
    return `${value}@${w}w.webp`;
  }
  function coverDisplaySrc(cover, compress = true) {
    if (!cover) return "";
    if (compress) return cover.thumbSrc || coverThumbUrl(cover.src);
    return cover.src || "";
  }
  function normalizeHref(url) {
    return normalizeUrl(url) || "javascript:void(0)";
  }
  function estimateTextHeight({ str, lineWeight, maxHeight, fontSize = 14, lineHeight = 17 }) {
    const text = str || "";
    const h = Math.ceil(text.length * fontSize / Math.max(1, lineWeight)) * lineHeight;
    return h > maxHeight ? maxHeight : h;
  }
  function computeNaturalSize(view, columnWidth) {
    const cover = view && view.cover;
    let coverHeight = 0;
    if (cover && Number(cover.width) > 0 && Number(cover.height) > 0) {
      const portrait = Number(cover.width) / Number(cover.height) <= 3 / 4;
      coverHeight = portrait ? columnWidth / 160 * 210 : columnWidth / 160 * 120;
      if (columnWidth < 168) coverHeight *= 16 / 19;
    }
    const textHeight = estimateTextHeight({
      str: view && view.content,
      lineWeight: cover ? columnWidth : columnWidth - 20,
      maxHeight: cover ? 40 : 80
    });
    const extra = view && (view.author || view.pub_time) ? 24 : 0;
    const pad = cover ? 4 : view && view.badge ? 68 : 46;
    return { coverHeight, height: Math.floor(coverHeight + textHeight + pad + extra) };
  }
  function toItem(view, index, columnWidth) {
    const natural = computeNaturalSize(view, columnWidth);
    const cover = view && view.cover ? {
      src: normalizeUrl(view.cover.url),
      thumbSrc: coverThumbUrl(view.cover.url),
      width: Math.ceil(columnWidth),
      height: Math.ceil(natural.coverHeight),
      naturalWidth: Number(view.cover.width) || 0,
      naturalHeight: Number(view.cover.height) || 0
    } : null;
    return {
      key: String(view && view.opus_id || view && view.jump_url || index),
      index,
      view: view || {},
      cover,
      width: columnWidth,
      height: natural.height
    };
  }
  function fromInstanceItem(item, fallbackIndex) {
    const data = item && item.data || {};
    const view = data.view || {};
    const cached = data.cover;
    let cover = null;
    if (cached && cached.src) {
      cover = {
        src: normalizeUrl(cached.src),
        thumbSrc: coverThumbUrl(cached.src),
        width: Number(cached.width) || Number(item && item.width) || 0,
        height: Number(cached.height) || 0,
        naturalWidth: Number(view.cover && view.cover.width) || 0,
        naturalHeight: Number(view.cover && view.cover.height) || 0
      };
    } else if (view.cover && view.cover.url) {
      const width = Number(item && item.width) || 0;
      const natural = computeNaturalSize(view, width || 190);
      cover = {
        src: normalizeUrl(view.cover.url),
        thumbSrc: coverThumbUrl(view.cover.url),
        width: Math.ceil(width || natural.coverHeight),
        height: Math.ceil(natural.coverHeight),
        naturalWidth: Number(view.cover.width) || 0,
        naturalHeight: Number(view.cover.height) || 0
      };
    }
    return {
      key: String(view.opus_id || view.jump_url || item && item.index || fallbackIndex),
      index: item && item.index != null ? item.index : fallbackIndex,
      view,
      cover,
      width: Number(item && item.width) || 0,
      height: Number(item && item.height) || 0
    };
  }
  function statText(value) {
    if (value == null || value === "") return "";
    return String(value);
  }

  // src/opus/layout.js
  function computeColumnWidth(innerWidth) {
    const w = Math.min(Number(innerWidth) || 0, 2560);
    let columns;
    let total;
    if (w < 1340) {
      columns = 4;
      total = Math.max(1100, w) - 286;
    } else if (w < 1560) {
      columns = 5;
      total = Math.max(1100, w) - 286;
    } else if (w < 1680) {
      columns = 5;
      total = w - 446;
    } else {
      columns = 6;
      total = w - ((w < 1860 ? 150 : 240) + 16 + 280);
    }
    const width = (total - DEFAULT_COLUMN_GUTTER * (columns - 1)) / columns;
    return { columns, columnWidth: width };
  }
  function columnsForWidth(containerWidth, columnWidth, columnGutter = DEFAULT_COLUMN_GUTTER) {
    const width = Number(containerWidth) || 0;
    const cw = Number(columnWidth) || 0;
    if (width <= 0 || cw <= 0) return 0;
    return Math.max(1, Math.floor((width + columnGutter) / (cw + columnGutter)));
  }
  function minIndex(values) {
    let best = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] < values[best]) best = i;
    }
    return best;
  }
  function layoutWaterfall(items, {
    columnWidth,
    columns,
    rowGutter = DEFAULT_ROW_GUTTER,
    columnGutter = DEFAULT_COLUMN_GUTTER,
    threshold = THRESHOLD_OF_WATERFALL
  } = {}) {
    const list = items || [];
    const cw = Number(columnWidth) || 0;
    const m = Math.max(1, Math.floor(Number(columns) || 1));
    const heights = new Array(m).fill(0);
    const positions = new Array(list.length);
    let col = 0;
    let next = 0;
    let thresholdState = 0;
    for (let i = 0; i < list.length; i += 1) {
      const h = Number(list[i].height) || 0;
      positions[i] = { left: col * (cw + columnGutter), top: heights[col] };
      if (thresholdState < threshold) {
        heights[next] += h + rowGutter;
        next = (next + 1) % m;
        col = next;
      } else {
        heights[col] += h + rowGutter;
        col = minIndex(heights);
      }
      if ((i + 1) % m === 0) {
        const max = Math.max(...heights);
        const min = Math.min(...heights);
        thresholdState = max - min;
        next = 0;
        col = thresholdState < threshold ? 0 : minIndex(heights);
      }
    }
    return {
      positions,
      width: m * cw + (m - 1) * columnGutter,
      height: heights.length ? Math.max(...heights) : 0
    };
  }
  function layoutRows(items, {
    columnWidth,
    columns,
    rowGutter = DEFAULT_ROW_GUTTER,
    columnGutter = DEFAULT_COLUMN_GUTTER
  } = {}) {
    const list = items || [];
    const cw = Number(columnWidth) || 0;
    const m = Math.max(1, Math.floor(Number(columns) || 1));
    const positions = new Array(list.length);
    const rowHeights = [];
    let top = 0;
    for (let start5 = 0; start5 < list.length; start5 += m) {
      const row = list.slice(start5, start5 + m);
      const rowIndex = rowHeights.length;
      const rowHeight = row.reduce((max, item) => Math.max(max, Number(item && item.height) || 0), 0);
      rowHeights.push(rowHeight);
      row.forEach((item, column) => {
        positions[start5 + column] = {
          left: column * (cw + columnGutter),
          top,
          height: rowHeight,
          row: rowIndex
        };
      });
      top += rowHeight + rowGutter;
    }
    return {
      positions,
      rowHeights,
      width: m * cw + (m - 1) * columnGutter,
      height: Math.max(0, top - rowGutter)
    };
  }
  function totalPages(loadedCount, pageSize) {
    const size = Math.max(1, Math.floor(Number(pageSize) || 20));
    const count = Math.max(0, Math.floor(Number(loadedCount) || 0));
    return Math.max(1, Math.ceil(count / size));
  }

  // src/opus/cards.js
  var BADGE_DEFAULT = {
    text: "充电专属",
    bg: "#FF6699",
    color: "#FFFFFF"
  };
  function badgeInfo(badge) {
    if (!badge) return null;
    return {
      text: badge.text || BADGE_DEFAULT.text,
      bg: badge.bg_color || BADGE_DEFAULT.bg,
      color: badge.color || BADGE_DEFAULT.color
    };
  }
  function coverStat(icon, value) {
    const el = create("div", { className: "bili-cover-card__stat" });
    el.appendChild(create("i", { className: icon }));
    el.appendChild(create("span", { text: statText(value) }));
    return el;
  }
  function textStat(icon, value) {
    const el = create("span");
    el.appendChild(create("i", { className: icon }));
    el.appendChild(document.createTextNode(` ${statText(value)}`));
    return el;
  }
  function appendCoverStats(coverEl, view) {
    const stat = view && view.stat || {};
    const statsEl = create("div", { className: "bili-cover-card__stats" });
    if (statText(stat.view)) statsEl.appendChild(coverStat("sic-BDC-eye_browse_line", stat.view));
    if (statText(stat.like)) statsEl.appendChild(coverStat("sic-BDC-hand_thumbsup_line", stat.like));
    if (statsEl.childNodes.length) coverEl.appendChild(statsEl);
  }
  function appendCoverBadge(coverEl, view) {
    const badge = badgeInfo(view && view.badge);
    if (!badge) return;
    const tags = create("div", { className: "bili-cover-card__tags" });
    const tag = create("div", {
      className: "bili-cover-card__tag",
      text: badge.text,
      style: { "background-color": badge.bg, color: badge.color }
    });
    tags.appendChild(tag);
    coverEl.appendChild(tags);
  }
  function buildCoverCard(item, options = {}) {
    const view = item.view || {};
    const href = normalizeHref(view.jump_url);
    const title = view.content || "";
    const cover = item.cover || {};
    const src = coverDisplaySrc(cover, options.compressImages !== false);
    const ratio = cover.width > 0 && cover.height > 0 ? cover.height / cover.width * 100 : 100;
    const section = create("div", { className: "opus-card--with-cover" });
    const coverEl = create("a", {
      className: "bili-cover-card opus-card__cover",
      attrs: { href, target: "_blank", rel: "noopener noreferrer" },
      style: { "--bili-cover-card-ratio": `${ratio.toFixed(4)}%` }
    });
    const thumb = create("div", { className: "bili-cover-card__thumbnail" });
    thumb.appendChild(
      create("img", {
        attrs: {
          src,
          alt: title.slice(0, 80),
          decoding: "async"
        }
      })
    );
    coverEl.appendChild(thumb);
    appendCoverStats(coverEl, view);
    appendCoverBadge(coverEl, view);
    section.appendChild(coverEl);
    const titleEl = create("a", {
      className: "opus-card__title",
      attrs: { href, target: "_blank", rel: "noopener noreferrer" }
    });
    titleEl.appendChild(create("div", { className: "bt-opus-title-text", text: title }));
    section.appendChild(titleEl);
    return section;
  }
  function buildTextCard(item) {
    const view = item.view || {};
    const href = normalizeHref(view.jump_url);
    const title = view.content || "";
    const section = create("div", { className: "opus-card--only-text" });
    const link = create("a", { attrs: { href, target: "_blank", rel: "noopener noreferrer" } });
    const badge = badgeInfo(view.badge);
    if (badge) {
      const badgeEl = create("div", {
        className: "battery-charge-only",
        style: { "background-color": badge.bg, color: badge.color }
      });
      badgeEl.appendChild(create("i", { className: "sic-BDC-battery_charge_simple_fill" }));
      badgeEl.appendChild(create("span", { text: badge.text }));
      link.appendChild(badgeEl);
    }
    const textWrap = create("div", { className: "opus-card__text" });
    textWrap.appendChild(create("div", { className: "bt-opus-text-clamp", text: title }));
    link.appendChild(textWrap);
    section.appendChild(link);
    const stat = view.stat || {};
    const icons = create("div", { className: "opus-card__icons" });
    if (statText(stat.view)) icons.appendChild(textStat("sic-BDC-eye_browse_line", stat.view));
    if (statText(stat.like)) icons.appendChild(textStat("sic-BDC-hand_thumbsup_line", stat.like));
    if (icons.childNodes.length) section.appendChild(icons);
    return section;
  }
  function buildOpusCard(item, options = {}) {
    const root = create("div", {
      className: "opus-card",
      attrs: { "data-bt-key": item.key || "" }
    });
    root.appendChild(item.cover && item.cover.src ? buildCoverCard(item, options) : buildTextCard(item));
    const view = item.view || {};
    const meta = [view.author, view.pub_time].filter(Boolean).join(" · ");
    if (meta) {
      root.appendChild(
        create("div", {
          className: "opus-card__subtitle",
          text: meta,
          attrs: { title: meta }
        })
      );
    }
    return root;
  }

  // src/opus/settings.js
  var STORAGE_KEY = "biliTools:opus";
  var DEFAULT_SETTINGS = {
    // 开启后封面加载压缩缩略图（@640w.webp，快）；关闭则加载原图（画质最好，但慢、流量大）
    compressImages: true
  };
  function readParsed() {
    try {
      if (typeof GM_getValue === "function") {
        const raw = GM_getValue(STORAGE_KEY);
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (parsed && typeof parsed === "object") return parsed;
        }
      }
    } catch {
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {
    }
    return {};
  }
  function loadSettings() {
    return { ...DEFAULT_SETTINGS, ...readParsed() };
  }
  function saveSettings(settings2) {
    const raw = JSON.stringify(settings2);
    try {
      if (typeof GM_setValue === "function") GM_setValue(STORAGE_KEY, raw);
    } catch {
    }
    try {
      localStorage.setItem(STORAGE_KEY, raw);
    } catch {
    }
  }

  // src/opus/adapter.js
  var log2 = createLogger("opus");
  var API_PATH = "/x/polymer/web-dynamic/v1/opus/feed/space";
  function parseParams(url) {
    try {
      const u = new URL(String(url), location.href);
      return Object.fromEntries(u.searchParams.entries());
    } catch {
      return {};
    }
  }
  function pageWindow2() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow) return unsafeWindow;
    } catch {
    }
    return window;
  }
  function pageDocument2() {
    try {
      const win = pageWindow2();
      if (win && win.document) return win.document;
    } catch {
    }
    return document;
  }
  function installCapture(onResponse) {
    const W = pageWindow2();
    if (W.__biliToolsOpusCaptureInstalled) return;
    W.__biliToolsOpusCaptureInstalled = true;
    log2.info("已安装 opus 接口观察器");
    const XHR = W.XMLHttpRequest;
    if (XHR && XHR.prototype && !XHR.prototype.__biliToolsPatched) {
      try {
        const rawOpen = XHR.prototype.open;
        const rawSend = XHR.prototype.send;
        XHR.prototype.open = function patchedOpen(method, url, ...rest) {
          try {
            this.__btOpusUrl = typeof url === "string" ? url : String(url);
          } catch {
            this.__btOpusUrl = "";
          }
          return rawOpen.call(this, method, url, ...rest);
        };
        XHR.prototype.send = function patchedSend(...args) {
          const url = this.__btOpusUrl;
          if (url && String(url).includes(API_PATH)) {
            const xhr = this;
            const report = () => {
              if (xhr.readyState !== 4 || xhr.__btOpusReported) return;
              xhr.__btOpusReported = true;
              try {
                let json = null;
                if (!xhr.responseType || xhr.responseType === "text") {
                  json = JSON.parse(xhr.responseText);
                } else if (xhr.responseType === "json") {
                  json = xhr.response;
                }
                if (json && json.code === 0 && json.data) {
                  onResponse({ url: String(url), params: parseParams(url), data: json.data });
                }
              } catch (err) {
                log2.warn("解析 opus 响应失败", err);
              }
            };
            xhr.addEventListener("readystatechange", report);
            xhr.addEventListener("load", report);
          }
          return rawSend.apply(this, args);
        };
        XHR.prototype.__biliToolsPatched = true;
      } catch (err) {
        log2.warn("XHR 观察器安装失败", err);
      }
    }
    try {
      if (typeof W.fetch === "function" && !W.fetch.__biliToolsPatched) {
        const rawFetch = W.fetch;
        const patchedFetch = function patchedFetch2(input, init) {
          const url = typeof input === "string" ? input : input && input.url || "";
          const result = rawFetch.apply(this, arguments);
          if (String(url).includes(API_PATH) && result && typeof result.then === "function") {
            result.then((res) => res.clone().json()).then((json) => {
              if (json && json.code === 0 && json.data) {
                onResponse({ url: String(url), params: parseParams(url), data: json.data });
              }
            }).catch(() => {
            });
          }
          return result;
        };
        patchedFetch.__biliToolsPatched = true;
        W.fetch = patchedFetch;
      }
    } catch (err) {
      log2.warn("fetch 观察器安装失败", err);
    }
  }
  function getVueApp() {
    const doc = pageDocument2();
    const candidates = [doc.getElementById("app"), doc.querySelector("[data-v-app]")];
    for (const el of candidates) {
      try {
        if (el && el.__vue_app__) return el.__vue_app__;
      } catch {
      }
    }
    return null;
  }
  function findWaterfall(app) {
    try {
      return findWaterfallUnsafe(app);
    } catch {
      return null;
    }
  }
  function findWaterfallUnsafe(app) {
    if (!app) return null;
    const doc = pageDocument2();
    const containerCandidates = [
      app._container,
      doc.getElementById("app"),
      doc.querySelector("[data-v-app]")
    ].filter(Boolean);
    let rootVNode = null;
    for (const el of containerCandidates) {
      if (el && el._vnode) {
        rootVNode = el._vnode;
        break;
      }
    }
    if (!rootVNode && app._instance && app._instance.subTree) {
      rootVNode = app._instance.subTree;
    }
    if (!rootVNode) return null;
    const seen = /* @__PURE__ */ new Set();
    const stack = [rootVNode];
    while (stack.length) {
      const vnode = stack.pop();
      if (!vnode || typeof vnode !== "object" || seen.has(vnode)) continue;
      seen.add(vnode);
      const inst = vnode.component;
      if (inst) {
        const props = inst.props || {};
        const type = inst.type || {};
        const byName = type.__name === "WaterfallGrid" || type.name === "WaterfallGrid";
        const byShape = Array.isArray(props.list) && (props.list.length === 0 || Boolean(props.list[0] && props.list[0].data && (props.list[0].data.view || props.list[0].data.cover)));
        if (Array.isArray(props.list) && (byName || byShape) && !inst.isUnmounted) {
          return inst;
        }
        if (inst.isUnmounted) continue;
        if (inst.subTree) stack.push(inst.subTree);
      }
      if (Array.isArray(vnode.children)) stack.push(...vnode.children);
      if (Array.isArray(vnode.dynamicChildren)) stack.push(...vnode.dynamicChildren);
      if (vnode.suspense) {
        stack.push(vnode.suspense.activeBranch, vnode.suspense.pendingBranch);
      }
      if (vnode.ssContent) stack.push(vnode.ssContent);
    }
    return null;
  }
  function createCaptureState() {
    return {
      type: "all",
      items: [],
      hasMore: null,
      lastPage: 0,
      lastAt: 0,
      onResponse(evt) {
        const params = evt.params || {};
        const data = evt.data || {};
        const page = Number(params.page) || 1;
        const offset = params.offset || "";
        const type = params.type || this.type;
        const isFirstPage = page <= 1 || offset === "";
        if (isFirstPage) {
          this.items = [];
          this.lastPage = 0;
          this.type = type;
        }
        this.items = this.items.concat(Array.isArray(data.items) ? data.items : []);
        this.hasMore = Boolean(data.has_more);
        this.lastPage = page;
        this.lastAt = Date.now();
      }
    };
  }
  function createAdapter(capture2) {
    const app = getVueApp();
    const inst = findWaterfall(app);
    const vueReady = Boolean(inst && Array.isArray(inst.props.list) && inst.props.list.length > 0);
    if (vueReady) {
      try {
        const adapter = createVueAdapter(inst, capture2);
        adapter.getItems(1);
        log2.info("数据通道：Vue 实例（WaterfallGrid）");
        return adapter;
      } catch (err) {
        log2.warn("Vue 通道不可用，改用网络抓包", err);
      }
    }
    if (capture2 && capture2.items.length > 0) {
      log2.info("数据通道：网络抓包");
      return createNetworkAdapter(capture2);
    }
    if (inst && !vueReady) {
      try {
        const adapter = createVueAdapter(inst, capture2);
        adapter.getItems(1);
        log2.info("数据通道：Vue 实例（等待数据）");
        return adapter;
      } catch (err) {
        log2.warn("Vue 通道不可用", err);
      }
    }
    return null;
  }
  function createVueAdapter(inst, capture2) {
    const listOf = () => Array.isArray(inst.props.list) ? inst.props.list : [];
    return {
      kind: "vue",
      instance: inst,
      getItems(columnWidth) {
        return listOf().map((item, index) => {
          const mapped = fromInstanceItem(item, index);
          if (!mapped.height && columnWidth > 0) {
            const natural = computeNaturalSize(mapped.view, columnWidth);
            mapped.width = Number(mapped.width) || columnWidth;
            mapped.height = natural.height;
            if (mapped.cover && !mapped.cover.height) mapped.cover.height = Math.ceil(natural.coverHeight);
          }
          return mapped;
        });
      },
      getColumnWidth: () => Number(inst.props.columnWidth) || 0,
      getLoaded: () => listOf().length,
      getHasMore: () => capture2 && capture2.hasMore != null ? capture2.hasMore : null,
      getLoading: () => Boolean(inst.props.loadingLock),
      isValid: () => !inst.isUnmounted,
      async loadMore() {
        const handler = inst.vnode && inst.vnode.props && inst.vnode.props.onLoadMore;
        if (typeof handler === "function") {
          handler();
          return true;
        }
        const prevY = window.scrollY;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
        await sleep(80);
        window.dispatchEvent(new Event("scroll"));
        await sleep(300);
        if (window.scrollY !== prevY) window.scrollTo({ top: prevY, behavior: "auto" });
        return false;
      }
    };
  }
  function createNetworkAdapter(capture2) {
    return {
      kind: "network",
      getItems(columnWidth) {
        return capture2.items.map((view, index) => toItem(view, index, columnWidth));
      },
      getColumnWidth: () => 0,
      getLoaded: () => capture2.items.length,
      getHasMore: () => capture2.hasMore != null ? capture2.hasMore : null,
      getLoading: () => false,
      isValid: () => true,
      /** 兜底：滚到底触发页面自身的 loadMore，然后等新响应 */
      async loadMore() {
        const before = capture2.items.length;
        const prevY = window.scrollY;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
        await sleep(80);
        window.dispatchEvent(new Event("scroll"));
        await waitFor(() => capture2.items.length > before || capture2.hasMore === false, {
          timeout: 15e3,
          interval: 150,
          label: "opus-network-load"
        }).catch(() => {
        });
        if (window.scrollY !== prevY) window.scrollTo({ top: prevY, behavior: "auto" });
        return capture2.items.length > before;
      }
    };
  }

  // src/scripts/opus-pagination.js
  var VERSION2 = "0.4.0";
  var SCOPE2 = "opus";
  var STYLE_ID3 = "bili-tools-opus-style";
  var ACTIVE_CLASS2 = "bili-tools-opus-active";
  var WRAP_CLASS = "bt-opus-wrap";
  var PAGER_CLASS2 = "bt-opus-pager";
  var HEADER_OFFSET2 = 64;
  var BOOT_TIMEOUT2 = 2e4;
  var LOAD_TIMEOUT2 = 2e4;
  var log3 = createLogger(SCOPE2);
  var capture = createCaptureState();
  var running2 = false;
  var mainTimer2 = null;
  var state2 = {
    active: false,
    booting: false,
    adapter: null,
    page: 1,
    pageSize: PAGE_SIZE2,
    items: [],
    loaded: 0,
    lastLoaded: 0,
    hasMore: true,
    cw: 0,
    columns: 0,
    type: "",
    tab: "",
    busy: false,
    busyText: "",
    renderKey: "",
    feedEl: null,
    opusEl: null,
    wrapEl: null,
    gridEl: null,
    pager: null,
    settings: loadSettings(),
    routeKey: "",
    nextBootAt: 0,
    observer: null,
    refreshTimer: null,
    resizeTimer: null,
    pollTimer: null
  };
  var CSS3 = `
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
`;
  function isOpusRoute() {
    return /^\/\d+\/upload\/opus(?:\/|$)/.test(location.pathname);
  }
  function startStyle2() {
    addStyle(STYLE_ID3, CSS3);
  }
  function maybeBoot2() {
    if (state2.active || state2.booting) return;
    if (!isOpusRoute()) return;
    if (Date.now() < state2.nextBootAt) return;
    state2.nextBootAt = Date.now() + 3e3;
    void boot2();
  }
  async function boot2() {
    if (!running2) return;
    if (state2.active || state2.booting || !isOpusRoute()) return;
    state2.booting = true;
    try {
      startStyle2();
      const feed = await waitForElement(".opus-feed", { timeout: BOOT_TIMEOUT2 }).catch(() => null);
      if (!running2) return;
      if (!feed) {
        log3.info("未找到 .opus-feed，稍后重试");
        return;
      }
      const ready = await waitForData2(15e3);
      if (!running2) return;
      if (!ready) {
        log3.info("图文列表暂无可接管的数据（未登录 / 空列表），稍后重试");
        return;
      }
      activate2(feed);
    } catch (err) {
      log3.warn("启动失败", err);
      if (state2.active || state2.opusEl && state2.opusEl.classList.contains(ACTIVE_CLASS2)) {
        teardown2();
      }
    } finally {
      state2.booting = false;
      state2.nextBootAt = Date.now() + 3e3;
    }
  }
  async function waitForData2(timeout) {
    const start5 = Date.now();
    for (; ; ) {
      if (capture.items.length > 0) return true;
      try {
        const inst = findWaterfall(getVueApp());
        if (inst && Array.isArray(inst.props.list) && inst.props.list.length > 0) return true;
      } catch (err) {
        log3.debug("读取页面 Vue 实例失败", err);
      }
      if (Date.now() - start5 >= timeout) return false;
      await sleep(150);
    }
  }
  function activate2(feed) {
    if (state2.active) return;
    const opusEl = feed.closest(".opus") || document.querySelector(".opus") || document.body;
    let adapter = null;
    try {
      adapter = createAdapter(capture);
    } catch (err) {
      log3.warn("数据通道初始化失败，保留原生页面", err);
    }
    if (!adapter) {
      log3.warn("没有可用的数据通道，保留原生页面");
      return;
    }
    state2.active = true;
    state2.feedEl = feed;
    state2.opusEl = opusEl;
    state2.adapter = adapter;
    state2.type = capture.type;
    state2.tab = activeTabText();
    try {
      state2.opusEl.classList.add(ACTIVE_CLASS2);
      ensureWrap();
      ensurePager2();
      bindObservers();
      refresh(true);
    } catch (err) {
      log3.warn("启用图文翻页失败，恢复原生页面", err);
      teardown2();
      return;
    }
    log3.info("已启用", { adapter: state2.adapter.kind, version: VERSION2 });
  }
  function onCapture(evt) {
    capture.onResponse(evt);
    if (!state2.active) return;
    const page = Number(evt.params && evt.params.page) || 1;
    const type = evt.params && evt.params.type || capture.type;
    if (page <= 1) {
      if (state2.type && type !== state2.type) {
        state2.page = 1;
        state2.tab = activeTabText();
      }
      state2.type = type;
    }
    scheduleRefresh(60);
  }
  function activeTabText() {
    const el = document.querySelector(".opus-header .content-tab.active");
    return el ? (el.textContent || "").trim() : "";
  }
  function isOurNode2(node) {
    if (!node || node.nodeType !== 1 || typeof node.closest !== "function") return false;
    return Boolean(node.closest(`.${WRAP_CLASS}`) || node.closest(`.${PAGER_CLASS2}`));
  }
  function feedElement() {
    return document.querySelector(".opus-feed");
  }
  function ensureWrap() {
    const feed = feedElement();
    if (!feed) {
      teardown2();
      return;
    }
    if (feed !== state2.feedEl) {
      state2.feedEl = feed;
      state2.opusEl = feed.closest(".opus") || document.querySelector(".opus") || document.body;
    }
    state2.opusEl.classList.add(ACTIVE_CLASS2);
    if (!state2.wrapEl) {
      state2.wrapEl = create("div", { className: WRAP_CLASS });
      state2.gridEl = create("div", { className: "bt-opus-grid" });
      state2.wrapEl.appendChild(state2.gridEl);
    }
    const parent = feed.parentElement;
    if (parent && (state2.wrapEl.parentElement !== parent || state2.wrapEl.previousElementSibling !== feed)) {
      parent.insertBefore(state2.wrapEl, feed.nextSibling);
    }
  }
  function ensurePager2() {
    if (!state2.pager) {
      state2.pager = createPager({
        className: PAGER_CLASS2,
        onPage: (page) => {
          void goTo2(page);
        },
        onJump: (page) => {
          void goTo2(page);
        }
      });
    }
    const footer = document.querySelector(".opus-footer") || state2.opusEl;
    if (footer && state2.pager.el.parentElement !== footer) {
      footer.appendChild(state2.pager.el);
    }
  }
  var menuCommandId = null;
  var menuCommandName = "";
  function compressionMenuName() {
    return `图片压缩：${state2.settings.compressImages ? "开" : "关"}`;
  }
  function registerCompressionMenu() {
    if (window.top !== window) return;
    if (typeof GM_registerMenuCommand !== "function") return;
    const name = compressionMenuName();
    if (menuCommandId !== null && name === menuCommandName) return;
    try {
      if (menuCommandId !== null && typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(menuCommandId);
        menuCommandId = null;
      }
      const onClick = () => setCompressImages(!state2.settings.compressImages);
      try {
        menuCommandId = GM_registerMenuCommand(name, onClick, {
          autoClose: true,
          title: "点击切换封面是否加载压缩图（开启更快，关闭加载原图）"
        });
      } catch {
        menuCommandId = GM_registerMenuCommand(name, onClick);
      }
      menuCommandName = name;
    } catch (err) {
      log3.debug("注册油猴菜单失败", err);
    }
  }
  function setCompressImages(value) {
    const next = Boolean(value);
    if (state2.settings.compressImages === next) {
      registerCompressionMenu();
      return;
    }
    state2.settings.compressImages = next;
    saveSettings(state2.settings);
    preloadedCovers.clear();
    if (state2.active) refresh(true);
    registerCompressionMenu();
    if (state2.active) {
      toast(next ? "已开启图片压缩（封面加载更快）" : "已关闭图片压缩（封面加载原图）", { duration: 1800 });
    }
  }
  function resolveLayout() {
    let cw = state2.adapter ? state2.adapter.getColumnWidth() : 0;
    let columns = 0;
    let containerWidth = 0;
    const masonry2 = document.querySelector(".masonry_grid_v2");
    if (masonry2) {
      const raw = masonry2.style.getPropertyValue("--container-width") || getComputedStyle(masonry2).getPropertyValue("--container-width");
      const num = parseFloat(raw);
      if (Number.isFinite(num) && num > 0) containerWidth = num;
    }
    if (!(containerWidth > 0)) {
      const body = document.querySelector(".opus-body");
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
      columns: Math.max(1, columns)
    };
  }
  function refresh(force = false) {
    if (!state2.active) return;
    ensureWrap();
    if (!state2.feedEl) return;
    if (!state2.adapter || state2.adapter.isValid && !state2.adapter.isValid()) {
      state2.adapter = createAdapter(capture);
      if (!state2.adapter) {
        teardown2();
        return;
      }
    }
    const layout2 = resolveLayout();
    const items = state2.adapter.getItems(layout2.columnWidth) || [];
    const loaded = items.length;
    const hasMoreRaw = state2.adapter.getHasMore();
    const tab = activeTabText();
    if (tab && tab !== state2.tab) {
      state2.tab = tab;
      state2.page = 1;
    }
    if (loaded < state2.lastLoaded) state2.page = 1;
    state2.items = items;
    state2.loaded = loaded;
    state2.lastLoaded = loaded;
    state2.cw = layout2.columnWidth;
    state2.columns = layout2.columns;
    state2.hasMore = hasMoreRaw !== false;
    if (state2.hasMore) {
      const maxLoadedPage = Math.max(1, Math.ceil(loaded / PAGE_SIZE2));
      if (state2.page > maxLoadedPage + 1) state2.page = maxLoadedPage;
    } else {
      const last = totalPages(loaded, PAGE_SIZE2);
      if (state2.page > last) state2.page = last;
    }
    ensurePager2();
    if (loaded > 0) {
      maybeRender(force);
      const preloadStart = state2.page * PAGE_SIZE2;
      preloadCovers(state2.items.slice(preloadStart, preloadStart + PAGE_SIZE2 * 2));
    }
    updatePager2();
  }
  var preloadedCovers = /* @__PURE__ */ new Set();
  function preloadCovers(items) {
    if (!state2.settings.compressImages) return;
    for (const item of items) {
      const src = coverDisplaySrc(item.cover, true);
      if (!src || preloadedCovers.has(src)) continue;
      preloadedCovers.add(src);
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }
  }
  function currentSlice() {
    let page = state2.page;
    let start5 = (page - 1) * PAGE_SIZE2;
    let slice = state2.items.slice(start5, start5 + PAGE_SIZE2);
    if (!slice.length && state2.loaded > 0) {
      page = totalPages(state2.loaded, PAGE_SIZE2);
      state2.page = page;
      start5 = (page - 1) * PAGE_SIZE2;
      slice = state2.items.slice(start5, start5 + PAGE_SIZE2);
    }
    return { page, slice };
  }
  function maybeRender(force = false) {
    const { page, slice } = currentSlice();
    const key = [
      page,
      state2.cw,
      state2.columns,
      slice.map((item) => item.key).join(",")
    ].join("|");
    if (!force && key === state2.renderKey) return;
    state2.renderKey = key;
    renderGrid(slice);
  }
  function renderGrid(slice) {
    const grid2 = state2.gridEl;
    if (!grid2) return;
    const layout2 = layoutWaterfall(slice, {
      columnWidth: state2.cw,
      columns: state2.columns,
      rowGutter: DEFAULT_ROW_GUTTER,
      columnGutter: DEFAULT_COLUMN_GUTTER
    });
    grid2.style.width = `${layout2.width}px`;
    grid2.style.height = `${layout2.height}px`;
    const frag = document.createDocumentFragment();
    slice.forEach((item, index) => {
      const pos = layout2.positions[index] || { left: 0, top: 0 };
      const el = create("div", {
        className: "bt-opus-item",
        style: {
          width: `${state2.cw}px`,
          height: `${Math.max(0, item.height)}px`,
          transform: `translate(${pos.left}px, ${pos.top}px)`
        }
      });
      el.appendChild(
        buildOpusCard(item, { compressImages: Boolean(state2.settings.compressImages) })
      );
      frag.appendChild(el);
    });
    grid2.replaceChildren(frag);
  }
  function updatePager2() {
    if (!state2.pager) return;
    const total = state2.hasMore ? null : totalPages(state2.loaded, PAGE_SIZE2);
    state2.pager.update({
      page: state2.page,
      totalPages: total,
      hasMore: state2.hasMore,
      loadedCount: state2.loaded,
      totalCount: total ? state2.loaded : null,
      pageSize: PAGE_SIZE2,
      busy: state2.busy,
      busyText: state2.busyText
    });
  }
  function scrollToFeedTop() {
    const el = state2.wrapEl || state2.feedEl;
    if (!el) return;
    const top = Math.max(0, window.scrollY + el.getBoundingClientRect().top - HEADER_OFFSET2);
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: "auto" });
  }
  function loadedNow() {
    return state2.adapter ? state2.adapter.getLoaded() : state2.loaded;
  }
  async function ensureLoaded2(need) {
    const start5 = Date.now();
    let noGrowth = 0;
    while (loadedNow() < need) {
      if (!state2.hasMore) break;
      if (Date.now() - start5 > LOAD_TIMEOUT2) throw new Error("加载超时");
      if (state2.adapter.getLoading && state2.adapter.getLoading()) {
        await sleep(150);
        continue;
      }
      const before = loadedNow();
      await state2.adapter.loadMore();
      try {
        await waitFor(
          () => loadedNow() > before || state2.adapter.getHasMore() === false,
          { timeout: LOAD_TIMEOUT2, interval: 150, label: "opus-load-more" }
        );
      } catch {
        throw new Error("加载超时");
      }
      refresh();
      if (loadedNow() > before) {
        noGrowth = 0;
      } else {
        noGrowth += 1;
        if (noGrowth >= 3) {
          state2.hasMore = false;
          break;
        }
      }
    }
    refresh();
  }
  async function goTo2(page) {
    if (!state2.active || !state2.adapter || state2.busy) return false;
    if (!state2.loaded) return false;
    let target = Math.max(1, Math.floor(Number(page) || 1));
    if (!state2.hasMore) {
      target = Math.min(target, totalPages(state2.loaded, PAGE_SIZE2));
    }
    const need = target * PAGE_SIZE2;
    if (state2.loaded < need && state2.hasMore) {
      const pagesAhead = target - Math.max(1, Math.ceil(state2.loaded / PAGE_SIZE2));
      const requests = Math.ceil((need - state2.loaded) / PAGE_SIZE2);
      if (pagesAhead > 6 && requests > 6) {
        const ok = window.confirm(`跳转到第 ${target} 页还需要加载约 ${requests} 次，继续吗？`);
        if (!ok) return false;
      }
      state2.busy = true;
      state2.busyText = `正在加载第 ${target} 页（已加载 ${state2.loaded} 个）…`;
      updatePager2();
      try {
        await ensureLoaded2(need);
      } catch (err) {
        state2.busy = false;
        updatePager2();
        toast(`加载第 ${target} 页失败：${err.message}`, { type: "error" });
        return false;
      }
      state2.busy = false;
      state2.busyText = "";
    }
    const last = totalPages(state2.loaded, PAGE_SIZE2);
    if (target > last) {
      target = last;
      toast(`没有更多内容了，已停在最后一页（第 ${last} 页）`, { duration: 2600 });
    }
    state2.page = target;
    refresh(true);
    updatePager2();
    scrollToFeedTop();
    return true;
  }
  function scheduleRefresh(delay = 80) {
    if (state2.refreshTimer) return;
    state2.refreshTimer = setTimeout(() => {
      state2.refreshTimer = null;
      refresh();
    }, delay);
  }
  function bindObservers() {
    if (!state2.observer && state2.opusEl) {
      state2.observer = observeNode(
        state2.opusEl,
        (mutations) => {
          let relevant = false;
          for (const mutation of mutations) {
            if (isOurNode2(mutation.target)) continue;
            if (mutation.type !== "childList") continue;
            if (!mutation.addedNodes.length && !mutation.removedNodes.length) continue;
            relevant = true;
            break;
          }
          if (relevant) scheduleRefresh(120);
        },
        { childList: true, subtree: true }
      );
    }
    if (!state2.onResize) {
      state2.onResize = () => {
        if (state2.resizeTimer) clearTimeout(state2.resizeTimer);
        state2.resizeTimer = setTimeout(() => {
          state2.resizeTimer = null;
          refresh(true);
        }, 320);
      };
      window.addEventListener("resize", state2.onResize, { passive: true });
    }
    if (!state2.onTabClick) {
      state2.onTabClick = (event) => {
        const tab = event.target && event.target.closest && event.target.closest(".content-tab");
        if (!tab) return;
        setTimeout(() => {
          state2.page = 1;
          state2.tab = activeTabText();
          refresh(true);
        }, 120);
      };
      document.addEventListener("click", state2.onTabClick, true);
    }
    if (!state2.pollTimer) {
      state2.pollTimer = setInterval(() => {
        if (state2.active) refresh();
      }, 800);
    }
  }
  function teardown2() {
    if (state2.observer) {
      state2.observer();
      state2.observer = null;
    }
    if (state2.onResize) {
      window.removeEventListener("resize", state2.onResize);
      state2.onResize = null;
    }
    if (state2.onTabClick) {
      document.removeEventListener("click", state2.onTabClick, true);
      state2.onTabClick = null;
    }
    if (state2.pollTimer) {
      clearInterval(state2.pollTimer);
      state2.pollTimer = null;
    }
    if (state2.refreshTimer) {
      clearTimeout(state2.refreshTimer);
      state2.refreshTimer = null;
    }
    if (state2.resizeTimer) {
      clearTimeout(state2.resizeTimer);
      state2.resizeTimer = null;
    }
    if (state2.pager) {
      state2.pager.destroy();
      state2.pager = null;
    }
    if (state2.wrapEl) {
      state2.wrapEl.remove();
      state2.wrapEl = null;
      state2.gridEl = null;
    }
    if (state2.opusEl) state2.opusEl.classList.remove(ACTIVE_CLASS2);
    log3.info("已停止（离开图文页或列表消失）");
    Object.assign(state2, {
      active: false,
      adapter: null,
      page: 1,
      items: [],
      loaded: 0,
      lastLoaded: 0,
      hasMore: true,
      cw: 0,
      columns: 0,
      type: "",
      tab: "",
      busy: false,
      busyText: "",
      renderKey: "",
      feedEl: null,
      opusEl: null
    });
  }
  function watchRoute2() {
    const key = location.pathname;
    const changed = key !== state2.routeKey;
    if (changed) {
      state2.routeKey = key;
      if (state2.active) teardown2();
    }
    if (!isOpusRoute()) {
      if (state2.active) teardown2();
      return;
    }
    if (!state2.active && !state2.booting) {
      setTimeout(maybeBoot2, changed ? 250 : 0);
    }
  }
  function exposeDebug2() {
    window.BILI_TOOLS = window.BILI_TOOLS || {};
    window.BILI_TOOLS.opus = {
      version: VERSION2,
      get active() {
        return state2.active;
      },
      get state() {
        return {
          active: state2.active,
          page: state2.page,
          totalPages: state2.hasMore ? null : totalPages(state2.loaded, PAGE_SIZE2),
          loaded: state2.loaded,
          hasMore: state2.hasMore,
          adapter: state2.adapter ? state2.adapter.kind : null,
          columnWidth: state2.cw,
          columns: state2.columns,
          tab: state2.tab,
          busy: state2.busy,
          compressImages: Boolean(state2.settings.compressImages)
        };
      },
      goTo: (page) => goTo2(page),
      next: () => goTo2(state2.page + 1),
      prev: () => goTo2(state2.page - 1),
      setCompressImages: (value) => setCompressImages(value),
      refresh: () => {
        if (state2.active) refresh(true);
        else void boot2();
      },
      teardown: teardown2
    };
  }
  function start2() {
    if (running2) return;
    running2 = true;
    window[GLOBAL_KEY2] = { version: VERSION2, startedAt: Date.now() };
    startStyle2();
    installCapture(onCapture);
    exposeDebug2();
    registerCompressionMenu();
    window.addEventListener("popstate", watchRoute2);
    window.addEventListener("hashchange", watchRoute2);
    mainTimer2 = setInterval(watchRoute2, 500);
    watchRoute2();
  }
  function stop2() {
    if (!running2) return;
    running2 = false;
    if (mainTimer2) {
      clearInterval(mainTimer2);
      mainTimer2 = null;
    }
    window.removeEventListener("popstate", watchRoute2);
    window.removeEventListener("hashchange", watchRoute2);
    teardown2();
    state2.booting = false;
    state2.nextBootAt = 0;
    state2.routeKey = "";
    if (menuCommandId !== null && typeof GM_unregisterMenuCommand === "function") {
      try {
        GM_unregisterMenuCommand(menuCommandId);
      } catch {
      }
      menuCommandId = null;
      menuCommandName = "";
    }
    delete window[GLOBAL_KEY2];
    log3.info("图文翻页脚本已停止");
  }
  var GLOBAL_KEY2 = "__biliToolsOpusLoaded__";
  if (false) {
    if (!window[GLOBAL_KEY2]) {
      start2();
    } else {
      log3.debug("opus 脚本已注入，跳过重复初始化");
    }
  }

  // src/scripts/opus-uniform-row.js
  var VERSION3 = "0.3.1";
  var SCOPE3 = "opus-row";
  var STYLE_ID4 = "bili-tools-opus-row-style";
  var HIDE_CLASS = "bt-opus-row-hidden";
  var WRAP_CLASS2 = "bt-opus-row-wrap";
  var GRID_CLASS = "bt-opus-row-grid";
  var ITEM_CLASS = "bt-opus-row-item";
  var READY_CLASS = "bt-opus-row-ready";
  var BT_ROOT_CLASS = "bt-opus-row-bt";
  var TITLE_LINE_HEIGHT = 16.8;
  var TEXT_LINE_HEIGHT = 20;
  var startedAt = Date.now();
  var log4 = createLogger(SCOPE3);
  var CSS4 = `
.${HIDE_CLASS} .opus-feed{position:absolute!important;left:0;right:0;top:auto;height:0!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important}
.${WRAP_CLASS2}{margin:0 auto;width:100%}
.${GRID_CLASS}{position:relative;margin:0 auto}
.${ITEM_CLASS}{position:absolute;left:0;top:0;max-width:100%}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .bili-cover-card{overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card--only-text .opus-card__icons{margin-top:auto}
.${BT_ROOT_CLASS} > .bt-opus-item .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${BT_ROOT_CLASS} > .bt-opus-item .bili-cover-card{overflow:hidden}
.${BT_ROOT_CLASS} > .bt-opus-item .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${BT_ROOT_CLASS} > .bt-opus-item .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${BT_ROOT_CLASS} > .bt-opus-item .opus-card--only-text .opus-card__icons{margin-top:auto}
`;
  var state3 = {
    active: false,
    version: VERSION3,
    mode: null,
    items: 0,
    columns: 0,
    rows: 0,
    rowHeights: [],
    lastError: "",
    lastApplyAt: 0
  };
  var masonry = null;
  var source = null;
  var hideHost = null;
  var wrap = null;
  var grid = null;
  var clones = [];
  var cloneSignature = "";
  var sourceObserver = null;
  var rebuildTimer = null;
  var layoutTimer = null;
  var boundLoad = false;
  var boundResize = false;
  var applying = false;
  var btGrid = null;
  var btObserver = null;
  var btAttrObserver = null;
  var btTimer = null;
  var btApplying = false;
  var btIgnoreUntil = 0;
  var btResizeBound = false;
  var running3 = false;
  var mainTimer3 = null;
  function exposeDebug3() {
    window.BILI_TOOLS = window.BILI_TOOLS || {};
    window.BILI_TOOLS.row = {
      version: VERSION3,
      state: state3,
      apply: () => {
        if (btGrid) scheduleBtApply(0);
        else scheduleRebuild(0);
      }
    };
  }
  function sourceItems() {
    if (!source) return [];
    const direct = Array.from(source.children).filter(
      (el) => el.classList && el.classList.contains("item")
    );
    if (direct.length) return direct;
    return Array.from(source.querySelectorAll(".item"));
  }
  function sourceItemsOf(container) {
    if (!container) return [];
    const direct = Array.from(container.children).filter(
      (el) => el.classList && el.classList.contains("item")
    );
    if (direct.length) return direct;
    return Array.from(container.querySelectorAll(".item"));
  }
  function findNativeSource() {
    const found = document.querySelector(".masonry_grid_v2");
    if (!found) return null;
    let container = found.querySelector(".container");
    if (!container || !sourceItemsOf(container).length) {
      const sample = found.querySelector(".item");
      container = sample && sample.parentElement || container;
    }
    if (!container || !sourceItemsOf(container).length) return null;
    return { masonry: found, source: container };
  }
  function findTarget() {
    const opus = window.BILI_TOOLS && window.BILI_TOOLS.opus;
    const opusActive = Boolean(opus && opus.state && opus.state.active);
    if (opus && !opusActive && Date.now() - startedAt < 2500) {
      return null;
    }
    if (opusActive) {
      const bt = document.querySelector(".bt-opus-grid");
      if (bt && bt.querySelector(".bt-opus-item")) return { mode: "bt", grid: bt };
      return null;
    }
    const native = findNativeSource();
    if (native) return { mode: "native", ...native };
    return null;
  }
  function signatureOf(items) {
    return items.map((el) => {
      const link = el.querySelector(".opus-card__title, .bili-cover-card");
      const href = link && link.getAttribute("href") || "";
      const title = ((el.querySelector(".opus-card__title") || {}).textContent || "").trim().slice(0, 40);
      const img = el.querySelector(".bili-cover-card img");
      const src = (img && img.getAttribute("src") || "").split("@")[0];
      return `${href}|${title}|${src}`;
    }).join("~");
  }
  function resolveInfo(items) {
    const first = items[0];
    if (!first) return null;
    const firstWidth = parseFloat(first.style.width) || first.getBoundingClientRect().width || 0;
    if (!(firstWidth > 0)) return null;
    const containerWidth = parseFloat(masonry && masonry.style.getPropertyValue("--container-width")) || 0;
    let columns = containerWidth > 0 ? Math.round((containerWidth + DEFAULT_COLUMN_GUTTER) / (firstWidth + DEFAULT_COLUMN_GUTTER)) : 0;
    if (!(columns > 0)) {
      const top = Math.round(first.getBoundingClientRect().top);
      columns = items.filter(
        (el) => Math.abs(Math.round(el.getBoundingClientRect().top) - top) <= 2
      ).length;
    }
    return { columns: Math.max(1, columns), columnWidth: firstWidth };
  }
  function clampElement(item) {
    const title = item.querySelector(".opus-card__title .vui_ellipsis") || item.querySelector(".opus-card__title .bt-opus-title-text");
    if (title) return { el: title, base: 2, lineHeight: TITLE_LINE_HEIGHT };
    const text = item.querySelector(".opus-card--only-text .vui_ellipsis") || item.querySelector(".opus-card--only-text .bt-opus-text-clamp") || item.querySelector(".opus-card--only-text .opus-card__text");
    if (text) return { el: text, base: 3, lineHeight: TEXT_LINE_HEIGHT };
    const titleAnchor = item.querySelector(".opus-card__title");
    if (titleAnchor) return { el: titleAnchor, base: 2, lineHeight: TITLE_LINE_HEIGHT };
    return null;
  }
  function restoreCloneImage(item) {
    const img = item.querySelector(".bili-cover-card img");
    if (!img) return;
    const src = img.getAttribute("src") || "";
    if (src.includes("@")) {
      img.setAttribute("src", `${src.split("@")[0]}@640w.webp`);
    }
  }
  function setCloneCoverRatio(item) {
    const cover = item.querySelector(".bili-cover-card");
    const img = cover && cover.querySelector("img");
    if (!cover || !img || !img.naturalWidth || !img.naturalHeight) return;
    cover.style.setProperty(
      "--bili-cover-card-ratio",
      `${img.naturalHeight / img.naturalWidth * 100}%`
    );
  }
  function resetClone(item, columnWidth) {
    item.style.removeProperty("height");
    item.style.removeProperty("transform");
    item.style.width = `${columnWidth}px`;
    const clamp = clampElement(item);
    if (clamp) clamp.el.style.setProperty("-webkit-line-clamp", String(clamp.base));
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
        clone.classList.remove("item");
        clone.classList.add(ITEM_CLASS);
        clone.removeAttribute("style");
        clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
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
        const card = clone.querySelector(".opus-card");
        return Math.round(card ? card.offsetHeight : clone.getBoundingClientRect().height);
      });
      const result = layoutRows(
        naturalHeights.map((height) => ({ height })),
        {
          columnWidth: info.columnWidth,
          columns: info.columns,
          rowGutter: DEFAULT_ROW_GUTTER,
          columnGutter: DEFAULT_COLUMN_GUTTER
        }
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
          clamp.el.style.setProperty("-webkit-line-clamp", String(lines));
        }
      });
      state3.active = true;
      state3.mode = "native";
      state3.items = clones.length;
      state3.columns = info.columns;
      state3.rows = result.rowHeights.length;
      state3.rowHeights = result.rowHeights;
      state3.lastError = "";
      state3.lastApplyAt = Date.now();
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
        state3.lastError = String(err);
        log4.warn("统一行高失败", err);
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
        state3.lastError = String(err);
        log4.warn("统一行高排版失败", err);
      }
    }, delay);
  }
  function onGridLoad() {
    scheduleLayout(80);
  }
  function onResize() {
    scheduleRebuild(150);
  }
  function btItems() {
    if (!btGrid) return [];
    return Array.from(btGrid.children).filter(
      (el) => el.classList && el.classList.contains("bt-opus-item")
    );
  }
  function btInfo(items) {
    const first = items[0];
    if (!first) return null;
    const opus = window.BILI_TOOLS && window.BILI_TOOLS.opus;
    const opusState = opus && opus.state;
    if (opusState && opusState.columns > 0 && opusState.columnWidth > 0) {
      return { columns: opusState.columns, columnWidth: opusState.columnWidth };
    }
    const firstWidth = parseFloat(first.style.width) || first.getBoundingClientRect().width || 0;
    if (!(firstWidth > 0)) return null;
    const top = Math.round(first.getBoundingClientRect().top);
    const columns = items.filter(
      (el) => Math.abs(Math.round(el.getBoundingClientRect().top) - top) <= 2
    ).length;
    return { columns: Math.max(1, columns), columnWidth: firstWidth };
  }
  function btApply() {
    if (!btGrid || !btGrid.isConnected) {
      attachTarget(null);
      return;
    }
    const items = btItems();
    if (!items.length) return;
    const info = btInfo(items);
    if (!info) return;
    if (btApplying) return;
    btApplying = true;
    try {
      btGrid.classList.remove(BT_ROOT_CLASS);
      for (const item of items) {
        item.style.removeProperty("height");
        item.style.removeProperty("transform");
        item.style.width = `${info.columnWidth}px`;
        const clamp = clampElement(item);
        if (clamp) clamp.el.style.setProperty("-webkit-line-clamp", String(clamp.base));
        setCloneCoverRatio(item);
      }
      void btGrid.offsetHeight;
      const naturalHeights = items.map((item) => {
        const card = item.querySelector(".opus-card");
        return Math.round(card ? card.offsetHeight : item.getBoundingClientRect().height);
      });
      const result = layoutRows(
        naturalHeights.map((height) => ({ height })),
        {
          columnWidth: info.columnWidth,
          columns: info.columns,
          rowGutter: DEFAULT_ROW_GUTTER,
          columnGutter: DEFAULT_COLUMN_GUTTER
        }
      );
      btGrid.classList.add(BT_ROOT_CLASS);
      btGrid.style.width = `${result.width}px`;
      btGrid.style.height = `${result.height}px`;
      items.forEach((item, index) => {
        const pos = result.positions[index];
        item.style.height = `${pos.height}px`;
        item.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
        const extra = Math.max(0, pos.height - naturalHeights[index]);
        const clamp = clampElement(item);
        if (clamp && extra > 0) {
          const lines = clamp.base + Math.min(20, Math.floor(extra / clamp.lineHeight));
          clamp.el.style.setProperty("-webkit-line-clamp", String(lines));
        }
      });
      state3.active = true;
      state3.mode = "bt";
      state3.items = items.length;
      state3.columns = info.columns;
      state3.rows = result.rowHeights.length;
      state3.rowHeights = result.rowHeights;
      state3.lastError = "";
      state3.lastApplyAt = Date.now();
      btIgnoreUntil = Date.now() + 200;
    } finally {
      btApplying = false;
    }
  }
  function scheduleBtApply(delay = 60) {
    if (!btGrid) return;
    if (btTimer) clearTimeout(btTimer);
    btTimer = setTimeout(() => {
      btTimer = null;
      try {
        btApply();
      } catch (err) {
        state3.lastError = String(err);
        log4.warn("统一行高（02 网格）失败", err);
      }
    }, delay);
  }
  function detachBt() {
    if (btObserver) {
      btObserver.disconnect();
      btObserver = null;
    }
    if (btAttrObserver) {
      btAttrObserver.disconnect();
      btAttrObserver = null;
    }
    if (btTimer) {
      clearTimeout(btTimer);
      btTimer = null;
    }
    if (btGrid) {
      const items = btItems();
      for (const item of items) {
        item.style.removeProperty("height");
        item.style.removeProperty("transform");
        item.style.removeProperty("width");
        const clamp = clampElement(item);
        if (clamp) clamp.el.style.setProperty("-webkit-line-clamp", String(clamp.base));
      }
      btGrid.classList.remove(BT_ROOT_CLASS);
      btGrid.removeEventListener("load", onBtLoad, true);
      const opus = window.BILI_TOOLS && window.BILI_TOOLS.opus;
      if (opus && typeof opus.refresh === "function" && opus.active) {
        try {
          opus.refresh();
        } catch {
        }
      }
      btGrid = null;
    }
    if (btResizeBound) {
      window.removeEventListener("resize", onBtResize);
      btResizeBound = false;
    }
  }
  function onBtLoad() {
    scheduleBtApply(80);
  }
  function onBtResize() {
    scheduleBtApply(120);
  }
  function attachBt(next) {
    btGrid = next.grid;
    btGrid.classList.add(BT_ROOT_CLASS);
    btObserver = new MutationObserver(() => scheduleBtApply(30));
    btObserver.observe(btGrid, { childList: true, subtree: true });
    btAttrObserver = new MutationObserver(() => {
      if (btApplying) return;
      if (Date.now() < btIgnoreUntil) return;
      scheduleBtApply(80);
    });
    btAttrObserver.observe(btGrid, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true
    });
    btGrid.addEventListener("load", onBtLoad, true);
    window.addEventListener("resize", onBtResize, { passive: true });
    btResizeBound = true;
    state3.active = true;
    log4.info("已接管 02 分页网格，开始统一行高");
    scheduleBtApply(0);
  }
  function attachTarget(next) {
    if (btGrid && next && next.mode === "bt" && btGrid === next.grid) return;
    if (source && next && next.mode === "native" && source === next.source && wrap && wrap.isConnected) return;
    if (!btGrid && !source && !next) return;
    detachBt();
    detachSource();
    if (!next) return;
    if (next.mode === "bt") attachBt(next);
    else attachSource(next);
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
      grid.removeEventListener("load", onGridLoad, true);
      boundLoad = false;
    }
    if (boundResize) {
      window.removeEventListener("resize", onResize);
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
    cloneSignature = "";
    source = null;
    masonry = null;
    state3.active = false;
    state3.mode = null;
    state3.items = 0;
    state3.columns = 0;
    state3.rows = 0;
    state3.rowHeights = [];
  }
  function attachSource(next) {
    if (source && next && source === next.source && wrap && wrap.isConnected) return;
    if (!source && !next) return;
    detachSource();
    if (!next) return;
    source = next.source;
    masonry = next.masonry;
    hideHost = masonry.closest(".opus") || masonry.closest(".opus-body") || masonry.parentElement || document.body;
    hideHost.classList.add(HIDE_CLASS);
    wrap = document.createElement("div");
    wrap.className = WRAP_CLASS2;
    grid = document.createElement("div");
    grid.className = GRID_CLASS;
    wrap.appendChild(grid);
    const feed = masonry.closest(".opus-feed");
    const parent = feed && feed.parentElement || masonry.parentElement;
    if (feed && feed.nextSibling) parent.insertBefore(wrap, feed.nextSibling);
    else parent.appendChild(wrap);
    sourceObserver = new MutationObserver(() => scheduleRebuild(120));
    sourceObserver.observe(source, {
      childList: true,
      subtree: true,
      characterData: true
    });
    grid.addEventListener("load", onGridLoad, true);
    boundLoad = true;
    window.addEventListener("resize", onResize, { passive: true });
    boundResize = true;
    state3.active = true;
    log4.info("已接管原生图文网格，开始统一行高");
    scheduleRebuild(0);
  }
  function start3() {
    if (running3) return;
    running3 = true;
    startedAt = Date.now();
    addStyle(STYLE_ID4, CSS4);
    exposeDebug3();
    log4.info(`统一行高脚本 v${VERSION3} 启动`);
    mainTimer3 = setInterval(() => {
      const next = findTarget();
      attachTarget(next);
      if (btGrid && btGrid.isConnected) {
        if (btItems().length !== state3.items || Date.now() - state3.lastApplyAt > 3e3) {
          scheduleBtApply(0);
        }
      } else if (source && source.isConnected) {
        const items = sourceItems();
        if (signatureOf(items) !== cloneSignature) scheduleRebuild(0);
        else if (Date.now() - state3.lastApplyAt > 3e3) scheduleLayout(0);
      }
    }, 500);
    attachTarget(findTarget());
  }
  function stop3() {
    if (!running3) return;
    running3 = false;
    if (mainTimer3) {
      clearInterval(mainTimer3);
      mainTimer3 = null;
    }
    detachBt();
    detachSource();
    state3.lastError = "";
    log4.info("统一行高脚本已停止");
  }
  if (false) {
    const previous2 = window[GLOBAL_KEY];
    if (!previous2 || previous2.version !== VERSION3) {
      window[GLOBAL_KEY] = { version: VERSION3, startedAt: Date.now() };
      start3();
    } else {
      log4.debug("统一行高脚本已注入，跳过重复初始化");
    }
  }

  // src/shared/module-settings.js
  var STORAGE_KEY2 = "biliTools:modules";
  var DEFAULT_MODULES = {
    dyn: true,
    opus: true,
    row: true
  };
  function readSaved() {
    try {
      if (typeof GM_getValue === "function") {
        const raw = GM_getValue(STORAGE_KEY2);
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (parsed && typeof parsed === "object") return parsed;
        }
      }
    } catch {
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY2);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {
    }
    return {};
  }
  function loadModuleSettings() {
    const saved = { ...DEFAULT_MODULES, ...readSaved() };
    try {
      const override = window.__BILI_TOOLS_MODULES__;
      if (override && typeof override === "object") {
        for (const key of Object.keys(DEFAULT_MODULES)) {
          if (typeof override[key] === "boolean") saved[key] = override[key];
        }
      }
    } catch {
    }
    return saved;
  }
  function saveModuleSettings(settings2) {
    const raw = JSON.stringify(settings2);
    try {
      if (typeof GM_setValue === "function") GM_setValue(STORAGE_KEY2, raw);
    } catch {
    }
    try {
      localStorage.setItem(STORAGE_KEY2, raw);
    } catch {
    }
  }

  // src/scripts/bili-space-tools.js
  var VERSION4 = "1.0.0";
  var SCOPE4 = "all";
  var GLOBAL_KEY3 = "__biliToolsAllLoaded__";
  var log5 = createLogger(SCOPE4);
  var settings = loadModuleSettings();
  var MODULES = [
    { key: "dyn", label: "动态翻页" },
    { key: "opus", label: "图文翻页" },
    { key: "row", label: "统一行高" }
  ];
  var state4 = {
    page: null,
    dyn: false,
    opus: false,
    row: false
  };
  var menuIds = { dyn: null, opus: null, row: null };
  var routeTimer = null;
  function pageKind() {
    const path = location.pathname;
    if (/\/dynamic(?:\/|$)/.test(path)) return "dynamic";
    if (/\/upload\/opus(?:\/|$)/.test(path)) return "opus";
    return "other";
  }
  function markState(key, value) {
    state4[key] = value;
    const mod = MODULES.find((item) => item.key === key);
    if (mod) mod.active = value;
  }
  function apply() {
    const page = pageKind();
    state4.page = page;
    if (page === "dynamic") {
      stop2();
      markState("opus", false);
      stop3();
      markState("row", false);
      if (settings.dyn) {
        start();
        markState("dyn", true);
      } else {
        stop();
        markState("dyn", false);
      }
    } else if (page === "opus") {
      stop();
      markState("dyn", false);
      if (settings.opus) {
        start2();
        markState("opus", true);
      } else {
        stop2();
        markState("opus", false);
      }
      if (settings.row) {
        start3();
        markState("row", true);
      } else {
        stop3();
        markState("row", false);
      }
    } else {
      stop();
      stop2();
      stop3();
      markState("dyn", false);
      markState("opus", false);
      markState("row", false);
    }
  }
  function menuLabel(mod) {
    return `${mod.label}：${settings[mod.key] ? "开" : "关"}`;
  }
  function refreshMenus() {
    if (window.top !== window) return;
    if (typeof GM_registerMenuCommand !== "function") return;
    for (const mod of MODULES) {
      const oldId = menuIds[mod.key];
      if (oldId !== null && typeof GM_unregisterMenuCommand === "function") {
        try {
          GM_unregisterMenuCommand(oldId);
        } catch {
        }
        menuIds[mod.key] = null;
      }
      try {
        menuIds[mod.key] = GM_registerMenuCommand(menuLabel(mod), () => toggle(mod.key));
      } catch {
      }
    }
  }
  function toggle(key) {
    if (!(key in settings)) return;
    settings[key] = !settings[key];
    saveModuleSettings(settings);
    refreshMenus();
    apply();
    const mod = MODULES.find((item) => item.key === key);
    const label = mod ? mod.label : key;
    toast(`${label}：${settings[key] ? "开" : "关"}`, { duration: 1500 });
  }
  function checkRoute() {
    if (pageKind() !== state4.page) apply();
  }
  function exposeDebug4() {
    window.BILI_TOOLS = window.BILI_TOOLS || {};
    window.BILI_TOOLS.all = {
      version: VERSION4,
      settings,
      modules: MODULES,
      get state() {
        return {
          page: state4.page,
          dyn: state4.dyn,
          opus: state4.opus,
          row: state4.row
        };
      },
      apply,
      toggle
    };
  }
  function start4() {
    exposeDebug4();
    refreshMenus();
    setTimeout(refreshMenus, 0);
    setTimeout(refreshMenus, 300);
    apply();
    window.addEventListener("popstate", checkRoute);
    window.addEventListener("hashchange", checkRoute);
    routeTimer = setInterval(checkRoute, 500);
    log5.info(`B站空间页增强 v${VERSION4} 启动`, { page: state4.page, settings });
  }
  function stop4() {
    if (routeTimer) {
      clearInterval(routeTimer);
      routeTimer = null;
    }
    window.removeEventListener("popstate", checkRoute);
    window.removeEventListener("hashchange", checkRoute);
    stop();
    stop2();
    stop3();
    delete window[GLOBAL_KEY3];
    log5.info("B站空间页增强已停止");
  }
  var previous = window[GLOBAL_KEY3];
  if (!previous || previous.version !== VERSION4) {
    window[GLOBAL_KEY3] = { version: VERSION4, startedAt: Date.now() };
    start4();
  } else {
    log5.debug("B站空间页增强已注入，跳过重复初始化");
  }
})();
