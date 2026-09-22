/*
 * t4all (Node / Vitest) - mirrors test/CSharp/t4all.cs: exercises the CODE4 lifecycle and a full
 * CRUD round-trip through the interfaces/Node bindings.
 *
 * The C t4all smoke test walks the whole API (relate/index/expr/report/...); the Node bindings
 * expose the CRUD + lifecycle subset, which is what this suite covers. Table/field names mirror
 * t4all (table `t4all`; fields STR/NUM/LOG/DBL/MEM; tags STR/NUM).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Code4, r4success, r4eof, r4bof, r4type, numCodeBaseInstances } from '../../interfaces/Node/dist/index.js';
import type { FieldDef, TagDef } from '../../interfaces/Node/dist/index.js';

const dir = path.join(os.tmpdir(), 'codebase_t4all');
const table = path.join(dir, 't4all');
const TABLE_EXTS = ['.dbf', '.cdx', '.fpt', '.idx'];

function deleteTable(t: string): void {
   for (const ext of TABLE_EXTS) {
      try {
         if (fs.existsSync(t + ext)) fs.unlinkSync(t + ext);
      } catch {
         /* ignore */
      }
   }
}

function makeFields(): FieldDef[] {
   return [
      { name: 'STR', type: r4type.str, len: 10 },
      { name: 'NUM', type: r4type.num, len: 4 },
      { name: 'LOG', type: r4type.log, len: 1 },
      { name: 'DBL', type: r4type.double, len: 8 },
      { name: 'MEM', type: r4type.memo, len: 10 }
   ];
}

function makeTags(): TagDef[] {
   return [
      { name: 'STR', expression: 'STR' },
      { name: 'NUM', expression: 'NUM' }
   ];
}

beforeAll(() => {
   fs.mkdirSync(dir, { recursive: true });
});

describe('CODE4 lifecycle', () => {
   it('starts with no live instances', () => {
      expect(numCodeBaseInstances()).toBe(0);
   });

   it('inits and undoes a single CODE4', () => {
      const c4 = new Code4({ errOff: 1 });
      expect(numCodeBaseInstances()).toBe(1);
      c4.dispose();
      expect(numCodeBaseInstances()).toBe(0);
   });

   it('survives many init/undo cycles', () => {
      for (let i = 0; i < 2000; i++) {
         new Code4({ errOff: 1 }).dispose();
      }
      expect(numCodeBaseInstances()).toBe(0);
   });

   it('dispose is idempotent', () => {
      const c4 = new Code4({ errOff: 1 });
      c4.dispose();
      c4.dispose();
      expect(numCodeBaseInstances()).toBe(0);
   });

   it('supports Symbol.dispose', () => {
      const c4 = new Code4({ errOff: 1 });
      expect(numCodeBaseInstances()).toBe(1);
      c4[Symbol.dispose]();
      expect(numCodeBaseInstances()).toBe(0);
   });

   it('tracks multiple concurrent instances', () => {
      const a = new Code4({ errOff: 1 });
      const b = new Code4({ errOff: 1 });
      const c = new Code4({ errOff: 1 });
      expect(numCodeBaseInstances()).toBe(3);
      a.dispose();
      b.dispose();
      c.dispose();
      expect(numCodeBaseInstances()).toBe(0);
   });
});

describe('t4all CRUD', () => {
   it('creates the t4all table with fields and tags', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         const data = c4.create(table, makeFields(), makeTags());
         expect(data.isValid()).toBe(true);
         expect(data.numFields()).toBe(5);
         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });

   it('appends, reopens, reads every field and seeks by tag', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         // ---- create + append 10 records ----
         let data = c4.create(table, makeFields(), makeTags());
         data.appendStart(0);
         for (let i = 1; i <= 10; i++) {
            data.appendBlank();
            data.field('STR').assign('REC' + i);
            data.field('NUM').assign(String(100 + i));
            data.field('LOG').assign(i % 2 === 1 ? 'T' : 'F');
            data.field('DBL').assignDouble(i + 0.5);
            data.field('MEM').memoAssign('memo ' + i);
         }
         data.close();

         // ---- reopen and verify ----
         data = c4.open(table);
         expect(data.isValid()).toBe(true);
         expect(data.recCount()).toBe(10);

         for (let i = 1; i <= 10; i++) {
            data.go(i);
            expect(data.field('STR').str().trim()).toBe('REC' + i);
            expect(data.field('NUM').str().trim()).toBe(String(100 + i));
            expect(data.field('LOG').str().trim()).toBe(i % 2 === 1 ? 'T' : 'F');
            expect(data.field('DBL').double()).toBeCloseTo(i + 0.5, 9);
            expect(data.field('MEM').memoStr()).toBe('memo ' + i);
         }

         // ---- select the STR tag and seek ----
         data.select('STR');
         expect(data.seek('REC7')).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC7');

         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });
});

