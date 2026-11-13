/* d4memidx.c   (c)Copyright Sequiter Software Inc., 1988-2001.  All rights reserved. */

/* Ephemeral, per-process in-memory lookup indexes.

   A D4MEMINDEX4 is a sorted array of (key, record-number) pairs for one field.
   It is never written to disk, is attached to a DATA4, and is freed when the
   DATA4 closes.  It supports exact lookups, inclusive range lookups, counts, and
   full sorted traversal without requiring a .cdx tag. */

#include "d4all.h"

#ifdef S4UNIX
   #include <sys/stat.h>
#endif

#ifndef S4OFF_MEMINDEX

#define D4MEMINDEX_KIND_STR 1
#define D4MEMINDEX_KIND_NUM 2

typedef struct D4MEMINDEX4ENTRYSt
{
   char S4PTR *key ;          /* points into keyBuf for string keys, zero for numeric keys */
   double num ;               /* numeric key value */
   long rec ;                 /* 1-based record number */
   unsigned short keyLen ;    /* key length (same for all entries in an index) */
} D4MEMINDEX4ENTRY ;

struct D4MEMINDEX4St
{
   struct D4MEMINDEX4St *next ;
   DATA4 S4PTR *data ;
   FIELD4 S4PTR *field ;
   unsigned long flags ;
   short kind ;
   unsigned short keyLen ;
   int refCount ;
   long entryCount ;
   long entryAlloc ;
   long bytes ;
   long version ;
   long recCount ;
   long fileSize ;
   long fileMtime ;
   char S4PTR *keyBuf ;
   D4MEMINDEX4ENTRY S4PTR *entries ;
   char S4PTR *scratchKey ;
   char S4PTR *scratchKey2 ;
} ;

typedef struct
{
   long recNum ;
   long recNumOld ;
   int bofFlag ;
   int eofFlag ;
   unsigned recWidth ;
   char S4PTR *record ;
   char S4PTR *recordOld ;
} D4MEMINDEX4SAVE ;


static int d4memIndexFieldInfo( FIELD4 *field, short *kind, unsigned short *keyLen )
{
   switch( field->type )
   {
      case r4str :
      case r4charBin :
      case r4log :
      case r4date :
         *kind = D4MEMINDEX_KIND_STR ;
         *keyLen = field->len ;
         return 0 ;
      case r4dateTime :
         *kind = D4MEMINDEX_KIND_STR ;
         *keyLen = 16 ;
         return 0 ;
      case r4dateTimeMilli :
         *kind = D4MEMINDEX_KIND_STR ;
         *keyLen = 20 ;
         return 0 ;
      case r4num :
      case r4numDoub :
      case r4double :
      case r4int :
      case r4float :
      case r4currency :
      case r4dateDoub :
      case r5ui4 :
      case r5i2 :
      case r5ui2 :
         *kind = D4MEMINDEX_KIND_NUM ;
         *keyLen = 0 ;
         return 0 ;
      default :
         return e4fieldType ;
   }
}


static long d4memIndexVersionGet( DATA4 *data )
{
   #if defined( S4WIN32 ) || defined( S4CLIENT )
      return d4versionNumber( data ) ;
   #else
      if ( data->dataFile == 0 )
         return -1L ;
      return (long)data->dataFile->versionNumber ;
   #endif
}


static void d4memIndexFileInfo( DATA4 *data, long *fileSize, long *fileMtime )
{
   *fileSize = 0 ;
   *fileMtime = 0 ;
   if ( data == 0 || data->dataFile == 0 )
      return ;

   #if defined( S4UNIX ) && !defined( S4CLIENT )
      struct stat st ;
      if ( stat( data->dataFile->file.name, &st ) == 0 )
      {
         *fileSize = (long)st.st_size ;
         *fileMtime = (long)st.st_mtime ;
      }
   #elif !defined( S4CLIENT )
      *fileSize = (long)file4len( &data->dataFile->file ) ;
   #endif
}


static int d4memIndexSavePosition( DATA4 *data, D4MEMINDEX4SAVE *save )
{
   c4memset( save, 0, sizeof( D4MEMINDEX4SAVE ) ) ;
   save->recNum = data->recNum ;
   save->recNumOld = data->recNumOld ;
   save->bofFlag = data->bofFlag ;
   save->eofFlag = data->eofFlag ;
   save->recWidth = data->dataFile->recWidth ;

   if ( save->recWidth != 0 )
   {
      save->record = (char *)u4allocFree( data->codeBase, (long)save->recWidth ) ;
      save->recordOld = (char *)u4allocFree( data->codeBase, (long)save->recWidth ) ;
      if ( save->record == 0 || save->recordOld == 0 )
      {
         if ( save->record != 0 )
            u4free( save->record ) ;
         if ( save->recordOld != 0 )
            u4free( save->recordOld ) ;
         return e4memory ;
      }
      if ( data->record != 0 )
         c4memcpy( save->record, data->record, save->recWidth ) ;
      if ( data->recordOld != 0 )
         c4memcpy( save->recordOld, data->recordOld, save->recWidth ) ;
   }
   return 0 ;
}


