// 阶段 2 e2e：假图文页 + 本机 Chrome，验证接管渲染 / 20 条一页 / 原生自动加载预取 / 切 tab / resize。
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(ROOT, 'dist', '02-图文翻页.user.js');
const MENU_SCRIPT = path.join(ROOT, 'dist', '00-图文翻页菜单.user.js');
const SHOTS = path.join(ROOT, 'test', 'screenshots');

const CANDIDATES = [
  process.env.BILI_TEST_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
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

async function openPage(browser, base, query = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  // 假接口返回 hdslb 封面 URL；用路由拦截，原图和 @640w.webp 都返回占位图
  await page.route('https://i0.hdslb.com/**', async (route) => {
    const url = route.request().url();
    const match = url.match(/opus-(\d+)\.svg/);
    const index = match ? Number(match[1]) : 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="hsl(${(index * 47) % 360},70%,80%)"/><text x="50%" y="50%" font-family="sans-serif" font-size="120" text-anchor="middle" dominant-baseline="middle" fill="#333">#${index}</text></svg>`;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
  // 模拟油猴菜单 API（脚本通过 GM_registerMenuCommand 暴露“图片压缩”开关）
  await page.addInitScript(() => {
    const commands = [];
    let nextId = 1;
    window.__gmMenuCommands = commands;
    window.GM_registerMenuCommand = (name, callback) => {
      const existing = commands.find((item) => item.name === name);
      if (existing) {
        existing.callback = callback;
        return existing.id;
      }
      const id = nextId;
      nextId += 1;
      commands.push({ id, name, callback });
      return id;
    };
    window.GM_unregisterMenuCommand = (id) => {
      const index = commands.findIndex((item) => item.id === id);
      if (index >= 0) commands.splice(index, 1);
    };
  });
  // 用 addInitScript 模拟 document-start 注入（脚本需要提前装接口观察器）
  await page.addInitScript({ path: SCRIPT });
  // 配套菜单脚本（只注册油猴菜单、写 localStorage）
  await page.addInitScript({ path: MENU_SCRIPT });
  await page.goto(`${base}/631063962/upload/opus${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.BILI_TOOLS?.opus?.active === true, null, { timeout: 25000 });
  await page.waitForTimeout(500);
  return { context, page, errors };
}

async function opusState(page) {
  return page.evaluate(() => window.BILI_TOOLS.opus.state);
}

async function itemCount(page) {
  return page.locator('.bt-opus-item').count();
}

async function firstTitle(page) {
  return page.locator('.bt-opus-item .opus-card__title').first().innerText();
}

async function firstItemInfo(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.bt-opus-item');
    if (!el) return null;
    const card = el.querySelector('.opus-card');
    return {
      key: card ? card.getAttribute('data-bt-key') : null,
      text: (el.innerText || '').slice(0, 120),
    };
  });
}

async function pagerDocTop(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.bt-opus-pager');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return Math.round((rect.top + window.scrollY) * 10) / 10;
  });
}

async function clickNextNoScroll(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.bt-opus-pager .vui_pagenation--btn-side[aria-label="下一页"]');
    if (btn) btn.click();
  });
}

async function runVueTest(browser, base) {
  console.log('--- 图文 VM 模式（每页 20 条 + 原生预取）---');
  const { context, page, errors } = await openPage(browser, base);

  let st = await opusState(page);
  assert.equal(st.adapter, 'vue', '应走 Vue 实例通道');
  assert.equal(st.page, 1);
  assert.equal(st.loaded, 20, '初始正好 20 条');
  assert.equal(await itemCount(page), 20, '第 1 页应渲染 20 张卡片');
  assert.equal(await page.locator('.bt-opus-pager').count(), 1, '应插入一个分页条');
  const feedHidden = await page.evaluate(() => {
    const el = document.querySelector('.opus-feed');
    const cs = getComputedStyle(el);
    return cs.visibility === 'hidden' || cs.display === 'none';
  });
  assert.equal(feedHidden, true, '原生 feed 应隐藏');
  const countText = await page.locator('.bt-opus-pager .vui_pagenation-go__count').innerText();
  assert.match(countText, /已加载 20 个/);
  const first = await firstItemInfo(page);
  assert.equal(first?.key, '900001', '第 1 页首项应是第 1 条');
  assert.match(first?.text || '', /图文 #1\b/);
  const href = await page.locator('.bt-opus-item .opus-card__title').first().getAttribute('href');
  assert.match(href, /^https:\/\/www\.bilibili\.com\/opus\//, '跳转链接应补全为 https');
  assert.ok((await page.locator('.bt-opus-item .opus-card--only-text').count()) >= 1, '应有无封面卡片');
  await page.screenshot({ path: path.join(SHOTS, 'opus-vue-page1.png'), fullPage: true });

  // 滚到底：原生自动加载预取下一页 20 条，但当前页仍 20 张、分页条不动
  const pagerTopBefore = await pagerDocTop(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => window.BILI_TOOLS.opus.state.loaded >= 40, null, { timeout: 15000 });
  await page.waitForTimeout(350);
  st = await opusState(page);
  assert.equal(st.page, 1, '预取不应改变当前页');
  assert.equal(await itemCount(page), 20, '预取的新条目不应渲染');
  assert.match(
    await page.locator('.bt-opus-pager .vui_pagenation-go__count').innerText(),
    /已加载 40 个/,
  );
  const pagerTopAfter = await pagerDocTop(page);
  assert.ok(
    Math.abs(pagerTopAfter - pagerTopBefore) <= 2,
    `预取后分页条位置不应变化（前 ${pagerTopBefore} / 后 ${pagerTopAfter}）`,
  );
  await page.screenshot({ path: path.join(SHOTS, 'opus-vue-prefetch.png'), fullPage: false });

  // 下一页：预取已就绪，直接显示 21–40
  await clickNextNoScroll(page);
  await page.waitForFunction(() => window.BILI_TOOLS.opus.state.page === 2, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  assert.equal(await itemCount(page), 20, '第 2 页应渲染 20 张卡片');
  assert.equal((await firstItemInfo(page))?.key, '900021', '第 2 页首项应是第 21 条');
  st = await opusState(page);
  assert.ok(st.loaded >= 40, '第 2 页数据应已在预取中');
  await page.screenshot({ path: path.join(SHOTS, 'opus-vue-page2.png'), fullPage: true });

  // 第 3 页：若预取还没到 60 条则由分页按钮触发加载
  await clickNextNoScroll(page);
  await page.waitForFunction(() => window.BILI_TOOLS.opus.state.page === 3, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  assert.equal(await itemCount(page), 20, '第 3 页应渲染 20 张卡片');
  assert.equal((await firstItemInfo(page))?.key, '900041', '第 3 页首项应是第 41 条');
  st = await opusState(page);
  assert.equal(st.totalPages, 3, '末页总页数应为 3');
  assert.equal(st.hasMore, false, '末页 hasMore 应为 false');
  const nextVisible = await page.locator('.bt-opus-pager .vui_pagenation--btn-side[aria-label="下一页"]').isVisible();
  assert.equal(nextVisible, false, '末页“下一页”应隐藏');

  // 跳页输入
  const input = page.locator('.bt-opus-pager .vui_pagenation-go input');
  await input.fill('2');
  await input.press('Enter');
  await page.waitForFunction(() => window.BILI_TOOLS.opus.state.page === 2, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  assert.equal((await firstItemInfo(page))?.key, '900021', '跳转后首项应是第 21 条');

  // 重复注入：不应出现第二个分页条
  await page.addScriptTag({ path: SCRIPT });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.bt-opus-pager').count(), 1, '重复注入后仍应只有一个分页条');

  // 切 tab：脚本应回到第 1 页并等待新数据
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.content-tab'));
    const tab = tabs.find((t) => t.textContent.trim() === '专栏');
    if (tab) tab.click();
  });
  try {
    await page.waitForFunction(
      () => window.__opusFixture && window.__opusFixture.page >= 1 && window.BILI_TOOLS.opus.state.loaded === 20,
      null,
      { timeout: 15000 },
    );
  } catch (err) {
    console.log('tab wait failed:', await page.evaluate(() => ({
      fixture: window.__opusFixture ? { loaded: window.__opusFixture.loaded, page: window.__opusFixture.page, hasMore: window.__opusFixture.hasMore } : null,
      state: window.BILI_TOOLS.opus.state,
      tabs: Array.from(document.querySelectorAll('.content-tab')).map((t) => [t.textContent.trim(), t.className]),
      items: document.querySelectorAll('.bt-opus-item').length,
      pager: document.querySelectorAll('.bt-opus-pager').length,
      grid: document.querySelector('.bt-opus-grid')?.style.width,
    })));
    throw err;
  }
  await page.waitForTimeout(400);
  st = await opusState(page);
  assert.equal(st.page, 1, '切 tab 后应回到第 1 页');
  assert.equal(await itemCount(page), 20);

  // resize：列宽/列数应重算，仍渲染 20 张
  const columnsBefore = (await opusState(page)).columns;
  const widthBefore = await page.evaluate(() => parseFloat(document.querySelector('.bt-opus-grid').style.width) || 0);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForFunction(
    (before) => window.BILI_TOOLS.opus.state.columns < before,
    columnsBefore,
    { timeout: 10000 },
  );
  await page.waitForTimeout(500);
  const columnsAfter = (await opusState(page)).columns;
  const widthAfter = await page.evaluate(() => parseFloat(document.querySelector('.bt-opus-grid').style.width) || 0);
  assert.ok(columnsAfter <= columnsBefore, '窄屏列数不应增加');
  assert.ok(Math.abs(widthAfter - widthBefore) > 1, '网格宽度应随窗口变化');
  assert.equal(await itemCount(page), 20);

  assert.deepEqual(errors, [], '不应有未捕获的页面异常');
  await context.close();
  console.log('图文 VM 模式测试通过');
}

async function runNetworkTest(browser, base) {
  console.log('--- 图文网络抓包模式 ---');
  const { context, page, errors } = await openPage(browser, base, '?nomv=1');
  let st = await opusState(page);
  assert.equal(st.adapter, 'network', '没有 Vue 实例时应走网络抓包通道');
  assert.equal(st.loaded, 20);
  assert.equal(await itemCount(page), 20);
  await clickNextNoScroll(page);
  await page.waitForFunction(() => window.BILI_TOOLS.opus.state.page === 2, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  st = await opusState(page);
  assert.ok(st.loaded >= 40, '网络模式翻页应触发页面自身加载');
  assert.equal(await itemCount(page), 20);
  assert.equal((await firstItemInfo(page))?.key, '900021', '网络模式第 2 页首项应是第 21 条');
  assert.deepEqual(errors, [], '不应有未捕获的页面异常');
  await context.close();
  console.log('图文网络抓包模式测试通过');
}

async function runCompressionToggleTest(browser, base) {
  console.log('--- 油猴菜单：图片压缩开关 ---');
  const { context, page, errors } = await openPage(browser, base);
  const firstImgSrc = () =>
    page.evaluate(() => document.querySelector('.bt-opus-item img')?.getAttribute('src') || '');
  const menuNames = () => page.evaluate(() => (window.__gmMenuCommands || []).map((item) => item.name));
  const clickMenu = () =>
    page.evaluate(() => {
      const item = (window.__gmMenuCommands || []).find((cmd) => cmd.name.startsWith('图片压缩'));
      if (!item) throw new Error('未找到图片压缩菜单');
      item.callback(new MouseEvent('click'));
    });

  let src = await firstImgSrc();
  assert.match(src, /@640w\.webp$/, '默认应加载压缩图');
  assert.deepEqual(await menuNames(), ['图片压缩：开'], '油猴菜单应显示“图片压缩：开”');
  assert.equal((await opusState(page)).compressImages, true);

  // 通过配套菜单脚本关闭压缩
  await clickMenu();
  await page
    .waitForFunction(() => window.BILI_TOOLS?.opus?.state?.compressImages === false, null, { timeout: 4000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  src = await firstImgSrc();
  assert.doesNotMatch(src, /@640w\.webp/, '关闭后应加载原图');
  assert.deepEqual(await menuNames(), ['图片压缩：关'], '菜单文案应更新为关');
  assert.equal((await opusState(page)).compressImages, false);

  // 刷新后保持关闭
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.BILI_TOOLS?.opus?.active === true, null, { timeout: 25000 });
  await page.waitForTimeout(600);
  assert.deepEqual(await menuNames(), ['图片压缩：关'], '刷新后菜单应保持关闭');
  src = await firstImgSrc();
  assert.doesNotMatch(src, /@640w\.webp/, '刷新后仍应加载原图');

  // 再次通过菜单开启
  await clickMenu();
  await page
    .waitForFunction(() => window.BILI_TOOLS?.opus?.state?.compressImages === true, null, { timeout: 4000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  src = await firstImgSrc();
  assert.match(src, /@640w\.webp$/, '重新开启后应加载压缩图');
  assert.deepEqual(await menuNames(), ['图片压缩：开'], '菜单文案应更新为开');
  assert.deepEqual(errors, [], '不应有未捕获异常');
  await context.close();
  console.log('油猴菜单图片压缩开关测试通过');
}

async function runVueBlockedTest(browser, base) {
  console.log('--- 页面 Vue 访问被阻止时回退抓包 ---');
  const { context, page, errors } = await openPage(browser, base, '?throwvue=1');
  const st = await opusState(page);
  assert.equal(st.adapter, 'network', 'Vue expando 抛错时应回退到网络抓包');
  assert.equal(st.active, true);
  assert.equal(await itemCount(page), 20, '回退后仍应渲染 20 张卡片');
  assert.equal(await page.locator('.bt-opus-wrap').count(), 1, '应正常接管而不是隐藏后空白');
  assert.deepEqual(errors, [], '回退过程不应有未捕获异常');
  await context.close();
  console.log('Vue 访问失败回退测试通过');
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const executablePath = await findBrowser();
  console.log('浏览器:', executablePath);
  const server = await startServer();
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    await runVueTest(browser, server.url);
    await runNetworkTest(browser, server.url);
    await runCompressionToggleTest(browser, server.url);
    await runVueBlockedTest(browser, server.url);
  } finally {
    await browser.close();
    await server.close();
  }
  console.log('全部图文 e2e 通过');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

