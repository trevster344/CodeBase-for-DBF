# CMake toolchain file for cross-compiling libc4dll.so for Linux aarch64 (arm64).
#
#   cmake -S linux -B linux/build-arm64 -G "Unix Makefiles" \
#         -DCMAKE_TOOLCHAIN_FILE=linux/toolchain/linux-arm64.cmake
#   cmake --build linux/build-arm64
#
# Requires g++-aarch64-linux-gnu (Debian/Ubuntu: apt install g++-aarch64-linux-gnu).

set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)

set(CMAKE_C_COMPILER   aarch64-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++)

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
