/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站图文统一行高（独立脚本）
// @name:zh-CN   B站图文统一行高（独立脚本）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.1.0
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
  var VERSION = "0.1.0";
  var SCOPE = "opus-row";
  var STYLE_ID = "bili-tools-opus-row-style";
  var GRID_CLASS = "bt-opus-uniform";
  var GRID_SELECTOR = ".bt-opus-grid";
  var TITLE_LINE_HEIGHT = 16.8;
  var TEXT_LINE_HEIGHT = 20;
  var log = createLogger(SCOPE);
  var CSS = `
.${GRID_CLASS} .bt-opus-item .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${GRID_CLASS} .bt-opus-item .bili-cover-card{overflow:hidden}
.${GRID_CLASS} .bt-opus-item .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${GRID_CLASS} .bt-opus-item .opus-card--only-text{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.${GRID_CLASS} .bt-opus-item .opus-card--only-text .opus-card__icons{margin-top:auto}
`;
  var state = {
    active: false,
    version: VERSION,
    grid: null,
    rows: 0,
    columns: 0,
    rowHeights: [],
    items: 0
  };
  var observer = null;
  var applyTimer = null;
  function exposeDebug() {
    window.BILI_TOOLS = window.BILI_TOOLS || {};
    window.BILI_TOOLS.row = {
      version: VERSION,
      state,
      apply: () => scheduleApply(0)
    };
  }
  function resolveGridInfo(grid, items) {
    const opusState = window.BILI_TOOLS && window.BILI_TOOLS.opus && window.BILI_TOOLS.opus.state;
    const first = items[0];
    const firstWidth = first ? first.getBoundingClientRect().width : 0;
    if (opusState && opusState.columns > 0 && opusState.columnWidth > 0) {
      return { columns: opusState.columns, columnWidth: opusState.columnWidth };
    }
    if (!first || firstWidth <= 0) return null;
    const firstTop = Math.round(first.getBoundingClientRect().top);
    const columns = items.filter((el) => Math.abs(Math.round(el.getBoundingClientRect().top) - firstTop) <= 2).length;
    return { columns: Math.max(1, columns), columnWidth: firstWidth };
  }
  function clearInlineLayout(items) {
    for (const item of items) {
      item.style.removeProperty("height");
      item.style.removeProperty("transform");
      const title = item.querySelector(".bt-opus-title-text");
      const text = item.querySelector(".bt-opus-text-clamp");
      if (title) title.style.removeProperty("-webkit-line-clamp");
      if (text) text.style.removeProperty("-webkit-line-clamp");
    }
  }
  function setNaturalCoverRatio(item) {
    const cover = item.querySelector(".bili-cover-card");
    const img = cover && cover.querySelector("img");
    if (!cover || !img || !img.naturalWidth || !img.naturalHeight) return;
    cover.style.setProperty("--bili-cover-card-ratio", `${img.naturalHeight / img.naturalWidth * 100}%`);
  }
  function apply() {
    const grid = state.grid;
    if (!grid || !grid.isConnected) {
      attachGrid(null);
      return;
    }
    const items = Array.from(grid.children).filter(
      (el) => el.classList && el.classList.contains("bt-opus-item")
    );
    if (!items.length) return;
    const info = resolveGridInfo(grid, items);
    if (!info) return;
    const { columns, columnWidth } = info;
    grid.classList.remove(GRID_CLASS);
    clearInlineLayout(items);
    grid.style.removeProperty("height");
    for (const item of items) setNaturalCoverRatio(item);
    void grid.offsetHeight;
    const naturalHeights = items.map((item) => {
      const card = item.querySelector(".opus-card");
      return Math.round(card ? card.offsetHeight : item.getBoundingClientRect().height);
    });
    const layout = layoutRows(
      naturalHeights.map((height) => ({ height })),
      {
        columnWidth,
        columns,
        rowGutter: DEFAULT_ROW_GUTTER,
        columnGutter: DEFAULT_COLUMN_GUTTER
      }
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
      const title = item.querySelector(".bt-opus-title-text");
      const text = item.querySelector(".bt-opus-text-clamp");
      if (title && extra > 0) {
        const lines = 2 + Math.min(20, Math.floor(extra / TITLE_LINE_HEIGHT));
        title.style.setProperty("-webkit-line-clamp", String(lines));
      } else if (text && extra > 0) {
        const lines = 3 + Math.min(20, Math.floor(extra / TEXT_LINE_HEIGHT));
        text.style.setProperty("-webkit-line-clamp", String(lines));
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
  function attachGrid(grid) {
    if (grid === state.grid && grid) return;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (state.grid) {
      state.grid.classList.remove(GRID_CLASS);
      state.grid.removeEventListener("load", onImageLoad, true);
    }
    window.removeEventListener("resize", onResize);
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
    grid.addEventListener("load", onImageLoad, true);
    window.addEventListener("resize", onResize, { passive: true });
    state.active = true;
    log.info("已连接到图文翻页网格，开始统一行高");
    scheduleApply(0);
  }
  function start() {
    addStyle(STYLE_ID, CSS);
    exposeDebug();
    setInterval(() => {
      const grid = document.querySelector(GRID_SELECTOR);
      if (grid !== state.grid || grid && !grid.isConnected) attachGrid(grid && grid.isConnected ? grid : null);
    }, 500);
    const initial = document.querySelector(GRID_SELECTOR);
    if (initial) attachGrid(initial);
  }
  var GLOBAL_KEY = "__biliToolsOpusRowLoaded__";
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
    start();
  } else {
    log.debug("统一行高脚本已注入，跳过重复初始化");
  }
})();
