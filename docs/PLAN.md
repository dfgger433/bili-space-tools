# 实施计划：B站空间页增强（动态翻页 / 图文翻页 / 行高统一 / 显示顺序）

> 本文件是 2026-10-28 经用户批准的计划的落盘版本。进度见 [TASKS.md](./TASKS.md)，调研依据见 [RESEARCH.md](./RESEARCH.md)，测试说明见 [TESTING.md](./TESTING.md)。

## 交付节奏（一部分一交付）

- 一次只交付一个阶段的可安装 userscript，用户实测通过后再进入下一阶段。
- 每阶段产物：`dist/NN-*.user.js` + 文档更新 + git commit/tag + 手动验收清单。
- 阶段 5（翻译按钮）功能定义未确认，暂不实现。

| 阶段 | 页面 | 功能 | 关键验收 |
|---|---|---|---|
| 1 | `space.bilibili.com/<uid>/dynamic[/…]` | 翻页，每页 12 条（与 B 站自动加载条数一致） | 首屏 1–12 条；下一页 13–24；可跳页；末页禁用；切 tab/刷新回第 1 页；保留原生自动加载作为下一页预取 |
| 2 | `space.bilibili.com/<uid>/upload/opus[/…]` | 翻页，每页 42 条 | 每页 42 条（末页除外）；翻页/跳页；卡片视觉保持原生 |
| 3 | 同阶段 2 | 同一行卡片高度统一（以该行最高为准） | 行内卡片底边对齐；可开关 |
| 4 | 同阶段 2 | 左→右 最新→最旧，上→下 最新→最旧 | 按日期倒序 + 行优先排布；可开关 |
| 5 | 待定 | 翻译按钮（B 站原生按钮样式） | 需求待确认 |

## 1. 阶段 1：动态页翻页（本轮交付）

- 文件：`src/scripts/dyn-pagination.js` → `dist/01-动态翻页.user.js`
- match：`*://*.bilibili.com/*/dynamic`、`*://*.bilibili.com/*/dynamic/*`
- `@grant none`、`@run-at document-idle`、`@noframes`

**数据与分页**

1. 等待 `.bili-dyn-list__items` 与 `document.querySelector('.bili-dyn-list').__vue__`，拿到列表 VM。
2. `PAGE_SIZE = 12`（用户反馈：与 B 站每次自动加载的 12 条对齐）；`vm.list` 顺序即 DOM 顺序（`.bili-dyn-list__item`）。
3. 只显示 `[(page-1)*12, page*12)` 的项，其余 `display:none`；MutationObserver 在列表变化后**立即**重新套用（预取的新条目在下一次绘制前隐藏）。
4. 需要更多数据时调 `vm.loadmore()`（兼容 `vm._getList('NEXT')`），用 `vm.$nextTick` 等待渲染；`vm.status === 'NO_MORE'` 即末页。
5. **保留 B 站原生的滚到底自动加载**：滚到当前页底部时预取下一页 12 条；原生加载条隐藏，分页条不被顶动。
6. `vm.status` 为 `EMPTY` 或列表为空时不接管；`ERROR/PAUSED` 允许通过分页按钮重试。
7. 切换 全部/视频 tab、刷新、SPA 切 UP 主：重置到第 1 页或重新初始化。
8. 分页条 1:1 复刻 B 站 `VPagenation` 的 DOM/class（`vui_pagenation`、`vui_button`、`vui_pagenation-go`），暗色模式走 CSS 变量。

**回退**

- 找不到 VM / 方法缺失：纯 DOM 模式（滚到底 + 派发 scroll 触发原生加载，MutationObserver 等新节点）。
- 任何分支都不新增 API 请求，不涉及 wbi/风控。

**验收**

1. 首屏仅 1–12 条可见。
2. 滚到当前页底部：B 站原生自动加载预取 12 条（改为隐藏），当前页仍只显示 12 条，分页条位置不跳动。
3. 下一页显示 13–24（通常已预取、即时打开）；上一页即时回退。
4. 跳至第 5 页顺序加载并停在 49–60，有进度提示。
5. 末页后下一页禁用、页数固定。
6. 切 tab / 刷新 / 换 UP 主后回第 1 页且不重复注入。
7. 展开评论、图片灯箱、暗色模式正常；控制台无报错。

