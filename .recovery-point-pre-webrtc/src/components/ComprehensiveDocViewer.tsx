import React, { useMemo, useState, useRef } from 'react';
import {
  BookOpen,
  FileText,
  Download,
  Printer,
  Copy,
  Check,
  Search,
  X,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileCheck2,
  ArrowRight,
  BookMarked
} from 'lucide-react';
import comprehensiveMainDocRaw from '../../public/assets/aistudio/Paste_November_01__2026_-_12_18PM_fa153256?raw';
import technicalDocV02Raw from '../../public/assets/aistudio/_________-_________________________-20261015_bd46add9.md?raw';
import executiveAndCodingDocRaw from '../../public/assets/aistudio/Paste_November_01__2026_-_9_21AM_6393e765?raw';
import { toPersianDigits } from '../data/markazAsnadData';
import { ModalWindow } from './ModalWindow';

interface ComprehensiveDocViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (msg: string, type?: 'success' | 'warning') => void;
}

interface DocTabItem {
  id: 'main-23-chapters' | 'tech-v02' | 'coding-and-exec' | 'sooreh-mehr-recovery-report';
  title: string;
  subtitle: string;
  badge: string;
  content: string;
  fileName: string;
}

interface ParsedSection {
  id: string;
  title: string;
  level: number;
  lines: string[];
}

// Clean and normalize the 3 documents
function cleanExecutiveDoc(raw: string): string {
  // Remove PowerShell headers and convert FILE banners to proper markdown headings
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const cleaned: string[] = [];
  let skippingPs = true;

  for (const line of lines) {
    if (line.includes('================ FILE:')) {
      skippingPs = false;
      const fileMatch = line.match(/================ FILE:\s*\\?(.+?)\s*================/);
      const fileName = fileMatch ? fileMatch[1].replace(/\\/g, ' / ') : 'بخش اجرایی';
      cleaned.push('\n\n# ' + fileName + '\n');
      continue;
    }
    if (skippingPs && (line.startsWith('PS ') || line.startsWith('>>') || !line.trim())) {
      continue;
    }
    skippingPs = false;
    cleaned.push(line);
  }

  return cleaned.join('\n');
}

