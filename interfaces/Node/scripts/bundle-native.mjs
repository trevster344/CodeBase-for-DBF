// Copies the built native engines into interfaces/Node/native/ so they are shipped in the npm
// package. Run by `npm run prepack` (and therefore by `npm pack` / `npm publish`).
//
//   native/x64/c4dll64.dll   <- build/MVStudio_2022_Project_VFP_STAND_ALONE_64/C4dll64.dll
//   native/x86/c4dll.dll     <- build/MVStudio_2022_Project_VFP_STAND_ALONE_32/C4dll.dll
//
// Build the engines first (see WorkingSource/ReadMe.md or tests/run-tests.ps1 -BuildNative).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const root = path.resolve(pkgDir, '..', '..');

const targets = [
   {
      label: 'x64',
      src: path.join(root, 'build', 'MVStudio_2022_Project_VFP_STAND_ALONE_64', 'C4dll64.dll'),
      dest: path.join(pkgDir, 'native', 'x64', 'c4dll64.dll')
   },
   {
      label: 'x86',
      src: path.join(root, 'build', 'MVStudio_2022_Project_VFP_STAND_ALONE_32', 'C4dll.dll'),
      dest: path.join(pkgDir, 'native', 'x86', 'c4dll.dll')
   }
];

const missing = [];

for (const target of targets) {
   if (!fs.existsSync(target.src)) {
      missing.push(`${target.label}: ${target.src}`);
      continue;
   }
   fs.mkdirSync(path.dirname(target.dest), { recursive: true });
   fs.copyFileSync(target.src, target.dest);
   console.log(`bundled ${target.label}: ${path.relative(root, target.dest)} (${fs.statSync(target.dest).size} bytes)`);
}

if (missing.length > 0) {
   console.error('bundle-native: missing native build output(s):');
   for (const m of missing) console.error('  ' + m);
   console.error('Build them first (see WorkingSource/ReadMe.md or tests/run-tests.ps1 -BuildNative).');
   process.exit(1);
}
