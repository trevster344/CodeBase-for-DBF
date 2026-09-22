---
name: windows
description: Use when building or testing the CodeBase Windows DLLs (c4dll.dll / c4dll64.dll) — Visual Studio 2022 MSBuild, the SetVFP_CLIENT_*.BAT config scripts, the HDR_VFP_* headers, and the Windows Node / C# / VB test suites. Trigger on "windows build", "msbuild", "c4dll64.dll", "SetVFP_CLIENT", "win32", "vcxproj".
---

# CodeBase Windows DLLs

The Windows stand-alone engine (`c4dll.dll` 32-bit, `c4dll64.dll` 64-bit) is built from the shared
`WorkingSource/` tree with Visual Studio 2022. `source/` mirrors some files — keep them in sync.

## Build

Two steps: pick the config header with a `.BAT`, then MSBuild the matching project.

```bash
cd WorkingSource && cmd //c SetVFP_CLIENT_SA64.BAT && cd ..
"/c/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Current/Bin/MSBuild.exe" \
  build/MVStudio_2022_Project_VFP_STAND_ALONE_64/C4dll.vcxproj \
  -p:Configuration=Release -p:Platform=x64 -m -v:minimal -nologo
git checkout -- WorkingSource/d4all.h     # the .BAT overwrites this tracked file
```

- 64-bit: `SetVFP_CLIENT_SA64.BAT` + `..._64` project, `-p:Platform=x64` → `C4DLL64.dll`.
- 32-bit: `SetVFP_CLIENT_SA32.BAT` + `..._32` project, `-p:Platform=Win32` → `C4dll.dll`.
- The `.BAT` files copy `WorkingSource/HDR_VFP_STAND_ALONE_{32,64}/d4all.h` over
  `WorkingSource/d4all.h`; **always restore it afterwards** (`git checkout -- WorkingSource/d4all.h`).
- Client/server builds use `HDR_VFP_SERVER_CLIENT_*` + `MVStudio_2022_Project_VFP_SERVER_CLIENT_*`.

## Test

```bash
powershell -ExecutionPolicy Bypass -File tests/run-tests.ps1          # C#/VB matrix (net8.0/net48, x86/x64)
powershell -ExecutionPolicy Bypass -File tests/Node/run-tests.ps1     # Node (typecheck + Vitest + console)
npm --prefix tests/Node test
npm --prefix tests/Node run test:unit
```

## Do / Don't

**Do**

- Run the `SetVFP_CLIENT_*.BAT` that matches the project **before** MSBuild (it selects the config).
- `git checkout -- WorkingSource/d4all.h` after every build — the `.BAT` overwrites it.
- Rebuild the Windows DLL and run `tests/Node` after any engine change, to catch regressions.
- Match `-p:Platform` to the project: `x64` for `..._64` (`C4DLL64.dll`), `Win32` for `..._32` (`C4dll.dll`).

**Don't**

- Don't commit the `d4all.h` change left by a build (restore it first).
- Don't commit build output (`build/IntermediateFiles/`, `*.obj`, `*.tlog`, the `.dll`s).
- Don't build `..._64` with `-p:Platform=Win32` (or `..._32` with `x64`).
- Don't compile the DLL as C — the config `#error`s (it must be C++).
- Don't forget Linux: new engine code must be guarded so the `S4WIN32` path is unchanged.

## Notes

- `d4all.h` defines `S4WIN32`; the DLL build must be compiled as **C++**.
- `LNK4017: DESCRIPTION statement not supported` warnings from the `.def` are harmless.
- `S4WIN64` is **not** defined for the x64 build, so `push4.h`/`pop4.h` apply `#pragma pack(1)`
  (Linux x64 matches; arm64 skips it — see the `cpp` skill).
- Engine changes must keep Linux working: guard them with `S4WIN32`/`S4UNIX` and rebuild both.
