# گزارش فنی جامع اصلاحات ایمن سامانه مرکز اسناد — ۱۲ نوامبر ۲۰۲۶

**عنوان مأموریت:**
`Atomic Offline Update + Service Worker Hardening + Responsive Home Toolbar + Font and Build Synchronization`

**مخزن رسمی:** `https://github.com/forog1980-star/book`

---

## ۱. مشخصات مبنا، Recovery Point و وضعیت نسخه‌بندی

- **Commit مبنای شروع مأموریت:** `acf40203cf7e4293fd880c34d3b4728a4a5f8d72`
- **Recovery Point ثبت‌شده پیش از تغییرات:**
  - پوشه بازیابی محلی: `.recovery-point-pre-safe-update-toolbar-20261112/` (حاوی نسخه پشتیبان دقیق تمام فایل‌های هدف پیش از تغییر + فایل `BASELINE_SHA256.txt`)
  - برچسب/شاخه هدف برای مخزن Git:
    - نقطه بازیابی: `recovery/pre-safe-update-toolbar-20261112`
    - شاخه کاری مستقل: `fix/atomic-offline-update-toolbar-20261112`
- **تضمین عدم دست‌کاری داده‌ها و سرویس‌های ابری:**
  - هیچ تغییری در داده‌های عملیاتی کاربر، ساختار `IndexedDB` (`markaz_asnad_book_operational_db_v1`)، یا کلیدهای عملیاتی `localStorage` (`book_*`) اعمال نشده است.
  - هیچ تغییری در `Supabase`، `Firebase`، `Firestore`، قوانین امنیتی یا تنظیمات ابری ایجاد نشده است.

---

## ۲. فهرست دقیق فایل‌های تغییریافته و SHA256 قبل و بعد

