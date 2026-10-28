/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站图文翻页（每页20条）
// @name:zh-CN   B站图文翻页（每页20条）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.1.0
// @description  把 B 站用户空间图文页改为翻页浏览，每页 20 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生卡片与分页样式。
// @description:zh-CN 把 B 站用户空间图文页改为翻页浏览，每页 20 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生卡片与分页样式。
// @author       bili-space-tools
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://*.bilibili.com/*/upload/opus
// @match        *://*.bilibili.com/*/upload/opus/*
// @run-at       document-start
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
        let start;
        let end;
        if (page <= 5) {
          start = 1;
          end = 7;
        } else if (totalPages2 - page > 4) {
          start = page - 2;
          end = page + 2;
        } else {
          start = totalPages2 - 6;
          end = totalPages2;
        }
        if (showFirstBlock) {
          pushNum(1);
          pushMore(-5, page - 5 < 1);
        }
        for (let n = start; n <= end; n += 1) pushNum(n);
        if (showLastBlock) {
          pushMore(5, page + 5 > totalPages2);
          pushNum(totalPages2);
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

  // src/opus/model.js
  var PAGE_SIZE = 20;
  var DEFAULT_ROW_GUTTER = 18;
  var DEFAULT_COLUMN_GUTTER = 20;
  var THRESHOLD_OF_WATERFALL = 10;
  function normalizeUrl(url) {
    if (!url) return "";
    const value = String(url);
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("http://")) return `https://${value.slice(7)}`;
    return value;
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
  function buildCoverCard(item) {
    const view = item.view || {};
    const href = normalizeHref(view.jump_url);
    const title = view.content || "";
    const cover = item.cover || {};
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
          src: cover.src,
          alt: title.slice(0, 80),
          loading: "lazy",
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
  function buildOpusCard(item) {
    const root = create("div", {
      className: "opus-card",
      attrs: { "data-bt-key": item.key || "" }
    });
    root.appendChild(item.cover && item.cover.src ? buildCoverCard(item) : buildTextCard(item));
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

  // src/opus/adapter.js
  var log = createLogger("opus");
  var API_PATH = "/x/polymer/web-dynamic/v1/opus/feed/space";
  function parseParams(url) {
    try {
      const u = new URL(String(url), location.href);
      return Object.fromEntries(u.searchParams.entries());
    } catch {
      return {};
    }
  }
  function installCapture(onResponse) {
    if (window.__biliToolsOpusCaptureInstalled) return;
    window.__biliToolsOpusCaptureInstalled = true;
    log.info("已安装 opus 接口观察器");
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype && !XHR.prototype.__biliToolsPatched) {
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
              log.warn("解析 opus 响应失败", err);
            }
          };
          xhr.addEventListener("readystatechange", report);
          xhr.addEventListener("load", report);
        }
        return rawSend.apply(this, args);
      };
      XHR.prototype.__biliToolsPatched = true;
    }
    if (typeof window.fetch === "function" && !window.fetch.__biliToolsPatched) {
      const rawFetch = window.fetch;
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
      window.fetch = patchedFetch;
    }
  }
  function getVueApp() {
    const candidates = [document.getElementById("app"), document.querySelector("[data-v-app]")];
    for (const el of candidates) {
      if (el && el.__vue_app__) return el.__vue_app__;
    }
    return null;
  }
  function findWaterfall(app) {
    if (!app) return null;
    const containerCandidates = [
      app._container,
      document.getElementById("app"),
      document.querySelector("[data-v-app]")
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
      log.info("数据通道：Vue 实例（WaterfallGrid）");
      return createVueAdapter(inst, capture2);
    }
    if (capture2 && capture2.items.length > 0) {
      log.info("数据通道：网络抓包");
      return createNetworkAdapter(capture2);
    }
    if (inst) {
      log.info("数据通道：Vue 实例（等待数据）");
      return createVueAdapter(inst, capture2);
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
  var VERSION = "0.1.0";
  var SCOPE = "opus";
  var STYLE_ID2 = "bili-tools-opus-style";
  var ACTIVE_CLASS = "bili-tools-opus-active";
  var WRAP_CLASS = "bt-opus-wrap";
  var PAGER_CLASS = "bt-opus-pager";
  var HEADER_OFFSET = 64;
  var BOOT_TIMEOUT = 2e4;
  var LOAD_TIMEOUT = 2e4;
  var log2 = createLogger(SCOPE);
  var capture = createCaptureState();
  var state = {
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
    routeKey: "",
    nextBootAt: 0,
    observer: null,
    refreshTimer: null,
    resizeTimer: null,
    pollTimer: null
  };
  var CSS2 = `
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
  function startStyle() {
    addStyle(STYLE_ID2, CSS2);
  }
  function maybeBoot() {
    if (state.active || state.booting) return;
    if (!isOpusRoute()) return;
    if (Date.now() < state.nextBootAt) return;
    state.nextBootAt = Date.now() + 3e3;
    void boot();
  }
  async function boot() {
    if (state.active || state.booting || !isOpusRoute()) return;
    state.booting = true;
    try {
      startStyle();
      const feed = await waitForElement(".opus-feed", { timeout: BOOT_TIMEOUT }).catch(() => null);
      if (!feed) {
        log2.info("未找到 .opus-feed，稍后重试");
        return;
      }
      const ready = await waitForData(15e3);
      if (!ready) {
        log2.info("图文列表暂无可接管的数据（未登录 / 空列表），稍后重试");
        return;
      }
      activate(feed);
    } catch (err) {
      log2.warn("启动失败", err);
    } finally {
      state.booting = false;
      state.nextBootAt = Date.now() + 3e3;
    }
  }
  async function waitForData(timeout) {
    const start = Date.now();
    for (; ; ) {
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
    state.opusEl = feed.closest(".opus") || document.querySelector(".opus") || document.body;
    state.opusEl.classList.add(ACTIVE_CLASS);
    state.adapter = createAdapter(capture);
    if (!state.adapter) {
      log2.warn("没有可用的数据通道");
      teardown();
      return;
    }
    state.type = capture.type;
    state.tab = activeTabText();
    log2.info("已启用", { adapter: state.adapter.kind, version: VERSION });
    ensureWrap();
    ensurePager();
    bindObservers();
    refresh(true);
  }
  function onCapture(evt) {
    capture.onResponse(evt);
    if (!state.active) return;
    const page = Number(evt.params && evt.params.page) || 1;
    const type = evt.params && evt.params.type || capture.type;
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
    const el = document.querySelector(".opus-header .content-tab.active");
    return el ? (el.textContent || "").trim() : "";
  }
  function isOurNode(node) {
    if (!node || node.nodeType !== 1 || typeof node.closest !== "function") return false;
    return Boolean(node.closest(`.${WRAP_CLASS}`) || node.closest(`.${PAGER_CLASS}`));
  }
  function feedElement() {
    return document.querySelector(".opus-feed");
  }
  function ensureWrap() {
    const feed = feedElement();
    if (!feed) {
      teardown();
      return;
    }
    if (feed !== state.feedEl) {
      state.feedEl = feed;
      state.opusEl = feed.closest(".opus") || document.querySelector(".opus") || document.body;
    }
    state.opusEl.classList.add(ACTIVE_CLASS);
    if (!state.wrapEl) {
      state.wrapEl = create("div", { className: WRAP_CLASS });
      state.gridEl = create("div", { className: "bt-opus-grid" });
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
        }
      });
    }
    const footer = document.querySelector(".opus-footer") || state.opusEl;
    if (footer && state.pager.el.parentElement !== footer) {
      footer.appendChild(state.pager.el);
    }
  }
  function resolveLayout() {
    let cw = state.adapter ? state.adapter.getColumnWidth() : 0;
    let columns = 0;
    let containerWidth = 0;
    const masonry = document.querySelector(".masonry_grid_v2");
    if (masonry) {
      const raw = masonry.style.getPropertyValue("--container-width") || getComputedStyle(masonry).getPropertyValue("--container-width");
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
    if (!state.active) return;
    ensureWrap();
    if (!state.feedEl) return;
    if (!state.adapter || state.adapter.isValid && !state.adapter.isValid()) {
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
    if (loaded > 0) maybeRender(force);
    updatePager();
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
      slice.map((item) => item.key).join(",")
    ].join("|");
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
      columnGutter: DEFAULT_COLUMN_GUTTER
    });
    grid.style.width = `${layout.width}px`;
    grid.style.height = `${layout.height}px`;
    const frag = document.createDocumentFragment();
    slice.forEach((item, index) => {
      const pos = layout.positions[index] || { left: 0, top: 0 };
      const el = create("div", {
        className: "bt-opus-item",
        style: {
          width: `${state.cw}px`,
          height: `${Math.max(0, item.height)}px`,
          transform: `translate(${pos.left}px, ${pos.top}px)`
        }
      });
      el.appendChild(buildOpusCard(item));
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
      busyText: state.busyText
    });
  }
  function scrollToFeedTop() {
    const el = state.wrapEl || state.feedEl;
    if (!el) return;
    const top = Math.max(0, window.scrollY + el.getBoundingClientRect().top - HEADER_OFFSET);
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: "auto" });
  }
  function loadedNow() {
    return state.adapter ? state.adapter.getLoaded() : state.loaded;
  }
  async function ensureLoaded(need) {
    const start = Date.now();
    let noGrowth = 0;
    while (loadedNow() < need) {
      if (!state.hasMore) break;
      if (Date.now() - start > LOAD_TIMEOUT) throw new Error("加载超时");
      if (state.adapter.getLoading && state.adapter.getLoading()) {
        await sleep(150);
        continue;
      }
      const before = loadedNow();
      await state.adapter.loadMore();
      try {
        await waitFor(
          () => loadedNow() > before || state.adapter.getHasMore() === false,
          { timeout: LOAD_TIMEOUT, interval: 150, label: "opus-load-more" }
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
        toast(`加载第 ${target} 页失败：${err.message}`, { type: "error" });
        return false;
      }
      state.busy = false;
      state.busyText = "";
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
    if (!state.onResize) {
      state.onResize = () => {
        if (state.resizeTimer) clearTimeout(state.resizeTimer);
        state.resizeTimer = setTimeout(() => {
          state.resizeTimer = null;
          refresh(true);
        }, 320);
      };
      window.addEventListener("resize", state.onResize, { passive: true });
    }
    if (!state.onTabClick) {
      state.onTabClick = (event) => {
        const tab = event.target && event.target.closest && event.target.closest(".content-tab");
        if (!tab) return;
        setTimeout(() => {
          state.page = 1;
          state.tab = activeTabText();
          refresh(true);
        }, 120);
      };
      document.addEventListener("click", state.onTabClick, true);
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
      window.removeEventListener("resize", state.onResize);
      state.onResize = null;
    }
    if (state.onTabClick) {
      document.removeEventListener("click", state.onTabClick, true);
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
    if (state.wrapEl) {
      state.wrapEl.remove();
      state.wrapEl = null;
      state.gridEl = null;
    }
    if (state.opusEl) state.opusEl.classList.remove(ACTIVE_CLASS);
    log2.info("已停止（离开图文页或列表消失）");
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
      type: "",
      tab: "",
      busy: false,
      busyText: "",
      renderKey: "",
      feedEl: null,
      opusEl: null
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
          busy: state.busy
        };
      },
      goTo: (page) => goTo(page),
      next: () => goTo(state.page + 1),
      prev: () => goTo(state.page - 1),
      refresh: () => {
        if (state.active) refresh(true);
        else void boot();
      },
      teardown
    };
  }
  function main() {
    startStyle();
    installCapture(onCapture);
    exposeDebug();
    window.addEventListener("popstate", watchRoute);
    window.addEventListener("hashchange", watchRoute);
    setInterval(watchRoute, 500);
    watchRoute();
  }
  var GLOBAL_KEY = "__biliToolsOpusLoaded__";
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
    main();
  } else {
    log2.debug("opus 脚本已注入，跳过重复初始化");
  }
})();
