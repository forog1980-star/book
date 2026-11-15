/**
 * پالت رنگی مصوب مرکز اسناد (گرم، روشن، آرشیوی و آرام) + رنگ‌های متمایز نمودارهای دوناتی
 *
 * ترکیب رنگی مصوب کل نرم‌افزار:
 * - زمینه بیرونی: #C8BD9B
 * - زمینه اصلی: #F0EBD9
 * - زمینه کارت‌ها و پنل‌ها: #FBF8EC
 * - رنگ زیتونی ملایم: #B9B38A
 * - رنگ زغالی (متن و اعداد اصلی): #353530
 * - خطوط و حاشیه‌ها: #D8D1BB
 *
 * رنگ‌های متمایز و پررنگ ویژه نمودارهای دوناتی:
 * - سبز پررنگ (تکمیل‌شده / احرازشده): #15803D
 * - آبی پررنگ (در حال بررسی / در جریان): #1D4ED8
 * - قرمز پررنگ (شروع‌نشده / نیازمند بررسی / باقیمانده): #B91C1C
 */
export const EXECUTIVE_DASHBOARD_ARCHIVE_PALETTE = {
  outerBackground: '#C8BD9B',
  mainBackground: '#F0EBD9',
  cardBackground: '#FBF8EC',
  softOlive: '#B9B38A',
  charcoalText: '#353530',
  borderLine: '#D8D1BB',

  // طیف‌های مکمل مشتق‌شده از زغالی و زیتونی برای سلسله‌مراتب نوشتار
  mutedText: '#525046',
  subtleText: '#6E6A5C',
  hoverSurface: '#E5DEC6',

  // رنگ‌های پررنگ و متمایز نمودارهای دوناتی (سبز پررنگ، آبی پررنگ، قرمز پررنگ)
  donutCompleted: '#15803D',
  donutInProgress: '#1D4ED8',
  donutNotStarted: '#B91C1C',
  donutTrack: '#D8D1BB',
} as const;
