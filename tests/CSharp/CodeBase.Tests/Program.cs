using System;
using System.IO;
using CodeBase;

/*
 * CodeBase.Tests.CSharp - runnable console test for the CodeBase native engine.
 *
 * Verifies that the engine works when this assembly is compiled for the proper bitness:
 *   x86  -> c4dll.dll   (handles are 4-byte)
 *   x64  -> c4dll64.dll (handles are 8-byte)
 *
 * Exercises: process bitness, the loaded native module, a lifecycle loop (init/dispose), and a
 * full CRUD round-trip (create table + tag, append records, reopen, read/verify, seek by tag).
 * Exit code 0 = PASS, non-zero = FAIL.
 */
class Program
{
   static int Main(string[] args)
   {
#if X64
      const bool expect64 = true;
#else
      const bool expect64 = false;
#endif
      bool is64 = IntPtr.Size == 8;

      Console.WriteLine("CodeBase C# test");
      Console.WriteLine("  process bitness : " + (is64 ? "x64 (64-bit)" : "x86 (32-bit)") + "  (expected " + (expect64 ? "x64" : "x86") + ")");
      Console.WriteLine("  import dll      : " + CodeBaseNative.DllName);

      // Fail if the project was not compiled for the expected bitness. A process can only load a
      // native DLL of its own bitness, so this also guarantees the engine matched.
      if (is64 != expect64)
      {
         Console.WriteLine("  bitness   : FAIL (expected " + (expect64 ? "x64" : "x86") + " but running " + (is64 ? "x64" : "x86") + ")");
         return 2;
      }

      bool moduleSeen = false;
      string expectedModule = expect64 ? "c4dll64.dll" : "c4dll.dll";

      int rc = 0;
      rc |= TestLifecycle();
      rc |= TestCrud();
      rc |= TestMemIndex();

      // The engine is loaded lazily on the first P/Invoke, so check the module after the tests.
      foreach (System.Diagnostics.ProcessModule m in System.Diagnostics.Process.GetCurrentProcess().Modules)
      {
         if (m.FileName.IndexOf("c4dll", StringComparison.OrdinalIgnoreCase) >= 0)
         {
            moduleSeen = true;
            Console.WriteLine("  loaded module   : " + m.FileName);
            if (!m.ModuleName.Equals(expectedModule, StringComparison.OrdinalIgnoreCase))
            {
               Console.WriteLine("  module    : FAIL (loaded " + m.ModuleName + ", expected " + expectedModule + ")");
               rc = 2;
            }
         }
      }
      if (!moduleSeen)
      {
         Console.WriteLine("  module    : FAIL (no c4dll module loaded)");
         rc = 2;
      }

      Console.WriteLine(rc == 0 ? "PASS" : "FAIL");
      return rc;
   }

   private static bool haveCount = true;

   private static uint Live()
   {
      return haveCount ? Code4.numCodeBaseInstances() : 0u;
   }

   private static int TestLifecycle()
   {
      const int cycles = 5000;
      try
      {
         // code4numCodeBaseCount() is a diagnostic added with the lifecycle fix; older engines
         // may not export it, in which case we still run the loop but skip the count assertions.
         try { Code4.numCodeBaseInstances(); }
         catch (EntryPointNotFoundException)
         {
            haveCount = false;
            Console.WriteLine("  lifecycle : NOTE code4numCodeBaseCount not exported; count checks disabled");
         }

         if (haveCount && Live() != 0)
         {
            Console.WriteLine("  lifecycle : FAIL (initial live count = " + Live() + ")");
            return 1;
         }

         for (int i = 0; i < cycles; i++)
         {
            using (Code4 cb = new Code4())
            {
               cb.errOff = 1;   // silent: return codes only
               if (haveCount && Live() != 1)
               {
                  Console.WriteLine("  lifecycle : FAIL (live count = " + Live() + " after init at " + i + ")");
                  return 1;
               }
            }
            if (haveCount && Live() != 0)
            {
               Console.WriteLine("  lifecycle : FAIL (live count = " + Live() + " after dispose at " + i + ")");
               return 1;
            }
         }

         Console.WriteLine("  lifecycle : " + cycles + " init/dispose cycles OK");
         return 0;
      }
      catch (Exception ex)
      {
         Console.WriteLine("  lifecycle : EXCEPTION " + ex.GetType().Name + ": " + ex.Message);
         return 1;
      }
   }

