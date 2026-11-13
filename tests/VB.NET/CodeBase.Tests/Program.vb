Imports System
Imports System.IO

' CodeBase.Tests.VB - runnable console test for the CodeBase native engine (VB.NET).
'
' x86 -> interfaces/VB.NET/CodeBase.vb   (Integer handles, c4dll.dll)
' x64 -> interfaces/VB.NET/CodeBase64.vb (IntPtr handles, c4dll.dll = the 64-bit engine)
'
' Errors are silenced (code4errOff) so failures come back as error codes rather than
' message boxes / exceptions. Exercises process bitness, a lifecycle loop (code4init/
' code4initUndo via Code4Handle), and a full CRUD round-trip. Exit 0 = PASS.
Module Program

    Private haveCount As Boolean = True

    Function Main(args As String()) As Integer
#If EXPECT_X64 Then
        Const expect64 As Boolean = True
#Else
        Const expect64 As Boolean = False
#End If
        Dim is64 As Boolean = (IntPtr.Size = 8)

        Console.WriteLine("CodeBase VB.NET test")
        Console.WriteLine("  process bitness : " & If(is64, "x64 (64-bit)", "x86 (32-bit)") & "  (expected " & If(expect64, "x64", "x86") & ")")

        ' Fail if the project was not compiled for the expected bitness. A process can only load a
        ' native DLL of its own bitness, so this also guarantees the engine matched.
        If is64 <> expect64 Then
            Console.WriteLine("  bitness   : FAIL (expected " & If(expect64, "x64", "x86") & " but running " & If(is64, "x64", "x86") & ")")
            Return 2
        End If

        Dim rc As Integer = 0
        rc = rc Or TestLifecycle()
        rc = rc Or TestCrud()
        rc = rc Or TestMemIndex()

        Console.WriteLine(If(rc = 0, "PASS", "FAIL"))
        Return rc
    End Function

    Private Function Live() As UInteger
        If haveCount Then
            Return code4numCodeBaseCount()
        Else
            Return 0UI
        End If
    End Function

    Private Function TestLifecycle() As Integer
        Const cycles As Integer = 5000
        Try
            ' code4numCodeBaseCount() is a diagnostic added with the lifecycle fix; older engines
            ' may not export it, in which case we still run the loop but skip the count assertions.
            Try
                Dim probe As UInteger = code4numCodeBaseCount()
            Catch ex As EntryPointNotFoundException
                haveCount = False
                Console.WriteLine("  lifecycle : NOTE code4numCodeBaseCount not exported; count checks disabled")
            End Try

            If haveCount AndAlso Live() <> 0UI Then
                Console.WriteLine("  lifecycle : FAIL (initial live count = " & Live() & ")")
                Return 1
            End If

            For i As Integer = 0 To cycles - 1
                Using h As New Code4Handle()
                    code4errOff(h.Handle, 1)   ' silent: return codes only
                    If haveCount AndAlso Live() <> 1UI Then
                        Console.WriteLine("  lifecycle : FAIL (live = " & Live() & " after init at " & i & ")")
                        Return 1
                    End If
                End Using
                If haveCount AndAlso Live() <> 0UI Then
                    Console.WriteLine("  lifecycle : FAIL (live = " & Live() & " after dispose at " & i & ")")
                    Return 1
                End If
            Next

            Console.WriteLine("  lifecycle : " & cycles & " init/dispose cycles OK")
            Return 0
        Catch ex As Exception
            Console.WriteLine("  lifecycle : EXCEPTION " & ex.GetType().Name & ": " & ex.Message)
            Return 1
        End Try
    End Function

    Private Function TestCrud() As Integer
        Dim dir As String = Path.Combine(Path.GetTempPath(), "codebase_tests")
        Directory.CreateDirectory(dir)
        Dim table As String = Path.Combine(dir, "VBCRUDTEST")
        DeleteTable(table)

        Dim c4 = code4init()
        Try
            code4errOff(c4, 1)          ' silent: return codes only
            code4singleOpen(c4, 0)
            code4safety(c4, 0)
            code4compatibility(c4, 30)
            code4readOnly(c4, 0)

            ' The d4create wrapper scans until an empty name, so include a trailing empty entry.
            Dim fields(2) As FIELD4INFO
            fields(0).fName = "STR" : fields(0).ftype = "C" : fields(0).flength = 10
            fields(1).fName = "NUM" : fields(1).ftype = "N" : fields(1).flength = 5

            Dim tags(1) As TAG4INFO
            tags(0).name = "STR" : tags(0).expression = "STR"

            Dim d4 = d4create(c4, table, fields, tags)
            If d4numFields(d4) <> 2 Then
                Console.WriteLine("  crud      : FAIL (d4create created " & d4numFields(d4) & " fields; err=" & code4errorCode(c4, -5) & ")")
                Return 1
            End If

            d4appendStart(d4, 0)
            For i As Integer = 1 To 5
                d4appendBlank(d4)
                Dim fStr = d4field(d4, "STR")
                Dim fNum = d4field(d4, "NUM")
                f4assign(fStr, "REC" & i)
                f4assign(fNum, (100 + i).ToString())
            Next
            d4close(d4)

            Dim d2 = d4open(c4, table)
            Dim cnt As Integer = d4recCount(d2)
            If cnt <> 5 Then
                Console.WriteLine("  crud      : FAIL (recCount = " & cnt & ", expected 5; err=" & code4errorCode(c4, -5) & ")")
                d4close(d2)
                Return 1
            End If

            For i As Integer = 1 To 5
                Dim recNo As Integer = i
                d4go(d2, recNo)
                Dim fStr2 = d4field(d2, "STR")
                Dim fNum2 = d4field(d2, "NUM")
                Dim s As String = f4str(fStr2).Trim()
                Dim n As String = f4str(fNum2).Trim()
                If s <> "REC" & i OrElse n <> (100 + i).ToString() Then
                    Console.WriteLine("  crud      : FAIL (record " & i & " = '" & s & "'/'" & n & "')")
                    d4close(d2)
                    Return 1
                End If
            Next

            Dim seekRc As Short = d4seek(d2, "REC3")
            Dim fSeek = d4field(d2, "STR")
            If seekRc <> r4success OrElse f4str(fSeek).Trim() <> "REC3" Then
                Console.WriteLine("  crud      : FAIL (seek REC3 rc=" & seekRc & ")")
                d4close(d2)
                Return 1
            End If
            d4close(d2)

            Console.WriteLine("  crud      : create/append/read/seek OK")
            Return 0
        Catch ex As Exception
            Console.WriteLine("  crud      : EXCEPTION " & ex.GetType().Name & ": " & ex.Message)
            Return 1
        Finally
            code4initUndo(c4)
            DeleteTable(table)
        End Try
    End Function

    Private Function TestMemIndex() As Integer
        Dim dir As String = Path.Combine(Path.GetTempPath(), "codebase_tests")
        Directory.CreateDirectory(dir)
        Dim table As String = Path.Combine(dir, "VBMEMIDXTEST")
        DeleteTable(table)

        Dim c4 = code4init()
        Try
            code4errOff(c4, 1)
            code4singleOpen(c4, 0)
            code4safety(c4, 0)
            code4compatibility(c4, 30)
            code4readOnly(c4, 0)
            code4memIndexLimitSet(c4, 16 * 1024 * 1024, 8)
            code4memIndexAutoRefreshSet(c4, 1)

            Dim fields(3) As FIELD4INFO
            fields(0).fName = "PROGRAM_ID" : fields(0).ftype = "C" : fields(0).flength = 10
            fields(1).fName = "ADATE" : fields(1).ftype = "D" : fields(1).flength = 8
            fields(2).fName = "AMT" : fields(2).ftype = "N" : fields(2).flength = 8

            Dim tags(1) As TAG4INFO
            Dim d4 = d4create(c4, table, fields, tags)
            If d4numFields(d4) <> 3 Then
                Console.WriteLine("  memindex  : FAIL (d4create created " & d4numFields(d4) & " fields)")
                Return 1
            End If

            Const N As Integer = 1000
            d4appendStart(d4, 0)
            Dim fProgram = d4field(d4, "PROGRAM_ID")
            Dim fDate = d4field(d4, "ADATE")
            Dim fAmt = d4field(d4, "AMT")
            For i As Integer = 0 To N - 1
                d4appendBlank(d4)
                f4assign(fProgram, "P" & (i Mod 10))
                f4assign(fDate, "202601" & ((i Mod 28) + 1).ToString("00"))
                f4assign(fAmt, i.ToString())
            Next
            d4flush(d4)
            d4close(d4)

            Dim d2 = d4open(c4, table)
            Dim byDate = d4memIndexGet(d2, "ADATE", 4)
            Dim hits = MemIndexFind(byDate, "20260115")
            If hits.Length <> 36 Then
                Console.WriteLine("  memindex  : FAIL (date hits = " & hits.Length & ", expected 36)")
                Return 1
            End If

            Dim range = MemIndexFindRange(byDate, "20260105", "20260110")
            If range.Length <> 216 Then
                Console.WriteLine("  memindex  : FAIL (range hits = " & range.Length & ", expected 216)")
                Return 1
            End If

            Dim all = MemIndexAll(byDate)
            If all.Length <> N Then
                Console.WriteLine("  memindex  : FAIL (all = " & all.Length & ", expected " & N & ")")
                Return 1
            End If

            Dim byProgram = d4memIndexGet(d2, "PROGRAM_ID", 4)
            Dim p3 = MemIndexFind(byProgram, "P3")
            If p3.Length <> 100 Then
                Console.WriteLine("  memindex  : FAIL (P3 hits = " & p3.Length & ", expected 100)")
                Return 1
            End If

            d4appendStart(d2, 0)
            d4appendBlank(d2)
            f4assign(d4field(d2, "PROGRAM_ID"), "P3")
            f4assign(d4field(d2, "ADATE"), "20260115")
            f4assign(d4field(d2, "AMT"), "1")
            d4flush(d2)

            If d4memIndexIsStale(byDate) = 0 Then
                Console.WriteLine("  memindex  : FAIL (index not marked stale after append)")
                Return 1
            End If
            Dim after = MemIndexFind(byDate, "20260115")
            If after.Length <> 37 Then
                Console.WriteLine("  memindex  : FAIL (auto-refresh hits = " & after.Length & ", expected 37)")
                Return 1
            End If

            d4memIndexFree(byDate)
            d4memIndexFree(byProgram)
            d4close(d2)
            Console.WriteLine("  memindex  : build/find/range/all/stale OK")
            Return 0
        Catch ex As Exception
            Console.WriteLine("  memindex  : EXCEPTION " & ex.GetType().Name & ": " & ex.Message)
            Return 1
        Finally
            code4initUndo(c4)
            DeleteTable(table)
        End Try
    End Function

    Private Sub DeleteTable(table As String)
        For Each ext As String In New String() {".dbf", ".cdx", ".fpt", ".idx"}
            Try
                If File.Exists(table & ext) Then File.Delete(table & ext)
            Catch
            End Try
        Next
    End Sub

End Module
