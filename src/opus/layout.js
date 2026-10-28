// 图文瀑布流布局：复刻 B 站 WaterfallGrid 的列宽公式与摆放算法（前 10 条行优先，之后最短列）。
// 纯函数，可在 Node 单测中直接使用。
import { DEFAULT_COLUMN_GUTTER, DEFAULT_ROW_GUTTER, THRESHOLD_OF_WATERFALL } from './model.js';

/** 页面 countColumnWidth 的官方公式（window.innerWidth → 列宽/列数） */
export function computeColumnWidth(innerWidth) {
  const w = Math.min(Number(innerWidth) || 0, 2560);
  let columns;
  let total;
  if (w < 1340) {
    columns = 4;
    total = Math.max(1100, w) - 286;
  } else if (w < 1560) {
    columns = 5;
    total = Math.max(1100, w) - 286;
  } else if (w < 1680) {
    columns = 5;
    total = w - 446;
  } else {
    columns = 6;
    total = w - ((w < 1860 ? 150 : 240) + 16 + 280);
  }
  const width = (total - DEFAULT_COLUMN_GUTTER * (columns - 1)) / columns;
  return { columns, columnWidth: width };
}

/** 已知容器宽度与列宽时，反推列数（与 WaterfallGrid 的 m 计算一致） */
export function columnsForWidth(containerWidth, columnWidth, columnGutter = DEFAULT_COLUMN_GUTTER) {
  const width = Number(containerWidth) || 0;
  const cw = Number(columnWidth) || 0;
  if (width <= 0 || cw <= 0) return 0;
  return Math.max(1, Math.floor((width + columnGutter) / (cw + columnGutter)));
}

function minIndex(values) {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[best]) best = i;
  }
  return best;
}

/**
 * 复刻 WaterfallGrid 的绝对定位算法。
 * @param {Array<{height:number}>} items
 * @returns {{positions:Array<{left:number,top:number}>, width:number, height:number}}
 */
export function layoutWaterfall(
  items,
  {
    columnWidth,
    columns,
    rowGutter = DEFAULT_ROW_GUTTER,
    columnGutter = DEFAULT_COLUMN_GUTTER,
    threshold = THRESHOLD_OF_WATERFALL,
  } = {},
) {
  const list = items || [];
  const cw = Number(columnWidth) || 0;
  const m = Math.max(1, Math.floor(Number(columns) || 1));
  const heights = new Array(m).fill(0);
  const positions = new Array(list.length);
  let col = 0;
  let next = 0;
  let thresholdState = 0;

  for (let i = 0; i < list.length; i += 1) {
    const h = Number(list[i].height) || 0;
    positions[i] = { left: col * (cw + columnGutter), top: heights[col] };
    if (thresholdState < threshold) {
      heights[next] += h + rowGutter;
      next = (next + 1) % m;
      col = next;
    } else {
      heights[col] += h + rowGutter;
      col = minIndex(heights);
    }
    if ((i + 1) % m === 0) {
      const max = Math.max(...heights);
      const min = Math.min(...heights);
      thresholdState = max - min;
      next = 0;
      col = thresholdState < threshold ? 0 : minIndex(heights);
    }
  }

  return {
    positions,
    width: m * cw + (m - 1) * columnGutter,
    height: heights.length ? Math.max(...heights) : 0,
  };
}

/** 按页切片（page 从 1 开始） */
export function slicePage(items, page, pageSize) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 20));
  const start = (Math.max(1, Math.floor(Number(page) || 1)) - 1) * size;
  return (items || []).slice(start, start + size);
}

export function totalPages(loadedCount, pageSize) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 20));
  const count = Math.max(0, Math.floor(Number(loadedCount) || 0));
  return Math.max(1, Math.ceil(count / size));
}
