/**
 * موتور تولید مستقیم فایل استاندارد PDF (بدون window.print و بدون عکس‌گرفتن از صفحه مرورگر)
 * - رندر برداری روی بوم A4 با فونت Vazirmatn و چیدمان کاملاً راست‌به‌چپ (RTL)
 * - تفکیک صفحه‌بندی مستقل برای هر بخش انتخاب‌شده (کتابخانه / شهدا و ارتباطات / وضعیت کار و خروجی‌ها)
 * - تولید باینری استاندارد PDF 1.4 با جدول XRef دقیق و دانلود مستقیم فایل .pdf
 */

export interface PdfMetricCard {
  label: string;
  value: string;
  hint?: string;
}

export interface PdfReportTable {
  title?: string;
  headers: string[];
  rows: string[][];
  colWidthsRatio?: number[];
}

export interface PdfReportSection {
  id: string;
  title: string;
  subtitle?: string;
  metrics?: PdfMetricCard[];
  table?: PdfReportTable;
  bullets?: string[];
  notes?: string[];
}

export interface PdfReportDocumentInput {
  fileName: string;
  docTitle: string;
  issuedAtDisplay: string;
  sections: PdfReportSection[];
}

const PAGE_W_PX = 1240; // A4 @ 150 DPI
const PAGE_H_PX = 1754;
const MARGIN_X = 72;
const CONTENT_W = PAGE_W_PX - MARGIN_X * 2;
const HEADER_BOTTOM_Y = 148;
const FOOTER_TOP_Y = PAGE_H_PX - 82;
const MAX_BODY_Y = FOOTER_TOP_Y - 26;

const FONT_FAMILY = 'Vazirmatn, Tahoma, Arial, sans-serif';

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        // شکستن کلمه یا کد بسیار طولانی
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle: string,
  strokeStyle?: string,
  lineWidth = 1.5
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPageFrame(
  ctx: CanvasRenderingContext2D,
  docTitle: string,
  issuedAtDisplay: string,
  sectionTitle: string
): number {
  // پس‌زمینه سفید یکدست
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX);

  // نوار سرصفحه بالا
  ctx.fillStyle = '#FAF5EE';
  ctx.fillRect(0, 0, PAGE_W_PX, 128);

  ctx.fillStyle = '#6B3E26';
  ctx.fillRect(0, 0, PAGE_W_PX, 10);

  ctx.strokeStyle = '#DFD1BF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, 128);
  ctx.lineTo(PAGE_W_PX - MARGIN_X, 128);
  ctx.stroke();

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  // نام سازمان (سمت راست)
  ctx.fillStyle = '#6B3E26';
  ctx.font = `bold 21px ${FONT_FAMILY}`;
  ctx.fillText('مرکز اسناد و کتابخانه گلزار شهدای تهران', PAGE_W_PX - MARGIN_X, 26);

  // عنوان گزارش
  ctx.fillStyle = '#332218';
  ctx.font = `bold 24px ${FONT_FAMILY}`;
  const titleTruncated =
    docTitle.length > 74 ? `${docTitle.slice(0, 71)}...` : docTitle;
  ctx.fillText(titleTruncated, PAGE_W_PX - MARGIN_X, 58);

  // تاریخ صدور + نام بخش (سمت چپ)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#78604E';
  ctx.font = `600 17px ${FONT_FAMILY}`;
  ctx.fillText(`تاریخ صدور: ${issuedAtDisplay}`, MARGIN_X, 28);
  ctx.fillStyle = '#332218';
  ctx.font = `bold 18px ${FONT_FAMILY}`;
  const secTrunc =
    sectionTitle.length > 42 ? `${sectionTitle.slice(0, 39)}...` : sectionTitle;
  ctx.fillText(secTrunc, MARGIN_X, 60);

  ctx.restore();

  return HEADER_BOTTOM_Y;
}

