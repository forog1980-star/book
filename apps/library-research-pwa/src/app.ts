import {
  getAllBooks, getAllCopies, getAllMartyrs, getAllLinks, getAllExcerpts, getAllImports,
  getAllSourceRows, getAllAudit, saveBookWithCopy, saveCopy, saveMartyr, saveLink,
  saveExcerpt, stageImport, hasImportHashAndSheet, updateLinkStatus, updateExcerptStatus,
  updateMartyrStatus, validateSnapshot,
} from './db.js';
import {
  APP_VERSION, CATEGORIES, EXPECTED_REFERENCE_SHA256, LOCAL_ACTOR, SHELVES, TIERS,
  categoryLabel, createId, findExactTitleDuplicates, makeLocation, locationFitsCategory,
  normalizePersian, statusLabel, statusTone, validateBookInput,
} from './domain.js';
import { downloadFullBackup, downloadInventoryCsv, mergeBackupText } from './backup.js';
import { parseXlsxFile, type ParsedWorkbook } from './xlsx.js';
import type {
  BookRecord, BookCopy, MartyrRecord, BookMartyrLink, ExtractedItem, ImportBatch, RawSourceRow,
} from './model.js';
import { linksForBook, linksForMartyr } from './relations.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('ریشه رابط کاربری پیدا نشد.');

type View = 'home' | 'books' | 'martyrs' | 'search' | 'research' | 'review' | 'imports' | 'settings';
const state: {
  view: View;
  books: BookRecord[];
  copies: BookCopy[];
  martyrs: MartyrRecord[];
  links: BookMartyrLink[];
  excerpts: ExtractedItem[];
  imports: ImportBatch[];
  sourceRows: RawSourceRow[];
  audit: Awaited<ReturnType<typeof getAllAudit>>;
  parsedWorkbook?: ParsedWorkbook;
  activeSheetName?: string;
  headerRowNumber: number;
  movingCopyId?: string;
  editingBookId?: string;
  fieldMapping: Record<string, string>;
  restorePreview?: { fileName: string; rawText: string; counts: Array<{label:string; count:number}>; total: number };
  message: string;
  error: boolean;
} = {
  view: 'home', books: [], copies: [], martyrs: [], links: [], excerpts: [],
  imports: [], sourceRows: [], audit: [], headerRowNumber: 1, fieldMapping: {}, message: '', error: false,
};

const now = (): string => new Date().toISOString();
const fa = (value: number): string => new Intl.NumberFormat('fa-IR').format(value);
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));
const val = (data: FormData, name: string): string => String(data.get(name) ?? '');
const checked = (data: FormData, name: string): boolean => data.get(name) === 'on';

function field(label: string, name: string, placeholder = '', type = 'text', required = false, value = ''): string {
  return '<label class="field"><span>' + esc(label) + '</span><input name="' + esc(name) + '" type="' + type + '" placeholder="' + esc(placeholder) + '" value="' + esc(value) + '"' + (required ? ' required' : '') + '></label>';
}
function area(label: string, name: string, placeholder = '', rows = 3, required = false, value = ''): string {
  return '<label class="field"><span>' + esc(label) + '</span><textarea name="' + esc(name) + '" rows="' + rows + '" placeholder="' + esc(placeholder) + '"' + (required ? ' required' : '') + '>' + esc(value) + '</textarea></label>';
}
function selectField(label: string, name: string, options: Array<{value:string;label:string}>, required = false, selectedValue = ''): string {
  return '<label class="field"><span>' + esc(label) + '</span><select name="' + esc(name) + '"' + (required ? ' required' : '') + '><option value="">انتخاب کنید</option>' +
    options.map((item) => '<option value="' + esc(item.value) + '"' + (item.value === selectedValue ? ' selected' : '') + '>' + esc(item.label) + '</option>').join('') + '</select></label>';
}
function shelfOptions(): Array<{value:string;label:string}> { return SHELVES.map((s) => ({ value:s, label:s })); }
function tierOptions(): Array<{value:string;label:string}> { return TIERS.map((t) => ({ value:t, label:t })); }
function pill(status: string): string {
  return '<span class="pill ' + esc(statusTone(status)) + '">' + esc(statusLabel(status)) + '</span>';
}
function empty(message: string): string {
  return '<div class="empty-state">' + esc(message) + '</div>';
}
function bookTitle(id: string): string {
  return state.books.find((book) => book.id === id)?.titleDisplay || 'کتاب نامشخص';
}
function martyrName(id: string): string {
  return state.martyrs.find((martyr) => martyr.id === id)?.fullNameRaw || 'شهید نامشخص';
}
function notify(message: string, error = false): void {
  state.message = message;
  state.error = error;
  render();
}
async function refreshData(): Promise<void> {
  const [books, copies, martyrs, links, excerpts, imports, sourceRows, audit] = await Promise.all([
    getAllBooks(), getAllCopies(), getAllMartyrs(), getAllLinks(), getAllExcerpts(),
    getAllImports(), getAllSourceRows(), getAllAudit(),
  ]);
  state.books = books; state.copies = copies; state.martyrs = martyrs; state.links = links;
  state.excerpts = excerpts; state.imports = imports; state.sourceRows = sourceRows; state.audit = audit;
}

function layout(body: string): void {
  const nav: Array<{view:View;label:string}> = [
    {view:'home',label:'خانه'}, {view:'books',label:'کتابخانه'}, {view:'martyrs',label:'شهدا'},
    {view:'search',label:'جست‌وجو'}, {view:'research',label:'پژوهش و ارتباط‌ها'},
  ];
  root!.innerHTML =
    '<header class="app-header"><div class="brand"><div class="brand-mark">گ</div><div><strong>کتابخانه و پژوهش</strong><div class="small-note">مرکز اسناد گلزار شهدای تهران · نسخه ' + esc(APP_VERSION) + '</div></div></div>' +
    '<button type="button" class="secondary" data-action="navigate" data-view="settings">پشتیبان و تنظیمات</button></header>' +
    '<nav class="main-nav">' + nav.map((item) => '<button type="button" class="' + (state.view === item.view ? 'active' : '') + '" data-action="navigate" data-view="' + item.view + '">' + item.label + '</button>').join('') +
    '<button type="button" class="' + (state.view === 'review' ? 'active' : '') + '" data-action="navigate" data-view="review">صف بررسی</button>' +
    '<button type="button" class="' + (state.view === 'imports' ? 'active' : '') + '" data-action="navigate" data-view="imports">ورود Excel</button></nav>' +
    '<main class="app-main">' + (state.message ? '<div class="notice ' + (state.error ? 'notice-amber' : 'notice-success') + '">' + esc(state.message) + '</div>' : '') + body + '</main>' +
    '<footer class="app-footer">ذخیره‌سازی محلی روی همین دستگاه · بدون ارسال داده به سرویس بیرونی · انتشار عمومی مسدود</footer>';
}

