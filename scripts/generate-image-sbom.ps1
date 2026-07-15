[CmdletBinding()]
param(
  [string]$OutputPath,
  [string]$ProvenancePath,
  [string]$OciArchivePath,
  [string]$Platform = "linux/amd64",
  [string]$Version,
  [string]$Commit
)

$ErrorActionPreference = "Stop"

function Require-File {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required release input is missing: $Path"
  }
}

function Test-ItemIsReparsePoint {
  param([System.IO.FileSystemInfo]$Item)

  return (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
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

function Remove-TemporaryDirectorySafely {
  param(
    [string]$Path,
    [string]$TemporaryBase
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  Assert-NoReparsePoints -Path $TemporaryBase -Description "The temporary directory base"
  if (-not (Test-PathIsStrictChild -Candidate $Path -Parent $TemporaryBase)) {
    throw "Refusing to remove a temporary path outside the controlled directory: $Path"
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (Test-ItemIsReparsePoint -Item $item) {
    throw "Refusing to recursively remove a reparse-point temporary path: $Path"
  }

  foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) {
    $childItem = Get-Item -LiteralPath $child.FullName -Force
    if (Test-ItemIsReparsePoint -Item $childItem) {
      throw "Refusing to recursively remove a temporary directory containing a reparse point: $($childItem.FullName)"
    }
    if ($childItem.PSIsContainer) {
      Remove-TemporaryDirectorySafely -Path $childItem.FullName -TemporaryBase $TemporaryBase
    }
    else {
      [System.IO.File]::Delete($childItem.FullName)
    }
  }
  [System.IO.Directory]::Delete($Path, $false)
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dockerfilePath = Join-Path $repositoryRoot "scripts/Dockerfile"
Require-File $dockerfilePath
$dockerfile = Get-Content -LiteralPath $dockerfilePath -Raw
$dockerGoMatch = [regex]::Match($dockerfile, '(?im)^FROM\s+--platform=\$BUILDPLATFORM\s+golang:([0-9][0-9A-Za-z._+-]*)-alpine\s+AS\s+backend\s*$')
if (-not $dockerGoMatch.Success) {
  throw "Could not determine the Linux Go build toolchain from scripts/Dockerfile."
}
$expectedGoBuildToolchain = "go" + $dockerGoMatch.Groups[1].Value
$platformParts = $Platform.Split("/")
if ($platformParts.Count -lt 2 -or $platformParts.Count -gt 3 -or [string]::IsNullOrWhiteSpace($platformParts[0]) -or [string]::IsNullOrWhiteSpace($platformParts[1])) {
  throw "Platform must use <os>/<architecture> or <os>/arm/v5, <os>/arm/v6, or <os>/arm/v7."
}
$targetOS = $platformParts[0]
$targetArch = $platformParts[1]
$targetVariant = if ($platformParts.Count -eq 3) { $platformParts[2] } else { "" }
if ($targetOS -notmatch "^[a-z0-9_]+$" -or $targetArch -notmatch "^[a-z0-9_]+$" -or ($targetVariant -and $targetVariant -notmatch "^[a-z0-9_]+$")) {
  throw "Platform must use lowercase letters, numbers, or underscores only."
}
if ($targetOS -ne "linux") {
  throw "Only Linux OCI images are supported by this script."
}
if ($targetVariant -and ($targetArch -ne "arm" -or $targetVariant -notmatch "^v[567]$")) {
  throw "A platform variant is supported only for linux/arm/v5, linux/arm/v6, or linux/arm/v7."
}
if ($targetArch -eq "arm" -and -not $targetVariant) {
  throw "Use an explicit ARM platform variant, for example linux/arm/v7."
}
$targetPlatform = "$targetOS/$targetArch"
if ($targetVariant) {
  $targetPlatform += "/$targetVariant"
}
$targetFileSuffix = "$targetOS-$targetArch$targetVariant"

if ([string]::IsNullOrWhiteSpace($Commit)) {
  $Commit = (& git -C $repositoryRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the current Git revision."
  }
}
if ($Commit -notmatch "^[0-9a-fA-F]{7,64}$") {
  throw "Commit must be a Git SHA."
}
$Commit = (& git -C $repositoryRoot rev-parse "$Commit^{commit}").Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Commit does not resolve to a local Git commit."
}
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = "git-" + $Commit.Substring(0, 12)
}
if ($Version -notmatch "^[0-9A-Za-z][0-9A-Za-z._+-]*$") {
  throw "Version may contain only letters, numbers, dots, underscores, plus signs, and dashes."
}

$sourceSBOM = Join-Path $repositoryRoot "sbom/memoark-source-$targetFileSuffix.cdx.json"
$notices = Join-Path $repositoryRoot "notices/memoark-source-$targetFileSuffix.THIRD_PARTY_NOTICES"
Require-File $sourceSBOM
Require-File $notices

$sourceSBOMDocument = Get-Content -LiteralPath $sourceSBOM -Raw | ConvertFrom-Json
$sourceProperties = @($sourceSBOMDocument.metadata.properties)
$sourceTarget = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-target" })[0].value
$sourceVersion = @($sourceProperties | Where-Object { $_.name -eq "memoark:application-version" })[0].value
$sourceRevision = @($sourceProperties | Where-Object { $_.name -eq "memoark:git-revision" })[0].value
$sourceAnalysisToolchain = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-analysis-toolchain-version" })[0].value
$sourceBuildToolchain = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-build-toolchain-version" })[0].value
$sourceRuntimeLicenseHash = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-runtime-license-sha256" })[0].value
$sourceRuntimePatentsHash = @($sourceProperties | Where-Object { $_.name -eq "memoark:go-runtime-patents-sha256" })[0].value
$goRuntimeComponent = @($sourceSBOMDocument.components | Where-Object { $_.name -eq "Go standard library and runtime" })[0]
if ($sourceTarget -ne $targetPlatform) {
  throw "Source SBOM target mismatch: expected $targetPlatform, found $sourceTarget."
}
if ($sourceVersion -ne $Version) {
  throw "Source SBOM version mismatch: expected $Version, found $sourceVersion. Regenerate it with --provenance release --application-version $Version."
}
if ($sourceRevision -ne $Commit) {
  throw "Source SBOM Git revision mismatch: expected $Commit, found $sourceRevision. Regenerate it in an isolated release worktree from that commit."
}
if ([string]::IsNullOrWhiteSpace($sourceAnalysisToolchain) -or $sourceBuildToolchain -ne $expectedGoBuildToolchain) {
  throw "Source SBOM Go toolchain mismatch: expected binary build toolchain $expectedGoBuildToolchain. Regenerate it from the current Dockerfile."
}
if ([string]::IsNullOrWhiteSpace($sourceRuntimeLicenseHash) -or [string]::IsNullOrWhiteSpace($sourceRuntimePatentsHash) -or $null -eq $goRuntimeComponent) {
  throw "Source SBOM does not contain the required Go standard-library/runtime license and patents disclosure."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- application version: $Version" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match version $Version. Regenerate it with --provenance release --application-version $Version."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- git revision: $Commit" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match Git revision $Commit. Regenerate it in an isolated release worktree from that commit."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- Go target: $targetPlatform" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match target $targetPlatform. Regenerate it for that target."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- Go binary build toolchain: $expectedGoBuildToolchain" -Quiet) -or
    -not (Select-String -LiteralPath $notices -SimpleMatch "## golang-runtime: Go standard library and runtime@$($expectedGoBuildToolchain.Substring(2))" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match the current Docker Go build toolchain. Regenerate it from the current Dockerfile."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = "build/releases/memoark-$Version-$targetFileSuffix/sbom/memoark-image-$targetFileSuffix.spdx.json"
}
if ([string]::IsNullOrWhiteSpace($ProvenancePath)) {
  $outputParent = Split-Path -Parent $OutputPath
  $provenanceFileName = ([System.IO.Path]::GetFileNameWithoutExtension($OutputPath)) + ".provenance.json"
  $ProvenancePath = if ([string]::IsNullOrWhiteSpace($outputParent)) { $provenanceFileName } else { Join-Path $outputParent $provenanceFileName }
}
if ([string]::IsNullOrWhiteSpace($OciArchivePath)) {
  $outputParent = Split-Path -Parent $OutputPath
  $archiveFileName = "memoark-image-$targetFileSuffix.oci.tar"
  $OciArchivePath = if ([string]::IsNullOrWhiteSpace($outputParent)) { $archiveFileName } else { Join-Path $outputParent $archiveFileName }
}

$resolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  [System.IO.Path]::GetFullPath($OutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))
}

if ([System.IO.Path]::GetExtension($resolvedOutputPath) -ne ".json") {
  throw "OutputPath must end in .json."
}
$resolvedProvenancePath = if ([System.IO.Path]::IsPathRooted($ProvenancePath)) {
  [System.IO.Path]::GetFullPath($ProvenancePath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $ProvenancePath))
}
if ([System.IO.Path]::GetExtension($resolvedProvenancePath) -ne ".json") {
  throw "ProvenancePath must end in .json."
}
if ($resolvedOutputPath.Equals($resolvedProvenancePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputPath and ProvenancePath must be different files."
}
$resolvedOciArchivePath = if ([System.IO.Path]::IsPathRooted($OciArchivePath)) {
  [System.IO.Path]::GetFullPath($OciArchivePath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OciArchivePath))
}
if ([System.IO.Path]::GetExtension($resolvedOciArchivePath) -ne ".tar") {
  throw "OciArchivePath must end in .tar."
}
if ($resolvedOciArchivePath.Equals($resolvedOutputPath, [System.StringComparison]::OrdinalIgnoreCase) -or
    $resolvedOciArchivePath.Equals($resolvedProvenancePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OciArchivePath must be different from OutputPath and ProvenancePath."
}
if (Test-Path -LiteralPath $resolvedOciArchivePath) {
  throw "OCI archive output already exists: $resolvedOciArchivePath"
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("memoark-image-sbom-" + [System.Guid]::NewGuid().ToString("N"))
$ociOutput = $resolvedOciArchivePath
$metadataOutput = Join-Path $temporaryRoot "metadata.json"
$ociImageName = "memoark:sbom-$Commit"
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutputPath) -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedProvenancePath) -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOciArchivePath) -Force | Out-Null
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

