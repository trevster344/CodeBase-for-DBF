# CodeBase VB6 interface

`CodeBase.bas` is the classic VB6 (32-bit) declaration module, promoted from the
`CodeBaseServer2020` admin source so it can be maintained as an interface package.

Add it to a VB6 project and use the existing `codebase.bas` API as before. The in-memory
index additions are declared in both the `USE_D4DLL` and `c4dll.dll` branches.

```vb
Dim idx As Long
Dim recs() As Long
Dim n As Long

idx = d4memIndexGet(d4, "ADATE", 0)          ' no tag, no .cdx
n = CB_MemIndexFind(idx, "20260115", recs)   ' recs(0 .. n-1)
For i = 0 To n - 1
    d4go d4, recs(i)
    Debug.Print f4str(d4field(d4, "PROGRAM_ID"))
Next i

d4memIndexFree idx
```

Helpers in `CodeBase.bas`:

- `CB_MemIndexFind(idx, key, recs())`
- `CB_MemIndexFindDouble(idx, key, recs())`
- `CB_MemIndexFindRange(idx, fromKey, toKey, recs())`
- `CB_MemIndexFindRangeDouble(idx, fromKey, toKey, recs())`
- `CB_MemIndexAll(idx, recs())`

The index is freed automatically when the `DATA4` closes; `d4memIndexFree` releases it earlier.
