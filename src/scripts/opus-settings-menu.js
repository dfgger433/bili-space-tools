// 配套脚本：只负责在油猴扩展菜单里放“图片压缩：开/关”开关。
// 主脚本（dist/02）不申请 GM 权限，保持在页面上下文，才能读取 Vue 实例 / 拦截接口；
// 本脚本写入同一个 localStorage 键，主脚本轮询/监听事件后立即重绘。
const VERSION = '0.1.0';
const STORAGE_KEY = 'biliTools:opus';
const DEFAULTS = { compressImages: true };

function pageStore() {
  try {
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow.localStorage) return unsafeWindow.localStorage;
  } catch {
    /* 沙箱拿不到时退回当前上下文 */
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
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try {
    const store = pageStore();
    if (store) store.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式等 */
  }
}

function label() {
  return `图片压缩：${load().compressImages ? '开' : '关'}`;
}

let menuId = null;
let menuLabel = '';

function registerMenu() {
  if (typeof GM_registerMenuCommand !== 'function') return;
  const name = label();
  if (menuId !== null && name === menuLabel) return;
  try {
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') {
      GM_unregisterMenuCommand(menuId);
      menuId = null;
    }
    try {
      menuId = GM_registerMenuCommand(name, toggle, {
        autoClose: true,
        title: '点击切换图文封面是否加载压缩图（开启更快，关闭加载原图）',
      });
    } catch {
      menuId = GM_registerMenuCommand(name, toggle);
    }
    menuLabel = name;
  } catch {
    /* 菜单注册失败时不影响页面 */
  }
}

function toggle() {
  const settings = load();
  settings.compressImages = !settings.compressImages;
  save(settings);
  registerMenu();
  // 主脚本监听这个事件；拿不到页面 window 时主脚本的 1s 轮询仍会生效
  try {
    const target = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    target.dispatchEvent(
      new CustomEvent('bili-tools:opus-settings', { detail: { compressImages: settings.compressImages } }),
    );
  } catch {
    /* ignore */
  }
}

function main() {
  if (window.top !== window) return;
  registerMenu();
}

const GLOBAL_KEY = '__biliToolsOpusMenuLoaded__';
if (!window[GLOBAL_KEY]) {
  window[GLOBAL_KEY] = { version: VERSION };
  main();
}
