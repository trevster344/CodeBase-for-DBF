# CodeBase test projects

Runnable C#, VB.NET, and Node.js/TypeScript tests that verify the CodeBase native engine works
when the test process runs at the correct bitness:

| Project | x86 uses | x64 uses |
|---|---|---|
| `CSharp/CodeBase.Tests` | `c4dll.dll` (via `interfaces/CSharp/Codebase.cs`) | `c4dll64.dll` |
| `VB.NET/CodeBase.Tests` | `interfaces/VB.NET/CodeBase.vb` (Integer handles) | `interfaces/VB.NET/CodeBase64.vb` (IntPtr handles) |
| `Node` | `c4dll.dll` (via `interfaces/Node`, 32-bit Node) | `c4dll64.dll` (64-bit Node) |

Each test reports the process bitness and the loaded native module, runs a 5000-iteration
`code4init`/`code4initUndo` lifecycle loop (asserting the live-CODE4 count returns to 0), and a
full CRUD round-trip (create a table + tag, append records, reopen, read/verify, seek by tag).
The Node suite additionally covers `DBL` (double), `LOG` (logical), and `MEMO` fields.
Exit code `0` = PASS.

## 1. Build the native engine DLLs

The tests copy the engine from the build output directories:
- 32-bit: `build/MVStudio_2022_Project_VFP_STAND_ALONE_32/C4dll.dll`
- 64-bit: `build/MVStudio_2022_Project_VFP_STAND_ALONE_64/C4DLL64.dll`

Build them first (see `../WorkingSource/ReadMe.md`), or let the runner do it with `-BuildNative`.
Override the source directories with `-p:CodeBaseNative32=<dir>` / `-p:CodeBaseNative64=<dir>`
(for example to point at the client/server or `MPSSProductionVersions` DLLs).

## 2. Run everything

```powershell
# assumes the native DLLs are already built
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1

# build the native DLLs first (runs the config .BAT + MSBuild, restores WorkingSource/d4all.h)
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -BuildNative

# subset
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -Frameworks net8.0 -Platforms x64
```

It prints a PASS/FAIL matrix across `{C#, VB.NET} x {net8.0, net48} x {x86, x64}`.

## 3. Run a single project/bitness

```bash
dotnet run --project tests/CSharp/CodeBase.Tests -c Release -f net8.0 -p:Platform=x86
dotnet run --project tests/CSharp/CodeBase.Tests -c Release -f net8.0 -p:Platform=x64
dotnet run --project tests/VB.NET/CodeBase.Tests -c Release -f net48  -p:Platform=x64
```

Both `net8.0` and `net48` are targeted; the x86 and x64 .NET runtimes must be installed to run
the corresponding builds. (The VB x64 build deploys `C4DLL64.dll` renamed to `c4dll.dll`, because
its `Declare` statements reference that name.)

## 4. Node.js / TypeScript

The Node suite drives the engine through koffi FFI bindings (`interfaces/Node`), which load the
native DLL at runtime. A process can only load a native DLL of its own bitness, so the x64 test
needs a 64-bit Node and the x86 test needs a 32-bit Node (the runner reports SKIP if it is missing).

```bash
# one-time: install the interface dependency and the test toolchain
npm install --prefix interfaces/Node
npm install --prefix tests/Node

# type-check the TypeScript test against the interface's index.d.ts
npm --prefix tests/Node run typecheck

# run (Node >= 22.6 uses built-in type stripping)
npm --prefix tests/Node test
```

`tests/Node/run-tests.ps1` wraps the above, builds `interfaces/Node`, runs the Vitest suite, and
reports SKIP for x86 when no 32-bit Node is installed.

`tests/Node/t4all.test.ts` is a Vitest suite that mirrors `test/CSharp/t4all.cs` (CODE4 lifecycle
plus a full CRUD round-trip over STR/NUM/LOG/DBL/MEM with STR/NUM tags and a tag seek);
`tests/Node/test.ts` is the standalone console test. The published `interfaces/Node` package bundles
both native engines under `native/{x64,x86}/` and selects one by `process.arch` (override with
`CODE4_DLL` / `CODE4_DLL_DIR`).

## Notes

- Errors are silenced (`errOff` / `code4errOff(c4, 1)`) so failures surface as error codes rather
  than dialogs.
- `code4numCodeBaseCount()` is a diagnostic export added with the lifecycle fix; if an older
  engine without it is used, the tests skip the count assertions but still run the loops.