const SOOREH_MEHR_RECOVERY_REPORT_MD = `# گزارش بازیابی و ورود اطلاعات پژوهشی کتاب‌ها و شهدای مرتبط ـ منبع سوره مهر

## ۱. مشخصات فایل منبع و آرشیو پروژه
- **نام فایل مرجع**: لیست کتابهای و شهدای مرتبط.xlsx (و معادل کامل JSON پیوست‌شده)
- **نام شیت اصلی**: Sheet2 (از مجموع ۳ شیت؛ Sheet1 و Sheet3 خالی هستند)
- **سرستون‌های استاندارد شیت**: ردیف | انتشارات | عنوان کتاب | توضیحات | نام و نام خانوادگی شهید | قطعه | ردیف | شماره | شماره صفحه
- **مسیر آرشیو دائمی در پروژه**: /public/data/sooreh_mehr_book_martyr_research.json

## ۲. آمار دقیق ۸گانه استخراج‌شده از فایل واقعی
| شاخص آماری | مقدار دقیق در فایل سوره مهر | توضیحات کارشناسی |
| --- | --- | --- |
| ۱. تعداد کل ردیف‌های شیت | ۶۰۰ سطر با سرستون (۵۹۹ سطر داده + ۱ سرستون؛ ۶۰۲ سطر با ۲ سطر خالی انتهایی) | تمام ۵۹۹ سطر پژوهشی دارای عنوان کتاب و ناشر «سوره مهر» هستند |
| ۲. تعداد کتاب‌های یکتای فایل | ۴۱۳ کتاب یکتای سوره مهر (در قالب ۴۱۵ عنوان خام) | ۱۹۷ کتاب دارای ارتباط ثبت‌شده (۱۳۹ کتاب با نام شهید مشخص + ۵۸ کتاب دارای عبارت گروهی) و ۲۲۰ سطر دارای علامت * (۲۱۲ مورد) یا خالی (۸ مورد) |
| ۳. تعداد شهدای یکتای فایل | ۲۳۶ شهید یکتای نام‌برده | استخراج‌شده از ۳۰۳ رابطه فردی شهید (پس از حذف عبارات گروهی و علامت *) |
| ۴. تعداد کل ارتباط‌های کتاب و شهید | ۳۷۹ ارتباط معتبر (۳۰۳ ارتباط فردی با نام شهید + ۷۶ عبارت گروهی/جمعی) | در کنار ۲۳۷ ارتباط فایل «قطعات شهدا.xlsx»، مجموعاً ۶۱۶ ارتباط فعال (۸۳۶ سطر کل) در سامانه فعال است |
| ۵. تعداد کتاب‌های منطبق با مخزن کتاب‌ها | ۴۱۳ از ۴۱۳ کتاب سوره مهر (۱۰۰٪ منطبق با BK-0001 تا BK-0413) | ۴۰۵ کتاب با تطبیق مستقیم عنوان + ۸ کتاب با قواعد نرمال‌سازی، تفکیک جلد و رفع خطای کشیدن فرمول اکسل |
| ۶. تعداد کتاب‌های غیرمنطبق | ۰ کتاب در فایل سوره مهر (۸ عنوان پیش از نرمال‌سازی؛ ۱۶۵ عنوان در فایل دوم قطعات شهدا خارج از ۹۸۰ کتاب مخزن) | هر ۸ مورد اختلاف نگارشی/جلدی در فایل سوره مهر بدون تغییر خودسرانه عنوان رسمی کتاب به BK-0095 تا BK-0384 متصل شد |
| ۷. تعداد ارتباط‌های قطعی، احتمالی و نیازمند بررسی | ۱۹۰ قطعی | ۸۹ احتمالی (۳۴ تطبیق نام/قطعه در گلزار + ۵۵ شهید غیرتهرانی/جاویدالاثر/۷۲تن با کتاب و شرح کامل) | ۱۰۰ نیازمند بررسی کارشناس (۲۴ فردی دارای ابهام مزار/عنوان + ۷۶ عبارت گروهی) |
| ۸. تعداد موارد تکراری واقعی یا ظاهری | ۰ تکرار واقعی (۴۲ کتاب چندشهیدی دارای ۱۸۴ سطر تکرار ظاهری مجاز) | هر سطر تکرار ظاهری مربوط به یک شهید مستقل از همان کتاب است؛ تنها زوج هم‌نام «نیمکت های سوخته» مربوط به دو جلد مستقل BK-0383 و BK-0384 است |

## ۳. جدول تطبیق ۸ کتاب نرمال‌شده / ویژه در فایل سوره مهر
| عنوان در فایل پژوهشی سوره مهر | شناسه کتاب در مخزن (BK) | عنوان رسمی در مخزن ۹۸۰ کتاب | قاعده تطبیق و تصمیم کارشناسی |
| --- | --- | --- | --- |
| پاوه سرخ (۱۰ سطر شهید) | BK-0095 | تاریخ پاوه سرخ | تطبیق با حذف پیشوند «تاریخ»؛ حفظ عنوان منبع در فیلد عنوان جایگزین |
| سیزده در هفت (جلد اول) (۲ سطر شهید) | BK-0219 | سیزده در هفت | نگاشت جلد اول به رکورد اصلی BK-0219 با حفظ توضیح جلد اول |
| سیزده در هفت (جلد دوم) (۱ سطر شهید) | BK-0219 | سیزده در هفت | نگاشت جلد دوم به BK-0219 با حفظ «(جلد دوم)» در عنوان منبع |
| شاید پیش از اذان صبح | BK-0230 | شهید پیش از اذان صبح | تطبیق احتمالی (تایپی شاید/شهید) با حفظ وضعیت نیازمند بررسی کارشناس |
| لشکر نه (9) نفره | BK-0265 | لشکر نه نفره | حذف عدد داخل پرانتز (9) در نرمال‌سازی عنوان |
| فرکانس 1161، 1162، 1163 (۳ سطر شهید) | BK-0246 | فرکانس 1160 | رفع خطای Auto-Fill اکسل در ردیف‌های ۲۴۷ تا ۲۴۹ برای شهدای کتاب فرکانس ۱۱۶۰ |
| شلمچه در قاب (ردیف ۲۳۵ و ۲۳۶) | BK-0235 / BK-0236 | شلمچه در قاب | تفکیک دو رکورد هم‌نام مخزن بر اساس ترتیب ردیف اکسل (۲۳۵ و ۲۳۶) |
| نیمکت های سوخته (ردیف ۳۸۳ و ۳۸۴) | BK-0383 / BK-0384 | نیمکت های سوخته | تفکیک دو جلد/رکورد مستقل هم‌نام در مخزن بر اساس ردیف ۳۸۳ و ۳۸۴ |

## ۴. نمونه سناریوهای پذیرش و جست‌وجوی دوطرفه (تأییدشده در سامانه)
1. **کتاب «یک محسن عزیز» (BK-0410 — سوره مهر، «روایتی مستند از زندگی شهید محسن وزوایی»)**:
   - شهید **محسن وزوایی** (مزار در گلزار: محسن وزوائی golzar:27601، قطعه ۲۶، ردیف ۴۴، شماره ۴۶) — صفحه: «کل کتاب درباره این شهید بزرگوار است»
   - شهید **جعفر جنگروی** (مزار در گلزار: محمد جعفر جنگروی golzar:5552، قطعه ۲۶، ردیف ۹۲، شماره ۵۱) — صفحه: «147»
   - شهید **ابراهیم هادی** (golzar:139، قطعه ۲۶، ردیف ۵۲، شماره ۱) — صفحه: «147»
   - شهید **علیرضا موحد دانش** (golzar:19660، قطعه ۲۴، ردیف ۷۳، شماره ۲۰) — صفحه: «200تا260»
   - عبارت گروهی: «و چند شهید غیر تهرانی» (در صف بازبینی کارشناس برای تفکیک نام‌ها)
2. **کتاب «یادداشت های ناتمام» (BK-0407 — سوره مهر، «چهار خاطره»)**:
   - شهید **علی سمندریان** (golzar:18106، قطعه ۲۹، ردیف ۱۶، شماره ۱۴) — صفحه: «11تا51»
   - شهید **سید محمد شکری** (golzar:13339، قطعه ۲۶، ردیف ۲۴، شماره ۲۱) — صفحه: «85تا103»
`;

