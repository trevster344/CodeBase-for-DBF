# Linux build gap report (L1 spike)

Status: **spike / uncommitted**. Goal: enumerate what blocks a Linux build of the CodeBase
stand-alone engine (`libc4dll.so`), not to fix everything.

---

## L1b update — compile, link and run achieved

After applying the L1b fixes below, the stand-alone engine **compiles, links and runs on Linux x64**:

| | Before (spike) | After L1b |
|---|---|---|
| Sources compiling clean | 112 / 133 | **133 / 133** |
| Compile errors | 85 | **0** |
| Link | n/a | **`libc4dll.so` (~900 KB)** |
| Runtime | n/a | **lifecycle + CRUD OK** (via koffi, Linux x64) |
| Windows x64 build | OK | **OK (no regression)** |
| Windows x86 build | OK | **OK (no regression)** |
| Windows Node tests | 10/10 | **10/10 (no regression)** |

Runtime smoke test (koffi in `node:22-bookworm`): `code4initVB` → live count 1 → `d4create` /
`d4appendBlank` / `f4assignN("HELLO")` → `d4close` → `d4open` → `recCount 1` → `d4goLow` + `f4str`
→ `"HELLO"` → `code4initUndo` → live count 0.

### Files changed for L1b (all `WorkingSource`, all `S4UNIX`-guarded so Windows is unaffected)

| File | Change |
|---|---|
| `d4declar.h` | `assert5port` no-op on all platforms; `critical4section*` declarations extended to `S4UNIX` |
| `d4data.h` | `file4longMod` added + `file4longEqualZero` arity fixed (S464BIT branch); `S4FILE4LONG_STRUCT` macro; POSIX `CRITICAL4SECTION` typedef; `critical4file` field extended to `S4UNIX` |
| `d4defs.h` | encryption hook not auto-enabled on `S4UNIX`; `sort4assignCmp` `MakeProcInstance` path guarded to `S4WIN32` |
| `o4opt.c`, `D4CREATE.C` | `.dLong` call sites now keyed off `S4FILE4LONG_STRUCT` |
| `c4trans.c`, `m4memory.c` | `sprintf_s` guarded by `S4WINDOWS_VS5_PLUS` with `sprintf` fallback |
| `f4file.c` | POSIX `critical4section*` (pthread) implementations |
| `r4relate.h` | `QUERY_CALLBACK`/`QUERY_SET_CALLBACK` and `RELATE4.callback`/`suspend` extended to `S4UNIX` |
| `C4code.c` | `code4additionalFunctionOdbc` returns `e4notSupported` on `S4UNIX`; 16-bit `HANDLE` typedef block excluded |
| `f4lock.c` | `numAttempts` declared for the `S4UNIX` lock path |
| `i4create.c` | `i4createLow` de-`static`ed to match its extern declaration |
| `c4baspas.c` | `code4hInst` takes a numeric value on non-Windows |

Config shims in `linux/config/d4all.h`: Linux config, DOS/Windows keyword macros
(`far`/`near`/`pascal`/`_cdecl`/`_export`/`__stdcall`/`CALLBACK`), `HINSTANCE`/`HWND` typedefs.

### Still outstanding (not required to build/run)

- **Struct packing**: `push4.h`/`pop4.h` apply `#pragma pack(1)` only for MSVC/Borland. No compile
  error and the smoke test passed, but ABI/on-disk layout parity with Windows is unverified.
- **Threading**: the delay-write/advance-read/reindex/pack worker threads (`_beginthread`) and the
  event/mutex/semaphore layer are `#ifdef S4WIN32`-excluded on Linux — the code compiles but those
  worker threads do not exist on Linux yet. This is the main L2 item.
- **File I/O / locking**: the `off_t` file layer compiled and basic I/O works, but locking over
  shared-storage locking and large-file paths need L3 validation.
- **String safety (README warning)**: `c4strcpy`/`c4strcat` still drop the size argument on Linux
  (L4).
- **Encryption**: disabled on Linux.

---

## L2 update — POSIX threading enabled

Threading (delay-write / advance-read worker threads, semaphores, mutexes) is now **enabled on
Linux** and verified at runtime.

