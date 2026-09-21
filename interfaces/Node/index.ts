/*
 * Node.js FFI bindings for the CodeBase native engine (c4dll.dll / c4dll64.dll).
 *
 * Uses koffi (https://koffi.dev) to call the exported C API. The library is loaded at runtime, so
 * the same module targets the 32-bit c4dll.dll (Node ia32) or the 64-bit c4dll64.dll (Node x64).
 * A process can only load a native DLL of its own bitness, so `process.arch` selects the name.
 *
 * The API mirrors the small surface used by interfaces/CSharp/Codebase.cs and the VB.NET
 * interfaces: CODE4 lifecycle (code4initVB / code4initUndo), data file create/open/close, append,
 * field assign/read, go/seek/recCount.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import koffi from 'koffi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ constants */

/** r4success error code. */
export const r4success = 0;

/** CodeBase field type codes (char), mirroring interfaces/CSharp/Codebase.cs. */
export const r4type = {
   bin: 'B',
   double: 'B',
   str: 'C',
   date: 'D',
   float: 'F',
   gen: 'G',
   int: 'I',
   log: 'L',
   memo: 'M',
   num: 'N',
   dateTime: 'T',
   currency: 'Y'
} as const;

/** Options applied to a freshly initialized CODE4 (via code4compatibility/safety/errOff/readOnly). */
export interface Code4Options {
   compatibility?: number;
   safety?: number;
   errOff?: number;
   readOnly?: number;
}

/** A FIELD4INFO entry for {@link Code4.create}. `type` is a CodeBase type code (see {@link r4type}). */
export interface FieldDef {
   name: string;
   type: string | number;
   len?: number;
   dec?: number;
   nulls?: number;
}

/** A TAG4INFO entry for {@link Code4.create}. */
export interface TagDef {
   name: string;
   expression?: string;
   filter?: string;
   unique?: number;
   descending?: number;
}

/* ------------------------------------------------------------- library resolve */

function is64Bit(): boolean {
   return process.arch === 'x64';
}

function resolveDllName(): string {
   if (process.arch === 'x64') return 'c4dll64.dll';
   if (process.arch === 'ia32') return 'c4dll.dll';
   throw new Error("Unsupported Node architecture '" + process.arch + "' (need x64 or ia32)");
}

// Walk up from this module looking for the repo's native build output (works from both the
// TypeScript source and the compiled dist/ layout).
function findInRepoBuild(name: string): string | null {
   const project = is64Bit()
      ? path.join('build', 'MVStudio_2022_Project_VFP_STAND_ALONE_64')
      : path.join('build', 'MVStudio_2022_Project_VFP_STAND_ALONE_32');

   let dir = __dirname;
   for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, project, name);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
   }
   return null;
}

// The native engines bundled with the published package: native/<arch>/<dll>.
function findBundled(name: string): string | null {
   const arch = is64Bit() ? 'x64' : 'x86';
   const candidate = path.join(__dirname, '..', 'native', arch, name);
   return fs.existsSync(candidate) ? candidate : null;
}

// Search order: explicit path -> CODE4_DLL -> CODE4_DLL_DIR -> bundled native/ -> repo build
// output -> cwd -> module dir.
function resolveLibrary(explicit?: string): string {
   if (explicit) return explicit;
   if (process.env.CODE4_DLL) return process.env.CODE4_DLL;

   const name = resolveDllName();

   if (process.env.CODE4_DLL_DIR) {
      const candidate = path.join(process.env.CODE4_DLL_DIR, name);
      if (fs.existsSync(candidate)) return candidate;
   }

   const bundled = findBundled(name);
   if (bundled) return bundled;

   const fromRepo = findInRepoBuild(name);
   if (fromRepo) return fromRepo;

   for (const dir of [process.cwd(), __dirname]) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
   }

   // Let the OS loader search PATH.
   return name;
}

/** Absolute path of the native library that was loaded. */
export const libraryPath = resolveLibrary(process.env.CODE4_DLL);

/** File name of the native library selected for the current process bitness. */
export const dllName = resolveDllName();

const lib = koffi.load(libraryPath);