function renderHome(): void {
  const pending = state.links.filter((x) => x.reviewStatus === 'proposed' || x.reviewStatus === 'in_review').length +
    state.excerpts.filter((x) => x.reviewStatus === 'draft' || x.reviewStatus === 'needs_review').length;
  const body = '<section class="page-heading"><div><span class="eyebrow">نمای کلی</span><h1>خانه</h1><p>مدیریت آثار کتاب‌شناختی، جلدهای فیزیکی و اطلاعات پژوهشی در یک فضای محلی.</p></div></section>' +
    '<section class="stats-grid">' +
    '<article class="stat-card"><span>آثار کتاب‌شناختی</span><strong>' + fa(state.books.length) + '</strong></article>' +
    '<article class="stat-card"><span>جلدهای فیزیکی</span><strong>' + fa(state.copies.length) + '</strong></article>' +
    '<article class="stat-card"><span>پرونده شهدا</span><strong>' + fa(state.martyrs.length) + '</strong></article>' +
    '<article class="stat-card"><span>موارد منتظر بررسی</span><strong>' + fa(pending) + '</strong></article></section>' +
    '<section class="two-column"><article class="panel"><h2>ثبت سریع</h2><p>برای هر اثر، مشخصات کتاب‌شناختی و برای هر جلد، محل فیزیکی جداگانه ثبت می‌شود.</p><button class="primary" data-action="navigate" data-view="books">ثبت کتاب</button> <button class="secondary" data-action="navigate" data-view="martyrs">ثبت پرونده شهید</button></article>' +
    '<article class="panel"><h2>وضعیت داده مرجع</h2><p>فایل Excel فقط در بخش ورود خام بررسی می‌شود. هیچ سطری به رکورد قطعی کتاب یا شهید تبدیل نمی‌شود.</p><button class="secondary" data-action="navigate" data-view="imports">ممیزی و ورود Excel</button></article></section>' +
    '<section class="panel"><div class="panel-heading"><h2>شش گروه موضوعی</h2><span class="muted">بر اساس دسته‌بندی مصوب کتابخانه</span></div><div class="category-grid">' +
    CATEGORIES.map((item) => '<div class="category-chip"><b>' + esc(item.code) + '</b><span>' + esc(item.label) + '</span><strong>' + fa(state.books.filter((book) => book.categoryCode === item.code).length) + '</strong></div>').join('') +
    '</div></section>' +
    '<section class="notice notice-amber"><b>یادآوری:</b> تعداد آثار با تعداد جلد فیزیکی یکی نیست. اختلاف ۹۸۰ رکورد فهرست با شمارش ۹۴۲ جلد، در این نسخه به‌عنوان مغایرت حل‌نشده باقی می‌ماند.</section>';
  layout(body);
}

function renderBooks(): void {
  const editingBook = state.editingBookId ? state.books.find((item) => item.id === state.editingBookId) : undefined;
  const bookForm = editingBook
    ? '<section class="panel form-panel"><div class="panel-heading"><h2>ویرایش مشخصات کتاب</h2><span class="muted">شناسه و نسخه‌های فیزیکی ثابت می‌مانند.</span></div>' +
      '<form data-form="book-edit" data-id="' + esc(editingBook.id) + '"><div class="form-grid two">' +
      field('عنوان خام کتاب', 'titleRaw', '', 'text', true, editingBook.titleRaw) +
      field('نویسنده / پدیدآورنده', 'authorsRaw', '', 'text', false, editingBook.authorsRaw) +
      field('ناشر', 'publisherRaw', '', 'text', false, editingBook.publisherRaw) +
      field('سال انتشار / چاپ', 'publicationYearRaw', '', 'text', false, editingBook.publicationYearRaw) +
      field('نوبت / مشخصات چاپ', 'editionRaw', '', 'text', false, editingBook.editionRaw) +
      field('شابک', 'isbnRaw', '', 'text', false, editingBook.isbnRaw) +
      selectField('گروه موضوعی', 'categoryCode', [...CATEGORIES.map((x) => ({value:x.code,label:x.code + ' — ' + x.label})), {value:'U',label:'نامشخص'}], true, editingBook.categoryCode) +
      field('منبع / شاهد مشخصات کتاب', 'sourceEvidenceRaw', '', 'text', true, editingBook.sourceEvidenceRaw) +
      area('توضیحات', 'descriptionRaw', 'اختیاری', 2, false, editingBook.descriptionRaw) +
      '</div><div class="form-actions"><button class="primary">ذخیره تغییرات</button><button class="secondary" type="button" data-action="cancel-edit-book">انصراف</button></div></form></section>'
    : '<section class="panel form-panel"><div class="panel-heading"><h2>ثبت اثر کتاب‌شناختی</h2><span class="muted">وضعیت اولیه: نیازمند بررسی</span></div>' +
    '<form data-form="book"><div class="form-grid two">' +
    field('عنوان خام کتاب', 'titleRaw', 'عنوان را عین منبع وارد کنید', 'text', true) +
    field('نویسنده / پدیدآورنده', 'authorsRaw', 'فقط در صورت مشاهده') +
    field('ناشر', 'publisherRaw', 'نام ناشر') + field('سال انتشار / چاپ', 'publicationYearRaw', 'متن خام سال') +
    field('نوبت / مشخصات چاپ', 'editionRaw', 'مثلاً چاپ سوم') + field('شابک', 'isbnRaw', 'در صورت وجود') +
    selectField('گروه موضوعی', 'categoryCode', [...CATEGORIES.map((x) => ({value:x.code,label:x.code + ' — ' + x.label})), {value:'U',label:'نامشخص'}], true) +
    field('منبع / شاهد مشخصات کتاب', 'sourceEvidenceRaw', 'جلد، صفحه شناسنامه یا مرجع کتاب‌شناختی', 'text', true) +
    area('توضیحات', 'descriptionRaw', 'اختیاری', 2) +
    '</div><div class="subpanel"><label class="check-row"><input type="checkbox" name="addCopy"> این جلد را اکنون در قفسه مشاهده کرده‌ام و می‌خواهم نسخه فیزیکی ثبت کنم.</label>' +
    '<div class="form-grid two">' + selectField('قفسه', 'shelf', shelfOptions()) + selectField('طبقه', 'tier', tierOptions()) + field('یادداشت وضعیت جلد', 'copyNote', 'اختیاری') + '</div></div>' +
    '<div class="form-actions"><button class="primary">ثبت کتاب</button><span class="muted">شناسه اثر و شناسه جلد مستقل‌اند.</span></div></form></section>';
  const rows = state.books.map((book) => {
    const copies = state.copies.filter((copy) => copy.bookId === book.id);
    const relatedLinks = linksForBook(state.links, book.id).map((link) =>
      '<div class="related-link-item"><span>' + esc(martyrName(link.martyrId)) + '</span>' + pill(link.reviewStatus) + '</div>'
    ).join('');
    return '<article class="record-card"><div class="record-main"><div><h3>' + esc(book.titleDisplay || book.titleRaw) + '</h3><p>' + esc([book.authorsRaw, book.publisherRaw, book.publicationYearRaw].filter(Boolean).join(' · ')) + '</p><div class="record-meta"><span>' + esc(categoryLabel(book.categoryCode)) + '</span><span>' + fa(copies.length) + ' جلد</span>' + pill(book.reviewStatus) + '</div></div></div>' +
      (copies.length ? '<div class="copy-list">' + copies.map((copy) => '<div class="copy-row"><span>' + esc(copy.id) + '</span><span>' + esc(copy.location?.code || 'محل نامشخص') + '</span><span>' + pill(copy.observation) + '</span><button type="button" class="text-button" data-action="move-copy" data-id="' + esc(copy.id) + '">تغییر محل</button></div>').join('') + '</div>' : '<p class="muted">نسخه فیزیکی ثبت نشده است.</p>') +
      (relatedLinks ? '<div class="related-links"><span class="muted">شهدا و ارتباط‌های ثبت‌شده</span><div class="related-link-list">' + relatedLinks + '</div></div>' : '') +
      '<div class="form-actions"><button type="button" class="text-button" data-action="edit-book" data-id="' + esc(book.id) + '">ویرایش مشخصات</button></div>' +
      '</article>';
  }).join('');
  const moveCopy = state.movingCopyId ? '<section class="panel form-panel"><div class="panel-heading"><h2>ثبت جابه‌جایی جلد</h2><button class="text-button" type="button" data-action="cancel-move">انصراف</button></div><form data-form="move"><div class="form-grid two">' +
    selectField('قفسه جدید', 'shelf', shelfOptions(), true) + selectField('طبقه جدید', 'tier', tierOptions(), true) + field('دلیل / توضیح جابه‌جایی', 'note', 'اختیاری') +
    '</div><div class="form-actions"><button class="primary">ثبت محل جدید</button></div></form></section>' : '';
  layout('<section class="page-heading"><div><span class="eyebrow">فهرست کتاب‌ها</span><h1>کتابخانه</h1><p>اثر کتاب‌شناختی از جلدهای فیزیکی مستقل نگهداری می‌شود.</p></div></section>' +
    bookForm + moveCopy + '<section class="panel"><div class="panel-heading"><h2>فهرست ثبت‌شده</h2><span class="muted">' + fa(state.books.length) + ' اثر</span></div>' +
    (rows ? '<div class="record-list">' + rows + '</div>' : empty('هنوز کتابی ثبت نشده است.')) + '</section>');
}