| | L1b | After L2 |
|---|---|---|
| Threading on Linux | disabled (single-threaded) | **enabled** |
| Linux runtime | lifecycle + CRUD OK | **lifecycle + 200-record CRUD + 500-cycle stress OK** |
| Windows x64/x86 build | OK | **OK (no regression)** |
| Windows Node tests | 10/10 | **10/10 (no regression)** |

### What was added

- **`linux/posix4win.c` + `linux/config/posix4win.h`** — POSIX implementations of the Win32
  threading API used by the engine: `CreateEvent`/`SetEvent`/`ResetEvent`/`WaitForSingleObject`/
  `WaitForMultipleObjects`/`CloseHandle`, `CreateMutex`/`ReleaseMutex`, `CreateSemaphore`/
  `ReleaseSemaphore`, `_beginthread`/`_endthread` (pthread), `Sleep`, `GetCurrentThreadId`,
  `InterlockedIncrement`/`Decrement`.
- **`d4defs.h`** — enable `S4SEMAPHORE`, `S4WRITE_DELAY`, `S4READ_ADVANCE` for `S4UNIX`; make
  `HANDLE` pointer-sized (`intptr_t`) on Linux so it can hold a pthread object.
- **`d4data.h`** — extend the `CODE4`/`OPT4` delay-write/advance-read field guards to `S4UNIX`.
- **`f4file.c`** — POSIX `critical4section*` implemented with **software recursion** (Windows
  `CRITICAL_SECTION` is recursive; a plain pthread mutex is not).
- **`f4create.c`** — initialise `critical4file` in the `S4UNIX` `file4createLow`.

### Bug found and fixed

`d4create` **deadlocked**: the main thread held `critical4file` and waited (in
`file4writeDelayFlush`) for the delay-write thread, which was blocked re-entering `critical4file`.
Root cause: Windows `CRITICAL_SECTION` is **recursive**, but the POSIX port used a non-recursive
pthread mutex, and the `S4UNIX` create path never initialised the section. Fixed by implementing
recursion in software (owner-thread + count), which works even for zero-initialised sections.

### Still outstanding

- Thread-safety of the memory-manager process lock (`mem4start`) uses `getpid()`, which is the same
  for all threads — it does not serialise threads (pre-existing design; fine for single-threaded use).
- Struct packing (L1c), file-locking over shared storage (L3), string safety (L4).

---

## L1c update — struct packing + cross-platform interop verified

- **`push4.h`/`pop4.h`** now emit `#pragma pack(push,1)`/`#pragma pack(pop)` for GCC/Clang too, so the
  Linux struct layouts match the MSVC build (which uses one-byte packing — `S4WIN64` is not defined).
- **DBF + CDX interop verified both ways** with a real Visual FoxPro/CDX table:
  - Linux created `LIN.dbf`/`LIN.cdx` → **Windows** opened it, read all 5 records and sought by tag.
  - Windows created `WIN.dbf`/`WIN.cdx` → **Linux** opened it, read all 5 records and sought by tag.

| | L2 | After L1c |
|---|---|---|
| Struct packing | unpacked (mismatch risk) | **pack(1), matching Windows** |
| DBF+CDX interop | untested | **Linux→Windows and Windows→Linux OK** |
| Windows x64 build | OK | **OK (no regression)** |

## L3 update — locking + shared-storage interop

- **Full format interop verified both ways** with a table containing every field type
  (STR/NUM/DBL/LOG/DATE/MEMO), a memo `.fpt`, and **two CDX tags**:
  - Windows created it → **Linux** read all 5 records (values, double, logical, date, memo) and sought
    by both the STR and NUM tags.
  - Linux created it → **Windows** read all 5 records and sought by both tags.
- **Locking** works on Linux: the build uses POSIX `fcntl`/`lockf` byte-range locks on the DBF (the
  same byte ranges the Windows `LockFile` path uses). Cross-process test: while one process holds
  `d4lock(1)`, a second process's `d4lock(1)` correctly fails (rc `50`).

