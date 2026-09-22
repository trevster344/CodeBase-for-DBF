---
name: linux
description: Use when building, testing, or debugging the CodeBase Linux engine (libc4dll.so) — CMake, x64 and arm64 (cross-compile / QEMU), Docker/WSL, NFSv4 shared storage, and the koffi smoke/interface tests. Trigger on "linux build", "libc4dll.so", "arm64", "aarch64", "cmake linux", "linux test", "NFS".
---

# CodeBase Linux engine

The Linux stand-alone engine is built from the shared `WorkingSource/` tree via the `linux/` CMake
project. It targets **x64 and arm64**, produces DBF/CDX files that are byte-compatible with the
Windows DLLs, and is covered by CI (`.github/workflows/linux-engine.yml`).

## Build

```bash
cmake -S linux -B linux/build -G "Unix Makefiles"
cmake --build linux/build            # -> linux/build/libc4dll.so
```

arm64 (cross-compile from x64):

```bash
sudo apt-get install -y g++-aarch64-linux-gnu
cmake -S linux -B linux/build-arm64 -G "Unix Makefiles" \
      -DCMAKE_TOOLCHAIN_FILE="$PWD/linux/toolchain/linux-arm64.cmake"
cmake --build linux/build-arm64
```

No local toolchain? Build in Docker:

```bash
docker build -t c4build - <<'EOF'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq cmake g++ make
EOF
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/src" -w /src c4build bash -c \
  'cmake -S linux -B linux/build -G "Unix Makefiles" && cmake --build linux/build -j2'
```

## Test

```bash
bash linux/run-tests.sh                                  # smoke + interface, x64
bash linux/run-tests.sh linux/build-arm64/libc4dll.so    # arm64 build
```

- `linux/smoke-test.mjs` — raw koffi: lifecycle + CRUD (all field types + memo + 2 tags).
- `linux/interface-test.mjs` — drives the actual `interfaces/Node` bindings.

Run arm64 under QEMU: `docker run --platform linux/arm64 ... node:22-bookworm`.

## Gotchas

- **arm64 + struct packing**: `#pragma pack(1)` is applied on x64 but **skipped on `__aarch64__`**
  (`WorkingSource/push4.h`, `pop4.h`) because arm64 faults (SIGBUS) on the resulting unaligned
  accesses. The on-disk format uses explicit byte offsets, so files stay compatible.
- **`p4port.h`** is missing from `WorkingSource`; it lives in `linux/config/`.
- **Path quoting**: on Windows/Git-Bash, prefix Docker commands with `MSYS_NO_PATHCONV=1` (MSYS mangles
  `:/` paths and `/src`).
- **WSL sudo needs a password** — prefer Docker for builds.
- **QEMU** is stricter than real arm64 hardware about unaligned access; a QEMU SIGBUS may not occur on
  real arm64.

## Do / Don't

**Do**

- Build with the `linux/` CMake project; run `bash linux/run-tests.sh` after any change.
- Keep every engine change under `S4UNIX` guards in `WorkingSource/` (see the `cpp` skill).
- Prefix Docker commands with `MSYS_NO_PATHCONV=1` on Windows/Git-Bash.
- Cross-compile arm64 with `linux/toolchain/linux-arm64.cmake`; test it in an arm64 container.
- Use the bundled/platform-aware resolution (`process.platform` + `process.arch`) in the Node adapter.

**Don't**

- Don't edit anything under `linux/build*/` — it is generated and gitignored.
- Don't rely on `#pragma pack(1)` on arm64 — it is skipped for `__aarch64__`.
- Don't edit `WorkingSource/d4all.h` for Linux — it is shadowed by `linux/config/d4all.h`.
- Don't use Samba/CIFS for shared Windows+Linux access — use NFSv4.
- Don't `sudo` in WSL expecting no password — use Docker instead.
- Don't commit `libc4dll.so` / `linux/build*/` (gitignored) — they are built, not shipped from git.

## Shared storage

**NFSv4** is the supported option for Windows + Linux access (create/read/write + cross-process
locking verified). **Samba/CIFS is not targeted** (the Linux CIFS client enforces the engine's
whole-file read lock mandatorily and rejects its own writes with `EACCES`). See `linux/GAP_REPORT.md`.
