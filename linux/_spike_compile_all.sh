#!/usr/bin/env bash
# Spike helper: compile every stand-alone source independently (no link) to inventory gaps.
# Run inside the c4build container from the repo root:  bash linux/_spike_compile_all.sh
set +e

FLAGS="-w -std=gnu++14 -fPIC -I linux/config -I WorkingSource -include linux/config/d4all.h -DS4DLL_BUILD -D_CRT_SECURE_NO_WARNINGS"

grep -oE '\$\{REPO_ROOT\}/WorkingSource/[A-Za-z0-9_.]+' linux/CMakeLists.txt \
  | sed 's#${REPO_ROOT}/##' | sort -u > /tmp/srcs.txt

: > linux/compile-all.log
while IFS= read -r f; do
  echo "===== FILE: $f =====" >> linux/compile-all.log
  g++ $FLAGS -x c++ -c "$f" -o /dev/null >> linux/compile-all.log 2>&1
  echo "EXIT=$?" >> linux/compile-all.log
done < /tmp/srcs.txt
echo "files: $(wc -l < /tmp/srcs.txt)"
