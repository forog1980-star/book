import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { OFFLINE_SW_CACHE_NAME } from './utils/githubSyncService';

// پاک‌سازی فقط کش‌های نسخه‌های قدیمی‌تر (با حفظ کامل کش فعال v14 برای کارکرد ۱۰۰٪ آفلاین)
if (typeof window !== 'undefined' && 'caches' in window) {
  window.caches
    .keys()
    .then((keys) => {
      keys.forEach((key) => {
        if (
          (key.startsWith('markaz-asnad-main-book-') || key.startsWith('markaz-asnad-pwa-')) &&
          key !== OFFLINE_SW_CACHE_NAME
        ) {
          window.caches.delete(key).catch(() => {});
        }
      });
    })
    .catch(() => {});
}

// ثبت سرویس‌ورکر در حالت کاملاً آفلاین بدون ارسال درخواست خودکار بروزرسانی به گیت‌هاب در بدو ورود
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js?v=14')
      .then((reg) => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(() => {
        // Service worker registration optional in dev iframe
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);

