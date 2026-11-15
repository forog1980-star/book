import './index-BSaCAbhS.js';

(function initLiveArchivalAndCategoryPatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const toFa = (val) =>
    String(val ?? '').replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] || d);

  const OFFICIAL_CATEGORIES = [
    {
      code: 'R',
      name: 'R — روایت و خاطرات',
      shortTitle: 'روایت و خاطرات',
      baselineCount: 580,
      allocatedLocationText: 'SH-01 و SH-02 (همه طبقات T01 تا T06)',
      color: '#15803D',
    },
    {
      code: 'M',
      name: 'M — متفرقه',
      shortTitle: 'متفرقه و متنوع',
      baselineCount: 121,
      allocatedLocationText: 'SH-03-T05 و SH-03-T06 (طبقات ۵ و ۶)',
      color: '#1D4ED8',
    },
    {
      code: 'A',
      name: 'A — ادبیات و هنر',
      shortTitle: 'ادبیات و هنر',
      baselineCount: 76,
      allocatedLocationText: 'SH-03-T02 (قفسه ۳، طبقه ۲ از بالا)',
      color: '#B91C1C',
    },
    {
      code: 'P',
      name: 'P — پژوهش و تحلیل',
      shortTitle: 'پژوهش و تحلیل',
      baselineCount: 69,
      allocatedLocationText: 'SH-03-T03 و SH-03-T04 (طبقات ۳ و ۴)',
      color: '#D97706',
    },
    {
      code: 'H',
      name: 'H — تاریخ و اسناد',
      shortTitle: 'تاریخ و اسناد',
      baselineCount: 60,
      allocatedLocationText: 'SH-03-T01 (قفسه ۳، طبقه ۱ از بالا)',
      color: '#6D28D9',
    },
    {
      code: 'K',
      name: 'K — کودک و نوجوان',
      shortTitle: 'کودک و نوجوان',
      baselineCount: 36,
      allocatedLocationText: 'SH-04-T01 (قفسه ۴، طبقه ۱ از بالا)',
      color: '#0F766E',
    },
  ];

  // ۱. اعمال پالت رنگی آرشیوی و رنگ‌های پررنگ قرمز/آبی/سبز نمودارهای دونات در کل برنامه
  function injectArchivalPaletteStyles() {
    if (document.getElementById('markaz-v17-archival-styles')) return;
    const style = document.createElement('style');
    style.id = 'markaz-v17-archival-styles';
    style.textContent = `
      body {
        background-color: #C8BD9B !important;
        color: #353530 !important;
      }
      [data-testid="executive-overview-screen"],
      [data-testid="executive-statistics-route-view"] {
        background-color: #F0EBD9 !important;
        color: #353530 !important;
        border-radius: 1rem;
      }
      [data-testid="comprehensive-docx-report-banner"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ۲. به‌روزرسانی رنگ‌های نمودار دونات موجود به سبز، آبی و قرمز پررنگ
  function upgradeDonutColorsInDom() {
    const colorMap = {
      '#2E6F40': '#15803D',
      '#2e6f40': '#15803D',
      '#B76E22': '#1D4ED8',
      '#b76e22': '#1D4ED8',
      '#A63A3A': '#B91C1C',
      '#a63a3a': '#B91C1C',
    };
    document.querySelectorAll('svg circle[stroke]').forEach((circle) => {
      const s = circle.getAttribute('stroke');
      if (s && colorMap[s]) {
        circle.setAttribute('stroke', colorMap[s]);
      }
    });
    document.querySelectorAll('span[style*="background-color"]').forEach((span) => {
      const bg = span.style.backgroundColor;
      if (bg === 'rgb(46, 111, 64)') span.style.backgroundColor = '#15803D';
      if (bg === 'rgb(183, 110, 34)') span.style.backgroundColor = '#1D4ED8';
      if (bg === 'rgb(166, 58, 58)') span.style.backgroundColor = '#B91C1C';
    });
  }

  // ۳. خواندن زنده رکوردهای ممیزی و نسخه‌های فیزیکی از حافظه محلی دستگاه
  function readLiveAuditData() {
    let auditRecords = {};
    let bookCopies = [];
    try {
      const rawAudit =
        localStorage.getItem('book_library_audit_v1') ||
        localStorage.getItem('shohada_markaz_asnad_library_audit_v1');
      if (rawAudit) {
        const parsed = JSON.parse(rawAudit);
        if (parsed && typeof parsed === 'object') auditRecords = parsed;
      }
    } catch {}
    try {
      const rawCopies =
        localStorage.getItem('book_copies_v1') ||
        localStorage.getItem('shohada_markaz_asnad_book_copies_v1');
      if (rawCopies) {
        const parsed = JSON.parse(rawCopies);
        if (Array.isArray(parsed)) bookCopies = parsed;
      }
    } catch {}
    return { auditRecords, bookCopies };
  }

  function resolveRecordCategoryCode(rec, copyMap) {
    const raw = String(rec?.category || rec?.subjectCategory || '').trim();
    if (raw && raw !== '—' && raw !== 'ثبت نشده' && raw !== 'UNSET' && raw !== 'نامشخص') {
      const firstToken = raw.split(/[\s—\-ـ:،/]+/)[0]?.toUpperCase();
      if (['R', 'P', 'H', 'A', 'K', 'M'].includes(firstToken)) return firstToken;
      if (raw.includes('روایت') || raw.includes('خاطرات') || raw.includes('خاطره')) return 'R';
      if (raw.includes('پژوهش') || raw.includes('تحلیل')) return 'P';
      if (raw.includes('تاریخ') || raw.includes('اسناد')) return 'H';
      if (raw.includes('ادبیات') || raw.includes('هنر') || raw.includes('شعر')) return 'A';
      if (raw.includes('کودک') || raw.includes('نوجوان')) return 'K';
      if (raw.includes('متفرقه') || raw.includes('متنوع')) return 'M';
    }
    const tid = String(rec?.tempBookId || '').trim();
    const cp = tid ? copyMap.get(tid) : null;
    const loc = String(rec?.location || cp?.location || '').trim().toUpperCase();
    const shelf = String(rec?.shelf || cp?.shelf || (loc.startsWith('SH-') ? loc.slice(0, 5) : ''))
      .trim()
      .toUpperCase();
    const level = String(
      rec?.level || cp?.level || (loc.includes('-T') ? 'T' + loc.split('-T').pop().slice(0, 2) : '')
    )
      .trim()
      .toUpperCase();

    if (shelf === 'SH-01' || shelf === 'SH-02') return 'R';
    if (shelf === 'SH-03') {
      if (level === 'T01') return 'H';
      if (level === 'T02') return 'A';
      if (level === 'T03' || level === 'T04') return 'P';
      return 'M';
    }
    if (shelf === 'SH-04' && level === 'T01') return 'K';
    return 'UNSET';
  }

  let currentMode = 'live_collection';
  let selectedCatCode = null;

  function computeCategoryStats() {
    const { auditRecords, bookCopies } = readLiveAuditData();
    const copyMap = new Map();
    for (const cp of bookCopies) {
      if (cp && cp.bookId) copyMap.set(String(cp.bookId).trim(), cp);
    }

    const auditedCounts = { R: 0, M: 0, A: 0, P: 0, H: 0, K: 0, UNSET: 0 };
    const outsideCounts = { R: 0, M: 0, A: 0, P: 0, H: 0, K: 0, UNSET: 0 };
    const booksByCode = { R: [], M: [], A: [], P: [], H: [], K: [], UNSET: [] };

    const recordsList = Object.values(auditRecords || {});
    let outsideTotal = 0;

    for (const rec of recordsList) {
      if (!rec || typeof rec !== 'object') continue;
      const code = resolveRecordCategoryCode(rec, copyMap);
      auditedCounts[code] = (auditedCounts[code] || 0) + 1;
      if (rec.source === 'outside-list') {
        outsideCounts[code] = (outsideCounts[code] || 0) + 1;
        outsideTotal += 1;
      }
      if (booksByCode[code]) {
        booksByCode[code].push({
          tempBookId: rec.tempBookId || rec.key || 'BK',
          title: rec.title || 'کتاب ثبت‌شده در ممیزی',
          publisher: rec.publisher || 'ناشر ثبت‌شده',
          locationDisplay: rec.location || (rec.shelf && rec.level ? `${rec.shelf}-${rec.level}` : ''),
        });
      }
    }

    const totalBooks = 980 + outsideTotal;
    const explicitAssignedCount =
      auditedCounts.R +
      auditedCounts.M +
      auditedCounts.A +
      auditedCounts.P +
      auditedCounts.H +
      auditedCounts.K;

    const useBaseline = currentMode === 'live_collection';
    let assignedSum = 0;
    const items = OFFICIAL_CATEGORIES.map((meta) => {
      const audCnt = auditedCounts[meta.code] || 0;
      const outCnt = outsideCounts[meta.code] || 0;
      const val = useBaseline ? Math.max(meta.baselineCount + outCnt, audCnt) : audCnt;
      assignedSum += val;
      return {
        ...meta,
        value: val,
        auditedCount: audCnt,
        percent: totalBooks > 0 ? Math.round((val / totalBooks) * 1000) / 10 : 0,
      };
    });

    const unsetVal = useBaseline
      ? Math.max(0, totalBooks - assignedSum)
      : Math.max(0, totalBooks - explicitAssignedCount);

    items.push({
      code: 'UNSET',
      name: 'تعیین‌نشده / در انتظار تخصیص',
      shortTitle: 'در انتظار تعیین گروه موضوعی',
      baselineCount: 38,
      allocatedLocationText: 'تطبیق رکوردبه‌رکورد در ممیزی قفسه',
      color: '#64748B',
      value: unsetVal,
      auditedCount: auditedCounts.UNSET || 0,
      percent: totalBooks > 0 ? Math.round((unsetVal / totalBooks) * 1000) / 10 : 0,
    });

    const totalCategorizedCount = Math.max(0, totalBooks - unsetVal);
    const categorizedPercent = totalBooks > 0 ? Math.round((totalCategorizedCount / totalBooks) * 100) : 0;

    return {
      items,
      totalBooks,
      totalCategorizedCount,
      categorizedPercent,
      explicitAssignedCount,
      booksByCode,
    };
  }

  function renderCategoryDonutPanel(container) {
    const stats = computeCategoryStats();
    const size = 220;
    const strokeWidth = 30;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const totalVal = stats.items.reduce((acc, it) => acc + it.value, 0) || 1;

    let cumulativeLength = 0;
    const circlesHtml = stats.items
      .filter((it) => it.value > 0)
      .map((it) => {
        const segLen = (it.value / totalVal) * circumference;
        const dashArray = `${Math.max(0, segLen - 2)} ${circumference}`;
        const dashOffset = -cumulativeLength;
        cumulativeLength += segLen;
        return `<circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="transparent"
          stroke="${it.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${dashArray}"
          stroke-dashoffset="${dashOffset}"
          data-cat-slice="${it.code}"
          style="cursor:pointer; transition: opacity 0.2s;"
        ><title>${it.name}: ${toFa(it.value)} کتاب (${toFa(it.percent)}٪)</title></circle>`;
      })
      .join('');

    const rowsHtml = stats.items
      .map((cat) => {
        const isSelected = selectedCatCode === cat.code;
        return `<button
          type="button"
          data-cat-row="${cat.code}"
          data-testid="category-slice-row-${cat.code}"
          class="w-full text-right rounded-xl border p-2.5 sm:p-3 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            isSelected
              ? 'bg-white border-[#6B3E26] ring-1 ring-[#6B3E26]'
              : 'bg-[#FBF8EC] border-[#D8D1BB] hover:bg-white'
          }"
        >
          <div class="flex items-start sm:items-center gap-2.5 min-w-0">
            <span class="w-3.5 h-3.5 rounded-sm shrink-0 mt-1 sm:mt-0" style="background-color:${cat.color}"></span>
            <div class="min-w-0">
              <div class="text-xs sm:text-sm font-bold text-[#332218] truncate">${cat.name}</div>
              <div class="text-[11px] text-[#78604E] truncate">جانمایی: ${cat.allocatedLocationText} · ثبت تفکیکی پرونده: ${toFa(cat.auditedCount)} کتاب</div>
            </div>
          </div>
          <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#EFE4D6]">
            <span class="text-xs font-extrabold text-[#332218]">${toFa(cat.value)} کتاب</span>
            <span class="min-w-[48px] text-center px-2 py-0.5 rounded-md text-[11px] font-bold text-white" style="background-color:${cat.color}">${toFa(cat.percent)}٪</span>
          </div>
        </button>`;
      })
      .join('');

    let previewHtml = '';
    if (selectedCatCode) {
      const list = stats.booksByCode[selectedCatCode] || [];
      const itemsListHtml =
        list.length === 0
          ? `<p class="text-[#5C4636]">در حال حاضر سهم این گروه بر پایه شمارش فیزیکی قفسه‌ها در شیت «توضیحات دسته» نمایش داده شده است. با ثبت قفسه یا گروه موضوعی برای هر کتاب در بخش «کتابخانه»، نام آن کتاب به‌صورت زنده در این فهرست قرار می‌گیرد.</p>`
          : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${list
              .slice(0, 8)
              .map(
                (b) => `<div class="rounded-lg bg-white border border-[#E5D7C6] px-3 py-2 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-bold text-[#332218] truncate">${b.title}</div>
                    <div class="text-[11px] text-[#78604E] truncate">${b.tempBookId} · ${b.publisher}</div>
                  </div>
                  ${
                    b.locationDisplay
                      ? `<span class="px-2 py-0.5 rounded bg-[#F0EBD9] text-[10px] font-mono text-[#332218] shrink-0">${b.locationDisplay}</span>`
                      : ''
                  }
                </div>`
              )
              .join('')}</div>`;

      previewHtml = `<div data-testid="selected-category-books-preview" class="rounded-xl bg-[#FBF8EC] border border-[#6B3E26]/40 p-3.5 space-y-2.5 text-xs">
        <div class="flex items-center justify-between gap-2 border-b border-[#D8D1BB] pb-2">
          <strong class="text-[#6B3E26]">پرونده‌های دارای ثبت تفکیکی در گروه انتخاب‌شده (${toFa(list.length)} پرونده)</strong>
          <button type="button" data-close-cat-preview="1" class="text-[11px] text-[#78604E] hover:text-[#332218] cursor-pointer">بستن ✕</button>
        </div>
        ${itemsListHtml}
      </div>`;
    }

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#D8D1BB] pb-3">
        <div class="space-y-1">
          <div class="inline-flex items-center gap-2 text-xs font-bold text-[#6B3E26]">
            <span>نمودار دونات زنده گروه‌های موضوعی (Categories)</span>
            <span class="px-2 py-0.5 rounded-md bg-[#FBF8EC] border border-[#D8D1BB] text-[11px] text-[#353530]">به‌روزرسانی آنی با تغییرات کتابخانه</span>
          </div>
          <p class="text-xs text-[#5C4636]">پراکندگی زنده کتاب‌ها در ۶ گروه موضوعی استاندارد مرکز اسناد (R، M، A، P، H، K) و پرونده‌های در انتظار تخصیص قفسه</p>
        </div>
        <div class="inline-flex rounded-lg bg-[#FBF8EC] border border-[#D8D1BB] p-1 text-[11px] self-start md:self-auto shrink-0">
          <button type="button" data-cat-mode="live_collection" class="px-2.5 py-1.5 rounded-md font-bold transition-colors cursor-pointer ${
            currentMode === 'live_collection' ? 'bg-[#6B3E26] text-white' : 'text-[#5C4636] hover:text-[#332218]'
          }">نمای تجمیعی زنده مجموعه</button>
          <button type="button" data-cat-mode="audited_records" class="px-2.5 py-1.5 rounded-md font-bold transition-colors cursor-pointer ${
            currentMode === 'audited_records' ? 'bg-[#6B3E26] text-white' : 'text-[#5C4636] hover:text-[#332218]'
          }">صرفاً ثبت‌های تفکیکی پرونده‌ها (${toFa(stats.explicitAssignedCount)})</button>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div class="lg:col-span-5 flex flex-col items-center justify-center bg-[#FBF8EC] border border-[#D8D1BB] rounded-xl p-4">
          <div class="relative flex items-center justify-center" style="width:${size}px;height:${size}px;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="-rotate-90 transform">
              <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="#E5DEC9" stroke-width="${strokeWidth}"></circle>
              ${circlesHtml}
            </svg>
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <span class="text-[11px] font-medium text-[#78604E]">تعیین‌گروه‌شده</span>
              <strong class="text-xl font-extrabold text-[#332218] tabular-nums leading-tight mt-0.5">${toFa(stats.categorizedPercent)}٪</strong>
              <span class="text-[11px] text-[#5C4636] tabular-nums mt-0.5">${toFa(stats.totalCategorizedCount)} از ${toFa(stats.totalBooks)} کتاب</span>
            </div>
          </div>
          <div class="mt-2 text-[11px] text-[#5C4636] text-center">با اشاره یا کلیک روی هر بخش، جزئیات و فهرست کتاب‌های همان گروه موضوعی نمایش داده می‌شود.</div>
        </div>
        <div class="lg:col-span-7 space-y-2 tabular-nums">${rowsHtml}</div>
      </div>
      ${previewHtml}
    `;

    container.querySelectorAll('[data-cat-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentMode = btn.getAttribute('data-cat-mode') || 'live_collection';
        renderCategoryDonutPanel(container);
      });
    });
    container.querySelectorAll('[data-cat-row], [data-cat-slice]').forEach((el) => {
      el.addEventListener('click', () => {
        const code = el.getAttribute('data-cat-row') || el.getAttribute('data-cat-slice');
        selectedCatCode = selectedCatCode === code ? null : code;
        renderCategoryDonutPanel(container);
      });
    });
    const closeBtn = container.querySelector('[data-close-cat-preview]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        selectedCatCode = null;
        renderCategoryDonutPanel(container);
      });
    }
  }

  function ensureCategoryDonutMounted() {
    const libSection = document.getElementById('stats-section-library');
    if (!libSection) return;
    if (libSection.querySelector('[data-testid="statistics-library-categories-donut"]')) return;

    const panel = document.createElement('div');
    panel.setAttribute('data-testid', 'statistics-library-categories-donut');
    panel.className = 'rounded-xl bg-[#F0EBD9] border border-[#D8D1BB] p-4 sm:p-5 space-y-4';

    const children = Array.from(libSection.children);
    if (children.length >= 2) {
      children[1].insertAdjacentElement('afterend', panel);
    } else {
      libSection.appendChild(panel);
    }
    renderCategoryDonutPanel(panel);
  }

  function tick() {
    injectArchivalPaletteStyles();
    upgradeDonutColorsInDom();
    ensureCategoryDonutMounted();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }

  const observer = new MutationObserver(() => {
    tick();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
