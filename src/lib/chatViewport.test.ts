// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { computeChatViewport, useChatViewport, KEYBOARD_THRESHOLD_PX } from './chatViewport';

describe('computeChatViewport', () => {
  it('no keyboard: the whole visible height', () => {
    expect(computeChatViewport({ innerHeight: 844, vvHeight: 844, vvOffsetTop: 0 }))
      .toEqual({ keyboardOpen: false, height: 844, top: 0 });
  });

  it('iPhone keyboard open: the shrunken visual viewport and its offset', () => {
    expect(computeChatViewport({ innerHeight: 844, vvHeight: 508.4, vvOffsetTop: 300 }))
      .toEqual({ keyboardOpen: true, height: 508, top: 300 });
  });

  it('a small change (URL bar collapsing) is not a keyboard', () => {
    expect(computeChatViewport({ innerHeight: 844, vvHeight: 844 - KEYBOARD_THRESHOLD_PX, vvOffsetTop: 0 }).keyboardOpen).toBe(false);
  });

  it('falls back to innerHeight on a bad visual viewport', () => {
    expect(computeChatViewport({ innerHeight: 700, vvHeight: 0, vvOffsetTop: Number.NaN }))
      .toEqual({ keyboardOpen: false, height: 700, top: 0 });
  });
});

describe('useChatViewport', () => {
  it('publishes the CSS variables and cleans up on unmount', () => {
    const { unmount } = renderHook(() => useChatViewport());
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--chat-vv-h')).toMatch(/px$/);
    unmount();
    expect(root.style.getPropertyValue('--chat-vv-h')).toBe('');
    expect(document.body.classList.contains('keyboard-open')).toBe(false);
  });
});

describe('Ask AI layout: message box fixed above the tab bar', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  const chat = read('../pages/AIDoctorChat.tsx');
  const css = read('../index.css');

  it('the page is a pinned shell with a scrolling conversation and a fixed composer', () => {
    expect(chat).toContain('useChatViewport();');
    expect(chat).toContain('className="chat-shell');
    expect(chat).toMatch(/flex-1 min-h-0 overflow-y-auto[^"]*" data-testid="chat-scroll"/);
    expect(chat).toMatch(/className="flex-none[^"]*"[^>]*data-testid="chat-composer"/);
  });

  it('the "Try asking" list scrolls with the conversation, not with the box', () => {
    expect(chat.indexOf('data-testid="suggestions"')).toBeGreaterThan(chat.indexOf('data-testid="chat-scroll"'));
    expect(chat.indexOf('data-testid="suggestions"')).toBeLessThan(chat.indexOf('data-testid="chat-composer"'));
  });

  it('the shell clears the tab bar + safe area, and the bar steps aside for the keyboard', () => {
    expect(css).toContain('height: calc(var(--chat-vv-h, 100dvh) - 4rem - env(safe-area-inset-bottom));');
    expect(css).toContain('body.keyboard-open nav[data-bottom-nav]');
    expect(read('../components/BottomNav.tsx')).toContain('data-bottom-nav');
  });
});
