---
name: cpp
description: Use when editing the CodeBase C/C++ engine source (WorkingSource/*.c, *.h, *.C) — platform macros (S4WIN32/S4UNIX/S4FOX), adding Linux support without breaking Windows, struct packing, the POSIX threading shim, FILE4LONG/off_t, and string safety. Trigger on "WorkingSource", "S4UNIX", "C4CODE.C", "d4data.h", "codebase engine", "port to linux".
---

# CodeBase C/C++ engine

The engine is ~30-year-old, MSVC-centric C compiled as **C++** from `WorkingSource/`. The **same
source** builds the Windows DLLs and the Linux `libc4dll.so`; platform differences are handled with
`#ifdef` macros. `source/` mirrors some files — keep them in sync when both exist.

## Platform macros

| Macro | Meaning |
|---|---|
| `S4WIN32` | Windows (set in `WorkingSource/d4all.h`) |
| `S4UNIX` | Linux/POSIX (set in `linux/config/d4all.h`) |
| `S4FOX` | Visual FoxPro / CDX compatibility |
| `S4STAND_ALONE` | stand-alone engine (no client/server) |
| `S4WRITE_DELAY` / `S4READ_ADVANCE` | delay-write / advance-read worker threads |
| `S4SEMAPHORE` | thread semaphores |
| `S4DLL_BUILD` | building the library (requires C++ compilation) |
| `S4WINDOWS_VS5_PLUS` | MSVC ≥ 1400 (maps `c4str*` to the `*_s` CRT functions) |

## Rules

- **Never break Windows.** Put Linux changes under `#ifdef S4UNIX` (or extend a guard to
  `#if defined(S4WIN32) || defined(S4UNIX)`). After engine changes, rebuild the Windows x64 DLL and
  run `tests/Node` to confirm no regression.
- **Mirror to `source/`** when the same file exists there (e.g. `WorkingSource/C4CODE.C` +
  `source/C4CODE.C`, `WorkingSource/u4util.c` + `source/u4util.c`).
- **Struct packing**: `push4.h`/`pop4.h` wrap all headers with `#pragma pack(push,1)`. On Linux it is
  applied for x64 but **skipped on `__aarch64__`** (arm64 faults on unaligned access). Do not add
  `#pragma pack` elsewhere; on-disk structs use explicit byte offsets.
- **String safety**: use `c4strcpy`/`c4strcat`/`c4strncat`/`c4strncpy` (bounds-checked on both
  platforms via `linux/posix4str.c` on Linux and the `*_s` CRT on Windows) — never raw
  `strcpy`/`strcat`. `sprintf_s` is MSVC-only: guard with `#ifdef S4WINDOWS_VS5_PLUS` and provide a
  `sprintf` fallback (see `d4go.c`).
- **Threading**: Windows code uses `CreateEvent`/`_beginthread`/critical sections. On Linux these are
  provided by `linux/posix4win.c` (POSIX shim). `CRITICAL4SECTION` is pthread-based and **recursive in
  software** (`f4file.c`) — Windows `CRITICAL_SECTION` is recursive, a plain pthread mutex is not, so
  do not "simplify" it to a plain mutex.
- **File offsets**: `FILE4LONG` is a struct on Windows and `off_t` on 64-bit Linux; use the
  `file4long*` macros, and `S4FILE4LONG_STRUCT` when you must touch `.dLong`.
- **Encryption is disabled on Linux** (`S4ENCRYPT_HOOK` is not auto-defined for `S4UNIX`).
- `assert5port(val)` is a no-op on all platforms.

## Where things are

- Config: `WorkingSource/d4all.h` (Windows) and `linux/config/d4all.h` (Linux, force-included so it
  shadows the Windows header via the `D4ALL_INC` guard).
- Platform shims: `linux/posix4win.c` (threads/events/sync), `linux/posix4str.c` (safe strings),
  `linux/config/p4port.h` (Unix portability header, missing from `WorkingSource`).
- Build trees: `build/MVStudio_2022_*` (Windows VS), `linux/` (CMake).
- Porting notes and history: `linux/GAP_REPORT.md`.

## Inspect a build's symbols

```bash
nm -D --defined-only linux/build/libc4dll.so | grep code4initVB   # Linux
dumpbin //exports build/MVStudio_2022_Project_VFP_STAND_ALONE_64/C4dll64.dll   # Windows
```