static void d4memIndexRestorePosition( DATA4 *data, D4MEMINDEX4SAVE *save )
{
   if ( save->recNum > 0 )
   {
      if ( d4goLow( data, save->recNum, 0 ) < 0 )
      {
         if ( save->record != 0 && data->record != 0 )
            c4memcpy( data->record, save->record, save->recWidth ) ;
      }
   }
   else
   {
      data->recNum = save->recNum ;
      data->bofFlag = save->bofFlag ;
      data->eofFlag = save->eofFlag ;
      if ( save->record != 0 && data->record != 0 )
         c4memcpy( data->record, save->record, save->recWidth ) ;
   }

   data->recNumOld = save->recNumOld ;
   if ( save->recordOld != 0 && data->recordOld != 0 )
      c4memcpy( data->recordOld, save->recordOld, save->recWidth ) ;

   if ( save->record != 0 )
      u4free( save->record ) ;
   if ( save->recordOld != 0 )
      u4free( save->recordOld ) ;
}


static long d4memIndexEstimateLow( DATA4 *data, FIELD4 *field, long n )
{
   short kind ;
   unsigned short keyLen ;
   if ( d4memIndexFieldInfo( field, &kind, &keyLen ) < 0 )
      return e4fieldType ;

   long bytes = (long)sizeof( struct D4MEMINDEX4St ) ;
   bytes += n * (long)sizeof( D4MEMINDEX4ENTRY ) ;
   if ( kind == D4MEMINDEX_KIND_STR )
      bytes += n * (long)keyLen + (long)( keyLen + 1 ) * 2L ;
   return bytes ;
}


static int d4memIndexAllocArrays( D4MEMINDEX4 *idx, long n )
{
   idx->entryCount = 0 ;
   idx->entryAlloc = n ;
   idx->entries = 0 ;
   idx->keyBuf = 0 ;
   idx->scratchKey = 0 ;
   idx->scratchKey2 = 0 ;

   if ( n > 0 )
   {
      idx->entries = (D4MEMINDEX4ENTRY *)u4allocFree( idx->data->codeBase, n * (long)sizeof( D4MEMINDEX4ENTRY ) ) ;
      if ( idx->entries == 0 )
         return e4memory ;
   }

   if ( idx->kind == D4MEMINDEX_KIND_STR )
   {
      if ( n > 0 )
      {
         idx->keyBuf = (char *)u4allocFree( idx->data->codeBase, n * (long)idx->keyLen ) ;
         if ( idx->keyBuf == 0 )
            return e4memory ;
      }
      idx->scratchKey = (char *)u4allocFree( idx->data->codeBase, (long)idx->keyLen + 1L ) ;
      idx->scratchKey2 = (char *)u4allocFree( idx->data->codeBase, (long)idx->keyLen + 1L ) ;
      if ( idx->scratchKey == 0 || idx->scratchKey2 == 0 )
         return e4memory ;
   }

   idx->bytes = (long)sizeof( struct D4MEMINDEX4St ) ;
   idx->bytes += n * (long)sizeof( D4MEMINDEX4ENTRY ) ;
   if ( idx->kind == D4MEMINDEX_KIND_STR )
      idx->bytes += n * (long)idx->keyLen + (long)( idx->keyLen + 1 ) * 2L ;
   return 0 ;
}


static void d4memIndexFreeArrays( D4MEMINDEX4 *idx )
{
   if ( idx == 0 )
      return ;
   if ( idx->entries != 0 )
      u4free( idx->entries ) ;
   if ( idx->keyBuf != 0 )
      u4free( idx->keyBuf ) ;
   if ( idx->scratchKey != 0 )
      u4free( idx->scratchKey ) ;
   if ( idx->scratchKey2 != 0 )
      u4free( idx->scratchKey2 ) ;
   idx->entries = 0 ;
   idx->keyBuf = 0 ;
   idx->scratchKey = 0 ;
   idx->scratchKey2 = 0 ;
   idx->entryCount = 0 ;
   idx->entryAlloc = 0 ;
   idx->bytes = 0 ;
}


static D4MEMINDEX4 *d4memIndexAllocStruct( DATA4 *data, FIELD4 *field, unsigned long flags )
{
   CODE4 *c4 = data->codeBase ;
   D4MEMINDEX4 *idx = (D4MEMINDEX4 *)u4allocFree( c4, (long)sizeof( struct D4MEMINDEX4St ) ) ;
   if ( idx == 0 )
   {
      error4( c4, e4memory, E9MI01 ) ;
      return 0 ;
   }
   c4memset( idx, 0, sizeof( struct D4MEMINDEX4St ) ) ;
   idx->data = data ;
   idx->field = field ;
   idx->flags = flags ;
   idx->refCount = 1 ;
   if ( d4memIndexFieldInfo( field, &idx->kind, &idx->keyLen ) < 0 )
   {
      u4free( idx ) ;
      error4( c4, e4fieldType, E9MI01 ) ;
      return 0 ;
   }
   return idx ;
}


