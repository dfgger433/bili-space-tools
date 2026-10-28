// 图文数据适配：
//  A. Vue 实例：从 #app.__vue_app__ 遍历 vnode，找到 WaterfallGrid（props.list / columnWidth / onLoadMore）
//  B. 网络抓包：监听页面自身对 opus/feed/space 的请求（只读，不改响应）
import { createLogger, waitFor, sleep } from '../shared/log.js';
import { computeNaturalSize, fromInstanceItem, toItem } from './model.js';

const log = createLogger('opus');
export const API_PATH = '/x/polymer/web-dynamic/v1/opus/feed/space';

function parseParams(url) {
  try {
    const u = new URL(String(url), location.href);
    return Object.fromEntries(u.searchParams.entries());
  } catch {
    return {};
  }
}

/** 安装 XHR/fetch 观察器（document-start 调用；只记录页面自己的请求，不修改响应） */
export function installCapture(onResponse) {
  if (window.__biliToolsOpusCaptureInstalled) return;
  window.__biliToolsOpusCaptureInstalled = true;
  log.info('已安装 opus 接口观察器');

  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype && !XHR.prototype.__biliToolsPatched) {
    const rawOpen = XHR.prototype.open;
    const rawSend = XHR.prototype.send;
    XHR.prototype.open = function patchedOpen(method, url, ...rest) {
      try {
        this.__btOpusUrl = typeof url === 'string' ? url : String(url);
      } catch {
        this.__btOpusUrl = '';
      }
      return rawOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function patchedSend(...args) {
      const url = this.__btOpusUrl;
      if (url && String(url).includes(API_PATH)) {
        const xhr = this;
        const report = () => {
          if (xhr.readyState !== 4 || xhr.__btOpusReported) return;
          xhr.__btOpusReported = true;
          try {
            let json = null;
            if (!xhr.responseType || xhr.responseType === 'text') {
              json = JSON.parse(xhr.responseText);
            } else if (xhr.responseType === 'json') {
              json = xhr.response;
            }
            if (json && json.code === 0 && json.data) {
              onResponse({ url: String(url), params: parseParams(url), data: json.data });
            }
          } catch (err) {
            log.warn('解析 opus 响应失败', err);
          }
        };
        xhr.addEventListener('readystatechange', report);
        xhr.addEventListener('load', report);
      }
      return rawSend.apply(this, args);
    };
    XHR.prototype.__biliToolsPatched = true;
  }

  if (typeof window.fetch === 'function' && !window.fetch.__biliToolsPatched) {
    const rawFetch = window.fetch;
    const patchedFetch = function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const result = rawFetch.apply(this, arguments);
      if (String(url).includes(API_PATH) && result && typeof result.then === 'function') {
        result
          .then((res) => res.clone().json())
          .then((json) => {
            if (json && json.code === 0 && json.data) {
              onResponse({ url: String(url), params: parseParams(url), data: json.data });
            }
          })
          .catch(() => {});
      }
      return result;
    };
    patchedFetch.__biliToolsPatched = true;
    window.fetch = patchedFetch;
  }
}

export function getVueApp() {
  const candidates = [document.getElementById('app'), document.querySelector('[data-v-app]')];
  for (const el of candidates) {
    if (el && el.__vue_app__) return el.__vue_app__;
  }
  return null;
}

/** 从 app 挂载容器的 _vnode（生产环境没有 app._instance / __vueParentComponent）找 WaterfallGrid 组件实例 */
export function findWaterfall(app) {
  if (!app) return null;
  // Vue 3 生产构建不会设置 app._instance（devtools 开关），但 render() 会把根 vnode 挂在容器的 _vnode 上
  const containerCandidates = [
    app._container,
    document.getElementById('app'),
    document.querySelector('[data-v-app]'),
  ].filter(Boolean);
  let rootVNode = null;
  for (const el of containerCandidates) {
    if (el && el._vnode) {
      rootVNode = el._vnode;
      break;
    }
  }
  if (!rootVNode && app._instance && app._instance.subTree) {
    rootVNode = app._instance.subTree;
  }
  if (!rootVNode) return null;
  const seen = new Set();
  const stack = [rootVNode];
  while (stack.length) {
    const vnode = stack.pop();
    if (!vnode || typeof vnode !== 'object' || seen.has(vnode)) continue;
    seen.add(vnode);
    const inst = vnode.component;
    if (inst) {
      const props = inst.props || {};
      const type = inst.type || {};
      const byName = type.__name === 'WaterfallGrid' || type.name === 'WaterfallGrid';
      const byShape =
        Array.isArray(props.list) &&
        (props.list.length === 0 ||
          Boolean(props.list[0] && props.list[0].data && (props.list[0].data.view || props.list[0].data.cover)));
      if (Array.isArray(props.list) && (byName || byShape) && !inst.isUnmounted) {
        return inst;
      }
      if (inst.isUnmounted) continue;
      if (inst.subTree) stack.push(inst.subTree);
    }
    if (Array.isArray(vnode.children)) stack.push(...vnode.children);
    if (Array.isArray(vnode.dynamicChildren)) stack.push(...vnode.dynamicChildren);
    if (vnode.suspense) {
      stack.push(vnode.suspense.activeBranch, vnode.suspense.pendingBranch);
    }
    if (vnode.ssContent) stack.push(vnode.ssContent);
  }
  return null;
}

