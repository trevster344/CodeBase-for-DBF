/* *********************************************************************************************** */
/* Copyright (C) 1999-2015 by Sequiter, Inc., 9644-54 Ave, NW, Suite 209, Edmonton, Alberta Canada.*/
/* This program is free software: you can redistribute it and/or modify it under the terms of      */
/* the GNU Lesser General Public License as published by the Free Software Foundation, version     */
/* 3 of the License.                                                                               */
/*                                                                                                 */
/* This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;       */
/* without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.       */
/* See the GNU Lesser General Public License for more details.                                     */
/*                                                                                                 */
/* You should have received a copy of the GNU Lesser General Public License along with this        */
/* program. If not, see <https://www.gnu.org/licenses/>.                                           */
/* *********************************************************************************************** */

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
