import * as cb from '../../interfaces/Node/dist/index.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

/*
 * CodeBase Node/TypeScript test - runnable console test for the CodeBase native engine through the
 * interfaces/Node koffi bindings (ESM).
 *
 * Verifies that the engine works when Node's bitness matches the native DLL:
 *   x64  -> c4dll64.dll
 *   ia32 -> c4dll.dll
 *
 * Exercises: process bitness, the loaded native module, a lifecycle loop (code4init/code4initUndo
 * asserting code4numCodeBaseCount returns to 0), and a CRUD round-trip over STR/NUM/DBL/LOG/MEMO
 * fields (create table + tag, append records, reopen, read/verify, seek by tag).
 * Exit code 0 = PASS, non-zero = FAIL.
 */

const expectX64 = (process.env.EXPECT_ARCH || 'x64') === 'x64';

function live(): number | null {
   return cb.numCodeBaseInstances();
}

function testLifecycle(): number {
   const cycles = 5000;
   const haveCount = live() !== null;

   if (!haveCount) {
      console.log('  lifecycle : NOTE code4numCodeBaseCount not exported; count checks disabled');
   }
   if (haveCount && live() !== 0) {
      console.log('  lifecycle : FAIL (initial live count = ' + live() + ')');
      return 1;
   }

   for (let i = 0; i < cycles; i++) {
      const c4 = new cb.Code4({ errOff: 1 });
      if (haveCount && live() !== 1) {
         console.log('  lifecycle : FAIL (live count = ' + live() + ' after init at ' + i + ')');
         c4.dispose();
         return 1;
      }
      c4.dispose();
      if (haveCount && live() !== 0) {
         console.log('  lifecycle : FAIL (live count = ' + live() + ' after dispose at ' + i + ')');
         return 1;
      }
   }

   console.log('  lifecycle : ' + cycles + ' init/dispose cycles OK');
   return 0;
}

function deleteTable(table: string): void {
   for (const ext of ['.dbf', '.cdx', '.fpt', '.idx']) {
      try {
         if (fs.existsSync(table + ext)) fs.unlinkSync(table + ext);
      } catch {
         /* ignore */
      }
   }
}

function testCrud(): number {
   const dir = path.join(os.tmpdir(), 'codebase_tests_node');
   fs.mkdirSync(dir, { recursive: true });
   const table = path.join(dir, 'CRUDTEST');
   deleteTable(table);

   let c4: cb.Code4 | null = null;
   try {
      c4 = new cb.Code4({ compatibility: 30, safety: 0, errOff: 1, readOnly: 0 });

      const fields: cb.FieldDef[] = [
         { name: 'STR', type: cb.r4type.str, len: 10 },
         { name: 'NUM', type: cb.r4type.num, len: 5 },
         { name: 'DBL', type: cb.r4type.double, len: 8 },
         { name: 'LOG', type: cb.r4type.log, len: 1 },
         { name: 'MEMO', type: cb.r4type.memo, len: 10 }
      ];
      const tags: cb.TagDef[] = [{ name: 'STR', expression: 'STR' }];

      let data = c4.create(table, fields, tags);
      if (!data.isValid()) {
         console.log('  crud      : FAIL (d4create) ' + c4.errorText());
         return 1;
      }

      // ---- append 5 records ----
      data.appendStart(0);
      for (let i = 1; i <= 5; i++) {
         data.appendBlank();
         data.field('STR').assign('REC' + i);
         data.field('NUM').assign(String(100 + i));
         data.field('DBL').assignDouble(i + 0.5);
         data.field('LOG').assign(i % 2 === 1 ? 'T' : 'F');
         data.field('MEMO').memoAssign('memo text ' + i);
      }
      data.close();

      // ---- reopen and verify ----
      data = c4.open(table);
      if (!data.isValid()) {
         console.log('  crud      : FAIL (d4open) ' + c4.errorText());
         return 1;
      }
      if (data.recCount() !== 5) {
         console.log('  crud      : FAIL (recCount = ' + data.recCount() + ', expected 5)');
         data.close();
         return 1;
      }
      for (let i = 1; i <= 5; i++) {
         data.go(i);
         const s = data.field('STR').str().trim();
         const n = data.field('NUM').str().trim();
         const d = data.field('DBL').double();
         const l = data.field('LOG').str().trim();
         const m = data.field('MEMO').memoStr();
         const logExpected = i % 2 === 1 ? 'T' : 'F';
         if (s !== 'REC' + i || n !== String(100 + i) || Math.abs(d - (i + 0.5)) > 1e-9 ||
             l !== logExpected || m !== 'memo text ' + i) {
            console.log('  crud      : FAIL (record ' + i + " = '" + s + "'/'" + n + "'/" + d +
               "/'" + l + "'/'" + m + "')");
            data.close();
            return 1;
         }
      }

      // ---- seek by the STR tag ----
      const seekRc = data.seek('REC3');
      if (seekRc !== cb.r4success || data.field('STR').str().trim() !== 'REC3') {
         console.log('  crud      : FAIL (seek REC3 rc=' + seekRc + ')');
         data.close();
         return 1;
      }
      data.close();

      console.log('  crud      : create/append/read/seek OK (STR/NUM/DBL/LOG/MEMO)');
      return 0;
   } catch (ex) {
      console.log('  crud      : EXCEPTION ' + (ex as Error).message);
      return 1;
   } finally {
      if (c4) c4.dispose();
      deleteTable(table);
   }
}

function checkLoadedModule(is64: boolean, rc: number): number {
   try {
      const report = (process as any).report ? (process as any).report.getReport() : null;
      const shared: string[] = (report && report.sharedObjects) || [];
      const loaded = shared.filter((p) => /c4dll/i.test(p));
      if (loaded.length === 0) {
         console.log('  loaded module   : (not visible in process.report; skipped)');
         return rc;
      }
      console.log('  loaded module   : ' + loaded[0]);
      const expected = is64 ? 'c4dll64.dll' : 'c4dll.dll';
      if (!loaded.some((p) => p.toLowerCase().endsWith(expected))) {
         console.log('  module    : FAIL (loaded ' + loaded[0] + ', expected ' + expected + ')');
         return 2;
      }
      return rc;
   } catch {
      return rc;
   }
}

function main(): number {
   const is64 = process.arch === 'x64';

   console.log('CodeBase Node/TypeScript test');
   console.log('  node            : ' + process.version + ' (' + process.arch + ')');
   console.log('  process bitness : ' + (is64 ? 'x64 (64-bit)' : 'x86 (32-bit)') +
      '  (expected ' + (expectX64 ? 'x64' : 'x86') + ')');
   console.log('  import dll      : ' + cb.libraryPath);

   if (is64 !== expectX64) {
      console.log('  bitness   : FAIL (expected ' + (expectX64 ? 'x64' : 'x86') +
         ' but running ' + (is64 ? 'x64' : 'x86') + ')');
      return 2;
   }

   let rc = 0;
   rc |= testLifecycle();
   rc |= testCrud();
   rc = checkLoadedModule(is64, rc);

   console.log(rc === 0 ? 'PASS' : 'FAIL');
   return rc;
}

process.exitCode = main();
