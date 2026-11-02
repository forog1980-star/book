import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'site');
const required = [
  'index.html', 'manifest.webmanifest', 'styles.css.gz', 'theme.css', 'sw.js',
  'scripts/loader.js', 'dist/app.js.gz', 'dist/db.js.gz', 'dist/domain.js.gz',
  'dist/relations.js.gz', 'dist/backup.js.gz', 'dist/xlsx.js.gz',
  'public/icons/icon.svg', 'fonts/Vazirmatn-variable.woff2.b64', 'fonts/OFL-Vazirmatn.txt',
];
for (const path of required) {
  const info = await stat(join(root, path));
  assert.ok(info.isFile() && info.size > 0, path + ' must be present in the public output');
}
const html = await readFile(join(root, 'index.html'), 'utf8');
assert.ok(html.includes('./scripts/loader.js'), 'public HTML should load the runtime loader');
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const serviceWorkerAssets = [
  'manifest.webmanifest', 'scripts/loader.js', 'styles.css.gz', 'theme.css',
  'dist/app.js.gz', 'dist/db.js.gz', 'dist/domain.js.gz',
  'dist/relations.js.gz', 'dist/backup.js.gz', 'dist/xlsx.js.gz',
  'public/icons/icon.svg', 'fonts/Vazirmatn-variable.woff2.b64',
];
for (const path of serviceWorkerAssets) {
  const relative = './' + path;
  assert.ok(sw.includes(relative), relative + ' should be available to the service worker');
}
const listed = [];
async function walk(dir, prefix = '') {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + item.name : item.name;
    if (item.isDirectory()) await walk(join(dir, item.name), name);
    else listed.push(name);
  }
}
await walk(root);
assert.ok(!listed.some((path) => /(^|\/)(src|docs|tests|data|node_modules)(\/|$)|\.(xlsx|xls|csv|json)$/i.test(path)),
  'public output must not contain source, test, documentation, workbook or CSV files');
process.stdout.write('Static deployment package verified: ' + listed.length + ' runtime files only.\n');
