using System;
using System.IO;
using System.Runtime.InteropServices;

/*
 * LifecycleFileIoTest - file-I/O variant of the CODE4 lifecycle regression test.
 *
 * Where LifecycleTest only starts/stops the engine, this test also creates a real DBF table
 * (which routes writes through the delayed-write path) and closes it, then releases the CODE4.
 * It exercises the delay-write / advance-read worker threads under repeated init/undo, which is
 * exactly the scenario that used to hang or crash because DllMain re-initialized critical4code
 * on every thread attach/detach.
 *
 * Build:
 *   32-bit: csc -nologo -platform:x86 -out:LifecycleFileIoTest_x86.exe LifecycleFileIoTest.cs
 *   64-bit: csc -nologo -platform:x64 -out:LifecycleFileIoTest_x64.exe LifecycleFileIoTest.cs
 *
 * Run:
 *   LifecycleFileIoTest_x86.exe c4dll.dll    [iterations]   (default 5000)
 *   LifecycleFileIoTest_x64.exe c4dll64.dll  [iterations]
 */

class LifecycleFileIoTest
{
   [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Ansi)]
   private static extern IntPtr LoadLibrary(string lpFileName);

   [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Ansi)]
   private static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

   [DllImport("kernel32", SetLastError = true)]
   private static extern bool FreeLibrary(IntPtr hModule);

   // Layout of the C FIELD4INFO structure passed to d4create().
   [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
   private struct FIELD4INFO
   {
      [MarshalAs(UnmanagedType.LPStr)] public string name;
      public byte type;
      public short len;
      public short dec;
      public short nulls;
   }

   private delegate IntPtr Code4Init();
   private delegate int Code4InitUndo(IntPtr c4);
   private delegate uint Code4Count();
   private delegate short Code4Optimize(IntPtr c4, short value);
   private delegate IntPtr D4Create(IntPtr c4, string name, IntPtr fields, IntPtr tags);
   private delegate int D4Close(IntPtr d4);

   private static Code4Init init;
   private static Code4InitUndo undo;
   private static Code4Count count;
   private static Code4Optimize optimize;
   private static D4Create create;
   private static D4Close close;

   private static uint Live() { return count != null ? count() : 0u; }

   private static int Main(string[] args)
   {
      string dll = args.Length > 0 ? args[0] : "c4dll.dll";
      int iterations = args.Length > 1 ? int.Parse(args[1]) : 5000;

      IntPtr h = LoadLibrary(dll);
      if (h == IntPtr.Zero)
      {
         Console.WriteLine("FAIL: cannot load '" + dll + "' (Win32 error " + Marshal.GetLastWin32Error() + ")");
         return 2;
      }

      init = Bind<Code4Init>(h, "code4initVB");
      undo = Bind<Code4InitUndo>(h, "code4initUndo");
      count = Bind<Code4Count>(h, "code4numCodeBaseCount");
      optimize = Bind<Code4Optimize>(h, "code4optimize");
      create = Bind<D4Create>(h, "d4create");
      close = Bind<D4Close>(h, "d4close");
      if (init == null || undo == null || create == null || close == null)
      {
         Console.WriteLine("FAIL: required exports missing");
         return 2;
      }

      Console.WriteLine("Engine: " + dll + "  (" + (IntPtr.Size == 8 ? "64-bit" : "32-bit") + " process)");

      string dir = Path.Combine(Path.GetTempPath(), "cb_lifecycle_io");
      Directory.CreateDirectory(dir);
      string table = Path.Combine(dir, "LIFECYCLE.DBF");

      // One character field, then a null terminator entry (name == null).
      int structSize = Marshal.SizeOf(typeof(FIELD4INFO));
      IntPtr fields = Marshal.AllocHGlobal(structSize * 2);
      FIELD4INFO f = new FIELD4INFO();
      f.name = "NAME"; f.type = (byte)'C'; f.len = 20; f.dec = 0; f.nulls = 0;
      Marshal.StructureToPtr(f, fields, false);
      Marshal.StructureToPtr(new FIELD4INFO(), (IntPtr)(fields.ToInt64() + structSize), false);

      int rc = 0;
      try
      {
         for (int i = 0; i < iterations; i++)
         {
            if (i > 0 && (i % 1000) == 0)
            {
               Console.WriteLine("  ... " + i + " cycles (live=" + Live() + ")");
               Console.Out.Flush();
            }

            IntPtr c4 = init();
            if (c4 == IntPtr.Zero) { Console.WriteLine("FAIL: code4init NULL at " + i); return 1; }

            // Turn optimization off for this test: it is a separate feature with its own cleanup
            // path (opt4freeAlloc), and leaving it on masks this test behind an unrelated issue.
            // The delayed-write path exercised here is independent of optimization.
            if (optimize != null) optimize(c4, 0);

            // d4create fails if the table already exists, so remove it first.
            if (File.Exists(table)) File.Delete(table);
            IntPtr d4 = create(c4, table, fields, IntPtr.Zero);
            if (d4 == IntPtr.Zero) { Console.WriteLine("FAIL: d4create failed at " + i); return 1; }
            close(d4);

            undo(c4);
            if (count != null && Live() != 0)
            {
               Console.WriteLine("FAIL: live=" + Live() + " after undo at " + i);
               return 1;
            }
         }
      }
      finally
      {
         Marshal.FreeHGlobal(fields);
      }

      uint final = Live();
      if (count != null && final != 0) { Console.WriteLine("FAIL: leaked " + final); rc = 1; }
      else Console.WriteLine("PASS: " + iterations + " create/close init/undo cycles, live=" + final);

      FreeLibrary(h);
      return rc;
   }

   private static T Bind<T>(IntPtr h, string name) where T : class
   {
      IntPtr p = GetProcAddress(h, name);
      if (p == IntPtr.Zero) return null;
      return (T)(object)Marshal.GetDelegateForFunctionPointer(p, typeof(T));
   }
}
