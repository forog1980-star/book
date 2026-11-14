import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { toPersianDigits } from '../../../data/markazAsnadData';

export interface DonutChartSegment {
  id: string;
  label: string;
  count: number;
  percent: number;
  color: string;
  onClick?: () => void;
  testId?: string;
}

interface OverviewDonutChartProps {
  segments: DonutChartSegment[];
  totalCount: number;
  centerPercent: number;
  centerLabel: string;
  centerSubValue?: string;
  ariaLabel: string;
  size?: number;
  strokeWidth?: number;
  showLegend?: boolean;
  unitLabel?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x.toFixed(
    3
  )} ${end.y.toFixed(3)}`;
}

/**
 * نمودار دوناتی زنده و تعاملی استاندارد داشبورد و صفحه آمار تفصیلی:
 * - محاسبه کاملاً زنده از مجموع و سهم بخش‌ها (بدون عدد ثابت)
 * - هر برش دوناتی و ردیف راهنما قابلیت کلیک مستقیم برای بازکردن فهرست همان بخش را دارد
 * - خوانا در موبایل و دسکتاپ با ارقام هم‌عرض (tabular-nums)
 */
export const OverviewDonutChart: React.FC<OverviewDonutChartProps> = ({
  segments,
  totalCount,
  centerPercent,
  centerLabel,
  centerSubValue,
  ariaLabel,
  size = 96,
  strokeWidth = 10,
  showLegend = false,
  unitLabel = 'مورد',
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;

  const nonZeroSegments = segments.filter((s) => s.count > 0);
  const effectiveTotal = Math.max(
    0,
    totalCount > 0
      ? totalCount
      : nonZeroSegments.reduce((acc, s) => acc + Math.max(0, s.count), 0)
  );

  let currentAngle = 0;
  const computedArcs =
    effectiveTotal > 0
      ? nonZeroSegments.map((seg) => {
          const share = Math.max(0, seg.count) / effectiveTotal;
          const sweep = Math.min(360, share * 360);
          const start = currentAngle;
          const end = currentAngle + sweep;
          currentAngle = end;
          return {
            seg,
            start,
            end,
            isFullCircle: sweep >= 359.8,
          };
        })
      : [];

  return (
    <div className={showLegend ? 'flex flex-col sm:flex-row sm:items-center gap-4 min-w-0' : 'shrink-0'}>
      <div
        className="relative shrink-0 flex items-center justify-center mx-auto sm:mx-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={ariaLabel}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block overflow-visible"
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#EFE4D6"
            strokeWidth={strokeWidth}
          />

          {computedArcs.map(({ seg, start, end, isFullCircle }) => {
            const interactive = Boolean(seg.onClick);
            const titleText = `${seg.label}: ${toPersianDigits(seg.count)} ${unitLabel} (${toPersianDigits(
              seg.percent
            )}٪)`;

            if (isFullCircle) {
              return (
                <circle
                  key={seg.id}
                  data-testid={seg.testId ? `donut-slice-${seg.testId}` : undefined}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={titleText}
                  onClick={seg.onClick}
                  onKeyDown={(e) => {
                    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      seg.onClick?.();
                    }
                  }}
                  className={
                    interactive
                      ? 'cursor-pointer transition-opacity hover:opacity-85 focus:outline-none'
                      : undefined
                  }
                >
                  <title>{titleText}</title>
                </circle>
              );
            }

            // کوچک‌ترین زاویه قابل مشاهده اگر count > 0 اما خیلی کوچک بود
            const visualEnd = end - start < 3 ? Math.min(360, start + 3) : end;
            return (
              <path
                key={seg.id}
                data-testid={seg.testId ? `donut-slice-${seg.testId}` : undefined}
                d={describeArc(cx, cy, radius, start, visualEnd)}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={titleText}
                onClick={seg.onClick}
                onKeyDown={(e) => {
                  if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    seg.onClick?.();
                  }
                }}
                className={
                  interactive
                    ? 'cursor-pointer transition-opacity hover:opacity-80 focus:outline-none'
                    : undefined
                }
              >
                <title>{titleText}</title>
              </path>
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-1">
          <span className="text-base sm:text-lg font-bold text-[#332218] tabular-nums leading-none">
            {toPersianDigits(centerPercent)}٪
          </span>
          <span className="text-[10px] text-[#78604E] mt-1 leading-none">
            {centerLabel}
          </span>
          {centerSubValue && (
            <span className="text-[10px] font-semibold text-[#5C4636] tabular-nums mt-0.5 leading-none">
              {centerSubValue}
            </span>
          )}
        </div>
      </div>

      {showLegend && (
        <div className="flex-1 min-w-0 divide-y divide-[#EFE4D6] border-y border-[#EFE4D6] text-xs sm:text-sm tabular-nums">
          {segments.map((seg) => {
            const interactive = Boolean(seg.onClick);
            const Comp = interactive ? 'button' : 'div';
            return (
              <Comp
                key={seg.id}
                type={interactive ? 'button' : undefined}
                data-testid={seg.testId ? `donut-legend-${seg.testId}` : undefined}
                onClick={seg.onClick}
                className={`w-full py-2 px-2 flex items-center justify-between gap-2 text-right transition-colors ${
                  interactive
                    ? 'hover:bg-[#FAF5EE] active:bg-[#F3E4D2]/70 cursor-pointer group'
                    : ''
                }`}
              >
                <span className="flex items-center gap-2 text-[#5C4636] min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate group-hover:text-[#332218]">{seg.label}</span>
                </span>
                <span className="font-bold text-[#332218] shrink-0 inline-flex items-center gap-1">
                  <span>
                    {toPersianDigits(seg.count)} {unitLabel}{' '}
                    <span className="font-normal text-[#78604E]">
                      ({toPersianDigits(seg.percent)}٪)
                    </span>
                  </span>
                  {interactive && (
                    <ChevronLeft
                      className="w-3.5 h-3.5 text-[#9C826B] group-hover:text-[#6B3E26] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </Comp>
            );
          })}
        </div>
      )}
    </div>
  );
};
