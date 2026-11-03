# AGENTS.md

本文件面向在本仓库中工作的 AI 编码代理（Codex / Claude Code / DSH / 其他自动化代理）。
目标：在不破坏用户脚本运行环境、不破坏现有行为的前提下修改代码，并用仓库自己的测试证明改动。

## 项目概览

B 站空间页 Tampermonkey 用户脚本，主分支交付**一个**单脚本：

- `dist/B站空间页增强.user.js`
- 三个可独立开关的模块：
  - 动态翻页（`/uid/dynamic`），默认每页 12 条，可自定义 1–100
  - 图文翻页（`/uid/upload/opus`），默认每页 20 条，可自定义 1–100
  - 图文统一行高（自动行平均值 + 27% 阈值，B 站默认封面裁剪）
- 油猴菜单、设置持久化；源码在 `src/`，构建产物在 `dist/`。

技术栈：Node.js + esbuild + Playwright-core；纯前端，无后端。

## 快速命令

```powershell
npm install
npm run build                 # 生成 dist/B站空间页增强.user.js
npm test                      # 单元测试
npm run test:e2e              # 动态假页 e2e（主脚本）
npm run test:e2e:opus         # 图文假页 e2e（主脚本）
npm run test:e2e:real         # 真实 B 站 DOM 快照
npm run test:visual           # 分页控件视觉对比
npm run test:live:opus        # 真实图文页（需联网）
npm run test:live:row         # 真实图文页，只开统一行高
npm run test:live:combined    # 真实图文页，图文翻页 + 统一行高
```

浏览器默认 `C:\Program Files\Google\Chrome\Application\chrome.exe`，可用 `BILI_TEST_BROWSER` 覆盖。
live 测试依赖网络/B 站页面状态，偶发超时先重试，不要用失败的网络结果证明代码有问题。

分支各自有独立的 `package.json` 脚本；在分支上先看 `package.json` 再执行对应测试。
例如 `feat/opus-uniform-row` 额外有 `test:live:row:conflict`（独立 03 让位 02 的回归）。

## 仓库结构

```text
src/
  scripts/bili-space-tools.js   # 主分支单脚本入口：模块编排、菜单、设置、路由
  scripts/dyn-pagination.js     # 动态翻页模块（export start/stop）
  scripts/opus-pagination.js    # 图文翻页模块（export start/stop）
  scripts/opus-uniform-row.js   # 统一行高模块（export start/stop）
  opus/                         # adapter/model/cards/layout/settings
  shared/                       # page/dom/pager/style/log/toast/settings
dist/                           # 构建产物（提交）
test/
  unit/                         # Node 单元测试
  e2e/                          # Playwright e2e / live smoke / fixture
  demo/                         # 演示页
docs/                           # 计划、任务、测试、GREASYFORK 发布资料
参考文件/                       # 本地 B 站页面快照（.gitignore，只读参考，不要提交/修改）
```

主分支只保留一个 `dist/` 文件；其他模块的独立脚本只在各自维护分支。

## 分支策略

- `main`：单脚本交付。所有新功能最终要合并/移植到这里。
- `fix/dynamic-page-12`：动态翻页独立脚本（01）。
- `feat/opus-pagination`：图文翻页独立脚本（02）。
- `feat/opus-uniform-row`：统一行高独立脚本（03）。

不要把分支整体 `git merge` 进 `main` 覆盖主脚本结构；主脚本的模块已改为 `start/stop` 导出。
正确做法：**把分支上的功能/修复移植到 `main` 对应的模块**，保留主脚本的编排、菜单和设置结构。
维护分支不要删除。

## 构建与产物

- 构建入口：`build.mjs`；esbuild IIFE，不压缩；读取 `scripts.config.mjs` 注入 UserScript 头。
- `__BILI_TOOLS_COMBINED__` 是构建期常量：主分支为真，分支独立脚本为假。
- 不要手改 `dist/*.user.js`；改 `src/` 后重新 `npm run build`。
- 主分支 `scripts.config.mjs` 只有 `bili-space-tools` 一个条目，产物只能是
  `dist/B站空间页增强.user.js`。
- UserScript metadata block 必须在文件开头（Greasy Fork 需要）；不要把 banner 放到 metadata 前。
- 不添加 `@downloadURL` / `@updateURL`：Greasy Fork 会自己注入。
- 需要页面 `__vue__` / XHR 时用 `unsafeWindow` + `src/shared/page.js` 的 `pageDocument()`；
  Firefox 元素用 `wrappedJSObject` 兼容。

## 用户脚本运行规则

- 主脚本 `@run-at document-start`；模块必须 fail-safe：
  先确认数据通道，再隐藏原生 feed；拿不到数据就回滚，保持原生页面可用。
- 不新增 B 站 API 请求；图文抓包只读观察页面自身请求，不修改请求/响应。
- 不引入远程脚本、`eval`、动态代码；不收集/上传用户数据。
- GM 权限只加需要的：`unsafeWindow`、`GM_registerMenuCommand`、`GM_unregisterMenuCommand`、
  `GM_getValue`、`GM_setValue`。
- `@grant none` 时无法注册 GM 菜单；如果既要菜单又要页面 Vue，给 `unsafeWindow` 权限并用
  `pageDocument()` 读取页面节点（参考动态模块 getVm）。
- 菜单命令由模块在 `start()` 注册、`stop()` 注销，避免模块关闭后残留。
- 脚本内轮询/observer/timer 必须在 `stop()/teardown()` 清理。

## 设置与菜单

