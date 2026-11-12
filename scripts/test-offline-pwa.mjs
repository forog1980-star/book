import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const projectRoot = process.cwd();
const distRoot = resolve(projectRoot, 'dist');
const readDist = (path) => readFile(join(distRoot, path), 'utf8');
const existsAndNonEmpty = async (path) => {
  const info = await stat(join(distRoot, path));
  assert.ok(info.isFile() && info.size > 0, 'dist/' + path + ' must exist and be non-empty');
  return info.size;
};

const html = await readDist('index.html');
const sourceHtml = await readFile(join(projectRoot, 'index.html'), 'utf8');
const serviceWorker = await readDist('sw.js');
const manifest = await readDist('manifest.webmanifest');
const mainEntry = await readFile(join(projectRoot, 'src/main.tsx'), 'utf8');
const githubSyncService = await readFile(join(projectRoot, 'src/utils/githubSyncService.ts'), 'utf8');
const subAppSw = await readFile(join(projectRoot, 'apps/library-research-pwa/sw.js'), 'utf8');

// 1 & 2. Service Worker version and Cache Name matching & upgrade from v14 -> v15
assert.ok(html.includes('id="root"'), 'production HTML must contain the application mount point');
assert.ok(manifest.includes('"start_url": "./"'), 'PWA start_url must remain scoped to the app');
assert.ok(
  serviceWorker.includes("const CACHE_PREFIX = 'markaz-asnad-main-book-'"),
  'main app cache must use its own namespace'
);
assert.ok(
  serviceWorker.includes("const CACHE_NAME = `${CACHE_PREFIX}v15`") ||
    serviceWorker.includes("const CACHE_NAME = 'markaz-asnad-main-book-v15'"),
  'main app Service Worker must use versioned cache markaz-asnad-main-book-v15'
);
assert.ok(
  !serviceWorker.includes('markaz-asnad-main-book-v14'),
  'new Service Worker cache name must be distinct from previous v14'
);
assert.ok(
  mainEntry.includes("./sw.js?v=15"),
  'application must register the matching Service Worker version (?v=15)'
);
assert.ok(
  githubSyncService.includes("export const OFFLINE_SW_CACHE_NAME = 'markaz-asnad-main-book-v15'"),
  'githubSyncService must target the exact active cache version v15'
);
assert.ok(
  githubSyncService.includes("export const OFFLINE_SW_SCRIPT_URL = './sw.js?v=15'"),
  'githubSyncService must target ./sw.js?v=15'
);

// 3 & 4. HTML, JS, CSS, bundled WOFF2 font, and /data/ existence & relative path correctness for /book/
const bundleRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map((match) => match[1])
  .filter((value) => !/^https?:/i.test(value) && /\/assets\/.*\.(?:m?js|css)(?:\?|$)/i.test(value));
assert.ok(
  bundleRefs.some((value) => /\.m?js(?:\?|$)/i.test(value)),
  'production HTML must reference a local JavaScript bundle'
);
assert.ok(
  bundleRefs.some((value) => /\.css(?:\?|$)/i.test(value)),
  'production HTML must reference a local CSS bundle'
);
for (const ref of bundleRefs) {
  assert.ok(
    ref.startsWith('./assets/'),
    'production bundle reference must be relative (./assets/...) for /book/ subpath compatibility: ' + ref
  );
}

let totalBundleBytes = 0;
let cssContent = '';
for (const reference of bundleRefs) {
  const clean = reference.split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
  const assetPath = resolve(distRoot, clean);
  assert.ok(assetPath.startsWith(distRoot + sep), 'asset path must stay inside dist: ' + reference);
  const info = await stat(assetPath);
  assert.ok(info.isFile() && info.size > 0, 'referenced production asset must exist: ' + reference);
  totalBundleBytes += info.size;
  if (clean.endsWith('.css')) {
    cssContent += await readFile(assetPath, 'utf8');
  }
}

// Verify bundled Vazirmatn WOFF2 font inside dist/assets/ and its relative reference in dist/assets/*.css
const distAssetsFiles = await readdir(join(distRoot, 'assets'));
const hashedFontFiles = distAssetsFiles.filter((name) => /^Vazirmatn-variable-.*\.woff2$/i.test(name));
assert.ok(
  hashedFontFiles.length > 0,
  'Vite build must output hashed Vazirmatn-variable-[hash].woff2 inside dist/assets/'
);
for (const fontFile of hashedFontFiles) {
  const fontBuffer = await readFile(join(distRoot, 'assets', fontFile));
  assert.ok(fontBuffer.length > 50000, 'bundled Vazirmatn woff2 must be non-empty and valid');
  assert.equal(fontBuffer.subarray(0, 4).toString('ascii'), 'wOF2', 'font file must have valid wOF2 binary header');
  assert.ok(
    cssContent.includes(`./${fontFile}`),
    `compiled CSS in dist/assets/ must reference ./${fontFile} relatively so /book/assets/ resolves properly`
  );
}
assert.ok(
  !cssContent.includes('url(./fonts/Vazirmatn') && !cssContent.includes("url('./fonts/Vazirmatn"),
  'compiled CSS inside dist/assets/ must not contain broken ./fonts/ relative path that would resolve to /book/assets/fonts/'
);