### Shared storage (Windows + Linux on the same files)
The on-disk format and the lock byte-ranges are identical across platforms; what differs is how the
**filesystem translates locks**. **NFSv4** is the supported option (validated below). Windows is
case-insensitive and Linux is case-sensitive, so reference shared files with consistent casing. This
is a **deployment/mount** concern, not a CodeBase format concern — see
[Shared storage — NFSv4](#shared-storage--nfsv4).

## L4 update — string safety (README warning)

The root README warns that the MSVC-only `strcpy_s`/`strcat_s` mapping was never applied to the
Linux build, leaving `c4strcpy`/`c4strcat`/`c4strncat`/`c4strncpy` as unbounded `strcpy`/`strcat`
(the destination-size argument was silently dropped).

- **Fixed**: for `S4UNIX` those macros now map to bounds-checked helpers in **`linux/posix4str.c`**
  (`c4strcpy_s`/`c4strcat_s`/`c4strncat_s`/`c4strncpy_s`) which honour the destination size — the
  Linux counterpart of the Windows `*_s` functions.
- **Audited** the raw `strcpy`/`strcat`/`sprintf` sites: most are `S4MACINTOSH` / `S4TESTING` /
  `I4PRINT`-excluded or already length-checked. One real 1-byte overflow fixed: `i4ntag.c` copied
  `accessName[LEN4PATH+1]` into `indexAccessName[LEN4PATH]` (now bounds-checked).
- `c4strnicmp` maps to `strncasecmp` on Linux.

| | L3 | After L4 |
|---|---|---|
| `c4str*` bounds-checked on Linux | no (raw strcpy/strcat) | **yes** |
| Linux runtime | OK | **OK** |
| Windows build/tests | OK / 10/10 | **OK / 10/10 (no regression)** |

## arm64 update — build + runtime + 3-way interop + CI

- **Cross-compile**: `linux/toolchain/linux-arm64.cmake` builds `libc4dll.so` (aarch64) with
  `g++-aarch64-linux-gnu` from x64.
- **Bug found and fixed**: `#pragma pack(1)` caused a **SIGBUS** on arm64 (`d4create` crashed) —
  arm64 faults on the unaligned accesses that byte-packing produces. Fixed by skipping packing on
  `__aarch64__` (`push4.h`/`pop4.h`). The on-disk format uses explicit byte offsets, so files stay
  compatible (verified below).
- **3-way interop verified**: arm64 ↔ x64 Linux ↔ Windows, with every field type + memo + two CDX
  tags — each platform reads the others' tables and seeks by tag.
- **CI**: `.github/workflows/linux-engine.yml` builds x64, cross-compiles arm64, runs the koffi smoke
  test (`linux/smoke-test.mjs`) on both (arm64 via QEMU), and rebuilds the Windows x64 DLL for
  regression.

| | L4 | After arm64 |
|---|---|---|
| Linux arches | x64 | **x64 + arm64** |
| arm64 runtime | n/a | **SMOKE PASS** |
| CI | none | **x64 + arm64 + Windows** |

## Shared storage — NFSv4

Validated with a real **NFSv4** server (Docker container, on a Docker network) and a Linux client
mounting the share and running the engine over it:

| Storage | Create / read / write | Locking |
|---|---|---|
| **NFSv4** | **OK** | **OK** — `d4lock` correctly blocks a second process (rc 50) |

NFSv4 is the supported shared-storage option for Windows + Linux access: the engine's POSIX
(`fcntl`/`lockf`) byte-range locks are honoured by the NFSv4 server, so create, read/write and
cross-process record locking all work over the mount.

> **Samba/CIFS is not targeted.** For reference only: the Linux CIFS client forwards the engine's
> whole-file *read* lock to the SMB2 server, which enforces it mandatorily and rejects the engine's
> own writes with `EACCES`; mounting with `nobrl` works around it but disables server-side locking.
> Use NFSv4 instead.

## How this was produced

- Build tree: `linux/` (CMake, Unix Makefiles generator), compiling the shared `WorkingSource`
  tree as C++.
- Toolchain: **Ubuntu 22.04 container**, `g++ 11.4.0`, `cmake 3.22.1` (Docker image `c4build`).
- Config: `linux/config/d4all.h` (`S4UNIX`, `S4STAND_ALONE`, `S4FOX`, `S4DLL`, `S4DLL_BUILD`, no
  `S4WINSOCK`) force-included so it shadows `WorkingSource/d4all.h` via the `D4ALL_INC` guard;
  `linux/config/p4port.h` provides the Unix portability header.
- Method: compile **every** stand-alone source independently (`linux/_spike_compile_all.sh`,
  `g++ -x c++ -c -o /dev/null`) so the inventory is not limited to the first failing file.
- Reproduce:
  ```
  MSYS_NO_PATHCONV=1 docker run --rm -v "<repo>:/src" -w /src c4build bash linux/_spike_compile_all.sh
  ```

## Result

| | |
|---|---|
| Sources compiled | 133 |
| Compiled clean | **112** |
| Failed to compile | **21** |
| Total compile errors | **85** |

The 112 clean files are encouraging: most of the engine already compiles under `S4UNIX` once the
missing config (`p4port.h`) and the DOS/Windows keyword shims are in place.

> Important: this is the **compile** stage only. A large amount of Windows code is inside
> `#ifdef S4WIN32` and is therefore simply *excluded* on Linux rather than erroring. The **link**
> stage and **runtime** (threading, file I/O, locking, string safety) are not yet exercised and will
> reveal additional gaps — see "Not yet reached".

## Failing files (errors per file)

| Errors | File |
|---:|---|
| 23 | `R4relate.c` |
| 17 | `C4code.c` |
| 12 | `O4opt.c` |
| 4 | `F4write.c` |
| 4 | `D4create.c` |
| 3 | `F4memo.c` |
| 3 | `F4file.c` |
| 3 | `D4append.c` |
| 2 | `S4init.c` |
| 2 | `M4create.c` |
| 2 | `D4write.c` |
| 1 | `c4baspas.c`, `M4memory.c`, `M4memo.c`, `M4file.c`, `I4create.c`, `F4lock.c`, `F4flush.c`, `D4open.c`, `D4date.c`, `C4trans.c` |

## Gaps by category

### G1. `assert5port` not defined on Linux — 18 errors, ~10 files
`assert5port` is only defined under `#ifdef S4WIN32` (`WorkingSource/d4declar.h:3200-3202`). Callers:
`D4append.c`, `D4create.c`, `D4date.c`, `D4open.c`, `D4write.c`, `F4memo.c`, `F4write.c`, `M4memo.c`,
`R4relate.c`, `F4file.c`…
- **Fix:** define `assert5port(val)` (empty) for `S4UNIX` in `d4declar.h`. Trivial.

### G2. Struct members guarded by `#ifdef S4WIN32` — 31 errors
Fields exist only in the Windows build, but the code that uses them is not guarded:
- `CODE4.addDll` / `CODE4.addFunction` (`d4data.h:2755`) → `C4code.c` (dynamic add-on DLL loading).
- `FILE4.critical4file` → `F4file.c:1228`, `F4write.c:52` (also `critical4sectionVerify`, G7).
- `RELATE4.suspend` / `callback` / `callbackMicroseconds` → `R4relate.c` (23 errors, the bulk of it).
- **Fix:** either move the fields out of the `S4WIN32` guard (they are used on Linux too), or extend
  the calling code's guards to `S4UNIX`. Needs care per field.

### G3. `FILE4LONG` struct vs `off_t` — 11 errors
`FILE4LONG` has two representations in `d4data.h` (`#ifndef S4UNIX` = struct with `.piece`/`.dLong`;
`S4UNIX` = scalar `off_t`). Some code uses the struct form unguarded:
- `O4opt.c:439/455/458/1195/1196` — `nonshifted.dLong`, `pos.dLong`.
- `D4create.c:1711` — `seqWrite.pos.dLong`.
- **Fix:** port these call sites to the `off_t` macros, or keep the struct representation on Linux.

### G4. Missing `file4long*` macros in the `S4UNIX` branch — 7 errors
- `file4longMod` used by `F4file.c:1401`, `F4flush.c:207`, `F4write.c:779`, `M4create.c:233/250` but
  only defined in the `#ifndef S4UNIX` block.
- `file4longEqualZero` arity mismatch in `O4opt.c:1022` (the active definition takes 2 args).
- **Fix:** add the missing macros to the `S4UNIX` branch of `d4data.h`.

### G5. Dynamic loading / Win32 handle APIs — 6+ errors
- `LoadLibrary` / `GetProcAddress` / `FreeLibrary` / `DWORD` → `C4code.c` (`code4additionalFunctionOdbc`,
  add-on DLLs, encryption DLL).
- `FARPROC` / `MakeProcInstance` → `d4defs.h:1260` (16-bit Windows API!).
- `HINSTANCE` compared with an integer → `c4baspas.c:320`.
- **Fix:** guard the dynamic-loading paths to `S4WIN32`, or implement with `dlopen`/`dlsym`/`dlclose`
  and a `DWORD`/`FARPROC` shim. Note: `S4ENCRYPT_DLL` was defined in the spike config to avoid a
  missing `c4encrypt.h`; a real decision on Linux encryption is needed.

### G6. MSVC-only `sprintf_s` — 2 errors
`C4trans.c:1941`, `M4memory.c:1170` call `sprintf_s` directly (not via a macro).
- **Fix:** provide a `sprintf_s` shim (→ `snprintf`) for Linux, or guard.

### G7. Threading helper missing — 2 errors
`critical4sectionVerify` (`F4file.c:1228`, `F4write.c:52`) is not declared for non-Windows.
- **Fix:** part of the POSIX threading layer (L2).

### G8. Misc single errors
- `HANDLE` conflicting typedef — `C4code.c:133` (guard `__DLL__ && S4PASCAL && !S4WIN32`).
- `numAttempts` not declared — `F4lock.c:375` (lock layer).
- `i4createLow` declared `extern` then `static` — `I4create.c:235`.
- `expected constructor, destructor, or type conversion` — `M4file.c:145` (macro/expansion issue).

## Config shims applied in this spike (uncommitted)

These are the minimum to get as far as the compile inventory; they are **not** the final port:
- `linux/config/d4all.h`: Linux config; `#define S4ENCRYPT_DLL` (to skip the missing `c4encrypt.h`);
  empty `far`/`near`/`pascal`/`_cdecl`/`_export`/`__cdecl`/`__stdcall`/`__far`; `HINSTANCE`/`HWND`
  typedefs.
- `linux/config/p4port.h`: Unix portability header (from the `win64/source` copy, updated).
- Note: `p4port.h` is **missing from `WorkingSource`** entirely; `d4inc.h:58` includes it for
  `S4UNIX`, so it must be provided (we added it under `linux/config/`).

## Not yet reached (expected next gaps)

- **Link stage:** missing definitions will surface (POSIX threading, file I/O, `critical4sectionVerify`,
  `file4longGetLo`, etc.). Many Windows paths are `#ifdef S4WIN32`-excluded, so their POSIX
  replacements do not exist yet.
- **Threading (L2):** `_beginthread` (delay-write/advance-read/reindex/pack), events, critical
  sections, mutexes, semaphores have no Linux implementation (`L4MUTEX.C`, `SEMA4.C` are Windows-only).
- **File I/O (L3):** `CreateFile`/`ReadFile`/`WriteFile`/`SetFilePointer` and the `FILE4LONG`/`off_t`
  layer; file locking for shared-storage (NFSv4) interop.
- **String safety (L4, README warning):** `c4strcpy`/`c4strcat` map to raw `strcpy`/`strcat` on Linux
  (the size argument is dropped) — not a compile error, but a buffer-overrun risk that must be
  addressed before use.
- **Struct packing:** `push4.h`/`pop4.h` apply `#pragma pack(1)` only for MSVC/Borland; GCC/Clang get
  no packing. Did not surface as a compile error but is an ABI/on-disk-layout risk.

## Recommended fix order

1. **L1b (finish compiling):** G1, G2, G3, G4, G6, G8 — small, mechanical, mostly `d4data.h`/
   `d4declar.h`/`d4defs.h` plus a handful of call sites.
2. **L1c (packing + visibility):** extend `push4.h`/`pop4.h` for GCC/Clang; ELF export map.
3. **L2 threading:** POSIX `L4MUTEX`/`SEMA4`, `_beginthread`→`pthread`, events/critical sections.
4. **L3 file I/O:** POSIX file layer + `FILE4LONG`; then shared-storage (NFSv4) locking tests.
5. **L4 misc + string safety:** `dlopen`, timing, `sprintf_s`, and the `c4strcpy`/`c4strcat` audit.
6. **L5:** link `libc4dll.so`, `nm -D` vs `c4dll64.dEf`.

## Verdict

The compile-stage gap is **small and well-contained** (85 errors, mostly 4 recurring causes), and
112/133 files already compile under `S4UNIX`. The larger, riskier work is the **runtime layers**
(threading, file I/O/locking, string safety, packing), which the compile pass does not expose
because that code is `#ifdef S4WIN32`-excluded. Native POSIX implementations (rather than a Win32
shim) remain the right approach for those layers, especially for shared-storage (NFSv4) locking.
