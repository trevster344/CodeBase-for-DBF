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

/** `seek`/`seekNext` return codes, mirroring interfaces/CSharp/Codebase.cs. */
export const r4found = 1;
export const r4after = 2;
export const r4eof = 3;
export const r4bof = 4;

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

/** `<platform>-<arch>` key for the bundled binary folder, e.g. `win32-x64`, `linux-arm64`. */
function platformKey(): string {
   return process.platform + '-' + process.arch;
}

/**
 * File name of the native engine for the current platform/arch:
 *   win32  -> c4dll64.dll (x64) / c4dll.dll (ia32)
 *   linux  -> libc4dll.so  (x64 / arm64)
 *   darwin -> libc4dll.dylib (x64 / arm64)   [not built yet]
 */
function resolveDllName(): string {
   if (process.platform === 'win32') {
      if (process.arch === 'x64') return 'c4dll64.dll';
      if (process.arch === 'ia32') return 'c4dll.dll';
   } else if (process.platform === 'linux') {
      if (process.arch === 'x64' || process.arch === 'arm64') return 'libc4dll.so';
   } else if (process.platform === 'darwin') {
      if (process.arch === 'x64' || process.arch === 'arm64') return 'libc4dll.dylib';
   }
   throw new Error(
      "Unsupported platform/architecture '" + process.platform + '/' + process.arch +
      "' (supported: win32-x64, win32-ia32, linux-x64, linux-arm64)"
   );
}