describe('record positioning', () => {
   it('top/bottom/goLow position the record pointer', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         let data = c4.create(table, makeFields(), makeTags());
         data.appendStart(0);
         for (let i = 1; i <= 10; i++) {
            data.appendBlank();
            data.field('STR').assign('REC' + i);
         }
         data.close();

         data = c4.open(table);

         // ---- no tag selected: physical record order ----
         expect(data.top()).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC1');
         expect(data.bottom()).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC10');

         // ---- explicit goLow with the write flag (the d4go macro) ----
         expect(data.goLow(5, 1)).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC5');
         expect(data.goLow(3, 0)).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC3');

         // ---- with the STR tag selected: top/bottom follow the tag order (lexicographic,
         // so 'REC10' sorts between 'REC1' and 'REC2', making 'REC9' the last key) ----
         data.select('STR');
         expect(data.top()).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC1');
         expect(data.bottom()).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('REC9');

         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });
});

describe('cursor + maintenance', () => {
   it('skip/recNo/eof/bof track the record pointer', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         let data = c4.create(table, makeFields(), makeTags());
         data.appendStart(0);
         for (let i = 1; i <= 10; i++) {
            data.appendBlank();
            data.field('STR').assign('REC' + i);
         }
         data.close();

         data = c4.open(table);

         expect(data.top()).toBe(r4success);
         expect(data.recNo()).toBe(1);
         expect(data.eof()).toBe(false);
         expect(data.bof()).toBe(false);

         expect(data.skip(2)).toBe(r4success);
         expect(data.recNo()).toBe(3);

         // negative skip exercises the signed `long` parameter
         expect(data.skip(-1)).toBe(r4success);
         expect(data.recNo()).toBe(2);

         expect(data.bottom()).toBe(r4success);
         expect(data.recNo()).toBe(10);

         expect(data.skip(5)).toBe(r4eof);
         expect(data.eof()).toBe(true);

         expect(data.top()).toBe(r4success);
         expect(data.skip(-5)).toBe(r4bof);
         expect(data.bof()).toBe(true);

         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });

   it('seekNext walks duplicate keys', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         let data = c4.create(table, makeFields(), makeTags());
         data.appendStart(0);
         for (const s of ['A', 'A', 'A', 'B', 'C']) {
            data.appendBlank();
            data.field('STR').assign(s);
         }
         data.close();

         data = c4.open(table);
         data.select('STR');

         expect(data.seek('A')).toBe(r4success);
         const firstA = data.recNo();
         expect(data.field('STR').str().trim()).toBe('A');

         expect(data.seekNext('A')).toBe(r4success);
         const secondA = data.recNo();
         expect(secondA).not.toBe(firstA);
         expect(data.field('STR').str().trim()).toBe('A');

         expect(data.seekNext('A')).toBe(r4success);
         const thirdA = data.recNo();
         expect(thirdA).not.toBe(secondA);
         expect(data.field('STR').str().trim()).toBe('A');

         // no fourth 'A' remains
         expect(data.seekNext('A')).not.toBe(r4success);

         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });

   it('delete/flush/pack/reindex maintain the table', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         let data = c4.create(table, makeFields(), makeTags());
         data.appendStart(0);
         for (let i = 1; i <= 5; i++) {
            data.appendBlank();
            data.field('STR').assign('R' + i);
         }
         data.close();

         data = c4.open(table);
         expect(data.recCount()).toBe(5);

         expect(data.go(2)).toBe(r4success);
         data.delete();
         expect(data.deleted()).toBe(true);
         expect(data.flush()).toBe(r4success);

         expect(data.pack()).toBe(r4success);
         expect(data.recCount()).toBe(4);

         expect(data.reindex()).toBe(r4success);
         data.select('STR');
         expect(data.seek('R3')).toBe(r4success);
         expect(data.field('STR').str().trim()).toBe('R3');

         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });
});

describe('integer fields', () => {
   it('round-trips an I field with assignInt/int', () => {
      deleteTable(table);
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      try {
         let data = c4.create(table, [
            { name: 'STR', type: r4type.str, len: 10 },
            { name: 'CNT', type: r4type.int, len: 4 }
         ], [{ name: 'STR', expression: 'STR' }]);
         data.appendStart(0);
         data.appendBlank();
         data.field('STR').assign('X');
         data.field('CNT').assignInt(1234);
         data.close();

         data = c4.open(table);
         data.go(1);
         expect(data.field('CNT').int()).toBe(1234);
         data.close();
      } finally {
         c4.dispose();
      }
      deleteTable(table);
   });
});

describe('error handling', () => {
   it('throws when opening a missing table', () => {
      const c4 = new Code4({ errOff: 1 });
      try {
         expect(() => c4.open(path.join(dir, 'DOES_NOT_EXIST'))).toThrow();
      } finally {
         c4.dispose();
      }
   });
});
