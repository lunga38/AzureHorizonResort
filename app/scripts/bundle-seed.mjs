import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const define = {};
for (const line of envFile.split('\n')) {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) define[`import.meta.env.${m[1]}`] = JSON.stringify(m[2].trim());
}

await build({
  entryPoints: ['src/services/seedData.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'scripts/seed-bundle.mjs',
  packages: 'external',
  define,
  logLevel: 'warning',
});
console.log('BUNDLED OK');
