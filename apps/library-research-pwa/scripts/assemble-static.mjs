import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'site');
const files = [
  'index.html',
  'manifest.webmanifest',
  'styles.css.gz',
  'theme.css',
  'sw.js',
  'scripts/loader.js',
  'dist',
  'public/icons/icon.svg',
  'fonts/Vazirmatn-variable.woff2.b64',
  'fonts/OFL-Vazirmatn.txt',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const source of files) {
  const from = resolve(root, source);
  const destination = resolve(output, source);
  const info = await stat(from);
  await mkdir(dirname(destination), { recursive: true });
  await cp(from, destination, { recursive: info.isDirectory(), force: true });
}

const published = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collect(full);
    else published.push(relative(output, full).split(sep).join('/'));
  }
}
await collect(output);

const prohibited = published.filter((name) =>
  /(^|\/)(src|docs|tests|data|node_modules)(\/|$)|\.(xlsx|xls|csv|json)$/i.test(name)
);
if (prohibited.length) {
  throw new Error('Private/source files entered the public package: ' + prohibited.join(', '));
}

process.stdout.write('Assembled ' + published.length + ' public runtime files in site/; no workbook, CSV, source, docs, or test files included.\n');
