/* eslint-disable */
// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。
// ==UserScript==
// @name         B站图文翻页（图片压缩菜单）
// @name:zh-CN   B站图文翻页（图片压缩菜单）
// @namespace    https://github.com/bili-space-tools/bili-space-tools
// @version      0.1.0
// @description  为“B站图文翻页”提供油猴扩展菜单里的“图片压缩：开/关”开关（主脚本不申请 GM 权限以保持页面上下文）。
// @description:zh-CN 为“B站图文翻页”提供油猴扩展菜单里的“图片压缩：开/关”开关（主脚本不申请 GM 权限以保持页面上下文）。
// @author       bili-space-tools
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://*.bilibili.com/*/upload/opus
// @match        *://*.bilibili.com/*/upload/opus/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(() => {
  // src/scripts/opus-settings-menu.js
  var VERSION = "0.1.0";
  var STORAGE_KEY = "biliTools:opus";
  var DEFAULTS = { compressImages: true };
  function pageStore() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow.localStorage) return unsafeWindow.localStorage;
    } catch {
    }
    try {
      return localStorage;
    } catch {
      return null;
    }
  }
  function load() {
    try {
      const store = pageStore();
      const raw = store ? store.getItem(STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...DEFAULTS, ...parsed && typeof parsed === "object" ? parsed : {} };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function save(settings) {
    try {
      const store = pageStore();
      if (store) store.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
    }
  }
  function label() {
    return `图片压缩：${load().compressImages ? "开" : "关"}`;
  }
  var menuId = null;
  var menuLabel = "";
  function registerMenu() {
    if (typeof GM_registerMenuCommand !== "function") return;
    const name = label();
    if (menuId !== null && name === menuLabel) return;
    try {
      if (menuId !== null && typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(menuId);
        menuId = null;
      }
      try {
        menuId = GM_registerMenuCommand(name, toggle, {
          autoClose: true,
          title: "点击切换图文封面是否加载压缩图（开启更快，关闭加载原图）"
        });
      } catch {
        menuId = GM_registerMenuCommand(name, toggle);
      }
      menuLabel = name;
    } catch {
    }
  }
  function toggle() {
    const settings = load();
    settings.compressImages = !settings.compressImages;
    save(settings);
    registerMenu();
    try {
      const target = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      target.dispatchEvent(
        new CustomEvent("bili-tools:opus-settings", { detail: { compressImages: settings.compressImages } })
      );
    } catch {
    }
  }
  function main() {
    if (window.top !== window) return;
    registerMenu();
  }
  var GLOBAL_KEY = "__biliToolsOpusMenuLoaded__";
  if (!window[GLOBAL_KEY]) {
    window[GLOBAL_KEY] = { version: VERSION };
    main();
  }
})();