function renderMartyrs(): void {
  const rows = state.martyrs.map((martyr) => {
    const relatedLinks = linksForMartyr(state.links, martyr.id).map((link) =>
      '<div class="related-link-item"><span>' + esc(bookTitle(link.bookId)) + '</span>' + pill(link.reviewStatus) + '</div>'
    ).join('');
    return '<article class="record-card"><h3>' + esc(martyr.fullNameRaw) + '</h3><p>' +
      esc([martyr.sectionRaw ? 'قطعه ' + martyr.sectionRaw : '', martyr.graveRowRaw ? 'ردیف ' + martyr.graveRowRaw : '', martyr.graveNumberRaw ? 'شماره ' + martyr.graveNumberRaw : ''].filter(Boolean).join(' · ') || 'نشانی مزار ثبت نشده') +
      '</p><div class="record-meta">' + pill(martyr.identityReviewStatus) + '<span>' + esc(martyr.identityEvidenceRaw) + '</span></div>' +
      (relatedLinks ? '<div class="related-links"><span class="muted">کتاب‌های مرتبط</span><div class="related-link-list">' + relatedLinks + '</div></div>' : '') +
      '</article>';
  }).join('');
  layout('<section class="page-heading"><div><span class="eyebrow">پرونده‌های هویتی</span><h1>شهدا</h1><p>نام مشابه به‌تنهایی اثبات‌کننده هویت نیست؛ منبع یا شاهد مشخصات الزامی است.</p></div></section>' +
    '<section class="panel form-panel"><div class="panel-heading"><h2>ثبت پرونده شهید</h2><span class="muted">وضعیت اولیه: نیازمند بررسی</span></div><form data-form="martyr"><div class="form-grid two">' +
    field('نام کامل عین منبع', 'fullNameRaw', 'نام و نام خانوادگی', 'text', true) +
    field('نام', 'firstNameRaw', 'در صورت تفکیک معتبر') + field('نام خانوادگی', 'lastNameRaw', 'در صورت تفکیک معتبر') +
    field('نام‌های جایگزین', 'alternateNamesRaw', 'با ویرگول جدا کنید') + field('قطعه (متن خام)', 'sectionRaw', 'مثلاً ۲۴') +
    field('ردیف مزار (متن خام)', 'graveRowRaw', 'مقدار عین منبع') + field('شماره مزار (متن خام)', 'graveNumberRaw', 'مقدار عین منبع') +
    field('منبع / شاهد نام و مشخصات', 'identityEvidenceRaw', 'سند، کتاب، صفحه یا مرجع قابل پیگیری', 'text', true) +
    '</div><div class="form-actions"><button class="primary">ثبت پرونده</button></div></form></section>' +
    '<section class="panel"><div class="panel-heading"><h2>پرونده‌های ثبت‌شده</h2><span class="muted">' + fa(state.martyrs.length) + ' مورد</span></div>' +
    (rows ? '<div class="record-list">' + rows + '</div>' : empty('هنوز پرونده‌ای ثبت نشده است.')) + '</section>');
}

function renderSearch(): void {
  layout('<section class="page-heading"><div><span class="eyebrow">جست‌وجوی مستند</span><h1>جست‌وجوی محلی</h1><p>جست‌وجو فقط در اطلاعات ذخیره‌شده روی همین دستگاه انجام می‌شود.</p></div></section>' +
    '<section class="panel"><form data-form="search" class="search-large"><input name="q" placeholder="عنوان کتاب، نویسنده، شهید یا واژه پژوهشی" autocomplete="off" required><button class="primary">جست‌وجو</button></form><div id="search-results"></div></section>' +
    '<section class="notice notice-amber"><b>محدودیت نسخه نخست:</b> جست‌وجوی اینترنتی و هوش مصنوعی هنوز فعال نیست. نتایج بیرونی به‌صورت خودکار قطعی نخواهند شد.</section>');
}

