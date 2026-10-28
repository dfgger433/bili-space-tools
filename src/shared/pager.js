// 原生风格分页条：1:1 复刻 B 站 VPagenation 的 DOM/class
// 纯计算部分（computePagerModel）不依赖 DOM，可在 Node 单测中使用。
import { create } from './dom.js';

export const DEFAULT_LABELS = {
  prev: '上一页',
  next: '下一页',
  pageUnit: '页',
  jumpTo: '跳至',
  loading: '加载中…',
};

const BASE_BTN = 'vui_button vui_pagenation--btn';
const NUM_BTN = `${BASE_BTN} vui_pagenation--btn-num`;
const MORE_BTN = `${BASE_BTN} vui_pagenation--btn-more`;
const SIDE_BTN = `${BASE_BTN} vui_pagenation--btn-side`;
const NO_TRANSITION = 'vui_button--no-transition';
const ACTIVE_CLASSES = 'vui_button--active vui_button--active-blue';

/**
 * 计算分页控件模型。
 * @param {{page:number,totalPages:number|null,hasMore:boolean,loadedCount:number,pageSize:number}} input
 */
export function computePagerModel(input = {}) {
  const pageSize = Math.max(1, Math.floor(Number(input.pageSize) || 10));
  const loadedCount = Math.max(0, Math.floor(Number(input.loadedCount) || 0));
  const totalPagesRaw = Number(input.totalPages);
  const totalPages =
    Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? Math.floor(totalPagesRaw) : null;
  const hasMore = Boolean(input.hasMore);
  const known = totalPages != null;
  const rawPage = Math.max(1, Math.floor(Number(input.page) || 1));
  const page = known ? Math.min(rawPage, totalPages) : rawPage;
  const prevDisabled = page <= 1;
  const nextDisabled = known ? page >= totalPages : !hasMore;

  const items = [];
  let activePage = page;
  const pushNum = (n) => items.push({ type: 'page', page: n, active: n === activePage });
  const pushMore = (delta, disabled = false) => items.push({ type: 'more', delta, disabled });
  const pushEllipsis = () => items.push({ type: 'ellipsis' });

  if (known) {
    if (totalPages <= 9) {
      for (let n = 1; n <= totalPages; n += 1) pushNum(n);
    } else {
      const showFirstBlock = page > 5;
      const showLastBlock = totalPages - page > 4;
      let start;
      let end;
      if (page <= 5) {
        start = 1;
        end = 7;
      } else if (totalPages - page > 4) {
        start = page - 2;
        end = page + 2;
      } else {
        start = totalPages - 6;
        end = totalPages;
      }
      if (showFirstBlock) {
        pushNum(1);
        pushMore(-5, page - 5 < 1);
      }
      for (let n = start; n <= end; n += 1) pushNum(n);
      if (showLastBlock) {
        pushMore(5, page + 5 > totalPages);
        pushNum(totalPages);
      }
    }
  } else {
    // 总页数未知（动态页在 NO_MORE 之前）：围绕当前页给窗口，保留“向后再加载 5 页”的入口
    const maxKnownPage = hasMore ? Number.POSITIVE_INFINITY : Math.max(1, Math.ceil(loadedCount / pageSize));
    const current = Math.min(page, maxKnownPage);
    activePage = current;
    const start = Math.max(1, current - 2);
    const end = Math.min(current + 2, maxKnownPage);
    if (start > 1) {
      pushNum(1);
      if (start > 2) pushEllipsis();
    }
    for (let n = start; n <= end; n += 1) pushNum(n);
    if (hasMore) pushMore(5, false);
  }

  return {
    page: activePage,
    pageSize,
    loadedCount,
    totalPages,
    hasMore,
    known,
    prevDisabled,
    nextDisabled,
    jumpEnabled: known || hasMore,
    items,
    /** 末页时返回总页数，否则 null */
    settledTotalPages: known && !hasMore ? totalPages : known ? totalPages : null,
  };
}

/** 生成分页条显示的计数文案 */
export function formatPagerCount({ page, totalPages, loadedCount, totalCount, pageSize, labels = DEFAULT_LABELS }) {
  if (totalPages != null) {
    const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : loadedCount;
    return `共 ${totalPages} 页 / ${total} 个，${labels.jumpTo}`;
  }
  return `第 ${page} 页 · 已加载 ${loadedCount} 个，${labels.jumpTo}`;
}

/**
 * 创建原生风格分页条。
 * @param {{className?:string,onPage?:(page:number)=>void,onJump?:(page:number)=>void,labels?:object}} options
 */
