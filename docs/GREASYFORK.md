# Greasy Fork 发布资料

已发布：https://greasyfork.org/zh-CN/scripts/602581-b%E7%AB%99%E7%A9%BA%E9%97%B4%E9%A1%B5%E5%A2%9E%E5%BC%BA-%E5%8A%A8%E6%80%81%E7%BF%BB%E9%A1%B5-%E5%9B%BE%E6%96%87%E7%BF%BB%E9%A1%B5-%E7%BB%9F%E4%B8%80%E8%A1%8C%E9%AB%98

## 发布前检查

- 脚本代码：`dist/B站空间页增强.user.js`（v1.0.3）
- metadata block 已在文件第一行，Greasy Fork 可正确解析
- `@namespace` / `@source` / `@homepageURL` 已指向 GitHub：
  `https://github.com/dfgger433/bili-space-tools`
- 许可证：MIT
- 脚本未压缩/未混淆（esbuild IIFE 打包，源码在 GitHub）
- 无远程代码、无数据上传；只操作 B 站页面 DOM，并读取页面自身的 Vue/XHR 数据
- 依赖：Tampermonkey（或兼容 GM API 的脚本管理器）

## Greasy Fork 表单建议

| 字段 | 建议值 |
|---|---|
| Script name | 自动读取 `@name`（无需改） |
| Description | `B站空间页增强：动态/图文翻页 + 统一行高（自动平均值裁剪、B站默认封面裁剪）+ 三个模块可独立开关。` |
| Language | Chinese (Simplified) |
| Category | Bilibili（没有则选 Site enhancements） |
| License | MIT |
| Source / Homepage | `https://github.com/dfgger433/bili-space-tools` |
| Script code | 粘贴 `dist/B站空间页增强.user.js` 全文，或上传该文件 |
| Additional info | 见下方 Markdown |
| Tags | `bilibili`, `tampermonkey`, `pagination`, `masonry` |
| Screenshots | 可选：`test/screenshots/opus-pager-centered.png`、`test/screenshots/opus-row-clip-27.png` |

## Additional info（Markdown，可复制）

```markdown
## 功能

一个 Tampermonkey 脚本，增强 B 站用户空间页：

- **动态翻页**：动态页每页 12 条，原生分页条，保留原生自动加载作为下一页预取。
- **图文翻页**：图文页每页 20 条，原生卡片/分页条，保留原生自动加载作为下一页预取。
- **统一行高**：同一行卡片等高；每行自动计算平均高度，最高卡片超出平均值的比例超过阈值时，
  按 B 站原生封面比例裁剪封面（标题保留）；阈值默认 27%，可调 0–100%，0 = 关闭。
- **模块开关**：油猴菜单可分别开关“动态翻页 / 图文翻页 / 统一行高”，另保留“图片压缩”开关。

## 使用

1. 安装 Tampermonkey。
2. 在 Greasy Fork 点“安装此脚本”。
3. 打开 B 站空间页（动态或图文），刷新一次。
4. 点油猴扩展菜单，按需开关模块或调整“行高裁剪阈值”。

## 说明

- 不收集、不上传任何数据；除 B 站页面自身资源外无额外网络请求。
- 图文翻页优先复用页面 Vue 数据，失败时只读观察页面自身接口，不修改请求/响应。
- 统一行高在“只开统一行高”时克隆原生卡片；与图文翻页同开时接管其分页网格。
- 源码 / 问题反馈：https://github.com/dfgger433/bili-space-tools

## License

MIT
```

## 发布步骤

1. 登录 [Greasy Fork](https://greasyfork.org/)。
2. 右上角用户名 → **发布脚本**（Post a new script）。
3. 粘贴 `dist/B站空间页增强.user.js` 全文；Greasy Fork 会自动读取 `@name`、`@version`、`@description`、`@match`、`@grant`。
4. 填写 Language / Category / License / Source，Additional info 用上面的 Markdown。
5. 提交。发布后从 Greasy Fork 安装一次，确认油猴菜单与页面效果。
6. 以后更新：修改 `scripts.config.mjs` 的 `version`，重新 `npm run build`，
   在 Greasy Fork 编辑脚本、粘贴新代码（版本号必须递增），再推送 GitHub。

