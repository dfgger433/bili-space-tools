# 调研记录：B站空间页（动态 / 图文）内部结构

> 来源：`参考文件/` 下 2026-10 保存的页面快照 + 线上 `s1.hdslb.com/bfs/static/shanks/fresh-space/assets/*` 与 `//s1.hdslb.com/bfs/seed/jinkela/dynlist/index.js` 的实际 bundle。

## 1. 页面与路由

| 页面 | URL | 说明 |
|---|---|---|
| 动态 | `https://space.bilibili.com/<uid>/dynamic` | 主页 `space-main route_dynamic`，列表容器 `.space-dynamic-inner > .content` |
| 图文 | `https://space.bilibili.com/<uid>/upload/opus` | 主页 `space-main route_uploadOpus`，`.opus` 页面组件 |
| 视频 | `https://space.bilibili.com/<uid>/upload/video` | 已有原生分页，可作视觉参照（xl 断点 42 条/页） |

两个页面共用 `index-c5b07bd7.js`（Vue 3 运行时 + 共享组件）、`index-*.css`（含 vui 组件样式）。

## 2. 动态页

### 2.1 渲染结构

```
<div class="space-dynamic">
  <div class="space-dynamic__left">  ... side-nav 全部/视频 ...
  <div class="space-dynamic__content">
    <div class="space-dynamic-inner">
      <div class="content">          <-- BiliDynList 挂载点
        <div class="bili-dyn-list">
          <div class="bili-dyn-list__items">
            <div class="bili-dyn-list__item"> <div class="bili-dyn-item">...
            ...
          </div>
          <... bili-dyn-list-loading / empty / no-more / notification ...>
        </div>
      </div>
```

- `.bili-dyn-list__item { margin-bottom: 8px }`；无虚拟滚动，已加载项全部在 DOM。
- 列表项顺序 = `vm.list` 顺序。

### 2.2 `BiliDynList`（Vue 2）

- `//s1.hdslb.com/bfs/seed/jinkela/dynlist/index.js` 在末尾执行 `window.BiliDynList = k`，是 Vue 2 应用工厂。
- 页面组件（`Dynamic`）用法：

```js
const { BiliDynList } = window;
new BiliDynList({
  type: BiliDynList.TYPE_ENUM.TYPE_SPACE,
  props: { params: { hostUid, type }, requestParams, onResponse },
  container: el,
  lang,
});
```

- 根组件 `Ox`（`bw = merge(mixins:[SPACE mixin fw], Ox)`）的 `$el` 是 `div.bili-dyn-list`；Vue 2 在 `_update` 中执行 `$el.__vue__ = vm`，因此：

```js
const vm = document.querySelector('.bili-dyn-list').__vue__;
```

- `vm` 上可用：
  - `list: DynamicItem[]`（响应式数组）
  - `status: 'INITIAL' | 'FETCHED' | 'LOADING' | 'ERROR' | 'EMPTY' | 'NO_MORE'`
  - `loadmore()` → `_getList('NEXT')`
  - `_getList(...)`（SPACE 版本忽略参数，用 `offset` 追加）
  - `refresh()`、`$nextTick`、`$watch`
- 自动加载：`_onScroll`（节流 100ms，passive）→ `scrollTop + 2*innerHeight >= scrollHeight` 时 `_getList('NEXT')`；滚动容器默认 `window`。
- 列表数据接口：`/x/polymer/web-dynamic/v1/feed/space`（页面自带 wbi/指纹拦截链），每页约 12 条，`{items, offset, has_more}`。
- 初始只加载 1 页；保存的快照里 25 条 = 置顶 1 + 12 + 12（快照时已滚过）。

### 2.3 分页控件的原生样式

`VPagenation`（Vue 3 共享组件，`index-c5b07bd7.js`）：

