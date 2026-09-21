# @trevster344/codebase

ESM FFI bindings (with TypeScript types) for the CodeBase native engine (`c4dll.dll` /
`c4dll64.dll`). Written in TypeScript; the published package ships the compiled `dist/`.

It uses [koffi](https://koffi.dev) to call the exported C API. The library is loaded at runtime, so
the same module targets the 32-bit `c4dll.dll` under 32-bit Node or the 64-bit `c4dll64.dll` under
64-bit Node. A process can only load a native DLL of its own bitness, so `process.arch` selects the
file name.

## Install (GitHub Packages)

Add an `.npmrc` with a token that can read the package, then install:

```ini
@trevster344:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm install @trevster344/codebase
```

## Usage

```js
import { Code4, r4type } from '@trevster344/codebase';

const c4 = new Code4({ compatibility: 30, safety: 0, errOff: 1 });
try {
   const data = c4.create('C:/temp/PEOPLE', [
      { name: 'NAME', type: r4type.str, len: 30 },
      { name: 'AGE', type: r4type.num, len: 3 }
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

TypeScript consumers get the generated `dist/index.d.ts`:

```ts
import { Code4, r4type, type FieldDef } from '@trevster344/codebase';
```

`dispose()` is idempotent and also implements `Symbol.dispose`, so TypeScript 5.2+ supports
`using c4 = new Code4();`.

> ESM only. `import` works on Node 16+; CommonJS `require()` needs Node ≥ 22.12 (where `require(esm)`
> is enabled by default).

## API

| Export | Description |
|---|---|
| `Code4` | `new Code4(options?)`; `open(name)`, `create(name, fields, tags?)`, `errorCode`, `errorText(code?)`, `dispose()` |
| `Data4` | `appendStart(memo?)`, `appendBlank()`, `field(name)`, `go(recNo)`, `select(tagName)`, `seek(key)`, `recCount()`, `numFields()`, `isValid()`, `close()` |
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

## Development

```bash
npm install
npm run build     # tsc -> dist/index.js + dist/index.d.ts
```

The TypeScript source is `index.ts`; only `dist/` is published (see `files` in `package.json`).

## Publishing

`prepare` runs the build, so packing/publishing always ships a fresh `dist/`:

```ini
# .npmrc (this folder or the repo root); token needs write:packages
@trevster344:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm publish
```

## Notes

- Strings are passed as ANSI (`char *`); field data is copied through `f4assignN` / `f4memoAssignN`.
- Memo fields use the dedicated `f4memoAssignN` / `f4memoStr` entry points.
- Errors are returned as codes; set `errOff: 1` to suppress dialogs (recommended for servers).
- Licensed LGPL-3.0-or-later (see `LICENSE`). The CodeBase engine is © Sequiter Inc. (see the
  repository `LICENSE.txt`).
