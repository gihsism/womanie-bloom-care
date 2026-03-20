import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
