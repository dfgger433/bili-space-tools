# 实施计划：B站空间页增强（主分支单脚本）

## 总体架构

主分支只交付一个 userscript（`dist/B站空间页增强.user.js`），包含三个内部模块：

1. `dyn` 动态翻页（`/dynamic`，12 条/页）
2. `opus` 图文翻页（`/upload/opus`，20 条/页，Vue/网络双通道）
3. `row` 统一行高（`/upload/opus`，原生克隆 / 02 分页网格双模式）

`src/scripts/bili-space-tools.js` 负责：
- 按 URL 决定启动哪些模块；
- 注册油猴菜单：三个模块各自“开/关”，图片压缩仍由 opus 模块注册；
- 开关持久化到 `biliTools:modules`（GM 存储，localStorage 兜底）；
- 开关即时 start/stop，并处理 02/03 切换（02 停 → 03 原生克隆；03 停 → 02 恢复瀑布流）；
- SPA 路由变化时重新应用；
- 暴露 `window.BILI_TOOLS.all` 调试入口。

单脚本带 GM 权限（`unsafeWindow`、菜单、存储）；页面 Vue/XHR 通过 `unsafeWindow`/`pageDocument` 访问，
DOM 操作在脚本上下文完成。三个模块互不依赖，单独脚本仍保留在维护分支。

## 模块细节

### 动态翻页

- 复用动态列表 Vue 2 实例或 DOM，本地分页，不新增请求。
- 每页 12 条，原生分页条，保留原生自动加载做下一页预取。
- `start/stop` 幂等；停止恢复原生列表。

### 图文翻页

- Vue 实例优先，网络抓包回退；不修改响应。
- 每页 20 条，原生卡片/分页条，原生自动加载预取。
- 图片压缩设置独立（`biliTools:opus`），由 opus 模块菜单控制。
- `start/stop` 幂等；停止恢复原生 feed。

### 统一行高

- 单独：克隆原生所有已加载 `.item` 到自己的网格；原生 feed 隐藏但保留自动加载；
  `childList/characterData` + 图片加载 + resize + 3 秒看门狗持续重排。
- 与 02 同开：接管 `.bt-opus-grid`（`mode: "bt"`），按行等高，02 翻页后重新应用。
- 封面保比例 `@640w.webp` + `object-fit: contain`；行高富余展开省略文字；过高竖图导致整行拉高、其余留白。
- 停止：原生模式恢复 feed；bt 模式清理行内样式并触发 02 重渲染。

## 阶段

1. 阶段 1/2/3 已完成，单独脚本在 `fix/dynamic-page-12`、`feat/opus-pagination`、`feat/opus-uniform-row` 分支维护。
2. 阶段 4（单脚本 + 三模块开关）已完成。
3. 阶段 5（显示顺序）无需实现：B 站默认已是日期倒序。
4. 阶段 6（翻译按钮）待确认需求：翻译对象/目标语言/来源/交互；样式用 B 站原生 `vui_button` / `vui_icon`。
