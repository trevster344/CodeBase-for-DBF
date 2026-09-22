/*
 * CodeBase CommonJS smoke test.
 *
 * Loads the package through require() (dist/index.cjs) rather than import, to verify the CJS build
 * of interfaces/Node: named exports, the default export, the native-engine lookup (which uses the
 * CJS __dirname) and a create/append/reopen/read/seek round-trip.
 *
 * Exit code 0 = PASS, non-zero = FAIL.
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const cb = require('../../interfaces/Node/dist/index.cjs');

function deleteTable(table) {
   for (const ext of ['.dbf', '.cdx', '.fpt', '.idx']) {
      try {
         if (fs.existsSync(table + ext)) fs.unlinkSync(table + ext);
      } catch {
         /* ignore */
      }
   }
}

function testExports() {
   if (typeof cb.Code4 !== 'function' || typeof cb.Data4 !== 'function' ||
       typeof cb.Field4 !== 'function' || cb.r4type.str !== 'C' || cb.r4success !== 0) {
      console.log('  exports   : FAIL (named exports missing)');
      return 1;
   }
   if (!cb.default || cb.default.Code4 !== cb.Code4) {
      console.log('  exports   : FAIL (default export mismatch)');
      return 1;
   }
   if (typeof cb.libraryPath !== 'string' || !cb.libraryPath) {
      console.log('  exports   : FAIL (libraryPath not resolved)');
      return 1;
   }
   console.log('  exports   : require() named + default exports OK');
   return 0;
}

function testLifecycle() {
   const before = cb.numCodeBaseInstances();
   const c4 = new cb.Code4({ errOff: 1 });
   const during = cb.numCodeBaseInstances();
   c4.dispose();
   const after = cb.numCodeBaseInstances();
   if (before !== null && (during !== 1 || after !== 0)) {
      console.log('  lifecycle : FAIL (' + before + ' -> ' + during + ' -> ' + after + ')');
      return 1;
   }
   console.log('  lifecycle : init/dispose OK');
   return 0;
}

function testCrud() {
   const dir = path.join(os.tmpdir(), 'codebase_tests_node_cjs');
   fs.mkdirSync(dir, { recursive: true });
   const table = path.join(dir, 'CJSCRUD');
   deleteTable(table);

   let c4 = null;
   try {
      c4 = new cb.Code4({ compatibility: 30, safety: 0, errOff: 1 });

      const fields = [
         { name: 'STR', type: cb.r4type.str, len: 10 },
         { name: 'NUM', type: cb.r4type.num, len: 5 }
      ];
      const tags = [{ name: 'STR', expression: 'STR' }];

      let data = c4.create(table, fields, tags);
      data.appendStart(0);
      for (let i = 1; i <= 3; i++) {
         data.appendBlank();
         data.field('STR').assign('REC' + i);
         data.field('NUM').assign(String(100 + i));
      }
      data.close();

      data = c4.open(table);
      if (data.recCount() !== 3) {
         console.log('  crud      : FAIL (recCount = ' + data.recCount() + ')');
         data.close();
         return 1;
      }
      data.go(2);
      if (data.field('STR').str().trim() !== 'REC2' || data.field('NUM').str().trim() !== '102') {
         console.log('  crud      : FAIL (record 2 readback)');
         data.close();
         return 1;
      }
      const seekRc = data.seek('REC3');
      if (seekRc !== cb.r4success || data.field('STR').str().trim() !== 'REC3') {
         console.log('  crud      : FAIL (seek REC3 rc=' + seekRc + ')');
         data.close();
         return 1;
      }
      data.close();
      console.log('  crud      : create/append/reopen/read/seek OK (STR/NUM)');
      return 0;
   } catch (ex) {
      console.log('  crud      : EXCEPTION ' + ex.message);
      return 1;
   } finally {
      if (c4) c4.dispose();
      deleteTable(table);
   }
}

function main() {
   console.log('CodeBase Node CommonJS (require) test');
   console.log('  node      : ' + process.version + ' (' + process.arch + ')');
   console.log('  require   : dist/index.cjs');
   console.log('  library   : ' + cb.libraryPath);

   let rc = 0;
   rc |= testExports();
   rc |= testLifecycle();
   rc |= testCrud();

   console.log(rc === 0 ? 'PASS' : 'FAIL');
   return rc;
}

process.exitCode = main();
