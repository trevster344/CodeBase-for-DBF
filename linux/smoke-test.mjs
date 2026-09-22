/*
 * Standalone smoke test for a built CodeBase Linux engine (libc4dll.so).
 *
 * Usage:  node smoke-test.mjs <path-to-libc4dll.so>
 *
 * Requires koffi (npm install koffi).  Exercises the CODE4 lifecycle and a CRUD round-trip with
 * every field type, a memo, and two CDX tags.  Exit code 0 = PASS.
 */
import koffi from 'koffi';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const libPath = process.argv[2] || process.env.CODE4_SO;
if (!libPath) {
   console.error('usage: node smoke-test.mjs <path-to-libc4dll.so>');
   process.exit(2);
}

const lib = koffi.load(libPath);
const CODE4 = koffi.pointer('CODE4', koffi.opaque());
const DATA4 = koffi.pointer('DATA4', koffi.opaque());
const FIELD4 = koffi.pointer('FIELD4', koffi.opaque());
const TAG4 = koffi.pointer('TAG4', koffi.opaque());
const FIELD4INFO = koffi.struct('FIELD4INFO', { name: 'str', type: 'int16', len: 'uint16', dec: 'uint16', nulls: 'uint16' });
const TAG4INFO = koffi.struct('TAG4INFO', { name: 'str', expression: 'str', filter: 'str', unique: 'int16', descending: 'uint16' });
const F = (n, r, a) => lib.func(n, r, a);
const code4initVB = F('code4initVB', CODE4, []);
const code4initUndo = F('code4initUndo', 'int', [CODE4]);
const code4numCodeBaseCount = F('code4numCodeBaseCount', 'uint', []);
const code4compatibility = F('code4compatibility', 'int16', [CODE4, 'int16']);
const code4errOff = F('code4errOff', 'int16', [CODE4, 'int16']);
const t4infoAdd = F('t4infoAdd', koffi.pointer(TAG4INFO), [CODE4, koffi.pointer(TAG4INFO), 'int', 'str', 'str', 'str', 'int16', 'uint16']);
const d4create = F('d4create', DATA4, [CODE4, 'str', koffi.pointer(FIELD4INFO), koffi.pointer(TAG4INFO)]);
const d4open = F('d4open', DATA4, [CODE4, 'str']);
const d4close = F('d4close', 'int', [DATA4]);
const d4appendStart = F('d4appendStart', 'int16', [DATA4, 'int16']);
const d4appendBlank = F('d4appendBlank', 'int', [DATA4]);
const d4field = F('d4field', FIELD4, [DATA4, 'str']);
const f4assignN = F('f4assignN', 'void', [FIELD4, 'str', 'uint']);
const f4assignDouble = F('f4assignDouble', 'void', [FIELD4, 'double']);
const f4memoAssignN = F('f4memoAssignN', 'int', [FIELD4, 'str', 'uint']);
const f4str = F('f4str', 'str', [FIELD4]);
const f4double = F('f4double', 'double', [FIELD4]);
const f4memoStr = F('f4memoStr', 'str', [FIELD4]);
const d4recCountDo2 = F('d4recCountDo2', 'int32_t', [DATA4, 'uint8']);
const d4goLow = F('d4goLow', 'int', [DATA4, 'int32_t', 'int16']);
const d4tag = F('d4tag', TAG4, [DATA4, 'str']);
const d4tagSelect = F('d4tagSelect', 'void', [DATA4, TAG4]);
const d4seek = F('d4seek', 'int', [DATA4, 'str']);

let rc = 0;
const dir = path.join(os.tmpdir(), 'codebase_smoke');
fs.mkdirSync(dir, { recursive: true });
const table = path.join(dir, 'SMOKE');
for (const ext of ['.dbf', '.cdx', '.fpt', '.idx']) { try { fs.unlinkSync(table + ext); } catch { /* ignore */ } }

// lifecycle
if (code4numCodeBaseCount() !== 0) { console.error('  lifecycle: FAIL (initial count != 0)'); rc = 1; }
const c4 = code4initVB();
code4compatibility(c4, 30);
code4errOff(c4, 1);
if (code4numCodeBaseCount() !== 1) { console.error('  lifecycle: FAIL (count != 1 after init)'); rc = 1; }

// CRUD with all field types + memo + 2 tags
const fields = [
   { name: 'STR', type: 67, len: 10, dec: 0, nulls: 0 },
   { name: 'NUM', type: 78, len: 6, dec: 2, nulls: 0 },
   { name: 'DBL', type: 66, len: 8, dec: 0, nulls: 0 },
   { name: 'LOG', type: 76, len: 1, dec: 0, nulls: 0 },
   { name: 'DATE', type: 68, len: 8, dec: 0, nulls: 0 },
   { name: 'MEM', type: 77, len: 10, dec: 0, nulls: 0 },
   { name: null, type: 0, len: 0, dec: 0, nulls: 0 }
];
let tag = null;
tag = t4infoAdd(c4, tag, 0, 'STR', 'STR', '', 0, 0);
tag = t4infoAdd(c4, tag, 1, 'NUM', 'NUM', '', 0, 0);

const data = d4create(c4, table, fields, tag);
d4appendStart(data, 0);
for (let i = 1; i <= 20; i++) {
   d4appendBlank(data);
   f4assignN(d4field(data, 'STR'), 'R' + i, ('R' + i).length);
   const num = (i * 1.5).toFixed(2);
   f4assignN(d4field(data, 'NUM'), num, num.length);
   f4assignDouble(d4field(data, 'DBL'), i + 0.25);
   f4assignN(d4field(data, 'LOG'), i % 2 === 1 ? 'T' : 'F', 1);
   f4assignN(d4field(data, 'DATE'), '20240101', 8);
   const m = 'memo ' + i;
   f4memoAssignN(d4field(data, 'MEM'), m, m.length);
}
d4close(data);

const d2 = d4open(c4, table);
if (d4recCountDo2(d2, 0) !== 20) { console.error('  crud: FAIL (recCount)'); rc = 1; }
let ok = true;
for (let i = 1; i <= 20; i++) {
   d4goLow(d2, i, 1);
   if (f4str(d4field(d2, 'STR')).trim() !== 'R' + i) { ok = false; break; }
   if (f4str(d4field(d2, 'NUM')).trim() !== (i * 1.5).toFixed(2)) { ok = false; break; }
   if (Math.abs(f4double(d4field(d2, 'DBL')) - (i + 0.25)) > 1e-9) { ok = false; break; }
   if (f4str(d4field(d2, 'LOG')).trim() !== (i % 2 === 1 ? 'T' : 'F')) { ok = false; break; }
   if (f4memoStr(d4field(d2, 'MEM')) !== 'memo ' + i) { ok = false; break; }
}
if (!ok) { console.error('  crud: FAIL (record mismatch)'); rc = 1; }
d4tagSelect(d2, d4tag(d2, 'STR'));
if (d4seek(d2, 'R7') !== 0 || f4str(d4field(d2, 'STR')).trim() !== 'R7') { console.error('  crud: FAIL (seek)'); rc = 1; }
d4close(d2);

code4initUndo(c4);
if (code4numCodeBaseCount() !== 0) { console.error('  lifecycle: FAIL (count != 0 after undo)'); rc = 1; }

console.log(rc === 0 ? 'SMOKE PASS (' + libPath + ')' : 'SMOKE FAIL');
process.exit(rc);