function drawFooter(
  canvas: HTMLCanvasElement,
  pageNumber: number,
  totalPages: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.strokeStyle = '#E5D7C6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, FOOTER_TOP_Y);
  ctx.lineTo(PAGE_W_PX - MARGIN_X, FOOTER_TOP_Y);
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'right';
  ctx.fillStyle = '#78604E';
  ctx.font = `500 17px ${FONT_FAMILY}`;
  ctx.fillText(
    'گزارش رسمی تولیدشده از داده‌های زنده مرکز اسناد گلزار شهدای تهران',
    PAGE_W_PX - MARGIN_X,
    FOOTER_TOP_Y + 34
  );

  ctx.textAlign = 'left';
  ctx.fillStyle = '#332218';
  ctx.font = `bold 18px ${FONT_FAMILY}`;
  const faDigits = (n: number) =>
    String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] || d);
  ctx.fillText(
    `صفحه ${faDigits(pageNumber)} از ${faDigits(totalPages)}`,
    MARGIN_X,
    FOOTER_TOP_Y + 34
  );
  ctx.restore();
}

function createCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W_PX;
  canvas.height = PAGE_H_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('مرورگر امکان ایجاد بوم ترسیم PDF را ندارد.');
  }
  return [canvas, ctx];
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * بسته‌بندی آرایه بوم‌های رندرشده به فایل استاندارد PDF 1.4
 */
