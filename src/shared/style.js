// 样式注入
export function addStyle(id, css) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.textContent = css;
    return existing;
  }
  const style = document.createElement('style');
  style.id = id;
  style.type = 'text/css';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  return style;
}

export function removeStyle(id) {
  const el = document.getElementById(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
