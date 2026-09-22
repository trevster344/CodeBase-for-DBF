/* p4port.h (c)Copyright Sequiter Software Inc., 1988-1998.  All rights reserved.

   Declarations for non-standard C runtime library functions.

   Linux configuration for the CodeBase stand-alone library.  Based on the copy shipped in
   CodeBaseServer2020/development/win64/source/p4port.h, updated for x86_64/aarch64 (LP64) and
   modern glibc.
*/

#ifdef S4UNIX

/* CodeBase multi-platform defines */
   #define S464BIT              /* 64-bit build (LP64) */
/* #define S4BYTEORDER_2301  */
/* #define S4BYTEORDER_3210  */
/* #define S4BYTE_SWAP       */  /* x86_64/aarch64 are little-endian like Windows */
   #define S4NO_NEGATIVE_LOCK   /* negative locking not supported */
   #define S4DATA_ALIGN         /* data may need to be on byte boundaries */
/* #define S4MEMCMP          */

/* #define S4NO_ATOF         */
   #define S4NO_CHSIZE          /* chsize() not found */
   #define S4NO_ECVT            /* ecvt() not found */
   #define S4NO_FCVT            /* fcvt() not found */
/* #define S4NO_FCHMOD       */
   #define S4NO_FILELENGTH      /* filelength() not found */
/* #define S4NO_FTIME        */
/* #define S4NO_LOCKF        */
/* #define S4NO_MEMMOVE      */
/* #define S4NO_POW          */
/* #define S4NO_RENAME       */
/* #define S4NO_REMOVE       */
/* #define S4NO_SIZE_T       */
   #define S4NO_STRLWR          /* strlwr() not found */
   #define S4NO_STRUPR          /* strupr() not found */
   #define S4NO_STRNICMP        /* strnicmp() not found */
/* #define S4NO_USLEEP       */
   #define S4LINUX

   #include <unistd.h>
   #include <stdint.h>
   #ifndef S4STAND_ALONE
      #ifdef S4BERKSOCK
         #include <sys/socket.h>
         #include <netinet/in.h>
         #include <netinet/tcp.h>
         #include <netdb.h>
         #include <sys/types.h>
         #include <sys/time.h>
         #include <sys/ioctl.h>
         #include <arpa/inet.h>
      #endif
   #endif
#endif

#ifdef S4MULTIC4
   #include <sys/wait.h>
#endif

#define S4CMP_PARM  const void *