function Read-OCIEntry {
  param([string]$Entry)

  $content = & tar -xOf $ociOutput $Entry
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read OCI archive entry: $Entry"
  }
  return ($content -join "`n")
}

function Read-OCIBlob {
  param([string]$Digest)

  return Read-OCIEntry ("blobs/sha256/" + $Digest.Replace("sha256:", ""))
}

Push-Location $repositoryRoot
try {
  # OCI output avoids the Windows symlink restriction of Buildx's local exporter,
  # while retaining the SPDX in-toto attestation as an ordinary archive blob.
  & docker buildx build `
    --platform $Platform `
    --sbom=true `
    --build-arg "COMPLIANCE_CHECK=true" `
    --build-arg "VERSION=$Version" `
    --build-arg "COMMIT=$Commit" `
    --metadata-file $metadataOutput `
    --output "type=oci,name=$ociImageName,dest=$ociOutput" `
    -f "scripts/Dockerfile" `
    .
  if ($LASTEXITCODE -ne 0) {
    throw "docker buildx build failed with exit code $LASTEXITCODE."
  }

  $rootIndex = Read-OCIEntry "index.json" | ConvertFrom-Json
  $platformIndexDescriptor = @($rootIndex.manifests | Select-Object -First 1)[0]
  if ($null -eq $platformIndexDescriptor) {
    throw "The OCI archive has no top-level image index."
  }
  $platformIndex = Read-OCIBlob $platformIndexDescriptor.digest | ConvertFrom-Json
  $imageManifestDescriptor = @(
    $platformIndex.manifests | Where-Object { $_.annotations.'vnd.docker.reference.type' -ne "attestation-manifest" }
  )[0]
  if ($null -eq $imageManifestDescriptor -or [string]::IsNullOrWhiteSpace([string]$imageManifestDescriptor.digest)) {
    throw "The OCI archive has no image manifest descriptor."
  }
  $attestationDescriptor = @(
    $platformIndex.manifests | Where-Object { $_.annotations.'vnd.docker.reference.type' -eq "attestation-manifest" }
  )[0]
  if ($null -eq $attestationDescriptor) {
    throw "Buildx did not attach an attestation manifest. Inspect $metadataOutput and verify that the active Buildx driver supports SBOM attestations."
  }
  $attestationReferenceDigest = [string]$attestationDescriptor.annotations.'vnd.docker.reference.digest'
  if ([string]::IsNullOrWhiteSpace($attestationReferenceDigest) -or $attestationReferenceDigest -ne [string]$imageManifestDescriptor.digest) {
    throw "The Buildx attestation manifest does not reference the OCI image manifest digest."
  }

  $attestationManifest = Read-OCIBlob $attestationDescriptor.digest | ConvertFrom-Json
  $spdxLayer = @(
    $attestationManifest.layers | Where-Object { $_.annotations.'in-toto.io/predicate-type' -eq "https://spdx.dev/Document" }
  )[0]
  if ($null -eq $spdxLayer) {
    throw "The Buildx attestation does not contain an SPDX predicate."
  }

  $statement = Read-OCIBlob $spdxLayer.digest | ConvertFrom-Json
  $sbomDocument = $statement.predicate
  if ([string]::IsNullOrWhiteSpace($sbomDocument.spdxVersion)) {
    throw "The Buildx SBOM predicate is not an SPDX document."
  }
  $statementSubject = @($statement.subject | Where-Object { $null -ne $_.digest -and -not [string]::IsNullOrWhiteSpace([string]$_.digest.sha256) })[0]
  if ($null -eq $statementSubject) {
    throw "The Buildx SBOM statement has no image subject digest."
  }
  $statementSubjectDigest = "sha256:" + [string]$statementSubject.digest.sha256
  if ($statementSubjectDigest -ne [string]$imageManifestDescriptor.digest) {
    throw "The Buildx SBOM statement subject does not match the OCI image manifest digest."
  }

  $normalizedSBOM = ($sbomDocument | ConvertTo-Json -Depth 100) -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($resolvedOutputPath, $normalizedSBOM, [System.Text.UTF8Encoding]::new($false))
  $provenance = [ordered]@{
    schemaVersion = 1
    artifact = "MemoArk Buildx image SBOM provenance"
    platform = $Platform
    version = $Version
    gitRevision = $Commit
    ociIndexDigest = [string]$platformIndexDescriptor.digest
    imageManifestDigest = [string]$imageManifestDescriptor.digest
    attestationManifestDigest = [string]$attestationDescriptor.digest
    attestationReferenceDigest = $attestationReferenceDigest
    spdxLayerDigest = [string]$spdxLayer.digest
    inTotoSubject = @($statement.subject)
    spdxSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutputPath).Hash.ToLowerInvariant()
    ociArchiveSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ociOutput).Hash.ToLowerInvariant()
    buildxMetadataSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $metadataOutput).Hash.ToLowerInvariant()
  }
  $provenanceContent = ($provenance | ConvertTo-Json -Depth 100) + "`n"
  [System.IO.File]::WriteAllText($resolvedProvenancePath, $provenanceContent, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Generated OCI image archive, SBOM, and provenance for $Platform, $Version, ${Commit}: $resolvedOciArchivePath; $resolvedOutputPath; $resolvedProvenancePath"
}
finally {
  Pop-Location
  $temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  Remove-TemporaryDirectorySafely -Path $temporaryRoot -TemporaryBase $temporaryBase
}
