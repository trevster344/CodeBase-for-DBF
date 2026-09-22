// Builds the CommonJS entry (dist/index.cjs) from index.ts with esbuild.
//
// index.ts uses `import.meta.url` to locate the module directory (and therefore the bundled
// native/ engines). `import.meta` does not exist in CommonJS, so this build rewrites it to a
// `__filename`-based file URL via esbuild's `define` + a banner. The result is real CommonJS that
// works on every supported Node (>= 20), independent of Node's `require(esm)` support.
//
// The ESM declarations and entry are produced by `tsc` (see package.json "build"). Because the
// package is `"type": "module"`, `dist/index.d.ts` is an ECMAScript declaration file; a CommonJS
// consumer importing it would trigger TS1479 ("referenced file is an ECMAScript module"). The same
// declarations are copied to `dist/index.d.cts` so the `require` export condition resolves to
// CommonJS declarations (the `.d.cts` extension pins the module kind regardless of `type`).

import fs from 'node:fs';
import { build } from 'esbuild';

await build({
   entryPoints: ['index.ts'],
   outfile: 'dist/index.cjs',
   format: 'cjs',
   platform: 'node',
   target: 'node20',
   define: { 'import.meta.url': '__importMetaUrl' },
   banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
   logOverride: { 'empty-import-meta': 'silent' }
});

fs.copyFileSync('dist/index.d.ts', 'dist/index.d.cts');

console.log('built dist/index.cjs + dist/index.d.cts');
