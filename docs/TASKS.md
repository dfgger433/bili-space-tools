# 任务清单（主分支单脚本）

> 状态：`[ ]` 待做 / `[x]` 完成 / `[!]` 阻塞。
> 主分支只交付 **一个** 脚本；单独脚本保留在维护分支。

## 阶段 0：工程基础

- [x] git 仓库 / `.gitignore` / `package.json`（esbuild + playwright-core）
- [x] `build.mjs` 注入 UserScript 头
- [x] 共享模块：`shared/log`、`shared/dom`、`shared/style`、`shared/pager`、`shared/toast`、`shared/page`、`shared/module-settings`
- [x] `opus/model/layout/cards/adapter/settings`

## 阶段 1：动态翻页（单独分支 `fix/dynamic-page-12`）

- [x] 复用动态列表 Vue 2 / DOM，每页 12 条，原生分页条
- [x] 单元 + 动态假页 e2e + 真实 DOM 快照 + 视觉对比
- [x] 模块化 `start/stop`，供单脚本开关调用

## 阶段 2：图文翻页（单独分支 `feat/opus-pagination`）

- [x] 每页 20 条，Vue / 只读网络抓包双通道，fail-safe
- [x] 原生卡片 + 分页条；原生自动加载预取；图片压缩菜单
- [x] 模块化 `start/stop`，供单脚本开关调用

## 阶段 3：统一行高（单独分支 `feat/opus-uniform-row`）

- [x] 单跑：原生克隆网格，隐藏原生 feed 但保留自动加载；持续覆盖所有已加载图文
- [x] 与图文翻页同开：接管 02 分页网格（`mode: "bt"`），分页 + 等高行同时生效
- [x] 封面完整比例、行高富余展开文字；真实站点 20 条 4 行 → 40 条 8 行
- [x] 模块化 `start/stop`；停止时恢复 02 瀑布流/原生布局

## 阶段 4：主分支单脚本 + 模块开关

- [x] `src/scripts/bili-space-tools.js` 组合三个模块；主分支 `dist/` 只保留 `B站空间页增强.user.js`
- [x] 油猴菜单分别开关：动态翻页 / 图文翻页 / 统一行高（默认全开，持久化）
- [x] 开关即时 start/stop：关闭 02 后统一行高切原生克隆；关闭统一行高后 02 恢复瀑布流
- [x] 保留图片压缩开关
- [x] e2e：三个模块开关 + 刷新持久化 + 各模块独立；真实站点三种组合冒烟
- [x] 单独脚本分支保留（`fix/dynamic-page-12`、`feat/opus-pagination`、`feat/opus-uniform-row`）

## 阶段 5：显示顺序（无需实现）

- [x] B 站图文默认已是日期倒序（左→右、上→下均为新到旧），不做 04 脚本

## 阶段 6：翻译按钮（需求待确认）

- [ ] 确认翻译对象 / 目标语言 / 翻译来源 / 交互
- [ ] 原生 `vui_button` / `vui_icon` 样式实现
- [ ] 缓存与失败处理
