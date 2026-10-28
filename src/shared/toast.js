// 轻量 toast：跟随 B 站主题变量，用于加载提示 / 错误提示
import { create } from './dom.js';
import { addStyle } from './style.js';

const STYLE_ID = 'bili-tools-toast-style';
const CSS = `
.bili-tools-toast-layer{position:fixed;top:76px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
.bili-tools-toast{pointer-events:none;max-width:80vw;padding:9px 16px;border-radius:8px;font-size:14px;line-height:22px;
  color:var(--text1,#18191c);background:var(--bg1,#fff);border:1px solid var(--line_regular,#e3e5e7);
  box-shadow:0 4px 16px rgba(0,0,0,.12);opacity:0;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease}
.bili-tools-toast.show{opacity:1;transform:translateY(0)}
.bili-tools-toast--error{color:var(--stress_red,#f85a54)}
.bili-tools-toast--progress{color:var(--brand_blue,#00aeec)}
`;

function layer() {
  let el = document.querySelector('.bili-tools-toast-layer');
  if (!el) {
    el = create('div', { className: 'bili-tools-toast-layer' });
    document.body.appendChild(el);
  }
  return el;
}

/**
 * 显示一条 toast，返回 { close(), setText() }。
 * duration <= 0 表示常驻，需要手动 close。
 */
export function toast(message, { type = 'info', duration = 3200 } = {}) {
  addStyle(STYLE_ID, CSS);
  const root = layer();
  const el = create('div', {
    className: `bili-tools-toast bili-tools-toast--${type}`,
    text: message,
  });
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  let timer = null;
  const close = () => {
    if (timer) clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };
  if (duration > 0) timer = setTimeout(close, duration);
  return {
    close,
    setText(text) {
      el.textContent = text;
    },
    setType(nextType) {
      el.className = `bili-tools-toast bili-tools-toast--${nextType} show`;
    },
  };
}