const DOC_TABS: DocTabItem[] = [
  {
    id: 'sooreh-mehr-recovery-report',
    title: 'گزارش بازیابی و ورود اطلاعات پژوهشی کتاب‌ها و شهدای مرتبط ـ منبع سوره مهر',
    subtitle: 'آمار دقیق ۸گانه شیت Sheet2، تطبیق ۴۱۳ کتاب سوره مهر و ۲۳۶ شهید یکتا، نرمال‌سازی عناوین و جست‌وجوی دوطرفه کتاب و شهید',
    badge: 'گزارش مأموریت سوره مهر',
    content: SOOREH_MEHR_RECOVERY_REPORT_MD,
    fileName: 'گزارش-بازیابی-پژوهش-سوره-مهر.md'
  },
  {
    id: 'main-23-chapters',
    title: 'سند جامع کتابخانه و پژوهش مرکز اسناد گلزار شهدای تهران',
    subtitle: 'مأموریت جامع طراحی، برنامه‌نویسی، کدگذاری قفسه‌ها، پژوهش شهدا، گزارش‌های ۱۶گانه و آزمون‌های پذیرش (۲۳ فصل کامل)',
    badge: 'سند جامع اصلی (۲۳ فصل)',
    content: comprehensiveMainDocRaw,
    fileName: 'سند-جامع-کتابخانه-مرکز-اسناد-گلزار-شهدا.md'
  },
  {
    id: 'tech-v02',
    title: 'سند فنی و مسیر توسعه مرکز اسناد گلزار شهدای تهران (نسخه ۰٫۲)',
    subtitle: 'معماری فنی، وضعیت داده‌های مرجع (۹۸۰ رکورد کتاب و ۲۰۸۵ رکورد شهید)، نقشه راه ۵ مرحله‌ای و تصمیم‌های فنی',
    badge: 'سند فنی نسخه ۰٫۲',
    content: technicalDocV02Raw,
    fileName: 'سند-فنی-و-مسیر-توسعه-مرکز-اسناد-نسخه-0.2.md'
  },
  {
    id: 'coding-and-exec',
    title: 'طرح اجرایی، قفسه‌بندی و کنترل تغییرات مرکز اسناد',
    subtitle: 'راهنمای اجرایی، الگوی مصوب قفسه‌ها (SH-01 تا SH-04)، شیوه‌نامه ثبت و دیدگاه‌های مدیریتی',
    badge: 'طرح کدگذاری و اجرایی',
    content: cleanExecutiveDoc(executiveAndCodingDocRaw),
    fileName: 'طرح-اجرایی-و-کدگذاری-کتابخانه-مرکز-اسناد.md'
  }
];