/* --------------------------------------------------------------------- types */

const CODE4 = koffi.pointer('CODE4', koffi.opaque());
const DATA4 = koffi.pointer('DATA4', koffi.opaque());
const FIELD4 = koffi.pointer('FIELD4', koffi.opaque());
const TAG4 = koffi.pointer('TAG4', koffi.opaque());

// typedef struct { char *name; short type; unsigned short len, dec, nulls; } FIELD4INFO ;
const FIELD4INFO = koffi.struct('FIELD4INFO', {
   name: 'str',
   type: 'int16',
   len: 'uint16',
   dec: 'uint16',
   nulls: 'uint16'
});

// typedef struct { char *name; const char *expression; const char *filter;
//                  short unique; unsigned short descending; } TAG4INFO ;
const TAG4INFO = koffi.struct('TAG4INFO', {
   name: 'str',
   expression: 'str',
   filter: 'str',
   unique: 'int16',
   descending: 'uint16'
});

/* ----------------------------------------------------------------- functions */

const CODE4INFO = koffi.pointer(FIELD4INFO);
const TAG4INFOP = koffi.pointer(TAG4INFO);

const native = {
   // lifecycle
   code4initVB: lib.func('__stdcall', 'code4initVB', CODE4, []),
   code4initUndo: lib.func('__stdcall', 'code4initUndo', 'int', [CODE4]),

   // options
   code4compatibility: lib.func('__stdcall', 'code4compatibility', 'int16', [CODE4, 'int16']),
   code4safety: lib.func('__stdcall', 'code4safety', 'int16', [CODE4, 'int16']),
   code4errOff: lib.func('__stdcall', 'code4errOff', 'int16', [CODE4, 'int16']),
   code4readOnly: lib.func('__stdcall', 'code4readOnly', 'int16', [CODE4, 'int16']),

   // errors
   code4errorCode: lib.func('__stdcall', 'code4errorCode', 'int16', [CODE4, 'int16']),
   error4text: lib.func('__stdcall', 'error4text', 'str', [CODE4, 'int32_t']),

   // data files
   d4open: lib.func('__stdcall', 'd4open', DATA4, [CODE4, 'str']),
   d4create: lib.func('__stdcall', 'd4create', DATA4, [CODE4, 'str', CODE4INFO, TAG4INFOP]),
   // Build TAG4INFO arrays with the engine helper: the array and its strings are engine-allocated,
   // which avoids passing a raw struct array whose string fields the engine later walks.
   t4infoAdd: lib.func('__stdcall', 't4infoAdd', TAG4INFOP, [CODE4, TAG4INFOP, 'int', 'str', 'str', 'str', 'int16', 'uint16']),
   d4close: lib.func('__stdcall', 'd4close', 'int', [DATA4]),
   d4appendStart: lib.func('__stdcall', 'd4appendStart', 'int16', [DATA4, 'int16']),
   d4appendBlank: lib.func('__stdcall', 'd4appendBlank', 'int', [DATA4]),
   d4field: lib.func('__stdcall', 'd4field', FIELD4, [DATA4, 'str']),
   d4goLow: lib.func('__stdcall', 'd4goLow', 'int', [DATA4, 'int32_t', 'int16']),
   d4seek: lib.func('__stdcall', 'd4seek', 'int', [DATA4, 'str']),
   d4tag: lib.func('__stdcall', 'd4tag', TAG4, [DATA4, 'str']),
   d4tagSelect: lib.func('__stdcall', 'd4tagSelect', 'void', [DATA4, TAG4]),
   d4recCountDo2: lib.func('__stdcall', 'd4recCountDo2', 'int32_t', [DATA4, 'uint8']),
   d4numFields: lib.func('__stdcall', 'd4numFields', 'int16', [DATA4]),

   // fields
   f4assignN: lib.func('__stdcall', 'f4assignN', 'void', [FIELD4, 'str', 'uint']),
   f4assignDouble: lib.func('__stdcall', 'f4assignDouble', 'void', [FIELD4, 'double']),
   f4str: lib.func('__stdcall', 'f4str', 'str', [FIELD4]),
   f4double: lib.func('__stdcall', 'f4double', 'double', [FIELD4]),
   f4int: lib.func('__stdcall', 'f4int', 'int', [FIELD4]),
   f4long: lib.func('__stdcall', 'f4long', 'int32_t', [FIELD4]),

   // memo fields use their own assign/read entry points
   f4memoAssignN: lib.func('__stdcall', 'f4memoAssignN', 'int', [FIELD4, 'str', 'uint']),
   f4memoStr: lib.func('__stdcall', 'f4memoStr', 'str', [FIELD4]),
   f4memoLen: lib.func('__stdcall', 'f4memoLen', 'uint32_t', [FIELD4])
};

