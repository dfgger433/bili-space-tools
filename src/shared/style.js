// 样式注入（兼容 @run-at document-start：此时 documentElement 可能还没建立）
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

  const attach = () => {
    const root = document.head || document.documentElement;
    if (!root) return false;
    if (!style.isConnected) root.appendChild(style);
    return true;
  };

  if (!attach()) {
    const timer = setInterval(() => {
      if (attach()) clearInterval(timer);
    }, 10);
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (attach()) clearInterval(timer);
      },
      { once: true },
    );
  }
  return style;
}

export function removeStyle(id) {
  const el = document.getElementById(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
