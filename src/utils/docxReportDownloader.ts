/**
 * موتور تولید مستقیم فایل استاندارد و قابل ویرایش Microsoft Word (.docx - OpenXML) در مرورگر
 * - بدون وابستگی به شبکه یا Service Worker (جلوگیری ۱۰۰٪ از ذخیره اشتباهی index.html به‌جای فایل Word)
 * - ساختار کامل ZIP (PK\x03\x04) با محاسبه دقیق CRC-32 و روابط استاندارد rIdHeader1 / rIdFooter1
 * - پشتیبانی کامل از نوشتار راست‌به‌چپ فارسی (<w:bidi/> و <w:rtl/>)، فونت B Zar / Vazirmatn و جدول‌های رنگی
 */

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // حذف کاراکترهای کنترلی غیرمجاز در XML 1.0
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

/**
 * ساخت آرشیو استاندارد ZIP (متد STORE = 0 بدون فشرده‌سازی) که در تمامی نسخه‌های
 * Microsoft Word (2010/2013/2016/2019/2021/365) و LibreOffice بدون هیچ خطایی باز می‌شود.
 */
function buildZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = entry.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + nameBytes)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // PK\x03\x04
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, 0x4000, true); // Mod time
    lv.setUint16(12, 0x596f, true); // Mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory file header (46 bytes + nameBytes)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // PK\x01\x02
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cv.setUint16(12, 0x4000, true); // Mod time
    cv.setUint16(14, 0x596f, true); // Mod date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // Filename length
    cv.setUint16(30, 0, true); // Extra length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const cp of centralParts) centralSize += cp.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // PK\x05\x06
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, entries.length, true); // Number of central directory records on this disk
  ev.setUint16(10, entries.length, true); // Total number of central directory records
  ev.setUint32(12, centralSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalSize = offset + centralSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const lp of localParts) {
    result.set(lp, pos);
    pos += lp.length;
  }
  for (const cp of centralParts) {
    result.set(cp, pos);
    pos += cp.length;
  }
  result.set(eocd, pos);
  return result;
}

function rPrXml(font = 'B Zar', sizeHalfPt = 24, bold = false, color = '353530'): string {
  const bTag = bold ? '<w:b/><w:bCs/>' : '';
  return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${bTag}<w:color w:val="${color}"/><w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/><w:rtl/></w:rPr>`;
}

function renderInlineRunsXml(lineText: string, sizeHalfPt = 24, baseColor = '353530'): string {
  const cleaned = lineText.replace(/`/g, '');
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  if (parts.length === 0) {
    return `<w:r>${rPrXml('B Zar', sizeHalfPt, false, baseColor)}<w:t xml:space="preserve"></w:t></w:r>`;
  }
  return parts
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const inner = part.slice(2, -2);
        return `<w:r>${rPrXml('B Zar', sizeHalfPt, true, '353530')}<w:t xml:space="preserve">${escapeXml(
          inner
        )}</w:t></w:r>`;
      }
      return `<w:r>${rPrXml('B Zar', sizeHalfPt, false, baseColor)}<w:t xml:space="preserve">${escapeXml(
        part
      )}</w:t></w:r>`;
    })
    .join('');
}