// code4numCodeBaseCount() was added with the lifecycle fix; tolerate engines that lack it.
let _numCodeBaseCount: ((...args: any[]) => any) | null = null;
try {
   _numCodeBaseCount = lib.func('__stdcall', 'code4numCodeBaseCount', 'uint', []);
} catch {
   _numCodeBaseCount = null;
}

/**
 * Number of live CODE4 instances (code4numCodeBaseCount).
 * Returns `null` when the loaded engine does not export the diagnostic.
 */
export function numCodeBaseInstances(): number | null {
   return _numCodeBaseCount ? _numCodeBaseCount() : null;
}

/* ------------------------------------------------------------------- helpers */

function isNullPtr(p: any): boolean {
   return p == null || p === 0 || p === 0n;
}

function typeCode(type: string | number): number {
   if (typeof type === 'number') return type;
   if (typeof type === 'string' && type.length > 0) return type.charCodeAt(0);
   throw new Error('field type must be a char code or a one-character string');
}

function fieldInfoArray(fields: FieldDef[]): unknown[] {
   const arr = fields.map((f) => ({
      name: f.name,
      type: typeCode(f.type),
      len: f.len || 0,
      dec: f.dec || 0,
      nulls: f.nulls || 0
   }));
   arr.push({ name: null, type: 0, len: 0, dec: 0, nulls: 0 } as any); // null terminator
   return arr;
}

/* -------------------------------------------------------------------- Field4 */

/** A field handle within an open data file. */
export class Field4 {
   private _field: bigint;

   constructor(data: Data4, name: string) {
      this._field = native.d4field(data.handle, name);
      if (isNullPtr(this._field)) {
         throw new Error("d4field('" + name + "') failed: " + data.errorText());
      }
   }

   /** Assign a string value (ANSI, via f4assignN). */
   assign(value: string | number): void {
      const s = String(value);
      native.f4assignN(this._field, s, Buffer.byteLength(s));
   }

   /** Assign a double value (via f4assignDouble). */
   assignDouble(value: number): void {
      native.f4assignDouble(this._field, Number(value));
   }

   /** Read the field as a string (via f4str). */
   str(): string {
      return native.f4str(this._field);
   }

   /** Read the field as a double (via f4double). */
   double(): number {
      return native.f4double(this._field);
   }

   /** Read the field as an integer (via f4int). */
   int(): number {
      return native.f4int(this._field);
   }

   /** Assign a memo value (via f4memoAssignN). */
   memoAssign(value: string): void {
      const s = String(value);
      native.f4memoAssignN(this._field, s, Buffer.byteLength(s));
   }

   /** Read a memo value (via f4memoStr). */
   memoStr(): string {
      return native.f4memoStr(this._field);
   }

   /** Length of the memo value (via f4memoLen). */
   memoLen(): number {
      return native.f4memoLen(this._field);
   }
}

/* --------------------------------------------------------------------- Data4 */

/** An open DATA4 (data file). */
export class Data4 {
   private _code4: Code4;
   private _handle: bigint | null;
   private _closed: boolean;

   constructor(code4: Code4, handle: bigint) {
      this._code4 = code4;
      this._handle = handle;
      this._closed = false;
      if (isNullPtr(handle)) {
         throw new Error('d4open/d4create failed: ' + code4.errorText());
      }
   }

   /** Opaque native DATA4 pointer. */
   get handle(): bigint {
      return this._handle!;
   }

   isValid(): boolean {
      return !isNullPtr(this._handle);
   }

