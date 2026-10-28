// 阶段 1 e2e：用本机 Chrome/Edge 打开假动态页，注入构建后的 userscript，验证分页行为。
// v0.2.0 行为：每页 12 条（与 B 站自动加载条数一致），保留原生自动加载作为下一页预取。
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(ROOT, 'dist', '01-动态翻页.user.js');
const SHOTS = path.join(ROOT, 'test', 'screenshots');

const CANDIDATES = [
  process.env.BILI_TEST_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

async function findBrowser() {
  for (const candidate of CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error('未找到 Chrome/Edge，可用 BILI_TEST_BROWSER 指定可执行文件路径');
}

async function inject(page) {
  await page.addScriptTag({ path: SCRIPT });
}

async function waitActive(page) {
  await page.waitForFunction(() => window.BILI_TOOLS?.dyn?.active === true, null, { timeout: 20000 });
  // 等一轮 debounce/observer
  await page.waitForTimeout(300);
}

async function visibleIndexes(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.bili-dyn-list__item'))
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => Number(el.dataset.idx)),
  );
}

async function totalCount(page) {
  return page.evaluate(() => document.querySelectorAll('.bili-dyn-list__item').length);
}

async function debugState(page) {
  return page.evaluate(() => window.BILI_TOOLS?.dyn?.state);
}

async function waitPage(page, expected) {
  await page.waitForFunction((n) => window.BILI_TOOLS?.dyn?.page === n, expected, { timeout: 25000 });
  await page.waitForTimeout(200);
}

async function waitLoaded(page, expected) {
  await page.waitForFunction((n) => (window.BILI_TOOLS?.dyn?.state?.loaded ?? 0) >= n, expected, {
    timeout: 25000,
  });
  await page.waitForTimeout(300);
}

async function pagerDocTop(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.bili-tools-dyn-pager');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return Math.round((rect.top + window.scrollY) * 10) / 10;
  });
}

function assertRange(actual, from, to, label) {
  const expected = [];
  for (let i = from; i <= to; i += 1) expected.push(i);
  assert.deepEqual(actual, expected, `${label}: 可见条目应为 ${from}..${to}`);
}

async function runVmTest(browser, base) {
  console.log('--- VM 模式测试（每页 12 条 + 原生预取）---');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(`${base}/440900637/dynamic?total=25`, { waitUntil: 'load' });
  await inject(page);
  await waitActive(page);

  let st = await debugState(page);
  assert.equal(st.adapter, 'vm', '应走 VM 通道');
  assert.equal(st.page, 1);
  assert.equal(st.loaded, 12, '初始正好 12 条');
  assert.equal(await totalCount(page), 12, '初始已加载 12 条');
  assertRange(await visibleIndexes(page), 0, 11, '第 1 页（12 条）');

  const pager = page.locator('.bili-tools-dyn-pager');
  assert.equal(await pager.count(), 1, '应只有一个分页条');
  const countText = await page.locator('.bili-tools-dyn-pager .vui_pagenation-go__count').innerText();
  assert.match(countText, /第 1 页/);
  assert.match(countText, /已加载 12 个/);

  // 原生加载条应被隐藏（避免把分页条顶下去）
  const loadingBarHidden = await page.evaluate(() => {
    const el = document.querySelector('.bili-dyn-list-loading');
    el.style.display = '';
    return getComputedStyle(el).display === 'none';
  });
  assert.equal(loadingBarHidden, true, '启用分页后原生加载条应隐藏');

  // 关键行为：滚到当前页底部 → B 站原生自动加载 12 条（正好是下一页），保留不禁止
  const pagerTopBefore = await pagerDocTop(page);
  await page.evaluate(() => {
    window.__fakeLoadCalls = 0;
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await waitLoaded(page, 24);
  assert.equal(await page.evaluate(() => window.__fakeLoadCalls), 1, '滚到底应触发一次原生自动加载');
  st = await debugState(page);
  assert.equal(st.loaded, 24, '预取后已加载 24 条');
  assert.equal(st.page, 1, '预取不应改变当前页');
  assertRange(await visibleIndexes(page), 0, 11, '预取的新条目应立即隐藏，当前页仍为 12 条');
  const pagerTopAfter = await pagerDocTop(page);
  assert.ok(
    Math.abs(pagerTopAfter - pagerTopBefore) <= 2,
    `分页条位置不应因预取变化（前 ${pagerTopBefore} / 后 ${pagerTopAfter}）`,
  );
  await page.screenshot({ path: path.join(SHOTS, 'dyn-prefetch-bottom.png'), fullPage: false });

  // 下一页：预取已就绪，不应再发请求
  await page.locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]').click();
  await waitPage(page, 2);
  assertRange(await visibleIndexes(page), 12, 23, '第 2 页（12 条）');
  st = await debugState(page);
  assert.equal(st.loaded, 24, '预取已就绪，翻到第 2 页不应再加载');
  assert.equal(await page.evaluate(() => window.__fakeLoadCalls), 1, '翻页不应触发额外加载');
  await page.screenshot({ path: path.join(SHOTS, 'dyn-vm-page2.png'), fullPage: true });

  // 第 3 页：需要 36 条，只有 25 条 → 由分页按钮触发一次加载并到末页
  await page.locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]').click();
  await waitPage(page, 3);
  assertRange(await visibleIndexes(page), 24, 24, '第 3 页（末页只剩 1 条）');
  st = await debugState(page);
  assert.equal(st.totalPages, 3, '末页总页数应为 3');
  assert.equal(st.loaded, 25);
  const nextVisible = await page
    .locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]')
    .isVisible();
  assert.equal(nextVisible, false, '末页“下一页”应隐藏');

  // 跳页输入
  const input = page.locator('.bili-tools-dyn-pager .vui_pagenation-go input');
  await input.fill('2');
  await input.press('Enter');
  await waitPage(page, 2);
  assertRange(await visibleIndexes(page), 12, 23, '跳转到第 2 页');

  // 重复注入：不应出现第二个分页条
  await inject(page);
  await page.waitForTimeout(300);
  assert.equal(await pager.count(), 1, '重复注入后仍应只有一个分页条');

  // 模拟切 tab：列表重置 → 回到第 1 页
  await page.evaluate(() => window.__fakeReset());
  await page.waitForFunction(() => window.BILI_TOOLS?.dyn?.page === 1, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  assertRange(await visibleIndexes(page), 0, 11, '列表重置后回到第 1 页');

  assert.deepEqual(pageErrors, [], '不应有未捕获的页面异常');
  await context.close();
  console.log('VM 模式测试通过');
}

