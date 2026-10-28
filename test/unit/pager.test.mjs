import test from 'node:test';
import assert from 'node:assert/strict';

import { computePagerModel, formatPagerCount } from '../../src/shared/pager.js';

const nums = (model) => model.items.filter((item) => item.type === 'page').map((item) => item.page);
const kinds = (model) => model.items.map((item) => item.type + (item.type === 'more' ? `:${item.delta}` : ''));

test('总页数 <= 9 时显示全部页码', () => {
  const model = computePagerModel({ page: 3, totalPages: 7, hasMore: false, loadedCount: 70, pageSize: 10 });
  assert.deepEqual(nums(model), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(model.items.find((item) => item.active).page, 3);
  assert.equal(model.prevDisabled, false);
  assert.equal(model.nextDisabled, false);
});

test('首尾页边界：上一页/下一页禁用', () => {
  const first = computePagerModel({ page: 1, totalPages: 5, hasMore: false, loadedCount: 50, pageSize: 10 });
  assert.equal(first.prevDisabled, true);
  assert.equal(first.nextDisabled, false);
  const last = computePagerModel({ page: 5, totalPages: 5, hasMore: false, loadedCount: 50, pageSize: 10 });
  assert.equal(last.prevDisabled, false);
  assert.equal(last.nextDisabled, true);
});

test('原生页码窗口：总 17 页在第 4 页', () => {
  const model = computePagerModel({ page: 4, totalPages: 17, hasMore: false, loadedCount: 680, pageSize: 10 });
  assert.deepEqual(kinds(model), ['page', 'page', 'page', 'page', 'page', 'page', 'page', 'more:5', 'page']);
  assert.deepEqual(nums(model), [1, 2, 3, 4, 5, 6, 7, 17]);
  assert.equal(model.items.at(-2).delta, 5);
});

test('原生页码窗口：总 17 页在第 10 页', () => {
  const model = computePagerModel({ page: 10, totalPages: 17, hasMore: false, loadedCount: 680, pageSize: 10 });
  assert.deepEqual(kinds(model), ['page', 'more:-5', 'page', 'page', 'page', 'page', 'page', 'more:5', 'page']);
  assert.deepEqual(nums(model), [1, 8, 9, 10, 11, 12, 17]);
});

test('原生页码窗口：总 17 页在尾部', () => {
  const model = computePagerModel({ page: 16, totalPages: 17, hasMore: false, loadedCount: 680, pageSize: 10 });
  assert.deepEqual(kinds(model), ['page', 'more:-5', 'page', 'page', 'page', 'page', 'page', 'page', 'page']);
  assert.deepEqual(nums(model), [1, 11, 12, 13, 14, 15, 16, 17]);
});

test('总页数未知：围绕当前页给窗口并保留“再加载 5 页”按钮', () => {
  const model = computePagerModel({ page: 1, totalPages: null, hasMore: true, loadedCount: 12, pageSize: 10 });
  assert.deepEqual(nums(model), [1, 2, 3]);
  assert.deepEqual(kinds(model), ['page', 'page', 'page', 'more:5']);
  assert.equal(model.prevDisabled, true);
  assert.equal(model.nextDisabled, false);
  assert.equal(model.jumpEnabled, true);
});

test('总页数未知且当前页较大：显示首页 + 省略号 + 当前窗口', () => {
  const model = computePagerModel({ page: 5, totalPages: null, hasMore: true, loadedCount: 60, pageSize: 10 });
  assert.deepEqual(kinds(model), ['page', 'ellipsis', 'page', 'page', 'page', 'page', 'page', 'more:5']);
  assert.deepEqual(nums(model), [1, 3, 4, 5, 6, 7]);
});

test('总页数未知且没有更多：下一页禁用、无“更多”按钮', () => {
  const model = computePagerModel({ page: 3, totalPages: null, hasMore: false, loadedCount: 30, pageSize: 10 });
  assert.equal(model.nextDisabled, true);
  assert.equal(model.jumpEnabled, false);
  assert.deepEqual(kinds(model), ['page', 'page', 'page']);
});

test('计数文案：已知总数 / 未知总数', () => {
  assert.equal(
    formatPagerCount({ page: 4, totalPages: 17, loadedCount: 680, totalCount: 680, pageSize: 10 }),
    '共 17 页 / 680 个，跳至',
  );
  assert.equal(
    formatPagerCount({ page: 2, totalPages: null, loadedCount: 24, pageSize: 10 }),
    '第 2 页 · 已加载 24 个，跳至',
  );
});

test('异常输入被归一化', () => {
  const model = computePagerModel({ page: -3, totalPages: 0, hasMore: false, loadedCount: -2, pageSize: 0 });
  assert.equal(model.page, 1);
  assert.equal(model.totalPages, null);
  assert.equal(model.prevDisabled, true);
  assert.equal(model.nextDisabled, true);
});
