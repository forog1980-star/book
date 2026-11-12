import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// در اجرای عادی برنامه، هیچ پاک‌سازی کش یا درخواست خودکار بروزرسانی اجرا نمی‌شود.
// تنها در اولین اجرا که هنوز Service Worker فعالی ثبت نشده است، ثبت اولیه (?v=15) انجام می‌گیرد.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistration()
      .then((existingReg) => {
        if (existingReg && existingReg.active) {
          return existingReg;
        }
        return navigator.serviceWorker.register('./sw.js?v=15');
      })
      .catch(() => {
        // Service worker registration optional in dev iframe
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
