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
      version: '0.3.0',
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
      grants: ['none'],
      noframes: true,
    },
  },
  {
    id: 'opus-settings-menu',
    entry: 'src/scripts/opus-settings-menu.js',
    outfile: 'dist/00-图文翻页菜单.user.js',
    meta: {
      name: 'B站图文翻页（图片压缩菜单）',
      nameZh: 'B站图文翻页（图片压缩菜单）',
      namespace: 'https://github.com/bili-space-tools/bili-space-tools',
      version: '0.1.0',
      description: '为“B站图文翻页”提供油猴扩展菜单里的“图片压缩：开/关”开关（主脚本不申请 GM 权限以保持页面上下文）。',
      descriptionZh: '为“B站图文翻页”提供油猴扩展菜单里的“图片压缩：开/关”开关（主脚本不申请 GM 权限以保持页面上下文）。',
      author: 'bili-space-tools',
      license: 'MIT',
      icon: 'https://www.bilibili.com/favicon.ico',
      match: [
        '*://*.bilibili.com/*/upload/opus',
        '*://*.bilibili.com/*/upload/opus/*',
      ],
      runAt: 'document-idle',
      grants: ['GM_registerMenuCommand', 'GM_unregisterMenuCommand', 'unsafeWindow'],
      noframes: true,
    },
  },
];




