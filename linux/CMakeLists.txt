cmake_minimum_required(VERSION 3.16)
project(c4dll LANGUAGES C CXX)

# Linux stand-alone build of the CodeBase engine (libc4dll.so).
#
# The source tree is shared with the Windows build (../WorkingSource).  Everything is compiled as
# C++ (the library build requires it) and linux/config/d4all.h is force-included so it shadows
# WorkingSource/d4all.h via the D4ALL_INC guard.
#
# Build:
#   cmake -S linux -B linux/build -G "Unix Makefiles"
#   cmake --build linux/build

set(REPO_ROOT   "${CMAKE_CURRENT_SOURCE_DIR}/..")
set(WORKING_SRC "${REPO_ROOT}/WorkingSource")
set(LINUX_CFG   "${CMAKE_CURRENT_SOURCE_DIR}/config")

set(CODEBASE_SOURCES
  ${CMAKE_CURRENT_SOURCE_DIR}/posix4win.c
  ${CMAKE_CURRENT_SOURCE_DIR}/posix4str.c
  ${REPO_ROOT}/WorkingSource/B4block.c
  ${REPO_ROOT}/WorkingSource/C4.c
  ${REPO_ROOT}/WorkingSource/C4BUFFER.C
  ${REPO_ROOT}/WorkingSource/C4COM2.C
  ${REPO_ROOT}/WorkingSource/C4CONECT.C
  ${REPO_ROOT}/WorkingSource/C4CONLOW.C
  ${REPO_ROOT}/WorkingSource/C4THREAD.C
  ${REPO_ROOT}/WorkingSource/C4UTIL.C
  ${REPO_ROOT}/WorkingSource/C4bcd.c
  ${REPO_ROOT}/WorkingSource/C4code.c
  ${REPO_ROOT}/WorkingSource/C4com.c
  ${REPO_ROOT}/WorkingSource/C4const.c
  ${REPO_ROOT}/WorkingSource/C4hook.c
  ${REPO_ROOT}/WorkingSource/C4trans.c
  ${REPO_ROOT}/WorkingSource/D4MODIFY.C
  ${REPO_ROOT}/WorkingSource/D4append.c
  ${REPO_ROOT}/WorkingSource/D4bottom.c
  ${REPO_ROOT}/WorkingSource/D4close.c
  ${REPO_ROOT}/WorkingSource/D4create.c
  ${REPO_ROOT}/WorkingSource/D4data.c
  ${REPO_ROOT}/WorkingSource/D4date.c
  ${REPO_ROOT}/WorkingSource/D4extra.c
  ${REPO_ROOT}/WorkingSource/D4field.c
  ${REPO_ROOT}/WorkingSource/D4file.c
  ${REPO_ROOT}/WorkingSource/D4flush.c
  ${REPO_ROOT}/WorkingSource/D4fresh.c
  ${REPO_ROOT}/WorkingSource/D4go.c
  ${REPO_ROOT}/WorkingSource/D4index.c
  ${REPO_ROOT}/WorkingSource/D4info.c
  ${REPO_ROOT}/WorkingSource/D4inline.c
  ${REPO_ROOT}/WorkingSource/D4lock.c
  ${REPO_ROOT}/WorkingSource/D4open.c
  ${REPO_ROOT}/WorkingSource/D4opt.c
  ${REPO_ROOT}/WorkingSource/D4pack.c
  ${REPO_ROOT}/WorkingSource/D4positi.c
  ${REPO_ROOT}/WorkingSource/D4remove.c
  ${REPO_ROOT}/WorkingSource/D4seek.c
  ${REPO_ROOT}/WorkingSource/D4skip.c
  ${REPO_ROOT}/WorkingSource/D4tag.c
  ${REPO_ROOT}/WorkingSource/D4top.c
  ${REPO_ROOT}/WorkingSource/D4unlock.c
  ${REPO_ROOT}/WorkingSource/D4write.c
  ${REPO_ROOT}/WorkingSource/D4zap.c
  ${REPO_ROOT}/WorkingSource/Df4lock.c
  ${REPO_ROOT}/WorkingSource/Df4unlok.c
  ${REPO_ROOT}/WorkingSource/E4EVENT.C
  ${REPO_ROOT}/WorkingSource/E4calc.c
  ${REPO_ROOT}/WorkingSource/E4calc_2.c
  ${REPO_ROOT}/WorkingSource/E4error.c
  ${REPO_ROOT}/WorkingSource/E4expr.c
  ${REPO_ROOT}/WorkingSource/E4functi.c
  ${REPO_ROOT}/WorkingSource/E4not_s.c
  ${REPO_ROOT}/WorkingSource/E4parse.c
  ${REPO_ROOT}/WorkingSource/E4string.c
  ${REPO_ROOT}/WorkingSource/F4WSTR.C
  ${REPO_ROOT}/WorkingSource/F4ass_f.c
  ${REPO_ROOT}/WorkingSource/F4char.c
  ${REPO_ROOT}/WorkingSource/F4close.c
  ${REPO_ROOT}/WorkingSource/F4create.c
  ${REPO_ROOT}/WorkingSource/F4double.c
  ${REPO_ROOT}/WorkingSource/F4field.c
  ${REPO_ROOT}/WorkingSource/F4file.c
  ${REPO_ROOT}/WorkingSource/F4filese.c
  ${REPO_ROOT}/WorkingSource/F4flag.c
  ${REPO_ROOT}/WorkingSource/F4flush.c
  ${REPO_ROOT}/WorkingSource/F4info.c
  ${REPO_ROOT}/WorkingSource/F4int.c
  ${REPO_ROOT}/WorkingSource/F4lock.c
  ${REPO_ROOT}/WorkingSource/F4long.c
  ${REPO_ROOT}/WorkingSource/F4memo.c
  ${REPO_ROOT}/WorkingSource/F4open.c
  ${REPO_ROOT}/WorkingSource/F4opt.c
  ${REPO_ROOT}/WorkingSource/F4ptr.c
  ${REPO_ROOT}/WorkingSource/F4str.c
  ${REPO_ROOT}/WorkingSource/F4temp.c
  ${REPO_ROOT}/WorkingSource/F4true.c
  ${REPO_ROOT}/WorkingSource/F4write.c
  ${REPO_ROOT}/WorkingSource/I4THREAD.C
  ${REPO_ROOT}/WorkingSource/I4add.c
  ${REPO_ROOT}/WorkingSource/I4addtag.c
  ${REPO_ROOT}/WorkingSource/I4check.c
  ${REPO_ROOT}/WorkingSource/I4create.c
  ${REPO_ROOT}/WorkingSource/I4dump.c
  ${REPO_ROOT}/WorkingSource/I4index.c
  ${REPO_ROOT}/WorkingSource/I4info.c
  ${REPO_ROOT}/WorkingSource/I4init.c
  ${REPO_ROOT}/WorkingSource/I4key.c
  ${REPO_ROOT}/WorkingSource/I4lock.c
  ${REPO_ROOT}/WorkingSource/I4ntag.c
  ${REPO_ROOT}/WorkingSource/I4positi.c
  ${REPO_ROOT}/WorkingSource/I4remove.c
  ${REPO_ROOT}/WorkingSource/I4tag.c
  ${REPO_ROOT}/WorkingSource/L4MUTEX.C
  ${REPO_ROOT}/WorkingSource/L4link.c
  ${REPO_ROOT}/WorkingSource/L4lock_c.c
  ${REPO_ROOT}/WorkingSource/M4check.c
  ${REPO_ROOT}/WorkingSource/M4create.c
  ${REPO_ROOT}/WorkingSource/M4file.c
  ${REPO_ROOT}/WorkingSource/M4map.c
  ${REPO_ROOT}/WorkingSource/M4memo.c
  ${REPO_ROOT}/WorkingSource/M4memory.c
  ${REPO_ROOT}/WorkingSource/O4opt.c
  ${REPO_ROOT}/WorkingSource/R4area.c
  ${REPO_ROOT}/WorkingSource/R4bit.c
  ${REPO_ROOT}/WorkingSource/R4drive2.c
  ${REPO_ROOT}/WorkingSource/R4driver.c
  ${REPO_ROOT}/WorkingSource/R4group.c
  ${REPO_ROOT}/WorkingSource/R4log.c
  ${REPO_ROOT}/WorkingSource/R4obj.c
  ${REPO_ROOT}/WorkingSource/R4regs.c
  ${REPO_ROOT}/WorkingSource/R4reinde.c
  ${REPO_ROOT}/WorkingSource/R4reindx.c
  ${REPO_ROOT}/WorkingSource/R4relate.c
  ${REPO_ROOT}/WorkingSource/R4report.c
  ${REPO_ROOT}/WorkingSource/R4save.c
  ${REPO_ROOT}/WorkingSource/R4save_2.c
  ${REPO_ROOT}/WorkingSource/R4style.c
  ${REPO_ROOT}/WorkingSource/R4total.c
  ${REPO_ROOT}/WorkingSource/S4SIGNAL.C
  ${REPO_ROOT}/WorkingSource/S4init.c
  ${REPO_ROOT}/WorkingSource/S4initfr.c
  ${REPO_ROOT}/WorkingSource/S4next.c
  ${REPO_ROOT}/WorkingSource/S4quick.c
  ${REPO_ROOT}/WorkingSource/S4sort.c
  ${REPO_ROOT}/WorkingSource/SEMA4.C
  ${REPO_ROOT}/WorkingSource/U4name.c
  ${REPO_ROOT}/WorkingSource/U4util.c
  ${REPO_ROOT}/WorkingSource/b4node.c
  ${REPO_ROOT}/WorkingSource/c4baspas.c
  ${REPO_ROOT}/WorkingSource/c4send.c
  ${REPO_ROOT}/WorkingSource/c4set.c
  ${REPO_ROOT}/WorkingSource/f4find.cpp
  ${REPO_ROOT}/WorkingSource/i4conv.c
)

# Compile every source as C++ (the library build requires C++).
set_source_files_properties(${CODEBASE_SOURCES} PROPERTIES LANGUAGE CXX)

add_library(c4dll SHARED ${CODEBASE_SOURCES})

target_include_directories(c4dll PRIVATE
  "${LINUX_CFG}"
  "${WORKING_SRC}"
)

target_compile_definitions(c4dll PRIVATE
  S4DLL_BUILD
  _CRT_SECURE_NO_WARNINGS
)

target_compile_options(c4dll PRIVATE
  -include "${LINUX_CFG}/d4all.h"
  -fPIC
  -Wno-write-strings
)

set_target_properties(c4dll PROPERTIES
  PREFIX "lib"
  OUTPUT_NAME "c4dll"
  SUFFIX ".so"
)