function parseMarkdownSections(markdown: string): ParsedSection[] {
  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection = {
    id: 'sec-intro',
    title: 'مقدمه و کلیات سند',
    level: 1,
    lines: []
  };

  rawLines.forEach((line, idx) => {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    if (h1Match || h2Match) {
      if (current.lines.length > 0 && current.lines.some((l) => l.trim().length > 0)) {
        sections.push(current);
      }
      const headingText = (h1Match ? h1Match[1] : h2Match![1]).trim();
      current = {
        id: `sec-${idx}`,
        title: headingText,
        level: h1Match ? 1 : 2,
        lines: [line]
      };
    } else {
      current.lines.push(line);
    }
  });

  if (current.lines.length > 0 && current.lines.some((l) => l.trim().length > 0)) {
    sections.push(current);
  }

  // If no sections were found (e.g. text without #), wrap whole content
  if (sections.length === 0) {
    sections.push({
      id: 'sec-full',
      title: 'متن کامل سند',
      level: 1,
      lines: rawLines
    });
  }

  return sections;
}

function renderFormattedLine(line: string, index: number, searchQuery: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return <div key={index} className="h-2" />;
  }

  const highlightText = (text: string): React.ReactNode => {
    const clean = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
    if (!searchQuery.trim()) return clean;
    const q = searchQuery.trim();
    const parts = clean.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 text-slate-950 px-1 rounded font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (trimmed === '---' || trimmed === '***') {
    return <hr key={index} className="my-4 border-[#E6D5C3]" />;
  }

  if (trimmed.startsWith('# ')) {
    return (
      <h2
        key={index}
        className="text-lg sm:text-xl font-titr font-bold text-[#8C3B2B] mt-5 mb-2 pb-2 border-b-2 border-[#E6D5C3]"
      >
        {highlightText(trimmed.slice(2))}
      </h2>
    );
  }

  if (trimmed.startsWith('## ')) {
    return (
      <h3
        key={index}
        className="text-base sm:text-lg font-titr font-bold text-[#8C3B2B] mt-5 mb-2 pb-1.5 border-b border-[#E6D5C3] flex items-center gap-2"
      >
        <span className="w-2 h-5 rounded-full bg-[#8C3B2B] shrink-0" />
        <span>{highlightText(trimmed.slice(3))}</span>
      </h3>
    );
  }

  if (trimmed.startsWith('### ')) {
    return (
      <h4 key={index} className="text-sm sm:text-base font-bold text-[#332218] mt-4 mb-1.5">
        {highlightText(trimmed.slice(4))}
      </h4>
    );
  }

  if (trimmed.startsWith('#### ')) {
    return (
      <h5 key={index} className="text-xs sm:text-sm font-bold text-[#9E5A24] mt-3 mb-1">
        {highlightText(trimmed.slice(5))}
      </h5>
    );
  }

  if (trimmed.startsWith('>')) {
    return (
      <blockquote
        key={index}
        className="my-2.5 pr-3.5 py-2 border-r-4 border-[#8C3B2B] bg-[#F5E6D3]/60 text-[#332218] text-xs sm:text-sm rounded-l-xl leading-relaxed"
      >
        {highlightText(trimmed.replace(/^>\s*/, ''))}
      </blockquote>
    );
  }

  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
      return null;
    }
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    return (
      <div
        key={index}
        className="grid gap-2 py-2 px-3 bg-[#FAF2E8] border border-[#E6D5C3] rounded-lg text-xs my-1 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, cells.length)}, minmax(110px, 1fr))` }}
      >
        {cells.map((cell, cIdx) => (
          <div key={cIdx} className="text-[#332218] font-medium break-words">
            {highlightText(cell)}
          </div>
        ))}
      </div>
    );
  }

  if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
    return (
      <div key={index} className="flex items-start gap-2 text-xs sm:text-sm text-[#332218] leading-relaxed pr-2 my-1">
        <span className="text-[#8C3B2B] font-bold mt-0.5 shrink-0">•</span>
        <div className="flex-1">{highlightText(trimmed.replace(/^([-*]|\d+[.)])\s+/, ''))}</div>
      </div>
    );
  }

  return (
    <p key={index} className="text-xs sm:text-sm text-[#332218] leading-7 my-1">
      {highlightText(trimmed)}
    </p>
  );
}

