# گزارش فنی تکمیل و ایمن‌سازی همگام‌سازی گوشی و کامپیوتر (`src/modules/device-sync/`)

## ۱. وضعیت اولیه و Commit مبنا
- **مخزن رسمی**: `https://github.com/forog1980-star/book`
- **شاخه مبنا**: `main`
- **Commit مبنا**: `6329a7dd0dec27a5a2db9c7b37adff589416d553` (`feat: integrate Firebase and device sync modules`)
- **وضعیت داده‌های واقعی گوشی**: ۱۸ رکورد کتاب تعیین‌تکلیف‌شده روی گوشی به‌عنوان منبع اصلی (`phone-primary`) در حافظه محلی دستگاه بدون کوچک‌ترین تغییر یا دستکاری حفظ شده‌اند.

---

## ۲. نقاط بازیابی (Recovery Points)
1. **Recovery Point اول (قبل از WebRTC)**: `.recovery-point-pre-webrtc/` (بررسی‌شده با `SHA256SUMS.txt` — کاملاً سالم).
2. **Recovery Point دوم (از وضعیت دقیق Commit `6329a7dd0dec27a5a2db9c7b37adff589416d553`)**:
   - مسیر دایرکتوری: `.recovery-point-v2-6329a7d/` (حاوی کپی دقیق تمام فایل‌های ماژول `device-sync`، `firestore.rules`، `firebase-blueprint.json`، `security_spec.md`، `src/App.tsx`، `package.json` و فایل هش `SHA256SUMS.txt`).
   - تگ Git: `recovery-point-v2-6329a7d` روی Commit `6329a7dd0dec27a5a2db9c7b37adff589416d553`.
   - **روش بازگردانی فوری (Rollback)**:
     ```bash
     git checkout main
     # یا بازگردانی مستقیم فایل‌ها از نسخه پشتیبان:
     cp -a .recovery-point-v2-6329a7d/src/modules/device-sync/* src/modules/device-sync/
     cp -a .recovery-point-v2-6329a7d/firestore.rules firestore.rules
     cp -a .recovery-point-v2-6329a7d/firebase-blueprint.json firebase-blueprint.json
     cp -a .recovery-point-v2-6329a7d/security_spec.md security_spec.md
     ```

---

## ۳. شرح رفع پنج ایراد ممیزی‌شده

### ایراد اول: امنیت شناسه نشست (`src/modules/device-sync/pairingService.ts`)
- **مشکل قبلی**: تابع `deriveSignalingSessionId` کد ۱۲ کاراکتری جفت‌سازی را به صورت متن آشکار در قالب `SESS_${cleanAlnum}_${digestSuffix}` قرار می‌داد.
- **اصلاح انجام‌شده**:
  - پیاده‌سازی استاندارد **SHA-256** (مطابق NIST FIPS 180-4) در توابع `sha256Hex` و `sha256HexAsync`.
  - مشتق‌سازی یک‌طرفه `sessionId` با جداسازی دامنه (`SHA-256("MARKAZ_ASNAD_SIGNAL_SESSION_V2:" + normalizedCode)`) در قالب `SESS_<48_hex_chars>` (۵۳ کاراکتر).
  - کد جفت‌سازی به هیچ عنوان از `sessionId` قابل استخراج نیست، اما در هر دو دستگاه گوشی و کامپیوتر به یک شناسه یکسان منجر می‌شود.
  - افزودن تابع `maskSessionIdForDisplay` برای جلوگیری از نمایش کامل شناسه نشست در رابط کاربری و لاگ‌ها.
  - حذف کامل مسیر بازگشتی `Math.random()` و استفاده انحصاری از `crypto.getRandomValues` (CSPRNG).

