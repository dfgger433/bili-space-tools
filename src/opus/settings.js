// 图文脚本设置（localStorage 持久化）
const STORAGE_KEY = 'biliTools:opus';

export const DEFAULT_SETTINGS = {
  // 开启后封面加载压缩缩略图（@640w.webp，快）；关闭则加载原图（画质最好，但慢、流量大）
  compressImages: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式 / 存储被禁用时忽略 */
  }
}
