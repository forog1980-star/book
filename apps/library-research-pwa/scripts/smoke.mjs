import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const port = 4174;
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
const paths = [
  '/', '/index.html', '/manifest.webmanifest', '/scripts/loader.js', '/sw.js',
  '/styles.css.gz', '/theme.css', '/fonts/Vazirmatn-variable.woff2.b64', '/public/icons/icon.svg',
  '/dist/app.js.gz', '/dist/db.js.gz', '/dist/domain.js.gz', '/dist/relations.js.gz',
  '/dist/backup.js.gz', '/dist/xlsx.js.gz',
];
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(base + '/');
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'local HTTP server did not become ready');
  for (const path of paths) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path + ' should return HTTP 200');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (path.endsWith('.gz')) {
      const expanded = gunzipSync(bytes);
      assert.ok(expanded.length > 0, path + ' should contain a non-empty gzip payload');
    }
  }
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /scripts\/loader\.js/, 'index should load the PWA loader');
  const loader = await (await fetch(base + '/scripts/loader.js')).text();
  assert.match(loader, /DecompressionStream/, 'loader should decompress the offline runtime');
  assert.ok(loader.includes('theme.css'), 'loader should load the local theme stylesheet');
  assert.ok(loader.includes('Vazirmatn-variable.woff2.b64'), 'loader should use the bundled Persian font');
  const theme = await (await fetch(base + '/theme.css')).text();
  assert.ok(theme.includes('--archive-primary: #BFA18D'), 'warm primary token should be present');
  assert.ok(theme.includes('Vazirmatn') && theme.includes('Estedad') && theme.includes('IRANSansX'), 'Persian font families should be prioritized');
  assert.doesNotMatch(theme, /Tahoma|Arial/i, 'Tahoma and Arial must not be used as font fallbacks');
  const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.theme_color, '#E8DBCF', 'manifest should match warm theme');
  const serviceWorker = await (await fetch(base + '/sw.js')).text();
  assert.ok(serviceWorker.includes("'./theme.css'"), 'service worker should cache the local theme');
  assert.ok(serviceWorker.includes("'./fonts/Vazirmatn-variable.woff2.b64'"), 'service worker should cache the Persian font');
  process.stdout.write('HTTP smoke checks passed for ' + paths.length + ' application assets.\\n');
} finally {
  server.kill('SIGTERM');
}
