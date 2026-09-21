'use strict';

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

const fs = require('fs');
const path = require('path');
const koffi = require('koffi');

/* ------------------------------------------------------------------ constants */

const r4success = 0;

// Field type codes (char), matching interfaces/CSharp/Codebase.cs.
const r4type = {
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
};

/* ------------------------------------------------------------- library resolve */

function is64Bit() {
   return process.arch === 'x64';
}

function dllName() {
   if (process.arch === 'x64') return 'c4dll64.dll';
   if (process.arch === 'ia32') return 'c4dll.dll';
   throw new Error("Unsupported Node architecture '" + process.arch + "' (need x64 or ia32)");
}

// Search order: explicit path -> CODE4_DLL -> CODE4_DLL_DIR -> repo build output -> cwd -> module dir.
function resolveLibrary(explicit) {
   if (explicit) return explicit;
   if (process.env.CODE4_DLL) return process.env.CODE4_DLL;

   const name = dllName();
   const root = path.resolve(__dirname, '..', '..');
   const buildDir = is64Bit()
      ? path.join(root, 'build', 'MVStudio_2022_Project_VFP_STAND_ALONE_64')
      : path.join(root, 'build', 'MVStudio_2022_Project_VFP_STAND_ALONE_32');

   const dirs = [];
   if (process.env.CODE4_DLL_DIR) dirs.push(process.env.CODE4_DLL_DIR);
   dirs.push(buildDir, process.cwd(), __dirname);

   for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
   }

   // Let the OS loader search PATH.
   return name;
}

const libraryPath = resolveLibrary(process.env.CODE4_DLL);
const lib = koffi.load(libraryPath);

/* --------------------------------------------------------------------- types */

const CODE4 = koffi.pointer('CODE4', koffi.opaque());
const DATA4 = koffi.pointer('DATA4', koffi.opaque());
const FIELD4 = koffi.pointer('FIELD4', koffi.opaque());

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
   d4close: lib.func('__stdcall', 'd4close', 'int', [DATA4]),
   d4appendStart: lib.func('__stdcall', 'd4appendStart', 'int16', [DATA4, 'int16']),
   d4appendBlank: lib.func('__stdcall', 'd4appendBlank', 'int', [DATA4]),
   d4field: lib.func('__stdcall', 'd4field', FIELD4, [DATA4, 'str']),
   d4goLow: lib.func('__stdcall', 'd4goLow', 'int', [DATA4, 'int32_t', 'int16']),
   d4seek: lib.func('__stdcall', 'd4seek', 'int', [DATA4, 'str']),
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
let _numCodeBaseCount = null;
try {
   _numCodeBaseCount = lib.func('__stdcall', 'code4numCodeBaseCount', 'uint', []);
} catch (e) {
   _numCodeBaseCount = null;
}

function numCodeBaseInstances() {
   return _numCodeBaseCount ? _numCodeBaseCount() : null;
}

/* ------------------------------------------------------------------- helpers */

function isNullPtr(p) {
   return p == null || p === 0 || p === 0n;
}

function typeCode(type) {
   if (typeof type === 'number') return type;
   if (typeof type === 'string' && type.length > 0) return type.charCodeAt(0);
   throw new Error('field type must be a char code or a one-character string');
}

function fieldInfoArray(fields) {
   const arr = fields.map((f) => ({
      name: f.name,
      type: typeCode(f.type),
      len: f.len || 0,
      dec: f.dec || 0,
      nulls: f.nulls || 0
   }));
   arr.push({ name: null, type: 0, len: 0, dec: 0, nulls: 0 }); // null terminator
   return arr;
}

function tagInfoArray(tags) {
   if (!tags || tags.length === 0) return null;
   const arr = tags.map((t) => ({
      name: t.name,
      expression: t.expression || t.name,
      filter: t.filter || '',
      unique: t.unique || 0,
      descending: t.descending || 0
   }));
   arr.push({ name: null, expression: null, filter: null, unique: 0, descending: 0 });
   return arr;
}

/* -------------------------------------------------------------------- Field4 */

class Field4 {
   constructor(data, name) {
      this._field = native.d4field(data.handle, name);
      if (isNullPtr(this._field)) {
         throw new Error("d4field('" + name + "') failed: " + data.errorText());
      }
   }

   assign(value) {
      const s = String(value);
      native.f4assignN(this._field, s, Buffer.byteLength(s));
   }

   assignDouble(value) {
      native.f4assignDouble(this._field, Number(value));
   }

   str() {
      return native.f4str(this._field);
   }

   double() {
      return native.f4double(this._field);
   }

   int() {
      return native.f4int(this._field);
   }

   memoAssign(value) {
      const s = String(value);
      native.f4memoAssignN(this._field, s, Buffer.byteLength(s));
   }

   memoStr() {
      return native.f4memoStr(this._field);
   }

   memoLen() {
      return native.f4memoLen(this._field);
   }
}

/* --------------------------------------------------------------------- Data4 */

class Data4 {
   constructor(code4, handle) {
      this._code4 = code4;
      this._handle = handle;
      this._closed = false;
      if (isNullPtr(handle)) {
         throw new Error('d4open/d4create failed: ' + code4.errorText());
      }
   }

   get handle() {
      return this._handle;
   }

   isValid() {
      return !isNullPtr(this._handle);
   }

   errorText() {
      return this._code4.errorText();
   }

   appendStart(memo) {
      return native.d4appendStart(this._handle, memo || 0);
   }

   appendBlank() {
      return native.d4appendBlank(this._handle);
   }

   field(name) {
      return new Field4(this, name);
   }

   go(recNo) {
      return native.d4goLow(this._handle, recNo, 1);
   }

   seek(key) {
      return native.d4seek(this._handle, key);
   }

   recCount() {
      return native.d4recCountDo2(this._handle, 0);
   }

   numFields() {
      return native.d4numFields(this._handle);
   }

   close() {
      if (this._closed) return r4success;
      this._closed = true;
      const rc = native.d4close(this._handle);
      this._handle = null;
      return rc;
   }
}

/* --------------------------------------------------------------------- Code4 */

class Code4 {
   constructor(options) {
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

   get handle() {
      return this._handle;
   }

   get errorCode() {
      return native.code4errorCode(this._handle, -5);
   }

   errorText(code) {
      const c = code === undefined ? this.errorCode : code;
      return native.error4text(this._handle, c);
   }

   open(name) {
      return new Data4(this, native.d4open(this._handle, name));
   }

   create(name, fields, tags) {
      const handle = native.d4create(
         this._handle,
         name,
         fieldInfoArray(fields),
         tagInfoArray(tags)
      );
      return new Data4(this, handle);
   }

   dispose() {
      if (this._disposed) return;
      this._disposed = true;
      native.code4initUndo(this._handle);
      this._handle = null;
   }

   [Symbol.dispose]() {
      this.dispose();
   }
}

/* -------------------------------------------------------------------- exports */

module.exports = {
   koffi,
   libraryPath,
   dllName: dllName(),
   numCodeBaseInstances,
   Code4,
   Data4,
   Field4,
   r4success,
   r4type,
   Field4info: FIELD4INFO,
   Tag4info: TAG4INFO
};