function buildPdfBinaryFromCanvases(canvases: HTMLCanvasElement[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    cursor += bytes.length;
  };
  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const pageCount = canvases.length;
  // Object IDs:
  // 1: Catalog
  // 2: Pages
  // For page i (0..pageCount-1):
  //   pageObjId = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId = 5 + i * 3
  const totalObjects = 2 + pageCount * 3;
  const pageIds = Array.from({ length: pageCount }, (_, i) => `${3 + i * 3} 0 R`).join(' ');

  // 1: Catalog
  offsets[1] = cursor;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets[2] = cursor;
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [ ${pageIds} ] /Count ${pageCount} >>\nendobj\n`);

  const ptW = '595.28';
  const ptH = '841.89';

  for (let i = 0; i < pageCount; i += 1) {
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `/Im${i + 1}`;

    const dataUrl = canvases[i].toDataURL('image/jpeg', 0.92);
    const jpegBase64 = dataUrl.split(',')[1] || '';
    const jpegBytes = base64ToUint8Array(jpegBase64);

    // Page object
    offsets[pageObjId] = cursor;
    pushStr(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] ` +
        `/Resources << /ProcSet [/PDF /ImageC] /XObject << ${imgName} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    // Content stream
    const streamStr = `q\n${ptW} 0 0 ${ptH} 0 0 cm\n${imgName} Do\nQ\n`;
    const streamBytes = encoder.encode(streamStr);
    offsets[contentObjId] = cursor;
    pushStr(
      `${contentObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`
    );
    pushBytes(streamBytes);
    pushStr('\nendstream\nendobj\n');

    // Image XObject
    offsets[imageObjId] = cursor;
    pushStr(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${PAGE_W_PX} /Height ${PAGE_H_PX} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );
    pushBytes(jpegBytes);
    pushStr('\nendstream\nendobj\n');
  }

  const xrefOffset = cursor;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id += 1) {
    const offStr = String(offsets[id] || 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const output = new Uint8Array(cursor);
  let pos = 0;
  for (const ch of chunks) {
    output.set(ch, pos);
    pos += ch.length;
  }
  return output;
}

export async function downloadExecutiveSectionsPdf(
  doc: PdfReportDocumentInput
): Promise<{ ok: boolean; pagesCount: number; error?: string }> {
  try {
    if (typeof document === 'undefined') {
      return { ok: false, pagesCount: 0, error: 'محیط مرورگر در دسترس نیست.' };
    }

    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }

    const pages: HTMLCanvasElement[] = [];

    const startSectionPage = (sectionTitle: string, isContinuation = false) => {
      const [canvas, ctx] = createCanvas();
      pages.push(canvas);
      let y = drawPageFrame(
        ctx,
        doc.docTitle,
        doc.issuedAtDisplay,
        isContinuation ? `${sectionTitle} (ادامه)` : sectionTitle
      );
      return { canvas, ctx, y };
    };

    for (const section of doc.sections) {
      let { ctx, y } = startSectionPage(section.title, false);

      // کادر عنوان بخش
      const bannerH = section.subtitle ? 92 : 64;
      fillRoundedRect(ctx, MARGIN_X, y, CONTENT_W, bannerH, 14, '#FBF8EC', '#D8C5B0', 1.5);
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#332218';
      ctx.font = `bold 26px ${FONT_FAMILY}`;
      ctx.fillText(section.title, PAGE_W_PX - MARGIN_X - 22, y + 16);
      if (section.subtitle) {
        ctx.fillStyle = '#6E5846';
        ctx.font = `500 18px ${FONT_FAMILY}`;
        ctx.fillText(section.subtitle, PAGE_W_PX - MARGIN_X - 22, y + 54);
      }
      ctx.restore();
      y += bannerH + 22;

      // کارت‌های شاخص (Metrics) در شبکه‌های ۳ ستونه راست‌به‌چپ
      if (section.metrics && section.metrics.length > 0) {
        const cols = 3;
        const gap = 16;
        const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
        const cardH = 104;

        for (let idx = 0; idx < section.metrics.length; idx += cols) {
          if (y + cardH > MAX_BODY_Y) {
            ({ ctx, y } = startSectionPage(section.title, true));
          }
          const rowSlice = section.metrics.slice(idx, idx + cols);
          rowSlice.forEach((m, colIdx) => {
            // ستون ۰ در سمت راست صفحه قرار می‌گیرد
            const x = PAGE_W_PX - MARGIN_X - (colIdx + 1) * cardW - colIdx * gap;
            fillRoundedRect(ctx, x, y, cardW, cardH, 12, '#FAF5EE', '#E5D7C6', 1.5);

            ctx.save();
            ctx.direction = 'rtl';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';

            ctx.fillStyle = '#6E5846';
            ctx.font = `600 17px ${FONT_FAMILY}`;
            const labelLines = wrapTextLines(ctx, m.label, cardW - 28).slice(0, 1);
            ctx.fillText(labelLines[0] || '', x + cardW - 14, y + 14);

            ctx.fillStyle = '#332218';
            ctx.font = `bold 25px ${FONT_FAMILY}`;
            ctx.fillText(m.value, x + cardW - 14, y + 44);

            if (m.hint) {
              ctx.fillStyle = '#78604E';
              ctx.font = `500 14px ${FONT_FAMILY}`;
              const hintLines = wrapTextLines(ctx, m.hint, cardW - 28).slice(0, 1);
              ctx.fillText(hintLines[0] || '', x + cardW - 14, y + 76);
            }
            ctx.restore();
          });
          y += cardH + 16;
        }
        y += 8;
      }

      // جدول بخش (RTL: ستون اول در سمت راست)
      if (section.table && section.table.headers.length > 0) {
        const tbl = section.table;
        if (tbl.title) {
          if (y + 44 > MAX_BODY_Y) {
            ({ ctx, y } = startSectionPage(section.title, true));
          }
          ctx.save();
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#6B3E26';
          ctx.font = `bold 21px ${FONT_FAMILY}`;
          ctx.fillText(tbl.title, PAGE_W_PX - MARGIN_X, y);
          ctx.restore();
          y += 36;
        }

        const colCount = tbl.headers.length;
        const ratios =
          tbl.colWidthsRatio && tbl.colWidthsRatio.length === colCount
            ? tbl.colWidthsRatio
            : Array.from({ length: colCount }, () => 1 / colCount);
        const colWidths = ratios.map((r) => r * CONTENT_W);

        const drawTableHeader = () => {
          const hdrH = 48;
          ctx.fillStyle = '#353530';
          ctx.fillRect(MARGIN_X, y, CONTENT_W, hdrH);
          let rightEdge = PAGE_W_PX - MARGIN_X;
          ctx.save();
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#FBF8EC';
          ctx.font = `bold 17px ${FONT_FAMILY}`;
          tbl.headers.forEach((h, cIdx) => {
            const w = colWidths[cIdx];
            ctx.fillText(h, rightEdge - 12, y + hdrH / 2, w - 20);
            rightEdge -= w;
          });
          ctx.restore();
          y += hdrH;
        };

        if (y + 96 > MAX_BODY_Y) {
          ({ ctx, y } = startSectionPage(section.title, true));
        }
        drawTableHeader();

        for (let rIdx = 0; rIdx < tbl.rows.length; rIdx += 1) {
          const row = tbl.rows[rIdx];
          ctx.font = `500 17px ${FONT_FAMILY}`;
          const cellLineArrays = row.map((cell, cIdx) =>
            wrapTextLines(ctx, cell || '—', Math.max(60, (colWidths[cIdx] || 120) - 24))
          );
          const maxLines = Math.max(1, ...cellLineArrays.map((arr) => arr.length));
          const rowH = Math.max(42, maxLines * 26 + 16);

          if (y + rowH > MAX_BODY_Y) {
            ({ ctx, y } = startSectionPage(section.title, true));
            drawTableHeader();
          }

          ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#FAF5EE';
          ctx.fillRect(MARGIN_X, y, CONTENT_W, rowH);
          ctx.strokeStyle = '#E5D7C6';
          ctx.lineWidth = 1;
          ctx.strokeRect(MARGIN_X, y, CONTENT_W, rowH);

          let rightEdge = PAGE_W_PX - MARGIN_X;
          ctx.save();
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          cellLineArrays.forEach((cellLines, cIdx) => {
            const w = colWidths[cIdx];
            ctx.fillStyle = cIdx === 0 ? '#332218' : '#4A3A2E';
            ctx.font = cIdx === 0 ? `bold 17px ${FONT_FAMILY}` : `500 17px ${FONT_FAMILY}`;
            cellLines.forEach((ln, lineIdx) => {
              ctx.fillText(ln, rightEdge - 12, y + 10 + lineIdx * 25, w - 20);
            });
            rightEdge -= w;
          });
          ctx.restore();
          y += rowH;
        }
        y += 22;
      }

      // نکات و بولت‌های تفصیلی
      if (section.bullets && section.bullets.length > 0) {
        if (y + 52 > MAX_BODY_Y) {
          ({ ctx, y } = startSectionPage(section.title, true));
        }
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#6B3E26';
        ctx.font = `bold 20px ${FONT_FAMILY}`;
        ctx.fillText('شاخص‌ها و جزئیات تکمیلی:', PAGE_W_PX - MARGIN_X, y);
        ctx.restore();
        y += 34;

        for (const bullet of section.bullets) {
          ctx.font = `500 18px ${FONT_FAMILY}`;
          const wrapped = wrapTextLines(ctx, `• ${bullet}`, CONTENT_W - 28);
          const blockH = wrapped.length * 28 + 10;

          if (y + blockH > MAX_BODY_Y) {
            ({ ctx, y } = startSectionPage(section.title, true));
          }

          ctx.save();
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#332218';
          ctx.font = `500 18px ${FONT_FAMILY}`;
          wrapped.forEach((line, lIdx) => {
            ctx.fillText(line, PAGE_W_PX - MARGIN_X - 8, y + lIdx * 28);
          });
          ctx.restore();
          y += blockH;
        }
        y += 10;
      }

      // یادداشت‌های محاسباتی انتهای بخش
      if (section.notes && section.notes.length > 0) {
        ctx.font = `500 16px ${FONT_FAMILY}`;
        const noteLineGroups = section.notes.map((n) =>
          wrapTextLines(ctx, `▪ ${n}`, CONTENT_W - 40)
        );
        const totalLines = noteLineGroups.reduce((acc, g) => acc + g.length, 0);
        const boxH = totalLines * 25 + 28;

        if (y + boxH > MAX_BODY_Y) {
          ({ ctx, y } = startSectionPage(section.title, true));
        }

        fillRoundedRect(ctx, MARGIN_X, y, CONTENT_W, boxH, 12, '#F0EBD9', '#D8D1BB', 1.2);
        let noteY = y + 14;
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#525046';
        ctx.font = `500 16px ${FONT_FAMILY}`;
        for (const group of noteLineGroups) {
          for (const line of group) {
            ctx.fillText(line, PAGE_W_PX - MARGIN_X - 18, noteY);
            noteY += 25;
          }
        }
        ctx.restore();
      }
    }

    if (pages.length === 0) {
      return { ok: false, pagesCount: 0, error: 'هیچ بخشی برای تولید PDF انتخاب نشده است.' };
    }

    pages.forEach((canvas, idx) => {
      drawFooter(canvas, idx + 1, pages.length);
    });

    const pdfBytes = buildPdfBinaryFromCanvases(pages);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName.endsWith('.pdf') ? doc.fileName : `${doc.fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);

    return { ok: true, pagesCount: pages.length };
  } catch (err) {
    return {
      ok: false,
      pagesCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