```html
<div class="vui_pagenation vui_pagenation--jump" role="navigation" aria-label="分页">
  <div class="vui_pagenation--btns">
    <button class="vui_button vui_pagenation--btn vui_pagenation--btn-side">上一页</button>
    <button class="vui_button vui_pagenation--btn vui_pagenation--btn-num">1</button>
    <button class="vui_button vui_pagenation--btn vui_pagenation--btn-num vui_button--active-blue" aria-current="page">2</button>
    <button class="vui_button vui_pagenation--btn vui_pagenation--btn-more">...</button>
    <button class="vui_button vui_pagenation--btn vui_pagenation--btn-side">下一页</button>
  </div>
  <div class="vui_pagenation-go">
    <span class="vui_pagenation-go__count">共 X 页 / Y 个，跳至</span>
    <div class="vui_input"><div class="vui_input-wrapper"><input type="number"></div></div>
    <span class="vui_pagenation-go__page">页</span>
  </div>
</div>
```

- 页码窗口规则：总页数 ≤ 9 全显示；当前 ≤5 显示 1..7 + 尾页；距尾 >4 显示当前±2；否则显示尾 7 页；首/尾与窗口之间插 `...`（原生里可用 `vui_pagenation--btn-more` 一次跳 5 页，或 `span.vui_pagenation--extend`）。
- 按钮基础样式：`.vui_button`（高 34px，`min-width:100px`；分页里由 `.vui_pagenation--btn-num{min-width:34px;padding:...}` 覆盖）；激活态 `vui_button--active-blue`；禁用 `disabled` + `.vui_button--disabled{display:none}` 只用于个别页面，分页这里禁用态是半透明。
- 跳页输入：`.vui_pagenation-go .vui_input-wrapper{width:50px}`，回车触发。

## 3. 图文页

### 3.1 渲染结构

```
<div class="opus">
  <div class="opus-header"> 全部图文 / 专栏 / 动态 tabs
  <div class="opus-body">
    (专栏 tab 时: .opus-collection ...)
    <div class="opus-feed">
      <div class="masonry_grid_v2"
           style="--container-width: 1458px; --container-height: 0px;"
           data-v-54e401b3>
        <div class="container">
          <div class="item" style="width:...;height:...;transform:translate(x,y)">
            <div class="opus-card">...
  <div class="opus-footer"></div>
  <div class="space-float">...
```

### 3.2 `WaterfallGrid`（组件 `__name === "WaterfallGrid"`）

props：

```
list, rowGutter = 0, columnGutter = 0, columnWidth = 320,
minColumn = 1, maxColumn = 5,
scrollContainer = document.scrollingElement,
loadingLock = false, thresholdOfWaterFall = 10
```

页面实际传参：`rowGutter: 18, columnGutter: 20, columnWidth: 动态, minColumn: 4, maxColumn: 6, list, loadingLock, onLoadMore`。

布局算法（源码还原）：

```js
for each item i:
  V = (item.width || 320) / (item.height || 240)
  z = item.extendSize || [0, 0]
  N = round((columnWidth - z[0]) / V) + z[1]           // 该项高度
  left = col * (columnWidth + columnGutter)
  top  = colHeights[col]
  if (T < thresholdOfWaterFall) {                      // 前 10 条：行优先
     colHeights[A] += N + rowGutter; A = (A + 1) % m; col = A;
  } else {                                             // 之后：最短列
     colHeights[col] += N + rowGutter; col = indexOf(min(colHeights));
  }
  if ((i + 1) % m === 0) {                             // 每行结束重算
     T = max(colHeights) - min(colHeights);
     A = 0;
     col = T < thresholdOfWaterFall ? 0 : indexOf(min(colHeights));
  }
```

- 虚拟滚动：只渲染 `top < scrollTop + 2*viewport && top + height >= scrollTop - viewport` 的项；滚动时每 300ms 重算。
- 加载更多：滚动监听里 `scrollTop + 2*clientHeight >= scrollHeight` 时 emit `loadMore`。
- 列数：`m = clamp(minColumn, maxColumn, floor((wrapperWidth + gutter) / (columnWidth + gutter)))`。
- wrapper 宽度用于计算，容器 `.container{margin:0 auto; width:var(--container-width); height:var(--container-height)}`，`.item{position:absolute;left:0;top:0}`。

