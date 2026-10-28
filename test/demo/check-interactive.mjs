import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HTML = path.join(HERE, 'row-clip-interactive.html');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
await page.fill('#thresholdNumber','30');
await page.waitForTimeout(200);
const info = await page.evaluate(() => ({
  label: document.querySelector('#thresholdLabel').textContent,
  summary: document.querySelector('#summary').innerText.replace(/\n/g,' '),
  table: Array.from(document.querySelectorAll('#decisionTable tbody tr')).map(tr => tr.innerText.replace(/\t/g,' | ')),
}));
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: path.join(ROOT,'test/screenshots/row-clip-interactive-30.png'), fullPage: true });
console.log('errors', errors);
await browser.close();