## 2. 阶段 2：图文页翻页（20 条/页，v0.1.0 已实现）

- 文件：`dist/02-图文翻页.user.js`；match：`*://*.bilibili.com/*/upload/opus`、`*://*.bilibili.com/*/upload/opus/*`；`@run-at document-start`。
- **每页 20 条**（2026-10-28 实测 B 站图文每次自动加载 20 条；用户确认按 20 实现），**保留原生自动加载**作为下一页预取。
- 数据双通道（`src/opus/adapter.js`）：
  1. Vue 实例：`#app.__vue_app__._instance` 遍历 vnode，定位 `__name === "WaterfallGrid"`（或按 `props.list` 形状），读取原生 `width/height/columnWidth` 与 `vnode.props.onLoadMore`；
  2. 抓包：`installCapture()` 只读观察页面自身对 `/x/polymer/web-dynamic/v1/opus/feed/space` 的 XHR/fetch，自行换算卡片尺寸；加载更多退化为滚到底触发页面自身的加载。
- 接管渲染：给 `.opus` 加 `.bili-tools-opus-active` 隐藏原生 `.opus-feed`（保留其数据/请求/滚动逻辑），在 `.opus-body` 的 feed 后插入自己的网格；卡片用原生 class 重建（`src/opus/cards.js`）。
- 布局复刻原生 `WaterfallGrid`（`src/opus/layout.js`）：列宽公式、前 10 条行优先 + 之后最短列、容器高度；窗口缩放按原生公式重排。
- 预取：滚到底触发原生加载的 20 条不会渲染进当前页（渲染 key 只看当前页切片），分页条位置不变；点下一页即时打开。
- 分页条放 `.opus-footer`，复用 `src/shared/pager.js`；跳页需要时顺序加载（`onLoadMore`），远跳先确认；切 tab/刷新回第 1 页。
- 两通道都失败时完全不接管；`ERROR/PAUSED` 允许重试；重复注入只保留首个实例的调试入口。
- 复用 `src/shared/`：`pager.js`、`dom.js`、`log.js`、`style.js`、`toast.js`（均已通过阶段 1 测试）。
- 测试：`npm run test:e2e:opus`（Vue 通道、网络通道、预取、切 tab、resize、重复注入）+ 单元测试（布局/高度/URL/分页）。

## 3. 阶段 3：统一行高

- `uniformRows` 模式：每行 = 列数条；行高 = 该行卡片自然高度最大值（以最高为准）；封面 flex 撑满，标题 2 行固定区，副标题固定。
- 设置开关（阶段 3 默认开）；另提供“所有行都用全局最高”选项。

## 4. 阶段 4：显示顺序

- 在 `uniformRows` 基础上强制行优先（左→右、上→下）日期倒序。
- 日期优先取数字时间戳；支持常见绝对/相对日期字符串；无法解析时保持接口原顺序（最近更新本身倒序）。
- 排序稳定，页切分在排序后进行。

## 5. 阶段 5：翻译按钮（待确认）

- 待确认：翻译对象、目标语言、翻译来源（官方 AI 翻译接口 / 第三方）、交互与缓存。
- 样式基准：`vui_button`、`vui_icon`、`sic-BDC-*`、`--brand_blue` 等原生 class/变量。

## 6. 工程约定

- `src/shared/` 放共享逻辑；esbuild 打包成 IIFE userscript（不压缩，保留可读性）。
- 每个交付脚本都带完整 UserScript 头；安装新阶段时禁用上一阶段即可。
- 调试：`window.BILI_TOOLS` 暴露状态与自检；`localStorage["biliTools:debug"]="1"` 打日志。
- 测试：`node --test` 单元测试 + `playwright-core`（本机 Chrome）假页 e2e + 截图；真实登录场景由用户实测。
