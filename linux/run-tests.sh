#!/usr/bin/env bash
# Runs the Linux engine tests:
#   - the koffi smoke test (linux/smoke-test.mjs)
#   - the interfaces/Node interface test (linux/interface-test.mjs), if the interface is built
#
# Usage:  bash linux/run-tests.sh [path-to-libc4dll.so]
#   default: linux/build/libc4dll.so
#   build first: cmake -S linux -B linux/build -G "Unix Makefiles" && cmake --build linux/build
#
# Requires node + npm.  koffi is installed into a temporary directory; the repo's node_modules is
# not touched.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SO="${1:-$HERE/build/libc4dll.so}"

if [ ! -f "$SO" ]; then
   echo "error: engine not found: $SO" >&2
   echo "build it with: cmake -S linux -B linux/build && cmake --build linux/build" >&2
   exit 1
fi

KT="$(mktemp -d)"
trap 'rm -rf "$KT"' EXIT
( cd "$KT" && npm init -y >/dev/null 2>&1 && npm install koffi >/dev/null 2>&1 )

echo "== smoke test =="
( cd "$KT" && cp "$HERE/smoke-test.mjs" . && node smoke-test.mjs "$SO" )

echo "== interface test =="
if [ ! -f "$ROOT/interfaces/Node/dist/index.js" ]; then
   echo "  SKIP: interfaces/Node not built (run: npm --prefix interfaces/Node install && npm --prefix interfaces/Node run build)"
   exit 0
fi
BUILDDIR="$(basename "$(dirname "$SO")")"
mkdir -p "$KT/iface/interfaces/Node" "$KT/iface/linux/$BUILDDIR"
cp -r "$ROOT/interfaces/Node/dist" "$KT/iface/interfaces/Node/"
cp "$SO" "$KT/iface/linux/$BUILDDIR/"
cp "$HERE/interface-test.mjs" "$KT/iface/linux/"
( cd "$KT/iface" && node linux/interface-test.mjs )
