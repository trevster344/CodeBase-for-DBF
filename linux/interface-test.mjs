/*
 * Interface-level test: drives the CodeBase engine through the Node interface (interfaces/Node)
 * on the current platform.  Exercises the CODE4 lifecycle and a CRUD round-trip with all field
 * types, a memo and two CDX tags.
 *
 * Usage (after `npm --prefix interfaces/Node install && npm --prefix interfaces/Node run build`):
 *   node linux/interface-test.mjs
 *
 * The interface resolves the engine from the repo build output on Linux (linux/build/libc4dll.so)
 * or the bundled native/<platform>-<arch>/ folder.  Exit code 0 = PASS.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Code4, r4type, r4success, libraryPath, dllName } from '../interfaces/Node/dist/index.js';

let rc = 0;
console.log('  platform   :', process.platform + '-' + process.arch);
console.log('  dllName    :', dllName);
console.log('  libraryPath:', libraryPath);

const dir = path.join(os.tmpdir(), 'codebase_iface');
fs.mkdirSync(dir, { recursive: true });
const table = path.join(dir, 'IFACE');
for (const ext of ['.dbf', '.cdx', '.fpt', '.idx']) { try { fs.unlinkSync(table + ext); } catch { /* ignore */ } }

const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
try {
   const data = c4.create(table, [
      { name: 'STR', type: r4type.str, len: 10 },
      { name: 'NUM', type: r4type.num, len: 6, dec: 2 },
      { name: 'DBL', type: r4type.double, len: 8 },
      { name: 'LOG', type: r4type.log, len: 1 },
      { name: 'MEM', type: r4type.memo, len: 10 }
   ], [{ name: 'STR', expression: 'STR' }, { name: 'NUM', expression: 'NUM' }]);

   data.appendStart(0);
   for (let i = 1; i <= 10; i++) {
      data.appendBlank();
      data.field('STR').assign('I' + i);
      data.field('NUM').assign((i * 1.5).toFixed(2));
      data.field('DBL').assignDouble(i + 0.5);
      data.field('LOG').assign(i % 2 === 1 ? 'T' : 'F');
      data.field('MEM').memoAssign('memo ' + i);
   }
   data.close();

   const d2 = c4.open(table);
   if (d2.recCount() !== 10) { console.error('  crud: FAIL (recCount)'); rc = 1; }
   for (let i = 1; i <= 10; i++) {
      d2.go(i);
      if (d2.field('STR').str().trim() !== 'I' + i) { console.error('  crud: FAIL (STR ' + i + ')'); rc = 1; break; }
      if (d2.field('NUM').str().trim() !== (i * 1.5).toFixed(2)) { console.error('  crud: FAIL (NUM ' + i + ')'); rc = 1; break; }
      if (Math.abs(d2.field('DBL').double() - (i + 0.5)) > 1e-9) { console.error('  crud: FAIL (DBL ' + i + ')'); rc = 1; break; }
      if (d2.field('MEM').memoStr() !== 'memo ' + i) { console.error('  crud: FAIL (MEM ' + i + ')'); rc = 1; break; }
   }
   d2.select('STR');
   if (d2.seek('I7') !== r4success || d2.field('STR').str().trim() !== 'I7') { console.error('  crud: FAIL (seek)'); rc = 1; }
   d2.close();
} finally {
   c4.dispose();
}

console.log(rc === 0 ? 'INTERFACE PASS' : 'INTERFACE FAIL');
process.exit(rc);
