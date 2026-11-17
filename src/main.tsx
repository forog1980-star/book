import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// پاک‌سازی بی‌صدا پارامتر کمکی بازخوانی پس از همگام‌سازی بدون تغییر وضعیت کش
if (typeof window !== 'undefined' && window.location.search.includes('_sw_sync=')) {
  try {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('_sw_sync');
    window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  } catch {
    // ignore URL cleanup failures
  }
}

// در اجرای عادی برنامه، هیچ پاک‌سازی کش یا درخواست خودکار بروزرسانی اجرا نمی‌شود.
// تنها در اولین اجرا که هنوز Service Worker فعالی ثبت نشده است، ثبت اولیه (?v=18) انجام می‌گیرد.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistration()
      .then((existingReg) => {
        if (existingReg && existingReg.active) {
          return existingReg;
        }
        return navigator.serviceWorker.register('./sw.js?v=18', { updateViaCache: 'none' });
      })
      .catch(() => {
        // Service worker registration optional in dev iframe
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
