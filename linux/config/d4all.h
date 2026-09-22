/* d4all.h  (Linux configuration for the CodeBase stand-alone library)
 *
 * This is the Linux counterpart of WorkingSource/HDR_VFP_STAND_ALONE_64/d4all.h.  It is force
 * included (g++ -include) so it shadows WorkingSource/d4all.h via the D4ALL_INC guard.
 *
 * Target: CodeBase stand-alone (S4STAND_ALONE), Visual FoxPro/CDX (S4FOX), Linux, 64-bit.
 */

#ifndef D4ALL_INC
#define D4ALL_INC

/**********************************************************************/
/**********            USER SWITCH SETTINGS AREA            ***********/

/* CodeBase configuration */
/* #define S4CLIENT */
#define S4STAND_ALONE

/* Index File compatibility options */
#ifndef S4CLIENT
/* #define S4CLIPPER */
#define S4FOX
/* #define S4MDX     */
#endif

/* Specify Library Type (choose one) */
/* #define S4STATIC */
#define S4DLL

/* Choose Operating System */
/* #define S4WIN32    */
/* #define S4WINCE    */
#define S4UNIX        /* Linux (CodeBase Portability) */
/* #define S4MACINTOSH */
/* #define S4WIN64    */

/* No communications layer in stand-alone mode. */
/* #define S4WINSOCK */

/* GCC/Clang shims: the code uses legacy DOS/Windows keywords that do not exist on Linux.  Define
   them empty so the existing S4CALL/S4PTR/... declarations expand cleanly. */
#define far
#define near
#define pascal
#define _cdecl
#define _export
#define _far
#define _near
#define _pascal
#define __cdecl
#define __far
#define __stdcall

/* Windows handle types referenced outside S4WIN32 guards (encryption-DLL declarations). */
typedef void *HINSTANCE;
typedef void *HWND;

/* windows.h calling-convention macro used by callback typedefs. */
#define CALLBACK

/* Alterable CodeBase Global Defines */
#define DEF4SERVER_ID "localhost"
#define DEF4PROCESS_ID "23165"

/* General Configuration Options */
/* #define S4LOCK_HOOK    */
/* #define S4MAX          */
/* #define S4SAFE         */
/* #define S4TIMEOUT_HOOK */

/* Error Configuration Options */
/* #define E4ANALYZE    */
/* #define E4DEBUG      */
/* #define E4HOOK       */
/* #define E4LINK       */
/* #define E4MISC       */
   #define E4VBASIC
/* #define E4OFF        */
/* #define E4OFF_STRING */
   #define E4PARM_HIGH
   #define E4PAUSE
/* #define E4DO_PAUSE */
/* #define E4FILE_LINE  */
/* #define E4STOP       */
/* #define E4STOP_CRITICAL  */

/* Library Reducing Switches */
/* #define S4OFF_INDEX    */
/* #define S4OFF_MEMO     */
/* #define S4OFF_MULTI    */
/* #define S4OFF_OPTIMIZE */
   #define S4OFF_REPORT
/* #define S4OFF_TRAN     */
/* #define S4OFF_WRITE    */
#ifdef S4STAND_ALONE
   #define S4OFF_COMPRESS
   /* #define S4OFF_THREAD   */
#endif

#ifdef S4FOX
   /* FoxPro collating sequence support */
   #define S4GENERAL
   /* FoxPro codepage support */
   #define S4CODEPAGE_437
   #define S4CODEPAGE_1252
   #define S4CODEPAGE_1250
#endif

#define S4VERSION 6503014
#include "d4inc.h"

#ifdef S4UNIX
   /* POSIX implementations of the Win32 threading API used by the engine. */
   #include "posix4win.h"
#endif

#endif /* D4ALL_INC */
