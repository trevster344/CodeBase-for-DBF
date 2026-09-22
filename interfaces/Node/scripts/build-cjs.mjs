// Builds the CommonJS entry (dist/index.cjs) from index.ts with esbuild.
//
// index.ts uses `import.meta.url` to locate the module directory (and therefore the bundled
// native/ engines). `import.meta` does not exist in CommonJS, so this build rewrites it to a
// `__filename`-based file URL via esbuild's `define` + a banner. The result is real CommonJS that
// works on every supported Node (>= 20), independent of Node's `require(esm)` support.
//
// Type declarations and the ESM entry are produced by `tsc` (see package.json "build").

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

console.log('built dist/index.cjs');