// Generates a fully formatted, beautifully styled A4 HTML page for PDF printing (no raw markdown)
function generateStyledPrintableHtml(title: string, subtitle: string, sections: ParsedSection[]): string {
  const sectionsHtml = sections
    .map((sec, idx) => {
      const renderedLines = sec.lines
        .map((l) => {
          const t = l.trim();
          if (!t) return '<div style="height: 8px;"></div>';
          if (t.startsWith('# ')) {
            return `<h1 style="color: #8C3B2B; font-size: 20px; border-bottom: 2px solid #8C3B2B; padding-bottom: 6px; margin-top: 24px;">${escapeHtml(t.slice(2))}</h1>`;
          }
          if (t.startsWith('## ')) {
            return `<h2 style="color: #8C3B2B; font-size: 16px; border-bottom: 1px solid #E6D5C3; padding-bottom: 4px; margin-top: 18px;">${escapeHtml(t.slice(3))}</h2>`;
          }
          if (t.startsWith('### ')) {
            return `<h3 style="color: #332218; font-size: 14px; margin-top: 14px;">${escapeHtml(t.slice(4))}</h3>`;
          }
          if (t.startsWith('>')) {
            return `<div style="border-right: 4px solid #8C3B2B; background: #F5E6D3; padding: 10px 14px; border-radius: 6px; margin: 10px 0; font-style: italic;">${escapeHtml(t.replace(/^>\s*/, ''))}</div>`;
          }
          if (t.startsWith('|') && t.endsWith('|')) {
            if (/^\|[\s\-:|]+\|$/.test(t)) return '';
            const cells = t.slice(1, -1).split('|').map((c) => c.trim());
            const cellsHtml = cells.map((c) => `<td style="border: 1px solid #E6D5C3; padding: 6px 10px;">${escapeHtml(c)}</td>`).join('');
            return `<table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; background: #FAF2E8;"><tr>${cellsHtml}</tr></table>`;
          }
          if (/^[-*]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
            const clean = t.replace(/^([-*]|\d+[.)])\s+/, '');
            return `<div style="display: flex; gap: 8px; margin: 4px 0; padding-right: 8px;"><span style="color: #8C3B2B; font-weight: bold;">•</span><div>${escapeHtml(clean)}</div></div>`;
          }
          return `<p style="margin: 6px 0; line-height: 1.8;">${escapeHtml(t)}</p>`;
        })
        .join('');

      return `
        <section style="margin-bottom: 30px; page-break-inside: avoid;">
          <div style="font-size: 11px; color: #8C3B2B; font-weight: bold;">بخش ${idx + 1} از ${sections.length}</div>
          ${renderedLines}
        </section>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} - نسخه چاپی PDF</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      background: #FDF8F2;
      color: #332218;
      line-height: 1.85;
      margin: 0;
      padding: 20px;
      direction: rtl;
    }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      border: 2px solid #8C3B2B;
      border-radius: 12px;
      padding: 28px 36px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .header {
      border-bottom: 3px double #8C3B2B;
      padding-bottom: 14px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .header-logo {
      font-size: 12px;
      font-weight: bold;
      color: #8C3B2B;
    }
    .title {
      font-size: 21px;
      font-weight: bold;
      color: #8C3B2B;
      margin: 4px 0;
    }
    .subtitle {
      font-size: 12.5px;
      color: #755C48;
      margin-top: 4px;
    }
    .print-btn {
      background: #8C3B2B;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-family: inherit;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: none; padding: 0; max-width: 100%; box-shadow: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="header-logo">جمهوری اسلامی ایران · مرکز اسناد گلزار شهدای تهران</div>
        <h1 class="title">${escapeHtml(title)}</h1>
        <div class="subtitle">${escapeHtml(subtitle)}</div>
      </div>
      <button class="print-btn no-print" onclick="window.print()">🖨️ چاپ یا ذخیره به عنوان PDF</button>
    </div>
    <div>${sectionsHtml}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ComprehensiveDocViewer: React.FC<ComprehensiveDocViewerProps> = ({
  isOpen,
  onClose,
  onNotify
}) => {
  const [selectedDocId, setSelectedDocId] = useState<DocTabItem['id']>('main-23-chapters');
  const [viewMode, setViewMode] = useState<'structured' | 'pdf-sheet'>('structured');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  const activeDoc = useMemo(
    () => DOC_TABS.find((d) => d.id === selectedDocId) || DOC_TABS[0],
    [selectedDocId]
  );

  const sections = useMemo(() => parseMarkdownSections(activeDoc.content), [activeDoc]);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sections.filter((sec) => {
      if (selectedSectionId !== 'ALL' && sec.id !== selectedSectionId) {
        return false;
      }
      if (!q) return true;
      return (
        sec.title.toLowerCase().includes(q) ||
        sec.lines.some((line) => line.toLowerCase().includes(q))
      );
    });
  }, [sections, selectedSectionId, searchQuery]);

  if (!isOpen) return null;

  const currentSectionIndex = sections.findIndex((s) => s.id === selectedSectionId);

  const handleSelectSection = (secId: string) => {
    setSelectedSectionId(secId);
    // Smooth scroll the content area to the top
    if (contentContainerRef.current) {
      contentContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGoNextSection = () => {
    if (currentSectionIndex >= 0 && currentSectionIndex < sections.length - 1) {
      handleSelectSection(sections[currentSectionIndex + 1].id);
    }
  };

  const handleGoPrevSection = () => {
    if (currentSectionIndex > 0) {
      handleSelectSection(sections[currentSectionIndex - 1].id);
    }
  };

  const handleCopyFullText = async () => {
    try {
      await navigator.clipboard.writeText(activeDoc.content);
      setCopied(true);
      onNotify?.(`متن کامل «${activeDoc.title}» در حافظه کپی شد.`);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onNotify?.('امکان کپی خودکار در این مرورگر فعال نیست؛ لطفاً از دکمه دانلود استفاده کنید.', 'warning');
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([activeDoc.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeDoc.fileName;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`فایل متنی «${activeDoc.fileName}» دانلود شد.`);
  };

  const handleDownloadPrintableHtmlPdf = () => {
    const html = generateStyledPrintableHtml(
      activeDoc.title,
      activeDoc.subtitle,
      selectedSectionId === 'ALL' ? sections : filteredSections
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeDoc.fileName.replace(/\.md$/, '-نسخه-چاپی-PDF.html');
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('نسخه صفحه‌آرایی‌شده قابل چاپ و تبدیل به PDF دانلود شد.');
  };

  const handlePrintPdf = () => {
    setViewMode('pdf-sheet');
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const selectedSectionObj = sections.find((s) => s.id === selectedSectionId);

  return (
    <ModalWindow
      onClose={onClose}
      title="سند جامع و مستندات مرجع مرکز اسناد گلزار شهدا"
      maxWidthClass="max-w-6xl"
      contentClassName="flex-1 flex flex-col overflow-hidden bg-[#FDF8F2]"
    >
      <div className="bg-[#FDF8F2] w-full flex-1 flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <div className="bg-[#8C3B2B] text-[#FDF8F2] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FDF8F2]/15 border border-[#FDF8F2]/30 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-[#FDF8F2]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-titr font-bold">
                  سند جامع و مستندات مرجع مرکز اسناد گلزار شهدا
                </h2>
                <span className="text-[11px] bg-[#FDF8F2] text-[#8C3B2B] font-extrabold px-2.5 py-0.5 rounded-lg">
                  {activeDoc.badge}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#F5E6D3] mt-0.5">
                متن کامل، ساختاریافته و نسخه قابل چاپ (PDF) اسناد مصوب کتابخانه، قفسه‌ها و پژوهش
              </p>
            </div>
          </div>
        </div>

        {/* Document Switcher & Action Bar */}
        <div className="bg-[#F5E6D3] border-b border-[#E6D5C3] px-4 sm:px-6 py-3 space-y-3 shrink-0">
          {/* Document Selector Tabs (3 Options) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {DOC_TABS.map((doc) => {
              const isSelected = doc.id === selectedDocId;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocId(doc.id);
                    setSelectedSectionId('ALL');
                  }}
                  className={`p-2.5 rounded-xl text-right border transition-all flex items-start gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#8C3B2B] text-[#FDF8F2] border-[#702D20] shadow-xs'
                      : 'bg-[#FDF8F2] text-[#332218] border-[#E6D5C1] hover:bg-white'
                  }`}
                >
                  <FileCheck2
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      isSelected ? 'text-[#F5E6D3]' : 'text-[#8C3B2B]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{doc.title}</div>
                    <div
                      className={`text-[10px] mt-0.5 line-clamp-1 ${
                        isSelected ? 'text-[#F5E6D3]' : 'text-[#755C48]'
                      }`}
                    >
                      {doc.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search, View Mode & Export/PDF Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Search Box */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#755C48] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جست‌وجو در متن سند (مثلاً: SH-01، گزارش، آزمون، شهید، اکسل...)"
                className="w-full pr-9 pl-8 py-2 bg-white border border-[#E6D5C1] rounded-xl text-xs text-[#332218] focus:outline-hidden focus:border-[#8C3B2B]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Display Mode Toggle */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E6D5C1] text-xs">
              <button
                type="button"
                onClick={() => setViewMode('structured')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  viewMode === 'structured'
                    ? 'bg-[#8C3B2B] text-white'
                    : 'text-[#332218] hover:bg-slate-100'
                }`}
              >
                نمای فصول سند
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pdf-sheet')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  viewMode === 'pdf-sheet'
                    ? 'bg-[#8C3B2B] text-white'
                    : 'text-[#332218] hover:bg-slate-100'
                }`}
              >
                نمای صفحه‌آرایی چاپی (A4)
              </button>
            </div>

            {/* Export / Print Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrintPdf}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#8C3B2B] hover:bg-[#702D20] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>چاپ / ذخیره PDF</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPrintableHtmlPdf}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#9E5A24] hover:bg-[#83491C] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>دانلود فایل چاپی PDF</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#332218] border border-[#E6D5C1] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#8C3B2B]" />
                <span>دانلود فایل متنی (.md)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyFullText}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#332218] border border-[#E6D5C1] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="text-emerald-800">کپی شد</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#8C3B2B]" />
                    <span>کپی کل متن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Main Viewer Body */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Right Sidebar: Table of Contents */}
          <aside className="w-full lg:w-80 bg-[#FAF2E8] border-b lg:border-b-0 lg:border-l border-[#E6D5C3] p-3 overflow-y-auto shrink-0 max-h-48 lg:max-h-none">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#332218]">
                <ListFilter className="w-4 h-4 text-[#8C3B2B]" />
                <span>فهرست فصول ({toPersianDigits(sections.length)} فصل)</span>
              </div>
              {selectedSectionId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => handleSelectSection('ALL')}
                  className="text-[11px] font-bold text-[#8C3B2B] hover:underline"
                >
                  نمایش همه
                </button>
              )}
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleSelectSection('ALL')}
                className={`w-full text-right px-2.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  selectedSectionId === 'ALL'
                    ? 'bg-[#8C3B2B] text-white shadow-xs'
                    : 'text-[#332218] hover:bg-[#F0E0CD]'
                }`}
              >
                <span>نمایش پیوسته تمام فصول سند</span>
                <span className="text-[10px] opacity-85 tabular-nums">
                  {toPersianDigits(sections.length)} فصل
                </span>
              </button>

              {sections.map((sec, idx) => {
                const active = selectedSectionId === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleSelectSection(sec.id)}
                    className={`w-full text-right px-2.5 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-[#8C3B2B] text-white font-bold shadow-xs'
                        : 'text-[#332218] hover:bg-[#F0E0CD] font-medium'
                    }`}
                  >
                    <span className="text-[10px] opacity-80 shrink-0 tabular-nums">
                      {toPersianDigits(idx + 1)}.
                    </span>
                    <span className="truncate flex-1">{sec.title}</span>
                    <ChevronLeft className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Document Content Container */}
          <div ref={contentContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FDF8F2]">
            {viewMode === 'structured' ? (
              <div className="max-w-4xl mx-auto space-y-4">
                {/* Active Reading Header / Navigation Banner */}
                {selectedSectionId !== 'ALL' && selectedSectionObj ? (
                  <div className="bg-[#F5E6D3] border-2 border-[#8C3B2B] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <BookMarked className="w-5 h-5 text-[#8C3B2B] shrink-0" />
                      <div>
                        <div className="text-[11px] text-[#755C48]">
                          فصل {toPersianDigits(currentSectionIndex + 1)} از {toPersianDigits(sections.length)}:
                        </div>
                        <div className="text-sm font-titr font-bold text-[#8C3B2B]">
                          {selectedSectionObj.title}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGoPrevSection}
                        disabled={currentSectionIndex <= 0}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E6D5C1] text-xs font-bold text-[#332218] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span>فصل قبلی</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectSection('ALL')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#8C3B2B] text-white text-xs font-bold cursor-pointer"
                      >
                        مشاهده همه فصول
                      </button>
                      <button
                        type="button"
                        onClick={handleGoNextSection}
                        disabled={currentSectionIndex >= sections.length - 1}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E6D5C1] text-xs font-bold text-[#332218] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>فصل بعدی</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-[#E6D5C1] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-[#8C3B2B] shrink-0" />
                      <div>
                        <div className="text-xs sm:text-sm font-titr font-bold text-[#332218]">
                          {activeDoc.title}
                        </div>
                        <div className="text-[11px] text-[#755C48] mt-0.5">
                          {activeDoc.subtitle}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] font-bold text-[#8C3B2B] bg-[#F5E6D3] px-3 py-1 rounded-lg border border-[#E6D5C1]">
                      تعداد فصول: {toPersianDigits(sections.length)} فصل کامل
                    </div>
                  </div>
                )}

                {filteredSections.length === 0 ? (
                  <div className="bg-white border border-[#E6D5C1] rounded-2xl p-8 text-center space-y-2">
                    <p className="text-sm font-bold text-[#332218]">
                      موردی مطابق عبارت «{searchQuery}» در این بخش یافت نشد.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedSectionId('ALL');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#8C3B2B] text-white text-xs font-bold cursor-pointer"
                    >
                      پاک کردن فیلتر جست‌وجو
                    </button>
                  </div>
                ) : (
                  filteredSections.map((section, sIdx) => (
                    <section
                      key={section.id}
                      id={section.id}
                      className="bg-white border border-[#E6D5C1] rounded-2xl p-5 sm:p-7 shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-[#E6D5C1]">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#8C3B2B]" />
                          <h2 className="text-base sm:text-lg font-titr font-bold text-[#8C3B2B]">
                            {section.title}
                          </h2>
                        </div>
                        <span className="text-[11px] text-[#755C48] tabular-nums">
                          بخش {toPersianDigits(sIdx + 1)}
                        </span>
                      </div>

                      <div className="space-y-1 pt-2">
                        {section.lines.map((line, lIdx) =>
                          renderFormattedLine(line, lIdx, searchQuery)
                        )}
                      </div>

                      {/* Section Footer with Next/Prev buttons when reading single chapter */}
                      {selectedSectionId !== 'ALL' && (
                        <div className="pt-4 mt-6 border-t border-[#E6D5C1] flex items-center justify-between">
                          <button
                            type="button"
                            onClick={handleGoPrevSection}
                            disabled={currentSectionIndex <= 0}
                            className="px-3 py-1.5 rounded-xl bg-[#F5E6D3] text-[#8C3B2B] text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                            <span>فصل قبلی</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectSection('ALL')}
                            className="text-xs text-[#755C48] hover:text-[#8C3B2B] font-bold"
                          >
                            بازگشت به فهرست کامل فصول
                          </button>
                          <button
                            type="button"
                            onClick={handleGoNextSection}
                            disabled={currentSectionIndex >= sections.length - 1}
                            className="px-3 py-1.5 rounded-xl bg-[#8C3B2B] text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>فصل بعدی</span>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </section>
                  ))
                )}
              </div>
            ) : (
              /* PDF Sheet / A4 Printable View */
              <div className="max-w-[210mm] mx-auto bg-white border-2 border-[#8C3B2B] rounded-xl shadow-lg p-6 sm:p-10 space-y-6 print:border-0 print:shadow-none print:p-0">
                <div className="border-b-4 border-double border-[#8C3B2B] pb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-[#8C3B2B]">
                      بسمه تعالی · مرکز اسناد گلزار شهدای تهران
                    </div>
                    <h1 className="text-lg sm:text-xl font-titr font-bold text-[#332218] mt-1">
                      {activeDoc.title}
                    </h1>
                    <p className="text-xs text-[#755C48] mt-1">{activeDoc.subtitle}</p>
                  </div>
                  <div className="text-left text-[11px] text-[#755C48] bg-[#FDF8F2] border border-[#E6D5C1] rounded-xl px-3 py-2">
                    <div>وضعیت سند: مصوب و مرجع اجرا</div>
                    <div>تعداد کل فصول: {toPersianDigits(sections.length)} بخش</div>
                  </div>
                </div>

                <div className="space-y-6">
                  {filteredSections.map((section, sIdx) => (
                    <div key={section.id} className="pb-6 border-b border-[#E6D5C1] last:border-b-0">
                      <div className="text-xs text-[#8C3B2B] font-bold mb-1">
                        فصل {toPersianDigits(sIdx + 1)}:
                      </div>
                      <h2 className="text-base font-titr font-bold text-[#8C3B2B] mb-3">
                        {section.title}
                      </h2>
                      <div className="space-y-1">
                        {section.lines.map((line, lIdx) =>
                          renderFormattedLine(line, lIdx, searchQuery)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalWindow>
  );
};