| ردیف | مسیر فایل | SHA256 قبل از اصلاح (Baseline) | SHA256 پس از اصلاح (Final) | خلاصه تغییر مهندسی |
|---|---|---|---|---|
| ۱ | `src/utils/githubSyncService.ts` | `dc7c985e5e74f63cfbf9be14d436522e5642f4ee87e6c959dbbc6ac5d410996c` | `74cb89bfa179f9d211a6696e4864ccfcc07bc2d34d23fa1dff110a31cbfa4c6f` | بازطراحی به‌روزرسانی دستی گیت‌هاب به صورت اتمیک (Staging در حافظه/کش موقت، اعتبارسنجی تمام فایل‌های HTML/JS/CSS/WOFF2 پیش از دست‌زدن به کش فعال `v15`، اتصال به چرخه واقعی `controllerchange` و عدم Reload در صورت به‌روز بودن) |
| ۲ | `public/sw.js` | `1f167f2ebfc06d0217f8470c746590ca467a8a3b9772c3c835398c3f212d2aa4` | `d1367a59568f4c8ed4d525c0d1964a4da68f7aa2ae006311dae771db817f9f7d` | ارتقا به `markaz-asnad-main-book-v15`، نصب اتمیک در `event.waitUntil()` با Rollback خودکار کش ناقص، حذف کش‌های قدیمی فقط در `activate`، و محدودسازی `fetch` به `caches.open(CACHE_NAME)` |
| ۳ | `src/main.tsx` | `dfca5ba6e7ba8c79aa1e220601980d612ec61f0d97dc5f63bcfa240560d5aa32` | `dbe78c0705f68244ab36e57022e61886e831a2a83f653e30c7e67a08a3663bc3` | حذف کامل حلقه خطرناک پاک‌سازی کش (`caches.keys()` / `caches.delete()`) در شروع برنامه، بررسی `getRegistration()` و ثبت `./sw.js?v=15` فقط در صورت نبود SW فعال |
| ۴ | `apps/library-research-pwa/sw.js` | `2eb8fa39988f7937dfbe72abfb65df52c2762bb0bf04431cfab1694d045e31bf` | `10d96d53590424f6d899e143913bc7c2c46923ac26e841f71ce74d23226bebba` | ارتقا به `markaz-asnad-library-shell-v9`، نصب اتمیک با Rollback، و ایزوله‌سازی کامل `fetch` روی `caches.open(CACHE_NAME)` |
| ۵ | `apps/library-research-pwa/src/app.ts` | *(موجود در بسته زیربرنامه)* | *(به‌روزشده و کامپایل‌شده در `site/`)* | هماهنگ‌سازی ثبت `./sw.js?v=9` با بررسی `getRegistration()` پیش از ثبت مجدد |
| ۶ | `src/assets/fonts/Vazirmatn-variable.woff2` | *(فایل جدید در `src/assets/fonts/`)* | `4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92` | افزودن باینری معتبر `wOF2` (`111,152` بایت) به مسیر مدیریت دارایی‌های Vite |
| ۷ | `src/index.css` | `07efde0ff656f20b56ef5bc68db73a8844c5eb49c7bc644b792e85b3f86bc7fa` | `eca353d227326769121a9433161a9a7c0d08aa805dcb1dfea0f108efe8b30b69` | اصلاح `@font-face` به `url('./assets/fonts/Vazirmatn-variable.woff2')` تا Vite فونت هش‌دار را در کنار CSS تولید کند |
| ۸ | `vite.config.ts` | `e8a0f31495763cf77d6d5386416c5637ca14611801fb4fc0d64d1fc221c84bd6` | `e0435bdfec402b3342263d3c648e605c090fbf34804dbd3d6d7614bc039852dd` | همگام‌سازی فایل فونت هش‌دار `Vazirmatn-*` در کنار `index-*` در پوشه‌های `docs/assets/` و `خروجی نرم‌افزار/assets/` بدون حذف مستندات |
| ۹ | `src/App.tsx` | `66021e3e12ac7c0e15972dc14b2aaef23dd1ba05e4240417f70b8685c294f8f5` | `6633d0a94ea3e11204b51533194599f96e8da45a3639a1d00f771a2dee37378e` | حذف دکمه سبز «نصب» از نوار بالای صفحه خانه، بازطراحی نوار ابزار با Grid دو ردیفه در موبایل و ۵ ستونه در دسکتاپ (`min-h-[44px]` بدون بریدگی متن)، اصلاح نوار وضعیت آفلاین، و اتصال دکمه گیت‌هاب به `res.shouldReload` |
| ۱۰ | `src/components/BackupAndExportTab.tsx` | `2040a1d32a3621a8e41634c912d84f891b03c0056c2a8bd3133b414be6776cb7` | `f5c7aa9a4e1b3f8ce05a4c9d1814a0256363cf2ad24a44f3793cdb50403afc43` | اتصال دکمه بروزرسانی از گیت‌هاب به قرارداد `res.shouldReload` و اصلاح عبارت‌های وضعیت آفلاین (با حفظ کامل دکمه نصب PWA در این تب) |
| ۱۱ | `scripts/test-offline-pwa.mjs` | *(اسکریپت آزمون قبلی)* | *(ارتقایافته با ۱۳ آزمون جامع)* | اعتبارسنجی ۱۳ شرط معماری آفلاین، اتمیک بودن کش، ایزوله‌سازی فضای نام، صحت فونت `wOF2` در `/book/` و عدم وجود فونت بیرونی |
| ۱۲ | `.github/workflows/validate-main-pwa.yml`، `deploy.yml`، `main-app-check.yml` | *(فایل‌های گردش‌کار CI)* | *(متصل‌شده به `npm run test:offline-pwa`)* | اجرای خودکار `npm run test:offline-pwa` پیش از استقرار در GitHub Pages و در Pull Requestها |

---

## ۳. جدول نسخه‌های Service Worker و نام کش‌ها (قبل و بعد)

| زیرسامانه | فایل Service Worker | نام کش قبلی | نام کش جدید | آدرس ثبت در کلاینت | وضعیت جداسازی فضای نام |
|---|---|---|---|---|---|
| **سامانه اصلی مرکز اسناد** | `public/sw.js` | `markaz-asnad-main-book-v14` | `markaz-asnad-main-book-v15` | `./sw.js?v=15` | فقط کلیدهای با پیشوند `markaz-asnad-main-book-` و پیشوند قدیمی `markaz-asnad-pwa-` را مدیریت می‌کند |
| **زیربرنامه مستقل پژوهشی** | `apps/library-research-pwa/sw.js` | `markaz-asnad-library-shell-v8` | `markaz-asnad-library-shell-v9` | `./sw.js?v=9` | فقط کلیدهای با پیشوند `markaz-asnad-library-shell-` را مدیریت می‌کند |

---

## ۴. توضیح فنی تضمین به‌روزرسانی اتمیک (Atomic Offline Update)