function renderResearch(): void {
  const books = state.books.map((book) => ({value:book.id,label:book.titleDisplay || book.titleRaw}));
  const martyrs = state.martyrs.map((martyr) => ({value:martyr.id,label:martyr.fullNameRaw}));
  const links = state.links.map((link) => '<article class="record-card"><h3>' + esc(bookTitle(link.bookId)) + ' ↔ ' + esc(martyrName(link.martyrId)) + '</h3><p>' + esc(link.description || link.evidenceReferenceRaw) + '</p><div class="record-meta">' + pill(link.reviewStatus) + '</div></article>').join('');
  const excerpts = state.excerpts.map((item) => '<article class="record-card"><h3>' + esc(item.title) + '</h3><p>' + esc(bookTitle(item.bookId)) + ' · صفحه ' + esc(item.pageReferenceRaw) + '</p><p>' + esc(item.researchSummary) + '</p><div class="record-meta">' + pill(item.reviewStatus) + '</div></article>').join('');
  layout('<section class="page-heading"><div><span class="eyebrow">تولید محتوای مستند</span><h1>پژوهش و ارتباط‌ها</h1><p>ارتباط‌ها و گزیده‌های پژوهشی تا زمان بررسی مسئول مربوط قطعی یا قابل انتشار نیستند.</p></div><button type="button" class="secondary" data-action="navigate" data-view="review">صف بررسی انسانی</button></section>' +
    '<section class="two-column align-start"><article class="panel form-panel"><div class="panel-heading"><h2>پیشنهاد ارتباط کتاب و شهید</h2>' + pill('proposed') + '</div><form data-form="link"><div class="form-grid">' +
    selectField('کتاب', 'bookId', books, true) + selectField('شهید', 'martyrId', martyrs, true) +
    field('نوع ارتباط', 'relationshipType', 'مثلاً زندگی‌نامه، خاطره') + field('ارجاع منبع / صفحه', 'evidenceReferenceRaw', 'نام فصل، صفحه یا محل شاهد', 'text', true) +
    area('شرح ارتباط', 'description', 'چرا این کتاب به این شهید مرتبط است؟', 3) +
    '</div><div class="form-actions"><button class="primary" ' + (!books.length || !martyrs.length ? 'disabled' : '') + '>ثبت برای بررسی</button></div></form></article>' +
    '<article class="panel form-panel"><div class="panel-heading"><h2>ثبت مطلب استخراج‌شده</h2><span class="muted">ارجاع صفحه خام</span></div><form data-form="excerpt"><div class="form-grid">' +
    selectField('کتاب منبع', 'bookId', books, true) + selectField('شهید مرتبط (اختیاری)', 'martyrId', martyrs) +
    field('عنوان مطلب', 'title', 'مثلاً خاطره دوران نوجوانی', 'text', true) +
    selectField('نوع مطلب', 'contentType', ['زندگی‌نامه','خاطره','وصیت‌نامه','نامه','روایت عملیات','سند تاریخی','مصاحبه','معرفی شخصیت','اطلاعات خانواده','اشاره کوتاه به شهید','سایر'].map((x) => ({value:x,label:x}))) +
    field('شماره صفحه / بازه صفحات', 'pageReferenceRaw', 'عین عبارت منبع؛ مانند ۱۲۳ تا ۱۲۷', 'text', true) +
    area('خلاصه پژوهشی', 'researchSummary', 'خلاصه را با زبان خود بنویسید.', 3) + area('یادداشت پژوهشگر', 'researcherNote', 'اختیاری', 2) +
    '</div><div class="form-actions"><button class="primary" ' + (!books.length ? 'disabled' : '') + '>ذخیره یادداشت</button></div></form></article></section>' +
    '<section class="panel"><div class="panel-heading"><h2>ارتباط‌های ثبت‌شده</h2><span class="muted">' + fa(state.links.length) + ' مورد</span></div>' +
    (links ? '<div class="record-list">' + links + '</div>' : empty('هنوز ارتباطی ثبت نشده است.')) + '</section>' +
    '<section class="panel"><div class="panel-heading"><h2>مطالب پژوهشی</h2><span class="muted">' + fa(state.excerpts.length) + ' مورد</span></div>' +
    (excerpts ? '<div class="record-list">' + excerpts + '</div>' : empty('هنوز مطلبی ثبت نشده است.')) + '</section>');
}

function renderReview(): void {
  const pendingLinks = state.links.filter((x) => x.reviewStatus === 'proposed' || x.reviewStatus === 'in_review' || x.reviewStatus === 'conflict');
  const pendingExcerpts = state.excerpts.filter((x) => x.reviewStatus === 'draft' || x.reviewStatus === 'needs_review' || x.reviewStatus === 'conflict');
  const pendingMartyrs = state.martyrs.filter((x) => x.identityReviewStatus === 'needs_review' || x.identityReviewStatus === 'conflict');
  const linkRows = pendingLinks.map((x) => '<article class="record-card"><h3>' + esc(bookTitle(x.bookId)) + ' ↔ ' + esc(martyrName(x.martyrId)) + '</h3><p>' + esc(x.evidenceReferenceRaw) + ' · ' + esc(x.description) + '</p><div class="record-meta">' + pill(x.reviewStatus) + '</div><div class="form-actions"><button class="primary" data-action="approve-link" data-id="' + esc(x.id) + '">تأیید ارتباط</button><button class="secondary" data-action="reject-link" data-id="' + esc(x.id) + '">رد با دلیل</button></div></article>').join('');
  const excerptRows = pendingExcerpts.map((x) => '<article class="record-card"><h3>' + esc(x.title) + '</h3><p>' + esc(bookTitle(x.bookId)) + ' · صفحه ' + esc(x.pageReferenceRaw) + '</p><div class="record-meta">' + pill(x.reviewStatus) + '</div><div class="form-actions"><button class="primary" data-action="approve-excerpt" data-id="' + esc(x.id) + '">تأیید یادداشت</button><button class="secondary" data-action="reject-excerpt" data-id="' + esc(x.id) + '">رد با دلیل</button></div></article>').join('');
  const martyrRows = pendingMartyrs.map((x) => '<article class="record-card"><h3>' + esc(x.fullNameRaw) + '</h3><p>' + esc(x.identityEvidenceRaw) + '</p><div class="form-actions"><button class="primary" data-action="approve-martyr" data-id="' + esc(x.id) + '">تأیید هویت</button><button class="secondary" data-action="reject-martyr" data-id="' + esc(x.id) + '">رد با دلیل</button></div></article>').join('');
  layout('<section class="page-heading"><div><span class="eyebrow">کنترل انسانی</span><h1>صف بررسی</h1><p>هیچ ارتباط یا مطلب پژوهشی بدون تصمیم انسانی قطعی نمی‌شود. تأیید نیز مجوز انتشار عمومی نیست.</p></div></section>' +
    '<section class="panel"><h2>ارتباط‌های کتاب و شهید</h2>' + (linkRows ? '<div class="record-list">' + linkRows + '</div>' : empty('ارتباط منتظر بررسی وجود ندارد.')) + '</section>' +
    '<section class="panel"><h2>مطالب پژوهشی</h2>' + (excerptRows ? '<div class="record-list">' + excerptRows + '</div>' : empty('مطلب منتظر بررسی وجود ندارد.')) + '</section>' +
    '<section class="panel"><h2>هویت پرونده شهدا</h2>' + (martyrRows ? '<div class="record-list">' + martyrRows + '</div>' : empty('پرونده منتظر بررسی وجود ندارد.')) + '</section>');
}

