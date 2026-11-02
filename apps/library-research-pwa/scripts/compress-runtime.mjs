import { createReadStream, createWriteStream, readdirSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const directory = fileURLToPath(new URL('../dist/', import.meta.url));
const files = readdirSync(directory).filter((name) => name.endsWith('.js'));
for (const name of files) {
  await pipeline(createReadStream(join(directory, name)), createGzip({ level: 9 }), createWriteStream(join(directory, `${name}.gz`)));
}
process.stdout.write(`Compressed ${files.length} runtime modules.\n`);
