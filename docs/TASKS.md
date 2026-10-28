# 任务清单（本地任务计划）

> 状态：`[ ]` 待做 / `[~]` 进行中 / `[x]` 完成 / `[!]` 阻塞

## 阶段 0：工程基础

- [x] git 仓库初始化（`main` 分支）
- [x] `.gitignore`（`参考文件/`、node_modules、测试产物）
- [x] `package.json`（esbuild 0.25 + playwright-core 1.64）
- [x] `docs/PLAN.md`、`docs/RESEARCH.md`、`docs/TESTING.md`
- [x] `build.mjs` + `scripts.config.mjs`（esbuild 打包 + UserScript 头注入）
- [x] `src/shared/`：日志、DOM、样式、原生分页 UI、toast
- [x] README
- [x] 安装 devDependencies（`npm install`）

## 阶段 1：动态页翻页（10 条/页）—— 本轮交付

- [x] `src/scripts/dyn-pagination.js`：VM 探测 + 分页显示 + 按需加载
- [x] 纯 DOM 回退（滚到底 + scroll 事件触发原生加载，含“没有更多”检测）
- [x] 原生样式分页条（上一页 / 页码 / 更多 / 下一页 / 跳页），尺寸与原生 1:1
- [x] SPA 路由 / tab 切换生命周期（重置回第 1 页）
- [x] 重复注入保护
- [x] 调试入口 `window.BILI_TOOLS`
- [x] 单元测试（分页窗口/文案，10 项）
- [x] 动态假页 e2e（VM 模式、整列表重绘、纯 DOM 回退、跳页、重复注入、tab 重置、少量数据）
- [x] 真实页面 DOM 快照测试（25 条真实 SSR 条目，只显示 10 条）
- [x] 分页控件尺寸/字体与原生参考对比测试
- [x] 构建 `dist/01-动态翻页.user.js`
- [x] 手动验收清单（`docs/TESTING.md`）
- [x] commit + tag `v0.1.0`
- [ ] 用户真实页面实测（等待反馈）

## 阶段 2：图文页翻页（42 条/页）

- [ ] 数据通道 A：Vue 实例（`WaterfallGrid` 定位、`props.list`、`onLoadMore`）
- [ ] 数据通道 B：XHR/fetch 抓包 + 原生高度公式
- [ ] 原生卡片 DOM 重建（有封面 / 纯文字 / 徽章 / 统计 / 副标题）
- [ ] 原生瀑布流布局复刻（threshold 10 + 最短列）
- [ ] 接管渲染 + 隐藏原生 feed + 分页条（42/页）
- [ ] resize / tab 切换 / 失败回退
- [ ] 假页 e2e + 卡片视觉截图
- [ ] 构建 `dist/02-图文翻页.user.js`，交付实测

## 阶段 3：统一行高

- [ ] `uniformRows` 布局（行高 = 行内最高）
- [ ] 卡片封面 flex 撑满 + 文案固定区
- [ ] 设置开关 + “全局等高”选项
- [ ] 断言 + 截图
- [ ] 构建 `dist/03-图文统一行高.user.js`，交付实测

## 阶段 4：显示顺序

- [ ] 日期解析（数字时间戳 / 绝对 / 相对）
- [ ] 稳定倒序 + 行优先排布
- [ ] 开关
- [ ] 断言 + 截图
- [ ] 构建 `dist/04-图文排序.user.js`，交付实测

## 阶段 5：翻译按钮（待用户确认需求）

- [ ] 确认翻译对象 / 目标语言 / 翻译来源 / 交互
- [ ] 原生按钮样式实现（`vui_button` / `vui_icon`）
- [ ] 缓存与失败处理
