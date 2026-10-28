// B 站空间页增强（单脚本）：动态翻页 + 图文翻页 + 图文统一行高，三个模块可分别开关。
// 单独脚本仍保留在各维护分支；这里是主分支的唯一交付脚本。
import { start as startDyn, stop as stopDyn } from './dyn-pagination.js';
import { start as startOpus, stop as stopOpus } from './opus-pagination.js';
import { start as startRow, stop as stopRow } from './opus-uniform-row.js';
import { createLogger } from '../shared/log.js';
import { toast } from '../shared/toast.js';
import { loadModuleSettings, saveModuleSettings } from '../shared/module-settings.js';

const VERSION = '1.0.3';
const SCOPE = 'all';
const GLOBAL_KEY = '__biliToolsAllLoaded__';

const log = createLogger(SCOPE);
const settings = loadModuleSettings();

const MODULES = [
  { key: 'dyn', label: '动态翻页' },
  { key: 'opus', label: '图文翻页' },
  { key: 'row', label: '统一行高' },
];

const state = {
  page: null,
  dyn: false,
  opus: false,
  row: false,
};

const menuIds = { dyn: null, opus: null, row: null };
let routeTimer = null;

function pageKind() {
  const path = location.pathname;
  if (/\/dynamic(?:\/|$)/.test(path)) return 'dynamic';
  if (/\/upload\/opus(?:\/|$)/.test(path)) return 'opus';
  return 'other';
}

function markState(key, value) {
  state[key] = value;
  const mod = MODULES.find((item) => item.key === key);
  if (mod) mod.active = value;
}

function apply() {
  const page = pageKind();
  state.page = page;
  if (page === 'dynamic') {
    stopOpus();
    markState('opus', false);
    stopRow();
    markState('row', false);
    if (settings.dyn) {
      startDyn();
      markState('dyn', true);
    } else {
      stopDyn();
      markState('dyn', false);
    }
  } else if (page === 'opus') {
    stopDyn();
    markState('dyn', false);
    if (settings.opus) {
      startOpus();
      markState('opus', true);
    } else {
      stopOpus();
      markState('opus', false);
    }
    if (settings.row) {
      startRow();
      markState('row', true);
    } else {
      stopRow();
      markState('row', false);
    }
  } else {
    stopDyn();
    stopOpus();
    stopRow();
    markState('dyn', false);
    markState('opus', false);
    markState('row', false);
  }
}

function menuLabel(mod) {
  return `${mod.label}：${settings[mod.key] ? '开' : '关'}`;
}

function refreshMenus() {
  if (window.top !== window) return;
  if (typeof GM_registerMenuCommand !== 'function') return;
  for (const mod of MODULES) {
    const oldId = menuIds[mod.key];
    if (oldId !== null && typeof GM_unregisterMenuCommand === 'function') {
      try {
        GM_unregisterMenuCommand(oldId);
      } catch {
        /* ignore */
      }
      menuIds[mod.key] = null;
    }
    try {
      menuIds[mod.key] = GM_registerMenuCommand(menuLabel(mod), () => toggle(mod.key));
    } catch {
      /* ignore */
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
  toast(`${label}：${settings[key] ? '开' : '关'}`, { duration: 1500 });
}

function checkRoute() {
  if (pageKind() !== state.page) apply();
}

function exposeDebug() {
  window.BILI_TOOLS = window.BILI_TOOLS || {};
  window.BILI_TOOLS.all = {
    version: VERSION,
    settings,
    modules: MODULES,
    get state() {
      return {
        page: state.page,
        dyn: state.dyn,
        opus: state.opus,
        row: state.row,
      };
    },
    apply,
    toggle,
  };
}

function start() {
  exposeDebug();
  refreshMenus();
  // 某些脚本管理器/测试环境在 document-start 时 GM API 还没挂好，延后补注册一次
  setTimeout(refreshMenus, 0);
  setTimeout(refreshMenus, 300);
  apply();
  window.addEventListener('popstate', checkRoute);
  window.addEventListener('hashchange', checkRoute);
  routeTimer = setInterval(checkRoute, 500);
  log.info(`B站空间页增强 v${VERSION} 启动`, { page: state.page, settings });
}

function stop() {
  if (routeTimer) {
    clearInterval(routeTimer);
    routeTimer = null;
  }
  window.removeEventListener('popstate', checkRoute);
  window.removeEventListener('hashchange', checkRoute);
  stopDyn();
  stopOpus();
  stopRow();
  delete window[GLOBAL_KEY];
  log.info('B站空间页增强已停止');
}

const previous = window[GLOBAL_KEY];
if (!previous || previous.version !== VERSION) {
  window[GLOBAL_KEY] = { version: VERSION, startedAt: Date.now() };
  start();
} else {
  log.debug('B站空间页增强已注入，跳过重复初始化');
}

export { start, stop, VERSION, settings, apply, toggle };



