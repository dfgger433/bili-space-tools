/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站图文统一行高（独立脚本）
// @name:zh-CN   B站图文统一行高（独立脚本）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.2.1
// @description  依赖“B站图文翻页”脚本的网格，只统一每行卡片高度并展开被省略的文字；不包含分页/菜单/预取。
// @description:zh-CN 依赖“B站图文翻页”脚本的网格，只统一每行卡片高度并展开被省略的文字；不包含分页/菜单/预取。
// @author       bili-space-tools
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://*.bilibili.com/*/upload/opus
// @match        *://*.bilibili.com/*/upload/opus/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  // src/opus/model.js
  var DEFAULT_ROW_GUTTER = 18;
  var DEFAULT_COLUMN_GUTTER = 20;

  // src/opus/layout.js
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
    for (let start2 = 0; start2 < list.length; start2 += m) {
      const row = list.slice(start2, start2 + m);
      const rowIndex = rowHeights.length;
      const rowHeight = row.reduce((max, item) => Math.max(max, Number(item && item.height) || 0), 0);
      rowHeights.push(rowHeight);
      row.forEach((item, column) => {
        positions[start2 + column] = {
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

  // src/scripts/opus-uniform-row.js
  var VERSION = "0.2.1";
  var SCOPE = "opus-row";
  var STYLE_ID = "bili-tools-opus-row-style";
  var ROOT_CLASS = "bt-opus-uniform-root";
  var TITLE_LINE_HEIGHT = 16.8;
  var TEXT_LINE_HEIGHT = 20;
  var COLUMN_GAP = DEFAULT_COLUMN_GUTTER;
  var ROW_GAP = DEFAULT_ROW_GUTTER;
  var log = createLogger(SCOPE);
  var CSS = `
.${ROOT_CLASS} > .bt-opus-item .opus-card,.${ROOT_CLASS} > .item .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${ROOT_CLASS} > .bt-opus-item .bili-cover-card,.${ROOT_CLASS} > .item .bili-cover-card{overflow:hidden}
.${ROOT_CLASS} > .bt-opus-item .bili-cover-card__thumbnail img,.${ROOT_CLASS} > .item .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${ROOT_CLASS} > .bt-opus-item .opus-card--only-text,.${ROOT_CLASS} > .item .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${ROOT_CLASS} > .bt-opus-item .opus-card--only-text .opus-card__icons,.${ROOT_CLASS} > .item .opus-card--only-text .opus-card__icons{margin-top:auto}
`;
  var state = {
    active: false,
    version: VERSION,
    mode: null,
    items: 0,
    columns: 0,
    rows: 0,
    rowHeights: [],
    lastError: "",
    lastApplyAt: 0
  };
  var target = null;
  var observer = null;
  var attrObserver = null;
  var applyTimer = null;
  var applying = false;
  var ignoreStyleUntil = 0;
  function exposeDebug() {
    window.BILI_TOOLS = window.BILI_TOOLS || {};
    window.BILI_TOOLS.row = {
      version: VERSION,
      state,
      apply: () => scheduleApply(0)
    };
  }
  function itemsOf(t) {
    if (!t) return [];
    if (t.mode === "bt") {
      return Array.from(t.root.children).filter(
        (el) => el.classList && el.classList.contains("bt-opus-item")
      );
    }
    return Array.from(t.root.children).filter((el) => el.classList && el.classList.contains("item"));
  }
  function findTarget() {
    const btGrid = document.querySelector(".bt-opus-grid");
    if (btGrid && itemsOf({ mode: "bt", root: btGrid }).length) {
      return { mode: "bt", root: btGrid, grid: btGrid };
    }
    const masonry = document.querySelector(".masonry_grid_v2");
    if (!masonry) return null;
    let root = masonry.querySelector(".container");
    if (!root || !itemsOf({ mode: "native", root }).length) {
      const sample = masonry.querySelector(".item");
      root = sample && sample.parentElement || root;
    }
    if (root && itemsOf({ mode: "native", root }).length) {
      return { mode: "native", root, grid: masonry };
    }
    return null;
  }
  function resolveInfo(t, items) {
    const first = items[0];
    const firstWidth = first ? first.getBoundingClientRect().width : 0;
    if (t.mode === "bt") {
      const opusState = window.BILI_TOOLS && window.BILI_TOOLS.opus && window.BILI_TOOLS.opus.state;
      if (opusState && opusState.columns > 0 && opusState.columnWidth > 0) {
        return { columns: opusState.columns, columnWidth: opusState.columnWidth };
      }
    }
    if (!first || firstWidth <= 0) return null;
    let columns = 0;
    const containerWidth = parseFloat(t.grid.style.getPropertyValue("--container-width")) || 0;
    if (containerWidth > 0) {
      columns = Math.round((containerWidth + COLUMN_GAP) / (firstWidth + COLUMN_GAP));
    }
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
  function resetItem(item) {
    item.style.removeProperty("height");
    item.style.removeProperty("transform");
    const clamp = clampElement(item);
    if (clamp) clamp.el.style.setProperty("-webkit-line-clamp", String(clamp.base));
  }
  function setCoverRatio(item) {
    const cover = item.querySelector(".bili-cover-card");
    const img = cover && cover.querySelector("img");
    if (!cover || !img || !img.naturalWidth || !img.naturalHeight) return;
    cover.style.setProperty(
      "--bili-cover-card-ratio",
      `${img.naturalHeight / img.naturalWidth * 100}%`
    );
  }
  function restoreNativeCover(item) {
    if (!target || target.mode !== "native") return;
    const img = item.querySelector(".bili-cover-card img");
    if (!img) return;
    const src = img.getAttribute("src") || "";
    if (src.includes("@") && img.getAttribute("data-bt-full") !== "1") {
      img.setAttribute("data-bt-full", "1");
      img.setAttribute("src", `${src.replace(/@[^/]*$/, "")}@640w.webp`);
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
      t.root.style.removeProperty("height");
      if (t.grid) t.grid.style.removeProperty("height");
      for (const item of items) resetItem(item);
      for (const item of items) {
        restoreNativeCover(item);
        setCoverRatio(item);
      }
      void t.root.offsetHeight;
      const naturalHeights = items.map((item) => {
        const card = item.querySelector(".opus-card");
        return Math.round(card ? card.offsetHeight : item.getBoundingClientRect().height);
      });
      const layout = layoutRows(
        naturalHeights.map((height) => ({ height })),
        {
          columnWidth: info.columnWidth,
          columns: info.columns,
          rowGutter: ROW_GAP,
          columnGutter: COLUMN_GAP
        }
      );
      t.root.classList.add(ROOT_CLASS);
      if (t.mode === "bt") {
        t.root.style.width = `${layout.width}px`;
        t.root.style.height = `${layout.height}px`;
      } else {
        t.root.style.height = `${layout.height}px`;
        if (t.grid) {
          t.grid.style.setProperty("--container-height", `${layout.height}px`);
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
          clamp.el.style.setProperty("-webkit-line-clamp", String(lines));
        }
      });
      state.active = true;
      state.mode = t.mode;
      state.items = items.length;
      state.columns = info.columns;
      state.rows = layout.rowHeights.length;
      state.rowHeights = layout.rowHeights;
      state.lastError = "";
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
        log.warn("统一行高失败", err);
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
      target.root.removeEventListener("load", onImageLoad, true);
    }
    window.removeEventListener("resize", onResize);
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
    if (next.mode === "native") {
      attrObserver = new MutationObserver(onStylesChanged);
      attrObserver.observe(next.root, { attributes: true, attributeFilter: ["style"], subtree: true });
    }
    next.root.addEventListener("load", onImageLoad, true);
    window.addEventListener("resize", onResize, { passive: true });
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
      if (target && Date.now() - state.lastApplyAt > 3e3) scheduleApply(0);
    }, 500);
    attachTarget(findTarget());
  }
  var GLOBAL_KEY = "__biliToolsOpusRowLoaded__";
  var previous = window[GLOBAL_KEY];
  if (!previous || previous.version !== VERSION) {
    window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
    start();
  } else {
    log.debug("统一行高脚本已注入，跳过重复初始化");
  }
})();
