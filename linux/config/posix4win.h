/* posix4win.h - POSIX implementations of the small Win32 threading API used by the CodeBase engine.
 *
 * Included for S4UNIX after the CodeBase headers (so HANDLE is defined).  This lets the existing
 * delay-write / advance-read / semaphore / mutex code compile and run unchanged on Linux.
 */
#ifndef POSIX4WIN_H
#define POSIX4WIN_H

#ifdef S4UNIX

#include <pthread.h>
#include <semaphore.h>
#include <stdint.h>

#ifndef INFINITE
   #define INFINITE 0xFFFFFFFFu
#endif
#ifndef WAIT_OBJECT_0
   #define WAIT_OBJECT_0 0
#endif
#ifndef WAIT_TIMEOUT
   #define WAIT_TIMEOUT 258
#endif
#ifndef INVALID_HANDLE_VALUE
   #define INVALID_HANDLE_VALUE ((HANDLE)(intptr_t)-1)
#endif

/* Events (manual/auto reset) */
HANDLE CreateEvent( void *sa, int manualReset, int initialState, const char *name ) ;
int SetEvent( HANDLE h ) ;
int ResetEvent( HANDLE h ) ;
unsigned long WaitForSingleObject( HANDLE h, unsigned long ms ) ;
unsigned long WaitForMultipleObjects( unsigned long count, const HANDLE *handles, int waitAll, unsigned long ms ) ;
int CloseHandle( HANDLE h ) ;

/* Mutex */
HANDLE CreateMutex( void *sa, int initialOwner, const char *name ) ;
int ReleaseMutex( HANDLE h ) ;

/* Semaphore */
HANDLE CreateSemaphore( void *sa, long initialCount, long maxCount, const char *name ) ;
int ReleaseSemaphore( HANDLE h, long releaseCount, long *previousCount ) ;

/* Threads */
typedef void (*S4BEGINTHREAD_FUNC)( void * ) ;
HANDLE _beginthread( S4BEGINTHREAD_FUNC fn, unsigned stackSize, void *arg ) ;
void _endthread( void ) ;

/* Misc */
void Sleep( unsigned long ms ) ;
unsigned long GetCurrentThreadId( void ) ;

/* Atomics (single-threaded-correct; use compiler builtins for atomicity) */
long InterlockedIncrement( long volatile *addend ) ;
long InterlockedDecrement( long volatile *addend ) ;

#endif /* S4UNIX */
#endif /* POSIX4WIN_H */