### 3.3 图文数据

- 接口：`/x/polymer/web-dynamic/v1/opus/feed/space`，参数 `{host_mid, page, offset, type}`，返回 `{items, has_more, offset}`，每页约 20 条。
- store `upload-opus` 的 `getItems(items, startIndex)` 映射（源码还原）：

```js
const estimateTextHeight = ({ str, lineWeight, maxHeight, fontSize = 14, lineHeight = 17 }) => {
  const h = Math.ceil(str.length * fontSize / lineWeight) * lineHeight;
  return h > maxHeight ? maxHeight : h;
};
const build = (view) => {
  const { cover, content, badge } = view;
  let coverHeight = 0, coverType = null;
  if (cover) {
    const portrait = cover.width / cover.height <= 3 / 4;
    coverHeight = portrait ? columnWidth / 160 * 210 : columnWidth / 160 * 120;
    if (columnWidth < 168) coverHeight *= 16 / 19;
  }
  const textH = estimateTextHeight({
    str: content,
    lineWeight: cover ? columnWidth : columnWidth - 20,
    maxHeight: cover ? 40 : 80,
  });
  const g = (view.author || view.pub_time) ? 24 : 0;
  const k = cover ? 4 : badge ? 68 : 46;
  return { width: columnWidth, height: Math.floor(coverHeight + textH + k + g) };
};
```

- `list` 元素：`{ data: { view, cover? }, index, width, height }`，`view` 就是接口 item：
  - `view.cover = { url, width, height }`（注意：映射后 `data.cover` 是 `{width,height,src}`）
  - `view.content`（字符串正文）、`view.author`、`view.pub_time`、`view.stat = {view, like}`、`view.badge`、`view.jump_url`
- 列宽（页面 `countColumnWidth`，`o = min(innerWidth, 2560)`）：

| 条件 | 计算 |
|---|---|
| o < 1340 | cols=4，cw = (max(1100,o) - 286 - 20*3) / 4 |
| o < 1560 | cols=5，cw = (max(1100,o) - 286 - 20*4) / 5 |
| o < 1680 | cols=5，cw = (o - 446 - 20*4) / 5 |
| 其它 | cols=6，cw = (o - ((o<1860?150:240)+16+280) - 20*5) / 6 |

（公式来自 `updateColumnWidth(total, cols, gutter)` = `(total - gutter*(cols-1)) / cols`。）

#### 3.3.1 每次自动加载的条数（2026-10-28 实测）

- 用 `buvid3/buvid4`（`/x/frontend/finger/spi`）匿名请求 `/x/polymer/web-dynamic/v1/opus/feed/space`（无需 wbi）：
  - `host_mid=631063962&type=all`：page 1–4 每页都是 **20 条**，`has_more=true`，`offset` 19 位；
  - `type=dynamic` 同样 20 条/页；`type=article` 满页时也是 20（该用户只有 13 篇，所以返回 13）。
- 结论：**B 站图文列表每次自动加载 20 条**（首屏若渲染高度不足一屏，页面会再自动加载一次，最多首屏 40 条）。
- 响应 item 形状（实测）：`{jump_url, opus_id, content, badge, author, cover:{url,width,height}, stat:{view,like}, pub_time}`；
  `author/pub_time` 可能为空字符串，`jump_url` 是协议相对地址（`//www.bilibili.com/opus/...`）。
- 对阶段 2 的建议：与动态页一致，页大小取自动加载批次 **20**，保留原生自动加载作为下一页预取。


### 3.4 卡片 DOM / CSS（原生）

