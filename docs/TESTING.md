# 测试说明

## 1. 本地自动测试

```powershell
# 安装开发依赖（只需一次）
npm install

# 单元测试（分页窗口 / 图文布局 / 高度公式 / URL 归一化）
npm test

# 动态假页 e2e（本机 Chrome / Edge，无需下载 Playwright 浏览器）
npm run test:e2e

# 图文假页 e2e（Vue 通道 + 网络抓包通道）
npm run test:e2e:opus

# 图文真实站点冒烟（可选，需要联网；匿名访问公开 UP 主即可）
npm run test:live:opus

# 分页控件与原生参考的尺寸/字体对比（截图输出到 test/screenshots/）
npm run test:visual

# 真实页面 DOM 快照测试（加载 参考文件/ 里保存的真实动态页，禁用其脚本，伪造列表实例）
npm run test:e2e:real

# 构建 userscript
npm run build
```

- e2e 使用 `playwright-core` + 本机浏览器（默认探测 Chrome/Edge，可用环境变量 `BILI_TEST_BROWSER` 覆盖）。
- 动态假页：`/440900637/dynamic` 重写到 `test/fixtures/dyn-page.html`；图文假页：`/631063962/upload/opus` 重写到 `test/fixtures/opus-page.html`。
- 假页直接加载 `参考文件/` 里的 B 站原生样式表；图文假页还提供了一个本地 mock 接口（20 条/页，共 60 条），模拟真实接口的分页与 `has_more`。
- 已覆盖：
  - 动态：VM 模式、整列表重绘、纯 DOM 回退、上一页/下一页、跳页、末页、重复注入、tab 重置、滚到底预取 12 条但当前页仍 12 条。
  - 图文：Vue 通道、网络抓包通道、20 条/页、滚到底预取、切 tab、resize、重复注入、封面/纯文字/徽章/统计渲染。
- 真实快照测试会加载 `参考文件/` 中保存的 B 站动态页（保留真实 SSR DOM 与 CSS、禁用其页面脚本），伪造列表实例后注入脚本：确认真实 DOM 下只显示 12 条、分页条正常插入（截图 `test/screenshots/dyn-real-snapshot.png`）。

## 2. 真实页面手动验收（用户执行）

> 动态/图文数据需要登录 cookie，本地无法自动测试，请在浏览器里按下列步骤验证。

### 安装

1. 打开 Tampermonkey 管理面板 → 实用工具 → 导入文件：
   - 动态：`dist/01-动态翻页.user.js`（版本 **0.2.0**）
   - 图文：`dist/02-图文翻页.user.js`（版本 **0.1.2**）
2. 两个脚本作用于不同页面，可以同时启用。
3. 打开：
   - 动态：`https://space.bilibili.com/<uid>/dynamic`
   - 图文：`https://space.bilibili.com/<uid>/upload/opus`

### 阶段 1 检查项（动态，每页 12 条）

| # | 操作 | 预期 |
|---|---|---|
| 1 | 打开动态页 | 列表只显示 12 条，底部出现 B 站原生样式的分页条 |
| 2 | 打开控制台 | `window.BILI_TOOLS.dyn.state` 显示 `active: true`、`page: 1`、`adapter: "vm"`（取不到实例时是 `"dom"`） |
| 3 | 滚到当前页最底部 | B 站自动预取下一页 12 条（计数“已加载”变成 24），但画面不闪、分页条不被顶下去；当前页仍只有 12 条 |
| 4 | 点“下一页” | 立即（或几乎立即）显示第 13–24 条，页码变为 2 |
| 5 | 点“上一页” | 立即回到 1–12 条（不重新请求） |
| 6 | 在“跳至”输入 5 回车 | 出现加载进度，完成后显示第 49–60 条；跨页较多时会先弹确认框 |
| 7 | 一直翻到最后一页 | 停止加载，“下一页”消失，计数变成“共 X 页 / N 个” |
| 8 | 切到“视频”tab 再切回“全部” | 回到第 1 页，分页条不重复 |
| 9 | 展开某条动态的评论/图片 | 当前页显示正常，分页条位置不异常 |
| 10 | 刷新页面 / 浏览器前进后退 | 回到第 1 页；脚本不重复注入 |
| 11 | 切换系统暗色模式 | 分页条配色跟随 B 站原生变量 |

