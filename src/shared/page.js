// 页面 window/document 访问：油猴沙箱下用 unsafeWindow，普通页面上下文退化为 window。
export function pageWindow() {
  try {
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
  } catch {
    /* ignore */
  }
  return window;
}

export function pageDocument() {
  try {
    const win = pageWindow();
    if (win && win.document) return win.document;
  } catch {
    /* ignore */
  }
  return document;
}