/** 采到的最新接口状态（reset 以 page=1 / 空 offset 判定） */
export function createCaptureState() {
  return {
    type: 'all',
    items: [],
    hasMore: null,
    lastPage: 0,
    lastAt: 0,
    onResponse(evt) {
      const params = evt.params || {};
      const data = evt.data || {};
      const page = Number(params.page) || 1;
      const offset = params.offset || '';
      const type = params.type || this.type;
      const isFirstPage = page <= 1 || offset === '';
      if (isFirstPage) {
        this.items = [];
        this.lastPage = 0;
        this.type = type;
      }
      this.items = this.items.concat(Array.isArray(data.items) ? data.items : []);
      this.hasMore = Boolean(data.has_more);
      this.lastPage = page;
      this.lastAt = Date.now();
    },
  };
}

/**
 * 统一适配器接口：
 *  getItems(columnWidth) / getColumnWidth() / getLoaded() / getHasMore() / getLoading() / loadMore() / kind / isValid()
 */
export function createAdapter(capture) {
  const app = getVueApp();
  const inst = findWaterfall(app);
  const vueReady = Boolean(inst && Array.isArray(inst.props.list) && inst.props.list.length > 0);
  if (vueReady) {
    log.info('数据通道：Vue 实例（WaterfallGrid）');
    return createVueAdapter(inst, capture);
  }
  if (capture && capture.items.length > 0) {
    log.info('数据通道：网络抓包');
    return createNetworkAdapter(capture);
  }
  if (inst) {
    // 实例已出现但列表还没数据，先用实例通道等数据
    log.info('数据通道：Vue 实例（等待数据）');
    return createVueAdapter(inst, capture);
  }
  return null;
}

function createVueAdapter(inst, capture) {
  const listOf = () => (Array.isArray(inst.props.list) ? inst.props.list : []);
  return {
    kind: 'vue',
    instance: inst,
    getItems(columnWidth) {
      return listOf().map((item, index) => {
        const mapped = fromInstanceItem(item, index);
        if (!mapped.height && columnWidth > 0) {
          const natural = computeNaturalSize(mapped.view, columnWidth);
          mapped.width = Number(mapped.width) || columnWidth;
          mapped.height = natural.height;
          if (mapped.cover && !mapped.cover.height) mapped.cover.height = Math.ceil(natural.coverHeight);
        }
        return mapped;
      });
    },
    getColumnWidth: () => Number(inst.props.columnWidth) || 0,
    getLoaded: () => listOf().length,
    getHasMore: () => (capture && capture.hasMore != null ? capture.hasMore : null),
    getLoading: () => Boolean(inst.props.loadingLock),
    isValid: () => !inst.isUnmounted,
    async loadMore() {
      const handler = inst.vnode && inst.vnode.props && inst.vnode.props.onLoadMore;
      if (typeof handler === 'function') {
        handler();
        return true;
      }
      // 没有 onLoadMore 时，退化为滚到底触发页面自己的加载
      const prevY = window.scrollY;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
      await sleep(80);
      window.dispatchEvent(new Event('scroll'));
      await sleep(300);
      if (window.scrollY !== prevY) window.scrollTo({ top: prevY, behavior: 'auto' });
      return false;
    },
  };
}

function createNetworkAdapter(capture) {
  return {
    kind: 'network',
    getItems(columnWidth) {
      return capture.items.map((view, index) => toItem(view, index, columnWidth));
    },
    getColumnWidth: () => 0,
    getLoaded: () => capture.items.length,
    getHasMore: () => (capture.hasMore != null ? capture.hasMore : null),
    getLoading: () => false,
    isValid: () => true,
    /** 兜底：滚到底触发页面自身的 loadMore，然后等新响应 */
    async loadMore() {
      const before = capture.items.length;
      const prevY = window.scrollY;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
      await sleep(80);
      window.dispatchEvent(new Event('scroll'));
      await waitFor(() => capture.items.length > before || capture.hasMore === false, {
        timeout: 15000,
        interval: 150,
        label: 'opus-network-load',
      }).catch(() => {});
      if (window.scrollY !== prevY) window.scrollTo({ top: prevY, behavior: 'auto' });
      return capture.items.length > before;
    },
  };
}