### 阶段 2 检查项（图文，每页 20 条）

| # | 操作 | 预期 |
|---|---|---|
| 1 | 打开图文页 | 网格只显示 20 张卡片，底部出现原生样式分页条 |
| 2 | 打开控制台 | `window.BILI_TOOLS.opus.state` 显示 `active: true`、`page: 1`、`adapter: "vue"`（取不到实例时是 `"network"`）、`columns` 为 4/5/6 |
| 3 | 滚到当前页最底部 | B 站自动预取下一页 20 条（“已加载”变成 40），但当前页仍 20 张、分页条位置不变 |
| 4 | 点“下一页” | 立即（或几乎立即）显示第 21–40 条 |
| 5 | 点“上一页” | 立即回到 1–20 条（不重新请求） |
| 6 | 在“跳至”输入 3 回车 | 顺序加载并显示第 41–60 条；跨页较多时会先弹确认框 |
| 7 | 一直翻到最后一页 | “下一页”消失，计数变成“共 X 页 / N 个” |
| 8 | 切换 全部图文 / 专栏 / 动态 | 回到第 1 页，显示对应类型的图文 |
| 9 | 缩小/放大窗口 | 列数/列宽重排，当前页仍 20 张卡片 |
| 10 | 点击分页条下方的“图片压缩”开关 | 默认开启；关闭后当前页封面改为原图（更大更清晰），刷新后仍保持关闭；再开启恢复缩略图 |
| 11 | 检查卡片 | 封面比例、2 行标题、点赞/浏览、充电徽章、作者·时间副标题、纯文字卡片；点击卡片能打开 opus 页 |
| 12 | 刷新页面 / 浏览器前进后退 | 回到第 1 页；脚本不重复注入 |
| 13 | 切换系统暗色模式 | 卡片/分页条跟随 B 站原生变量 |

### 反馈方式

- 异常时：F12 控制台过滤 `[bili-tools]`，把报错和对应状态发我：
  - 动态：`window.BILI_TOOLS.dyn.state`
  - 图文：`window.BILI_TOOLS.opus.state`
  - 如方便附截图。
- 需要更详细日志：控制台执行 `localStorage.setItem('biliTools:debug','1')` 后刷新。

## 3. 调试开关

| 开关 | 作用 |
|---|---|
| `window.BILI_TOOLS.dyn.state` | 动态：page / totalPages / busy / adapter / loaded / hasMore / status |
| `window.BILI_TOOLS.dyn.goTo(5)` | 动态：跳到第 5 页（会按需加载） |
| `window.BILI_TOOLS.opus.state` | 图文：page / totalPages / loaded / hasMore / adapter / columnWidth / columns / tab / compressImages |
| `window.BILI_TOOLS.opus.goTo(2)` | 图文：跳到第 2 页（会按需加载） |
| `window.BILI_TOOLS.opus.setCompressImages(false)` | 图文：切换图片压缩（等价于点界面开关） |
| `window.BILI_TOOLS.opus.refresh()` | 图文：强制重扫并重绘当前页 |
| `localStorage["biliTools:debug"]="1"` | 输出决策日志到控制台 |

## 4. 已知限制

- 动态/图文总页数在加载到最后一页前未知，页码窗口会围绕当前页显示；点超出的页码会按需加载。
- 跳页是本地分页，跳很远会顺序加载中间页；脚本对“超过 6 页且请求超过 6 次”的跳转会先弹确认。
- 分页模式下保留 B 站原生滚到底自动加载：滚到当前页底部会预取下一页，所以“已加载 N 个”可能比当前页 × 每页条数多；
  预取的条目不会显示，点下一页即可看到。
- 图文页会隐藏原生 feed 并用自建网格渲染；原生卡片的 class/CSS 来自页面本身，若 B 站改版导致样式缺失，
  卡片外观可能退化，但分页/数据逻辑不受影响（控制台会提示数据通道）。
- 图文页若既取不到 Vue 实例、也抓不到接口响应，会完全不接管（保持原生页面）。

