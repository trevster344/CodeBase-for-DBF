/* push the stack to one-byte alignment */

#if defined(_MSC_VER) && !defined(S4WIN64)
   #if _MSC_VER >= 900
      #pragma pack(push,1)
   #else
      #pragma pack(1)
   #endif
#elif defined(__GNUC__) || defined(__clang__)
   /* Linux/POSIX: match the MSVC 32/64-bit build, which uses one-byte packing.
      (arm64 faults on unaligned atomics/ldp-stp, so skip packing there.) */
   #if !defined(__aarch64__)
      #pragma pack(push,1)
   #endif
#else
   #ifdef __BORLANDC__
      #pragma pack(1)
   #endif
#endif

#ifdef __BORLANDC__
   #pragma nopackwarning
#endif

#if defined(S4MACINTOSH )
   #pragma options align = power
#endif