// Walk up from this module looking for the repo's native build output (works from both the
// TypeScript source and the compiled dist/ layout).
function findInRepoBuild(name: string): string | null {
   const projects: string[] = [];
   if (process.platform === 'win32') {
      projects.push(process.arch === 'x64'
         ? path.join('build', 'MVStudio_2022_Project_VFP_STAND_ALONE_64')
         : path.join('build', 'MVStudio_2022_Project_VFP_STAND_ALONE_32'));
   } else if (process.platform === 'linux') {
      projects.push(path.join('linux', 'build'), path.join('linux', 'build-arm64'));
   }

   let dir = __dirname;
   for (let i = 0; i < 6; i++) {
      for (const project of projects) {
         const candidate = path.join(dir, project, name);
         if (fs.existsSync(candidate)) return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
   }
   return null;
}

// The native engines bundled with the published package: native/<platform>-<arch>/<name>.
function findBundled(name: string): string | null {
   const candidate = path.join(__dirname, '..', 'native', platformKey(), name);
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

/**
 * Bind an engine function.  `__stdcall` applies to the Windows DLLs; koffi ignores it on x64 and
 * rejects it on Linux, so only pass it on win32.
 */
function bind(name: string, result: any, params: any[]): any {
   return process.platform === 'win32'
      ? lib.func('__stdcall', name, result, params)
      : lib.func(name, result, params);
}

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
   code4initVB: bind('code4initVB', CODE4, []),
   code4initUndo: bind('code4initUndo', 'int', [CODE4]),

   // options
   code4compatibility: bind('code4compatibility', 'int16', [CODE4, 'int16']),
   code4safety: bind('code4safety', 'int16', [CODE4, 'int16']),
   code4errOff: bind('code4errOff', 'int16', [CODE4, 'int16']),
   code4readOnly: bind('code4readOnly', 'int16', [CODE4, 'int16']),

   // errors
   code4errorCode: bind('code4errorCode', 'int16', [CODE4, 'int16']),
   error4text: bind('error4text', 'str', [CODE4, 'long']),

   // data files
   d4open: bind('d4open', DATA4, [CODE4, 'str']),
   d4create: bind('d4create', DATA4, [CODE4, 'str', CODE4INFO, TAG4INFOP]),
   // Build TAG4INFO arrays with the engine helper: the array and its strings are engine-allocated,
   // which avoids passing a raw struct array whose string fields the engine later walks.
   t4infoAdd: bind('t4infoAdd', TAG4INFOP, [CODE4, TAG4INFOP, 'int', 'str', 'str', 'str', 'int16', 'uint16']),
   d4close: bind('d4close', 'int', [DATA4]),
   d4appendStart: bind('d4appendStart', 'int16', [DATA4, 'int16']),
   d4appendBlank: bind('d4appendBlank', 'int', [DATA4]),
   d4field: bind('d4field', FIELD4, [DATA4, 'str']),
   // Record numbers and record counts are C `long`: 4 bytes on Windows (LLP64), 8 bytes on Linux
   // (LP64). Koffi's platform-aware 'long' matches the engine on both, unlike a fixed 'int32_t'.
   d4goLow: bind('d4goLow', 'int', [DATA4, 'long', 'int16']),
   d4top: bind('d4top', 'int', [DATA4]),
   d4bottom: bind('d4bottom', 'int', [DATA4]),
   d4skip: bind('d4skip', 'int', [DATA4, 'long']),
   d4seek: bind('d4seek', 'int', [DATA4, 'str']),
   d4seekNext: bind('d4seekNext', 'int', [DATA4, 'str']),
   d4recNoLow: bind('d4recNoLow', 'long', [DATA4]),
   d4eof: bind('d4eof', 'int', [DATA4]),
   d4bof: bind('d4bof', 'int', [DATA4]),
   d4flush: bind('d4flush', 'int', [DATA4]),
   d4delete: bind('d4delete', 'void', [DATA4]),
   d4deleted: bind('d4deleted', 'int', [DATA4]),
   d4pack: bind('d4pack', 'int', [DATA4]),
   d4reindex: bind('d4reindex', 'int', [DATA4]),
   d4tag: bind('d4tag', TAG4, [DATA4, 'str']),
   d4tagSelect: bind('d4tagSelect', 'void', [DATA4, TAG4]),
   d4recCountDo2: bind('d4recCountDo2', 'long', [DATA4, 'uint8']),
   d4numFields: bind('d4numFields', 'int16', [DATA4]),

   // fields
   f4assignN: bind('f4assignN', 'void', [FIELD4, 'str', 'uint']),
   f4assignDouble: bind('f4assignDouble', 'void', [FIELD4, 'double']),
   f4assignInt: bind('f4assignInt', 'void', [FIELD4, 'int']),
   f4str: bind('f4str', 'str', [FIELD4]),
   f4double: bind('f4double', 'double', [FIELD4]),
   f4int: bind('f4int', 'int', [FIELD4]),
   f4long: bind('f4long', 'long', [FIELD4]),

   // memo fields use their own assign/read entry points
   f4memoAssignN: bind('f4memoAssignN', 'int', [FIELD4, 'str', 'uint']),
   f4memoStr: bind('f4memoStr', 'str', [FIELD4]),
   f4memoLen: bind('f4memoLen', 'ulong', [FIELD4])
};

// code4numCodeBaseCount() was added with the lifecycle fix; tolerate engines that lack it.
let _numCodeBaseCount: ((...args: any[]) => any) | null = null;
try {
   _numCodeBaseCount = bind('code4numCodeBaseCount', 'uint', []);
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

   /** Assign an integer value (via f4assignInt) — use for `I` (integer) fields. */
   assignInt(value: number): void {
      native.f4assignInt(this._field, Number(value));
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
      return this.goLow(recNo, 1);
   }

   /**
    * Move to a 1-based record number with an explicit write flag (d4goLow, the engine's `d4go`
    * macro). `goForWrite` defaults to 1 (position for update); pass 0 for read-only positioning.
    */
   goLow(recNo: number, goForWrite = 1): number {
      return native.d4goLow(this._handle, recNo, goForWrite);
   }

   /** Move to the first record / top of the selected tag (d4top). */
   top(): number {
      return native.d4top(this._handle);
   }

   /** Move to the last record / bottom of the selected tag (d4bottom). */
   bottom(): number {
      return native.d4bottom(this._handle);
   }

   /**
    * Move `n` records relative to the current position (d4skip); negative moves backwards. Returns
    * `r4success`, or `r4eof`/`r4bof` when it moves past the ends of the file/tag.
    */
   skip(n = 1): number {
      return native.d4skip(this._handle, n);
   }

   /** Seek on the selected tag for the next matching key (d4seekNext); returns `r4eof` at the end. */
   seekNext(key: string): number {
      return native.d4seekNext(this._handle, key);
   }

   /** 1-based record number of the current record, or <= 0 when no record is positioned (d4recNoLow). */
   recNo(): number {
      return native.d4recNoLow(this._handle);
   }

   /** True when the record pointer is past the last record (d4eof). */
   eof(): boolean {
      return native.d4eof(this._handle) !== 0;
   }

   /** True when the record pointer is before the first record (d4bof). */
   bof(): boolean {
      return native.d4bof(this._handle) !== 0;
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

   /** Flush pending writes (d4flush). */
   flush(): number {
      return native.d4flush(this._handle);
   }

   /** Mark the current record deleted (d4delete); persist with {@link flush} or {@link pack}. */
   delete(): void {
      native.d4delete(this._handle);
   }

   /** True when the current record is marked deleted (d4deleted). */
   deleted(): boolean {
      return native.d4deleted(this._handle) !== 0;
   }

   /** Physically remove deleted records and rebuild the tags (d4pack). */
   pack(): number {
      return native.d4pack(this._handle);
   }

   /** Rebuild all tags for this data file (d4reindex). */
   reindex(): number {
      return native.d4reindex(this._handle);
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
   r4found,
   r4after,
   r4eof,
   r4bof,
   r4type,
   Field4info,
   Tag4info
};

export default api;
