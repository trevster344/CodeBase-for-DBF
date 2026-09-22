/* posix4win.c - POSIX implementations of the small Win32 threading API used by the CodeBase engine.
 *
 * Compiled into libc4dll.so.  Handles (HANDLE = intptr_t) are pointers to heap-allocated objects.
 */

#include "d4all.h"

#ifdef S4UNIX

#include <stdlib.h>
#include <errno.h>
#include <time.h>

typedef struct
{
   int type ;                 /* 0 = event, 1 = mutex, 2 = semaphore */
   pthread_mutex_t mutex ;    /* protects the fields below (also the lock for type 1) */
   pthread_cond_t cond ;
   int signaled ;             /* event state */
   int manualReset ;
   long semCount ;
   long semMax ;
} S4THREADOBJ ;

static S4THREADOBJ *s4obj( HANDLE h )
{
   return (S4THREADOBJ *)(intptr_t)h ;
}

HANDLE CreateEvent( void *sa, int manualReset, int initialState, const char *name )
{
   S4THREADOBJ *e = (S4THREADOBJ *)calloc( 1, sizeof(S4THREADOBJ) ) ;
   if ( e == 0 ) return (HANDLE)0 ;
   e->type = 0 ;
   pthread_mutex_init( &e->mutex, 0 ) ;
   pthread_cond_init( &e->cond, 0 ) ;
   e->signaled = initialState ? 1 : 0 ;
   e->manualReset = manualReset ;
   return (HANDLE)(intptr_t)e ;
}

int SetEvent( HANDLE h )
{
   S4THREADOBJ *e = s4obj( h ) ;
   if ( e == 0 ) return 0 ;
   pthread_mutex_lock( &e->mutex ) ;
   e->signaled = 1 ;
   if ( e->manualReset ) pthread_cond_broadcast( &e->cond ) ;
   else pthread_cond_signal( &e->cond ) ;
   pthread_mutex_unlock( &e->mutex ) ;
   return 1 ;
}

int ResetEvent( HANDLE h )
{
   S4THREADOBJ *e = s4obj( h ) ;
   if ( e == 0 ) return 0 ;
   pthread_mutex_lock( &e->mutex ) ;
   e->signaled = 0 ;
   pthread_mutex_unlock( &e->mutex ) ;
   return 1 ;
}

unsigned long WaitForSingleObject( HANDLE h, unsigned long ms )
{
   S4THREADOBJ *e = s4obj( h ) ;
   if ( e == 0 ) return WAIT_TIMEOUT ;

   if ( e->type == 1 )   /* mutex: recursive lock */
   {
      pthread_mutex_lock( &e->mutex ) ;
      return WAIT_OBJECT_0 ;
   }

   if ( e->type == 2 )   /* semaphore */
   {
      pthread_mutex_lock( &e->mutex ) ;
      while ( e->semCount == 0 )
         pthread_cond_wait( &e->cond, &e->mutex ) ;
      e->semCount-- ;
      pthread_mutex_unlock( &e->mutex ) ;
      return WAIT_OBJECT_0 ;
   }

   /* event */
   pthread_mutex_lock( &e->mutex ) ;
   if ( ms == INFINITE )
   {
      while ( e->signaled == 0 )
         pthread_cond_wait( &e->cond, &e->mutex ) ;
   }
   else
   {
      struct timespec ts ;
      clock_gettime( CLOCK_REALTIME, &ts ) ;
      ts.tv_sec += (time_t)( ms / 1000 ) ;
      ts.tv_nsec += (long)( ms % 1000 ) * 1000000L ;
      if ( ts.tv_nsec >= 1000000000L ) { ts.tv_sec++ ; ts.tv_nsec -= 1000000000L ; }
      while ( e->signaled == 0 )
      {
         if ( pthread_cond_timedwait( &e->cond, &e->mutex, &ts ) == ETIMEDOUT && e->signaled == 0 )
         {
            pthread_mutex_unlock( &e->mutex ) ;
            return WAIT_TIMEOUT ;
         }
      }
   }
   if ( e->manualReset == 0 ) e->signaled = 0 ;
   pthread_mutex_unlock( &e->mutex ) ;
   return WAIT_OBJECT_0 ;
}

unsigned long WaitForMultipleObjects( unsigned long count, const HANDLE *handles, int waitAll, unsigned long ms )
{
   /* Minimal: "wait for any" over events (the only use in the engine). */
   if ( count == 0 ) return WAIT_TIMEOUT ;
   for ( ;; )
   {
      unsigned long i ;
      for ( i = 0 ; i < count ; i++ )
      {
         S4THREADOBJ *e = s4obj( handles[i] ) ;
         int signalled = 0 ;
         if ( e == 0 ) continue ;
         pthread_mutex_lock( &e->mutex ) ;
         signalled = e->signaled ;
         pthread_mutex_unlock( &e->mutex ) ;
         if ( signalled ) return i ;
      }
      if ( ms == 0 ) return WAIT_TIMEOUT ;
      Sleep( 1 ) ;
      if ( ms != INFINITE ) ms-- ;
   }
}

