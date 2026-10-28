// 主分支唯一交付脚本的元数据与入口配置。
// 单独脚本（动态翻页 / 图文翻页 / 统一行高）保留在各自维护分支；主分支打包为一个脚本。
export const scripts = [
  {
    id: 'bili-space-tools',
    entry: 'src/scripts/bili-space-tools.js',
    outfile: 'dist/B站空间页增强.user.js',
    combined: true,
    meta: {
      name: 'B站空间页增强（动态翻页/图文翻页/统一行高）',
      nameZh: 'B站空间页增强（动态翻页/图文翻页/统一行高）',
      namespace: 'https://github.com/bili-space-tools/bili-space-tools',
      version: '1.0.2',
      description: '单个脚本包含动态翻页、图文翻页、图文统一行高三个模块；油猴菜单里可分别开关三个模块，并保留图片压缩开关。',
      descriptionZh: '单个脚本包含动态翻页、图文翻页、图文统一行高三个模块；油猴菜单里可分别开关三个模块，并保留图片压缩开关。',
      author: 'bili-space-tools',
      license: 'MIT',
      icon: 'https://www.bilibili.com/favicon.ico',
      match: [
        '*://*.bilibili.com/*/dynamic',
        '*://*.bilibili.com/*/dynamic/*',
        '*://*.bilibili.com/*/upload/opus',
        '*://*.bilibili.com/*/upload/opus/*',
      ],
      runAt: 'document-start',
      grants: [
        'unsafeWindow',
        'GM_registerMenuCommand',
        'GM_unregisterMenuCommand',
        'GM_getValue',
        'GM_setValue',
      ],
      noframes: true,
    },
  },
];


