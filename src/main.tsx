import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const ACTIVE_SW_CACHE = 'markaz-asnad-main-book-v10';

// پاک‌سازی فوری کش‌های قدیمی سرویس‌ورکر (v7/v8/v9) در لحظه بارگذاری اولیه در گوشی و سیستم
if (typeof window !== 'undefined' && 'caches' in window) {
  window.caches
    .keys()
    .then((keys) => {
      keys.forEach((key) => {
        if (
          (key.startsWith('markaz-asnad-main-book-') || key.startsWith('markaz-asnad-pwa-')) &&
          key !== ACTIVE_SW_CACHE
        ) {
          window.caches.delete(key).catch(() => {});
        }
      });
    })
    .catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js?v=10', { updateViaCache: 'none' })
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
        // Service worker registration optional in dev iframe
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
