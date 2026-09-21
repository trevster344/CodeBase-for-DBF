using System;
using System.Runtime.InteropServices;
using System.Threading;

/*
 * LifecycleTest - regression test for the CODE4 init/undo handle leak fix.
 *
 * It loads the CodeBase engine at runtime (so the DLL path/name is a command-line
 * argument rather than a compile-time DllImport), then exercises code4init()/
 * code4initUndo() in a loop. When the engine exports code4numCodeBaseCount() (added
 * with the fix) the test also asserts that the number of live CODE4 instances returns
 * to 0 every cycle.
 *
 * Before the fix, numCode4 (and the global memory-manager reference counts) drifted, so
 * repeated init/undo eventually stopped releasing memory and returned bad handles.
 *
 * IMPORTANT: the default Windows build also enables the delay-write/advance-read worker
 * threads (S4WRITE_DELAY / S4READ_ADVANCE). Their shutdown path waits forever for the worker
 * to acknowledge, and has a pre-existing, nondeterministic hang that this tight init/undo
 * loop can trip (both before and after the numCode4 fix). If the test appears to hang, it is
 * that separate issue, not the counter logic. To isolate the counter fix, build the engine
 * with S4OFF_WRITE_DELAY and S4OFF_READ_ADVANCE defined (see WorkingSource/d4all.h); the
 * counter fix then passes 20k+ cycles with a flat handle count.
 *
 * Build (any csc; VS developer prompt recommended):
 *   32-bit: csc -nologo -platform:x86 -out:LifecycleTest_x86.exe LifecycleTest.cs
 *   64-bit: csc -nologo -platform:x64 -out:LifecycleTest_x64.exe LifecycleTest.cs
 *
 * Run (put the engine next to the exe, or pass its path):
 *   LifecycleTest_x86.exe c4dll.dll    [singleIter] [threads] [perThread]
 *   LifecycleTest_x64.exe c4dll64.dll  [singleIter] [threads] [perThread]
 * Defaults: 5000 single-threaded cycles, 4 threads x 2000 cycles.
 */

class LifecycleTest
{
   [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Ansi)]
   private static extern IntPtr LoadLibrary(string lpFileName);

   [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Ansi)]
   private static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

   [DllImport("kernel32", SetLastError = true)]
   private static extern bool FreeLibrary(IntPtr hModule);

   // S4FUNCTION is __stdcall on Win32; the default delegate convention (Winapi) maps to
   // StdCall on Windows, which is correct for both 32- and 64-bit.
   private delegate IntPtr Code4Init();
   private delegate int Code4InitUndo(IntPtr c4);
   private delegate uint Code4Count();

   private static Code4Init init;
   private static Code4InitUndo undo;
   private static Code4Count count;   // may be null on engines without the diagnostic export
   private static volatile bool failed;

   private static uint Live()
   {
      return count != null ? count() : 0u;
   }

   private static int Main(string[] args)
   {
      string dll = args.Length > 0 ? args[0] : "c4dll.dll";
      int single = args.Length > 1 ? int.Parse(args[1]) : 5000;
      int threads = args.Length > 2 ? int.Parse(args[2]) : 4;
      int perThread = args.Length > 3 ? int.Parse(args[3]) : 2000;

      IntPtr h = LoadLibrary(dll);
      if (h == IntPtr.Zero)
      {
         Console.WriteLine("FAIL: cannot load '" + dll + "' (Win32 error " + Marshal.GetLastWin32Error() + ")");
         return 2;
      }

      IntPtr pInit = GetProcAddress(h, "code4initVB");
      IntPtr pUndo = GetProcAddress(h, "code4initUndo");
      IntPtr pCount = GetProcAddress(h, "code4numCodeBaseCount");
      if (pInit == IntPtr.Zero || pUndo == IntPtr.Zero)
      {
         Console.WriteLine("FAIL: required exports missing (code4initVB/code4initUndo)");
         return 2;
      }

      init = (Code4Init)Marshal.GetDelegateForFunctionPointer(pInit, typeof(Code4Init));
      undo = (Code4InitUndo)Marshal.GetDelegateForFunctionPointer(pUndo, typeof(Code4InitUndo));
      if (pCount != IntPtr.Zero)
         count = (Code4Count)Marshal.GetDelegateForFunctionPointer(pCount, typeof(Code4Count));

      Console.WriteLine("Engine: " + dll + "  (" + (IntPtr.Size == 8 ? "64-bit" : "32-bit") + " process)");
      if (count == null)
         Console.WriteLine("NOTE: code4numCodeBaseCount not exported; count assertions disabled");
      else
         Console.WriteLine("Starting live CODE4 count: " + Live());

      int rc = 0;
      rc |= SingleThreaded(single);
      rc |= Concurrent(threads, perThread);

      if (count != null)
      {
         uint final = Live();
         if (final != 0)
         {
            Console.WriteLine("FAIL: leaked " + final + " CODE4 handle(s) at end of test");
            rc = 1;
         }
         else if (rc == 0)
            Console.WriteLine("PASS: all cycles released; final live CODE4 count = 0");
      }
      else if (rc == 0)
         Console.WriteLine("PASS: all init/undo cycles completed without error");

      FreeLibrary(h);
      return rc;
   }

   // Alternating init/undo. This is the pattern that used to exhaust handles over time.
   private static int SingleThreaded(int iterations)
   {
      for (int i = 0; i < iterations; i++)
      {
         if (i > 0 && (i % 1000) == 0)
         {
            System.Diagnostics.Process p = System.Diagnostics.Process.GetCurrentProcess();
            Console.WriteLine("  ... " + i + " cycles (live=" + Live() + ", handles=" + p.HandleCount + ", privateMB=" + (p.PrivateMemorySize64 / 1048576) + ")");
            Console.Out.Flush();
         }

         IntPtr c4 = init();
         if (c4 == IntPtr.Zero)
         {
            Console.WriteLine("FAIL: code4init() returned NULL at iteration " + i);
            return 1;
         }
         if (count != null && Live() != 1)
         {
            Console.WriteLine("FAIL: live count = " + Live() + " after init at iteration " + i + " (expected 1)");
            return 1;
         }
         undo(c4);
         if (count != null && Live() != 0)
         {
            Console.WriteLine("FAIL: live count = " + Live() + " after undo at iteration " + i + " (expected 0)");
            return 1;
         }
      }
      Console.WriteLine("Single-threaded: " + iterations + " cycles OK (live=" + Live() + ")");
      Console.Out.Flush();
      return 0;
   }

   // Overlapping init/undo across threads - exercises the numCode4 race the fix closes.
   private static int Concurrent(int threads, int perThread)
   {
      if (threads <= 0 || perThread <= 0)
         return 0;

      failed = false;
      Thread[] workers = new Thread[threads];
      for (int t = 0; t < threads; t++)
      {
         workers[t] = new Thread(delegate()
         {
            for (int i = 0; i < perThread; i++)
            {
               IntPtr c4 = init();
               if (c4 == IntPtr.Zero)
               {
                  Console.WriteLine("FAIL: code4init() returned NULL in concurrent loop");
                  failed = true;
                  return;
               }
               undo(c4);
            }
         });
         workers[t].Start();
      }
      for (int t = 0; t < threads; t++)
         workers[t].Join();

      if (failed)
         return 1;
      if (count != null && Live() != 0)
      {
         Console.WriteLine("FAIL: live count = " + Live() + " after concurrent phase (expected 0)");
         return 1;
      }
      Console.WriteLine("Concurrent: " + threads + " threads x " + perThread + " cycles OK (live=" + Live() + ")");
      Console.Out.Flush();
      return 0;
   }
}
