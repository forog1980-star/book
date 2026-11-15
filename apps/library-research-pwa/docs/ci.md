# اجرای آزمون خودکار

گردش‌کار GitHub Actions در مسیر `.github/workflows/library-research-pwa.yml` برای Node.js 22 تعریف شده است.

فرمان آزمون در شاخه توسعه:

```powershell
npm install --no-audit --no-fund
npm test
```

این فرمان، گسترش منابع، کامپایل TypeScript، آزمون‌های دامنه و آزمون HTTP دارایی‌های برنامه را اجرا می‌کند. آزمون HTTP فایل‌ها و gzip را بررسی می‌کند، نه اجرای تعاملی DOM. نتیجه CI باید جدا از آزمون دستی مرورگر و Android گزارش شود؛ موفقیت CI به‌تنهایی نصب PWA، عملکرد آفلاین یا بازیابی IndexedDB را اثبات نمی‌کند.
