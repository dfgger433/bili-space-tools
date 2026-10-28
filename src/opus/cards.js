// 用 B 站原生 class 重建图文卡片（外观依赖页面已加载的 .opus-card / .bili-cover-card 样式）。
import { create } from '../shared/dom.js';
import { normalizeHref, statText } from './model.js';

const BADGE_DEFAULT = {
  text: '充电专属',
  bg: '#FF6699',
  color: '#FFFFFF',
};

function badgeInfo(badge) {
  if (!badge) return null;
  return {
    text: badge.text || BADGE_DEFAULT.text,
    bg: badge.bg_color || BADGE_DEFAULT.bg,
    color: badge.color || BADGE_DEFAULT.color,
  };
}

function coverStat(icon, value) {
  const el = create('div', { className: 'bili-cover-card__stat' });
  el.appendChild(create('i', { className: icon }));
  el.appendChild(create('span', { text: statText(value) }));
  return el;
}

function textStat(icon, value) {
  const el = create('span');
  el.appendChild(create('i', { className: icon }));
  el.appendChild(document.createTextNode(` ${statText(value)}`));
  return el;
}

function appendCoverStats(coverEl, view) {
  const stat = (view && view.stat) || {};
  const statsEl = create('div', { className: 'bili-cover-card__stats' });
  if (statText(stat.view)) statsEl.appendChild(coverStat('sic-BDC-eye_browse_line', stat.view));
  if (statText(stat.like)) statsEl.appendChild(coverStat('sic-BDC-hand_thumbsup_line', stat.like));
  if (statsEl.childNodes.length) coverEl.appendChild(statsEl);
}

function appendCoverBadge(coverEl, view) {
  const badge = badgeInfo(view && view.badge);
  if (!badge) return;
  const tags = create('div', { className: 'bili-cover-card__tags' });
  const tag = create('div', {
    className: 'bili-cover-card__tag',
    text: badge.text,
    style: { 'background-color': badge.bg, color: badge.color },
  });
  tags.appendChild(tag);
  coverEl.appendChild(tags);
}

function buildCoverCard(item) {
  const view = item.view || {};
  const href = normalizeHref(view.jump_url);
  const title = view.content || '';
  const cover = item.cover || {};
  const ratio = cover.width > 0 && cover.height > 0 ? (cover.height / cover.width) * 100 : 100;
  const section = create('div', { className: 'opus-card--with-cover' });

  const coverEl = create('a', {
    className: 'bili-cover-card opus-card__cover',
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
    style: { '--bili-cover-card-ratio': `${ratio.toFixed(4)}%` },
  });
  const thumb = create('div', { className: 'bili-cover-card__thumbnail' });
  thumb.appendChild(
    create('img', {
      attrs: {
        src: cover.src,
        alt: title.slice(0, 80),
        loading: 'lazy',
        decoding: 'async',
      },
    }),
  );
  coverEl.appendChild(thumb);
  appendCoverStats(coverEl, view);
  appendCoverBadge(coverEl, view);
  section.appendChild(coverEl);

  const titleEl = create('a', {
    className: 'opus-card__title',
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
  });
  titleEl.appendChild(create('div', { className: 'bt-opus-title-text', text: title }));
  section.appendChild(titleEl);

  return section;
}

function buildTextCard(item) {
  const view = item.view || {};
  const href = normalizeHref(view.jump_url);
  const title = view.content || '';
  const section = create('div', { className: 'opus-card--only-text' });

  const link = create('a', { attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });
  const badge = badgeInfo(view.badge);
  if (badge) {
    const badgeEl = create('div', {
      className: 'battery-charge-only',
      style: { 'background-color': badge.bg, color: badge.color },
    });
    badgeEl.appendChild(create('i', { className: 'sic-BDC-battery_charge_simple_fill' }));
    badgeEl.appendChild(create('span', { text: badge.text }));
    link.appendChild(badgeEl);
  }
  const textWrap = create('div', { className: 'opus-card__text' });
  textWrap.appendChild(create('div', { className: 'bt-opus-text-clamp', text: title }));
  link.appendChild(textWrap);
  section.appendChild(link);

  const stat = view.stat || {};
  const icons = create('div', { className: 'opus-card__icons' });
  if (statText(stat.view)) icons.appendChild(textStat('sic-BDC-eye_browse_line', stat.view));
  if (statText(stat.like)) icons.appendChild(textStat('sic-BDC-hand_thumbsup_line', stat.like));
  if (icons.childNodes.length) section.appendChild(icons);

  return section;
}

/** 渲染一张图文卡片（原生 DOM 结构） */
export function buildOpusCard(item) {
  const root = create('div', {
    className: 'opus-card',
    attrs: { 'data-bt-key': item.key || '' },
  });
  root.appendChild(item.cover && item.cover.src ? buildCoverCard(item) : buildTextCard(item));

  const view = item.view || {};
  const meta = [view.author, view.pub_time].filter(Boolean).join(' · ');
  if (meta) {
    root.appendChild(
      create('div', {
        className: 'opus-card__subtitle',
        text: meta,
        attrs: { title: meta },
      }),
    );
  }
  return root;
}
