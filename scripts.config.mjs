// 每个交付脚本的元数据与入口配置。
// 版本号在每次交付时递增；构建时注入到 UserScript 头。
export const scripts = [
  {
    id: 'dyn-pagination',
    entry: 'src/scripts/dyn-pagination.js',
    outfile: 'dist/01-动态翻页.user.js',
    meta: {
      name: 'B站动态翻页（每页10条）',
      nameZh: 'B站动态翻页（每页10条）',
      namespace: 'https://github.com/bili-space-tools/bili-space-tools',
      version: '0.1.0',
      description: '把 B 站用户空间动态页改为翻页浏览，每页 10 条；支持上一页/下一页/跳页，复用 B 站原生分页样式。',
      descriptionZh: '把 B 站用户空间动态页改为翻页浏览，每页 10 条；支持上一页/下一页/跳页，复用 B 站原生分页样式。',
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
