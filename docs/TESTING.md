# 测试说明

## 1. 本地自动测试

```powershell
# 安装开发依赖（只需一次）
npm install

# 单元测试（分页窗口 / 文案）
npm test

# 浏览器端假页测试（使用本机 Chrome / Edge，无需下载 Playwright 浏览器）
npm run test:e2e

# 分页控件与原生参考的尺寸/字体对比（截图输出到 test/screenshots/）
npm run test:visual

# 构建 userscript
npm run build
```

- e2e 使用 `playwright-core` + 本机浏览器（默认探测 Chrome/Edge，可用环境变量 `BILI_TEST_BROWSER` 覆盖）。
- 假页把 `/440900637/dynamic` 重写到 `test/fixtures/dyn-page.html`，从而让脚本的 `@match` 与路由判断生效；CSS 直接加载 `参考文件/` 里的 B 站原生样式表，保证分页条外观就是原生外观。
- 已覆盖：VM 模式、整列表重绘、纯 DOM 回退、上一页/下一页、跳页输入、末页禁用、重复注入、tab 重置、少量数据（总量 5 条 / 12 条）。

## 2. 真实页面手动验收（用户执行）

> 动态页数据需要登录 cookie，本地无法自动测试，请在浏览器里按下列步骤验证。

### 安装

1. 打开 Tampermonkey 管理面板 → 实用工具 → 导入文件，选择 `dist/01-动态翻页.user.js`（或直接把文件拖进浏览器）。
2. 打开任意 UP 主的空间动态页，例如 `https://space.bilibili.com/440900637/dynamic`。

### 阶段 1 检查项

| # | 操作 | 预期 |
|---|---|---|
| 1 | 打开动态页 | 列表只显示 10 条，底部出现 B 站原生样式的分页条 |
| 2 | 打开控制台 | `window.BILI_TOOLS.dyn.state` 显示 `active: true`、`page: 1`、`adapter: "vm"`（取不到实例时是 `"dom"`） |
| 3 | 点“下一页” | 短暂加载后显示第 11–20 条，页码变为 2；计数变成“第 2 页 · 已加载 24 个” |
| 4 | 点“上一页” | 立即回到 1–10 条（不重新请求） |
| 5 | 在“跳至”输入 5 回车 | 出现加载进度，完成后显示第 41–50 条；跨页较多时会先弹确认框 |
| 6 | 一直翻到最后一页 | 停止加载，“下一页”消失，计数变成“共 X 页 / N 个” |
| 7 | 切到“视频”tab 再切回“全部” | 回到第 1 页，分页条不重复 |
| 8 | 展开某条动态的评论/图片 | 当前页显示正常，分页条位置不异常 |
| 9 | 刷新页面 / 浏览器前进后退 | 回到第 1 页；脚本不重复注入 |
| 10 | 切换系统暗色模式 | 分页条配色跟随 B 站原生变量 |

### 反馈方式

- 异常时：F12 控制台过滤 `[bili-tools]`，把报错和 `window.BILI_TOOLS.dyn.state` 的内容发我；如方便附截图。
- 需要更详细日志：控制台执行 `localStorage.setItem('biliTools:debug','1')` 后刷新。

## 3. 调试开关

| 开关 | 作用 |
|---|---|
| `window.BILI_TOOLS.dyn.state` | 当前状态（page / totalPages / busy / adapter / loaded / hasMore / status） |
| `window.BILI_TOOLS.dyn.goTo(5)` | 跳到第 5 页（会按需加载） |
| `window.BILI_TOOLS.dyn.next()` / `.prev()` | 下一页 / 上一页 |
| `window.BILI_TOOLS.dyn.refresh()` | 手动重扫列表并重绘分页条 |
| `localStorage["biliTools:debug"]="1"` | 输出决策日志到控制台 |

## 4. 已知限制

- 动态总页数在加载到最后一页前未知，页码窗口会围绕当前页显示；点超出的页码会按需加载。
- 跳页是本地分页，跳很远会顺序加载中间页；脚本对“超过 6 页且请求超过 6 次”的跳转会先弹确认。
- 隐藏的条目仍可能被 B 站自身的滚动逻辑预取（计数里的“已加载 N 个”会变大），不影响当前页只显示 10 条。
