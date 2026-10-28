// 每个交付脚本的元数据与入口配置。
// 版本号在每次交付时递增；构建时注入到 UserScript 头。
export const scripts = [
  {
    id: 'dyn-pagination',
    entry: 'src/scripts/dyn-pagination.js',
    outfile: 'dist/01-动态翻页.user.js',
    meta: {
      name: 'B站动态翻页（每页12条）',
      nameZh: 'B站动态翻页（每页12条）',
      namespace: 'https://github.com/bili-space-tools/bili-space-tools',
      version: '0.2.1',
      description: '把 B 站用户空间动态页改为翻页浏览，每页 12 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生分页样式。',
      descriptionZh: '把 B 站用户空间动态页改为翻页浏览，每页 12 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生分页样式。',
      author: 'bili-space-tools',
      license: 'MIT',
      icon: 'https://www.bilibili.com/favicon.ico',
      match: [
        '*://*.bilibili.com/*/dynamic',
        '*://*.bilibili.com/*/dynamic/*',
      ],
      runAt: 'document-idle',
      grants: ['none'],
      noframes: true,
    },
  },
  {
    id: 'opus-pagination',
    entry: 'src/scripts/opus-pagination.js',
    outfile: 'dist/02-图文翻页.user.js',
    meta: {
      name: 'B站图文翻页（每页20条）',
      nameZh: 'B站图文翻页（每页20条）',
      namespace: 'https://github.com/bili-space-tools/bili-space-tools',
      version: '0.2.0',
      description: '把 B 站用户空间图文页改为翻页浏览，每页 20 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生卡片与分页样式；图片压缩开关在油猴扩展菜单。',
      descriptionZh: '把 B 站用户空间图文页改为翻页浏览，每页 20 条（与 B 站自动加载条数一致）；保留 B 站原生自动加载作为下一页预取，复用 B 站原生卡片与分页样式；图片压缩开关在油猴扩展菜单。',
      author: 'bili-space-tools',
      license: 'MIT',
      icon: 'https://www.bilibili.com/favicon.ico',
      match: [
        '*://*.bilibili.com/*/upload/opus',
        '*://*.bilibili.com/*/upload/opus/*',
      ],
      runAt: 'document-start',
      grants: ['GM_registerMenuCommand', 'GM_unregisterMenuCommand'],
      // 保留页面上下文：菜单命令需要 GM API，同时脚本要读页面 Vue 实例 / 拦截 XHR
      sandbox: 'raw',
      noframes: true,
    },
  },
];



