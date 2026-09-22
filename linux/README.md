# Linux build tree

CMake build tree for the CodeBase **stand-alone** engine (`libc4dll.so`) on Linux (x64 and arm64).
The source is **shared** with the Windows build in `../WorkingSource`; only build configuration and
the POSIX platform shims live here.

Status: the engine **builds, links, runs and threads** on Linux x64 and arm64, is **binary-compatible
with the Windows DLL** for DBF/CDX files (verified both ways), and is covered by CI. See
[GAP_REPORT.md](GAP_REPORT.md) for the full history of what was ported.

## Layout

```
linux/
  CMakeLists.txt              # compiles ../WorkingSource/*.c as C++ + the POSIX shims
  config/d4all.h              # Linux config (S4UNIX, S4STAND_ALONE, S4FOX, S4DLL, S4DLL_BUILD)
  config/p4port.h             # Unix portability header (missing from WorkingSource)
  config/posix4win.h          # declarations for the POSIX Win32-threading shim
  posix4win.c                 # POSIX events/mutexes/semaphores/threads/Sleep/atomics
  posix4str.c                 # bounds-checked c4strcpy/c4strcat/c4strncat/c4strncpy
  toolchain/linux-arm64.cmake # cross-compile toolchain (aarch64)
  smoke-test.mjs              # koffi smoke test (lifecycle + CRUD, all field types + memo + tags)
  interface-test.mjs          # drives the engine through the interfaces/Node bindings
  run-tests.sh                # runs both tests (smoke + interface)
  GAP_REPORT.md               # porting gap report / change log
  _spike_compile_all.sh       # compile every source independently to inventory gaps
```

## How it works

- `config/d4all.h` is **force-included** (`-include`) and defines `D4ALL_INC`, so it shadows
  `WorkingSource/d4all.h` via that include guard. The Windows header is never mutated.
- `config/p4port.h` and `config/posix4win.h` are found through the include path.
- All sources are compiled as **C++** (`S4DLL_BUILD` requires it).
- The engine's port changes live in `../WorkingSource` under `S4UNIX` guards, so the Windows
  (`S4WIN32`) path is unaffected.
- `#pragma pack(1)` is applied on x64 (matching Windows) but **skipped on arm64**, which faults on
  the resulting unaligned accesses; the on-disk format uses explicit byte offsets so files stay
  compatible.

## Build (native Linux / WSL with build tools)

```bash
cmake -S linux -B linux/build -G "Unix Makefiles"
cmake --build linux/build            # -> linux/build/libc4dll.so
```

### arm64 (cross-compile from x64)

```bash
sudo apt-get install -y g++-aarch64-linux-gnu
cmake -S linux -B linux/build-arm64 -G "Unix Makefiles" \
      -DCMAKE_TOOLCHAIN_FILE="$PWD/linux/toolchain/linux-arm64.cmake"
cmake --build linux/build-arm64      # -> linux/build-arm64/libc4dll.so (aarch64)
```

## Build via Docker (no local toolchain)

```bash
docker build -t c4build - <<'EOF'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq cmake g++ make
EOF

MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/src" -w /src c4build bash -c '
  cmake -S linux -B linux/build -G "Unix Makefiles" && cmake --build linux/build -j2'
```

## Tests

Run both Linux tests (koffi smoke test + interface test) with one command:

```bash
bash linux/run-tests.sh                 # uses linux/build/libc4dll.so
bash linux/run-tests.sh linux/build-arm64/libc4dll.so
```

The sections below describe each test individually.

## Smoke test

```bash
mkdir -p /tmp/kt && cd /tmp/kt
npm init -y && npm install koffi
cp "$OLDPWD/linux/smoke-test.mjs" .
node smoke-test.mjs "$OLDPWD/linux/build/libc4dll.so"
# -> SMOKE PASS
```

The smoke test runs the CODE4 lifecycle and a CRUD round-trip over STR/NUM/DBL/LOG/DATE/MEMO with a
memo and two CDX tags. For arm64, run it in an arm64 container (`docker run --platform linux/arm64`).

### Interface test

Drives the engine through the actual `interfaces/Node` bindings (which resolve `linux/build*/libc4dll.so`
from the repo tree):

```bash
npm --prefix interfaces/Node install
npm --prefix interfaces/Node run build
node linux/interface-test.mjs        # -> INTERFACE PASS
```

## Shared storage — NFSv4

For Windows + Linux access to the same DBF/CDX files, **NFSv4** is the supported option (validated):
create, read/write and cross-process record locking all work over the mount, because the engine's
POSIX (`fcntl`/`lockf`) byte-range locks are honoured by the NFSv4 server.

Reproduce the validation with a containerised NFSv4 server:

```bash
docker network create s4net
docker run -d --name s4nfs --network s4net --privileged \
  -e SHARED_DIRECTORY=/share --mount source=s4nfs,target=/share \
  itsthenetwork/nfs-server-alpine:latest

# client: mount and run the engine over the share
docker run --rm --network s4net --privileged -v "$PWD:/src" -w /tmp node:22-bookworm bash -c '
  apt-get update -qq && apt-get install -y -qq nfs-common
  mkdir -p /mnt/nfs && mount -t nfs4 -o vers=4.1 s4nfs:/ /mnt/nfs
  mkdir -p /tmp/kt && cd /tmp/kt && npm init -y >/dev/null 2>&1 && npm install koffi >/dev/null 2>&1
  cp /src/linux/smoke-test.mjs .
  TMPDIR=/mnt/nfs node smoke-test.mjs /src/linux/build/libc4dll.so'
```

(`TMPDIR` makes the smoke test create its table on the NFS mount.)

> **Samba/CIFS is not targeted** — the Linux CIFS client enforces the engine's whole-file read lock
> mandatorily and rejects its own writes (`EACCES`). See `GAP_REPORT.md` for details.

## CI

`.github/workflows/linux-engine.yml` builds x64, cross-compiles arm64 (tested via QEMU), runs the
smoke test on both, and rebuilds the Windows x64 DLL for regression.
