// 分页控件视觉/尺寸对比：真实原生 DOM 提取版 vs 我们脚本生成的版本
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(ROOT, 'dist', 'B站空间页增强.user.js');
const SHOTS = path.join(ROOT, 'test', 'screenshots');

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
  throw new Error('未找到浏览器');
}

function metricsScript(selector) {
  return (sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
    };
    const sideAll = Array.from(root.querySelectorAll('.vui_pagenation--btn-side')).map(rect);
    const side = sideAll.find((r) => r.w > 0) || sideAll[0];
    const num = root.querySelector('.vui_pagenation--btn-num');
    const more = root.querySelector('.vui_pagenation--btn-more');
    const count = root.querySelector('.vui_pagenation-go__count');
    const input = root.querySelector('.vui_input-wrapper');
    const sideStyle = getComputedStyle(root.querySelector('.vui_pagenation--btn-side:not(.vui_button--disabled)') || root.querySelector('.vui_pagenation--btn-side'));
    const numStyle = getComputedStyle(num);
    return {
      side,
      sideAll,
      num: rect(num),
      more: more ? rect(more) : null,
      countFont: getComputedStyle(count).fontSize,
      inputW: Math.round(input.getBoundingClientRect().width * 100) / 100,
      numFont: numStyle.fontSize,
      sideFont: sideStyle.fontSize,
      sideMarginRight: numStyle.marginLeft,
      rootW: Math.round(root.getBoundingClientRect().width * 100) / 100,
    };
  };
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const executablePath = await findBrowser();
  const server = await startServer();
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });

    const native = await context.newPage();
    await native.goto(`${server.url}/test/fixtures/pager-native.html`, { waitUntil: 'load' });
    await native.waitForTimeout(300);
    const nativeMetrics = await native.evaluate(metricsScript(), '.vui_pagenation');
    await native.locator('.vui_pagenation').screenshot({ path: path.join(SHOTS, 'pager-native.png') });

    const ours = await context.newPage();
    await ours.goto(`${server.url}/440900637/dynamic?total=25`, { waitUntil: 'load' });
    await ours.evaluate(() => {
      window.__BILI_TOOLS_MODULES__ = { dyn: true, opus: false, row: false };
    });
    await ours.addScriptTag({ path: SCRIPT });
    await ours.waitForFunction(() => window.BILI_TOOLS?.dyn?.active === true, null, { timeout: 20000 });
    await ours.waitForTimeout(400);
    const ourMetrics = await ours.evaluate(metricsScript(), '.bili-tools-dyn-pager');
    await ours.locator('.bili-tools-dyn-pager').screenshot({ path: path.join(SHOTS, 'pager-ours.png') });

    console.log('原生:', nativeMetrics);
    console.log('我们:', ourMetrics);
    assert.ok(nativeMetrics && ourMetrics, '两边都应取到分页条');
    for (const key of ['side', 'num', 'more']) {
      assert.ok(Math.abs(nativeMetrics[key].h - ourMetrics[key].h) <= 1, `${key} 高度应一致`);
      assert.ok(Math.abs(nativeMetrics[key].w - ourMetrics[key].w) <= 1, `${key} 宽度应一致`);
    }
    assert.equal(nativeMetrics.countFont, ourMetrics.countFont);
    assert.equal(nativeMetrics.numFont, ourMetrics.numFont);
    assert.ok(Math.abs(nativeMetrics.inputW - ourMetrics.inputW) <= 1, '跳页输入框宽度应一致');
    console.log('分页控件尺寸/字体与原生一致');
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
