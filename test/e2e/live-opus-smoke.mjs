// 图文页真实站点冒烟测试（可选，需要联网；匿名访问公开 UP 主即可，不需要登录）
// 用法：npm run test:live:opus   （可用 BILI_LIVE_OPUS_URL 覆盖目标页）
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(ROOT, 'dist', '02-图文翻页.user.js');
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
  const executablePath = await findBrowser();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });
  await context.addInitScript({ path: SCRIPT });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

  const state = () => page.evaluate(() => window.BILI_TOOLS?.opus?.state || null);

  try {
    console.log('打开:', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.BILI_TOOLS?.opus?.active === true, null, { timeout: 30000 });
    await page.waitForTimeout(1000);

    let st = await state();
    console.log('初始状态:', st);
    assert.ok(['vue', 'network'].includes(st.adapter), '应有数据通道');
    assert.ok(st.loaded >= 20, '首屏应加载至少 20 条');
    assert.equal(await page.locator('.bt-opus-item').count(), 20, '第 1 页应渲染 20 张');
    assert.equal(await page.locator('.bt-opus-pager').count(), 1, '应有分页条');

    const initial = st.loaded;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page
      .waitForFunction((before) => (window.BILI_TOOLS?.opus?.state?.loaded ?? 0) > before, initial, {
        timeout: 25000,
      })
      .catch(() => {});
    await page.waitForTimeout(1000);
    st = await state();
    assert.equal(st.page, 1, '预取不应改变当前页');
    assert.equal(await page.locator('.bt-opus-item').count(), 20, '预取后当前页仍 20 张');
    assert.ok(st.loaded > initial, '滚到底应触发原生自动加载预取');

    await page.evaluate(() => {
      document.querySelector('.bt-opus-pager .vui_pagenation--btn-side[aria-label="下一页"]')?.click();
    });
    await page.waitForFunction(() => window.BILI_TOOLS?.opus?.state?.page === 2, null, {
      timeout: 30000,
    });
    await page.waitForTimeout(800);
    st = await state();
    console.log('第 2 页状态:', st);
    assert.equal(await page.locator('.bt-opus-item').count(), 20, '第 2 页应渲染 20 张');
    assert.ok(st.loaded >= 40, '第 2 页数据应已具备或已加载');
    assert.deepEqual(errors, [], '不应有未捕获异常');
    console.log('真实图文页冒烟测试通过');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
