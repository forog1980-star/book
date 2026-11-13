import React from 'react';
import { ArrowRight, BarChart3 } from 'lucide-react';

interface StatisticsAndReportsRouteViewProps {
  onBackToDashboard: () => void;
}

const PLANNED_STATISTICAL_AREAS = [
  {
    id: 'library_deep_stats',
    title: 'گزارش تفصیلی وضعیت کتابخانه و قفسه‌ها',
    description:
      'تفکیک وضعیت بررسی کتاب‌ها، پرونده‌های باز تکرار عنوان، نسخه‌های فیزیکی و توزیع قفسه‌ها بر اساس شاخص‌های مصوب بعدی.',
  },
  {
    id: 'martyrs_relations_stats',
    title: 'آمار تفصیلی شهدا و قطعیت ارتباطات',
    description:
      'تفکیک احراز هویت شهدای مرتبط، وضعیت بررسی ارتباط کتاب و شهید و سطح قطعیت کارشناسی.',
  },
  {
    id: 'workflow_progress_stats',
    title: 'گزارش پیشرفت کار و خروجی‌های پژوهشی',
    description:
      'جزئیات صف پیگیری، تفکیک کارهای انجام‌شده و روند ثبت مطالب استخراج‌شده پس از تعیین فرمول‌های نهایی.',
  },
  {
    id: 'custom_exports_slot',
    title: 'گزارش‌های قابل استخراج مدیریتی',
    description:
      'ساختار جدول‌ها، نمودارها و فرمت‌های خروجی این بخش پس از تأیید طرح تفصیلی بعدی پیاده‌سازی می‌شود.',
  },
];

/**
 * مسیر مستقل «آمار و گزارش‌های تفصیلی»
 * پوسته آماده توسعه بدون بازگردانی نسخه قدیمی یا پیش‌دستی در تولید نمودار/جدول نهایی پیش از تأیید کارفرما
 */
export const StatisticsAndReportsRouteView: React.FC<
  StatisticsAndReportsRouteViewProps
> = ({ onBackToDashboard }) => {
  return (
    <div
      data-testid="executive-statistics-route-view"
      className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-10 space-y-6 text-[#332218]"
    >
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E5D7C6] pb-4">
        <div className="space-y-1">
          <div className="text-xs text-[#78604E]">
            مرکز اسناد و کتابخانه · مسیر مستقل آمار و گزارش‌ها
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#332218]">
            آمار و گزارش‌های تفصیلی
          </h2>
        </div>

        <button
          type="button"
          data-testid="back-to-dashboard-btn"
          onClick={onBackToDashboard}
          className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl bg-[#6B3E26] hover:bg-[#56311E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <ArrowRight className="w-4 h-4 shrink-0" />
          <span>بازگشت به داشبورد</span>
        </button>
      </header>

      <section
        aria-label="وضعیت آماده‌سازی مسیر آمار و گزارش‌های تفصیلی"
        className="bg-white border border-[#E5D7C6] rounded-2xl p-5 sm:p-6 space-y-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3E4D2] text-[#6B3E26] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 min-w-0">
            <h3 className="text-base font-bold text-[#332218]">
              پوسته مستقل آماده توسعه برای آمار و گزارش‌های تفصیلی
            </h3>
            <p className="text-sm text-[#5C4636] leading-relaxed">
              این صفحه به‌عنوان مسیر مستقل از نمای خلاصه سه‌کادره داشبورد طراحی و متصل شده است. محتوای دقیق، شاخص‌ها، نمودارها و گزارش‌های تفصیلی این بخش بر اساس مشخصات مصوب مرحله بعد در همین مسیر اضافه خواهد شد.
            </p>
          </div>
        </div>
      </section>

      <section
        aria-label="محورهای آماده پیاده‌سازی در مرحله بعد"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {PLANNED_STATISTICAL_AREAS.map((area) => (
          <div
            key={area.id}
            data-testid={`statistics-slot-${area.id}`}
            className="bg-white border border-[#E5D7C6] rounded-2xl p-5 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm sm:text-base font-bold text-[#332218]">
                {area.title}
              </h4>
              <span className="text-[11px] font-medium text-[#78604E] bg-[#FAF5EE] border border-[#E5D7C6] rounded-lg px-2 py-0.5 shrink-0">
                در انتظار تعریف نهایی
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#5C4636] leading-relaxed">
              {area.description}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
};