const fallbackFontSize = await existsAndNonEmpty('fonts/Vazirmatn-variable.woff2');
const dataBytes = (
  await Promise.all([
    existsAndNonEmpty('data/library_books.json'),
    existsAndNonEmpty('data/golzar_martyrs.xlsx'),
    existsAndNonEmpty('data/sooreh_mehr_book_martyr_research.json'),
  ])
).reduce((sum, size) => sum + size, 0);

// 5 & 6. Atomic SW install: no deleting old caches before install completes, no swallowing required asset errors
assert.ok(
  serviceWorker.includes('const LEGACY_CACHE_PREFIX = \'markaz-asnad-pwa-\''),
  'legacy main-app cache namespace must be explicit'
);
assert.ok(
  serviceWorker.includes('key.startsWith(CACHE_PREFIX)'),
  'activation cleanup must be restricted to owned cache keys'
);
assert.ok(
  serviceWorker.includes('key.startsWith(LEGACY_CACHE_PREFIX)'),
  'activation cleanup may remove only the documented legacy namespace'
);
assert.ok(
  serviceWorker.includes('await cache.addAll(appShellAssets)'),
  'installation must complete atomic app-shell precaching via cache.addAll before activation'
);
assert.ok(
  serviceWorker.includes('await caches.delete(CACHE_NAME)'),
  'failed installation must roll back and delete the incomplete new cache'
);
assert.ok(
  serviceWorker.includes('collectAppShellAssets'),
  'hashed Vite bundles and fonts must be discovered from production HTML and CSS'
);
assert.ok(serviceWorker.includes("'./index.html'"), 'offline navigation fallback must include index.html');
assert.ok(serviceWorker.includes("'./data/library_books.json'"), 'library master data must be precached');
assert.ok(serviceWorker.includes("'./data/golzar_martyrs.xlsx'"), 'martyr reference data must be precached');
assert.ok(
  serviceWorker.includes("'./data/sooreh_mehr_book_martyr_research.json'"),
  'research reference data must be precached'
);

// 7. Fetch handler looks up ONLY in active CACHE_NAME (no global caches.match)
assert.ok(
  !/caches\.match\s*\(/.test(serviceWorker),
  'main Service Worker fetch handler must not use global caches.match(); it must open CACHE_NAME'
);
assert.ok(
  serviceWorker.includes('const cache = await caches.open(CACHE_NAME)'),
  'main Service Worker must serve cached responses exclusively from caches.open(CACHE_NAME)'
);

// 8. No cache deletion or forced SW update on startup in src/main.tsx
assert.ok(
  !/caches\.(?:keys|delete)\s*\(/.test(mainEntry),
  'application startup must not delete caches globally'
);
assert.ok(
  mainEntry.includes('.getRegistration()') &&
    mainEntry.includes('existingReg && existingReg.active'),
  'startup must check existing active Service Worker registration and avoid redundant network registration on load'
);
assert.ok(
  !mainEntry.includes('.update()'),
  'application startup must not trigger automatic Service Worker .update() network checks'
);

// 9. No modification or deletion of IndexedDB or operational localStorage keys in githubSyncService.ts
assert.ok(
  !/indexedDB|deleteDatabase|localStorage\.clear|localStorage\.removeItem/i.test(githubSyncService),
  'githubSyncService must never touch IndexedDB or clear/remove operational localStorage data'
);

// 10. Namespace isolation and atomic hardening of sub-app Service Worker (apps/library-research-pwa/sw.js)
assert.ok(
  subAppSw.includes("const CACHE_PREFIX = 'markaz-asnad-library-shell-'") &&
    subAppSw.includes('v9'),
  'sub-app Service Worker must use isolated markaz-asnad-library-shell-v9 namespace'
);
assert.ok(
  !/caches\.match\s*\(/.test(subAppSw) && subAppSw.includes('caches.open(CACHE_NAME)'),
  'sub-app Service Worker must serve exclusively from its own active CACHE_NAME'
);

// 11. Zero references to fonts.googleapis.com or fonts.gstatic.com
for (const [label, content] of [
  ['index.html', sourceHtml],
  ['dist/index.html', html],
  ['dist/assets/*.css', cssContent],
]) {
  assert.ok(
    !/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(content),
    `${label} must not reference external Google Fonts`
  );
}

// 12. Atomic staging and real SW lifecycle in githubSyncService.ts
assert.ok(
  githubSyncService.includes('stagingCacheName') &&
    githubSyncService.includes('verifiedResponses') &&
    githubSyncService.includes('controllerchange') &&
    githubSyncService.includes('shouldReload'),
  'githubSyncService must stage and verify all assets in memory/staging and coordinate with SW controllerchange lifecycle'
);

// 13. No cloud write operations in sync service
assert.ok(
  !/firestore|supabase|setDoc|updateDoc|deleteDoc/i.test(githubSyncService),
  'githubSyncService must not contain any cloud database write operations'
);

process.stdout.write(
  'Offline PWA static validation passed (13/13 checks): ' +
    bundleRefs.length +
    ' local bundle reference(s), ' +
    hashedFontFiles.length +
    ' hashed font asset(s), ' +
    totalBundleBytes +
    ' bundle bytes, ' +
    fallbackFontSize +
    ' fallback font bytes, ' +
    dataBytes +
    ' precached data bytes.\n'
);
