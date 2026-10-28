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
      version: '0.2.0',
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
];
