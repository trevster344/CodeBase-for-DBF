/* posix4str.c - bounds-checked counterparts of the MSVC *_s string functions used by CodeBase.
 *
 * The Windows build maps c4strcpy/c4strcat/c4strncat/c4strncpy to strcpy_s/strcat_s/strncat_s/
 * strncpy_s, which honour the destination buffer size.  On Linux the code historically fell back to
 * the unbounded strcpy/strcat (the size argument was dropped) - this provides safe equivalents.
 */

#include "d4all.h"

#ifdef S4UNIX

#include <string.h>

size_t c4strcpy_s( char *dst, size_t dstSize, const char *src )
{
   size_t i = 0 ;
   if ( dst == 0 || dstSize == 0 )
      return 0 ;
   if ( src != 0 )
   {
      while ( src[i] != '\0' && ( i + 1 ) < dstSize )
      {
         dst[i] = src[i] ;
         i++ ;
      }
   }
   dst[i] = '\0' ;
   return i ;
}

size_t c4strcat_s( char *dst, size_t dstSize, const char *src )
{
   size_t len = 0 ;
   if ( dst == 0 || dstSize == 0 )
      return 0 ;
   while ( len < dstSize && dst[len] != '\0' )
      len++ ;
   if ( len >= dstSize )          /* not null-terminated within dstSize - treat as full */
      return len ;
   return len + c4strcpy_s( dst + len, dstSize - len, src ) ;
}

size_t c4strncat_s( char *dst, size_t dstSize, const char *src, size_t srcLen )
{
   size_t len = 0 ;
   size_t i = 0 ;
   if ( dst == 0 || dstSize == 0 )
      return 0 ;
   while ( len < dstSize && dst[len] != '\0' )
      len++ ;
   if ( len >= dstSize )
      return len ;
   if ( src != 0 )
   {
      while ( i < srcLen && src[i] != '\0' && ( len + i + 1 ) < dstSize )
      {
         dst[len + i] = src[i] ;
         i++ ;
      }
   }
   dst[len + i] = '\0' ;
   return len + i ;
}

size_t c4strncpy_s( char *dst, size_t dstSize, const char *src, size_t srcLen )
{
   size_t i = 0 ;
   if ( dst == 0 || dstSize == 0 )
      return 0 ;
   if ( src != 0 )
   {
      while ( i < srcLen && src[i] != '\0' && ( i + 1 ) < dstSize )
      {
         dst[i] = src[i] ;
         i++ ;
      }
   }
   dst[i] = '\0' ;
   return i ;
}

#endif /* S4UNIX */
