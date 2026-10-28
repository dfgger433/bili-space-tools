import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE_SIZE,
  computeNaturalSize,
  estimateTextHeight,
  fromInstanceItem,
  normalizeUrl,
  toItem,
} from '../../src/opus/model.js';
import {
  computeColumnWidth,
  columnsForWidth,
  layoutWaterfall,
  slicePage,
  totalPages,
} from '../../src/opus/layout.js';

test('PAGE_SIZE 与 B 站图文自动加载批次一致（20）', () => {
  assert.equal(PAGE_SIZE, 20);
});

test('列宽公式：常见窗口宽度', () => {
  assert.deepEqual(computeColumnWidth(1280), { columns: 4, columnWidth: (1280 - 286 - 60) / 4 });
  assert.deepEqual(computeColumnWidth(1440), { columns: 5, columnWidth: (1440 - 286 - 80) / 5 });
  assert.deepEqual(computeColumnWidth(1600), { columns: 5, columnWidth: (1600 - 446 - 80) / 5 });
  // 1920: total = 1920 - (240+16+280) = 1384
  assert.deepEqual(computeColumnWidth(1920), { columns: 6, columnWidth: (1384 - 100) / 6 });
});

test('由容器宽度反推列数', () => {
  assert.equal(columnsForWidth(1458, 226.33, 20), 6);
  assert.equal(columnsForWidth(1000, 226.33, 20), 4);
  assert.equal(columnsForWidth(0, 200, 20), 0);
});

test('文本高度估算与上限', () => {
  assert.equal(estimateTextHeight({ str: '1234567890', lineWeight: 190, maxHeight: 80 }), 17);
  assert.equal(estimateTextHeight({ str: 'x'.repeat(2000), lineWeight: 190, maxHeight: 40 }), 40);
});

test('自然高度：横图 / 竖图 / 无封面', () => {
  const cw = 240;
  const landscape = computeNaturalSize({ cover: { width: 1200, height: 800 }, content: 'abc' }, cw);
  // 横图：240/160*120 = 180；文本 17；pad 4
  assert.equal(landscape.coverHeight, 180);
  assert.equal(landscape.height, Math.floor(180 + 17 + 4));

  const portrait = computeNaturalSize({ cover: { width: 600, height: 1000 }, content: 'abc' }, cw);
  // 竖图：240/160*210 = 315
  assert.equal(portrait.coverHeight, 315);
  assert.equal(portrait.height, Math.floor(315 + 17 + 4));

  const textOnly = computeNaturalSize({ content: 'abc' }, cw);
  assert.equal(textOnly.coverHeight, 0);
  // 无封面：文本 17、pad 46
  assert.equal(textOnly.height, 17 + 46);
});

test('自然高度：作者行与徽章', () => {
  const cw = 240;
  const withAuthor = computeNaturalSize({ content: 'abc', author: 'UP' }, cw);
  assert.equal(withAuthor.height, 17 + 46 + 24);
  const noCoverBadge = computeNaturalSize({ content: 'abc', badge: { text: '充电' } }, cw);
  assert.equal(noCoverBadge.height, 17 + 68);
});

test('URL 协议相对地址补全', () => {
  assert.equal(normalizeUrl('//www.bilibili.com/opus/1'), 'https://www.bilibili.com/opus/1');
  assert.equal(normalizeUrl('http://i0.hdslb.com/a.jpg'), 'https://i0.hdslb.com/a.jpg');
  assert.equal(normalizeUrl('https://i0.hdslb.com/a.jpg'), 'https://i0.hdslb.com/a.jpg');
  assert.equal(normalizeUrl('data:image/svg+xml,x'), 'data:image/svg+xml,x');
  assert.equal(normalizeUrl(''), '');
});

test('原始 item 映射出 cover 与高度', () => {
  const cw = 240;
  const view = {
    opus_id: '42',
    jump_url: '//www.bilibili.com/opus/42',
    content: 'hello',
    cover: { url: '//i0.hdslb.com/a.jpg', width: 1200, height: 800 },
  };
  const item = toItem(view, 0, cw);
  assert.equal(item.key, '42');
  assert.equal(item.width, cw);
  assert.equal(item.cover.src, 'https://i0.hdslb.com/a.jpg');
  assert.equal(item.cover.width, cw);
  assert.equal(item.cover.height, 180);
  assert.equal(item.height, Math.floor(180 + 17 + 4));
});

test('页面已映射 item 复用原生 width/height/cover', () => {
  const view = {
    opus_id: '7',
    jump_url: '//www.bilibili.com/opus/7',
    content: 'abc',
    stat: { like: '5' },
  };
  const item = fromInstanceItem(
    { data: { view, cover: { src: '//i0.hdslb.com/b.jpg', width: 190, height: 249 } }, index: 3, width: 190, height: 270 },
    0,
  );
  assert.equal(item.key, '7');
  assert.equal(item.index, 3);
  assert.equal(item.width, 190);
  assert.equal(item.height, 270);
  assert.equal(item.cover.src, 'https://i0.hdslb.com/b.jpg');
  assert.equal(item.cover.width, 190);
  assert.equal(item.cover.height, 249);
});

test('瀑布流：等高时前 10 条行优先', () => {
  const items = Array.from({ length: 10 }, () => ({ height: 100 }));
  const cw = 200;
  const g = 20;
  const layout = layoutWaterfall(items, { columnWidth: cw, columns: 4, columnGutter: g, rowGutter: 18 });
  assert.deepEqual(layout.positions[0], { left: 0, top: 0 });
  assert.deepEqual(layout.positions[1], { left: cw + g, top: 0 });
  assert.deepEqual(layout.positions[2], { left: 2 * (cw + g), top: 0 });
  assert.deepEqual(layout.positions[3], { left: 3 * (cw + g), top: 0 });
  assert.deepEqual(layout.positions[4], { left: 0, top: 118 });
  assert.deepEqual(layout.positions[8], { left: 0, top: 236 });
  assert.deepEqual(layout.positions[9], { left: cw + g, top: 236 });
  assert.equal(layout.height, 354);
  assert.equal(layout.width, 4 * cw + 3 * g);
});

test('瀑布流：高度不同时不重叠且落在最短列', () => {
  const heights = [300, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120];
  const items = heights.map((h) => ({ height: h }));
  const layout = layoutWaterfall(items, { columnWidth: 200, columns: 4, columnGutter: 20, rowGutter: 18 });
  for (let i = 0; i < layout.positions.length; i += 1) {
    for (let j = i + 1; j < layout.positions.length; j += 1) {
      const a = layout.positions[i];
      const b = layout.positions[j];
      const overlapX = a.left < b.left + 200 && b.left < a.left + 200;
      const overlapY = a.top < b.top + heights[j] && b.top < a.top + heights[i];
      assert.ok(!(overlapX && overlapY), `item ${i} 与 ${j} 不应重叠`);
    }
  }
  // 第 11 条（index 10）应进入最短列
  const colOf = (p) => Math.round(p.left / 220);
  const tops = [0, 1, 2, 3].map((c) => layout.positions[c].top);
  assert.ok(colOf(layout.positions[10]) >= 0 && colOf(layout.positions[10]) <= 3);
  assert.ok(tops.every((t) => t === 0));
});

test('分页切片与总页数', () => {
  const items = Array.from({ length: 65 }, (_, i) => i);
  assert.deepEqual(slicePage(items, 1, 20), items.slice(0, 20));
  assert.deepEqual(slicePage(items, 4, 20), items.slice(60, 65));
  assert.equal(totalPages(65, 20), 4);
  assert.equal(totalPages(0, 20), 1);
});
