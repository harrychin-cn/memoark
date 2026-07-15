[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [int]$AndroidVersionCode = 0,
  [string]$OutputDirectory = "build/releases",
  [string]$AndroidSigningProfilePath = (Join-Path $env:LOCALAPPDATA "MemoArk\signing\android-release-profile.json")
)

$ErrorActionPreference = "Stop"

function Require-File {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required complete-release asset is missing: $Path"
  }
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedOutputDirectory = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
}
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null

& (Join-Path $PSScriptRoot "package-release.ps1") `
  -Version $Version `
  -GoOS windows `
  -GoArch amd64 `
  -OutputDirectory $resolvedOutputDirectory
if ($LASTEXITCODE -ne 0) {
  throw "Windows release packaging failed with exit code $LASTEXITCODE."
}

& (Join-Path $PSScriptRoot "android\package-release.ps1") `
  -Version $Version `
  -VersionCode $AndroidVersionCode `
  -OutputDirectory $resolvedOutputDirectory `
  -SigningProfilePath $AndroidSigningProfilePath
if ($LASTEXITCODE -ne 0) {
  throw "Android release packaging failed with exit code $LASTEXITCODE."
}

$windowsStaging = Join-Path $resolvedOutputDirectory "memoark-$Version-windows-amd64"
$windowsSBOMSource = Join-Path $windowsStaging "sbom\SBOM.cdx.json"
$windowsNoticesSource = Join-Path $windowsStaging "THIRD_PARTY_NOTICES"
Require-File $windowsSBOMSource
Require-File $windowsNoticesSource
$windowsSBOM = Join-Path $resolvedOutputDirectory "MemoArk-$Version-Windows-SBOM.cdx.json"
$windowsNotices = Join-Path $resolvedOutputDirectory "MemoArk-$Version-Windows-THIRD_PARTY_NOTICES.txt"
Copy-Item -LiteralPath $windowsSBOMSource -Destination $windowsSBOM
Copy-Item -LiteralPath $windowsNoticesSource -Destination $windowsNotices

$portableArchive = Join-Path $resolvedOutputDirectory "memoark-$Version-windows-amd64.zip"
$installer = Join-Path $resolvedOutputDirectory "MemoArk-Setup.exe"
$androidAPK = Join-Path $resolvedOutputDirectory "MemoArk-$Version-Android.apk"
$androidSBOM = Join-Path $resolvedOutputDirectory "MemoArk-$Version-Android-SBOM.cdx.json"
$androidNotices = Join-Path $resolvedOutputDirectory "MemoArk-$Version-Android-THIRD_PARTY_NOTICES.txt"
$androidManifest = Join-Path $resolvedOutputDirectory "MemoArk-$Version-Android-RELEASE-MANIFEST.json"
$requiredPublicAssets = @(
  $installer,
  $portableArchive,
  $androidAPK,
  $windowsSBOM,
  $windowsNotices,
  $androidSBOM,
  $androidNotices,
  $androidManifest
)
foreach ($path in $requiredPublicAssets) {
  Require-File $path
}

$gitRevision = (& git -C $repositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve the current Git revision."
}
$completeManifestPath = Join-Path $resolvedOutputDirectory "MemoArk-$Version-RELEASE-MANIFEST.json"
$completeManifest = [ordered]@{
  format = "memoark.complete-release"
  formatVersion = 1
  version = $Version
  gitRevision = $gitRevision
  windows = [ordered]@{
    installer = [System.IO.Path]::GetFileName($installer)
    portableArchive = [System.IO.Path]::GetFileName($portableArchive)
    sbom = [System.IO.Path]::GetFileName($windowsSBOM)
    notices = [System.IO.Path]::GetFileName($windowsNotices)
  }
  android = [ordered]@{
    apk = [System.IO.Path]::GetFileName($androidAPK)
    sbom = [System.IO.Path]::GetFileName($androidSBOM)
    notices = [System.IO.Path]::GetFileName($androidNotices)
    manifest = [System.IO.Path]::GetFileName($androidManifest)
  }
}
$completeManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $completeManifestPath -Encoding UTF8
$requiredPublicAssets += $completeManifestPath

$checksumsPath = Join-Path $resolvedOutputDirectory "SHA256SUMS.txt"
$checksums = @(
  $requiredPublicAssets |
    Sort-Object |
    ForEach-Object {
      "{0} *{1}" -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash.ToLowerInvariant(), [System.IO.Path]::GetFileName($_)
    }
)
Set-Content -LiteralPath $checksumsPath -Value $checksums -Encoding ASCII

Write-Output "Created complete MemoArk release set in: $resolvedOutputDirectory"
Write-Output "Created aggregate checksums: $checksumsPath"
Write-Output "No Git push, pull request, CI run, or publication was performed."