function buildWordTableXml(rows: string[][]): string {
  if (!rows.length) return '';
  const colCount = Math.max(1, ...rows.map((r) => r.length));
  const colWidth = Math.floor(9400 / colCount);
  const gridCols = Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('');

  const tblPr =
    '<w:tblPr>' +
    '<w:bidiVisual/>' +
    '<w:tblW w:w="5000" w:type="pct"/>' +
    '<w:jc w:val="center"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="8" w:space="0" w:color="B9B38A"/>' +
    '<w:left w:val="single" w:sz="6" w:space="0" w:color="D8D1BB"/>' +
    '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="B9B38A"/>' +
    '<w:right w:val="single" w:sz="6" w:space="0" w:color="D8D1BB"/>' +
    '<w:insideH w:val="single" w:sz="6" w:space="0" w:color="D8D1BB"/>' +
    '<w:insideV w:val="single" w:sz="6" w:space="0" w:color="D8D1BB"/>' +
    '</w:tblBorders>' +
    '<w:tblCellMar>' +
    '<w:top w:w="90" w:type="dxa"/>' +
    '<w:left w:w="110" w:type="dxa"/>' +
    '<w:bottom w:w="90" w:type="dxa"/>' +
    '<w:right w:w="110" w:type="dxa"/>' +
    '</w:tblCellMar>' +
    '</w:tblPr>';

  const trsXml = rows
    .map((row, rIdx) => {
      const isHeader = rIdx === 0;
      const fill = isHeader ? '353530' : rIdx % 2 === 1 ? 'FBF8EC' : 'FFFFFF';
      const textColor = isHeader ? 'FBF8EC' : '353530';
      const cellsXml = Array.from({ length: colCount }, (_, cIdx) => {
        const cellText = (row[cIdx] ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
        return (
          `<w:tc>` +
          `<w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:vAlign w:val="center"/></w:tcPr>` +
          `<w:p><w:pPr><w:bidi/><w:spacing w:before="40" w:after="40"/><w:jc w:val="${
            isHeader ? 'center' : 'right'
          }"/></w:pPr>` +
          `<w:r>${rPrXml('B Zar', isHeader ? 22 : 21, isHeader || cIdx === 0, textColor)}<w:t xml:space="preserve">${escapeXml(
            cellText
          )}</w:t></w:r></w:p>` +
          `</w:tc>`
        );
      }).join('');
      return `<w:tr><w:trPr>${isHeader ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${cellsXml}</w:tr>`;
    })
    .join('');

  return `<w:tbl>${tblPr}<w:tblGrid>${gridCols}</w:tblGrid>${trsXml}</w:tbl><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>`;
}

function convertMarkdownToDocumentBodyXml(markdown: string, docTitle: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const xmlParts: string[] = [];

  // سرصفحه عنوان سند در ابتدای فایل
  xmlParts.push(
    `<w:p><w:pPr><w:pStyle w:val="Title"/><w:bidi/><w:jc w:val="center"/><w:spacing w:before="180" w:after="140"/></w:pPr>` +
      `<w:r>${rPrXml('B Zar', 36, true, '353530')}<w:t xml:space="preserve">${escapeXml(
        docTitle
      )}</w:t></w:r></w:p>`
  );

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed === '---') {
      i++;
      continue;
    }

    // بلوک کد (``` ... ```)
    if (trimmed.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      if (codeLines.length > 0) {
        xmlParts.push(
          `<w:p><w:pPr><w:bidi/><w:shd w:val="clear" w:color="auto" w:fill="F0EBD9"/><w:spacing w:before="60" w:after="80"/></w:pPr>` +
            `<w:r>${rPrXml('B Zar', 20, false, '353530')}<w:t xml:space="preserve">${escapeXml(
              codeLines.join(' | ')
            )}</w:t></w:r></w:p>`
        );
      }
      continue;
    }

    // جدول مارک‌داون
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length) {
        const tLine = lines[i].trim();
        if (!tLine.startsWith('|')) break;
        const cells = tLine
          .slice(1, tLine.endsWith('|') ? -1 : undefined)
          .split('|')
          .map((c) => c.trim());
        const isSeparator = cells.every((c) => /^[-:\s]+$/.test(c));
        if (!isSeparator) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        xmlParts.push(buildWordTableXml(tableRows));
      }
      continue;
    }

    // سرتیترها
    if (trimmed.startsWith('# ')) {
      const text = trimmed.replace(/^#\s+/, '').replace(/\*\*/g, '');
      xmlParts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/><w:bidi/>` +
          `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="B9B38A"/></w:pBdr>` +
          `<w:spacing w:before="280" w:after="120"/><w:jc w:val="right"/></w:pPr>` +
          `<w:r>${rPrXml('B Zar', 32, true, '353530')}<w:t xml:space="preserve">${escapeXml(
            text
          )}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const text = trimmed.replace(/^##\s+/, '').replace(/\*\*/g, '');
      xmlParts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/><w:bidi/>` +
          `<w:pBdr><w:bottom w:val="single" w:sz="10" w:space="4" w:color="D8D1BB"/></w:pBdr>` +
          `<w:spacing w:before="240" w:after="100"/><w:jc w:val="right"/></w:pPr>` +
          `<w:r>${rPrXml('B Zar', 28, true, '353530')}<w:t xml:space="preserve">${escapeXml(
            text
          )}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
      const text = trimmed.replace(/^#{3,4}\s+/, '').replace(/\*\*/g, '');
      xmlParts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:keepNext/><w:bidi/>` +
          `<w:spacing w:before="180" w:after="80"/><w:jc w:val="right"/></w:pPr>` +
          `<w:r>${rPrXml('B Zar', 25, true, '525046')}<w:t xml:space="preserve">${escapeXml(
            text
          )}</w:t></w:r></w:p>`
      );
      i++;
      continue;
    }

    // نقل‌قول / کادر تأکیدی
    if (trimmed.startsWith('>')) {
      const text = trimmed.replace(/^>\s*/, '');
      xmlParts.push(
        `<w:p><w:pPr><w:bidi/>` +
          `<w:pBdr><w:right w:val="single" w:sz="18" w:space="8" w:color="B9B38A"/></w:pBdr>` +
          `<w:shd w:val="clear" w:color="auto" w:fill="FBF8EC"/>` +
          `<w:ind w:left="160" w:right="160"/><w:spacing w:before="100" w:after="100" w:line="320" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>` +
          `${renderInlineRunsXml(text, 23, '353530')}</w:p>`
      );
      i++;
      continue;
    }

    // بولت‌لیست یا لیست شماره‌دار
    if (/^([-*•]|\d+[.)])\s+/.test(trimmed)) {
      const cleanBullet = trimmed.replace(/^([-*•]|\d+[.)])\s+/, '');
      xmlParts.push(
        `<w:p><w:pPr><w:bidi/><w:ind w:right="240"/><w:spacing w:before="40" w:after="80" w:line="320" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>` +
          `<w:r>${rPrXml('B Zar', 24, true, '353530')}<w:t xml:space="preserve">• </w:t></w:r>` +
          `${renderInlineRunsXml(cleanBullet, 24, '353530')}</w:p>`
      );
      i++;
      continue;
    }

    // پاراگراف معمولی
    xmlParts.push(
      `<w:p><w:pPr><w:bidi/><w:spacing w:before="60" w:after="100" w:line="330" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>` +
        `${renderInlineRunsXml(trimmed, 24, '353530')}</w:p>`
    );
    i++;
  }

  const sectPr =
    '<w:sectPr>' +
    '<w:headerReference w:type="default" r:id="rIdHeader1"/>' +
    '<w:footerReference w:type="default" r:id="rIdFooter1"/>' +
    '<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>' +
    '<w:bidi/>' +
    '</w:sectPr>';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<w:body>${xmlParts.join('')}${sectPr}</w:body></w:document>`
  );
}

export function buildValidDocxUint8Array(
  markdownContent: string,
  docTitle = 'گزارش جامع فنی داشبورد مدیریتی، آمار تفصیلی و ۴ گزارش پیوست'
): Uint8Array {
  const encoder = new TextEncoder();

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const docRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
    '<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
    '<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    '</Relationships>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults>' +
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="B Zar" w:hAnsi="B Zar" w:cs="B Zar"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:bidi="fa-IR"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:bidi/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:bidi/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:bidi/></w:pPr></w:style>' +
    '</w:styles>';

  const settingsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:zoom w:percent="100"/>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '</w:settings>';

  const header1Xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:p><w:pPr><w:bidi/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="D8D1BB"/></w:pBdr><w:jc w:val="center"/></w:pPr>' +
    `<w:r>${rPrXml('B Zar', 18, false, '6E6A5C')}<w:t xml:space="preserve">مرکز اسناد گلزار شهدای تهران — ${escapeXml(
      docTitle
    )}</w:t></w:r></w:p></w:hdr>`;

  const footer1Xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:p><w:pPr><w:bidi/><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="D8D1BB"/></w:pBdr><w:jc w:val="center"/></w:pPr>' +
    `<w:r>${rPrXml('B Zar', 18, false, '6E6A5C')}<w:t xml:space="preserve">صفحه </w:t></w:r>` +
    '<w:fldSimple w:instr="PAGE"/>' +
    `<w:r>${rPrXml('B Zar', 18, false, '6E6A5C')}<w:t xml:space="preserve"> از </w:t></w:r>` +
    '<w:fldSimple w:instr="NUMPAGES"/>' +
    '</w:p></w:ftr>';

  const nowIso = new Date().toISOString();
  const coreXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(docTitle)}</dc:title>` +
    '<dc:creator>مرکز اسناد گلزار شهدای تهران</dc:creator>' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>` +
    '</cp:coreProperties>';

  const appXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Microsoft Office Word</Application>' +
    '<AppVersion>16.0000</AppVersion>' +
    '</Properties>';

  const documentXml = convertMarkdownToDocumentBodyXml(markdownContent, docTitle);

  return buildZipArchive([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'docProps/core.xml', data: encoder.encode(coreXml) },
    { name: 'docProps/app.xml', data: encoder.encode(appXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(docRelsXml) },
    { name: 'word/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'word/settings.xml', data: encoder.encode(settingsXml) },
    { name: 'word/header1.xml', data: encoder.encode(header1Xml) },
    { name: 'word/footer1.xml', data: encoder.encode(footer1Xml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ]);
}

export function downloadComprehensiveDashboardDocx(
  customMarkdown: string,
  customFileName = '09-گزارش-جامع-فنی-داشبورد-مدیریتی-و-پیوستها.docx',
  docTitle = 'گزارش جامع فنی داشبورد مدیریتی، آمار تفصیلی و ۴ گزارش پیوست'
): void {
  const docxBytes = buildValidDocxUint8Array(customMarkdown, docTitle);
  const blob = new Blob([docxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = customFileName.endsWith('.docx') ? customFileName : `${customFileName}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
