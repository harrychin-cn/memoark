[CmdletBinding()]
param(
  [string]$Version,
  [ValidateSet("windows")]
  [string]$GoOS = "windows",
  [ValidateSet("amd64", "arm64", "386")]
  [string]$GoArch = "amd64",
  [string]$OutputDirectory = "build/releases"
)

$ErrorActionPreference = "Stop"

function Require-File {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required release input is missing: $Path"
  }
}

function Restore-EnvironmentValue {
  param(
    [string]$Name,
    [AllowNull()]
    [string]$Value
  )

  if ($null -eq $Value) {
    Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
  } else {
    Set-Item -Path "Env:$Name" -Value $Value
  }
}

function Get-ReleaseFileRecord {
  param(
    [string]$Root,
    [System.IO.FileInfo]$File
  )

  $relativePath = $File.FullName.Substring($Root.Length + 1).Replace("\", "/")
  [ordered]@{
    path = $relativePath
    bytes = [int64]$File.Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $File.FullName).Hash.ToLowerInvariant()
  }
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$initialWorktreeStatus = (& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to determine the source worktree status."
}
if (-not [string]::IsNullOrWhiteSpace(($initialWorktreeStatus -join "`n").Trim())) {
  throw "Native releases require a clean source worktree. Commit, stash, or remove local changes first."
}
$gitRevision = (& git -C $repositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve the current Git revision."
}
$goToolchainVersion = (& go env GOVERSION).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($goToolchainVersion)) {
  throw "Unable to resolve the Go toolchain version."
}
$goRoot = (& go env GOROOT).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($goRoot)) {
  throw "Unable to resolve GOROOT."
}
$goLicensePath = Join-Path $goRoot "LICENSE"
$goPatentsPath = Join-Path $goRoot "PATENTS"
Require-File $goLicensePath
Require-File $goPatentsPath
$goLicenseHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $goLicensePath).Hash.ToLowerInvariant()
$goPatentsHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $goPatentsPath).Hash.ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = "git-" + $gitRevision.Substring(0, 12)
}
if ($Version -notmatch "^[0-9A-Za-z][0-9A-Za-z._-]*$") {
  throw "Version may contain only letters, numbers, dots, underscores, and dashes."
}

$frontendIndexRelativePath = "server/router/frontend/dist/index.html"
$frontendIndex = Join-Path $repositoryRoot $frontendIndexRelativePath
$frontendBuildStarted = $false

$resolvedOutputDirectory = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
}
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null

$target = "$GoOS-$GoArch"
$stagingDirectory = Join-Path $resolvedOutputDirectory "memoark-$Version-$target"
if (Test-Path -LiteralPath $stagingDirectory) {
  throw "Release staging directory already exists: $stagingDirectory. Choose a new version or remove it after inspection."
}
New-Item -ItemType Directory -Path (Join-Path $stagingDirectory "sbom") -Force | Out-Null

$binaryName = if ($GoOS -eq "windows") { "memos.exe" } else { "memos" }
$binaryPath = Join-Path $stagingDirectory $binaryName
$noticesPath = Join-Path $stagingDirectory "THIRD_PARTY_NOTICES"
$sbomPath = Join-Path $stagingDirectory "sbom/SBOM.cdx.json"
$releaseManifestPath = Join-Path $stagingDirectory "RELEASE-MANIFEST.json"
$checksumsPath = Join-Path $stagingDirectory "SHA256SUMS.txt"
$archiveName = "memoark-$Version-$target.zip"

