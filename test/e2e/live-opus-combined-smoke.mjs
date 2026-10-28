// 02 + 03 兼容性真实站点冒烟：分页脚本 + 统一行高同时启用。
// 用法：npm run test:live:combined   （可选，需要联网；匿名访问公开 UP 主即可）
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(ROOT, 'dist', 'B站空间页增强.user.js');
const URL = process.env.BILI_LIVE_OPUS_URL || 'https://space.bilibili.com/631063962/upload/opus';

const CANDIDATES = [
  process.env.BILI_TEST_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
].filter(Boolean);

async function findBrowser() {
  for (const candidate of CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  throw new Error('未找到 Chrome/Edge，可用 BILI_TEST_BROWSER 指定路径');
}

async function main() {
  const browser = await chromium.launch({
    executablePath: await findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  await context.addInitScript((cfg) => {
    window.__BILI_TOOLS_MODULES__ = cfg;
  }, { dyn: false, opus: true, row: true });
  await context.addInitScript({ path: SCRIPT });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

  const read = () =>
    page.evaluate(() => {
      const groups = new Map();
      for (const el of document.querySelectorAll('.bt-opus-grid > .bt-opus-item')) {
        const rect = el.getBoundingClientRect();
        const top = Math.round((rect.top + window.scrollY) * 100) / 100;
        if (!groups.has(top)) groups.set(top, []);
        const img = el.querySelector('.bili-cover-card img');
        const card = el.querySelector('.opus-card');
        const title = el.querySelector('.opus-card__title');
        const cover = el.querySelector('.bili-cover-card');
        const cardRect = card?.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        groups.get(top).push({
          height: Math.round(rect.height * 100) / 100,
          fit: img ? getComputedStyle(img).objectFit : '',
          nativeClip: el.classList.contains('bt-opus-row-native-clip'),
          titleFits: !titleRect || !cardRect ? true : titleRect.bottom <= cardRect.bottom + 1,
          imgLoaded: !img || (img.complete && img.naturalWidth > 0),
          coverHeight: cover ? Math.round(cover.getBoundingClientRect().height * 100) / 100 : 0,
          imgHeight: img ? Math.round(img.getBoundingClientRect().height * 100) / 100 : 0,
        });
      }
      return {
        opus: window.BILI_TOOLS?.opus?.state || null,
        row: window.BILI_TOOLS?.row?.state || null,
        pager: document.querySelectorAll('.bt-opus-pager').length,
        count: document.querySelectorAll('.bt-opus-grid > .bt-opus-item').length,
        rows: Array.from(groups.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([top, list]) => ({
            top,
            heights: list.map((x) => x.height),
            fits: [...new Set(list.map((x) => x.fit))],
            natives: list.map((x) => x.nativeClip),
            titleFits: list.map((x) => x.titleFits),
            imgLoaded: list.map((x) => x.imgLoaded),
            coverHeights: list.map((x) => x.coverHeight),
            imgHeights: list.map((x) => x.imgHeight),
          })),
      };
    });

  try {
    console.log('打开:', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.BILI_TOOLS?.opus?.state?.active === true, null, {
      timeout: 30000,
    });
    await page.waitForFunction(() => window.BILI_TOOLS?.row?.state?.mode === 'bt', null, {
      timeout: 20000,
    });
    await page.waitForTimeout(1500);

    let state = await read();
    console.log('第 1 页:', {
      opusPage: state.opus?.page,
      rowMode: state.row?.mode,
      rowItems: state.row?.items,
      pager: state.pager,
      count: state.count,
      rows: state.rows.length,
    });
    assert.equal(state.pager, 1, '分页条应只有 1 个（来自 02）');
    assert.equal(state.row.mode, 'bt', '03 应接管 02 的分页网格');
    assert.equal(state.row.items, 20, '03 应处理当前页 20 条');
    assert.equal(state.row.columns, state.opus.columns, '03 列数应与 02 一致');
    const assertRows = (snapshot, label) => {
      const stats = snapshot.row.rowStats || [];
      snapshot.rows.forEach((row, i) => {
        const stat = stats[i];
        assert.equal(new Set(row.heights.map((h) => Math.round(h))).size, 1, `${label}同一行应等高`);
        assert.ok(row.titleFits.every(Boolean), `${label}裁剪时标题不应被卡片底部截断`);
        assert.ok(row.imgLoaded.every(Boolean), `${label}网格图片应全部加载`);
        if (stat && stat.clipped) {
          assert.ok(row.natives.some(Boolean), `${label}裁剪行应有 B 站默认裁剪卡片`);
          assert.ok(
            row.natives.some((native, index) => native && row.coverHeights[index] > 0 && row.imgHeights[index] > 0),
            `${label}裁剪卡片封面高度必须大于 0（不能只剩标题）`,
          );
          assert.ok(row.fits.every((fit) => fit === 'contain' || fit === 'cover'), `${label}裁剪行只允许 contain/cover`);
        } else {
          assert.ok(row.fits.every((fit) => fit === 'contain'), `${label}未裁剪行封面应完整显示`);
        }
      });
    };
    assertRows(state, '第 1 页');

    await page.evaluate(() => window.BILI_TOOLS.opus.next());
    await page.waitForFunction(() => window.BILI_TOOLS?.opus?.state?.page === 2, null, {
      timeout: 20000,
    });
    await page.waitForFunction(
      () => window.BILI_TOOLS?.row?.state?.mode === 'bt' && window.BILI_TOOLS.row.state.items === 20,
      null,
      { timeout: 15000 },
    );
    await page.waitForTimeout(800);
    state = await read();
    console.log('第 2 页:', {
      opusPage: state.opus?.page,
      rowMode: state.row?.mode,
      rowItems: state.row?.items,
      pager: state.pager,
      count: state.count,
      rows: state.rows.length,
    });
    assert.equal(state.pager, 1, '翻页后仍只有 1 个分页条');
    assert.equal(state.count, 20, '翻页后仍 20 条');
    assertRows(state, '第 2 页');
    assert.deepEqual(errors, [], '不应有未捕获异常');
    console.log('02 + 03 兼容性真实站点冒烟通过');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
