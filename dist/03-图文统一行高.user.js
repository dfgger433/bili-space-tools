/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站图文统一行高（独立脚本）
// @name:zh-CN   B站图文统一行高（独立脚本）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.4.4
// @description  统一所有已加载图文行高：每行自动计算平均高度，按可调的“超出比例阈值”（默认 27%，油猴菜单可设，0=停用）裁剪高于平均值的内容；不包含分页/预取。
// @description:zh-CN 统一所有已加载图文行高：每行自动计算平均高度，按可调的“超出比例阈值”（默认 27%，油猴菜单可设，0=停用）裁剪高于平均值的内容；不包含分页/预取。
// @author       bili-space-tools
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://*.bilibili.com/*/upload/opus
// @match        *://*.bilibili.com/*/upload/opus/*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

(() => {
  // src/opus/model.js
  var DEFAULT_ROW_GUTTER = 18;
  var DEFAULT_COLUMN_GUTTER = 20;

  // src/opus/layout.js
  function layoutRowsWithClip(items, {
    columnWidth,
    columns,
    rowGutter = DEFAULT_ROW_GUTTER,
    columnGutter = DEFAULT_COLUMN_GUTTER,
    clipPercent: clipPercent2 = 0
  } = {}) {
    const list = items || [];
    const cw = Number(columnWidth) || 0;
    const m = Math.max(1, Math.floor(Number(columns) || 1));
    const threshold = Number(clipPercent2) || 0;
    const positions = new Array(list.length);
    const rowHeights = [];
    const rowStats = [];
    let top = 0;
    for (let start2 = 0; start2 < list.length; start2 += m) {
      const row = list.slice(start2, start2 + m);
      const rowIndex = rowHeights.length;
      const heights = row.map((item) => Math.max(0, Number(item && item.height) || 0));
      const avg = heights.length ? heights.reduce((sum, h) => sum + h, 0) / heights.length : 0;
      const max = heights.length ? Math.max(...heights) : 0;
      const excess = avg > 0 ? (max - avg) / avg * 100 : 0;
      const clipped = threshold > 0 && excess > threshold;
      const rowHeight = clipped ? Math.round(avg) : max;
      rowHeights.push(rowHeight);
      rowStats.push({ avg, max, excess, rowHeight, clipped });
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
      rowStats,
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

  // src/scripts/opus-uniform-row.js
  var VERSION = "0.4.4";
  var SCOPE = "opus-row";
  var STYLE_ID2 = "bili-tools-opus-row-style";
  var HIDE_CLASS = "bt-opus-row-hidden";
  var WRAP_CLASS = "bt-opus-row-wrap";
  var GRID_CLASS = "bt-opus-row-grid";
  var ITEM_CLASS = "bt-opus-row-item";
  var READY_CLASS = "bt-opus-row-ready";
  var NATIVE_CLIP_CLASS = "bt-opus-row-native-clip";
  var SETTINGS_KEY = "biliTools:opusRow";
  var LOCAL_KEY = "biliTools:opusRow:clipPercent";
  var DEFAULT_CLIP_PERCENT = 27;
  var TITLE_LINE_HEIGHT = 16.8;
  var TEXT_LINE_HEIGHT = 20;
  var log = createLogger(SCOPE);
  var CSS2 = `
.${HIDE_CLASS} .opus-feed{position:absolute!important;left:0;right:0;top:auto;height:0!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important}
.${WRAP_CLASS}{margin:0 auto;width:100%}
.${GRID_CLASS}{position:relative;margin:0 auto}
.${ITEM_CLASS}{position:absolute;left:0;top:0;max-width:100%}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .opus-card{height:100%;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .bili-cover-card{overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS} .bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:contain}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS}.${NATIVE_CLIP_CLASS} .opus-card{height:100%;display:flex;flex-direction:column;overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS}.${NATIVE_CLIP_CLASS} .bili-cover-card{flex:1 1 auto!important;min-height:0!important;height:auto!important;padding-top:0!important;overflow:hidden}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS}.${NATIVE_CLIP_CLASS} .bili-cover-card__thumbnail{position:absolute!important;inset:0!important;height:auto!important}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS}.${NATIVE_CLIP_CLASS} .bili-cover-card__thumbnail img{width:100%!important;height:100%!important;object-fit:cover!important}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS}.${NATIVE_CLIP_CLASS} .opus-card__title{flex:0 0 auto}
.${GRID_CLASS}.${READY_CLASS} .${ITEM_CLASS}.${NATIVE_CLIP_CLASS} .opus-card > .opus-card--with-cover{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;height:100%}
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
    rowStats: [],
    clipPercent: DEFAULT_CLIP_PERCENT,
    lastError: "",
    lastApplyAt: 0
  };
  var clipPercent = DEFAULT_CLIP_PERCENT;
  var menuCommandId = null;
  var menuCommandName = "";
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
      apply: () => scheduleRebuild(0),
      setClipPercent: (value) => setClipPercent(value),
      get clipPercent() {
        return clipPercent;
      }
    };
  }
  function pageWindow() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow) return unsafeWindow;
    } catch {
    }
    return window;
  }
  function clampPercent(value) {
    if (value === null || value === void 0) return null;
    const text = String(value).trim();
    if (text === "") return null;
    const num = Number(text);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(100, Math.round(num)));
  }
  function loadClipPercent() {
    let saved = null;
    try {
      if (typeof GM_getValue === "function") saved = GM_getValue(SETTINGS_KEY, DEFAULT_CLIP_PERCENT);
    } catch {
    }
    if (saved === null || saved === void 0) {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw !== null) saved = raw;
      } catch {
      }
    }
    const value = clampPercent(saved);
    return value === null ? DEFAULT_CLIP_PERCENT : value;
  }
  function saveClipPercent(value) {
    try {
      if (typeof GM_setValue === "function") GM_setValue(SETTINGS_KEY, value);
    } catch {
    }
    try {
      localStorage.setItem(LOCAL_KEY, String(value));
    } catch {
    }
  }
  function clipMenuName() {
    return `行高裁剪阈值：${clipPercent}%（0=关闭）`;
  }
  function registerClipMenu() {
    if (window.top !== window) return;
    if (typeof GM_registerMenuCommand !== "function") return;
    const name = clipMenuName();
    if (menuCommandId !== null && name === menuCommandName) return;
    try {
      if (menuCommandId !== null && typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(menuCommandId);
      }
    } catch {
    }
    menuCommandId = null;
    try {
      menuCommandId = GM_registerMenuCommand(name, openClipPrompt);
      menuCommandName = name;
    } catch {
      menuCommandId = null;
    }
  }
  function openClipPrompt() {
    const W = pageWindow();
    let raw = null;
    try {
      raw = (W.prompt || window.prompt).call(
        W,
        "设置行高裁剪阈值（0-100%，0 = 关闭裁剪）：",
        String(clipPercent)
      );
    } catch {
      return;
    }
    if (raw === null || raw === void 0 || String(raw).trim() === "") return;
    const value = clampPercent(String(raw).trim());
    if (value === null) {
      toast("请输入 0-100 之间的数字", { duration: 1800 });
      return;
    }
    setClipPercent(value);
  }
  function setClipPercent(value) {
    const next = clampPercent(value);
    if (next === null) return;
    clipPercent = next;
    state.clipPercent = next;
    saveClipPercent(next);
    registerClipMenu();
    if (source) scheduleRebuild(0);
    toast(`行高裁剪阈值：${next}%${next === 0 ? "（已关闭裁剪）" : ""}`, { duration: 1800 });
    log.info("裁剪阈值已更新", { clipPercent: next });
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
    const W = pageWindow();
    const opus = W.BILI_TOOLS && W.BILI_TOOLS.opus || window.BILI_TOOLS && window.BILI_TOOLS.opus;
    if (opus && opus.state && opus.state.active) return null;
    if (document.querySelector(".bt-opus-grid, .bt-opus-pager")) return null;
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
  function imageSrcCandidates(img, sourceItem) {
    const sourceImg = sourceItem ? sourceItem.querySelector(".bili-cover-card img") : null;
    return [
      img.getAttribute("src"),
      img.currentSrc,
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      sourceImg && sourceImg.currentSrc,
      sourceImg && sourceImg.getAttribute("src"),
      sourceImg && sourceImg.getAttribute("data-src"),
      sourceImg && sourceImg.getAttribute("data-original")
    ].filter((value) => typeof value === "string" && value && !value.startsWith("data:"));
  }
  function restoreCloneImage(item, sourceItem) {
    const img = item.querySelector(".bili-cover-card img");
    if (!img) return;
    const src = imageSrcCandidates(img, sourceItem)[0] || "";
    if (!src) return;
    const full = src.includes("@") ? `${src.split("@")[0]}@640w.webp` : src;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "async");
    if (img.getAttribute("src") !== full) img.setAttribute("src", full);
    const sourceImg = sourceItem ? sourceItem.querySelector(".bili-cover-card img") : null;
    const fallback = sourceImg ? sourceImg.currentSrc || sourceImg.getAttribute("src") || "" : "";
    if (fallback && fallback !== full && !img.dataset.btFallback) {
      img.dataset.btFallback = "1";
      img.addEventListener(
        "error",
        () => {
          if (sourceImg && sourceImg.currentSrc) img.src = sourceImg.currentSrc;
          else img.src = fallback;
        },
        { once: true }
      );
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
    item.classList.remove(NATIVE_CLIP_CLASS);
    const clamp = clampElement(item);
    if (clamp) clamp.el.style.setProperty("-webkit-line-clamp", String(clamp.base));
    restoreCloneImage(item);
    setCloneCoverRatio(item);
  }
  function applyNativeClip(item) {
    const ratio = item.dataset.btNativeRatio;
    const cover = item.querySelector(".bili-cover-card");
    if (!ratio || !cover) return false;
    cover.style.setProperty("--bili-cover-card-ratio", ratio);
    item.classList.add(NATIVE_CLIP_CLASS);
    return true;
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
        const cover = clone.querySelector(".bili-cover-card");
        const img = clone.querySelector(".bili-cover-card img");
        let nativeRatio = cover && cover.style.getPropertyValue("--bili-cover-card-ratio") || "";
        if (!nativeRatio && img) {
          const src = img.getAttribute("src") || "";
          const match = src.match(/@(\d+)w_(\d+)h_/);
          if (match) nativeRatio = `${(Number(match[2]) / Number(match[1]) * 100).toFixed(3)}%`;
        }
        if (nativeRatio) clone.dataset.btNativeRatio = nativeRatio;
        restoreCloneImage(clone, srcItem);
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
      const result = layoutRowsWithClip(
        naturalHeights.map((height) => ({ height })),
        {
          columnWidth: info.columnWidth,
          columns: info.columns,
          rowGutter: DEFAULT_ROW_GUTTER,
          columnGutter: DEFAULT_COLUMN_GUTTER,
          clipPercent
        }
      );
      grid.classList.add(READY_CLASS);
      grid.style.width = `${result.width}px`;
      grid.style.height = `${result.height}px`;
      clones.forEach((clone, index) => {
        const pos = result.positions[index];
        clone.style.height = `${pos.height}px`;
        clone.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
        const clamp = clampElement(clone);
        if (clamp) clamp.el.style.setProperty("-webkit-line-clamp", String(clamp.base));
        const rowIndex = Math.floor(index / info.columns);
        const stat = result.rowStats[rowIndex];
        const useNativeClip = Boolean(stat && stat.clipped && naturalHeights[index] > stat.rowHeight);
        if (useNativeClip) {
          if (!applyNativeClip(clone)) clone.classList.remove(NATIVE_CLIP_CLASS);
        } else {
          clone.classList.remove(NATIVE_CLIP_CLASS);
        }
      });
      state.active = true;
      state.mode = "native";
      state.items = clones.length;
      state.columns = info.columns;
      state.rows = result.rowHeights.length;
      state.rowHeights = result.rowHeights;
      state.rowStats = result.rowStats;
      state.clipPercent = clipPercent;
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
    clipPercent = loadClipPercent();
    state.clipPercent = clipPercent;
    addStyle(STYLE_ID2, CSS2);
    exposeDebug();
    registerClipMenu();
    log.info(`统一行高脚本 v${VERSION} 启动`, { clipPercent });
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