### ایراد دوم: احراز هویت و مالکیت Firestore (`firestore.rules`, `firebase-blueprint.json`, `src/modules/device-sync/signalingService.ts`)
- **مشکل قبلی**: قواعد Firestore فاقد بررسی `request.auth`، مالکیت `hostUid`/`peerUid`، بررسی زمان انقضای سمت سرور و جلوگیری از استفاده مجدد نشست بودند.
- **اصلاح انجام‌شده**:
  - افزودن تابع `ensureSignalingAuth()` در `signalingService.ts` با پشتیبانی از `signInAnonymously` و ثبت `hostUid` و `peerUid`.
  - جلوگیری از مصرف مجدد نشست‌های `connected`, `closed`, `expired` یا دارای `answerSdp` قبلی در `fetchSignalingSession`.
  - بازطراحی کامل `firestore.rules` با الزام `isSignedIn()`، قفل مالکیت به `hostUid` و `peerUid`، غیرقابل تغییر بودن `offerSdp` پس از ایجاد، بررسی `request.time.toMillis() < data.expiresAtMs` و محدود کردن `delete` به دو دستگاه مالک نشست.
  - *نکته اجرایی طبق قوانین ۶ و ۷*: فایل `firestore.rules` آماده شده اما بدون دریافت مجوز صریح جداگانه از مالک پروژه روی فضای ابری Deploy نشده است.

### ایراد سوم: جایگزینی کامل FNV-1a با SHA-256 (`pairingService.ts`, `transferProtocol.ts`)
- **مشکل قبلی**: استفاده از هش غیررمزنگاری‌شده ۶۴ بیتی FNV-1a برای `pairingCodeDigest` و چک‌سام بسته‌ها.
- **اصلاح انجام‌شده**:
  - جایگزینی کامل `computeDeterministicHash` و `derivePairingDigest` با `SHA-256` (`SHA256_<64_hex_chars>`).
  - در `assembleAndVerifyTransferBuffer` (`transferProtocol.ts`)، علاوه بر بررسی هش SHA-256 بیرونی کل رشته بسته، هش SHA-256 محتوای تک‌تک رکوردها (`changeId`) و هش درونی بسته (`payloadChecksum`) نیز اعتبارسنجی می‌شوند تا هرگونه دستکاری بیرونی یا درونی مسدود گردد.

### ایراد چهارم: اصلاح Restore در هر پنج مجموعه داده (`syncEngine.ts`, `DeviceSyncPanel.tsx`)
- **مشکل قبلی**: بازیابی از بایگانی حذف نرم در رابط کاربری فقط برای `auditRecords` رکورد را به دیتاست اصلی برمی‌گرداند.
- **اصلاح انجام‌شده**:
  - ایجاد تابع اتمیک `restoreRecordIntoDataset` در `syncEngine.ts` با پشتیبانی یکسان از هر ۵ مجموعه (`auditRecords`, `bookCopies`, `customMartyrs`, `links`, `pendingReviews`).
  - درج رکورد در مجموعه اصلی پیش از حذف از آرشیو، حفظ شناسه اصلی (`key`, `copyId`, `martyrId`, `id`, `trackingId`) و جلوگیری از ایجاد رکورد تکراری در صورت بازیابی مجدد.

### ایراد پنجم: Cleanup کامل نشست‌ها (`peerConnection.ts`, `DeviceSyncPanel.tsx`)
- **مشکل قبلی**: در مسیرهای Timeout اتصال، خطای WebRTC، انصراف کاربر و بسته شدن تب مرورگر، پاک‌سازی نشست موقت کامل نبود.
- **اصلاح انجام‌شده**:
  - ایجاد متد یکپارچه `cleanupSignalingAndLocalResources` در `DirectWebRtcSessionManager` که در تمام مسیرهای Timeout، خطای WebRTC (`failed`)، قطع ارتباط (`disconnected`/`closed`)، شکست Signaling و انصراف دستی کاربر (`cancelPairing`)، هم اشتراک Firestore را متوقف و سند موقت را پاک می‌کند و هم کانال و اتصال محلی را می‌بندد، بدون آنکه به داده‌های کتابخانه دست بزند.
  - ثبت لیسنرهای `beforeunload` و `pagehide` برای پاک‌سازی خودکار هنگام بسته شدن یا Refresh تب مرورگر.
