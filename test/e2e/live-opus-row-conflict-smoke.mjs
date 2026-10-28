// 视频问题回归：独立统一行高（03）与图文翻页（02）同时安装时，
// 03 必须让位，02 的分页条可点击，且网格图片全部加载。
// 用法：node test/e2e/live-opus-row-conflict-smoke.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ROW = path.join(ROOT, 'dist', '03-图文统一行高.user.js');
const OPUS = path.join(ROOT, 'dist', '02-图文翻页.user.js');
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

async function waitImages(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const imgs = [...document.querySelectorAll(sel)];
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    selector,
    { timeout: 25000 },
  );
}

async function main() {
  const executablePath = await findBrowser();
  const browser = await chromium.launch({
    executablePath,
    headless: process.env.HEADED !== '1',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  // 先只注入 03：模拟用户先启用统一行高，再启用图文翻页。
  await context.addInitScript({ path: ROW });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

  try {
    console.log('打开:', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.BILI_TOOLS?.row?.state?.active === true, null, {
      timeout: 30000,
    });
    await page.waitForTimeout(1200);
    const rowOnly = await page.evaluate(() => ({
      items: document.querySelectorAll('.bt-opus-row-item').length,
      active: window.BILI_TOOLS.row.state.active,
    }));
    assert.ok(rowOnly.active && rowOnly.items > 0, '只装 03 时应接管原生网格');
    await waitImages(page, '.bt-opus-row-grid .bili-cover-card img');

    // 再注入 02（视频里的顺序：03 先启动，02 后启用）。
    console.log('再启用图文翻页 02…');
    await page.addScriptTag({ path: OPUS });
    await page.waitForFunction(() => window.BILI_TOOLS?.opus?.state?.active === true, null, {
      timeout: 20000,
    });
    await page.waitForFunction(() => window.BILI_TOOLS?.row?.state?.active === false, null, {
      timeout: 15000,
    });
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => ({
      rowActive: window.BILI_TOOLS.row.state.active,
      clones: document.querySelectorAll('.bt-opus-row-item').length,
      gridItems: document.querySelectorAll('.bt-opus-item').length,
      pager: document.querySelectorAll('.bt-opus-pager').length,
      page: window.BILI_TOOLS.opus.state.page,
    }));
    console.log('02 接管后:', after);
    assert.equal(after.rowActive, false, '02 启用后 03 必须让位');
    assert.equal(after.clones, 0, '03 克隆网格必须移除，不能盖住 02');
    assert.equal(after.pager, 1, '02 分页条应存在且只有一个');
    assert.equal(after.gridItems, 20, '02 当前页应渲染 20 条');
    await waitImages(page, '.bt-opus-grid .bili-cover-card img');

    // 视频问题 2：分页条点击应真正切页。
    await page.evaluate(() => window.BILI_TOOLS.opus.next());
    await page.waitForFunction(() => window.BILI_TOOLS?.opus?.state?.page === 2, null, {
      timeout: 20000,
    });
    await page.waitForTimeout(800);
    const page2 = await page.evaluate(() => ({
      page: window.BILI_TOOLS.opus.state.page,
      clones: document.querySelectorAll('.bt-opus-row-item').length,
      items: document.querySelectorAll('.bt-opus-item').length,
    }));
    console.log('第 2 页:', page2);
    assert.equal(page2.page, 2, '分页应切到第 2 页');
    assert.equal(page2.clones, 0, '第 2 页也不应出现 03 克隆网格');
    assert.equal(page2.items, 20, '第 2 页应渲染 20 条');
    await waitImages(page, '.bt-opus-grid .bili-cover-card img');

    assert.deepEqual(errors, [], '不应有未捕获异常');
    console.log('03 + 02 冲突/图片/分页回归通过');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
