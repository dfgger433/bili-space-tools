// 图文脚本设置：优先写油猴存储（沙箱/跨域稳定），同时兼容 localStorage（调试/无 GM 环境）
const STORAGE_KEY = 'biliTools:opus';

export const DEFAULT_SETTINGS = {
  // 开启后封面加载压缩缩略图（@640w.webp，快）；关闭则加载原图（画质最好，但慢、流量大）
  compressImages: true,
};

function readParsed() {
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

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readParsed() };
}

export function saveSettings(settings) {
  const raw = JSON.stringify(settings);
  try {
    if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* 隐私模式 / 存储被禁用时忽略 */
  }
}
