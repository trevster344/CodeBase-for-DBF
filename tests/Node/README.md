# CodeBase Node.js / TypeScript test

Runnable test for the CodeBase native engine through the `interfaces/Node` koffi FFI bindings.

It reports the Node version and bitness, runs a 5000-iteration `code4init`/`code4initUndo` lifecycle
loop (asserting `code4numCodeBaseCount()` returns to 0 each cycle), and a full CRUD round-trip:

- create a table with `STR` (char), `NUM` (numeric), `DBL` (double), `LOG` (logical), and
  `MEMO` (memo) fields plus one `STR` tag,
- append 5 records, close, reopen,
- verify `recCount`, each field value, and `d4seek` by tag.

Exit code `0` = PASS.

## Requirements

- Node.js >= 22.6 (uses built-in TypeScript type stripping to run `test.ts` directly).
- A Node whose bitness matches the DLL under test: 64-bit Node for `c4dll64.dll`, 32-bit Node for
  `c4dll.dll`. A 64-bit process cannot load the 32-bit DLL.

## Run

```bash
# one-time
npm install --prefix interfaces/Node
npm install --prefix tests/Node

# type-check test.ts against interfaces/Node/index.d.ts
npm --prefix tests/Node run typecheck

# run (x64 by default)
npm --prefix tests/Node test
```

Or use the PowerShell wrapper, which builds the native DLLs, installs deps, type-checks, and runs
both bitnesses (x86 is reported SKIP when no 32-bit Node is installed):

```powershell
powershell -ExecutionPolicy Bypass -File tests\Node\run-tests.ps1
powershell -ExecutionPolicy Bypass -File tests\Node\run-tests.ps1 -BuildNative
```

## Configuration

- `CODE4_DLL` — absolute path to the native DLL (set by the wrapper).
- `EXPECT_ARCH` — `x64` (default) or `x86`; the bitness the run is expected to use.