static int d4memIndexExtract( D4MEMINDEX4 *idx, long rec, D4MEMINDEX4ENTRY *entry, char *keyDest )
{
   FIELD4 *field = idx->field ;

   entry->rec = rec ;
   entry->keyLen = idx->keyLen ;
   entry->key = keyDest ;
   entry->num = 0.0 ;

   if ( f4null( field ) )
      return 1 ;   /* nulls are not indexed in v1 */

   if ( idx->kind == D4MEMINDEX_KIND_STR )
   {
      char *source ;
      if ( field->type == r4dateTime || field->type == r4dateTimeMilli )
         source = f4dateTime( field ) ;
      else
         source = f4str( field ) ;
      if ( source == 0 )
         return -1 ;
      c4memcpy( keyDest, source, idx->keyLen ) ;
      if ( ( idx->flags & D4MEMINDEX_CASE_INSENSITIVE ) != 0 )
      {
         for ( int i = 0 ; i < (int)idx->keyLen ; i++ )
         {
            unsigned char ch = (unsigned char)keyDest[i] ;
            if ( ch >= 'a' && ch <= 'z' )
               keyDest[i] = (char)( ch - 'a' + 'A' ) ;
         }
      }
   }
   else
   {
      if ( field->type == r5ui4 || field->type == r5i2 || field->type == r5ui2 )
         entry->num = (double)f4long( field ) ;
      else
         entry->num = f4double( field ) ;
   }

   if ( error4code( idx->data->codeBase ) < 0 )
      return -1 ;
   return 0 ;
}


static int d4memIndexCmpStr( const void *a, const void *b )
{
   const D4MEMINDEX4ENTRY *ea = (const D4MEMINDEX4ENTRY *)a ;
   const D4MEMINDEX4ENTRY *eb = (const D4MEMINDEX4ENTRY *)b ;
   int rc = memcmp( ea->key, eb->key, ea->keyLen ) ;
   if ( rc != 0 )
      return rc ;
   if ( ea->rec < eb->rec )
      return -1 ;
   if ( ea->rec > eb->rec )
      return 1 ;
   return 0 ;
}


static int d4memIndexCmpNum( const void *a, const void *b )
{
   const D4MEMINDEX4ENTRY *ea = (const D4MEMINDEX4ENTRY *)a ;
   const D4MEMINDEX4ENTRY *eb = (const D4MEMINDEX4ENTRY *)b ;
   if ( ea->num < eb->num )
      return -1 ;
   if ( ea->num > eb->num )
      return 1 ;
   if ( ea->rec < eb->rec )
      return -1 ;
   if ( ea->rec > eb->rec )
      return 1 ;
   return 0 ;
}


static void d4memIndexSort( D4MEMINDEX4 *idx, D4MEMINDEX4ENTRY *entries, long count )
{
   if ( count > 1 )
      qsort( entries, (size_t)count, sizeof( D4MEMINDEX4ENTRY ), idx->kind == D4MEMINDEX_KIND_STR ? d4memIndexCmpStr : d4memIndexCmpNum ) ;
}


static void d4memIndexMakeKey( D4MEMINDEX4 *idx, const char *key, char *dest )
{
   long i ;
   long len = 0 ;

   if ( key != 0 )
      len = (long)c4strlen( key ) ;

   for ( i = 0 ; i < (long)idx->keyLen ; i++ )
   {
      if ( i < len )
      {
         unsigned char ch = (unsigned char)key[i] ;
         if ( ( idx->flags & D4MEMINDEX_CASE_INSENSITIVE ) != 0 && ch >= 'a' && ch <= 'z' )
            ch = (unsigned char)( ch - 'a' + 'A' ) ;
         dest[i] = (char)ch ;
      }
      else
         dest[i] = ' ' ;
   }
   dest[idx->keyLen] = 0 ;
}


static long d4memIndexLowerStr( D4MEMINDEX4 *idx, const char *key )
{
   long low = 0 ;
   long high = idx->entryCount ;
   while ( low < high )
   {
      long mid = low + ( high - low ) / 2 ;
      if ( memcmp( idx->entries[mid].key, key, idx->keyLen ) < 0 )
         low = mid + 1 ;
      else
         high = mid ;
   }
   return low ;
}


static long d4memIndexUpperStr( D4MEMINDEX4 *idx, const char *key )
{
   long low = 0 ;
   long high = idx->entryCount ;
   while ( low < high )
   {
      long mid = low + ( high - low ) / 2 ;
      if ( memcmp( idx->entries[mid].key, key, idx->keyLen ) <= 0 )
         low = mid + 1 ;
      else
         high = mid ;
   }
   return low ;
}


