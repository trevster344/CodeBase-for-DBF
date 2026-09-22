// Stages the built native engines into interfaces/Node/native/<platform>-<arch>/ so they are
// shipped in the npm package.  Run by `npm run prepack` (and therefore by `npm pack` / `npm publish`).
//
//   native/win32-x64/c4dll64.dll   <- build/MVStudio_2022_Project_VFP_STAND_ALONE_64/C4dll64.dll
//   native/win32-ia32/c4dll.dll    <- build/MVStudio_2022_Project_VFP_STAND_ALONE_32/C4dll.dll
//   native/linux-x64/libc4dll.so   <- linux/build/libc4dll.so
//   native/linux-arm64/libc4dll.so <- linux/build-arm64/libc4dll.so
//
// Build the engines first (Windows: see WorkingSource/ReadMe.md; Linux: see linux/README.md).
// Windows DLLs are required; Linux .so files are optional (a warning is printed if absent).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const root = path.resolve(pkgDir, '..', '..');
const nativeDir = path.join(pkgDir, 'native');

const targets = [
   {
      label: 'win32-x64',
      src: path.join(root, 'build', 'MVStudio_2022_Project_VFP_STAND_ALONE_64', 'C4dll64.dll'),
      dest: path.join(nativeDir, 'win32-x64', 'c4dll64.dll'),
      required: true
   },
   {
      label: 'win32-ia32',
      src: path.join(root, 'build', 'MVStudio_2022_Project_VFP_STAND_ALONE_32', 'C4dll.dll'),
      dest: path.join(nativeDir, 'win32-ia32', 'c4dll.dll'),
      required: true
   },
   {
      label: 'linux-x64',
      src: path.join(root, 'linux', 'build', 'libc4dll.so'),
      dest: path.join(nativeDir, 'linux-x64', 'libc4dll.so'),
      required: false
   },
   {
      label: 'linux-arm64',
      src: path.join(root, 'linux', 'build-arm64', 'libc4dll.so'),
      dest: path.join(nativeDir, 'linux-arm64', 'libc4dll.so'),
      required: false
   }
];

// Start clean so stale platform folders are not shipped.
fs.rmSync(nativeDir, { recursive: true, force: true });

const missing = [];
let staged = 0;

for (const target of targets) {
   if (!fs.existsSync(target.src)) {
      missing.push(`${target.label}: ${target.src}`);
      continue;
   }
   fs.mkdirSync(path.dirname(target.dest), { recursive: true });
   fs.copyFileSync(target.src, target.dest);
   staged++;
   console.log(`bundled ${target.label}: ${path.relative(root, target.dest)} (${fs.statSync(target.dest).size} bytes)`);
}

if (staged === 0) {
   console.error('bundle-native: no native engines found. Build them first (see WorkingSource/ReadMe.md and linux/README.md).');
   process.exit(1);
}

if (missing.length > 0) {
   console.warn('bundle-native: missing (not staged):');
   for (const m of missing) console.warn('  ' + m);
   console.warn('  (Linux .so files are optional; build them with the linux/ CMake project to include them.)');
}