در معماری جدید (`src/utils/githubSyncService.ts` و `public/sw.js`):

1. **عدم دست‌کاری کش فعال پیش از دریافت کامل:**
   - برخلاف منطق قبلی که ابتدا `index.html` جدید را داخل کش فعال می‌نوشت، اکنون ابتدا `index.html` و `manifest.webmanifest` دریافت و لیست تمام فایل‌های ضروری (`./assets/index-[hash].js`، `./assets/index-[hash].css` و فونت `./assets/Vazirmatn-variable-[hash].woff2` استخراج‌شده از درون CSS) شناسایی می‌شوند.
   - تک‌تک این فایل‌ها ابتدا در حافظه (`verifiedResponses`) و کش موقت (`markaz-asnad-main-book-v15-staging-...`) دریافت و از نظر `resp.ok` و `byteLength > 0` بررسی می‌شوند.
2. **Rollback کامل در صورت قطع اینترنت در میانه راه:**
   - اگر حتی یک فایل (مثلاً باندل JS یا فونت) دریافت نشود یا اینترنت در میانه راه قطع شود، استثنا پرتاب شده، فقط کش موقت `staging` حذف می‌گردد و کش فعال فعلی بدون کوچک‌ترین تغییری دست‌نخورده باقی می‌ماند.
3. **هماهنگی با چرخه واقعی Service Worker:**
   - در رویداد `install` فایل `public/sw.js`، تابع `installAppShellAtomically()` داخل `event.waitUntil()` اجرا می‌شود. اگر هر یک از فایل‌های App Shell دریافت نشود، کش ناقص `v15` با `await caches.delete(CACHE_NAME)` پاک شده و خطا مجدداً پرتاب می‌شود تا نسخه `v14` همچنان فعال بماند.
   - فراخوانی `self.skipWaiting()` از مرحله `install` عادی حذف شده (فقط در اولین نصب که `!self.registration.active` است یا با دریافت پیام صریح `SKIP_WAITING` پس از تکمیل نصب اجرا می‌شود).
   - در کلاینت نیز به‌جای `setTimeout` کور ۱۲۰۰ میلی‌ثانیه‌ای، وضعیت `installing` تا رسیدن به `installed` و رویداد `controllerchange` رصد می‌شود. اگر باندل و Service Worker تغییری نکرده باشند، پیام `«✅ نسخه فعلی نرم‌افزار به‌روز است و نیازی به بارگذاری مجدد نیست.»` نمایش داده شده و صفحه Reload نمی‌شود (`shouldReload: false`).
4. **پاسخ‌دهی ایزوله در Fetch Handler:**
   - در هر دو فایل `public/sw.js` و `apps/library-research-pwa/sw.js`، استفاده از `caches.match()` سراسری حذف شده و پاسخ‌ها منحصراً از `await caches.open(CACHE_NAME)` خوانده می‌شوند تا هیچ پاسخ ترکیبی از دو نسخه متفاوت کش رخ ندهد.

---

## ۵. توضیح فنی تفکیک رفتار کد برنامه و چرخه استاندارد مرورگر برای Service Worker

- **در کد برنامه (`src/main.tsx` و `apps/library-research-pwa/src/app.ts`):**
  - حلقه حذف کش در شروع برنامه (`caches.keys()` / `caches.delete()`) به طور کامل حذف شد.
  - در هنگام بارگذاری صفحه (`window.addEventListener('load', ...)`): ابتدا `navigator.serviceWorker.getRegistration()` بررسی می‌شود. اگر یک Service Worker فعال (`existingReg && existingReg.active`) وجود داشته باشد، برنامه هیچ فراخوانی مجددی برای `register()` یا `update()` انجام نمی‌دهد و هیچ نسخه `waiting` را به صورت خودکار فعال نمی‌کند.
- **در سطح مرورگر:**
  - مرورگرها ممکن است طبق استاندارد PWA در سطح موتور مرورگر بررسی‌های چرخه حیات Service Worker را مدیریت کنند، اما در کد اپلیکیشن هیچ درخواست شبکه‌ای خودکاری برای دریافت نسخه جدید یا فعال‌سازی اجباری بدون کلیک کاربر روی دکمه «بروزرسانی از گیت‌هاب» ارسال نمی‌شود.

---

## ۶. توضیح فنی اصلاح مسیر فونت `Vazirmatn` برای `/book/` و حالت آفلاین

