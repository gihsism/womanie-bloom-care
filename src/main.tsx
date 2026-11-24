import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';
import { reloadOnceForStaleChunk } from './lib/staleChunk';
import { initStageTheme } from './lib/stageTheme';

// Stage colours before first paint (the device's last-seen life stage).
initStageTheme();

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

// Prevent stale PWA Service Worker caches from breaking the dev preview
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => registrations.forEach((r) => r.unregister()))
    .catch(() => {
      // ignore
    });
}

// Production: when a new version's service worker takes over, switch to it
// instead of showing the old cached design until the next visit. Reload
// only when that can't lose anything typed: right after opening, or while
// the app is in the background. Also check for a new version each time the
// app comes back to the foreground (home-screen apps rarely check on their own).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const openedAt = Date.now();
  let pendingReload = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return; // first install: the page is already current
    if (document.hidden || Date.now() - openedAt < 15000) window.location.reload();
    else pendingReload = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (pendingReload) window.location.reload();
      return;
    }
    navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => { /* offline */ });
  });
}

// A chunk from the previous deploy is gone: recover once (drop the offline
// cache, reload) to get the new version. Never call event.preventDefault()
// here: Vite then resolves the import with `undefined`, and React.lazy
// crashes with "_result.default" on Safari instead of reloading.
window.addEventListener("vite:preloadError", () => {
  reloadOnceForStaleChunk();
});

createRoot(document.getElementById("root")!).render(
  <App />
);

// Fade out and remove the static launch splash (index.html) now that the
// app has mounted. Two frames so the browser has painted the first React
// content before the splash starts fading, avoiding a flash of blank bg.
const splash = document.getElementById("app-splash");
if (splash) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      splash.classList.add("is-hidden");
      splash.addEventListener("transitionend", () => splash.remove(), { once: true });
      // Belt-and-braces: remove even if the transitionend never fires.
      setTimeout(() => splash.remove(), 600);
    }),
  );
}
