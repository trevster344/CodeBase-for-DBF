/* pop the stack back to previous alignment */

#if defined(_MSC_VER) && !defined(S4WIN64)
   #if _MSC_VER >= 900
      #pragma pack(pop)
   #else
      #pragma pack()
   #endif
#elif defined(__GNUC__) || defined(__clang__)
   /* Linux/POSIX: match the MSVC 32/64-bit build, which uses one-byte packing.
      (arm64 faults on unaligned atomics/ldp-stp, so skip packing there.) */
   #if !defined(__aarch64__)
      #pragma pack(pop)
   #endif
#else
   #ifdef __BORLANDC__
      #pragma pack()
   #endif
#endif

#ifdef __BORLANDC__
   #pragma nopackwarning
#endif

#if defined(S4MACINTOSH )
        #pragma options align = reset
#endif