static long d4memIndexLowerNum( D4MEMINDEX4 *idx, double key )
{
   long low = 0 ;
   long high = idx->entryCount ;
   while ( low < high )
   {
      long mid = low + ( high - low ) / 2 ;
      if ( idx->entries[mid].num < key )
         low = mid + 1 ;
      else
         high = mid ;
   }
   return low ;
}


static long d4memIndexUpperNum( D4MEMINDEX4 *idx, double key )
{
   long low = 0 ;
   long high = idx->entryCount ;
   while ( low < high )
   {
      long mid = low + ( high - low ) / 2 ;
      if ( idx->entries[mid].num <= key )
         low = mid + 1 ;
      else
         high = mid ;
   }
   return low ;
}


static long d4memIndexCopyRange( D4MEMINDEX4 *idx, long low, long high, long *recNos, long maxRecs )
{
   long total = high - low ;
   if ( total < 0 )
      total = 0 ;

   if ( recNos != 0 && maxRecs > 0 )
   {
      long count = total < maxRecs ? total : maxRecs ;
      long i ;
      for ( i = 0 ; i < count ; i++ )
         recNos[i] = idx->entries[low + i].rec ;
   }
   return total ;
}


static int d4memIndexCheckStale( D4MEMINDEX4 *idx )
{
   if ( idx == 0 )
      return e4parm_null ;
   if ( idx->data == 0 || idx->data->dataFile == 0 )
      return 1 ;

   long version = d4memIndexVersionGet( idx->data ) ;
   if ( version < 0 )
      return (int)version ;
   if ( version != idx->version )
      return 1 ;

   if ( d4recCount( idx->data ) != idx->recCount )
      return 1 ;

   if ( idx->kind == D4MEMINDEX_KIND_STR && idx->field->type != r4dateTime && idx->field->type != r4dateTimeMilli )
      if ( (unsigned short)idx->field->len != idx->keyLen )
         return 1 ;

   long fileSize, fileMtime ;
   d4memIndexFileInfo( idx->data, &fileSize, &fileMtime ) ;
   if ( fileSize != 0 && fileSize != idx->fileSize )
      return 1 ;
   if ( fileMtime != 0 && fileMtime != idx->fileMtime )
      return 1 ;

   return 0 ;
}


static void d4memIndexSetVersion( D4MEMINDEX4 *idx, long version, long recCount )
{
   idx->version = version ;
   idx->recCount = recCount ;
   d4memIndexFileInfo( idx->data, &idx->fileSize, &idx->fileMtime ) ;
}


int S4FUNCTION code4memIndexEnabled( CODE4 *c4 )
{
   if ( c4 == 0 )
      return 0 ;
   return c4->memIndexEnabled ;
}


int S4FUNCTION code4memIndexEnabledSet( CODE4 *c4, int enabled )
{
   if ( c4 == 0 )
      return error4( 0, e4parm_null, E9MI05 ) ;
   c4->memIndexEnabled = enabled ? 1 : 0 ;
   return 0 ;
}


int S4FUNCTION code4memIndexLimitSet( CODE4 *c4, long maxBytes, int maxIndexes )
{
   if ( c4 == 0 )
      return error4( 0, e4parm_null, E9MI05 ) ;
   if ( maxBytes < 0 || maxIndexes < 0 )
      return error4( c4, e4parm, E9MI05 ) ;
   c4->memIndexMaxBytes = maxBytes ;
   c4->memIndexMaxCount = maxIndexes ;
   return 0 ;
}


int S4FUNCTION code4memIndexLimitGet( CODE4 *c4, long *maxBytes, int *maxIndexes )
{
   if ( c4 == 0 )
      return error4( 0, e4parm_null, E9MI05 ) ;
   if ( maxBytes != 0 )
      *maxBytes = c4->memIndexMaxBytes ;
   if ( maxIndexes != 0 )
      *maxIndexes = c4->memIndexMaxCount ;
   return 0 ;
}


int S4FUNCTION code4memIndexAutoRefresh( CODE4 *c4 )
{
   if ( c4 == 0 )
      return 0 ;
   return c4->memIndexAutoRefresh ;
}


int S4FUNCTION code4memIndexAutoRefreshSet( CODE4 *c4, int enabled )
{
   if ( c4 == 0 )
      return error4( 0, e4parm_null, E9MI05 ) ;
   c4->memIndexAutoRefresh = enabled ? 1 : 0 ;
   return 0 ;
}


long S4FUNCTION code4memIndexMemoryUsed( CODE4 *c4 )
{
   if ( c4 == 0 )
      return 0 ;
   return c4->memIndexBytesUsed ;
}


