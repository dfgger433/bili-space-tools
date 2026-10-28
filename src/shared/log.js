// 日志 / 等待 / 通用小工具（不依赖 DOM，可在 Node 单测中使用）
export const NS = 'bili-tools';
export const DEBUG_KEY = `${NS}:debug`;

export function debugEnabled() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function createLogger(scope) {
  const prefix = `[${NS}/${scope}]`;
  return {
    debug: (...args) => {
      if (debugEnabled()) console.log(prefix, ...args);
    },
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 轮询等待 predicate 返回真值。
 * 返回 predicate 的最后一次结果；超时抛错。
 */
export async function waitFor(predicate, { timeout = 15000, interval = 100, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    let value;
    try {
      value = await predicate();
    } catch (err) {
      value = false;
    }
    if (value) return value;
    if (Date.now() - start >= timeout) {
      throw new Error(`waitFor timeout: ${label}`);
    }
    await sleep(interval);
  }
}

export function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 把任意值安全地转成正整数；失败返回 fallback。 */
export function toPositiveInt(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i >= 1 ? i : fallback;
}

/** 下一页需要加载 API 的页数估算（用于跳页提示）。 */
export function estimateRequestsToLoad({ currentLoaded, targetItems, apiPageSize = 12, inFlight = 0 }) {
  const missing = Math.max(0, targetItems - currentLoaded - inFlight);
  return Math.ceil(missing / apiPageSize);
}
