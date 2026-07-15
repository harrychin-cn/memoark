[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[0-9A-Za-z][0-9A-Za-z._+-]*$")]
  [string]$Version,
  [ValidateSet("linux/amd64", "linux/arm64", "linux/arm/v7")]
  [string[]]$Platform = @("linux/amd64"),
  [string]$OutputDirectory = "build/releases"
)

$ErrorActionPreference = "Stop"

function Require-File {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required release input is missing: $Path"
  }
}

function Assert-LastExitCode {
  param([string]$Description)

  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Get-GitValue {
  param(
    [string]$RepositoryRoot,
    [string[]]$Arguments
  )

  $output = & git -C $RepositoryRoot @Arguments
  Assert-LastExitCode "git $($Arguments -join ' ')"
  return ($output -join "`n").Trim()
}

function Get-WorktreeStatus {
  param([string]$RepositoryRoot)

  $output = & git -C $RepositoryRoot status --porcelain=v1 --untracked-files=all
  Assert-LastExitCode "git status"
  return ($output -join "`n").Trim()
}

function Get-TargetMetadata {
  param([string]$TargetPlatform)

  switch ($TargetPlatform) {
    "linux/amd64" {
      return [pscustomobject]@{
        Platform = "linux/amd64"
        GoOS = "linux"
        GoArch = "amd64"
        GoArm = ""
        FileSuffix = "linux-amd64"
      }
    }
    "linux/arm64" {
      return [pscustomobject]@{
        Platform = "linux/arm64"
        GoOS = "linux"
        GoArch = "arm64"
        GoArm = ""
        FileSuffix = "linux-arm64"
      }
    }
    "linux/arm/v7" {
      return [pscustomobject]@{
        Platform = "linux/arm/v7"
        GoOS = "linux"
        GoArch = "arm"
        GoArm = "7"
        FileSuffix = "linux-armv7"
      }
    }
    default {
      throw "Unsupported Linux platform: $TargetPlatform"
    }
  }
}

function Test-ItemIsReparsePoint {
  param([System.IO.FileSystemInfo]$Item)

  return (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
}

function Assert-NoReparsePoints {
  param(
    [string]$Path,
    [string]$Description
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $rootPath = [System.IO.Path]::GetPathRoot($fullPath)
  $relativePath = $fullPath.Substring($rootPath.Length).Trim('\', '/')
  $currentPath = $rootPath

  if (Test-Path -LiteralPath $currentPath) {
    $rootItem = Get-Item -LiteralPath $currentPath -Force
    if (Test-ItemIsReparsePoint -Item $rootItem) {
      throw "$Description contains a reparse point: $currentPath"
    }
  }

  foreach ($segment in @($relativePath -split '[\\/]' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
    $currentPath = Join-Path $currentPath $segment
    if (-not (Test-Path -LiteralPath $currentPath)) {
      break
    }
    $item = Get-Item -LiteralPath $currentPath -Force
    if (Test-ItemIsReparsePoint -Item $item) {
      throw "$Description contains a reparse point: $currentPath"
    }
  }
}

function Test-PathIsStrictChild {
  param(
    [string]$Candidate,
    [string]$Parent
  )

  $candidatePath = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  return $candidatePath.StartsWith($parentPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-PathIsWithin {
  param(
    [string]$Candidate,
    [string]$Parent
  )

  $candidatePath = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  return $candidatePath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Test-PathIsStrictChild -Candidate $candidatePath -Parent $parentPath)
}

function Get-RelativeChildPath {
  param(
    [string]$Parent,
    [string]$Path
  )

  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  $childPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  if ($childPath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return "."
  }
  if (-not $childPath.StartsWith($parentPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is not inside the requested parent: $Path"
  }
  return $childPath.Substring($parentPath.Length + 1)
}

function Test-GitPathIsIgnored {
  param(
    [string]$RepositoryRoot,
    [string]$Path
  )

  $relativePath = Get-RelativeChildPath -Parent $RepositoryRoot -Path $Path
  if ($relativePath -eq ".") {
    return $false
  }

  & git -C $RepositoryRoot check-ignore --quiet --no-index -- $relativePath
  switch ($LASTEXITCODE) {
    0 { return $true }
    1 { return $false }
    default { throw "Unable to determine whether release output is ignored by Git: $Path" }
  }
}

function Remove-DirectoryTreeSafely {
  param(
    [string]$Path,
    [string]$ControlledParent
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  Assert-NoReparsePoints -Path $ControlledParent -Description "The controlled release directory"
  if (-not (Test-PathIsStrictChild -Candidate $Path -Parent $ControlledParent)) {
    throw "Refusing to remove a release path outside its controlled directory: $Path"
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (Test-ItemIsReparsePoint -Item $item) {
    throw "Refusing to recursively remove a reparse point: $Path"
  }

  $reparseChildren = @()
  $regularChildren = @()
  foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) {
    $childItem = Get-Item -LiteralPath $child.FullName -Force
    if (Test-ItemIsReparsePoint -Item $childItem) {
      $reparseChildren += $childItem
    }
    else {
      $regularChildren += $childItem
    }
  }

  # Remove links before their targets so pnpm junctions never become dangling
  # while this cleanup routine is still enumerating the tree.
  foreach ($childItem in $reparseChildren) {
    if ($childItem.PSIsContainer) {
      [System.IO.Directory]::Delete($childItem.FullName, $false)
    }
    else {
      [System.IO.File]::Delete($childItem.FullName)
    }
  }
  foreach ($childItem in $regularChildren) {
    if ($childItem.PSIsContainer) {
      Remove-DirectoryTreeSafely -Path $childItem.FullName -ControlledParent $ControlledParent
    }
    else {
      [System.IO.File]::Delete($childItem.FullName)
    }
  }
  [System.IO.Directory]::Delete($Path, $false)
}

function Remove-DisposableWorktree {
  param(
    [string]$RepositoryRoot,
    [string]$WorktreeDirectory,
    [string]$WorktreeParent
  )

  Assert-NoReparsePoints -Path $WorktreeParent -Description "The disposable worktree directory"
  if (-not (Test-PathIsStrictChild -Candidate $WorktreeDirectory -Parent $WorktreeParent)) {
    throw "Refusing to remove a release worktree outside its controlled directory: $WorktreeDirectory"
  }

  if (Test-Path -LiteralPath $WorktreeDirectory) {
    # Git can fail to unlink long pnpm paths on Windows. Treat that failure as
    # recoverable so the guarded two-pass cleanup below can remove the exact
    # disposable worktree rather than letting ErrorActionPreference abort first.
    $removeOutput = @()
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $removeOutput = & git -C $RepositoryRoot worktree remove --force $WorktreeDirectory 2>&1
      $removeExitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if (Test-Path -LiteralPath $WorktreeDirectory) {
      Remove-DirectoryTreeSafely -Path $WorktreeDirectory -ControlledParent $WorktreeParent
    }
    if ($removeExitCode -ne 0) {
      Write-Verbose "git worktree remove reported exit code $removeExitCode after the release worktree was safely removed: $($removeOutput -join ' ')"
    }
  }

  & git -C $RepositoryRoot worktree prune
  Assert-LastExitCode "git worktree prune"
  if (Test-Path -LiteralPath $WorktreeDirectory) {
    throw "Unable to remove the disposable release worktree: $WorktreeDirectory"
  }
}

function Remove-ReleaseLock {
  param(
    [string]$LockPath,
    [string]$OutputDirectory
  )

  if (-not (Test-Path -LiteralPath $LockPath)) {
    return
  }
  Assert-NoReparsePoints -Path $OutputDirectory -Description "The release output directory"
  if (-not (Test-PathIsStrictChild -Candidate $LockPath -Parent $OutputDirectory)) {
    throw "Refusing to remove a release lock outside the release output directory: $LockPath"
  }
  $lockItem = Get-Item -LiteralPath $LockPath -Force
  if (Test-ItemIsReparsePoint -Item $lockItem) {
    throw "Refusing to remove a reparse-point release lock: $LockPath"
  }
  Remove-Item -LiteralPath $LockPath -Force
}

function Get-MemoArkContainerSnapshot {
  $output = & docker inspect memoark-local 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    $errorText = ($output | ForEach-Object { $_.ToString() } | Out-String).Trim()
    if ($errorText -match '(?i)no such object|no such container') {
      return "<absent>"
    }
    throw "Unable to inspect memoark-local (exit code $exitCode): $errorText"
  }

  $containers = ($output -join "`n") | ConvertFrom-Json
  if (@($containers).Count -ne 1) {
    throw "Expected exactly one memoark-local container from docker inspect."
  }
  $container = @($containers)[0]
  $ports = @()
  foreach ($property in @($container.NetworkSettings.Ports.PSObject.Properties | Sort-Object Name)) {
    $bindings = @()
    if ($null -ne $property.Value) {
      foreach ($binding in @($property.Value)) {
        $bindings += [ordered]@{
          HostIp = [string]$binding.HostIp
          HostPort = [string]$binding.HostPort
        }
      }
    }
    $ports += [ordered]@{
      ContainerPort = $property.Name
      Bindings = $bindings
    }
  }

  $mounts = @()
  foreach ($mount in @($container.Mounts | Sort-Object Destination)) {
    $mounts += [ordered]@{
      Type = [string]$mount.Type
      Source = [string]$mount.Source
      Destination = [string]$mount.Destination
      ReadWrite = [bool]$mount.RW
    }
  }

  $snapshot = [ordered]@{
    Id = [string]$container.Id
    ImageId = [string]$container.Image
    ImageName = [string]$container.Config.Image
    State = [ordered]@{
      Status = [string]$container.State.Status
      Running = [bool]$container.State.Running
      StartedAt = [string]$container.State.StartedAt
      RestartCount = [long]$container.RestartCount
      Health = if ($null -eq $container.State.Health) { "" } else { [string]$container.State.Health.Status }
    }
    Ports = $ports
    Mounts = $mounts
    RestartPolicy = [ordered]@{
      Name = [string]$container.HostConfig.RestartPolicy.Name
      MaximumRetryCount = [int]$container.HostConfig.RestartPolicy.MaximumRetryCount
    }
  }
  return ($snapshot | ConvertTo-Json -Depth 10 -Compress)
}

function Write-ReleaseManifest {
  param(
    [string]$Directory,
    [string]$ReleaseVersion,
    [string]$GitRevision,
    [object[]]$Artifacts
  )

  $manifest = [ordered]@{
    schemaVersion = 2
    artifact = "MemoArk container release artifact"
    version = $ReleaseVersion
    gitRevision = $GitRevision
    generatedAt = [DateTime]::UtcNow.ToString("o")
    platforms = $Artifacts
  }
  $manifestPath = Join-Path $Directory "release-manifest.json"
  $manifestContent = ($manifest | ConvertTo-Json -Depth 12) + "`n"
  [System.IO.File]::WriteAllText($manifestPath, $manifestContent, [System.Text.UTF8Encoding]::new($false))

  $checksumLines = foreach ($file in @(Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName)) {
    $relativePath = $file.FullName.Substring($Directory.Length).TrimStart('\', '/') -replace '\\', '/'
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
    "$hash  $relativePath"
  }
  [System.IO.File]::WriteAllText((Join-Path $Directory "SHA256SUMS"), (($checksumLines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Assert-NoReparsePoints -Path $repositoryRoot -Description "The source repository"
$worktreeStatus = Get-WorktreeStatus -RepositoryRoot $repositoryRoot
if (-not [string]::IsNullOrWhiteSpace($worktreeStatus)) {
  throw "Container releases require a clean source worktree. Commit, stash, or remove local changes first."
}
if ($Platform.Count -eq 0) {
  throw "Specify at least one Linux platform."
}

$gitRevision = Get-GitValue -RepositoryRoot $repositoryRoot -Arguments @("rev-parse", "HEAD")
$shortRevision = $gitRevision.Substring(0, 12)
$resolvedOutputDirectory = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
}
$runtimeDataDirectory = Join-Path $repositoryRoot ".local\data"
Assert-NoReparsePoints -Path $runtimeDataDirectory -Description "The live runtime data directory"
Assert-NoReparsePoints -Path $resolvedOutputDirectory -Description "The release output directory"
if (Test-PathIsWithin -Candidate $resolvedOutputDirectory -Parent $runtimeDataDirectory) {
  throw "OutputDirectory must not be the live runtime data directory or one of its children: $runtimeDataDirectory"
}
if ((Test-PathIsWithin -Candidate $resolvedOutputDirectory -Parent $repositoryRoot) -and
    -not (Test-GitPathIsIgnored -RepositoryRoot $repositoryRoot -Path $resolvedOutputDirectory)) {
  throw "OutputDirectory inside the source repository must be ignored by Git: $resolvedOutputDirectory"
}
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null
Assert-NoReparsePoints -Path $resolvedOutputDirectory -Description "The release output directory"

$releaseDirectoryName = "memoark-$Version-$shortRevision"
$releaseDirectory = Join-Path $resolvedOutputDirectory $releaseDirectoryName
$releaseLockPath = "$releaseDirectory.lock"
if (Test-Path -LiteralPath $releaseDirectory) {
  throw "Release output already exists: $releaseDirectory. Choose a new version or inspect and remove the existing release record."
}

$releaseId = [System.Guid]::NewGuid().ToString("N")
$worktreeParent = Join-Path (Split-Path -Parent $repositoryRoot) ".memoark-release-worktrees"
$worktreeDirectory = Join-Path $worktreeParent ("container-release-" + $releaseId)
$partialDirectory = Join-Path $resolvedOutputDirectory (".partial-" + $releaseDirectoryName + "-" + $releaseId)
$worktreeAdded = $false
$releaseCompleted = $false
$initialContainerSnapshot = $null
$artifacts = @()
$releaseLockStream = $null
$releaseLockCreated = $false

try {
  try {
    $releaseLockStream = [System.IO.File]::Open(
      $releaseLockPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  }
  catch [System.IO.IOException] {
    throw "A release lock already exists or cannot be created: $releaseLockPath"
  }
  $releaseLockCreated = $true
  $lockContent = "MemoArk container release lock`nversion=$Version`ngitRevision=$gitRevision`ncreatedAt=$([DateTime]::UtcNow.ToString('o'))`n"
  $lockBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($lockContent)
  $releaseLockStream.Write($lockBytes, 0, $lockBytes.Length)
  $releaseLockStream.Flush()
  if (Test-Path -LiteralPath $releaseDirectory) {
    throw "Release output already exists: $releaseDirectory. Choose a new version or inspect and remove the existing release record."
  }

  $null = & docker version --format "{{.Server.Version}}"
  Assert-LastExitCode "docker version"
  $initialContainerSnapshot = Get-MemoArkContainerSnapshot

  Assert-NoReparsePoints -Path $worktreeParent -Description "The disposable worktree directory"
  New-Item -ItemType Directory -Path $worktreeParent -Force | Out-Null
  Assert-NoReparsePoints -Path $worktreeParent -Description "The disposable worktree directory"
  $worktreeAdded = $true
  & git -C $repositoryRoot worktree add --detach $worktreeDirectory $gitRevision
  Assert-LastExitCode "git worktree add"

  if ((Get-GitValue -RepositoryRoot $worktreeDirectory -Arguments @("rev-parse", "HEAD")) -ne $gitRevision -or
      -not [string]::IsNullOrWhiteSpace((Get-WorktreeStatus -RepositoryRoot $worktreeDirectory))) {
    throw "The disposable release worktree is not a clean checkout of $gitRevision."
  }

  Push-Location (Join-Path $worktreeDirectory "web")
  try {
    & corepack pnpm install --frozen-lockfile
    Assert-LastExitCode "pnpm install"
    & corepack pnpm lint
    Assert-LastExitCode "pnpm lint"
    & corepack pnpm test
    Assert-LastExitCode "pnpm test"
    & corepack pnpm release
    Assert-LastExitCode "pnpm release"
  }
  finally {
    Pop-Location
  }

  Push-Location $worktreeDirectory
  try {
    & go mod tidy "-go=1.26.2" -diff
    Assert-LastExitCode "go mod tidy -diff"
    # Store integration tests create database containers. The store test harness
    # invokes nested `go test` processes per driver, so GOFLAGS is deliberately
    # scoped here to make their individual test cases serial as well.
    $originalGoFlags = $env:GOFLAGS
    try {
      $env:GOFLAGS = "-parallel=1"
      & go test -count=1 -p 1 ./...
      Assert-LastExitCode "GOFLAGS=-parallel=1 go test -count=1 -p 1 ./..."
    }
    finally {
      $env:GOFLAGS = $originalGoFlags
    }
  }
  finally {
    Pop-Location
  }

  if (-not (Test-PathIsStrictChild -Candidate $partialDirectory -Parent $resolvedOutputDirectory)) {
    throw "Release partial directory must be inside the release output directory: $partialDirectory"
  }
  New-Item -ItemType Directory -Path (Join-Path $partialDirectory "notices") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $partialDirectory "sbom") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $partialDirectory "images") -Force | Out-Null

  foreach ($requestedPlatform in @($Platform | Select-Object -Unique)) {
    $target = Get-TargetMetadata -TargetPlatform $requestedPlatform
    $noticeRelativePath = Join-Path "notices" ("memoark-source-" + $target.FileSuffix + ".THIRD_PARTY_NOTICES")
    $sourceSbomRelativePath = Join-Path "sbom" ("memoark-source-" + $target.FileSuffix + ".cdx.json")
    $generatorArguments = @(
      "scripts/compliance/generate-third-party-materials.mjs",
      "--provenance", "release",
      "--application-version", $Version,
      "--goos", $target.GoOS,
      "--goarch", $target.GoArch,
      "--notices-output", $noticeRelativePath,
      "--sbom-output", $sourceSbomRelativePath
    )
    if (-not [string]::IsNullOrWhiteSpace($target.GoArm)) {
      $generatorArguments += @("--goarm", $target.GoArm)
    }

    Push-Location $worktreeDirectory
    try {
      & node @generatorArguments
      Assert-LastExitCode "release third-party material generation for $requestedPlatform"
      $verificationArguments = @($generatorArguments)
      $verificationArguments += "--check"
      & node @verificationArguments
      Assert-LastExitCode "release third-party material verification for $requestedPlatform"
    }
    finally {
      Pop-Location
    }

    $worktreeNotice = Join-Path $worktreeDirectory $noticeRelativePath
    $worktreeSourceSbom = Join-Path $worktreeDirectory $sourceSbomRelativePath
    $imageSbomRelativePath = Join-Path "sbom" ("memoark-image-" + $target.FileSuffix + ".spdx.json")
    $imageSbomProvenanceRelativePath = Join-Path "sbom" ("memoark-image-" + $target.FileSuffix + ".spdx.provenance.json")
    $imageOciArchiveRelativePath = Join-Path "images" ("memoark-image-" + $target.FileSuffix + ".oci.tar")
    $imageSbomPath = Join-Path $partialDirectory $imageSbomRelativePath
    $imageSbomProvenancePath = Join-Path $partialDirectory $imageSbomProvenanceRelativePath
    $imageOciArchivePath = Join-Path $partialDirectory $imageOciArchiveRelativePath
    Require-File $worktreeNotice
    Require-File $worktreeSourceSbom

    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $worktreeDirectory "scripts\generate-image-sbom.ps1") `
      -Platform $target.Platform `
      -Version $Version `
      -Commit $gitRevision `
      -OutputPath $imageSbomPath `
      -ProvenancePath $imageSbomProvenancePath `
      -OciArchivePath $imageOciArchivePath
    Assert-LastExitCode "strict image SBOM build for $requestedPlatform"
    Require-File $imageSbomPath
    Require-File $imageSbomProvenancePath
    Require-File $imageOciArchivePath

    $imageSbomProvenance = Get-Content -LiteralPath $imageSbomProvenancePath -Raw | ConvertFrom-Json
    foreach ($requiredDigest in @("ociIndexDigest", "imageManifestDigest", "attestationManifestDigest", "attestationReferenceDigest", "spdxLayerDigest", "ociArchiveSha256")) {
      if ([string]::IsNullOrWhiteSpace([string]$imageSbomProvenance.$requiredDigest)) {
        throw "Image SBOM provenance is missing $requiredDigest for $requestedPlatform."
      }
    }
    if ([string]$imageSbomProvenance.attestationReferenceDigest -ne [string]$imageSbomProvenance.imageManifestDigest) {
      throw "Image SBOM provenance attestation reference does not match the image manifest for $requestedPlatform."
    }
    $imageOciArchiveSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $imageOciArchivePath).Hash.ToLowerInvariant()
    if ([string]$imageSbomProvenance.ociArchiveSha256 -ne $imageOciArchiveSha256) {
      throw "Image SBOM provenance OCI archive checksum does not match the retained archive for $requestedPlatform."
    }

    Copy-Item -LiteralPath $worktreeNotice -Destination (Join-Path $partialDirectory $noticeRelativePath) -Force
    Copy-Item -LiteralPath $worktreeSourceSbom -Destination (Join-Path $partialDirectory $sourceSbomRelativePath) -Force
    $artifacts += [ordered]@{
      platform = $target.Platform
      sourceNotice = $noticeRelativePath.Replace('\', '/')
      sourceSbom = $sourceSbomRelativePath.Replace('\', '/')
      ociArchive = $imageOciArchiveRelativePath.Replace('\', '/')
      ociArchiveSha256 = $imageOciArchiveSha256
      imageSbom = $imageSbomRelativePath.Replace('\', '/')
      imageSbomProvenance = $imageSbomProvenanceRelativePath.Replace('\', '/')
      ociIndexDigest = [string]$imageSbomProvenance.ociIndexDigest
      imageManifestDigest = [string]$imageSbomProvenance.imageManifestDigest
      attestationManifestDigest = [string]$imageSbomProvenance.attestationManifestDigest
      attestationReferenceDigest = [string]$imageSbomProvenance.attestationReferenceDigest
      spdxLayerDigest = [string]$imageSbomProvenance.spdxLayerDigest
    }
  }

  Write-ReleaseManifest -Directory $partialDirectory -ReleaseVersion $Version -GitRevision $gitRevision -Artifacts $artifacts
  Remove-DisposableWorktree -RepositoryRoot $repositoryRoot -WorktreeDirectory $worktreeDirectory -WorktreeParent $worktreeParent
  $worktreeAdded = $false
  if ((Get-MemoArkContainerSnapshot) -ne $initialContainerSnapshot) {
    throw "memoark-local changed during container release preparation. The release record was not published."
  }
  if ((Get-GitValue -RepositoryRoot $repositoryRoot -Arguments @("rev-parse", "HEAD")) -ne $gitRevision -or
      -not [string]::IsNullOrWhiteSpace((Get-WorktreeStatus -RepositoryRoot $repositoryRoot))) {
    throw "The source worktree changed while preparing the container release. The release record was not published."
  }
  if (Test-Path -LiteralPath $releaseDirectory) {
    throw "Release output appeared while preparing the release record: $releaseDirectory"
  }
  [System.IO.Directory]::Move($partialDirectory, $releaseDirectory)
  $releaseCompleted = $true
}
finally {
  $cleanupFailures = @()
  if ($worktreeAdded -or (Test-Path -LiteralPath $worktreeDirectory)) {
    try {
      Remove-DisposableWorktree -RepositoryRoot $repositoryRoot -WorktreeDirectory $worktreeDirectory -WorktreeParent $worktreeParent
      $worktreeAdded = $false
    }
    catch {
      $cleanupFailures += "Unable to remove the disposable release worktree: $($_.Exception.Message)"
    }
  }
  if ((Test-Path -LiteralPath $worktreeParent) -and -not (Get-ChildItem -LiteralPath $worktreeParent -Force | Select-Object -First 1)) {
    try {
      Assert-NoReparsePoints -Path $worktreeParent -Description "The disposable worktree directory"
      $worktreeParentItem = Get-Item -LiteralPath $worktreeParent -Force
      if (Test-ItemIsReparsePoint -Item $worktreeParentItem) {
        throw "Refusing to remove a reparse-point disposable worktree directory: $worktreeParent"
      }
      Remove-Item -LiteralPath $worktreeParent -Force
    }
    catch {
      $cleanupFailures += "Unable to remove the empty disposable worktree directory: $($_.Exception.Message)"
    }
  }
  if (-not $releaseCompleted -and (Test-Path -LiteralPath $partialDirectory)) {
    try {
      Remove-DirectoryTreeSafely -Path $partialDirectory -ControlledParent $resolvedOutputDirectory
    }
    catch {
      $cleanupFailures += "Unable to remove the partial release record: $($_.Exception.Message)"
    }
  }
  if (-not $releaseCompleted -and $null -ne $initialContainerSnapshot) {
    try {
      if ((Get-MemoArkContainerSnapshot) -ne $initialContainerSnapshot) {
        $cleanupFailures += "memoark-local changed during container release preparation. Inspect its state before any further release action."
      }
    }
    catch {
      $cleanupFailures += "Unable to verify memoark-local after the failed release preparation: $($_.Exception.Message)"
    }
  }
  if (-not $releaseCompleted) {
    try {
      if ((Get-GitValue -RepositoryRoot $repositoryRoot -Arguments @("rev-parse", "HEAD")) -ne $gitRevision -or
          -not [string]::IsNullOrWhiteSpace((Get-WorktreeStatus -RepositoryRoot $repositoryRoot))) {
        $cleanupFailures += "The source worktree changed while preparing the container release. Inspect git status before any further release action."
      }
    }
    catch {
      $cleanupFailures += "Unable to verify the source worktree after the failed release preparation: $($_.Exception.Message)"
    }
  }
  if ($null -ne $releaseLockStream) {
    try {
      $releaseLockStream.Dispose()
    }
    catch {
      $cleanupFailures += "Unable to close the release lock: $($_.Exception.Message)"
    }
  }
  if ($releaseLockCreated) {
    try {
      Remove-ReleaseLock -LockPath $releaseLockPath -OutputDirectory $resolvedOutputDirectory
    }
    catch {
      $cleanupFailures += "Unable to remove the release lock: $($_.Exception.Message)"
    }
  }
  if ($cleanupFailures.Count -gt 0) {
    throw ($cleanupFailures -join "`n")
  }
}

Write-Output "Created strict container release record: $releaseDirectory"