async function runVmRebuildTest(browser, base) {
  console.log('--- VM 模式（整列表重绘）测试 ---');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/440900637/dynamic?total=25&rebuild=1`, { waitUntil: 'load' });
  await inject(page);
  await waitActive(page);
  assertRange(await visibleIndexes(page), 0, 11, '第 1 页');
  await page.locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]').click();
  await waitPage(page, 2);
  assertRange(await visibleIndexes(page), 12, 23, '整列表重绘后仍应正确隐藏');
  await context.close();
  console.log('整列表重绘测试通过');
}

async function runDomTest(browser, base) {
  console.log('--- 纯 DOM 回退模式测试 ---');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(`${base}/440900637/dynamic?total=25&nomv=1`, { waitUntil: 'load' });
  await inject(page);
  await waitActive(page);
  let st = await debugState(page);
  assert.equal(st.adapter, 'dom', '没有 __vue__ 时应退化为 DOM 模式');
  assertRange(await visibleIndexes(page), 0, 11, '第 1 页');
  await page.locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]').click();
  await waitPage(page, 2);
  assertRange(await visibleIndexes(page), 12, 23, 'DOM 模式第 2 页');
  await page.screenshot({ path: path.join(SHOTS, 'dyn-dom-page2.png'), fullPage: true });
  assert.deepEqual(pageErrors, [], '不应有未捕获的页面异常');
  await context.close();
  console.log('纯 DOM 回退模式测试通过');
}

async function runSmallListTest(browser, base) {
  console.log('--- 少量数据（不足一页 / 恰好一页）测试 ---');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/440900637/dynamic?total=5`, { waitUntil: 'load' });
  await inject(page);
  await waitActive(page);
  assertRange(await visibleIndexes(page), 0, 4, '总量 5 条时全部显示');
  let st = await debugState(page);
  assert.equal(st.totalPages, 1, '总量 5 条应为 1 页');
  assert.equal(
    await page.locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]').isVisible(),
    false,
    '只有一页时下一页应隐藏',
  );
  await page.goto(`${base}/440900637/dynamic?total=12`, { waitUntil: 'load' });
  await inject(page);
  await waitActive(page);
  assertRange(await visibleIndexes(page), 0, 11, '12 条正好一页（每页 12 条）');
  st = await debugState(page);
  assert.equal(st.totalPages, 1, '12 条应为 1 页');
  assert.equal(
    await page.locator('.bili-tools-dyn-pager .vui_pagenation--btn-side[aria-label="下一页"]').isVisible(),
    false,
    '12 条时下一页应隐藏',
  );
  await context.close();
  console.log('少量数据测试通过');
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const executablePath = await findBrowser();
  console.log('浏览器:', executablePath);
  const server = await startServer();
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    await runVmTest(browser, server.url);
    await runVmRebuildTest(browser, server.url);
    await runDomTest(browser, server.url);
    await runSmallListTest(browser, server.url);
  } finally {
    await browser.close();
    await server.close();
  }
  console.log('全部 e2e 通过');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