try {
  Push-Location (Join-Path $repositoryRoot "web")
  try {
    $frontendBuildStarted = $true
    & corepack pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm install failed with exit code $LASTEXITCODE."
    }
    & corepack pnpm release
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm release failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
  Require-File $frontendIndex

  Push-Location $repositoryRoot
  try {
    & node scripts/compliance/generate-third-party-materials.mjs `
    --goos $GoOS `
    --goarch $GoArch `
    --provenance release `
    --application-version $Version `
    --notices-output $noticesPath `
    --sbom-output $sbomPath
  if ($LASTEXITCODE -ne 0) {
    throw "Third-party material generation failed with exit code $LASTEXITCODE."
  }
  if (-not (Select-String -LiteralPath $noticesPath -SimpleMatch "- application version: $Version" -Quiet) -or
      -not (Select-String -LiteralPath $noticesPath -SimpleMatch "- git revision: $gitRevision" -Quiet) -or
      -not (Select-String -LiteralPath $noticesPath -SimpleMatch "- Go target: $GoOS/$GoArch" -Quiet) -or
      -not (Select-String -LiteralPath $noticesPath -SimpleMatch "- Go dependency analysis toolchain: $goToolchainVersion" -Quiet) -or
      -not (Select-String -LiteralPath $noticesPath -SimpleMatch "- Go binary build toolchain: $goToolchainVersion" -Quiet) -or
      -not (Select-String -LiteralPath $noticesPath -SimpleMatch "## golang-runtime: Go standard library and runtime@$($goToolchainVersion.Substring(2))" -Quiet)) {
    throw "Generated THIRD_PARTY_NOTICES does not match the native package version, revision, target, and Go toolchain."
  }
  $sourceSBOM = Get-Content -LiteralPath $sbomPath -Raw | ConvertFrom-Json
  $sourceProperties = @($sourceSBOM.metadata.properties)
  $sourceVersion = @($sourceProperties | Where-Object { $_.name -eq "memoark:application-version" })[0].value
  $sourceRevision = @($sourceProperties | Where-Object { $_.name -eq "memoark:git-revision" })[0].value
  $sourceTarget = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-target" })[0].value
  $sourceAnalysisToolchain = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-analysis-toolchain-version" })[0].value
  $sourceBuildToolchain = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-build-toolchain-version" })[0].value
  $sourceLicenseHash = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-runtime-license-sha256" })[0].value
  $sourcePatentsHash = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-runtime-patents-sha256" })[0].value
  if ($sourceVersion -ne $Version -or $sourceRevision -ne $gitRevision -or $sourceTarget -ne "$GoOS/$GoArch" -or
      $sourceAnalysisToolchain -ne $goToolchainVersion -or $sourceBuildToolchain -ne $goToolchainVersion -or
      $sourceLicenseHash -ne $goLicenseHash -or $sourcePatentsHash -ne $goPatentsHash) {
    throw "Generated source SBOM does not match the native package version, revision, target, or Go runtime material."
  }

  $previousGoOS = $env:GOOS
  $previousGoArch = $env:GOARCH
  $previousCGOEnabled = $env:CGO_ENABLED
  try {
    $env:GOOS = $GoOS
    $env:GOARCH = $GoArch
    $env:CGO_ENABLED = "0"
    $ldflags = "-s -w -X github.com/usememos/memos/internal/version.Version=$Version -X github.com/usememos/memos/internal/version.Commit=$gitRevision"
    & go build -trimpath -ldflags $ldflags -o $binaryPath ./cmd/memos
    if ($LASTEXITCODE -ne 0) {
      throw "go build failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Restore-EnvironmentValue -Name "GOOS" -Value $previousGoOS
    Restore-EnvironmentValue -Name "GOARCH" -Value $previousGoArch
    Restore-EnvironmentValue -Name "CGO_ENABLED" -Value $previousCGOEnabled
  }

    $releaseFiles = @{
      "LICENSE" = "LICENSE"
      "NOTICE" = "NOTICE"
      "TRADEMARKS.md" = "TRADEMARKS.md"
      "PRIVACY.md" = "PRIVACY.md"
      "docs/ADVERTISING.md" = "ADVERTISING.md"
      "scripts/windows/START-MemoArk.cmd" = "START-MemoArk.cmd"
      "scripts/windows/README-LOCAL-zh-CN.txt" = "README-LOCAL-zh-CN.txt"
    }
    foreach ($entry in $releaseFiles.GetEnumerator()) {
      $sourcePath = Join-Path $repositoryRoot $entry.Key
      Require-File $sourcePath
      Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $stagingDirectory $entry.Value) -Force
    }
  }
  finally {
    Pop-Location
  }

  $releasePayload = @(
    Get-ChildItem -LiteralPath $stagingDirectory -File -Recurse |
      Sort-Object FullName |
      ForEach-Object { Get-ReleaseFileRecord -Root $stagingDirectory -File $_ }
  )
  $releaseManifest = [ordered]@{
    format = "memoark.native-release"
    formatVersion = 1
    application = [ordered]@{
      name = "MemoArk"
      version = $Version
      gitRevision = $gitRevision
      target = "$GoOS/$GoArch"
      binary = $binaryName
    }
    build = [ordered]@{
      goToolchainVersion = $goToolchainVersion
    }
    localRuntime = [ordered]@{
      url = "http://127.0.0.1:5230/"
      dataDirectory = "%LOCALAPPDATA%\MemoArk"
      loopbackOnly = $true
    }
    archive = [ordered]@{
      fileName = $archiveName
      checksumFile = "$archiveName.sha256"
    }
    files = $releasePayload
  }
  $releaseManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $releaseManifestPath -Encoding UTF8

  $checksums = @(
    Get-ChildItem -LiteralPath $stagingDirectory -File -Recurse |
      Sort-Object FullName |
      ForEach-Object {
        $record = Get-ReleaseFileRecord -Root $stagingDirectory -File $_
        "{0} *{1}" -f $record.sha256, $record.path
      }
  )
  Set-Content -LiteralPath $checksumsPath -Value $checksums -Encoding ASCII

  $requiredArchiveEntries = @(
    $binaryName,
    "START-MemoArk.cmd",
    "README-LOCAL-zh-CN.txt",
    "LICENSE",
    "NOTICE",
    "TRADEMARKS.md",
    "PRIVACY.md",
    "ADVERTISING.md",
    "THIRD_PARTY_NOTICES",
    "sbom/SBOM.cdx.json",
    "RELEASE-MANIFEST.json",
    "SHA256SUMS.txt"
  )
  foreach ($entry in $requiredArchiveEntries) {
    Require-File (Join-Path $stagingDirectory $entry)
  }

  $archivePath = Join-Path $resolvedOutputDirectory $archiveName
  Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $stagingDirectory -Force | Select-Object -ExpandProperty FullName) -DestinationPath $archivePath -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $archiveEntries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    foreach ($entry in $requiredArchiveEntries) {
      if ($archiveEntries -notcontains $entry) {
        throw "Archive is missing required release file: $entry"
      }
    }
  }
  finally {
    $archive.Dispose()
  }

  $manifest = Get-Content -LiteralPath $releaseManifestPath -Raw | ConvertFrom-Json
  if ($manifest.application.version -ne $Version -or $manifest.application.gitRevision -ne $gitRevision -or
      $manifest.application.target -ne "$GoOS/$GoArch" -or $manifest.localRuntime.loopbackOnly -ne $true) {
    throw "Release manifest does not match the native package version, revision, target, or loopback-only runtime settings."
  }

  $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  $archiveChecksumPath = "$archivePath.sha256"
  Set-Content -LiteralPath $archiveChecksumPath -Value ("{0} *{1}" -f $archiveHash, $archiveName) -Encoding ASCII

  Write-Output "Created native release package: $archivePath"
  Write-Output "Created native release checksum: $archiveChecksumPath"
}
finally {
  if ($frontendBuildStarted) {
    $restoreOutput = & git -C $repositoryRoot restore --worktree --source=HEAD -- $frontendIndexRelativePath 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to restore the tracked frontend build placeholder: $($restoreOutput -join ' ')"
    }
  }
  $finalWorktreeStatus = (& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to verify the source worktree after native release packaging."
  }
  if (-not [string]::IsNullOrWhiteSpace(($finalWorktreeStatus -join "`n").Trim())) {
    throw "Native release packaging changed the source worktree. Inspect git status before using the archive."
  }
}
