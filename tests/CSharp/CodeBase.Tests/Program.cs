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
      Console.WriteLine("CodeBase C# test");
      Console.WriteLine("  process bitness : " + (IntPtr.Size == 8 ? "x64 (64-bit)" : "x86 (32-bit)"));
      Console.WriteLine("  import dll      : " + CodeBaseNative.DllName);
      foreach (System.Diagnostics.ProcessModule m in System.Diagnostics.Process.GetCurrentProcess().Modules)
      {
         if (m.FileName.IndexOf("c4dll", StringComparison.OrdinalIgnoreCase) >= 0)
            Console.WriteLine("  loaded module   : " + m.FileName);
      }

      int rc = 0;
      rc |= TestLifecycle();
      rc |= TestCrud();

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

   private static void DeleteTable(string table)
   {
      foreach (string ext in new string[] { ".dbf", ".cdx", ".fpt", ".idx" })
      {
         try { if (File.Exists(table + ext)) File.Delete(table + ext); }
         catch { }
      }
   }
}
