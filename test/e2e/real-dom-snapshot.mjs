// 真实 DOM 快照测试：直接加载 参考文件/ 里保存的 B 站动态页（禁用其脚本，保留 SSR DOM/CSS），
// 伪造列表实例后注入 userscript，验证选择器与分页条在真实页面结构下工作。
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
const SNAPSHOT_ROUTE = '/440900637/dynamic?snapshot=1';

const CANDIDATES = [
  process.env.BILI_TEST_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
  throw new Error('未找到浏览器');
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const executablePath = await findBrowser();
  const server = await startServer();
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    // 禁用快照里的页面脚本，避免离线环境下脚本执行/水合改变 SSR DOM
    await page.route('**/*.js', (route) => route.abort());
    await page.route('**/*.mjs', (route) => route.abort());
    const url = `${server.url}${SNAPSHOT_ROUTE}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const count = await page.evaluate(() => document.querySelectorAll('.bili-dyn-list__item').length);
    assert.ok(count >= 10, `快照里应至少有 10 条动态，实际 ${count}`);
    console.log('快照动态条目数:', count);

    // 给真实 DOM 伪造一个列表实例
    await page.evaluate(() => {
      const listEl = document.querySelector('.bili-dyn-list');
      const items = Array.from({ length: document.querySelectorAll('.bili-dyn-list__item').length }, (_, i) => ({ id: i }));
      const vm = {
        list: items,
        status: 'FETCHED',
        loadmore() {
          // 快照里没有更多数据可加载
          this.status = 'NO_MORE';
        },
        $nextTick(cb) {
          setTimeout(cb, 0);
        },
      };
      listEl.__vue__ = vm;
    });

    await page.addScriptTag({ path: SCRIPT });
    await page.waitForFunction(() => window.BILI_TOOLS?.dyn?.active === true, null, { timeout: 20000 });
    await page.waitForTimeout(400);

    const visible = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.bili-dyn-list__item')).filter(
          (el) => getComputedStyle(el).display !== 'none',
        ).length,
    );
    assert.equal(visible, 12, '真实 DOM 下第 1 页应只显示 12 条');
    const pagerCount = await page.locator('.bili-tools-dyn-pager').count();
    assert.equal(pagerCount, 1, '真实 DOM 下应插入一个分页条');
    // 快照自带的图片/头像 onload 回调在禁用脚本后会报未定义，与本脚本无关
    const ownErrors = pageErrors.filter((text) => !/is not defined/.test(text));
    assert.deepEqual(ownErrors, [], '不应有未捕获异常');

    await page.locator('.bili-tools-dyn-pager').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'dyn-real-snapshot.png'), fullPage: false });
    console.log('真实 DOM 快照测试通过');
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