   private static int TestCrud()
   {
      string dir = Path.Combine(Path.GetTempPath(), "codebase_tests");
      Directory.CreateDirectory(dir);
      string table = Path.Combine(dir, "CRUDTEST");
      DeleteTable(table);

      Code4 cb = null;
      try
      {
         cb = new Code4();
         cb.compatibility = 30;
         cb.safety = 0;
         cb.errOff = 1;
         cb.readOnly = 0;

         // ---- create the table + one tag ----
         Field4info fields = new Field4info(ref cb);
         fields.add("STR", Code4.r4str, 10, 0, 0);
         fields.add("NUM", Code4.r4num, 5, 0, 0);

         Tag4info tags = new Tag4info(cb);
         tags.add("STR", "STR", "", 0, 0);

         Data4 data = new Data4();
         data.create(ref cb, table, ref fields, ref tags);
         if (data.isValid() == 0)
         {
            Console.WriteLine("  crud      : FAIL (d4create) " + cb.errorText(cb.errorCode));
            return 1;
         }

         // ---- append 5 records ----
         data.appendStart(0);
         for (int i = 1; i <= 5; i++)
         {
            data.appendBlank();
            new Field4(data, "STR").assign("REC" + i);
            new Field4(data, "NUM").assign((100 + i).ToString());
         }
         data.close();

         // ---- reopen and verify ----
         Data4 d2 = new Data4();
         d2.open(ref cb, table);
         if (d2.isValid() == 0)
         {
            Console.WriteLine("  crud      : FAIL (d4open) " + cb.errorText(cb.errorCode));
            return 1;
         }
         if (d2.recCount() != 5)
         {
            Console.WriteLine("  crud      : FAIL (recCount = " + d2.recCount() + ", expected 5)");
            d2.close();
            return 1;
         }
         for (int i = 1; i <= 5; i++)
         {
            d2.go(i);
            string s = new Field4(d2, "STR").str().Trim();
            string n = new Field4(d2, "NUM").str().Trim();
            if (s != "REC" + i || n != (100 + i).ToString())
            {
               Console.WriteLine("  crud      : FAIL (record " + i + " = '" + s + "'/'" + n + "')");
               d2.close();
               return 1;
            }
         }

         // ---- seek by the STR tag ----
         int seekRc = d2.seek("REC3");
         if (seekRc != Code4.r4success || new Field4(d2, "STR").str().Trim() != "REC3")
         {
            Console.WriteLine("  crud      : FAIL (seek REC3 rc=" + seekRc + ")");
            d2.close();
            return 1;
         }
         d2.close();

         Console.WriteLine("  crud      : create/append/read/seek OK");
         return 0;
      }
      catch (Exception ex)
      {
         Console.WriteLine("  crud      : EXCEPTION " + ex.GetType().Name + ": " + ex.Message);
         return 1;
      }
      finally
      {
         if (cb != null) cb.Dispose();
         DeleteTable(table);
      }
   }

   private static int TestMemIndex()
   {
      string dir = Path.Combine(Path.GetTempPath(), "codebase_tests");
      Directory.CreateDirectory(dir);
      string table = Path.Combine(dir, "MEMIDXTEST");
      DeleteTable(table);

      Code4 cb = null;
      try
      {
         cb = new Code4();
         cb.compatibility = 30;
         cb.safety = 0;
         cb.errOff = 1;
         cb.readOnly = 0;
         cb.memIndexLimitSet(16 * 1024 * 1024, 8);
         cb.memIndexAutoRefresh = true;

         Field4info fields = new Field4info(ref cb);
         fields.add("PROGRAM_ID", Code4.r4str, 10, 0, 0);
         fields.add("ADATE", Code4.r4date, 8, 0, 0);
         fields.add("AMT", Code4.r4num, 8, 2, 0);

         Data4 data = new Data4();
         data.create(ref cb, table, ref fields);
         if (data.isValid() == 0)
         {
            Console.WriteLine("  memindex  : FAIL (d4create) " + cb.errorText(cb.errorCode));
            return 1;
         }

         const int N = 1000;
         data.appendStart(0);
         for (int i = 0; i < N; i++)
         {
            data.appendBlank();
            new Field4(data, "PROGRAM_ID").assign("P" + (i % 10));
            new Field4(data, "ADATE").assign("202601" + ((i % 28) + 1).ToString("00"));
            new Field4(data, "AMT").assign(i.ToString());
         }
         data.flush();
         data.close();

         Data4 d2 = new Data4();
         d2.open(ref cb, table);
         if (d2.isValid() == 0)
         {
            Console.WriteLine("  memindex  : FAIL (d4open) " + cb.errorText(cb.errorCode));
            return 1;
         }

         MemIndex4[] indexes = d2.MemIndexMany(new string[] { "ADATE", "PROGRAM_ID" }, Code4.D4MEMINDEX_CHECK_STALE);
         MemIndex4 byDate = indexes[0];
         MemIndex4 byProgram = indexes[1];
         int[] hits = byDate.Find("20260115");
         if (hits.Length != 36)
         {
            Console.WriteLine("  memindex  : FAIL (date hits = " + hits.Length + ", expected 36)");
            return 1;
         }

         int[] range = byDate.FindRange("20260105", "20260110");
         if (range.Length != 6 * 36)
         {
            Console.WriteLine("  memindex  : FAIL (range hits = " + range.Length + ", expected 216)");
            return 1;
         }

         int[] all = byDate.All();
         if (all.Length != N)
         {
            Console.WriteLine("  memindex  : FAIL (all = " + all.Length + ", expected " + N + ")");
            return 1;
         }

         if (byProgram.Find("P3").Length != 100)
         {
            Console.WriteLine("  memindex  : FAIL (P3 hits = " + byProgram.Find("P3").Length + ", expected 100)");
            return 1;
         }

         // stale detection / auto refresh
         d2.appendStart(0);
         d2.appendBlank();
         new Field4(d2, "PROGRAM_ID").assign("P3");
         new Field4(d2, "ADATE").assign("20260115");
         new Field4(d2, "AMT").assign("1");
         d2.flush();

         if (!byDate.IsStale())
         {
            Console.WriteLine("  memindex  : FAIL (index not marked stale after append)");
            return 1;
         }
         int[] after = byDate.Find("20260115");
         if (after.Length != 37)
         {
            Console.WriteLine("  memindex  : FAIL (auto-refresh hits = " + after.Length + ", expected 37)");
            return 1;
         }

         byDate.Free();
         byProgram.Free();
         d2.close();
         Console.WriteLine("  memindex  : build/find/range/all/stale OK");
         return 0;
      }
      catch (Exception ex)
      {
         Console.WriteLine("  memindex  : EXCEPTION " + ex.GetType().Name + ": " + ex.Message);
         return 1;
      }
      finally
      {
         if (cb != null) cb.Dispose();
         DeleteTable(table);
      }
   }

   private static void DeleteTable(string table)
   {
      foreach (string ext in new string[] { ".dbf", ".cdx", ".fpt", ".idx" })
      {
         try { if (File.Exists(table + ext)) File.Delete(table + ext); }
         catch { }
      }
   }
}