```html
<div class="opus-card">
  <div class="opus-card--with-cover">
    <a class="bili-cover-card opus-card__cover" href="jump_url" target="_blank"
       style="--bili-cover-card-ratio: 62.5%">
      <div class="bili-cover-card__thumbnail"><img src="cover.url" alt=""></div>
      <div class="bili-cover-card__stats">
        <div class="bili-cover-card__stat"><i class="sic-BDC-hand_thumbsup_line"></i><span>123</span></div>
      </div>
      <div class="bili-cover-card__tags"><div class="bili-cover-card__tag">充电专属</div></div>
    </a>
    <a class="opus-card__title" href="jump_url" target="_blank"><!-- 2 行省略 -->正文</a>
  </div>
  <div class="opus-card__subtitle">author · pub_time</div>
</div>
```

无封面：

```html
<div class="opus-card">
  <div class="opus-card--only-text">
    <a href="jump_url" target="_blank">
      <div class="battery-charge-only">...</div>
      <div class="opus-card__text"><!-- 3 行省略 -->正文</div>
    </a>
    <div class="opus-card__icons">
      <span><i class="sic-BDC-eye_browse_line"></i> 123</span>
      <span><i class="sic-BDC-hand_thumbsup_line"></i> 4</span>
    </div>
  </div>
</div>
```

关键 CSS（`index-7f7ca3ba*.css`）：

```css
.bili-cover-card{padding-top:var(--bili-cover-card-ratio);position:relative;display:block;background:var(--graph_bg_thick)}
.bili-cover-card__thumbnail{position:absolute;top:0;left:0;width:100%;height:100%;border-radius:var(--bili-cover-card-border-radius)}
.bili-cover-card__thumbnail img{width:100%;height:100%;object-fit:cover}
.bili-cover-card__stats{position:absolute;bottom:0;left:0;width:100%;padding:14px 8px 6px;background-image:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.8));color:#fff;display:flex;justify-content:space-between}
.opus-card--with-cover .opus-card__title{display:block;font-size:14px;line-height:16.8px;padding:6px 0;color:var(--text1)}
.opus-card--only-text{padding:10px;border-radius:4px;background:var(--graph_bg_regular)}
.opus-card--only-text .opus-card__text{line-height:20px;text-align:justify}
.opus-card__subtitle{margin-top:4px;height:20px;font-size:13px;color:var(--text3);line-clamp:1}
.masonry_grid_v2[data-v-54e401b3]{width:100%}
.masonry_grid_v2 .container[data-v-54e401b3]{margin:0 auto;position:relative;width:var(--container-width);height:var(--container-height)}
.masonry_grid_v2 .item[data-v-54e401b3]{position:absolute;left:0;top:0;max-width:100%}
```

统计规则（`OpusCard`）：UP 主本人看自己空间时显示“浏览+点赞”，访客只显示“点赞”（在封面底部渐变层）。

### 3.5 Vue 3 实例入口

- `#app` 是挂载容器，Vue 3 `app.mount()` 中执行 `container.__vue_app__ = app`（线上 bundle 未加 dev 开关）。
- 组件用 `defineComponent({ __name: "WaterfallGrid", props: {...}, setup() { ... return renderFn } })`；`instance.props.list` 为数据数组，`instance.vnode.props.onLoadMore` 为父页面拉取函数。
- 由于 `setup` 直接返回 render 函数，组件内部闭包（布局 map、可视集合）不可直接访问；数据通过 props 取。

## 4. 其它

- 空间侧栏 `.side-nav__item.active .side-nav__item__sub-text` 的文本是该用户“图文”总数（快照：482），只适合“全部图文”口径。
- `参考文件/动态分页.js` 是 GreasyFork 上一个第三方脚本（UIM258），思路是自行调 API + 重绘，与本方案不同；仅作反例参考。
- B 站目前没有动态/图文卡片级的“翻译”按钮；官方 AI 翻译是头部设置 + 服务端下发。阶段 5 需另行定义。
