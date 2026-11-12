import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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
const serviceWorker = await readDist('sw.js');
const manifest = await readDist('manifest.webmanifest');

assert.ok(html.includes('id="root"'), 'production HTML must contain the application mount point');
assert.ok(manifest.includes('"start_url": "./"'), 'PWA start_url must remain scoped to the app');
assert.ok(serviceWorker.includes("const CACHE_PREFIX = 'markaz-asnad-main-book-'"), 'main app cache must use its own namespace');
assert.ok(serviceWorker.includes("const LEGACY_CACHE_PREFIX = 'markaz-asnad-pwa-'"), 'legacy main-app cache namespace must be explicit');
assert.ok(serviceWorker.includes('key.startsWith(CACHE_PREFIX)'), 'activation cleanup must be restricted to owned cache keys');
assert.ok(serviceWorker.includes('key.startsWith(LEGACY_CACHE_PREFIX)'), 'activation cleanup may remove only the documented legacy namespace');
assert.ok(serviceWorker.includes('await cache.addAll(appShellAssets)'), 'installation must complete app-shell precaching before activation');
assert.ok(serviceWorker.includes('collectAppShellAssets'), 'hashed Vite bundles must be discovered from production HTML');
assert.ok(serviceWorker.includes("'./index.html'"), 'offline navigation fallback must include index.html');
assert.ok(serviceWorker.includes("'./data/library_books.json'"), 'library master data must be precached');
assert.ok(serviceWorker.includes("'./data/golzar_martyrs.xlsx'"), 'martyr reference data must be precached');
assert.ok(serviceWorker.includes("'./data/sooreh_mehr_book_martyr_research.json'"), 'research reference data must be precached');

const bundleRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map((match) => match[1])
  .filter((value) => !/^https?:/i.test(value) && /\/assets\/.*\.(?:m?js|css)(?:\?|$)/i.test(value));
assert.ok(bundleRefs.some((value) => /\.m?js(?:\?|$)/i.test(value)), 'production HTML must reference a local JavaScript bundle');
assert.ok(bundleRefs.some((value) => /\.css(?:\?|$)/i.test(value)), 'production HTML must reference a local CSS bundle');

let totalBundleBytes = 0;
for (const reference of bundleRefs) {
  const clean = reference.split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
  const assetPath = resolve(distRoot, clean);
  assert.ok(assetPath.startsWith(distRoot + sep), 'asset path must stay inside dist: ' + reference);
  const info = await stat(assetPath);
  assert.ok(info.isFile() && info.size > 0, 'referenced production asset must exist: ' + reference);
  totalBundleBytes += info.size;
}

const dataBytes = (
  await Promise.all([
    existsAndNonEmpty('data/library_books.json'),
    existsAndNonEmpty('data/golzar_martyrs.xlsx'),
    existsAndNonEmpty('data/sooreh_mehr_book_martyr_research.json'),
  ])
).reduce((sum, size) => sum + size, 0);

const mainEntry = await readFile(join(projectRoot, 'src/main.tsx'), 'utf8');
assert.ok(mainEntry.includes("./sw.js?v=14"), 'application must register the matching Service Worker version');
assert.ok(!/caches\.(?:keys|delete)\s*\(/.test(mainEntry), 'application startup must not delete caches globally');

process.stdout.write(
  'Offline PWA static validation passed: ' +
  bundleRefs.length + ' local bundle reference(s), ' +
  totalBundleBytes + ' bundle bytes, ' +
  dataBytes + ' precached data bytes.\n'
);