- **علت مشکل قبلی:**
  - در `src/index.css` مسیر فونت به صورت `url('./fonts/Vazirmatn-variable.woff2')` نوشته شده بود و فایل CSS خروجی در `dist/assets/index-[hash].css` قرار می‌گرفت. بنابراین مرورگر در GitHub Pages (`/book/`) به دنبال `/book/assets/fonts/Vazirmatn-variable.woff2` می‌گشت که وجود نداشت (404)، در حالی که فونت در `/book/fonts/Vazirmatn-variable.woff2` بود.
- **راه‌حل مهندسی پیاده‌سازی‌شده:**
  - فایل معتبر باینری `Vazirmatn-variable.woff2` (`111,152` بایت با هدر استاندارد `wOF2`) در مسیر `src/assets/fonts/Vazirmatn-variable.woff2` قرار گرفت و در `src/index.css` به صورت `url('./assets/fonts/Vazirmatn-variable.woff2')` ارجاع داده شد.
  - اکنون Vite در زمان Build فایل `dist/assets/Vazirmatn-variable-BeciDpKm.woff2` را تولید کرده و درون `dist/assets/index-CvuOXf8z.css` دقیقاً عبارت زیر را قرار می‌دهد:
    ```css
    @font-face {
      font-family: Vazirmatn;
      src: local(Vazirmatn), url("./Vazirmatn-variable-BeciDpKm.woff2") format("woff2");
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    ```
  - به این ترتیب چه در `/book/assets/index-CvuOXf8z.css` و چه در `./assets/index-CvuOXf8z.css`، آدرس `./Vazirmatn-variable-BeciDpKm.woff2` دقیقاً به فایل هم‌مکان خود در پوشه `assets/` اشاره می‌کند و توسط `collectAppShellAssets` در Service Worker و در سرویس بروزرسانی دستی گیت‌هاب نیز کش می‌شود.
  - نسخه `./fonts/Vazirmatn-variable.woff2` در `public/fonts/` نیز برای سازگاری عقب‌رو حفظ شده است.

---

## ۷. توضیح بازطراحی نوار ابزار صفحه اصلی برای موبایل و دسکتاپ

در `src/App.tsx`:
1. **حذف دکمه سبز «نصب» از نوار بالای صفحه خانه:**
   - دکمه «نصب» و مودال اضافی `showHeaderInstallModal` از نوار ابزار بالای صفحه خانه حذف شدند تا ازدحام ۶ کلید در یک ردیف برطرف شود.
   - دکمه «نصب روی گوشی اندروید» و منطق `usePWAInstall` در بخش **«پشتیبان و گزارش‌ها»** (`src/components/BackupAndExportTab.tsx`) به طور کامل دست‌نخورده و فعال باقی مانده است.
2. **چیدمان واکنش‌گرا با Grid بدون بریدگی متن (`truncate`) و بدون اسکرول افقی:**
   - ۵ کنترل اصلی (**پشتیبان و گزارش‌ها**، **نقش کاربر**، **ارتباط گوشی**، **بروزرسانی از گیت‌هاب**، **خروج از برنامه**) در قالب `grid grid-cols-2 min-[380px]:grid-cols-6 lg:grid-cols-5 gap-2` چیده شده‌اند:
     - **در موبایل استاندارد (`380px` تا `1023px`):** ردیف اول شامل ۳ کنترل (`col-span-2` برای هرکدام) و ردیف دوم شامل ۲ کنترل (`col-span-3` برای هرکدام).
     - **در صفحه‌های بسیار باریک (`<380px`):** چیدمان ۲ ستونه تمیز بدون هیچ‌گونه بریدگی متن.
     - **در دسکتاپ (`>=1024px`):** چیدمان ۵ ستونه متوازن در یک ردیف (`lg:grid-cols-5`).
   - تمامی کنترل‌ها دارای حداقل ارتفاع استاندارد لمس `min-h-[44px]` هستند و برچسب `«نقش کاربر:»` در موبایل نیز همواره نمایش داده می‌شود.
3. **نوار وضعیت آفلاین آرام و خوانا در پایین نوار ابزار:**
   - متن ثابت: `«ذخیره‌سازی محلی فعال است • دریافت نسخه جدید از گیت‌هاب فقط با درخواست شما»`
   - در صورت قطع اینترنت (`!isOnline`): نمایش خط مجزا با متن `«اینترنت دستگاه قطع است؛ جست‌وجوی بیرونی در دسترس نیست.»`

