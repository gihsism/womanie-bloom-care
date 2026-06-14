import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

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