long S4FUNCTION d4memIndexEstimate( DATA4 *data, const char *fieldName, unsigned long flags )
{
   if ( data == 0 || fieldName == 0 )
      return error4( data == 0 ? 0 : data->codeBase, e4parm_null, E9MI04 ) ;
   if ( ( flags & ~( D4MEMINDEX_INCLUDE_DELETED | D4MEMINDEX_CASE_INSENSITIVE | D4MEMINDEX_CHECK_STALE ) ) != 0 )
      return error4( data->codeBase, e4parm, E9MI04 ) ;

   FIELD4 *field = d4field( data, fieldName ) ;
   if ( field == 0 )
      return error4code( data->codeBase ) < 0 ? error4code( data->codeBase ) : e4fieldName ;

   long n = d4recCount( data ) ;
   if ( n < 0 )
      return n ;

   return d4memIndexEstimateLow( data, field, n ) ;
}


static int d4memIndexBuildMany( DATA4 *data, D4MEMINDEX4 **indexes, int indexCount, long n, unsigned long flags )
{
   CODE4 *c4 = data->codeBase ;
   int i ;
   int rc = 0 ;
   long startVersion = d4memIndexVersionGet( data ) ;
   D4MEMINDEX4SAVE save ;

   if ( startVersion < 0 )
      return (int)startVersion ;

   #ifndef S4OFF_WRITE
      if ( data->recordChanged )
      {
         rc = d4updateRecord( data, 0, 1 ) ;
         if ( rc != 0 )
            return rc ;
         startVersion = d4memIndexVersionGet( data ) ;
         if ( startVersion < 0 )
            return (int)startVersion ;
      }
   #endif

   rc = d4memIndexSavePosition( data, &save ) ;
   if ( rc != 0 )
      return rc ;

   for ( int attempt = 0 ; attempt < 2 ; attempt++ )
   {
      int aborted = 0 ;

      for ( i = 0 ; i < indexCount ; i++ )
         if ( indexes[i] != 0 )
            indexes[i]->entryCount = 0 ;

      for ( long rec = 1 ; rec <= n ; rec++ )
      {
         rc = d4goLow( data, rec, 0 ) ;
         if ( rc < 0 )
         {
            aborted = 1 ;
            break ;
         }
         if ( ( flags & D4MEMINDEX_INCLUDE_DELETED ) == 0 && d4deleted( data ) )
            continue ;

         for ( i = 0 ; i < indexCount ; i++ )
         {
            D4MEMINDEX4 *idx = indexes[i] ;
            if ( idx == 0 )
               continue ;
            char *dest = idx->kind == D4MEMINDEX_KIND_STR ? idx->keyBuf + idx->entryCount * (long)idx->keyLen : 0 ;
            int er = d4memIndexExtract( idx, rec, &idx->entries[idx->entryCount], dest ) ;
            if ( er < 0 )
            {
               rc = error4code( c4 ) < 0 ? error4code( c4 ) : e4data ;
               aborted = 1 ;
               break ;
            }
            if ( er == 0 )
               idx->entryCount++ ;
         }
         if ( aborted )
            break ;
      }

      d4memIndexRestorePosition( data, &save ) ;

      if ( aborted )
         return rc ;

      long endVersion = d4memIndexVersionGet( data ) ;
      if ( endVersion < 0 )
         return (int)endVersion ;
      if ( endVersion != startVersion )
      {
         if ( attempt == 0 )
            continue ;
         {
            error4set( c4, e4data ) ;
            error4set2( c4, E9MI01 ) ;
            return e4data ;
         }
      }

      for ( i = 0 ; i < indexCount ; i++ )
         if ( indexes[i] != 0 )
            d4memIndexSort( indexes[i], indexes[i]->entries, indexes[i]->entryCount ) ;

      for ( i = 0 ; i < indexCount ; i++ )
         if ( indexes[i] != 0 )
            d4memIndexSetVersion( indexes[i], endVersion, n ) ;

      return 0 ;
   }

   return e4data ;
}


