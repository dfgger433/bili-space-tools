// 图文（opus）数据模型：把接口 item / 页面已映射 item 归一化成渲染 + 布局需要的数据。
// 纯函数，可在 Node 单测中直接使用。
export const PAGE_SIZE = 20; // 与 B 站图文自动加载批次一致（2026-10-28 实测 20/页）
export const DEFAULT_ROW_GUTTER = 18;
export const DEFAULT_COLUMN_GUTTER = 20;
export const THRESHOLD_OF_WATERFALL = 10;
export const COVER_THUMB_WIDTH = 640;

export function normalizeUrl(url) {
  if (!url) return '';
  const value = String(url);
  if (value.startsWith('//')) return `https:${value}`;
  // B 站接口常返回 http://i0.hdslb.com/...，HTTPS 页面里会被混合内容拦截，统一升级
  if (value.startsWith('http://')) return `https://${value.slice(7)}`;
  return value;
}

/**
 * 封面缩略图：B 站图床支持 @640w.webp 这类参数，能把 300KB 原图压到 ~25KB。
 * 分页翻页时直接加载原图会让封面灰块停留很久，这里统一换成按宽度压缩的 webp。
 */
export function coverThumbUrl(url, width = COVER_THUMB_WIDTH) {
  const value = normalizeUrl(url);
  if (!value || !/^https?:\/\//i.test(value)) return value;
  const w = Math.max(160, Math.round(Number(width) || COVER_THUMB_WIDTH));
  // 原生返回的封面可能是 @454w_596_fU1r.avif 这类 AVIF 变体；Firefox 旧版本无法解码，
  // 统一换成 B 站图床的 webp 变体，兼容性最好。
  const base = value.split('@')[0];
  return `${base}@${w}w.webp`;
}

/** 根据“图片压缩”开关选择封面地址 */
export function coverDisplaySrc(cover, compress = true) {
  if (!cover) return '';
  if (compress) {
    const thumb = cover.thumbSrc ? coverThumbUrl(cover.thumbSrc) : '';
    return thumb || coverThumbUrl(cover.src);
  }
  // 关闭压缩时用不带 @ 变体的原图（jpg/png），避免 AVIF 兼容问题。
  const src = cover.src || '';
  return src.includes('@') ? src.split('@')[0] : src;
}

export function normalizeHref(url) {
  return normalizeUrl(url) || 'javascript:void(0)';
}

/** 原生卡片高度估算里的文本高度（与 WaterfallGrid 的映射公式一致） */
export function estimateTextHeight({ str, lineWeight, maxHeight, fontSize = 14, lineHeight = 17 }) {
  const text = str || '';
  const h = Math.ceil((text.length * fontSize) / Math.max(1, lineWeight)) * lineHeight;
  return h > maxHeight ? maxHeight : h;
}

/**
 * 原生 `getItems` 的尺寸公式：封面只有两种高度（竖图 / 横图），再叠加文本估算、徽章/边距、作者行。
 * @returns {{coverHeight:number,height:number}}
 */
export function computeNaturalSize(view, columnWidth) {
  const cover = view && view.cover;
  let coverHeight = 0;
  if (cover && Number(cover.width) > 0 && Number(cover.height) > 0) {
    const portrait = Number(cover.width) / Number(cover.height) <= 3 / 4;
    coverHeight = portrait ? (columnWidth / 160) * 210 : (columnWidth / 160) * 120;
    if (columnWidth < 168) coverHeight *= 16 / 19;
  }
  const textHeight = estimateTextHeight({
    str: view && view.content,
    lineWeight: cover ? columnWidth : columnWidth - 20,
    maxHeight: cover ? 40 : 80,
  });
  const extra = view && (view.author || view.pub_time) ? 24 : 0;
  const pad = cover ? 4 : view && view.badge ? 68 : 46;
  return { coverHeight, height: Math.floor(coverHeight + textHeight + pad + extra) };
}

/** 接口原始 item（view 对象）→ 内部 item */
export function toItem(view, index, columnWidth) {
  const natural = computeNaturalSize(view, columnWidth);
  const cover =
    view && view.cover
      ? {
          src: normalizeUrl(view.cover.url),
          thumbSrc: coverThumbUrl(view.cover.url),
          width: Math.ceil(columnWidth),
          height: Math.ceil(natural.coverHeight),
          naturalWidth: Number(view.cover.width) || 0,
          naturalHeight: Number(view.cover.height) || 0,
        }
      : null;
  return {
    key: String((view && view.opus_id) || (view && view.jump_url) || index),
    index,
    view: view || {},
    cover,
    width: columnWidth,
    height: natural.height,
  };
}

/** 页面 Vue 实例里已映射的 item（{data:{view,cover}, index, width, height}）→ 内部 item */
export function fromInstanceItem(item, fallbackIndex) {
  const data = (item && item.data) || {};
  const view = data.view || {};
  const cached = data.cover;
  let cover = null;
  if (cached && cached.src) {
    cover = {
      src: normalizeUrl(cached.src),
      thumbSrc: coverThumbUrl(cached.src),
      width: Number(cached.width) || Number(item && item.width) || 0,
      height: Number(cached.height) || 0,
      naturalWidth: Number(view.cover && view.cover.width) || 0,
      naturalHeight: Number(view.cover && view.cover.height) || 0,
    };
  } else if (view.cover && view.cover.url) {
    const width = Number(item && item.width) || 0;
    const natural = computeNaturalSize(view, width || 190);
    cover = {
      src: normalizeUrl(view.cover.url),
      thumbSrc: coverThumbUrl(view.cover.url),
      width: Math.ceil(width || natural.coverHeight),
      height: Math.ceil(natural.coverHeight),
      naturalWidth: Number(view.cover.width) || 0,
      naturalHeight: Number(view.cover.height) || 0,
    };
  }
  return {
    key: String(view.opus_id || view.jump_url || (item && item.index) || fallbackIndex),
    index: item && item.index != null ? item.index : fallbackIndex,
    view,
    cover,
    width: Number(item && item.width) || 0,
    height: Number(item && item.height) || 0,
  };
}

/** 统计文案（接口里通常是 "55" / "1.2万" 这样的字符串） */
export function statText(value) {
  if (value == null || value === '') return '';
  return String(value);
}