---

## ۸. جدول مقایسه پوشه‌های خروجی و نحوه اجرای نسخه دسکتاپ و GitHub Pages

| پوشه / مسیر | تعداد فایل (قبل -> بعد) | حجم کل (قبل -> بعد) | فایل‌های کلیدی همگام‌سازی‌شده و SHA256 | کاربرد اجرایی |
|---|---|---|---|---|
| `dist/` | `102` -> `103` فایل | `66M` -> `67M` | `index.html`: `20731ea2...`<br>`sw.js`: `d1367a59...`<br>`assets/index-CVKT7WeU.js`: `c5a9d3f0...`<br>`assets/index-CvuOXf8z.css`: `3a9d1aae...`<br>`assets/Vazirmatn-variable-BeciDpKm.woff2`: `4e3fa217...` | خروجی استاندارد Build و منبع استقرار GitHub Pages توسط `.github/workflows/deploy.yml` |
| `docs/` | `75` -> `68` فایل *(حذف باندل‌های قدیمی `index-*` بدون حذف مستندات `.md`)* | `25M` -> `21M` | دقیقاً هم‌هش با `dist/` در تمامی فایل‌های اجرایی (`index.html`, `sw.js`, `manifest.webmanifest`, `assets/*`) | پوشه مستندات فنی + نسخه استاتیک همگام‌سازی‌شده |
| `خروجی نرم‌افزار/` | `67` -> `61` فایل *(حذف باندل‌های قدیمی `index-*`)* | `61M` -> `20M` | دقیقاً هم‌هش با `dist/` در تمامی فایل‌های اجرایی (`index.html`, `sw.js`, `manifest.webmanifest`, `assets/*`) | بسته آماده اجرای محلی روی سیستم دسکتاپ |
| `apps/library-research-pwa/site/` | `23` -> `23` فایل | `169K` -> `282K` | `sw.js` (`v9`): `10d96d53590424f6d899e143913bc7c2c46923ac26e841f71ce74d23226bebba` | بسته اجرایی زیربرنامه مستقل پژوهشی (کپی‌شده در `public/library-research/`، `docs/library-research/` و `خروجی نرم‌افزار/library-research/`) |

### راهنمای اجرای صحیح روی سیستم دسکتاپ و GitHub Pages:
1. **از طریق GitHub Pages (`https://forog1980-star.github.io/book/`):** با اولین بار باز شدن در مرورگر دسکتاپ یا موبایل (یا نصب به عنوان PWA)، Service Worker نسخه `v15` تمام فایل‌های اجرایی، فونت و داده‌های `/data/` را در کش محلی ذخیره می‌کند و پس از آن در حالت آفلاین/پرواز نیز بدون اینترنت اجرا می‌شود.
2. **از طریق سرور محلی روی پوشه `خروجی نرم‌افزار/` یا `dist/`:** به دلیل محدودیت امنیتی مرورگرها در پروتکل `file://` برای `fetch('./data/library_books.json')` و `Service Worker`، برای اجرای کامل نسخه چندفایلی روی ویندوز بدون اینترنت می‌توانید دستور `npx vite preview` یا `python -m http.server 8080` را در پوشه `خروجی نرم‌افزار/` اجرا کنید.
3. **نسخه تک‌فایل آفلاین (`library-quick-inventory.html`):** مستقیماً با دوبار کلیک روی ویندوز یا موبایل بدون نیاز به وب‌سرور نیز باز می‌شود.

---

## ۹. نتایج دقیق آزمون‌های اجراشده (Build, Lint, Offline PWA Validation)

تمام آزمون‌های زیر به صورت واقعی در محیط ساخت اجرا شده و با موفقیت ۱۰۰٪ عبور کرده‌اند:

1. **`npm run lint` (`tsc --noEmit`):**
   - نتیجه: `Exit Code 0` (بدون هیچ خطای TypeScript).
2. **`npm run build` (`vite build` + `sync-docs-build`):**
   - نتیجه: `Exit Code 0`
   - تولید `dist/assets/index-CVKT7WeU.js` (`6,753,617` بایت)، `dist/assets/index-CvuOXf8z.css` (`110,400` بایت)، و `dist/assets/Vazirmatn-variable-BeciDpKm.woff2` (`111,152` بایت) و همگام‌سازی خودکار با `docs/` و `خروجی نرم‌افزار/`.