int S4FUNCTION d4memIndexGetMany( DATA4 *data, const char * const *fieldNames, int fieldCount, unsigned long flags, D4MEMINDEX4 **outIndexes )
{
   if ( data == 0 || fieldNames == 0 || outIndexes == 0 )
      return error4( data == 0 ? 0 : data->codeBase, e4parm_null, E9MI06 ) ;
   if ( fieldCount <= 0 || fieldCount > 64 )
      return error4( data->codeBase, e4parm, E9MI06 ) ;
   if ( ( flags & ~( D4MEMINDEX_INCLUDE_DELETED | D4MEMINDEX_CASE_INSENSITIVE | D4MEMINDEX_CHECK_STALE ) ) != 0 )
      return error4( data->codeBase, e4parm, E9MI06 ) ;
   if ( data->codeBase->memIndexEnabled == 0 )
   {
      error4set( data->codeBase, e4notSupported ) ;
      error4set2( data->codeBase, E9MI05 ) ;
      return e4notSupported ;
   }

   CODE4 *c4 = data->codeBase ;
   D4MEMINDEX4 **newIndexes = (D4MEMINDEX4 **)u4allocFree( c4, (long)fieldCount * (long)sizeof( D4MEMINDEX4 * ) ) ;
   char *isNew = (char *)u4allocFree( c4, (long)fieldCount ) ;
   if ( newIndexes == 0 || isNew == 0 )
   {
      if ( newIndexes != 0 )
         u4free( newIndexes ) ;
      if ( isNew != 0 )
         u4free( isNew ) ;
      return error4( c4, e4memory, E9MI06 ) ;
   }
   c4memset( newIndexes, 0, (long)fieldCount * (long)sizeof( D4MEMINDEX4 * ) ) ;
   c4memset( isNew, 0, (long)fieldCount ) ;

   int newCount = 0 ;
   int rc = 0 ;
   int i ;
   for ( i = 0 ; i < fieldCount ; i++ )
   {
      FIELD4 *field = d4field( data, fieldNames[i] ) ;
      if ( field == 0 )
      {
         rc = error4code( c4 ) < 0 ? error4code( c4 ) : e4fieldName ;
         break ;
      }

      D4MEMINDEX4 *existing = 0 ;
      for ( D4MEMINDEX4 *scan = data->memIndexes ; scan != 0 ; scan = scan->next )
      {
         if ( scan->field == field && scan->flags == flags )
         {
            existing = scan ;
            break ;
         }
      }

      if ( existing != 0 )
      {
         outIndexes[i] = existing ;
         isNew[i] = 0 ;
         newIndexes[i] = 0 ;
      }
      else
      {
         D4MEMINDEX4 *idx = d4memIndexAllocStruct( data, field, flags ) ;
         if ( idx == 0 )
         {
            rc = error4code( c4 ) < 0 ? error4code( c4 ) : e4memory ;
            break ;
         }
         outIndexes[i] = idx ;
         newIndexes[i] = idx ;
         isNew[i] = 1 ;
         newCount++ ;
      }
   }

   if ( rc != 0 )
   {
      for ( i = 0 ; i < fieldCount ; i++ )
         if ( isNew[i] && newIndexes[i] != 0 )
         {
            d4memIndexFreeArrays( newIndexes[i] ) ;
            u4free( newIndexes[i] ) ;
         }
      u4free( newIndexes ) ;
      u4free( isNew ) ;
      return rc ;
   }

   if ( newCount == 0 )
   {
      for ( i = 0 ; i < fieldCount ; i++ )
         outIndexes[i]->refCount++ ;
      u4free( newIndexes ) ;
      u4free( isNew ) ;
      return 0 ;
   }

   if ( c4->memIndexMaxCount > 0 && c4->memIndexCount + newCount > c4->memIndexMaxCount )
   {
      for ( i = 0 ; i < fieldCount ; i++ )
         if ( isNew[i] && newIndexes[i] != 0 )
         {
            d4memIndexFreeArrays( newIndexes[i] ) ;
            u4free( newIndexes[i] ) ;
         }
      u4free( newIndexes ) ;
      u4free( isNew ) ;
      error4set( c4, e4memory ) ;
      error4set2( c4, E9MI05 ) ;
      return e4memory ;
   }

   long n = d4recCount( data ) ;
   if ( n < 0 )
   {
      for ( i = 0 ; i < fieldCount ; i++ )
         if ( isNew[i] && newIndexes[i] != 0 )
         {
            d4memIndexFreeArrays( newIndexes[i] ) ;
            u4free( newIndexes[i] ) ;
         }
      u4free( newIndexes ) ;
      u4free( isNew ) ;
      return (int)n ;
   }

   long addBytes = 0 ;
   for ( i = 0 ; i < fieldCount ; i++ )
      if ( isNew[i] && newIndexes[i] != 0 )
      {
         rc = d4memIndexAllocArrays( newIndexes[i], n ) ;
         if ( rc != 0 )
            break ;
         addBytes += newIndexes[i]->bytes ;
      }

   if ( rc == 0 && c4->memIndexMaxBytes > 0 && c4->memIndexBytesUsed + addBytes > c4->memIndexMaxBytes )
   {
      error4set( c4, e4memory ) ;
      error4set2( c4, E9MI05 ) ;
      rc = e4memory ;
   }

   if ( rc == 0 )
      rc = d4memIndexBuildMany( data, newIndexes, fieldCount, n, flags ) ;

   if ( rc != 0 )
   {
      for ( i = 0 ; i < fieldCount ; i++ )
         if ( isNew[i] && newIndexes[i] != 0 )
         {
            d4memIndexFreeArrays( newIndexes[i] ) ;
            u4free( newIndexes[i] ) ;
         }
      u4free( newIndexes ) ;
      u4free( isNew ) ;
      return rc ;
   }

   /* success: attach new indexes and reference existing ones */
   for ( i = 0 ; i < fieldCount ; i++ )
   {
      if ( isNew[i] )
      {
         D4MEMINDEX4 *idx = newIndexes[i] ;
         idx->next = data->memIndexes ;
         data->memIndexes = idx ;
         c4->memIndexCount++ ;
         c4->memIndexBytesUsed += idx->bytes ;
      }
      else
         outIndexes[i]->refCount++ ;
   }

   u4free( newIndexes ) ;
   u4free( isNew ) ;
   return 0 ;
}


