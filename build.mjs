// 构建 userscript：esbuild 打包（IIFE，不压缩）+ 注入 UserScript 头。
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { scripts } from './scripts.config.mjs';

function header(meta) {
  const lines = ['// ==UserScript=='];
  const push = (key, value) => {
    const list = Array.isArray(value) ? value : [value];
    for (const v of list) lines.push(`// @${key.padEnd(12)} ${v}`);
  };
  push('name', meta.name);
  if (meta.nameZh) push('name:zh-CN', meta.nameZh);
  push('namespace', meta.namespace);
  push('version', meta.version);
  push('description', meta.description);
  if (meta.descriptionZh) push('description:zh-CN', meta.descriptionZh);
  push('author', meta.author);
  push('license', meta.license);
  push('icon', meta.icon);
  push('match', meta.match);
  push('run-at', meta.runAt);
  for (const g of meta.grants || ['none']) push('grant', g);
  if (meta.sandbox) push('sandbox', meta.sandbox);
  if (meta.noframes) lines.push('// @noframes');
  lines.push('// ==/UserScript==');
  return lines.join('\n') + '\n';
}

const bannerFor = (meta) => `/* eslint-disable */\n// 由 build.mjs 自动生成，请修改 src/ 下源码后重新构建。\n${header(meta)}`;

async function main() {
  await mkdir('dist', { recursive: true });
  for (const script of scripts) {
    const result = await build({
      entryPoints: [script.entry],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['chrome100', 'firefox100', 'edge100'],
      write: false,
      charset: 'utf8',
      legalComments: 'none',
      banner: { js: bannerFor(script.meta) },
      logLevel: 'warning',
    });
    const code = result.outputFiles[0].text;
    await writeFile(script.outfile, code, 'utf8');
    console.log(`built ${script.outfile} (${(Buffer.byteLength(code) / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
