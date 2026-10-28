/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站图文统一行高（独立脚本）
// @name:zh-CN   B站图文统一行高（独立脚本）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.3.0
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
  var VERSION = "0.3.0";
  var SCOPE = "opus-row";
  var STYLE_ID = "bili-tools-opus-row-style";
  var HIDE_CLASS = "bt-opus-row-hidden";
  var WRAP_CLASS = "bt-opus-row-wrap";
  var GRID_CLASS = "bt-opus-row-grid";
  var ITEM_CLASS = "bt-opus-row-item";
  var READY_CLASS = "bt-opus-row-ready";
  var TITLE_LINE_HEIGHT = 16.8;
  var TEXT_LINE_HEIGHT = 20;
  var log = createLogger(SCOPE);
  var CSS = `
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
  function exposeDebug() {
    window.BILI_TOOLS = window.BILI_TOOLS || {};
    window.BILI_TOOLS.row = {
      version: VERSION,
      state,
      apply: () => scheduleRebuild(0)
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
  function findSource() {
    const opus = window.BILI_TOOLS && window.BILI_TOOLS.opus;
    if (opus && opus.state && opus.state.active) return null;
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
      state.active = true;
      state.mode = "native";
      state.items = clones.length;
      state.columns = info.columns;
      state.rows = result.rowHeights.length;
      state.rowHeights = result.rowHeights;
      state.lastError = "";
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
        log.warn("统一行高失败", err);
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
        log.warn("统一行高排版失败", err);
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
    hideHost = masonry.closest(".opus") || masonry.closest(".opus-body") || masonry.parentElement || document.body;
    hideHost.classList.add(HIDE_CLASS);
    wrap = document.createElement("div");
    wrap.className = WRAP_CLASS;
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
    state.active = true;
    log.info("已接管原生图文网格，开始统一行高");
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
        else if (Date.now() - state.lastApplyAt > 3e3) scheduleLayout(0);
      }
    }, 500);
    attachSource(findSource());
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