D4MEMINDEX4 *S4FUNCTION d4memIndexGet( DATA4 *data, const char *fieldName, unsigned long flags )
{
   D4MEMINDEX4 *idx = 0 ;
   if ( d4memIndexGetMany( data, &fieldName, 1, flags, &idx ) < 0 )
      return 0 ;
   return idx ;
}


int S4FUNCTION d4memIndexFree( D4MEMINDEX4 *idx )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI01 ) ;
   if ( idx->refCount > 1 )
   {
      idx->refCount-- ;
      return 0 ;
   }

   DATA4 *data = idx->data ;
   CODE4 *c4 = data != 0 ? data->codeBase : 0 ;

   if ( data != 0 )
   {
      D4MEMINDEX4 *prev = 0 ;
      D4MEMINDEX4 *scan = data->memIndexes ;
      while ( scan != 0 && scan != idx )
      {
         prev = scan ;
         scan = scan->next ;
      }
      if ( scan == idx )
      {
         if ( prev == 0 )
            data->memIndexes = idx->next ;
         else
            prev->next = idx->next ;
      }
   }

   if ( c4 != 0 )
   {
      c4->memIndexBytesUsed -= idx->bytes ;
      if ( c4->memIndexBytesUsed < 0 )
         c4->memIndexBytesUsed = 0 ;
      if ( c4->memIndexCount > 0 )
         c4->memIndexCount-- ;
   }

   d4memIndexFreeArrays( idx ) ;
   u4free( idx ) ;
   return 0 ;
}


int S4FUNCTION d4memIndexFreeAll( DATA4 *data )
{
   if ( data == 0 )
      return error4( 0, e4parm_null, E9MI01 ) ;

   D4MEMINDEX4 *idx = data->memIndexes ;
   while ( idx != 0 )
   {
      D4MEMINDEX4 *next = idx->next ;
      idx->refCount = 1 ;
      d4memIndexFree( idx ) ;
      idx = next ;
   }
   data->memIndexes = 0 ;
   return 0 ;
}


int S4FUNCTION d4memIndexIsStale( D4MEMINDEX4 *idx )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI02 ) ;
   return d4memIndexCheckStale( idx ) ;
}


int S4FUNCTION d4memIndexRefreshIfStale( D4MEMINDEX4 *idx )
{
   int stale = d4memIndexIsStale( idx ) ;
   if ( stale < 0 )
      return stale ;
   if ( stale == 0 )
      return 0 ;
   int rc = d4memIndexRefresh( idx ) ;
   return rc < 0 ? rc : 1 ;
}


int S4FUNCTION d4memIndexRefresh( D4MEMINDEX4 *idx )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI03 ) ;

   DATA4 *data = idx->data ;
   CODE4 *c4 = data->codeBase ;
   long n = d4recCount( data ) ;
   if ( n < 0 )
      return (int)n ;

   D4MEMINDEX4 temp ;
   c4memset( &temp, 0, sizeof( temp ) ) ;
   temp.data = data ;
   temp.field = idx->field ;
   temp.flags = idx->flags ;
   temp.kind = idx->kind ;
   temp.keyLen = idx->keyLen ;
   temp.refCount = 1 ;

   int rc = d4memIndexAllocArrays( &temp, n ) ;
   if ( rc != 0 )
   {
      d4memIndexFreeArrays( &temp ) ;
      return rc ;
   }

   long oldBytes = idx->bytes ;
   if ( c4->memIndexMaxBytes > 0 && c4->memIndexBytesUsed - oldBytes + temp.bytes > c4->memIndexMaxBytes )
   {
      d4memIndexFreeArrays( &temp ) ;
      error4set( c4, e4memory ) ;
      error4set2( c4, E9MI05 ) ;
      return e4memory ;
   }

   D4MEMINDEX4 *tempPtr = &temp ;
   rc = d4memIndexBuildMany( data, &tempPtr, 1, n, temp.flags ) ;
   if ( rc != 0 )
   {
      d4memIndexFreeArrays( &temp ) ;
      return rc ;
   }

   d4memIndexFreeArrays( idx ) ;
   idx->entries = temp.entries ;
   idx->keyBuf = temp.keyBuf ;
   idx->scratchKey = temp.scratchKey ;
   idx->scratchKey2 = temp.scratchKey2 ;
   idx->entryCount = temp.entryCount ;
   idx->entryAlloc = temp.entryAlloc ;
   idx->bytes = temp.bytes ;
   idx->version = temp.version ;
   idx->recCount = temp.recCount ;
   idx->fileSize = temp.fileSize ;
   idx->fileMtime = temp.fileMtime ;

   c4->memIndexBytesUsed += idx->bytes - oldBytes ;
   return 0 ;
}