function renderImports(): void {
  const sheets = state.parsedWorkbook?.sheets ?? [];
  const active = sheets.find((sheet) => sheet.name === state.activeSheetName) ?? sheets[0];
  const headerRowNumber = Math.max(1, Number(state.headerRowNumber) || 1);
  const header = active?.rows.find((row) => row.rowNumber === headerRowNumber);
  const columns = header?.values ?? active?.rows[0]?.values ?? [];
  const columnOptions = columns.map((name, index) => ({
    value: String(index),
    label: 'ستون ' + fa(index + 1) + ' · ' + (name.trim() || 'بدون عنوان'),
  }));
  const mappingFields = [
    {key:'title',label:'عنوان کتاب'}, {key:'authors',label:'نویسنده / پدیدآورنده'},
    {key:'publisher',label:'ناشر'}, {key:'publicationYear',label:'سال انتشار'},
    {key:'edition',label:'نوبت چاپ'}, {key:'isbn',label:'شابک'},
    {key:'category',label:'گروه موضوعی'}, {key:'martyrName',label:'نام شهید / نام‌های مرتبط'},
    {key:'graveLocation',label:'نشانی مزار'}, {key:'pageReference',label:'شماره صفحه / ارجاع'},
  ];
  const mappingControls = mappingFields.map((item) =>
    selectField(item.label, 'map-' + item.key, columnOptions, false, state.fieldMapping[item.key] ?? '')
  ).join('');
  const mappedFields = mappingFields.filter((item) => state.fieldMapping[item.key] !== undefined && state.fieldMapping[item.key] !== '');
  const mappedPreview = active && mappedFields.length
    ? '<div class="table-wrap"><table><thead><tr><th>ردیف</th>' + mappedFields.map((item) => '<th>' + esc(item.label) + '</th>').join('') + '</tr></thead><tbody>' +
      active.rows.filter((row) => row.rowNumber > headerRowNumber).slice(0, 5).map((row) =>
        '<tr><td>' + fa(row.rowNumber) + '</td>' + mappedFields.map((item) => '<td>' + esc(row.values[Number(state.fieldMapping[item.key])] ?? '') + '</td>').join('') + '</tr>'
      ).join('') + '</tbody></table></div>' : '';
  const preview = active ? active.rows.slice(0, 12).map((row) => '<tr><td>' + fa(row.rowNumber) + '</td>' + row.values.slice(0, 8).map((cell) => '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('') : '';
  const sheetOptions = sheets.map((sheet) => ({value:sheet.name,label:sheet.name + ' · ' + sheet.state + ' · ' + fa(sheet.rows.length) + ' ردیف'}));
  layout('<section class="page-heading"><div><span class="eyebrow">ورود کنترل‌شده</span><h1>ممیزی و ورود Excel</h1><p>فایل فقط در مرورگر خوانده می‌شود؛ ابتدا شیت خام و منشأ آن برای بررسی ذخیره می‌شود.</p></div></section>' +
    '<section class="notice notice-amber"><b>حفاظت از مرجع:</b> فایل Excel اصلی تغییر نمی‌کند و هیچ ردیفی به کتاب، شهید یا ارتباط قطعی تبدیل نمی‌شود. SHA-256 مرجع: ' + EXPECTED_REFERENCE_SHA256 + '</section>' +
    '<section class="panel"><div class="form-grid"><label class="field"><span>انتخاب فایل XLSX</span><input type="file" id="xlsx-file" accept=".xlsx"></label></div>' +
    (state.parsedWorkbook ? '<div class="panel-heading"><h2>' + esc(state.parsedWorkbook.fileName) + '</h2><span class="muted">' + fa(state.parsedWorkbook.fileSize) + ' بایت · SHA-256 ' + esc(state.parsedWorkbook.sha256) + '</span></div>' +
      '<div class="form-grid two">' + selectField('شیت برای بررسی', 'sheetName', sheetOptions) + field('شماره ردیف سرستون', 'headerRowNumber', '۱', 'number', false, String(headerRowNumber)) + '</div>' +
      '<p class="muted">تعداد شیت‌ها: ' + fa(sheets.length) + ' · نگاشت زیر فقط برای ثبت و بازبینی منشأ است و هیچ رکورد نهایی نمی‌سازد.</p>' +
      '<section class="subpanel"><h3>نگاشت دستی ستون‌ها</h3><div class="form-grid two">' + mappingControls + '</div>' +
      '<p class="muted">ستون‌های انتخاب‌شده به‌صورت شماره و نام سرستون همراه بسته ورود ذخیره می‌شوند. تبدیل داده به کتاب، شهید یا ارتباط همچنان نیازمند مرحله مستقل و تأیید انسانی است.</p>' +
      mappedPreview + '</section>' +
      (active ? '<div class="table-wrap"><table><tbody>' + preview + '</tbody></table></div><div class="form-actions"><button class="primary" data-action="stage-import">ذخیره خام شیت و نگاشت برای بررسی</button></div>' : '') :
      '<p class="muted">فایل مرجع یا یک نسخه آزمایشی XLSX را انتخاب کنید.</p>') + '</section>' +
    '<section class="panel"><div class="panel-heading"><h2>بسته‌های ورود ثبت‌شده</h2><span class="muted">' + fa(state.imports.length) + ' بسته · ' + fa(state.sourceRows.length) + ' ردیف خام</span></div>' +
    (state.imports.length ? '<div class="record-list">' + state.imports.map((item) => '<article class="record-card"><h3>' + esc(item.fileName) + ' · ' + esc(item.sheetName) + '</h3><p>' + fa(item.rowCount) + ' ردیف · ' + esc(item.sourceStatus) + ' · ' + esc(item.sourceSha256) + '</p><p class="muted">نگاشت ثبت‌شده: ' + esc(Object.entries(item.fieldMapping).map(([key,value]) => key + ' → ' + (value === null ? 'نامشخص' : 'ستون ' + fa(Number(value) + 1))).join('؛ ') || 'تعریف‌نشده') + '</p></article>').join('') + '</div>' : empty('هنوز بسته ورودی ثبت نشده است.')) + '</section>');
  const sheetSelect = root!.querySelector<HTMLSelectElement>('select[name="sheetName"]');
  if (sheetSelect && state.activeSheetName) sheetSelect.value = state.activeSheetName;
}

function renderSettings(): void {
  const recentAudit = state.audit.slice(-12).reverse().map((item) => '<article class="record-card"><h3>' + esc(item.summary) + '</h3><p>' + esc(item.action) + ' · ' + esc(item.occurredAt) + '</p></article>').join('');
  const restorePreview = state.restorePreview
    ? '<section class="panel"><div class="panel-heading"><h2>پیش‌نمایش بازیابی</h2><span class="muted">' + esc(state.restorePreview.fileName) + '</span></div>' +
      '<p class="muted">فایل معتبر است. هیچ داده‌ای هنوز تغییر نکرده است. بازیابی افزایشی است و شناسه‌های موجود بازنویسی نمی‌شوند.</p>' +
      '<div class="record-meta">' + state.restorePreview.counts.map((item) => '<span>' + esc(item.label) + ': ' + fa(item.count) + '</span>').join(' · ') + '</div>' +
      '<p><b>مجموع رکوردهای بسته:</b> ' + fa(state.restorePreview.total) + '</p>' +
      '<div class="form-actions"><button type="button" class="primary" data-action="apply-restore">تأیید و اجرای بازیابی افزایشی</button><button type="button" class="secondary" data-action="cancel-restore">لغو</button></div></section>'
    : '';
  layout('<section class="page-heading"><div><span class="eyebrow">حفاظت و نگهداری</span><h1>پشتیبان و تنظیمات</h1><p>اطلاعات در IndexedDB همین مرورگر ذخیره می‌شوند؛ نسخه پشتیبان منظم ضروری است.</p></div></section>' +
    '<section class="two-column"><article class="panel"><h2>پشتیبان کامل</h2><p>خروجی JSON شامل کتاب‌ها، جلدها، پرونده شهدا، ارتباط‌ها، یادداشت‌ها و منشأ ورود است.</p><button class="primary" data-action="backup">دریافت پشتیبان JSON</button></article>' +
    '<article class="panel"><h2>خروجی موجودی</h2><p>فایل CSV برای بازبینی و گزارش؛ جایگزین Excel مرجع نیست.</p><button class="secondary" data-action="csv">دریافت CSV کتاب و جلد</button></article></section>' +
    '<section class="panel"><h2>بازیابی پشتیبان</h2><p class="muted">ابتدا فایل اعتبارسنجی و تعداد رکوردها پیش‌نمایش می‌شود؛ تا زدن دکمه تأیید هیچ تغییری اعمال نمی‌شود.</p><label class="field"><span>انتخاب فایل JSON پشتیبان</span><input type="file" id="backup-file" accept=".json,application/json"></label></section>' + restorePreview +
    '<section class="panel"><h2>آخرین رویدادها</h2>' + (recentAudit ? '<div class="record-list">' + recentAudit + '</div>' : empty('هنوز رویدادی ثبت نشده است.')) + '</section>' +
    '<section class="notice notice-amber">نسخه فعلی احراز هویت و نقش‌های چندکاربره ندارد. برای اطلاعات واقعی محرمانه یا دستگاه مشترک، تا تکمیل بررسی امنیتی و آزمون Android از آن استفاده نکنید.</section>');
}

function render(): void {
  switch (state.view) {
    case 'home': renderHome(); break;
    case 'books': renderBooks(); break;
    case 'martyrs': renderMartyrs(); break;
    case 'search': renderSearch(); break;
    case 'research': renderResearch(); break;
    case 'review': renderReview(); break;
    case 'imports': renderImports(); break;
    case 'settings': renderSettings(); break;
  }
}

async function handleSubmit(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const type = form.dataset.form;
  if (type === 'book-edit') {
    const existing = state.books.find((item) => item.id === form.dataset.id);
    if (!existing) { notify('کتاب برای ویرایش پیدا نشد.', true); return; }
    const title = val(data, 'titleRaw').trim();
    const categoryCode = val(data, 'categoryCode');
    const errors = validateBookInput({title, categoryCode});
    if (errors.length) { notify(errors.join('؛ '), true); return; }
    const duplicates = findExactTitleDuplicates(state.books.filter((item) => item.id !== existing.id), title);
    if (duplicates.length && !window.confirm('عنوان مشابه دیگری در فهرست وجود دارد. بدون ادغام خودکار، تغییرات ذخیره شود؟')) return;
    const copies = state.copies.filter((copy) => copy.bookId === existing.id);
    if (categoryCode !== existing.categoryCode && copies.some((copy) =>
      copy.location && !locationFitsCategory(categoryCode, copy.location.shelf, copy.location.tier)
    ) && !window.confirm('دسته جدید با جانمایی دست‌کم یکی از جلدهای این کتاب سازگار نیست. آیا با حفظ محل‌های فعلی ذخیره شود؟')) return;
    const updated: BookRecord = {
      ...existing,
      titleRaw: title, titleDisplay: title,
      authorsRaw: val(data, 'authorsRaw'), publisherRaw: val(data, 'publisherRaw'),
      publicationYearRaw: val(data, 'publicationYearRaw'), editionRaw: val(data, 'editionRaw'),
      isbnRaw: val(data, 'isbnRaw'), categoryCode, descriptionRaw: val(data, 'descriptionRaw'),
      sourceEvidenceRaw: val(data, 'sourceEvidenceRaw'), updatedAt: now(),
    };
    await saveBookWithCopy(updated);
    state.editingBookId = undefined;
    await refreshData();
    state.view = 'books';
    notify('مشخصات کتاب به‌روزرسانی شد؛ شناسه، وضعیت بررسی و جلدهای فیزیکی حفظ شدند.');
    return;
  }
  if (type === 'book') {
    const title = val(data, 'titleRaw').trim();
    const categoryCode = val(data, 'categoryCode');
    const errors = validateBookInput({title, categoryCode});
    if (errors.length) { notify(errors.join('؛ '), true); return; }
    const duplicates = findExactTitleDuplicates(state.books, title);
    if (duplicates.length && !window.confirm('عنوان مشابه در فهرست وجود دارد. بدون ادغام خودکار، ثبت رکورد جدید انجام شود؟')) return;
    const time = now();
    const book: BookRecord = {
      id: createId('BK'), titleRaw: title, titleDisplay: title, authorsRaw: val(data, 'authorsRaw'),
      publisherRaw: val(data, 'publisherRaw'), publicationYearRaw: val(data, 'publicationYearRaw'),
      editionRaw: val(data, 'editionRaw'), isbnRaw: val(data, 'isbnRaw'), categoryCode,
      keywords: [], descriptionRaw: val(data, 'descriptionRaw'), sourceEvidenceRaw: val(data, 'sourceEvidenceRaw'),
      reviewStatus: 'needs_review', accessLevel: 'internal', publicationStatus: 'blocked',
      createdAt: time, updatedAt: time,
    };
    let copy: BookCopy | undefined;
    if (checked(data, 'addCopy')) {
      const shelf = val(data, 'shelf') as typeof SHELVES[number];
      const tier = val(data, 'tier') as typeof TIERS[number];
      if (!shelf || !tier) { notify('برای ثبت جلد فیزیکی، قفسه و طبقه را انتخاب کنید.', true); return; }
      const location = makeLocation(shelf, tier);
      if (!locationFitsCategory(categoryCode, shelf, tier) && !window.confirm('این محل با جانمایی موضوعی ثبت‌شده تطبیق ندارد. با ثبت محل واقعی ادامه می‌دهید؟')) return;
      copy = {
        id: createId('CP'), bookId: book.id, observation: 'observed', location,
        physicalCondition: 'unknown', observedAt: time, observedBy: LOCAL_ACTOR,
        note: val(data, 'copyNote'), reviewStatus: 'needs_review',
        movementHistory: [{at:time, to:location.code, note:'ثبت اولیه نسخه فیزیکی'}],
        createdAt: time, updatedAt: time,
      };
    }
    await saveBookWithCopy(book, copy);
    state.view = 'books'; await refreshData(); notify('کتاب ثبت شد؛ وضعیت بررسی آن نیازمند بازبینی است.');
    return;
  }
  if (type === 'move') {
    const copy = state.copies.find((item) => item.id === state.movingCopyId);
    if (!copy) { notify('نسخه فیزیکی انتخاب‌شده پیدا نشد.', true); return; }
    const shelf = val(data, 'shelf') as typeof SHELVES[number];
    const tier = val(data, 'tier') as typeof TIERS[number];
    if (!shelf || !tier) { notify('قفسه و طبقه جدید را انتخاب کنید.', true); return; }
    const location = makeLocation(shelf, tier);
    if (copy.location?.code === location.code) { notify('این جلد هم‌اکنون در همین محل ثبت شده است.', true); return; }
    const book = state.books.find((item) => item.id === copy.bookId);
    if (book && !locationFitsCategory(book.categoryCode, shelf, tier) &&
      !window.confirm('محل انتخاب‌شده با جانمایی موضوعی ثبت‌شده تطبیق ندارد. آیا محل واقعی را با همین وضعیت ثبت می‌کنید؟')) return;
    const time = now();
    const updated: BookCopy = {...copy, location, updatedAt:time, movementHistory:[...copy.movementHistory,{at:time,from:copy.location?.code,to:location.code,note:val(data,'note')}]};
    await saveCopy(updated, 'copy_location_moved');
    state.movingCopyId = undefined; await refreshData(); notify('محل جدید جلد ثبت شد؛ شناسه کتاب و جلد ثابت ماند.');
    return;
  }
  if (type === 'martyr') {
    const fullNameRaw = val(data, 'fullNameRaw').trim();
    const evidence = val(data, 'identityEvidenceRaw').trim();
    if (!fullNameRaw || !evidence) { notify('نام کامل و منبع/شاهد مشخصات الزامی است.', true); return; }
    const time = now();
    const martyr: MartyrRecord = {
      id:createId('MT'), fullNameRaw, firstNameRaw:val(data,'firstNameRaw'), lastNameRaw:val(data,'lastNameRaw'),
      alternateNamesRaw:val(data,'alternateNamesRaw').split(/[،,]/).map((x)=>x.trim()).filter(Boolean),
      sectionRaw:val(data,'sectionRaw'), graveRowRaw:val(data,'graveRowRaw'), graveNumberRaw:val(data,'graveNumberRaw'),
      identityEvidenceRaw:evidence, identityReviewStatus:'needs_review', accessLevel:'internal', createdAt:time, updatedAt:time,
    };
    await saveMartyr(martyr); await refreshData(); notify('پرونده شهید ثبت شد و برای بررسی باقی ماند.'); return;
  }
  if (type === 'link') {
    const bookId = val(data,'bookId'); const martyrId = val(data,'martyrId');
    const evidenceReferenceRaw = val(data,'evidenceReferenceRaw').trim();
    if (!bookId || !martyrId || !evidenceReferenceRaw) { notify('کتاب، شهید و ارجاع منبع الزامی است.', true); return; }
    const time = now();
    const link: BookMartyrLink = {
      id:createId('LNK'), bookId, martyrId, relationshipType:val(data,'relationshipType'),
      evidenceReferenceRaw, description:val(data,'description'), reviewStatus:'proposed',
      reviewNote:'', createdAt:time, updatedAt:time,
    };
    await saveLink(link); await refreshData(); notify('ارتباط به‌صورت پیشنهاد ثبت شد؛ هنوز قطعی نیست.'); return;
  }
  if (type === 'excerpt') {
    const bookId = val(data,'bookId'); const title = val(data,'title').trim(); const page = val(data,'pageReferenceRaw').trim();
    if (!bookId || !title || !page) { notify('کتاب، عنوان مطلب و ارجاع صفحه الزامی است.', true); return; }
    const time = now();
    const excerpt: ExtractedItem = {
      id:createId('EXT'), bookId, martyrId:val(data,'martyrId') || undefined, title,
      contentType:val(data,'contentType'), pageReferenceRaw:page, researchSummary:val(data,'researchSummary'),
      researcherNote:val(data,'researcherNote'), keywords:[], reviewStatus:'draft', accessLevel:'internal',
      publicationStatus:'blocked', createdAt:time, updatedAt:time,
    };
    await saveExcerpt(excerpt); await refreshData(); notify('یادداشت پژوهشی ذخیره شد و برای بررسی باقی ماند.'); return;
  }
  if (type === 'search') {
    const query = normalizePersian(val(data,'q').trim());
    const hits = [
      ...state.books.filter((x) => normalizePersian([x.titleRaw,x.authorsRaw,x.publisherRaw,x.descriptionRaw].join(' ')).includes(query)).map((x) => {
        const related = linksForBook(state.links, x.id);
        const relatedHtml = related.map((link) => '<div class="related-link-item"><span>' + esc(martyrName(link.martyrId)) + '</span>' + pill(link.reviewStatus) + '</div>').join('');
        return '<article class="record-card"><h3>' + esc(x.titleDisplay || x.titleRaw) + '</h3><p>' + esc(x.authorsRaw) + ' · ' + esc(categoryLabel(x.categoryCode)) + '</p>' + pill(x.reviewStatus) +
          (relatedHtml ? '<div class="related-links"><span class="muted">شهدا و وضعیت ارتباط</span><div class="related-link-list">' + relatedHtml + '</div></div>' : '') + '</article>';
      }),
      ...state.martyrs.filter((x) => normalizePersian([x.fullNameRaw,...x.alternateNamesRaw].join(' ')).includes(query)).map((x) => {
        const related = linksForMartyr(state.links, x.id);
        const relatedHtml = related.map((link) => '<div class="related-link-item"><span>' + esc(bookTitle(link.bookId)) + '</span>' + pill(link.reviewStatus) + '</div>').join('');
        return '<article class="record-card"><h3>' + esc(x.fullNameRaw) + '</h3><p>پرونده شهید · ' + esc(x.identityEvidenceRaw) + '</p>' + pill(x.identityReviewStatus) +
          (relatedHtml ? '<div class="related-links"><span class="muted">کتاب‌های مرتبط و وضعیت ارتباط</span><div class="related-link-list">' + relatedHtml + '</div></div>' : '') + '</article>';
      }),
      ...state.excerpts.filter((x) => normalizePersian([x.title,x.researchSummary,x.researcherNote,x.pageReferenceRaw].join(' ')).includes(query)).map((x) => '<article class="record-card"><h3>' + esc(x.title) + '</h3><p>' + esc(bookTitle(x.bookId)) + ' · صفحه ' + esc(x.pageReferenceRaw) + '</p>' + pill(x.reviewStatus) + '</article>'),
    ];
    const results = root!.querySelector<HTMLElement>('#search-results');
    if (results) results.innerHTML = hits.length ? '<div class="record-list">' + hits.join('') + '</div>' : empty('نتیجه‌ای پیدا نشد.');
  }
}

async function stageActiveSheet(): Promise<void> {
  const workbook = state.parsedWorkbook;
  const sheet = workbook?.sheets.find((item) => item.name === state.activeSheetName) ?? workbook?.sheets[0];
  if (!workbook || !sheet) { notify('ابتدا فایل و شیت را انتخاب کنید.', true); return; }
  if (await hasImportHashAndSheet(workbook.sha256, sheet.name)) { notify('این فایل و شیت قبلاً وارد شده‌اند؛ از ثبت تکراری جلوگیری شد.', true); return; }
  const headerRowNumber = Math.max(1, Number(state.headerRowNumber) || 1);
  const header = sheet.rows.find((row) => row.rowNumber === headerRowNumber);
  const rowsToSave = sheet.rows.filter((row) => row.rowNumber > headerRowNumber);
  const batchId = createId('IMP');
  const rawRows: RawSourceRow[] = rowsToSave.map((row) => ({
    id:batchId + '-' + row.rowNumber, batchId, rowNumber:row.rowNumber, values:row.values, formulas:row.formulas,
  }));
  const emptyRowCount = rawRows.filter((row) => row.values.every((cell) => !cell.trim())).length;
  const batch: ImportBatch = {
    id:batchId, fileName:workbook.fileName, fileSize:workbook.fileSize, sourceSha256:workbook.sha256,
    expectedSha256:EXPECTED_REFERENCE_SHA256, sourceStatus:workbook.sha256 === EXPECTED_REFERENCE_SHA256 ? 'verified_reference' : 'unverified_source',
    sheetName:sheet.name, sheetState:sheet.state, headerRowNumber, headers:header?.values ?? [],
    fieldMapping:Object.fromEntries(Object.entries(state.fieldMapping).map(([key,value]) => [key, Number(value)])), rowCount:rawRows.length, emptyRowCount, formulaCount:sheet.formulaCount,
    status:'staged_for_review', importedAt:now(),
  };
  await stageImport(batch, rawRows);
  await refreshData();
  notify('شیت به‌صورت خام ذخیره شد: ' + fa(rawRows.length) + ' ردیف. هیچ رکورد نهایی ساخته نشد.');
}

root!.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'navigate') {
    state.view = button.dataset.view as View; state.editingBookId = undefined; state.movingCopyId = undefined; state.message = ''; state.error = false; render(); return;
  }
  if (action === 'backup') { await downloadFullBackup(); notify('پشتیبان JSON آماده شد. آن را در محل امن نگهداری کنید.'); return; }
  if (action === 'csv') { await downloadInventoryCsv(); notify('خروجی CSV آماده شد.'); return; }
  if (action === 'move-copy') { state.movingCopyId = button.dataset.id; renderBooks(); return; }
  if (action === 'cancel-move') { state.movingCopyId = undefined; renderBooks(); return; }
  if (action === 'edit-book') { state.editingBookId = button.dataset.id; state.message = ''; renderBooks(); return; }
  if (action === 'cancel-edit-book') { state.editingBookId = undefined; renderBooks(); return; }
  if (action === 'stage-import') { await stageActiveSheet(); return; }
  if (action === 'cancel-restore') { state.restorePreview = undefined; renderSettings(); return; }
  if (action === 'apply-restore') {
    if (!state.restorePreview) { notify('پیش‌نمایش بازیابی موجود نیست.', true); return; }
    try {
      const result = await mergeBackupText(state.restorePreview.rawText);
      state.restorePreview = undefined;
      await refreshData();
      notify('بازیابی افزایشی انجام شد؛ ' + fa(result.added) + ' رکورد افزوده و ' + fa(result.conflicts) + ' تعارض کنار گذاشته شد.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'بازیابی پشتیبان ناموفق بود.', true);
    }
    return;
  }
  const id = button.dataset.id;
  if (!id) return;
  const note = window.prompt('یادداشت بررسی را وارد کنید:') ?? '';
  if (!note.trim() && (action?.startsWith('reject-'))) { notify('برای رد، ثبت دلیل الزامی است.', true); return; }
  if (action === 'approve-link' || action === 'reject-link') {
    const item = state.links.find((x) => x.id === id); if (!item) return;
    await updateLinkStatus(item, action === 'approve-link' ? 'confirmed' : 'rejected', note);
  } else if (action === 'approve-excerpt' || action === 'reject-excerpt') {
    const item = state.excerpts.find((x) => x.id === id); if (!item) return;
    await updateExcerptStatus(item, action === 'approve-excerpt' ? 'verified' : 'rejected', note);
  } else if (action === 'approve-martyr' || action === 'reject-martyr') {
    const item = state.martyrs.find((x) => x.id === id); if (!item) return;
    await updateMartyrStatus(item, action === 'approve-martyr' ? 'verified' : 'rejected', note);
  } else return;
  await refreshData(); notify('نتیجه بررسی ثبت شد. وضعیت انتشار همچنان مسدود است.');
});

