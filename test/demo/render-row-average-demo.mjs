// 生成“统一行高按平均值裁剪”的示意图（静态 HTML -> PNG）。
// 用法：node test/demo/render-row-average-demo.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HTML = path.join(HERE, 'row-average-demo.html');
const OUT = path.join(ROOT, 'test', 'screenshots', 'row-average-demo.png');

const CANDIDATES = [
  process.env.BILI_TEST_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
].filter(Boolean);

async function main() {
  let executablePath = null;
  for (const p of CANDIDATES) {
    try {
      const { access } = await import('node:fs/promises');
      await access(p);
      executablePath = p;
      break;
    } catch {
      /* next */
    }
  }
  if (!executablePath) throw new Error('未找到 Chrome/Edge，可用 BILI_TEST_BROWSER 指定');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT, fullPage: true });
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  console.log('saved', OUT, size);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
