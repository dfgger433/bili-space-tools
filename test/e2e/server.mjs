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

export async function startServer({ port = 0, root = ROOT } = {}) {
  const SNAPSHOT_DYN = '参考文件/arooka_阿若卡个人动态-arooka_阿若卡动态记录-哔哩哔哩视频.htm';
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
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
