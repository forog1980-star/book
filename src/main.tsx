import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Service Worker نسخه ۱۴؛ چرخهٔ کش فقط در محدودهٔ خود Service Worker مدیریت می‌شود.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js?v=14', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        // Service worker registration is optional in development/embedded previews.
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
