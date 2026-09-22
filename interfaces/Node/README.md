# @trevster344/codebase

Node.js FFI bindings (ESM + CommonJS) for the **CodeBase** native engine (`c4dll.dll` /
`c4dll64.dll`), with TypeScript types. It calls the exported C API in-process through
[koffi](https://koffi.dev) — no server, no ODBC, no extra process.

The package bundles the engines for **Windows (x64/ia32)** and **Linux (x64/arm64)** under
`native/<platform>-<arch>/` and picks the one matching `process.platform` + `process.arch` at runtime.

- Create, open, read and write DBF/CDX tables.
- Full CODE4 lifecycle (`code4initVB` / `code4initUndo`) exposed as `Code4` + `dispose()`.
- Typed: ships `dist/index.d.ts`.
- ESM (`import`) and CommonJS (`require`), Node ≥ 20, Windows and Linux.

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [API reference](#api-reference)
- [Field types](#field-types)
- [C API → JavaScript](#c-api--javascript)
- [Recipes](#recipes)
- [Library resolution](#library-resolution)
- [Platform and bitness](#platform-and-bitness)
- [Lifecycle and memory](#lifecycle-and-memory)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Publishing](#publishing)
- [License](#license)

---

## Requirements

| | |
|---|---|
| OS | **Windows** (x64/ia32) and **Linux** (x64/arm64) |
| Node.js | **≥ 20**. Both `import` (ESM) and `require()` (CommonJS) are supported |
| Bitness | the Node process must match the engine (a process can only load its own bitness) |

The native engines are self-contained; there is nothing else to install.

## Installation

The package is published to **GitHub Packages**, so point the `@trevster344` scope at that registry
and authenticate with a token that has `read:packages`:

```ini
# .npmrc (project root)
@trevster344:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm install @trevster344/codebase
```

> **koffi install script.** `koffi` ships a prebuilt native binding and runs an install script. Under
> npm ≥ 11 you may need to approve it once: `npm install-scripts approve koffi`. This is normal for
> koffi, not specific to this package.

### From source

```bash
npm install          # installs koffi + typescript
npm run build        # tsc -> dist/index.js + dist/index.d.ts
npm run bundle-native # stages the built engines into native/<platform>-<arch>/
```

## Quick start

```js
import { Code4, r4success, r4type } from '@trevster344/codebase';

const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
try {
   // Create a table with two fields and one tag.
   let data = c4.create('C:/temp/PEOPLE', [
      { name: 'NAME', type: r4type.str, len: 30 },
      { name: 'AGE',  type: r4type.num, len: 3 }
   ], [{ name: 'NAME', expression: 'NAME' }]);

   // Append two records.
   data.appendStart(0);
   data.appendBlank();
   data.field('NAME').assign('Alice');
   data.field('AGE').assign('42');
   data.appendBlank();
   data.field('NAME').assign('Bob');
   data.field('AGE').assign('35');
   data.close();

   // Reopen, read and seek.
   data = c4.open('C:/temp/PEOPLE');
   console.log('records:', data.recCount());        // 2

   data.select('NAME');                             // choose the tag to seek on
   if (data.seek('Bob') === r4success) {
      console.log('Bob is', data.field('AGE').int()); // 35
   }
   data.close();
} finally {
   c4.dispose();                                    // always release the CODE4
}
```

> The target folder (`C:/temp` above) must already exist — CodeBase creates the `.dbf`/`.cdx`/`.fpt`
> files, not the directory. Use forward slashes (`C:/temp/PEOPLE`) or escaped backslashes.

## Core concepts

### CODE4 — the engine instance

Everything happens inside a `CODE4`. `new Code4(options)` calls `code4initVB()`, and `dispose()`
calls `code4initUndo()`. A `Code4` holds the engine's memory pools, open files, and lock state.

Create **one `Code4` per request/operation** (or per worker) and always release it. The engine
keeps a global count of live instances (`code4numCodeBaseCount`), exposed here as
[`numCodeBaseInstances()`](#numcodebaseinstances).

```js
const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1, readOnly: 0 });
// ... use c4 ...
c4.dispose();
```

`dispose()` is idempotent and also implements `Symbol.dispose`, so TypeScript 5.2+ can use it with
`using` (see [Server / web usage](#server--web-usage)).

### DATA4 — an open data file

`Code4.create()` and `Code4.open()` return a `Data4` (a `DATA4*`). It has a record pointer that
moves with `go()`, `seek()` and appends. Call `close()` when done.

### FIELD4 — a field in a data file

`Data4.field(name)` returns a `Field4` (`FIELD4*`) used to assign and read values. Field access is
by name (case-insensitive in CodeBase).

### Tags

A tag is an index. `create()` takes an array of tags; `seek()` searches the **currently selected**
tag, so call `select(tagName)` first when a table has more than one tag.

### Errors

CodeBase reports failures as numeric error codes; `r4success` is `0`. The wrapper **throws** when a
handle cannot be created (e.g. `open()`/`create()`/`field()`/`select()` fail) with the engine's
description in the message. Methods that return a code (`seek`, `go`, `appendBlank`, `recCount`, …)
return the raw code.

Set `errOff: 1` to suppress the engine's error dialogs (recommended for servers).

### Strings and encoding

Field values are passed as **ANSI** (`char *`). `assign()` copies the string into the field via
`f4assignN`; reading uses `f4str`. Memo fields use the dedicated `f4memoAssignN` / `f4memoStr`.

---

## API reference

### `new Code4(options?)`

Creates and initializes a CODE4. Throws if initialization fails.

```ts
interface Code4Options {
   compatibility?: number; // e.g. 30
   safety?: number;        // 0 = fastest
   errOff?: number;        // 1 = no error dialogs
   readOnly?: number;      // 1 = open files read-only
   trim?: boolean;         // true = Field4.str()/memoStr() strip padding spaces (default false)
}
```

```js
const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1, readOnly: 1 });
```

| Member | Type | Description |
|---|---|---|
| `handle` | `bigint` | Opaque native `CODE4*` (rarely needed directly). |
| `trim` | `boolean` | Whether `Field4.str()`/`memoStr()` trim padding spaces by default. |
| `errorCode` | `number` | Current error code (`code4errorCode`). |
| `errorText(code?)` | `string` | Description for `code` (or the current error). |
| `open(name)` | `Data4` | Open an existing table; throws on failure. |
| `create(name, fields, tags?)` | `Data4` | Create a table; throws on failure. |
| `dispose()` | `void` | Release the CODE4 (`code4initUndo`); idempotent. |
| `[Symbol.dispose]()` | `void` | Same as `dispose()`, for `using`. |

`name` is a path **without** an extension (CodeBase appends `.dbf`, `.cdx`, `.fpt`, …), e.g.
`'C:/temp/PEOPLE'`.

### `Data4`

| Member | Type | Description |
|---|---|---|
| `handle` | `bigint` | Opaque native `DATA4*`. |
| `isValid()` | `boolean` | Whether the handle is open. |
| `errorText()` | `string` | Current error description. |
| `appendStart(memo?)` | `number` | Begin appending (call once before `appendBlank`). |
| `appendBlank()` | `number` | Append an empty record and move to it. |
| `field(name)` | `Field4` | Get a field handle; throws if the field does not exist. |
| `fieldAt(index)` | `Field4` | Field handle by 1-based position (`d4fieldJ`); throws when out of range. |
| `fields()` | `FieldInfo[]` | Descriptors for every field, incl. null/auto flags (`d4fieldInfo`). |
| `fieldNames()` | `string[]` | Field names in order. |
| `go(recNo)` | `number` | Move to a 1-based record number (same as `goLow(recNo, 1)`). |
| `goLow(recNo, goForWrite?)` | `number` | Move to a record with an explicit write flag (`d4goLow`, the engine's `d4go`); `goForWrite` defaults to `1`. |
| `top()` | `number` | Move to the first record / top of the selected tag (`d4top`). |
| `bottom()` | `number` | Move to the last record / bottom of the selected tag (`d4bottom`). |
| `skip(n?)` | `number` | Move `n` records relative to the current position (`d4skip`); negative moves backwards. Defaults to `1`. |
| `seekNext(key)` | `number` | Seek on the selected tag for the next matching key (`d4seekNext`); returns `r4eof` at the end. |
| `recNo()` | `number` | 1-based current record number, or `<= 0` when unpositioned (`d4recNoLow`). |
| `eof()` | `boolean` | Whether the pointer is past the last record (`d4eof`). |
| `bof()` | `boolean` | Whether the pointer is before the first record (`d4bof`). |
| `select(tagName)` | `void` | Select the active tag (`d4tag` + `d4tagSelect`); throws if missing. |
| `seek(key)` | `number` | Seek on the selected tag; returns `r4success` (0) on a hit. |
| `recCount()` | `number` | Number of records. |
| `numFields()` | `number` | Number of fields. |
| `flush()` | `number` | Flush pending writes (`d4flush`). |
| `delete()` | `void` | Mark the current record deleted (`d4delete`); persist with `flush()`/`pack()`. |
| `deleted()` | `boolean` | Whether the current record is marked deleted (`d4deleted`). |
| `pack()` | `number` | Physically remove deleted records and rebuild tags (`d4pack`). |
| `reindex()` | `number` | Rebuild all tags (`d4reindex`). |
| `close()` | `number` | Close the file; idempotent. |

### `Field4`

| Member | Type | Description |
|---|---|---|
| `assign(value)` | `void` | Assign a string/number (`f4assignN`). |
| `assignDouble(value)` | `void` | Assign a double (`f4assignDouble`). |
| `assignInt(value)` | `void` | Assign an integer (`f4assignInt`) — use for `I` fields. |
| `str(trim?)` | `string` | Read as string (`f4str`); trims padding spaces when trimming is enabled. `str(false)` returns the raw fixed-width value. |
| `double()` | `number` | Read as double (`f4double`). |
| `int()` | `number` | Read as integer (`f4int`). |
| `memoAssign(value)` | `void` | Assign a memo (`f4memoAssignN`). |
| `memoStr(trim?)` | `string` | Read a memo (`f4memoStr`); trims padding spaces when trimming is enabled (per-call override supported). |
| `memoLen()` | `number` | Memo length (`f4memoLen`). |
| `name()` | `string` | Field name (`f4name`; long names supported). |
| `number()` | `number` | 1-based field position (`f4number`). |
| `type()` | `string` | One-character type code (`f4type`). |
| `len()` | `number` | Field width (`f4len`). |
| `decimals()` | `number` | Decimal count (`f4decimals`). |
| `nullable()` | `boolean` | Whether the field allows nulls (`f4nullable`). |
| `info()` | `FieldInfo` | Full descriptor incl. null/auto flags (same shape as `fields()`). |

### `FieldInfo`

Returned by `Data4.fields()` and `Field4.info()`.

```ts
interface FieldInfo {
   number: number;          // 1-based position
   name: string;
   type: string;            // one-char code; binary char/memo appear as 'Z'/'X'
   len: number;
   dec: number;
   nulls: number;           // raw code: 0 | r4null | r4autoIncrement | r4autoTimestamp
   nullable: boolean;
   autoIncrement: boolean;
   autoTimestamp: boolean;
}
```

```js
for (const f of data.fields()) {
   console.log(f.number, f.name, f.type, f.len, f.dec, f.nullable, f.autoIncrement);
}
```

> **Trimming.** Character/numeric fields are fixed-width, so `f4str` returns the full field width
> (char fields padded on the right, numeric fields right-justified with leading spaces). Pass
> `trim: true` to `new Code4(...)` and `str()`/`memoStr()` strip the surrounding spaces, or override
> per call with `str(false)` for the raw value. Trimming is **off by default**.

### `numCodeBaseInstances()`

```ts
function numCodeBaseInstances(): number | null;
```

Live CODE4 count (`code4numCodeBaseCount`), or `null` if the loaded engine predates that diagnostic.
Use it to assert you are not leaking instances.

### Constants and values

| Export | Type | Description |
|---|---|---|
| `r4success` | `0` | Success code returned by `seek`, `go`, … |
| `r4found` / `r4after` | `1` / `2` | `seek` results: primary-key match / key found after seek. |
| `r4eof` / `r4bof` | `3` / `4` | `skip`/`seekNext` results at the end / start of the file or tag. |
| `r4null` | `190` | `FieldInfo.nulls` code: field allows nulls (FoxPro). |
| `r4autoIncrement` | `195` | `FieldInfo.nulls` code: auto-increment field (FoxPro, `B` fields). |
| `r4autoTimestamp` | `200` | `FieldInfo.nulls` code: auto-timestamp field (FoxPro, `T` fields). |
| `r4type` | object | Field type codes (see [Field types](#field-types)). |
| `libraryPath` | `string` | Absolute path of the engine that was loaded. |
| `dllName` | `string` | File name selected for the current bitness. |
| `Field4info` / `Tag4info` | koffi types | Raw `FIELD4INFO` / `TAG4INFO` structs (advanced). |
| `koffi` | module | The koffi instance, for advanced FFI calls. |

### Types

```ts
interface FieldDef {
   name: string;
   type: string | number; // a r4type code, e.g. r4type.str
   len?: number;
   dec?: number;
   nulls?: number;
}

interface TagDef {
   name: string;
   expression?: string;   // defaults to name
   filter?: string;
   unique?: number;
   descending?: number;
}
```

---

## Field types

`r4type` maps a friendly name to the CodeBase field type code (a single character).

| `r4type` | Code | Field type | Notes |
|---|---|---|---|
| `str` | `C` | Character | `len` = width |
| `num` | `N` | Numeric | `len` = width, `dec` = decimals |
| `int` | `I` | Integer | 4 bytes |
| `double` / `bin` | `B` | Double (FoxPro) | 8 bytes |
| `float` | `F` | Float | |
| `date` | `D` | Date | 8 chars, `YYYYMMDD` |
| `dateTime` | `T` | DateTime | |
| `currency` | `Y` | Currency | |
| `log` | `L` | Logical | `'T'` / `'F'` |
| `memo` | `M` | Memo | stored in the `.fpt` side file |
| `gen` | `G` | General | |

> Write `I` (integer) fields with `assignInt()` and read them with `int()`; write `B` (double)
> fields with `assignDouble()` and read them with `double()`. Everything else accepts `assign()` /
> `str()` (and `int()`/`double()` convert from the stored text).

```js
c4.create('C:/temp/TYPES', [
   { name: 'NAME',  type: r4type.str,      len: 30 },
   { name: 'QTY',   type: r4type.num,      len: 6, dec: 2 },
   { name: 'COUNT', type: r4type.int,      len: 4 },
   { name: 'PRICE', type: r4type.double,   len: 8 },
   { name: 'ACTIVE',type: r4type.log,      len: 1 },
   { name: 'NOTES', type: r4type.memo,     len: 10 }
]);
```

## C API → JavaScript

| CodeBase C | This package |
|---|---|
| `code4initVB` / `code4initUndo` | `new Code4()` / `dispose()` |
| `code4compatibility`, `code4safety`, `code4errOff`, `code4readOnly` | `Code4Options` |
| `code4errorCode` / `error4text` | `errorCode` / `errorText()` |
| `code4numCodeBaseCount` | `numCodeBaseInstances()` |
| `d4create` / `d4open` / `d4close` | `create()` / `open()` / `close()` |
| `d4appendStart` / `d4appendBlank` | `appendStart()` / `appendBlank()` |
| `d4field` | `field()` |
| `f4assignN` / `f4assignDouble` | `assign()` / `assignDouble()` |
| `f4assignInt` | `assignInt()` |
| `f4str` / `f4double` / `f4int` | `str()` / `double()` / `int()` |
| `f4memoAssignN` / `f4memoStr` / `f4memoLen` | `memoAssign()` / `memoStr()` / `memoLen()` |
| `d4goLow` / `d4go` | `go()` / `goLow()` |
| `d4top` / `d4bottom` | `top()` / `bottom()` |
| `d4skip` | `skip()` |
| `d4tag` + `d4tagSelect` | `select()` |
| `d4seek` / `d4seekNext` | `seek()` / `seekNext()` |
| `d4recNoLow` / `d4recNo` | `recNo()` |
| `d4eof` / `d4bof` | `eof()` / `bof()` |
| `d4recCountDo2` / `d4numFields` | `recCount()` / `numFields()` |
| `d4flush` | `flush()` |
| `d4delete` / `d4deleted` | `delete()` / `deleted()` |
| `d4pack` / `d4reindex` | `pack()` / `reindex()` |
| `d4fieldJ` | `fieldAt()` |
| `d4fieldInfo` | `fields()` (freed via `u4freeDefault`) |
| `f4name` / `f4number` / `f4type` / `f4len` / `f4decimals` / `f4nullable` | `name()` / `number()` / `type()` / `len()` / `decimals()` / `nullable()` |
| `t4infoAdd` | used internally by `create()` for tags |

> **Integer widths.** Engine parameters/returns declared as C `long` (record numbers, counts, memo
> lengths, error codes) are bound to koffi's platform-aware `'long'`/`'ulong'`, so they are 4 bytes
> on Windows (LLP64) and 8 bytes on Linux (LP64) — matching the native engine on both.

---

## Recipes

### Create a table with several tags

```js
const data = c4.create('C:/data/ORDERS', [
   { name: 'CUST', type: r4type.str, len: 20 },
   { name: 'TOTAL', type: r4type.num, len: 10, dec: 2 },
   { name: 'DATE', type: r4type.date, len: 8 }
], [
   { name: 'CUST', expression: 'CUST' },
   { name: 'DATE', expression: 'DATE' }
]);
```

### Append records

```js
data.appendStart(0);
for (const order of orders) {
   data.appendBlank();
   data.field('CUST').assign(order.customer);
   data.field('TOTAL').assign(order.total.toFixed(2));
   data.field('DATE').assign(order.date); // 'YYYYMMDD'
}
data.close();
```

### Scan every record

```js
const data = c4.open('C:/data/ORDERS');
const count = data.recCount();
for (let rec = 1; rec <= count; rec++) {
   data.go(rec);
   console.log(rec, data.field('CUST').str().trim(), data.field('TOTAL').double());
}
data.close();
```

### Seek by tag

```js
data.select('CUST');                       // required when the table has >1 tag
if (data.seek('ACME') === r4success) {
   console.log('found', data.field('CUST').str().trim());
}
```

### Read and write memos

```js
data.field('NOTES').memoAssign('A longer note...');
const note = data.field('NOTES').memoStr();
console.log(data.field('NOTES').memoLen(), note);
```

### List the fields

`fields()` returns a descriptor for every field, including nullable / auto-increment / auto-timestamp
flags; `fieldAt()` gives a `Field4` handle by 1-based position.

```js
const data = c4.open('C:/data/ORDERS');
console.log(data.fieldNames());          // ['CUST', 'TOTAL', 'DATE']

for (const f of data.fields()) {
   console.log(f.number, f.name, f.type, f.len, f.dec, f.nullable, f.autoIncrement);
}

const total = data.fieldAt(2);           // Field4 for TOTAL
console.log(total.name(), total.type(), total.len(), total.decimals());
console.log(total.info());               // same shape as fields()[1]
data.close();
```

### Read-only access

```js
const c4 = new Code4({ compatibility: 30, errOff: 1, readOnly: 1 });
const data = c4.open('C:/data/ORDERS'); // opened read-only
```

### Trim padded field values

Fixed-width character fields are padded on the right and numeric fields are right-justified (padded
on the left). Enable `trim` on the `Code4` so `str()`/`memoStr()` return clean values, and use the
per-call override for the raw width when you need it:

```js
const c4 = new Code4({ compatibility: 30, errOff: 1, trim: true });
const data = c4.open('C:/data/ORDERS');

data.go(1);
console.log(data.field('CUST').str());        // 'ACME'   (not 'ACME      ')
console.log(data.field('TOTAL').str());       // '1234.56'
console.log(data.field('CUST').str(false));   // 'ACME      ' (raw, 10 chars)
```

### Server / web usage

Create one CODE4 per request and always release it, so handles and memory are reclaimed
deterministically. Nest `try/finally` (or use `using`) and close files before disposing.

```js
import { Code4, r4success } from '@trevster344/codebase';

export function getCustomer(id) {
   const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1, readOnly: 1 });
   try {
      const data = c4.open('C:/data/CUSTOMER');
      try {
         data.select('ID');
         if (data.seek(id) !== r4success) return null;
         return {
            id: data.field('ID').str().trim(),
            name: data.field('NAME').str().trim()
         };
      } finally {
         data.close();
      }
   } finally {
      c4.dispose();
   }
}
```

With TypeScript 5.2+ and `using`:

```ts
import { Code4, r4success } from '@trevster344/codebase';

function getCustomer(id: string) {
   using c4 = new Code4({ compatibility: 30, errOff: 1, readOnly: 1 });
   const data = c4.open('C:/data/CUSTOMER');
   try {
      data.select('ID');
      if (data.seek(id) !== r4success) return null;
      return { id: data.field('ID').str().trim() };
   } finally {
      data.close();
   }
}
```

> Do not share one open `Data4` across concurrent async operations — its record pointer is mutable.
> Either open per operation or serialize access.

### TypeScript

```ts
import { Code4, r4type } from '@trevster344/codebase';
import type { FieldDef, TagDef, Code4Options } from '@trevster344/codebase';

const options: Code4Options = { compatibility: 30, errOff: 1 };
const fields: FieldDef[] = [{ name: 'NAME', type: r4type.str, len: 30 }];
const tags: TagDef[] = [{ name: 'NAME', expression: 'NAME' }];

const c4 = new Code4(options);
const data = c4.create('C:/temp/PEOPLE', fields, tags);
data.close();
c4.dispose();
```

### CommonJS

The package ships a dedicated CommonJS build (`dist/index.cjs`), so `require()` works on every
supported Node (≥ 20) — it does not depend on Node ≥ 22.12 `require(esm)`:

```js
const { Code4, r4type } = require('@trevster344/codebase');
```

`import` and `require()` expose the same named exports; a default export carrying the same members
is provided for both (`const cb = require('@trevster344/codebase'); cb.default.Code4 === cb.Code4`).

---

## Library resolution

At import time the engine is located in this order:

1. `CODE4_DLL` — absolute path to the native library.
2. `CODE4_DLL_DIR` — directory containing the engine (`c4dll.dll` / `c4dll64.dll` / `libc4dll.so`).
3. The engine bundled with the package: `native/<platform>-<arch>/` (e.g. `win32-x64`, `linux-arm64`).
4. The repo build output when running from the source tree (Windows `build/…`, Linux `linux/build*`).
5. The current working directory, then this module's directory.
6. Otherwise the bare file name, letting the OS loader search `PATH`.

The resolved path is exported as `libraryPath`:

```js
import { libraryPath } from '@trevster344/codebase';
console.log(libraryPath);
```

### Platform and bitness

`process.platform` + `process.arch` select the engine:

| Platform | Engine |
|---|---|
| `win32` + `x64` | `c4dll64.dll` |
| `win32` + `ia32` | `c4dll.dll` |
| `linux` + `x64` / `arm64` | `libc4dll.so` |

A process can only load a library of its **own** bitness, so `CODE4_DLL` / `CODE4_DLL_DIR` override
the *path*, not the architecture. Files are interchangeable across platforms — a DBF/CDX written on
Windows reads on Linux and vice versa (and arm64 ↔ x64).

---

## Lifecycle and memory

- Every `new Code4()` must be matched by `dispose()`. The engine tracks live instances; leaking them
  exhausts handles and memory over time (this was the bug this binding's lifecycle work addressed).
- `dispose()` is idempotent — safe to call twice.
- Use `numCodeBaseInstances()` to verify no leaks:

```js
import { Code4, numCodeBaseInstances } from '@trevster344/codebase';

console.log(numCodeBaseInstances()); // 0

const c4 = new Code4({ errOff: 1 });
console.log(numCodeBaseInstances()); // 1
c4.dispose();
console.log(numCodeBaseInstances()); // 0
```

---

## Troubleshooting

**`Error: Failed to load shared library: The specified module could not be found.`**
The engine was not found or is the wrong bitness. Check `libraryPath`/`dllName`, and make sure the
Node process matches the engine (`win32-x64` → `c4dll64.dll`, `linux-arm64` → `libc4dll.so`, …).
Point `CODE4_DLL` at the exact file if needed.

**`Unsupported platform/architecture '...'`**
Node is running on a platform/arch the package does not ship an engine for. Supported:
`win32-x64`, `win32-ia32`, `linux-x64`, `linux-arm64`.

**`Cannot use import statement outside a module`**
You are loading the ESM entry (`dist/index.js`) from a CommonJS context. Use
`require('@trevster344/codebase')` (which resolves to `dist/index.cjs`) or `import` it from ESM.

**npm blocks koffi's install script**
Approve it once: `npm install-scripts approve koffi`. koffi needs to place its prebuilt binding.

**32-bit testing**
Install a 32-bit Node and run it; the package will load `native/win32-ia32/c4dll.dll` automatically.

**Field values look padded**
Character/numeric fields are fixed-width, so `.str()` returns the full field width. Pass
`trim: true` to `new Code4(...)` to strip padding spaces automatically, or call `.str().trim()`
yourself. `str(false)` always returns the raw value.

---

## Development

```bash
npm install
npm run build         # tsc -> dist/index.js + index.d.ts (ESM/types); esbuild -> dist/index.cjs (CJS)
npm run bundle-native # stage the built engines into native/<platform>-<arch>/
npm pack --dry-run    # inspect the published tarball
```

The TypeScript source is `index.ts`. Only `dist/` and `native/` are published (`files` in
`package.json`). The native engines are built separately: Windows DLLs via the VS projects, Linux
`libc4dll.so` via `linux/` (see `linux/README.md`). Tests live in `tests/Node` (a Vitest suite
mirroring `test/CSharp/t4all.cs` plus a standalone console test).

## Publishing

`prepack` builds and bundles, so publishing always ships a fresh `dist/` and both engines:

```ini
# .npmrc (this folder or the repo root); token needs write:packages
@trevster344:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm publish
```

## License

LGPL-3.0-or-later (see `LICENSE`). The CodeBase engine is © Sequiter Inc.; see the repository
`LICENSE.txt`.

## Related

- C# interface: `interfaces/CSharp/Codebase.cs`
- VB.NET interfaces: `interfaces/VB.NET/CodeBase.vb`, `CodeBase64.vb`
- Reference smoke test: `test/CSharp/t4all.cs`
