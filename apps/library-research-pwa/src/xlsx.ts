export interface ParsedSheetRow {
  rowNumber: number;
  values: string[];
  formulas: Record<string, string>;
}

export interface ParsedSheet {
  name: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  dimension: string;
  rows: ParsedSheetRow[];
  formulaCount: number;
}

export interface ParsedWorkbook {
  fileName: string;
  fileSize: number;
  sha256: string;
  sheets: ParsedSheet[];
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function getView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = getView(bytes);
  const minOffset = Math.max(0, bytes.length - 22 - 65535);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('ساختار ZIP فایل Excel معتبر نیست یا فایل پشتیبانی نمی‌شود.');
}

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = getView(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || directorySize === 0xffffffff || offset === 0xffffffff) {
    throw new Error('فایل‌های Excel از نوع ZIP64 در نسخه فعلی پشتیبانی نمی‌شوند.');
  }
  if (offset + directorySize > bytes.length) throw new Error('فهرست داخلی فایل Excel ناقص است.');
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('ساختار یکی از ورودی‌های ZIP قابل خواندن نیست.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = getView(bytes);
  const start = entry.localHeaderOffset;
  if (view.getUint32(start, true) !== 0x04034b50) throw new Error(`سرآیند فایل داخلی ${entry.name} خراب است.`);
  const nameLength = view.getUint16(start + 26, true);
  const extraLength = view.getUint16(start + 28, true);
  const dataStart = start + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8) throw new Error(`روش فشرده‌سازی ${entry.method} در فایل Excel پشتیبانی نمی‌شود.`);
  if (!('DecompressionStream' in globalThis)) throw new Error('مرورگر این دستگاه بازکردن فایل‌های فشرده Excel را پشتیبانی نمی‌کند.');
  try {
    const exactBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
    const stream = new Blob([exactBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const result = new Uint8Array(await new Response(stream).arrayBuffer());
    if (entry.uncompressedSize && result.length !== entry.uncompressedSize) throw new Error('طول داده بازشده با اطلاعات ZIP برابر نیست.');
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'خطای ناشناخته';
    throw new Error(`بازکردن بخش فشرده ${entry.name} ناموفق بود: ${detail}`);
  }
}

function parseXml(bytes: Uint8Array, name: string): XMLDocument {
  const text = new TextDecoder('utf-8').decode(bytes);
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error(`ساختار XML بخش ${name} معتبر نیست.`);
  return document;
}

function localElements<T extends Element = Element>(root: Document | Element, localName: string): T[] {
  return Array.from(root.getElementsByTagNameNS('*', localName)) as T[];
}

function normalizePackagePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function resolveSheetTarget(target: string): string {
  return normalizePackagePath(target.startsWith('/') ? target : `xl/${target}`);
}

function columnIndex(reference: string): number {
  const letters = reference.replace(/[0-9]/g, '').toUpperCase();
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function sharedStringValues(document: XMLDocument | undefined): string[] {
  if (!document) return [];
  return localElements(document, 'si').map((item) => localElements(item, 't').map((node) => node.textContent ?? '').join(''));
}

function parseWorksheet(document: XMLDocument, sharedStrings: string[]): { rows: ParsedSheetRow[]; formulaCount: number; dimension: string } {
  const dimensionNode = localElements(document, 'dimension')[0];
  const dimension = dimensionNode?.getAttribute('ref') ?? '';
  const rowNodes = localElements(document, 'row');
  const rows: ParsedSheetRow[] = [];
  let formulaCount = 0;
  for (const rowNode of rowNodes) {
    const rowNumber = Number(rowNode.getAttribute('r') ?? (rows.length + 1));
    const values: string[] = [];
    const formulas: Record<string, string> = {};
    for (const cell of localElements(rowNode, 'c')) {
      const reference = cell.getAttribute('r') ?? '';
      const index = columnIndex(reference);
      const type = cell.getAttribute('t') ?? 'n';
      const valueNode = localElements(cell, 'v')[0];
      let value = valueNode?.textContent ?? '';
      if (type === 's' && value !== '') {
        const sharedIndex = Number(value);
        value = Number.isInteger(sharedIndex) && sharedIndex >= 0 ? (sharedStrings[sharedIndex] ?? `#SHARED_STRING_${sharedIndex}`) : value;
      } else if (type === 'inlineStr') {
        value = localElements(cell, 't').map((node) => node.textContent ?? '').join('');
      } else if (type === 'b') {
        value = value === '1' ? 'TRUE' : value === '0' ? 'FALSE' : value;
      }
      values[index] = value;
      const formulaNode = localElements(cell, 'f')[0];
      if (formulaNode) {
        formulas[reference] = formulaNode.textContent ?? '';
        formulaCount += 1;
      }
    }
    rows.push({ rowNumber, values, formulas });
  }
  return { rows, formulaCount, dimension };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function parseXlsxFile(file: File): Promise<ParsedWorkbook> {
  if (!file.name.toLocaleLowerCase('en').endsWith('.xlsx')) throw new Error('فقط فایل .xlsx در این مرحله پشتیبانی می‌شود؛ فایل‌های .xls و .xlsb پشتیبانی نمی‌شوند.');
  if (file.size > 40 * 1024 * 1024) throw new Error('حجم فایل بیش از سقف ۴۰ مگابایت نسخه اولیه است.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sha256 = await sha256Hex(buffer);
  const entries = readZipDirectory(bytes);
  const readNamed = async (name: string): Promise<Uint8Array | undefined> => {
    const entry = entries.get(name);
    return entry ? readZipEntry(bytes, entry) : undefined;
  };
  const workbookBytes = await readNamed('xl/workbook.xml');
  const relsBytes = await readNamed('xl/_rels/workbook.xml.rels');
  if (!workbookBytes || !relsBytes) throw new Error('فایل انتخاب‌شده ساختار استاندارد XLSX ندارد.');
  const workbookDoc = parseXml(workbookBytes, 'workbook.xml');
  const relsDoc = parseXml(relsBytes, 'workbook.xml.rels');
  const relations = new Map<string, string>();
  for (const relation of localElements(relsDoc, 'Relationship')) {
    const id = relation.getAttribute('Id');
    const target = relation.getAttribute('Target');
    if (id && target) relations.set(id, resolveSheetTarget(target));
  }
  const sharedBytes = await readNamed('xl/sharedStrings.xml');
  const shared = sharedStringValues(sharedBytes ? parseXml(sharedBytes, 'sharedStrings.xml') : undefined);
  const sheetNodes = localElements(workbookDoc, 'sheet');
  if (!sheetNodes.length) throw new Error('هیچ شیتی در فایل Excel پیدا نشد.');
  const sheets: ParsedSheet[] = [];
  for (const sheetNode of sheetNodes) {
    const name = sheetNode.getAttribute('name') ?? 'بدون نام';
    const relationshipId = sheetNode.getAttribute('r:id') ?? sheetNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
    const path = relations.get(relationshipId);
    if (!path) throw new Error(`مسیر داخلی شیت «${name}» مشخص نیست.`);
    const sheetBytes = await readNamed(path);
    if (!sheetBytes) throw new Error(`فایل داخلی شیت «${name}» پیدا نشد.`);
    const parsed = parseWorksheet(parseXml(sheetBytes, path), shared);
    const stateValue = sheetNode.getAttribute('state') ?? 'visible';
    const state = stateValue === 'veryHidden' ? 'veryHidden' : stateValue === 'hidden' ? 'hidden' : 'visible';
    sheets.push({ name, state, dimension: parsed.dimension, rows: parsed.rows, formulaCount: parsed.formulaCount });
  }
  return { fileName: file.name, fileSize: file.size, sha256, sheets };
}
