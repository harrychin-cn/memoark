[CmdletBinding()]
param(
  [string]$OutputPath,
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
  throw "Source SBOM version mismatch: expected $Version, found $sourceVersion. Regenerate it with --application-version $Version."
}
if ($sourceRevision -ne $Commit) {
  throw "Source SBOM Git revision mismatch: expected $Commit, found $sourceRevision. Regenerate it from that commit."
}
if ([string]::IsNullOrWhiteSpace($sourceAnalysisToolchain) -or $sourceBuildToolchain -ne $expectedGoBuildToolchain) {
  throw "Source SBOM Go toolchain mismatch: expected binary build toolchain $expectedGoBuildToolchain. Regenerate it from the current Dockerfile."
}
if ([string]::IsNullOrWhiteSpace($sourceRuntimeLicenseHash) -or [string]::IsNullOrWhiteSpace($sourceRuntimePatentsHash) -or $null -eq $goRuntimeComponent) {
  throw "Source SBOM does not contain the required Go standard-library/runtime license and patents disclosure."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- application version: $Version" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match version $Version. Regenerate it with --application-version $Version."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- git revision: $Commit" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match Git revision $Commit. Regenerate it from that commit."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- Go target: $targetPlatform" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match target $targetPlatform. Regenerate it for that target."
}
if (-not (Select-String -LiteralPath $notices -SimpleMatch "- Go binary build toolchain: $expectedGoBuildToolchain" -Quiet) -or
    -not (Select-String -LiteralPath $notices -SimpleMatch "## golang-runtime: Go standard library and runtime@$($expectedGoBuildToolchain.Substring(2))" -Quiet)) {
  throw "Target-specific THIRD_PARTY_NOTICES does not match the current Docker Go build toolchain. Regenerate it from the current Dockerfile."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = "sbom/memoark-image-$targetFileSuffix.spdx.json"
}

$resolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  [System.IO.Path]::GetFullPath($OutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))
}

if ([System.IO.Path]::GetExtension($resolvedOutputPath) -ne ".json") {
  throw "OutputPath must end in .json."
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("memoark-image-sbom-" + [System.Guid]::NewGuid().ToString("N"))
$ociOutput = Join-Path $temporaryRoot "memoark-image.oci.tar"
$metadataOutput = Join-Path $temporaryRoot "metadata.json"
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
    --output "type=oci,dest=$ociOutput" `
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
  $attestationDescriptor = @(
    $platformIndex.manifests | Where-Object { $_.annotations.'vnd.docker.reference.type' -eq "attestation-manifest" }
  )[0]
  if ($null -eq $attestationDescriptor) {
    throw "Buildx did not attach an attestation manifest. Inspect $metadataOutput and verify that the active Buildx driver supports SBOM attestations."
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

  New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutputPath) -Force | Out-Null
  $normalizedSBOM = ($sbomDocument | ConvertTo-Json -Depth 100) -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($resolvedOutputPath, $normalizedSBOM, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Generated image SBOM for $Platform, $Version, ${Commit}: $resolvedOutputPath"
}
finally {
  Pop-Location
  $temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
  if ($resolvedTemporaryRoot.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemporaryRoot)) {
    Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
  }
}
