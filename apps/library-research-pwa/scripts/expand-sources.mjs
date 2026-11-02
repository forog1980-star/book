import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../src/', import.meta.url));
if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
const files = readdirSync(directory).filter((name) => name.endsWith('.ts.gz'));
if (!files.length) throw new Error('فایل‌های منبع فشرده در src پیدا نشدند.');

for (const name of files) {
  const source = join(directory, name);
  const target = join(directory, name.slice(0, -3));
  // A reviewed plain-text source takes precedence over its legacy compressed copy.
  if (existsSync(target)) continue;
  writeFileSync(target, gunzipSync(readFileSync(source)));
}
process.stdout.write(`Expanded ${files.length} TypeScript source files where no plain source exists.\n`);
