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

## 阶段 1：动态页翻页（12 条/页，与 B 站自动加载对齐）—— v0.2.0

- [x] `src/scripts/dyn-pagination.js`：VM 探测 + 分页显示 + 按需加载
- [x] 纯 DOM 回退（滚到底 + scroll 事件触发原生加载，含“没有更多”检测）
- [x] 原生样式分页条（上一页 / 页码 / 更多 / 下一页 / 跳页），尺寸与原生 1:1
- [x] SPA 路由 / tab 切换生命周期（重置回第 1 页）
- [x] 重复注入保护
- [x] 调试入口 `window.BILI_TOOLS`
- [x] 每页 12 条（对齐 B 站自动加载批次）
- [x] **保留原生滚到底自动加载**作为下一页预取；新条目在 MutationObserver 里立即隐藏
- [x] 隐藏原生加载条，预取时分页条位置不跳动
- [x] `ERROR/PAUSED` 允许通过分页按钮重试
- [x] 单元测试（分页窗口/文案，10 项）
- [x] 动态假页 e2e（VM 模式、整列表重绘、纯 DOM 回退、跳页、重复注入、tab 重置、少量数据、滚到底预取）
- [x] 真实页面 DOM 快照测试（25 条真实 SSR 条目，只显示 12 条）
- [x] 分页控件尺寸/字体与原生参考对比测试
- [x] 构建 `dist/01-动态翻页.user.js`
- [x] 手动验收清单（`docs/TESTING.md`）
- [x] commit + tag `v0.2.0`
- [x] `0.2.1` 内部健壮性修复：共享 `style.js` 支持 document-start 注入、重复注入不再覆盖调试入口（无行为变化）
- [ ] 用户真实页面实测（等待反馈）

## 阶段 2：图文页翻页（分支 `feat/opus-pagination`，v0.1.0）

> 2026-10-28 实测：B 站图文列表每次自动加载 **20 条**（type=all/dynamic 均 20/页，article 满页也是 20）。
> 用户确认：每页 20 条，保留原生自动加载作为下一页预取，复用 `src/shared/` 已验证部件。

- [x] 复用已验证部件：`shared/pager.js`（原生分页条）、`shared/dom.js`、`shared/log.js`、`shared/style.js`、`shared/toast.js`
- [x] 复用动态页已验证模式：预取数据不进当前页、`ERROR/PAUSED` 可重试、重复注入保护
- [x] 数据通道 A：Vue 实例（`WaterfallGrid` 定位、`props.list`、`onLoadMore`）
- [x] 数据通道 B：XHR/fetch 抓包 + 原生高度公式
- [x] 原生卡片 DOM 重建（有封面 / 纯文字 / 徽章 / 统计 / 副标题），封面 http→https
- [x] 原生瀑布流布局复刻（threshold 10 + 最短列）+ 列宽公式 + resize 重排
- [x] 接管渲染 + 隐藏原生 feed + 分页条（20/页）
- [x] 切 tab 重置、网络通道回退、两通道都失败时不接管
- [x] 假页 e2e（Vue 通道 + 网络通道、预取、切 tab、resize、重复注入）+ 截图
- [x] 真实站点冒烟（匿名公开页面）：首屏 20、滚到底预取、下一页、切 tab（专栏 13 / 动态 20）、resize、跳第 5 页，均通过
- [x] 单元测试（布局/高度/URL/分页，新增 12 项）
- [x] `0.1.1` 封面缩略图（`@640w.webp`）+ 立即加载 + 预热下两页，修复翻页灰色占位（根据 2026-10-28 录屏检查）
- [x] `0.1.2` 图片压缩开关（分页条下方，默认开，localStorage 持久化；关闭加载原图并跳过预热）
- [x] `0.2.0` 图片压缩开关移到 Tampermonkey 扩展菜单（`GM_registerMenuCommand` + `@sandbox raw`），移除页面内开关；菜单文案显示开/关
- [x] `0.3.0` 过渡方案：主脚本恢复 `@grant none`，菜单拆到配套 `00-图文翻页菜单.user.js`；启动 fail-safe
- [x] `0.4.0` 合并回单脚本：主脚本申请 `unsafeWindow` 等 GM 权限，用 `unsafeWindow` 访问页面 XHR / Vue 实例（参考 `参考文件/老粉计划.js`），菜单注册在同一脚本；删除配套菜单脚本
- [x] 构建 `dist/02-图文翻页.user.js`
- [ ] 用户真实页面实测（等待反馈）

## 阶段 3：独立统一行高脚本（分支 `feat/opus-uniform-row`，v0.3.0）

- [x] 独立脚本 `03-图文统一行高.user.js`：把原生所有已加载 `.item` 克隆到自己的网格统一行高；不依赖 02，不含分页/菜单/预取/接口拦截
- [x] 原生 feed 隐藏但保留自动加载；监听源网格 childList/characterData + 图片加载 + resize + 3 秒看门狗，持续重新克隆/排版
- [x] 不和原生 WaterfallGrid 抢布局；02 正在接管时 03 主动让位
- [x] `layoutRows` 行布局（行高 = 行内最高）；封面换成保比例 640w 图 + `object-fit: contain`，不裁剪
- [x] 行高富余时展开被省略的标题/正文，没内容留白；纯文本卡片灰色背景撑满、图标贴底
- [x] 单元测试（行高/末行/无重叠）
- [x] 真实站点验证：只装 03 → 20 条 4 行等高，滚到底自动加载到 40 条 8 行仍等高；原生 feed 隐藏、克隆网格显示
- [x] `0.3.0` 克隆方案 + 版本感知重复注入保护 + lastError 诊断
- [x] 构建 `dist/03-图文统一行高.user.js`（0.3.0），交付实测（单独启用）

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




