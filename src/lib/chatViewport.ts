// Ask AI's message box stays fixed above the tab bar, and the
// conversation scrolls above it. On iPhone the on-screen keyboard does
// not resize the page: it only shrinks the *visual* viewport. So the
// chat page pins itself to the visual viewport (top + height), and while
// the keyboard is open the tab bar steps aside so the box sits right on
// top of the keyboard. Pure maths here; the hook below wires it up.

import { useEffect } from 'react';

/** A keyboard is "open" when the visual viewport lost more than this. */
export const KEYBOARD_THRESHOLD_PX = 120;

export interface ViewportInput {
  /** window.innerHeight (layout viewport). */
  innerHeight: number;
  /** visualViewport.height, or innerHeight where unsupported. */
  vvHeight: number;
  /** visualViewport.offsetTop (iOS scrolls the layout viewport on focus). */
  vvOffsetTop: number;
}

export interface ChatViewport {
  keyboardOpen: boolean;
  /** Pixel height of the visible area the chat may fill. */
  height: number;
  /** Pixel offset of the visible area from the layout viewport top. */
  top: number;
}

export function computeChatViewport({ innerHeight, vvHeight, vvOffsetTop }: ViewportInput): ChatViewport {
  const h = Number.isFinite(vvHeight) && vvHeight > 0 ? vvHeight : innerHeight;
  const keyboardOpen = innerHeight - h > KEYBOARD_THRESHOLD_PX;
  return {
    keyboardOpen,
    height: Math.round(h),
    top: Math.max(0, Math.round(Number.isFinite(vvOffsetTop) ? vvOffsetTop : 0)),
  };
}

/**
 * Publishes the visual viewport as CSS variables on <html>
 * (--chat-vv-h, --chat-vv-top) and toggles `keyboard-open` on <body>,
 * while the calling page is mounted. index.css (.chat-shell) does the rest.
 */
export function useChatViewport(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const update = () => {
      const v = computeChatViewport({
        innerHeight: window.innerHeight,
        vvHeight: vv?.height ?? window.innerHeight,
        vvOffsetTop: vv?.offsetTop ?? 0,
      });
      root.style.setProperty('--chat-vv-h', `${v.height}px`);
      root.style.setProperty('--chat-vv-top', `${v.top}px`);
      document.body.classList.toggle('keyboard-open', v.keyboardOpen);
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--chat-vv-h');
      root.style.removeProperty('--chat-vv-top');
      document.body.classList.remove('keyboard-open');
    };
  }, []);
}