export function createPager(options = {}) {
  const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
  const onPage = typeof options.onPage === 'function' ? options.onPage : () => {};
  const onJump = typeof options.onJump === 'function' ? options.onJump : onPage;

  const root = create('div', {
    className: `vui_pagenation vui_pagenation--jump bili-tools-pager ${options.className || ''}`.trim(),
    attrs: { role: 'navigation', 'aria-label': '分页' },
  });
  const btns = create('div', { className: 'vui_pagenation--btns' });
  const go = create('div', { className: 'vui_pagenation-go' });
  const count = create('span', { className: 'vui_pagenation-go__count' });
  const inputWrapOuter = create('div', { className: 'vui_input', attrs: { 'aria-label': '输入要跳转的页码' } });
  const inputWrap = create('div', { className: 'vui_input-wrapper' });
  const input = create('input', {
    attrs: {
      type: 'number',
      min: '1',
      'aria-label': '输入要跳转的页码',
    },
    className: 'vui_input__input vui_input__input-resizable',
  });
  const unit = create('span', { className: 'vui_pagenation-go__page', text: labels.pageUnit });

  inputWrap.appendChild(input);
  inputWrapOuter.appendChild(inputWrap);
  go.appendChild(count);
  go.appendChild(inputWrapOuter);
  go.appendChild(unit);
  root.appendChild(btns);
  root.appendChild(go);

  let state = {
    page: 1,
    totalPages: null,
    hasMore: true,
    loadedCount: 0,
    totalCount: null,
    pageSize: 10,
    busy: false,
    busyText: '',
  };
  let destroyed = false;
  let lastSignature = '';
  let lastRenderedPage = 0;

  function emitPage(page) {
    if (!page || page < 1) return;
    if (Number.isFinite(state.totalPages) && state.totalPages > 0) {
      page = Math.min(page, state.totalPages);
    }
    if (page === state.page) return;
    onPage(page);
  }

  function renderSideButtons() {
    const prev = create('button', {
      className: SIDE_BTN,
      text: labels.prev,
      attrs: {
        type: 'button',
        'aria-label': labels.prev,
        disabled: state.prevDisabled ? '' : null,
      },
      on: {
        click: (event) => {
          event.preventDefault();
          emitPage(state.page - 1);
        },
      },
    });
    const next = create('button', {
      className: SIDE_BTN,
      text: labels.next,
      attrs: {
        type: 'button',
        'aria-label': labels.next,
        disabled: state.nextDisabled ? '' : null,
      },
      on: {
        click: (event) => {
          event.preventDefault();
          emitPage(state.page + 1);
        },
      },
    });
    if (state.prevDisabled) prev.classList.add('vui_button--disabled');
    if (state.nextDisabled) next.classList.add('vui_button--disabled');
    return { prev, next };
  }

  function renderItems() {
    const model = computePagerModel(state);
    const { prev, next } = renderSideButtons();
    const nodes = [prev];
    for (const item of model.items) {
      if (item.type === 'page') {
        const btn = create('button', {
          className: `${NUM_BTN} ${NO_TRANSITION}${item.active ? ` ${ACTIVE_CLASSES}` : ''}`.trim(),
          text: item.page,
          attrs: {
            type: 'button',
            'aria-label': item.active ? `第 ${item.page} 页，当前页` : `第 ${item.page} 页`,
            'aria-current': item.active ? 'page' : null,
          },
          on: {
            click: (event) => {
              event.preventDefault();
              emitPage(item.page);
            },
          },
        });
        nodes.push(btn);
      } else if (item.type === 'more') {
        const btn = create('button', {
          className: `${MORE_BTN} ${NO_TRANSITION}`,
          text: '...',
          attrs: {
            type: 'button',
            'aria-label': item.delta > 0 ? `向后 ${item.delta} 页` : `向前 ${-item.delta} 页`,
            disabled: item.disabled ? '' : null,
          },
          on: {
            click: (event) => {
              event.preventDefault();
              emitPage(state.page + item.delta);
            },
          },
        });
        if (item.disabled) btn.classList.add('vui_button--disabled');
        nodes.push(btn);
      } else {
        nodes.push(create('span', { className: 'vui_pagenation--extend', text: '...', attrs: { 'aria-hidden': 'true' } }));
      }
    }
    nodes.push(next);
    btns.replaceChildren(...nodes);
  }

  function update(nextState = {}) {
    if (destroyed) return;
    state = { ...state, ...nextState };
    const model = computePagerModel(state);
    state.prevDisabled = model.prevDisabled;
    state.nextDisabled = model.nextDisabled;
    state.items = model.items;
    state.totalPages = model.totalPages;
    const signature = JSON.stringify({
      page: model.page,
      totalPages: model.totalPages,
      items: model.items,
      loadedCount: state.loadedCount,
      totalCount: state.totalCount,
      busy: Boolean(state.busy),
      busyText: state.busyText || '',
      jumpEnabled: model.jumpEnabled,
    });
    if (signature === lastSignature) return model;
    lastSignature = signature;
    if (model.page !== lastRenderedPage) {
      lastRenderedPage = model.page;
      input.value = '';
    }
    renderItems();
    const busyText = state.busy ? state.busyText || labels.loading : '';
    count.textContent = busyText || formatPagerCount({
      page: state.page,
      totalPages: model.totalPages,
      loadedCount: state.loadedCount,
      totalCount: state.totalCount,
      pageSize: state.pageSize,
      labels,
    });
    input.disabled = !model.jumpEnabled || state.busy;
    root.classList.toggle('is-busy', Boolean(state.busy));
    root.classList.toggle('is-empty', !model.jumpEnabled && model.items.length === 0);
    return model;
  }

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.keyCode !== 13) return;
    event.preventDefault();
    const value = Math.floor(Number(input.value));
    input.value = '';
    if (!Number.isFinite(value) || value < 1) return;
    if (Number.isFinite(state.totalPages) && state.totalPages > 0 && value > state.totalPages) {
      onJump(state.totalPages);
      return;
    }
    onJump(value);
  });

  return {
    el: root,
    update,
    /** 只更新 busy 状态，不改变其它字段 */
    setBusy(busy, text = '') {
      return update({ busy: Boolean(busy), busyText: text });
    },
    getState: () => ({ ...state }),
    destroy() {
      destroyed = true;
      root.remove();
    },
  };
}
