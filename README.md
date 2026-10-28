# B站空间页增强（单脚本 userscript）

[![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-安装脚本-B4522B)](https://greasyfork.org/zh-CN/scripts/602581-b%E7%AB%99%E7%A9%BA%E9%97%B4%E9%A1%B5%E5%A2%9E%E5%BC%BA-%E5%8A%A8%E6%80%81%E7%BF%BB%E9%A1%B5-%E5%9B%BE%E6%96%87%E7%BF%BB%E9%A1%B5-%E7%BB%9F%E4%B8%80%E8%A1%8C%E9%AB%98)
[![GitHub](https://img.shields.io/badge/GitHub-dfgger433%2Fbili--space--tools-181717?logo=github)](https://github.com/dfgger433/bili-space-tools)

主分支只交付**一个** Tampermonkey 脚本，内含三个可独立开关的模块：

| 模块 | 页面 | 功能 | 默认 | 开关 |
|---|---|---|---|---|
| 动态翻页 | `/uid/dynamic` | 动态翻页，每页 12 条（对齐 B 站原生自动加载批次），复用原生分页样式 | 开 | 油猴菜单“动态翻页：开/关” |
| 图文翻页 | `/uid/upload/opus` | 图文翻页，每页 20 条；分页条相对网格居中；保留原生自动加载做下一页预取；图片压缩开关 | 开 | 油猴菜单“图文翻页：开/关” |
| 统一行高 | `/uid/upload/opus` | 同一行卡片等高；自动行平均值 + 27% 可调阈值；超出平均值的卡片用 B 站默认封面裁剪 | 开 | “统一行高：开/关” + “行高裁剪阈值：27%” |

脚本文件：`dist/B站空间页增强.user.js`

> 三个模块在同一脚本里**互不依赖、可分别关闭**：关掉图文翻页就只剩统一行高（原生克隆模式）；
> 关掉统一行高就只做分页。设置保存在油猴存储里，刷新/换页后保持。

## 安装

### Greasy Fork（推荐）

[**点这里从 Greasy Fork 安装**](https://greasyfork.org/zh-CN/scripts/602581-b%E7%AB%99%E7%A9%BA%E9%97%B4%E9%A1%B5%E5%A2%9E%E5%BC%BA-%E5%8A%A8%E6%80%81%E7%BF%BB%E9%A1%B5-%E5%9B%BE%E6%96%87%E7%BF%BB%E9%A1%B5-%E7%BB%9F%E4%B8%80%E8%A1%8C%E9%AB%98)

> 需要先安装 Tampermonkey。Greasy Fork 会负责后续版本更新，安装后不需要再手动导入。

### 手动安装（备选）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 油猴管理面板 → **实用工具** → **导入文件**，选择 `dist/B站空间页增强.user.js`。
3. 打开空间页：
   - 动态：`https://space.bilibili.com/<uid>/dynamic`
   - 图文：`https://space.bilibili.com/<uid>/upload/opus`
4. 点油猴扩展图标，可看到并切换：
   - `动态翻页：开/关`
   - `图文翻页：开/关`
   - `统一行高：开/关`
   - `行高裁剪阈值：27%（0=关闭）`（统一行高模块启用时出现）
   - `图片压缩：开/关`（图文模块启用时出现）

> 安装/更新脚本后需要刷新一次已打开的页面（浏览器不会把新脚本注入旧标签页）；之后模块开关即时生效。

## 模块说明

### 动态翻页

- 复用动态列表自身的 Vue 2 实例或 DOM 数据，本地分页，不新增接口请求。
- 每页 12 条，保留 B 站原生滚到底自动加载作为下一页预取。
- 原生分页条样式；切 tab / 返回时回到第 1 页。
- 关闭后恢复原生动态列表，不残留分页条。

### 图文翻页

- 数据优先取页面 Vue 实例，失败时回退到只读接口观察（不修改请求/响应）。
- 每页 20 条，原生 WaterfallGrid 卡片和分页条样式。
- 原生自动加载预取下一页，点下一页即时显示。
- 图片压缩开关：开 = `@640w.webp` 缩略图（快）；关 = 原图（慢、画质最好）。
- 关闭后恢复原生图文 feed，不残留分页条。

### 统一行高

- 两种模式：
  - 单独启用（关闭“图文翻页”）时：克隆原生已加载的所有 `.item` 卡片到自己的网格，
    隐藏原生 feed 但保留原生自动加载；滚动加载/tab/翻译/原生重渲染后重新克隆排版。
  - 与“图文翻页”同时启用时：直接接管 `.bt-opus-grid`，分页 + 统一行高同时生效，分页条仍只有一个。
- **算法**：每行自动计算所有卡片平均高度 A；最高 M；超出比例 `(M − A) ÷ A`。
  - 超出比例 ≤ 阈值（默认 27%，菜单可设 0–100%）：行高 = M，保留原始内容；
  - 超出比例 > 阈值：行高 = A；超过 A 的卡片改用 **B 站原生封面比例 + `object-fit: cover`** 裁剪封面（标题保留），
    未超过 A 的卡片保留完整封面并下方留白；
  - 阈值 0 = 停用平均值裁剪，全部原始内容。
- 不再强行展开被省略的标题/正文。
- 关闭后恢复原生图文布局；若图文翻页仍在，则恢复 02 的瀑布流。

## 单独脚本分支（维护用）

主分支只保留单脚本；想单独使用某一个模块，可用对应维护分支构建：

| 分支 | 内容 |
|---|---|
| `fix/dynamic-page-12` | 动态翻页单独脚本 |
| `feat/opus-pagination` | 图文翻页单独脚本 |
| `feat/opus-uniform-row` | 图文统一行高单独脚本 |

各分支保留自己的 `scripts.config.mjs` 和 `dist/`，互不影响；主分支的模块源码仍在 `src/scripts/`，
单脚本通过 `src/scripts/bili-space-tools.js` 组合。

## 阶段 4 / 5

- **阶段 4（显示顺序）无需实现**：B 站图文默认已是“左→右、上→下 = 新→旧”的日期倒序。
- **阶段 5（翻译按钮）** 待确认需求（翻译对象、目标语言、翻译来源、交互）。

## 验证

```powershell
npm test                  # 单元测试
npm run test:e2e          # 动态假页 e2e（单脚本，dyn 模块）
npm run test:e2e:opus     # 图文假页 e2e（单脚本：图文翻页/统一行高/模块开关）
npm run test:e2e:real     # 真实动态 DOM 快照
npm run test:visual       # 分页控件视觉对比
npm run test:live:opus    # 真实图文页（只开图文翻页）
npm run test:live:row     # 真实图文页（只开统一行高）
npm run test:live:combined# 真实图文页（图文翻页 + 统一行高）
npm run build             # 生成 dist/B站空间页增强.user.js
```

真实站点冒烟通过：只开统一行高 20 条 4 行、滚到底 40 条 8 行；图文翻页 + 统一行高两页都等高且分页条只有 1 个。

## 调试

```js
// 单脚本总状态/开关
window.BILI_TOOLS.all.state     // { page, dyn, opus, row }
window.BILI_TOOLS.all.settings  // { dyn, opus, row }
window.BILI_TOOLS.all.toggle('row')

// 各模块
window.BILI_TOOLS.dyn.state
window.BILI_TOOLS.opus.state
window.BILI_TOOLS.row.state     // mode: "native" | "bt"，items/columns/rows/clipPercent/rowStats/lastError
window.BILI_TOOLS.row.setClipPercent(27)
```

## 更新记录

- `1.0.4`：02+03 兼容修复——裁剪时标题保留完整高度（封面 flex 占剩余空间）；克隆封面 eager 加载 + 原生 currentSrc 回退，修复部分图片空白；独立 03 脚本让位给 02（0.4.3）。
- `1.0.3`：发布元数据适配 Greasy Fork（metadata block 置顶、namespace/source 指向 GitHub、作者 dfgger433）。
- `1.0.2`：图文分页条改为相对网格居中（修复第 2 页分页按钮偏左）。
- `1.0.1`：统一行高改为自动行平均值 + 可调超出比例阈值（默认 27%，油猴菜单可设，0=关闭）；
  超过平均值的卡片使用 B 站默认封面裁剪，不再硬切；移除文字强行展开。
- `1.0.0`：主分支合并为**单脚本**；油猴菜单可分别开关动态翻页、图文翻页、统一行高，保留图片压缩开关；
  三个模块内部互不依赖，单独分支继续维护。
- `0.3.1`（统一行高）：双模式（原生克隆 / 02 分页网格），02+03 兼容。
- `0.4.0`（图文翻页）：单脚本、`unsafeWindow` 页面访问、fail-safe。
- `0.2.1`（动态翻页）：健壮性修复。
- 更早的分阶段记录见各维护分支。

## 目录结构

```
src/
  scripts/bili-space-tools.js   # 单脚本入口：组合三个模块 + 菜单开关
  scripts/dyn-pagination.js     # 动态翻页模块
  scripts/opus-pagination.js    # 图文翻页模块
  scripts/opus-uniform-row.js   # 统一行高模块
  opus/                         # 图文数据/布局/卡片/适配
  shared/                       # 通用 DOM/分页/样式/日志/设置
dist/B站空间页增强.user.js       # 构建产物（安装这个）
test/                           # 单元测试、e2e、假页、演示页
docs/                           # 计划/任务/测试/研究文档
```

## 构建

```powershell
npm install
npm run build   # 生成 dist/B站空间页增强.user.js
```

## License

[MIT](LICENSE)