int CloseHandle( HANDLE h )
{
   S4THREADOBJ *e = s4obj( h ) ;
   if ( e == 0 ) return 0 ;
   pthread_mutex_destroy( &e->mutex ) ;
   pthread_cond_destroy( &e->cond ) ;
   free( e ) ;
   return 1 ;
}

HANDLE CreateMutex( void *sa, int initialOwner, const char *name )
{
   S4THREADOBJ *m = (S4THREADOBJ *)calloc( 1, sizeof(S4THREADOBJ) ) ;
   pthread_mutexattr_t attr ;
   if ( m == 0 ) return (HANDLE)0 ;
   m->type = 1 ;
   pthread_mutexattr_init( &attr ) ;
   pthread_mutexattr_settype( &attr, PTHREAD_MUTEX_RECURSIVE ) ;
   pthread_mutex_init( &m->mutex, &attr ) ;
   pthread_mutexattr_destroy( &attr ) ;
   pthread_cond_init( &m->cond, 0 ) ;
   if ( initialOwner ) pthread_mutex_lock( &m->mutex ) ;
   return (HANDLE)(intptr_t)m ;
}

int ReleaseMutex( HANDLE h )
{
   S4THREADOBJ *m = s4obj( h ) ;
   if ( m == 0 ) return 0 ;
   pthread_mutex_unlock( &m->mutex ) ;
   return 1 ;
}

HANDLE CreateSemaphore( void *sa, long initialCount, long maxCount, const char *name )
{
   S4THREADOBJ *s = (S4THREADOBJ *)calloc( 1, sizeof(S4THREADOBJ) ) ;
   if ( s == 0 ) return (HANDLE)0 ;
   s->type = 2 ;
   pthread_mutex_init( &s->mutex, 0 ) ;
   pthread_cond_init( &s->cond, 0 ) ;
   s->semCount = initialCount ;
   s->semMax = maxCount ;
   return (HANDLE)(intptr_t)s ;
}

int ReleaseSemaphore( HANDLE h, long releaseCount, long *previousCount )
{
   S4THREADOBJ *s = s4obj( h ) ;
   if ( s == 0 ) return 0 ;
   pthread_mutex_lock( &s->mutex ) ;
   if ( previousCount ) *previousCount = s->semCount ;
   s->semCount += releaseCount ;
   if ( s->semMax > 0 && s->semCount > s->semMax ) s->semCount = s->semMax ;
   pthread_cond_broadcast( &s->cond ) ;
   pthread_mutex_unlock( &s->mutex ) ;
   return 1 ;
}

static void *s4threadTrampoline( void *arg )
{
   S4BEGINTHREAD_FUNC fn = (S4BEGINTHREAD_FUNC)( (void **)arg )[0] ;
   void *data = ( (void **)arg )[1] ;
   free( arg ) ;
   fn( data ) ;
   return 0 ;
}

HANDLE _beginthread( S4BEGINTHREAD_FUNC fn, unsigned stackSize, void *arg )
{
   pthread_t tid ;
   pthread_attr_t attr ;
   void **box = (void **)malloc( 2 * sizeof( void * ) ) ;
   if ( box == 0 ) return (HANDLE)(intptr_t)-1 ;
   box[0] = (void *)fn ;
   box[1] = arg ;

   pthread_attr_init( &attr ) ;
   if ( stackSize > 0 && stackSize < 65536 ) stackSize = 65536 ;   /* Windows passes e.g. 5000 */
   if ( stackSize > 0 ) pthread_attr_setstacksize( &attr, stackSize ) ;
   pthread_attr_setdetachstate( &attr, PTHREAD_CREATE_DETACHED ) ;

   if ( pthread_create( &tid, &attr, s4threadTrampoline, box ) != 0 )
   {
      pthread_attr_destroy( &attr ) ;
      free( box ) ;
      return (HANDLE)(intptr_t)-1 ;
   }
   pthread_attr_destroy( &attr ) ;
   return (HANDLE)(intptr_t)1 ;
}

void _endthread( void )
{
   pthread_exit( 0 ) ;
}

void Sleep( unsigned long ms )
{
   struct timespec ts ;
   ts.tv_sec = (time_t)( ms / 1000 ) ;
   ts.tv_nsec = (long)( ms % 1000 ) * 1000000L ;
   nanosleep( &ts, 0 ) ;
}

unsigned long GetCurrentThreadId( void )
{
   return (unsigned long)(uintptr_t)pthread_self() ;
}

long InterlockedIncrement( long volatile *addend )
{
   return __sync_add_and_fetch( addend, 1 ) ;
}

long InterlockedDecrement( long volatile *addend )
{
   return __sync_sub_and_fetch( addend, 1 ) ;
}

#endif /* S4UNIX */