root!.addEventListener('submit', async (event) => {
  const form = event.target as HTMLFormElement;
  if (!form.matches('form[data-form]')) return;
  event.preventDefault();
  try { await handleSubmit(form); }
  catch (error) { notify(error instanceof Error ? error.message : 'ثبت اطلاعات ناموفق بود.', true); }
});

root!.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === 'xlsx-file' && target instanceof HTMLInputElement && target.files?.[0]) {
    try {
      state.parsedWorkbook = await parseXlsxFile(target.files[0]);
      state.activeSheetName = state.parsedWorkbook.sheets[0]?.name;
      state.headerRowNumber = 1;
      state.fieldMapping = {};
      notify('فایل خوانده شد؛ شیت، ردیف سرستون و نگاشت ستون‌ها را کنترل کنید.');
    } catch (error) { notify(error instanceof Error ? error.message : 'خواندن فایل XLSX ناموفق بود.', true); }
    return;
  }
  if (target.name === 'sheetName') {
    state.activeSheetName = target.value;
    state.fieldMapping = {};
    renderImports(); return;
  }
  if (target.name === 'headerRowNumber') {
    state.headerRowNumber = Math.max(1, Number(target.value) || 1);
    state.fieldMapping = {};
    renderImports(); return;
  }
  if (target.name.startsWith('map-')) {
    const key = target.name.slice(4);
    if (target.value === '') delete state.fieldMapping[key];
    else state.fieldMapping[key] = target.value;
    renderImports(); return;
  }
  if (target.id === 'backup-file' && target instanceof HTMLInputElement && target.files?.[0]) {
    try {
      const rawText = await target.files[0].text();
      const parsed: unknown = JSON.parse(rawText);
      if (!validateSnapshot(parsed)) throw new Error('ساختار پشتیبان معتبر نیست یا شناسه‌های تکراری/نسخه یتیم دارد.');
      const stores = (parsed as {stores: Record<string, unknown[]>}).stores;
      const labels: Record<string,string> = {
        books:'کتاب‌ها', copies:'جلدهای فیزیکی', martyrs:'پرونده شهدا', links:'ارتباط‌ها',
        excerpts:'مطالب پژوهشی', imports:'بسته‌های ورود', sourceRows:'ردیف‌های خام', audit:'رویدادهای ممیزی',
      };
      const counts = Object.entries(stores).map(([key, records]) => ({label:labels[key] ?? key, count:Array.isArray(records) ? records.length : 0}));
      state.restorePreview = {
        fileName: target.files[0].name, rawText, counts,
        total: counts.reduce((sum, item) => sum + item.count, 0),
      };
      notify('پشتیبان اعتبارسنجی شد؛ برای اعمال بازیابی، پیش‌نمایش را بررسی و تأیید کنید.');
    } catch (error) {
      state.restorePreview = undefined;
      notify(error instanceof Error ? error.message : 'خواندن یا اعتبارسنجی پشتیبان ناموفق بود.', true);
    }
  }
});

async function start(): Promise<void> {
  await refreshData();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}
void start().catch((error) => notify(error instanceof Error ? error.message : 'آغاز برنامه ناموفق بود.', true));
