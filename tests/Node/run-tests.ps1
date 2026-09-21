# run-tests.ps1
#
# Runs the Node.js / TypeScript CodeBase test (tests/Node/test.ts) against the native engine.
#
#   x64 -> build/MVStudio_2022_Project_VFP_STAND_ALONE_64/C4dll64.dll  (64-bit Node)
#   x86 -> build/MVStudio_2022_Project_VFP_STAND_ALONE_32/C4dll.dll   (32-bit Node; SKIP if absent)
#
# Use -BuildNative to build the native DLLs first (runs the config .BAT + MSBuild and restores
# WorkingSource/d4all.h afterwards).
#
# Examples:
#   powershell -ExecutionPolicy Bypass -File tests\Node\run-tests.ps1
#   powershell -ExecutionPolicy Bypass -File tests\Node\run-tests.ps1 -BuildNative
#   powershell -ExecutionPolicy Bypass -File tests\Node\run-tests.ps1 -Node32 "C:\Program Files (x86)\nodejs\node.exe"

param(
   [switch]$BuildNative,
   [string]$Configuration = "Release",
   [string]$MsBuild = "",
   [string]$Node64 = "",
   [string]$Node32 = ""
)

$ErrorActionPreference = "Stop"
$testsDir = $PSScriptRoot
$root = Split-Path -Parent (Split-Path -Parent $testsDir)
$ifaceDir = Join-Path $root "interfaces\Node"

function Find-MsBuild {
   if ($MsBuild -ne "") { return $MsBuild }
   $cmd = Get-Command msbuild -ErrorAction SilentlyContinue
   if ($cmd) { return $cmd.Source }
   $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
   if (Test-Path $vswhere) {
      $found = & $vswhere -latest -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
      if ($found) { return $found }
   }
   throw "MSBuild not found. Pass -MsBuild <path to MSBuild.exe>."
}

function Build-Native {
   $msb = Find-MsBuild
   $map = @(
      @{ Bat = "SetVFP_CLIENT_SA32.BAT"; Proj = "build\MVStudio_2022_Project_VFP_STAND_ALONE_32\C4dll.vcxproj"; Plat = "Win32" },
      @{ Bat = "SetVFP_CLIENT_SA64.BAT"; Proj = "build\MVStudio_2022_Project_VFP_STAND_ALONE_64\C4dll.vcxproj"; Plat = "x64"   }
   )
   foreach ($m in $map) {
      Write-Host "== building native ($($m.Plat)) ==" -ForegroundColor Cyan
      Push-Location (Join-Path $root "WorkingSource")
      cmd /c $m.Bat | Out-Null
      Pop-Location
      & $msb (Join-Path $root $m.Proj) -p:Configuration=$Configuration -p:Platform=$($m.Plat) -m -v:minimal -nologo | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "native build failed for $($m.Plat)" }
   }
   git -C $root checkout -- WorkingSource/d4all.h
}

function Ensure-Deps {
   if (-not (Test-Path (Join-Path $ifaceDir "node_modules\koffi"))) {
      Write-Host "== npm install (interfaces/Node) ==" -ForegroundColor Cyan
      & npm install --no-audit --no-fund --prefix $ifaceDir
   }
   if (-not (Test-Path (Join-Path $testsDir "node_modules\typescript"))) {
      Write-Host "== npm install (tests/Node) ==" -ForegroundColor Cyan
      & npm install --no-audit --no-fund --prefix $testsDir
   }
}

function Get-NodeArch([string]$exe) {
   try { return (& $exe -p "process.arch" 2>$null).Trim() } catch { return "" }
}

function Resolve-Node([string]$explicit, [string]$arch) {
   $candidates = @()
   if ($explicit -ne "") { $candidates += $explicit }
   if ($arch -eq "x64") {
      $cmd = Get-Command node -ErrorAction SilentlyContinue
      if ($cmd) { $candidates += $cmd.Source }
   } else {
      $candidates += (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
   }
   foreach ($c in $candidates) {
      if ($c -and (Test-Path $c) -and ((Get-NodeArch $c) -eq $arch)) { return $c }
   }
   return ""
}

function Run-Node([string]$exe, [string]$dll, [string]$label) {
   if (-not $exe) { Write-Host ("{0,-4} : SKIP (no {0} Node found)" -f $label) -ForegroundColor Yellow; return 0 }
   if (-not (Test-Path $dll)) { Write-Host ("{0,-4} : SKIP (missing {1})" -f $label, $dll) -ForegroundColor Yellow; return 0 }
   Write-Host "== $label ($exe) ==" -ForegroundColor Cyan
   $prev = $env:CODE4_DLL
   $env:CODE4_DLL = $dll
   try {
      & $exe "--experimental-strip-types" "--no-warnings" (Join-Path $testsDir "test.ts") | Out-Host
      return $LASTEXITCODE
   } finally {
      $env:CODE4_DLL = $prev
   }
}

if ($BuildNative) { Build-Native }
Ensure-Deps

Write-Host "== typecheck ==" -ForegroundColor Cyan
& (Join-Path $testsDir "node_modules\.bin\tsc.cmd") -p (Join-Path $testsDir "tsconfig.json")
if ($LASTEXITCODE -ne 0) { throw "TypeScript typecheck failed" }

$node64 = Resolve-Node $Node64 "x64"
$node32 = Resolve-Node $Node32 "ia32"

$rc64 = Run-Node $node64 (Join-Path $root "build\MVStudio_2022_Project_VFP_STAND_ALONE_64\C4dll64.dll") "x64"
$rc32 = Run-Node $node32 (Join-Path $root "build\MVStudio_2022_Project_VFP_STAND_ALONE_32\C4dll.dll") "x86"

if ($rc64 -ne 0 -or $rc32 -ne 0) { exit 1 }
Write-Host "PASS" -ForegroundColor Green
exit 0