long S4FUNCTION d4memIndexMemoryUsed( D4MEMINDEX4 *idx )
{
   if ( idx == 0 )
      return 0 ;
   return idx->bytes ;
}


static int d4memIndexCheckStaleForFind( D4MEMINDEX4 *idx )
{
   if ( ( idx->flags & D4MEMINDEX_CHECK_STALE ) == 0 )
      return 0 ;
   int stale = d4memIndexIsStale( idx ) ;
   if ( stale < 0 )
      return stale ;
   if ( stale == 0 )
      return 0 ;
   if ( idx->data->codeBase->memIndexAutoRefresh == 0 )
      return e4data ;
   int rc = d4memIndexRefresh( idx ) ;
   return rc < 0 ? rc : 0 ;
}


long S4FUNCTION d4memIndexFind( D4MEMINDEX4 *idx, const char *key, long *recNos, long maxRecs )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI02 ) ;
   int rc = d4memIndexCheckStaleForFind( idx ) ;
   if ( rc < 0 )
      return rc ;
   if ( idx->kind != D4MEMINDEX_KIND_STR )
      return error4( idx->data->codeBase, e4parm, E9MI02 ) ;
   if ( key == 0 )
      return 0 ;

   d4memIndexMakeKey( idx, key, idx->scratchKey ) ;
   long low = d4memIndexLowerStr( idx, idx->scratchKey ) ;
   long high = d4memIndexUpperStr( idx, idx->scratchKey ) ;
   return d4memIndexCopyRange( idx, low, high, recNos, maxRecs ) ;
}


long S4FUNCTION d4memIndexFindDouble( D4MEMINDEX4 *idx, double key, long *recNos, long maxRecs )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI02 ) ;
   int rc = d4memIndexCheckStaleForFind( idx ) ;
   if ( rc < 0 )
      return rc ;
   if ( idx->kind != D4MEMINDEX_KIND_NUM )
      return error4( idx->data->codeBase, e4parm, E9MI02 ) ;

   long low = d4memIndexLowerNum( idx, key ) ;
   long high = d4memIndexUpperNum( idx, key ) ;
   return d4memIndexCopyRange( idx, low, high, recNos, maxRecs ) ;
}


long S4FUNCTION d4memIndexFindRange( D4MEMINDEX4 *idx, const char *from, const char *to, long *recNos, long maxRecs )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI02 ) ;
   int rc = d4memIndexCheckStaleForFind( idx ) ;
   if ( rc < 0 )
      return rc ;
   if ( idx->kind != D4MEMINDEX_KIND_STR )
      return error4( idx->data->codeBase, e4parm, E9MI02 ) ;

   long low, high ;
   if ( from == 0 )
      low = 0 ;
   else
   {
      d4memIndexMakeKey( idx, from, idx->scratchKey ) ;
      low = d4memIndexLowerStr( idx, idx->scratchKey ) ;
   }
   if ( to == 0 )
      high = idx->entryCount ;
   else
   {
      d4memIndexMakeKey( idx, to, idx->scratchKey2 ) ;
      high = d4memIndexUpperStr( idx, idx->scratchKey2 ) ;
   }
   if ( high < low )
      high = low ;
   return d4memIndexCopyRange( idx, low, high, recNos, maxRecs ) ;
}


long S4FUNCTION d4memIndexFindRangeDouble( D4MEMINDEX4 *idx, double from, double to, long *recNos, long maxRecs )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI02 ) ;
   int rc = d4memIndexCheckStaleForFind( idx ) ;
   if ( rc < 0 )
      return rc ;
   if ( idx->kind != D4MEMINDEX_KIND_NUM )
      return error4( idx->data->codeBase, e4parm, E9MI02 ) ;

   long low = d4memIndexLowerNum( idx, from ) ;
   long high = d4memIndexUpperNum( idx, to ) ;
   if ( high < low )
      high = low ;
   return d4memIndexCopyRange( idx, low, high, recNos, maxRecs ) ;
}


long S4FUNCTION d4memIndexCount( D4MEMINDEX4 *idx, const char *key )
{
   return d4memIndexFind( idx, key, 0, 0 ) ;
}


long S4FUNCTION d4memIndexAll( D4MEMINDEX4 *idx, long *recNos, long maxRecs )
{
   if ( idx == 0 )
      return error4( 0, e4parm_null, E9MI02 ) ;
   int rc = d4memIndexCheckStaleForFind( idx ) ;
   if ( rc < 0 )
      return rc ;
   return d4memIndexCopyRange( idx, 0, idx->entryCount, recNos, maxRecs ) ;
}

#endif /* S4OFF_MEMINDEX */
