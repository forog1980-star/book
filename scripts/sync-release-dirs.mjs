import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const projectRoot = process.cwd();
const distRoot = resolve(projectRoot, 'dist');
const syncTargets = [
  resolve(projectRoot, 'docs'),
  resolve(projectRoot, 'خروجی نرم\u200cافزار'),
];

async function syncReleaseDirs() {
  const html = await readFile(join(distRoot, 'index.html'), 'utf8');
  const bundleRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((v) => !/^https?:/i.test(v) && /\/assets\/.*\.(?:m?js|css)(?:\?|$)/i.test(v))
    .map((r) => r.split('?')[0].replace(/^\.\//, '').replace(/^\//, ''));

  const distAssetsDir = join(distRoot, 'assets');
  const distAssetsFiles = await readdir(distAssetsDir);
  const hashedFontFiles = distAssetsFiles
    .filter((name) => /^Vazirmatn-variable-.*\.woff2$/i.test(name))
    .map((f) => `assets/${f}`);

  const activeAssetBasenames = new Set([
    ...bundleRefs.map((rel) => rel.replace(/^assets\//, '')),
    ...hashedFontFiles.map((rel) => rel.replace(/^assets\//, '')),
    'aistudio',
  ]);

  const distDataDir = join(distRoot, 'data');
  const distDataFiles = (await readdir(distDataDir).catch(() => []))
    .filter((f) => !f.startsWith('.'))
    .map((f) => `data/${f}`);

  const syncedRelPaths = [
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    'fonts/Vazirmatn-variable.woff2',
    ...bundleRefs,
    ...hashedFontFiles,
    ...distDataFiles,
  ];

  for (const targetDir of syncTargets) {
    await mkdir(join(targetDir, 'assets'), { recursive: true });
    await mkdir(join(targetDir, 'fonts'), { recursive: true });
    await mkdir(join(targetDir, 'data'), { recursive: true });

    // Remove stale hashed index-*.js / index-*.css bundles from target assets/
    const targetAssetsDir = join(targetDir, 'assets');
    const existingTargetAssets = await readdir(targetAssetsDir).catch(() => []);
    for (const file of existingTargetAssets) {
      if (
        !activeAssetBasenames.has(file) &&
        (/^index-.*\.(?:m?js|css)$/i.test(file) || /^Vazirmatn-variable-.*\.woff2$/i.test(file))
      ) {
        await rm(join(targetAssetsDir, file), { force: true });
      }
    }

    // Copy active release artifacts from dist/ to targetDir
    for (const relPath of syncedRelPaths) {
      const srcPath = join(distRoot, relPath);
      const info = await stat(srcPath).catch(() => null);
      if (info && info.isFile()) {
        await copyFile(srcPath, join(targetDir, relPath));
      }
    }
  }
}

await syncReleaseDirs();
