# CodeBase Node.js interface

Node.js FFI bindings for the CodeBase native engine (`c4dll.dll` / `c4dll64.dll`), with TypeScript
typings (`index.d.ts`).

It uses [koffi](https://koffi.dev) to call the exported C API. The library is loaded at runtime, so
the same module targets the 32-bit `c4dll.dll` under 32-bit Node or the 64-bit `c4dll64.dll` under
64-bit Node. A process can only load a native DLL of its own bitness, so `process.arch` selects the
file name.

## Install

```bash
npm install            # installs koffi
```

The wrapper itself has a single dependency (`koffi`); TypeScript consumers get the bundled
`index.d.ts` automatically.

## Usage

JavaScript (CommonJS):

```js
const cb = require('./interfaces/Node');

const c4 = new cb.Code4({ compatibility: 30, safety: 0, errOff: 1 });
try {
   const data = c4.create('C:/temp/PEOPLE', [
      { name: 'NAME', type: cb.r4type.str, len: 30 },
      { name: 'AGE', type: cb.r4type.num, len: 3 }
   ], [{ name: 'NAME', expression: 'NAME' }]);

   data.appendStart(0);
   data.appendBlank();
   data.field('NAME').assign('Alice');
   data.field('AGE').assign('42');
   data.close();
} finally {
   c4.dispose();
}
```

TypeScript:

```ts
import type * as Codebase from './interfaces/Node';
const cb: typeof Codebase = require('./interfaces/Node');

const c4 = new cb.Code4({ errOff: 1 }); // cb.Code4 is typed
// ...
c4.dispose();
```

`dispose()` is idempotent and also implements `Symbol.dispose`, so TypeScript 5.2+ supports
`using c4 = new cb.Code4();`.

## API

| Export | Description |
|---|---|
| `Code4` | `new Code4(options?)`; `open(name)`, `create(name, fields, tags?)`, `errorCode`, `errorText(code?)`, `dispose()` |
| `Data4` | `appendStart(memo?)`, `appendBlank()`, `field(name)`, `go(recNo)`, `seek(key)`, `recCount()`, `numFields()`, `isValid()`, `close()` |
| `Field4` | `assign(v)`, `assignDouble(v)`, `str()`, `double()`, `int()`, `memoAssign(v)`, `memoStr()`, `memoLen()` |
| `numCodeBaseInstances()` | live CODE4 count (`code4numCodeBaseCount`), or `null` if the export is missing |
| `r4success`, `r4type` | error code and field type codes |
| `libraryPath`, `dllName` | resolved native library |

`Code4Options`: `compatibility`, `safety`, `errOff`, `readOnly`.
`FieldDef`: `{ name, type, len?, dec?, nulls? }`. `TagDef`: `{ name, expression?, filter?, unique?, descending? }`.

## Library resolution

The native DLL is located in this order:

1. `CODE4_DLL` — absolute path to the DLL.
2. `CODE4_DLL_DIR` — directory containing `c4dll.dll` / `c4dll64.dll`.
3. The repo build output: `build/MVStudio_2022_Project_VFP_STAND_ALONE_64` (x64) or `..._32` (x86).
4. The current working directory, then this module's directory.
5. Otherwise the bare file name, letting the OS loader search `PATH`.

## Notes

- Strings are passed as ANSI (`char *`); field data is copied through `f4assignN` / `f4memoAssignN`.
- Memo fields use the dedicated `f4memoAssignN` / `f4memoStr` entry points.
- Errors are returned as codes; set `errOff: 1` to suppress dialogs (recommended for servers).
