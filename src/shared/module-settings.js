// 单脚本模式下三个模块的开关（持久化到油猴存储；无 GM 时退回 localStorage）。
const STORAGE_KEY = 'biliTools:modules';

export const DEFAULT_MODULES = {
  dyn: true,
  opus: true,
  row: true,
};

function readSaved() {
  try {
    if (typeof GM_getValue === 'function') {
      const raw = GM_getValue(STORAGE_KEY);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function loadModuleSettings() {
  const saved = { ...DEFAULT_MODULES, ...readSaved() };
  // 测试/调试覆盖：window.__BILI_TOOLS_MODULES__ = { dyn: false, row: true }
  try {
    const override = window.__BILI_TOOLS_MODULES__;
    if (override && typeof override === 'object') {
      for (const key of Object.keys(DEFAULT_MODULES)) {
        if (typeof override[key] === 'boolean') saved[key] = override[key];
      }
    }
  } catch {
    /* ignore */
  }
  return saved;
}

export function saveModuleSettings(settings) {
  const raw = JSON.stringify(settings);
  try {
    if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
}