   errorText(): string {
      return this._code4.errorText();
   }

   appendStart(memo?: number): number {
      return native.d4appendStart(this._handle, memo || 0);
   }

   appendBlank(): number {
      return native.d4appendBlank(this._handle);
   }

   field(name: string): Field4 {
      return new Field4(this, name);
   }

   go(recNo: number): number {
      return native.d4goLow(this._handle, recNo, 1);
   }

   seek(key: string): number {
      return native.d4seek(this._handle, key);
   }

   /** Select the active tag by name (d4tag + d4tagSelect), as needed before {@link seek}. */
   select(tagName: string): void {
      const tag = native.d4tag(this._handle, tagName);
      if (isNullPtr(tag)) {
         throw new Error("d4tag('" + tagName + "') failed: " + this.errorText());
      }
      native.d4tagSelect(this._handle, tag);
   }

   recCount(): number {
      return native.d4recCountDo2(this._handle, 0);
   }

   numFields(): number {
      return native.d4numFields(this._handle);
   }

   close(): number {
      if (this._closed) return r4success;
      this._closed = true;
      const rc = native.d4close(this._handle);
      this._handle = null;
      return rc;
   }
}

/* --------------------------------------------------------------------- Code4 */

/** A CODE4 instance; the entry point to the engine. */
export class Code4 {
   private _handle: bigint | null;
   private _disposed: boolean;

   constructor(options?: Code4Options) {
      options = options || {};
      this._handle = native.code4initVB();
      this._disposed = false;
      if (isNullPtr(this._handle)) {
         throw new Error('code4initVB failed');
      }
      if (options.compatibility !== undefined) native.code4compatibility(this._handle, options.compatibility);
      if (options.safety !== undefined) native.code4safety(this._handle, options.safety);
      if (options.errOff !== undefined) native.code4errOff(this._handle, options.errOff);
      if (options.readOnly !== undefined) native.code4readOnly(this._handle, options.readOnly);
   }

   /** Opaque native CODE4 pointer. */
   get handle(): bigint {
      return this._handle!;
   }

   /** Current error code (via code4errorCode). */
   get errorCode(): number {
      return native.code4errorCode(this._handle, -5);
   }

   /** Error description for `code` (or the current error). */
   errorText(code?: number): string {
      const c = code === undefined ? this.errorCode : code;
      return native.error4text(this._handle, c);
   }

   /** Open an existing data file. */
   open(name: string): Data4 {
      return new Data4(this, native.d4open(this._handle, name));
   }

   /** Create a new data file with the given fields and optional tags. */
   create(name: string, fields: FieldDef[], tags?: TagDef[] | null): Data4 {
      let tagInfo: bigint | null = null;
      if (tags && tags.length > 0) {
         for (let i = 0; i < tags.length; i++) {
            const t = tags[i];
            tagInfo = native.t4infoAdd(
               this._handle,
               tagInfo,
               i,
               t.name,
               t.expression || t.name,
               t.filter || '',
               t.unique || 0,
               t.descending || 0
            );
            if (isNullPtr(tagInfo)) {
               throw new Error('t4infoAdd failed: ' + this.errorText());
            }
         }
      }
      const handle = native.d4create(this._handle, name, fieldInfoArray(fields), tagInfo);
      return new Data4(this, handle);
   }

   /** Release the CODE4 (code4initUndo). Idempotent. */
   dispose(): void {
      if (this._disposed) return;
      this._disposed = true;
      native.code4initUndo(this._handle);
      this._handle = null;
   }

   [Symbol.dispose](): void {
      this.dispose();
   }
}

/* -------------------------------------------------------------------- exports */

/** The koffi module instance used by the bindings. */
export { koffi };

/** Raw koffi struct type for FIELD4INFO. */
export const Field4info = FIELD4INFO;

/** Raw koffi struct type for TAG4INFO. */
export const Tag4info = TAG4INFO;

const api = {
   koffi,
   libraryPath,
   dllName,
   numCodeBaseInstances,
   Code4,
   Data4,
   Field4,
   r4success,
   r4type,
   Field4info,
   Tag4info
};

export default api;
