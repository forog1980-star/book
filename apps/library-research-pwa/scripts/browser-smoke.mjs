import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = 4175;
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(base + '/');
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'local HTTP server did not become ready');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(base + '/');
  await page.getByRole('heading', { name: 'خانه' }).waitFor();

  await page.evaluate(async () => { await document.fonts.ready; });
  const visual = await page.locator('body').evaluate((body) => ({
    background: getComputedStyle(body).backgroundColor,
    font: getComputedStyle(body).fontFamily,
    vazirmatnLoaded: document.fonts.check('16px Vazirmatn', 'سلام'),
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(visual.background, 'rgb(251, 248, 243)', 'paper background should be applied');
  assert.doesNotMatch(visual.font, /Tahoma|Arial/i, 'disallowed Latin fallback fonts must not appear');
  assert.match(visual.font, /Vazirmatn|IRANSansX|IRANYekanX|Estedad|Sahel|Shabnam|Noto/i);
  assert.equal(visual.vazirmatnLoaded, true, 'bundled Vazirmatn Persian font should load in Chromium');
  assert.ok(visual.scrollWidth <= visual.width + 2, 'mobile layout should not overflow horizontally');

  const navGeometry = await page.locator('nav.main-nav').evaluate((nav) =>
    Array.from(nav.querySelectorAll('button')).map((button) => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        label: button.textContent?.trim(),
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        hit: hit?.textContent?.trim(),
      };
    })
  );
  assert.ok(navGeometry.every((item) => item.label === item.hit), 'mobile navigation hit targets must not overlap');
  const booksNavBeforeCreate = page.locator('nav.main-nav [data-view="books"]');
  const booksNavBeforeCreateBox = await booksNavBeforeCreate.boundingBox();
  assert.ok(booksNavBeforeCreateBox, 'books navigation should remain visible before book creation');
  await page.mouse.click(booksNavBeforeCreateBox.x + booksNavBeforeCreateBox.width / 2, booksNavBeforeCreateBox.y + booksNavBeforeCreateBox.height / 2);
  const bookTitle = 'کتاب آزمایش مرورگر';
  const bookForm = page.locator('form[data-form="book"]');
  await bookForm.locator('[name="titleRaw"]').fill(bookTitle);
  await bookForm.locator('[name="authorsRaw"]').fill('نویسنده آزمایشی');
  await bookForm.locator('[name="publisherRaw"]').fill('ناشر آزمایشی');
  await bookForm.locator('[name="categoryCode"]').selectOption('R');
  await bookForm.locator('[name="sourceEvidenceRaw"]').fill('آزمون مرورگر؛ شناسنامه کتاب');
  await bookForm.locator('button.primary').click();
  const createdCard = page.locator('.record-card').filter({ has: page.locator('h3', { hasText: bookTitle }) });
  await createdCard.waitFor();

  await createdCard.locator('[data-action="edit-book"]').click();
  const editForm = page.locator('form[data-form="book-edit"]');
  await editForm.locator('[name="publisherRaw"]').fill('ناشر ویرایش‌شده');
  await editForm.locator('button.primary').click();
  await page.locator('.record-card').filter({ hasText: 'ناشر ویرایش‌شده' }).waitFor();

  await page.reload();
  await page.getByRole('heading', { name: 'خانه' }).waitFor();
  await page.locator('nav.main-nav [data-view="books"]').click();
  const persistedCard = page.locator('.record-card').filter({ has: page.locator('h3', { hasText: bookTitle }) });
  await persistedCard.waitFor();
  await persistedCard.getByText('ناشر ویرایش‌شده').waitFor();

  await page.locator('[data-action="navigate"][data-view="settings"]').click();
  const stamp = new Date().toISOString();
  const backupBook = {
    id: 'BK-RESTORE-PLAYWRIGHT',
    titleRaw: 'کتاب بازیابی آزمایشی',
    titleDisplay: 'کتاب بازیابی آزمایشی',
    authorsRaw: 'نویسنده پشتیبان',
    publisherRaw: 'ناشر پشتیبان',
    publicationYearRaw: '۱۴۰۰',
    editionRaw: '',
    isbnRaw: '',
    categoryCode: 'R',
    keywords: [],
    descriptionRaw: '',
    sourceEvidenceRaw: 'منبع پشتیبان آزمایشی',
    reviewStatus: 'needs_review',
    accessLevel: 'internal',
    publicationStatus: 'blocked',
    createdAt: stamp,
    updatedAt: stamp,
  };
  const snapshot = {
    appId: 'markaz-asnad-library-research-pwa',
    schemaVersion: 1,
    exportedAt: stamp,
    stores: {
      books: [backupBook], copies: [], martyrs: [], links: [],
      excerpts: [], imports: [], sourceRows: [], audit: [],
    },
  };
  await page.locator('#backup-file').setInputFiles({
    name: 'browser-test-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(snapshot)),
  });
  await page.getByRole('heading', { name: 'پیش‌نمایش بازیابی' }).waitFor();
  await page.getByText('کتاب‌ها: ۱').waitFor();
  await page.locator('[data-action="apply-restore"]').click();
  await page.getByText(/بازیابی افزایشی انجام شد/).waitFor();
  await page.locator('[data-action="navigate"][data-view="books"]').click();
  await page.locator('.record-card').filter({ has: page.locator('h3', { hasText: 'کتاب بازیابی آزمایشی' }) }).waitFor();

  // Exercise XLSX parsing and manual mapping with a synthetic five-sheet fixture.
  // Operational/private workbooks are not included in this public repository or CI.
  await page.locator('[data-view="imports"]').click();
  const fixturePath = 'tests/fixtures/workbook-five-sheets.synthetic.xlsx.b64';
  const fixtureBuffer = Buffer.from(readFileSync(fixturePath, 'utf8').trim(), 'base64');
  await page.locator('#xlsx-file').setInputFiles({
    name: 'workbook-fixture-five-sheets.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: fixtureBuffer,
  });
  await page.getByText('فایل خوانده شد', { exact: false }).waitFor();
  const sheetSelect = page.locator('select[name="sheetName"]');
  assert.equal(await sheetSelect.locator('option:not([value=""])').count(), 5, 'synthetic workbook should expose five sheets');
  const booksSheetValue = await sheetSelect.locator('option').evaluateAll((options) => {
    const option = options.find((item) => item.textContent?.includes('فهرست کتاب‌ها'));
    return option?.value ?? '';
  });
  assert.ok(booksSheetValue, 'synthetic workbook should contain the books sheet');
  await sheetSelect.selectOption(booksSheetValue);
  await page.locator('select[name="map-title"]').selectOption('1');
  await page.locator('select[name="map-publisher"]').selectOption('2');
  const stageImportButton = page.locator('[data-action="stage-import"]');
  await stageImportButton.scrollIntoViewIfNeeded();
  await stageImportButton.evaluate((button) => button.click());
  const stagedBatch = page.locator('.record-card').filter({ hasText: 'unverified_source' });
  await stagedBatch.waitFor();
  const stagedBatchText = await stagedBatch.innerText();
  assert.match(stagedBatchText, /title\s*→\s*ستون\s*۲/, 'saved mapping should retain the selected title column');
  assert.match(stagedBatchText, /publisher\s*→\s*ستون\s*۳/, 'saved mapping should retain the selected publisher column');
  await page.evaluate(() => window.scrollTo(0, 0));
  const booksAfterImport = page.locator('nav.main-nav [data-view="books"]');
  const booksAfterImportState = await booksAfterImport.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      view: button.dataset.view,
      hitView: hit?.closest('button')?.dataset.view,
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  assert.equal(booksAfterImportState.view, 'books');
  assert.equal(booksAfterImportState.hitView, 'books', 'books nav center should hit the books button');
  assert.equal(booksAfterImportState.visible, true);
  // The first navigation above uses a real pointer click. After a long Excel preview,
  // trigger the same bubbled click event directly to avoid Playwright's RTL boundingBox offset.
  await booksAfterImport.evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector('.page-heading h1')?.textContent?.trim() === 'کتابخانه');
  const booksAfterImportTitles = await page.locator('.record-card h3').allTextContents();
  process.stdout.write('BOOKS_AFTER_IMPORT ' + JSON.stringify(booksAfterImportTitles) + '\\n');
  assert.ok(booksAfterImportTitles.some((value) => value.includes(bookTitle)), 'created book should remain visible after raw Excel staging');
  await page.locator('.record-card').filter({ has: page.locator('h3', { hasText: 'کتاب بازیابی آزمایشی' }) }).waitFor();
  await page.locator('.record-card').filter({ has: page.locator('h3', { hasText: 'کتاب بازیابی آزمایشی' }) }).waitFor();

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'خانه' }).waitFor();
  assert.equal(await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor), 'rgb(251, 248, 243)');
  const booksNavButton = page.locator('nav.main-nav [data-view="books"]');
  const booksNavBox = await booksNavButton.boundingBox();
  assert.ok(booksNavBox, 'books navigation button should have a visible hit area');
  await page.mouse.click(booksNavBox.x + booksNavBox.width / 2, booksNavBox.y + booksNavBox.height / 2);
  await page.locator('.page-heading h1').getByText('کتابخانه', { exact: true }).waitFor();
  await page.locator('.record-card').filter({ has: page.locator('h3', { hasText: 'کتاب بازیابی آزمایشی' }) }).waitFor();

  assert.deepEqual(pageErrors, [], 'browser runtime should not report uncaught page errors');
  process.stdout.write('Browser smoke passed: mobile layout, create/edit, IndexedDB persistence, validated backup preview/restore, synthetic five-sheet XLSX parsing/mapping/raw staging, and offline reload.\n');
  await context.setOffline(false);
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
