# run-tests.ps1
#
# Builds and runs the C# and VB.NET CodeBase test projects for 32-bit (x86) and 64-bit (x64)
# on both net8.0 and net48, then prints a PASS/FAIL matrix.
#
# The native engine DLLs must exist in the build output directories. Use -BuildNative to build
# them first (runs the config .BAT + MSBuild and restores WorkingSource/d4all.h afterwards).
#
# Examples:
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -BuildNative
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -Frameworks net8.0 -Platforms x64

param(
   [switch]$BuildNative,
   [string]$Configuration = "Release",
   [string[]]$Frameworks = @("net8.0", "net48"),
   [string[]]$Platforms = @("x86", "x64"),
   [string]$MsBuild = ""
)

$ErrorActionPreference = "Stop"
$testsDir = $PSScriptRoot
$root = Split-Path -Parent $testsDir

$projects = @(
   @{ Name = "C#";      Proj = Join-Path $testsDir "CSharp\CodeBase.Tests\CodeBase.Tests.csproj"; Exe = "CodeBase.Tests.CSharp.exe" },
   @{ Name = "VB.NET";  Proj = Join-Path $testsDir "VB.NET\CodeBase.Tests\CodeBase.Tests.vbproj";  Exe = "CodeBase.Tests.VB.exe" }
)

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
      @{ Bat = "SetVFP_CLIENT_SA32.BAT";  Proj = "build\MVStudio_2022_Project_VFP_STAND_ALONE_32\C4dll.vcxproj"; Plat = "Win32" },
      @{ Bat = "SetVFP_CLIENT_SA64.BAT";  Proj = "build\MVStudio_2022_Project_VFP_STAND_ALONE_64\C4dll.vcxproj"; Plat = "x64"   }
   )
   foreach ($m in $map) {
      Write-Host "== building native ($($m.Plat)) ==" -ForegroundColor Cyan
      Push-Location (Join-Path $root "WorkingSource")
      cmd /c $m.Bat | Out-Null
      Pop-Location
      & $msb (Join-Path $root $m.Proj) -p:Configuration=$Configuration -p:Platform=$($m.Plat) -m -v:minimal -nologo | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "native build failed for $($m.Plat)" }
   }
   # restore the tracked header the .BAT overwrote
   git -C $root checkout -- WorkingSource/d4all.h
}

if ($BuildNative) { Build-Native }

$results = @()
foreach ($proj in $projects) {
   foreach ($fw in $Frameworks) {
      foreach ($plat in $Platforms) {
         $label = "$($proj.Name) $fw $plat"
         Write-Host "== $label ==" -ForegroundColor Cyan
         & dotnet build $proj.Proj -c $Configuration -f $fw -p:Platform=$plat -v:minimal -nologo | Out-Null
         if ($LASTEXITCODE -ne 0) {
            $results += [pscustomobject]@{ Test = $label; Result = "BUILD-FAIL" }
            continue
         }
         $exePath = Join-Path (Split-Path -Parent $proj.Proj) "bin\$plat\$Configuration\$fw\$($proj.Exe)"
         & $exePath
         $results += [pscustomobject]@{ Test = $label; Result = $(if ($LASTEXITCODE -eq 0) { "PASS" } else { "FAIL" }) }
      }
   }
}

Write-Host ""
Write-Host "==================== SUMMARY ====================" -ForegroundColor Yellow
$results | Format-Table -AutoSize
$failed = ($results | Where-Object { $_.Result -ne "PASS" }).Count
if ($failed -eq 0) {
   Write-Host "ALL PASSED ($($results.Count) combinations)" -ForegroundColor Green
   exit 0
} else {
   Write-Host "$failed of $($results.Count) FAILED" -ForegroundColor Red
   exit 1
}
