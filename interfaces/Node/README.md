# @trevster344/codebase

Node.js (ESM) FFI bindings for the **CodeBase** native engine (`c4dll.dll` / `c4dll64.dll`), with
TypeScript types. It calls the exported C API in-process through [koffi](https://koffi.dev) — no
server, no ODBC, no extra process.

The package bundles **both** engines (`native/x64/c4dll64.dll` and `native/x86/c4dll.dll`) and
picks the one matching `process.arch` at runtime.

- Create, open, read and write DBF/CDX tables.
- Full CODE4 lifecycle (`code4initVB` / `code4initUndo`) exposed as `Code4` + `dispose()`.
- Typed: ships `dist/index.d.ts`.
- ESM, Node ≥ 20, Windows.

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
- [Bitness](#bitness)
- [Lifecycle and memory](#lifecycle-and-memory)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Publishing](#publishing)
- [License](#license)

---

## Requirements

| | |
|---|---|
| OS | Windows (the engines are Windows DLLs) |
| Node.js | **≥ 20** (ESM). `import` works from Node 16; CommonJS `require()` needs Node ≥ 22.12 |
| Bitness | the Node process must match the engine — 64-bit Node ↔ `c4dll64.dll`, 32-bit Node ↔ `c4dll.dll` |

The native engines are self-contained (only Windows system DLLs); there is nothing else to install.

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
npm run bundle-native # copies the built engines into native/{x64,x86}
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
}
```

```js
const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1, readOnly: 1 });
```

| Member | Type | Description |
|---|---|---|
| `handle` | `bigint` | Opaque native `CODE4*` (rarely needed directly). |
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
| `go(recNo)` | `number` | Move to a 1-based record number. |
| `select(tagName)` | `void` | Select the active tag (`d4tag` + `d4tagSelect`); throws if missing. |
| `seek(key)` | `number` | Seek on the selected tag; returns `r4success` (0) on a hit. |
| `recCount()` | `number` | Number of records. |
| `numFields()` | `number` | Number of fields. |
| `close()` | `number` | Close the file; idempotent. |

### `Field4`

| Member | Type | Description |
|---|---|---|
| `assign(value)` | `void` | Assign a string/number (`f4assignN`). |
| `assignDouble(value)` | `void` | Assign a double (`f4assignDouble`). |
| `assignInt(value)` | `void` | Assign an integer (`f4assignInt`) — use for `I` fields. |
| `str()` | `string` | Read as string (`f4str`). |
| `double()` | `number` | Read as double (`f4double`). |
| `int()` | `number` | Read as integer (`f4int`). |
| `memoAssign(value)` | `void` | Assign a memo (`f4memoAssignN`). |
| `memoStr()` | `string` | Read a memo (`f4memoStr`). |
| `memoLen()` | `number` | Memo length (`f4memoLen`). |

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
| `d4goLow` | `go()` |
| `d4tag` + `d4tagSelect` | `select()` |
| `d4seek` | `seek()` |
| `d4recCountDo2` / `d4numFields` | `recCount()` / `numFields()` |
| `t4infoAdd` | used internally by `create()` for tags |

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

### Read-only access

```js
const c4 = new Code4({ compatibility: 30, errOff: 1, readOnly: 1 });
const data = c4.open('C:/data/ORDERS'); // opened read-only
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

The package is ESM-only. Under Node ≥ 22.12 `require()` of ESM works:

```js
const { Code4, r4type } = require('@trevster344/codebase');
```

Older Node should use `import` (or dynamic `await import('@trevster344/codebase')`).

---

## Library resolution

At import time the engine is located in this order:

1. `CODE4_DLL` — absolute path to the DLL.
2. `CODE4_DLL_DIR` — directory containing `c4dll.dll` / `c4dll64.dll`.
3. The engine bundled with the package: `native/<x64|x86>/`.
4. The repo build output (`build/MVStudio_2022_Project_VFP_STAND_ALONE_64|32`) when running from the
   source tree.
5. The current working directory, then this module's directory.
6. Otherwise the bare file name, letting the OS loader search `PATH`.

The resolved path is exported as `libraryPath`:

```js
import { libraryPath } from '@trevster344/codebase';
console.log(libraryPath);
```

### Bitness

A Windows process can only load a DLL of its **own** bitness. `process.arch` therefore selects the
file: `x64` → `c4dll64.dll`, `ia32` → `c4dll.dll`. `CODE4_DLL` / `CODE4_DLL_DIR` override the
*path*, not the architecture — a 64-bit Node cannot load the 32-bit engine, and vice versa. To use
`c4dll.dll` you must run 32-bit Node.

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
The engine DLL was not found or is the wrong bitness. Check `libraryPath`/`dllName`, and make sure a
64-bit Node loads `c4dll64.dll` and a 32-bit Node loads `c4dll.dll`. Point `CODE4_DLL` at the exact
file if needed.

**`Unsupported Node architecture '...' (need x64 or ia32)`**
Node is running on an unsupported architecture (e.g. ARM64). Use an x64 or ia32 Node.

**`Cannot use import statement outside a module` / `require of ES Module`**
The package is ESM. Use `import`, or Node ≥ 22.12 for `require()`.

**npm blocks koffi's install script**
Approve it once: `npm install-scripts approve koffi`. koffi needs to place its prebuilt binding.

**32-bit testing**
Install a 32-bit Node and run it; the package will load `native/x86/c4dll.dll` automatically.

**Field values look padded**
Character/numeric fields are fixed-width; `.str()` returns the padded value — call `.trim()`.

---

## Development

```bash
npm install
npm run build         # tsc -> dist/ (index.js + index.d.ts)
npm run bundle-native # copy the built engines into native/{x64,x86}
npm pack --dry-run    # inspect the published tarball
```

The TypeScript source is `index.ts`. Only `dist/` and `native/` are published (`files` in
`package.json`). Tests live in `tests/Node` (a Vitest suite mirroring `test/CSharp/t4all.cs` plus a
standalone console test).

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
