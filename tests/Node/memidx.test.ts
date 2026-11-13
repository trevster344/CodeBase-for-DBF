/*
 * In-memory index tests (Node / Vitest).
 *
 * Covers D4MEMINDEX4: exact/range/count/all, get-or-create, stale detection/auto-refresh,
 * memory limits, and free-on-close. The same behavior is exercised by the C#/VB.NET suites.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
   Code4,
   d4memIndexFlag,
   r4success,
   r4type
} from '../../interfaces/Node/dist/index.js';
import type { FieldDef } from '../../interfaces/Node/dist/index.js';

const dir = path.join(os.tmpdir(), 'codebase_memidx');
const table = path.join(dir, 'attend');
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

function fields(): FieldDef[] {
   return [
      { name: 'PROGRAM_ID', type: r4type.str, len: 10 },
      { name: 'ADATE', type: r4type.date, len: 8 },
      { name: 'AMT', type: r4type.num, len: 8, dec: 2 }
   ];
}

beforeAll(() => {
   fs.mkdirSync(dir, { recursive: true });
   deleteTable(table);

   const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
   try {
      const data = c4.create(table, fields());
      data.appendStart(0);
      const p = data.field('PROGRAM_ID');
      const d = data.field('ADATE');
      const a = data.field('AMT');
      for (let i = 0; i < 1000; i++) {
         data.appendBlank();
         p.assign('P' + (i % 10));
         d.assign('202601' + String((i % 28) + 1).padStart(2, '0'));
         a.assign(String(i));
      }
      data.flush();
      data.close();
   } finally {
      c4.dispose();
   }
});

describe('in-memory indexes', () => {
   it('builds exact, range, count and full sorted traversal', () => {
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1, memIndexAutoRefresh: true });
      const data = c4.open(table);
      try {
         const [byDate, byProgram] = data.memIndexMany(['ADATE', 'PROGRAM_ID']);

         expect(byDate.count('20260115')).toBe(36);
         expect(byDate.find('20260115')).toHaveLength(36);
         expect(byDate.findRange('20260105', '20260110')).toHaveLength(216);
         expect(byDate.all()).toHaveLength(1000);
         expect(byDate.memoryUsed()).toBeGreaterThan(0);

         expect(byProgram.find('P3')).toHaveLength(100);

         const byAmt = data.memIndex('AMT');
         expect(byAmt.findDouble(500)).toHaveLength(1);
         expect(byAmt.findRangeDouble(100, 110)).toHaveLength(11);

         const byProgramCI = data.memIndex('PROGRAM_ID', d4memIndexFlag.caseInsensitive);
         expect(byProgramCI.find('p3')).toHaveLength(100);

         // Same field/flags returns the same store (get-or-create).
         const again = data.memIndex('ADATE');
         expect(again.handle).toBe(byDate.handle);
         again.free();

         byDate.free();
         byProgram.free();
         byAmt.free();
         byProgramCI.free();
      } finally {
         data.close();
         c4.dispose();
      }
   });

   it('returns all record numbers in date order', () => {
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      const data = c4.open(table);
      try {
         const byDate = data.memIndex('ADATE');
         const recs = byDate.all();
         let previous = '';
         for (const rec of recs) {
            data.goLow(rec, 0);
            const current = data.field('ADATE').str(true);
            expect(current >= previous).toBe(true);
            previous = current;
         }
         byDate.free();
      } finally {
         data.close();
         c4.dispose();
      }
   });

   it('detects stale data and refreshes before lookup', () => {
      const c4 = new Code4({
         compatibility: 30,
         safety: 0,
         errOff: 1,
         memIndexAutoRefresh: true
      });
      const data = c4.open(table);
      try {
         const byDate = data.memIndex('ADATE', d4memIndexFlag.checkStale);
         expect(byDate.find('20260115')).toHaveLength(36);

         data.appendStart(0);
         data.appendBlank();
         data.field('PROGRAM_ID').assign('P3');
         data.field('ADATE').assign('20260115');
         data.field('AMT').assign('1');
         data.flush();

         expect(byDate.isStale()).toBe(true);
         expect(byDate.find('20260115')).toHaveLength(37);
         expect(byDate.isStale()).toBe(false);

         byDate.free();
      } finally {
         data.close();
         c4.dispose();
      }
   });

   it('enforces the CODE4 memory budget', () => {
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      c4.memIndexLimits = { maxBytes: 1024, maxIndexes: 2 };
      const data = c4.open(table);
      try {
         expect(() => data.memIndex('ADATE')).toThrow();
      } finally {
         data.close();
         c4.dispose();
      }
   });

   it('frees indexes when the Data4 closes', () => {
      const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
      const data = c4.open(table);
      const byDate = data.memIndex('ADATE');
      expect(c4.memIndexMemoryUsed).toBeGreaterThan(0);
      data.close();
      expect(c4.memIndexMemoryUsed).toBe(0);
      expect(() => byDate.all()).toThrow();
      c4.dispose();
   });
});