已知设置键（不要随意改名，改名需迁移）：

| 键 | 内容 |
|---|---|
| `biliTools:modules` | 三个模块开关 |
| `biliTools:opus` | 图片压缩、图文每页数量 |
| `biliTools:opusRow` | 统一行高阈值 |
| `biliTools:dyn:pageSize` | 动态每页数量 |

主脚本菜单（随页面/模块出现）：

- `动态翻页：开/关`
- `每页数量：12`（动态模块启用时）
- `图文翻页：开/关`
- `图片压缩：开/关`
- `每页数量：20`（图文模块启用时）
- `统一行高：开/关`
- `行高裁剪阈值：27%（0=关闭）`

新增菜单：
- 名称带当前值，修改后重新注册（先 unregister 再 register）；
- 菜单回调里的输入用 `prompt`，非法值必须拒绝并保留原设置；
- 修改后立即重绘/重排，不必刷新页面。

## 功能行为基线

- 动态每页默认 12，图文默认 20；范围 1–100；重置到第 1 页；当前已加载不足时自动继续加载。
- 动态/图文都保留 B 站原生滚到底自动加载作为下一页预取。
- 统一行高：自动行平均 A；超出比例 `(max-A)/A`；超过阈值（默认 27%）时行高 = A，
  超过 A 的卡片用 B 站原生封面比例 + `object-fit: cover` 裁剪；未超过的保留完整封面。
- 被裁剪的卡片标题必须完整可见；只有封面被裁剪，不能垂直切标题。
- 02 + 03：主脚本 03 接管 02 的 `.bt-opus-grid`（`mode: "bt"`）；独立 03 检测到 02 时让位。
- 分页条相对网格居中。
- 封面统一使用 `webp` / 无 `@` 原图，避免原生 `@...avif` 变体（Firefox 兼容）。

## 常见坑（务必检查）

1. **封面空白**：B 站原生可能是 `@454w_596_fU1r.avif`，不要直接使用；统一转
   `@640w.webp`，关闭压缩时用无 `@` 原图。
2. **裁剪卡片只剩标题**：原生结构是 `.opus-card > .opus-card--with-cover > .bili-cover-card + .opus-card__title`；
   裁剪时包裹层必须 `display:flex; flex-direction:column; flex:1`，否则封面高度为 0。
3. **标题被切**：裁剪卡片里标题 `flex:0 0 auto`，封面占剩余高度，不能反。
4. **GM 沙箱读不到 `__vue__`**：用 `unsafeWindow.document` + `wrappedJSObject`；
   `@grant none` 的脚本不要加 GM 菜单。
5. **独立 03 与 02 冲突**：03 只在启动时判断 02 会漏掉后启动的 02；必须检测
   `.bt-opus-grid` / `.bt-opus-pager` 并让位。
6. **每页数量加大**：原生每次只加载 12/20 条；pageSize 大于已加载数量时要主动 `ensureLoaded`，
   否则第 1 页会少显示。
7. **分页条居中**：B 站原生 `.vui_pagenation` 是 flex-start，需要覆盖 `justify-content:center`。
8. **不要同时启用主脚本 03 和独立 03**；测试两种脚本组合时明确记录。

## 测试要求

- 修 bug：至少补一个能覆盖该 bug 的自动化断言；能加 live/e2e 更好。
- 行为/布局：优先跑 `npm run test:e2e:opus`、`test:e2e`、`test:live:combined`。
- 纯单元逻辑（layout/page model/settings）：`npm test`。
- 涉及 CSS/分页外观：`npm run test:visual`。
- 涉及真实页面结构：`npm run test:e2e:real`。
- 改完必须重新构建并确认 `dist` 版本；不要提交未构建的源码改动。
- 不要把 `参考文件/`、`node_modules/`、`test/tmp/`、`test/screenshots/*.png` 提交。
- 测试失败先读完整错误；网络超时重试一次再判断。

## 版本与发布

1. 修改 `scripts.config.mjs` 的 `meta.version`。
2. 修改源码里的 `VERSION`（主入口和对应模块）。
3. `npm run build`。
4. 更新 `README.md` 的更新记录和 `CHANGELOG.md`。
5. 跑相关测试。
6. 提交并打 annotated tag（主脚本 `vX.Y.Z`；分支按 `opus-vX.Y.Z` / `dyn-vX.Y.Z` / `opus-row-vX.Y.Z`）。
7. `git push origin <branch> --tags`。
8. Greasy Fork 发布时粘贴最新 `dist/B站空间页增强.user.js`；版本号必须递增。

版本语义：修 bug/兼容 → patch；新增用户可见功能 → minor；破坏性变更 → major。

## 提交规范

- 提交信息用英文前缀 + 简短主题，例如：
  - `fix(opus): ...`
  - `feat(dyn): ...`
  - `docs: ...`
- 一个提交只做一件事；不要混入无关格式化。
- 提交前 `git status` 确认没有 `参考文件`、`node_modules`、临时脚本、截图。
- 已推送的 tag 不要随意 force 移动；需要修正时发新版本。

## 完成检查清单

- [ ] 改动在正确分支
- [ ] 源码 + `scripts.config.mjs` 版本已更新
- [ ] `npm run build` 成功，`dist` 是对应版本
- [ ] 相关单元/e2e/live 测试通过
- [ ] README / CHANGELOG 已更新
- [ ] 没有提交 `参考文件/`、`node_modules/`、临时文件
- [ ] 需要时已提交并打 tag、推送
- [ ] Greasy Fork 代码需要更新时已说明