3. **`npm run test:offline-pwa` (`node scripts/test-offline-pwa.mjs`):**
   - خروجی واقعی:
     ```text
     Offline PWA static validation passed (13/13 checks): 2 local bundle reference(s), 1 hashed font asset(s), 6864017 bundle bytes, 111152 fallback font bytes, 4728327 precached data bytes.
     ```
   - پوشش هر ۱۳ شرط: تطابق نسخه `v15`، تمایز از `v14`، وجود و غیرتهی بودن تمام باندل‌ها و `/data/`، صحت مسیر نسبی `./Vazirmatn-variable-BeciDpKm.woff2` درون CSS و هدر باینری `wOF2`، عدم حذف کش قبلی پیش از نصب، عدم بلعیدن خطای Precache، پاسخ‌دهی `fetch` فقط از `caches.open(CACHE_NAME)`، عدم حذف کش در `src/main.tsx`، عدم دست‌کاری `IndexedDB`/`localStorage` در سرویس گیت‌هاب، ایزوله‌سازی کش زیربرنامه `v9`، عدم وجود Google Fonts، اعتبارسنجی Staging و `controllerchange`، و عدم وجود عملیات نوشتن ابری.
4. **ساخت و آزمون دود زیربرنامه پژوهشی (`apps/library-research-pwa`):**
   - دستور: `npm --prefix apps/library-research-pwa run build:site` و `static-smoke.mjs`
   - خروجی واقعی:
     ```text
     Assembled 23 public runtime files in site/; no workbook, CSV, source, docs, or test files included.
     Static deployment package verified: 23 runtime files only.
     ```

---

## ۱۰. چک‌لیست تست نهایی توسط کاربر روی گوشی و سیستم واقعی

از آنجا که بررسی‌های سطح کد، باندل، مسیرهای نسبی، هدر باینری فونت و منطق تراکنشی Service Worker در محیط ساخت راستی‌آزمایی شده‌اند، برای اطمینان نهایی در محیط واقعی دستگاه خود موارد زیر را پس از استقرار بررسی فرمایید:

1. **بارگذاری اولیه و ارتقای کش به `v15`:**
   - یک بار برنامه را با اینترنت باز کنید و دکمه **«بروزرسانی از گیت‌هاب»** را بزنید تا نسخه جدید و کش `markaz-asnad-main-book-v15` جایگزین شود.
2. **تست دکمه «بروزرسانی از گیت‌هاب» در حالت به‌روز:**
   - بلافاصله دوباره دکمه **«بروزرسانی از گیت‌هاب»** را بزنید؛ باید پیام `«✅ نسخه فعلی نرم‌افزار به‌روز است و نیازی به بارگذاری مجدد نیست.»` بدون Reload شدن صفحه نمایش داده شود.
3. **تست حالت پرواز (Airplane Mode) روی گوشی و سیستم:**
   - اینترنت گوشی/سیستم را کاملاً قطع کنید (حالت پرواز) و برنامه را ببندید و دوباره باز کنید؛ برنامه، فونت فارسی `Vazirmatn`، و تمامی تب‌ها باید بدون خطا باز شوند.
4. **تست محافظت از نسخه فعال در زمان قطع اینترنت:**
   - در همان حالت پرواز، روی دکمه **«بروزرسانی از گیت‌هاب»** بزنید؛ باید پیام هشدار آفلاین نمایش داده شود و نسخه فعلی بدون هیچ‌گونه پریدن یا سفید شدن صفحه به کار خود ادامه دهد.
5. **بررسی ظاهری نوار ابزار صفحه اصلی در موبایل:**
   - در صفحه اصلی (خانه) روی گوشی، مطمئن شوید که ۵ کلید اصلی در ۲ ردیف مرتب و خوانا بدون اسکرول افقی و بدون بریدگی متن (`...`) نمایش داده می‌شوند و دکمه نصب PWA همچنان در تب **«پشتیبان و گزارش‌ها»** در دسترس است.
6. **کنترل سلامت داده‌های عملیاتی:**
   - شمارنده رکوردهای ذخیره‌شده روی دکمه `پشتیبان و گزارش‌ها` و فهرست ثبت‌های قبلی خود را بررسی کنید تا از سلامت ۱۰۰٪ اطلاعات قبلی اطمینان حاصل شود.
