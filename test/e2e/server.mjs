// 极简静态文件服务器（给 e2e 用，支持中文路径）
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const OPUS_API = '/x/polymer/web-dynamic/v1/opus/feed/space';
const OPUS_TOTAL = 60;
const OPUS_PAGE_SIZE = 20;
const OPUS_RATIOS = [1.5, 1, 1.333, 0.75, 0.393, 0.667];

function buildOpusItem(index) {
  // index 从 1 开始
  const ratio = OPUS_RATIOS[(index - 1) % OPUS_RATIOS.length];
  const naturalWidth = 1200;
  const naturalHeight = Math.round(naturalWidth / ratio);
  const hasCover = index % 7 !== 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${naturalWidth}" height="${naturalHeight}"><rect width="100%" height="100%" fill="hsl(${(index * 47) % 360},70%,80%)"/><text x="50%" y="50%" font-family="sans-serif" font-size="90" text-anchor="middle" dominant-baseline="middle" fill="#333">#${index}</text></svg>`;
  const item = {
    opus_id: String(900000 + index),
    jump_url: `//www.bilibili.com/opus/${900000 + index}`,
    content: `图文 #${index} — ` + '测试正文内容'.repeat((index % 4) + 1),
    author: index % 5 === 0 ? '测试UP主' : '',
    pub_time: index % 5 === 0 ? `2026-10-${String((index % 28) + 1).padStart(2, '0')} 12:00` : '',
    stat: { view: index % 3 === 0 ? String(100 + index) : '', like: String(10 + index) },
  };
  if (hasCover) {
    item.cover = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      width: naturalWidth,
      height: naturalHeight,
    };
  }
  if (index % 11 === 0) {
    item.badge = { text: '充电专属', bg_color: '#FF6699', color: '#FFFFFF' };
  }
  return item;
}

function buildOpusPage(page) {
  const current = Math.max(1, Math.floor(Number(page) || 1));
  const start = (current - 1) * OPUS_PAGE_SIZE + 1;
  const end = Math.min(OPUS_TOTAL, start + OPUS_PAGE_SIZE - 1);
  const items = [];
  for (let i = start; i <= end; i += 1) items.push(buildOpusItem(i));
  return {
    code: 0,
    message: '0',
    ttl: 1,
    data: {
      items,
      offset: String(current),
      has_more: end < OPUS_TOTAL,
    },
  };
}

export async function startServer({ port = 0, root = ROOT } = {}) {
  const SNAPSHOT_DYN = '参考文件/arooka_阿若卡个人动态-arooka_阿若卡动态记录-哔哩哔哩视频.htm';
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      // 假图文接口：分页返回 20 条，供 opus e2e 使用
      if (pathname === OPUS_API) {
        const body = JSON.stringify(buildOpusPage(url.searchParams.get('page')));
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        });
        res.end(body);
        return;
      }
      // 真实 DOM 快照：伪装成动态路由，并补 <base> 让快照里的相对资源路径正确解析
      if (/^\/\d+\/dynamic$/.test(pathname) && url.searchParams.get('snapshot') === '1') {
        const html = await readFile(path.join(root, SNAPSHOT_DYN), 'utf8');
        const patched = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="/参考文件/">`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(patched);
        return;
      }
      let filePath = path.join(root, pathname);
      // 让假页伪装成 B 站真实路由，便于 userscript 的 @match/路由判断生效
      if (/^\/\d+\/dynamic(?:\/|$)/.test(pathname)) {
        filePath = path.join(root, 'test/fixtures/dyn-page.html');
      } else if (/^\/\d+\/upload\/opus(?:\/|$)/.test(pathname)) {
        filePath = path.join(root, 'test/fixtures/opus-page.html');
      }
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
      const data = await readFile(filePath);
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      res.end(data);
    } catch (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found: ' + req.url);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// 直接运行时，提供一个交互服务器
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 8787);
  const info = await startServer({ port });
  console.log(`serving ${ROOT} at ${info.url}`);
}
