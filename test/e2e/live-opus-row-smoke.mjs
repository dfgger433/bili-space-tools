// 独立统一行高脚本（03）真实站点冒烟：不安装 02，直接处理原生已加载图文。
// 用法：npm run test:live:row   （可选，需要联网；匿名访问公开 UP 主即可）
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(ROOT, 'dist', '03-图文统一行高.user.js');
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
  // 只注入 03，不注入 02
  await context.addInitScript({ path: SCRIPT });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

  const rowState = () => page.evaluate(() => window.BILI_TOOLS?.row?.state || null);
  const readLayout = () =>
    page.evaluate(() => {
      const groups = new Map();
      const items = document.querySelectorAll('.bt-opus-row-grid > .bt-opus-row-item');
      for (const el of items) {
        const rect = el.getBoundingClientRect();
        const top = Math.round((rect.top + window.scrollY) * 100) / 100;
        if (!groups.has(top)) groups.set(top, []);
        const img = el.querySelector('.bili-cover-card img');
        groups.get(top).push({
          height: Math.round(rect.height * 100) / 100,
          objectFit: img ? getComputedStyle(img).objectFit : '',
          nativeClip: el.classList.contains('bt-opus-row-native-clip'),
        });
      }
      const feed = document.querySelector('.opus-feed');
      return {
        count: items.length,
        pager: document.querySelectorAll('.bt-opus-pager').length,
        feedHidden: feed
          ? getComputedStyle(feed).visibility === 'hidden' || getComputedStyle(feed).display === 'none'
          : false,
        rows: Array.from(groups.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([top, list]) => ({ top, heights: list.map((x) => x.height), fits: [...new Set(list.map((x) => x.objectFit))], natives: list.map((x) => x.nativeClip) })),
      };
    });

  try {
    console.log('打开:', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.BILI_TOOLS?.row?.state?.active === true, null, {
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    let st = await rowState();
    console.log('state:', st);
    assert.equal(st.mode, 'native', '应为原生网格模式');
    assert.ok(st.items >= 20, '应处理已加载的图文');
    assert.ok(st.columns >= 4, '应有列数');
    assert.equal(st.rows, Math.ceil(st.items / st.columns), '行数应为 ceil(条数/列数)');

    let layout = await readLayout();
    assert.equal(layout.pager, 0, '03 不应创建分页条');
    assert.equal(layout.feedHidden, true, '原生 feed 应隐藏（由 03 的克隆网格显示）');
    assert.equal(layout.count, st.items, '克隆网格应包含所有已加载图文');
    assert.equal(st.clipPercent, 27, '默认裁剪阈值应为 27%');
    const rowStats = st.rowStats || [];
    for (let i = 0; i < layout.rows.length; i += 1) {
      const row = layout.rows[i];
      const stat = rowStats[i];
      assert.equal(new Set(row.heights.map((h) => Math.round(h))).size, 1, '同一行卡片应等高');
      if (stat && stat.clipped) {
        assert.ok(row.natives.some(Boolean), `第 ${i + 1} 行应有 B 站默认裁剪卡片`);
        assert.ok(row.fits.every((fit) => fit === 'contain' || fit === 'cover'), '裁剪行只允许 contain/cover');
      } else {
        assert.ok(row.fits.every((fit) => fit === 'contain'), '未裁剪行封面应完整显示（contain）');
      }
    }

    const before = layout.count;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction((n) => (window.BILI_TOOLS?.row?.state?.items ?? 0) > n, before, {
      timeout: 25000,
    });
    await page.waitForTimeout(1200);
    st = await rowState();
    layout = await readLayout();
    console.log('after scroll state:', st, 'rows:', layout.rows.length);
    assert.ok(st.items > before, '滚到底后原生自动加载的条目也应统一行高');
    assert.deepEqual(errors, [], '不应有未捕获异常');
    console.log('独立统一行高脚本真实站点冒烟通过');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
