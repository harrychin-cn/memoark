[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [int]$VersionCode = 0,
  [string]$OutputDirectory = "build/releases",
  [string]$SigningProfilePath = (Join-Path $env:LOCALAPPDATA "MemoArk\signing\android-release-profile.json")
)

$ErrorActionPreference = "Stop"

function Require-File {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required Android release input is missing: $Path"
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

if ($Version -notmatch "^[0-9A-Za-z][0-9A-Za-z._-]*$") {
  throw "Version may contain only letters, numbers, dots, underscores, and dashes."
}
if ($VersionCode -eq 0 -and $Version -match "-memoark\.(\d+)") {
  $VersionCode = [int]$Matches[1]
}
if ($VersionCode -le 0) {
  throw "VersionCode must be positive, or Version must end with -memoark.<number>."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$initialWorktreeStatus = (& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to determine the source worktree status."
}
if (-not [string]::IsNullOrWhiteSpace(($initialWorktreeStatus -join "`n").Trim())) {
  throw "Android releases require a clean source worktree. Commit, stash, or remove local changes first."
}
$gitRevision = (& git -C $repositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve the current Git revision."
}
$goToolchainVersion = (& go env GOVERSION).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($goToolchainVersion)) {
  throw "Unable to resolve the Go toolchain version."
}

$resolvedSigningProfilePath = [System.IO.Path]::GetFullPath($SigningProfilePath)
Require-File $resolvedSigningProfilePath
$signingProfile = Get-Content -LiteralPath $resolvedSigningProfilePath -Raw | ConvertFrom-Json
if ($signingProfile.format -ne "memoark.android-signing-profile" -or $signingProfile.formatVersion -ne 1) {
  throw "Unsupported Android signing profile: $resolvedSigningProfilePath"
}
$keystorePath = [System.IO.Path]::GetFullPath([string]$signingProfile.keystorePath)
Require-File $keystorePath
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $keystorePath).Hash.ToLowerInvariant() -ne $signingProfile.keystoreSha256) {
  throw "Android signing keystore does not match its profile."
}
$securePassword = ConvertTo-SecureString -String ([string]$signingProfile.encryptedPassword)
$signingPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
if ([string]::IsNullOrWhiteSpace($signingPassword)) {
  throw "Android signing password could not be decrypted for this Windows user."
}

$androidHome = if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
  [System.IO.Path]::GetFullPath($env:ANDROID_HOME)
} else {
  Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
Require-File (Join-Path $androidHome "platform-tools\adb.exe")
$buildToolsDirectory = @(
  Get-ChildItem -LiteralPath (Join-Path $androidHome "build-tools") -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "apksigner.bat") } |
    Sort-Object { [version]$_.Name } -Descending
)[0]
if ($null -eq $buildToolsDirectory) {
  throw "Android SDK Build Tools with apksigner were not found under $androidHome."
}
$apksigner = Join-Path $buildToolsDirectory.FullName "apksigner.bat"
$aapt = Join-Path $buildToolsDirectory.FullName "aapt2.exe"
Require-File $aapt
$gomobile = Get-Command gomobile -ErrorAction Stop

$resolvedOutputDirectory = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
}
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null
$stagingDirectory = Join-Path $resolvedOutputDirectory "memoark-$Version-android"
if (Test-Path -LiteralPath $stagingDirectory) {
  throw "Android release staging directory already exists: $stagingDirectory"
}
New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null

$assetPrefix = "MemoArk-$Version-Android"
$apkName = "$assetPrefix.apk"
$apkPath = Join-Path $resolvedOutputDirectory $apkName
$apkChecksumPath = "$apkPath.sha256"
$noticesName = "$assetPrefix-THIRD_PARTY_NOTICES.txt"
$noticesPath = Join-Path $resolvedOutputDirectory $noticesName
$sbomName = "$assetPrefix-SBOM.cdx.json"
$sbomPath = Join-Path $resolvedOutputDirectory $sbomName
$manifestName = "$assetPrefix-RELEASE-MANIFEST.json"
$manifestPath = Join-Path $resolvedOutputDirectory $manifestName
foreach ($path in @($apkPath, $apkChecksumPath, $noticesPath, $sbomPath, $manifestPath)) {
  if (Test-Path -LiteralPath $path) {
    throw "Android release output already exists: $path"
  }
}

$frontendIndexRelativePath = "server/router/frontend/dist/index.html"
$frontendIndex = Join-Path $repositoryRoot $frontendIndexRelativePath
$frontendBuildStarted = $false
$appAARDirectory = Join-Path $repositoryRoot "mobile\android\app\libs"
$appAARPath = Join-Path $appAARDirectory "mobilebackend.aar"
$appAARBackupPath = $null
$appAARPreviouslyExisted = $false
$environmentNames = @(
  "ANDROID_HOME",
  "ANDROID_NDK_HOME",
  "ORG_GRADLE_PROJECT_memoarkVersionName",
  "ORG_GRADLE_PROJECT_memoarkVersionCode",
  "ORG_GRADLE_PROJECT_memoarkKeystorePath",
  "ORG_GRADLE_PROJECT_memoarkKeystorePassword",
  "ORG_GRADLE_PROJECT_memoarkKeyAlias",
  "ORG_GRADLE_PROJECT_memoarkKeyPassword"
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
  Push-Location (Join-Path $repositoryRoot "web")
  try {
    $frontendBuildStarted = $true
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      # Windows PowerShell 5.1 converts native stderr into ErrorRecord objects.
      # pnpm can write normal lifecycle output there, so trust its exit code.
      $ErrorActionPreference = "Continue"
      & corepack pnpm install --frozen-lockfile
      $pnpmInstallExitCode = $LASTEXITCODE
      if ($pnpmInstallExitCode -eq 0) {
        & corepack pnpm release
        $pnpmReleaseExitCode = $LASTEXITCODE
      }
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($pnpmInstallExitCode -ne 0) {
      throw "pnpm install failed with exit code $pnpmInstallExitCode."
    }
    if ($pnpmReleaseExitCode -ne 0) {
      throw "pnpm release failed with exit code $pnpmReleaseExitCode."
    }
  }
  finally {
    Pop-Location
  }
  Require-File $frontendIndex

  $stagedNotices = Join-Path $stagingDirectory $noticesName
  $stagedSBOM = Join-Path $stagingDirectory $sbomName
  Push-Location $repositoryRoot
  try {
    & node scripts/compliance/generate-third-party-materials.mjs `
      --goos android `
      --goarch arm64 `
      --go-package ./mobile/backend `
      --cgo-enabled 1 `
      --go-toolchain-version $goToolchainVersion `
      --provenance release `
      --application-version $Version `
      --notices-output $stagedNotices `
      --sbom-output $stagedSBOM
    if ($LASTEXITCODE -ne 0) {
      throw "Android third-party material generation failed with exit code $LASTEXITCODE."
    }

    $aarDirectory = Join-Path $repositoryRoot ".local\android"
    New-Item -ItemType Directory -Path $aarDirectory -Force | Out-Null
    $aarPath = Join-Path $aarDirectory "mobilebackend-$Version.aar"
    $ldflags = "-s -w -X github.com/usememos/memos/internal/version.Version=$Version -X github.com/usememos/memos/internal/version.Commit=$gitRevision"
    Set-Item -Path Env:ANDROID_HOME -Value $androidHome
    & $gomobile.Source bind `
      -target=android `
      -androidapi 26 `
      -javapkg com.memoark.mobile `
      -ldflags $ldflags `
      -o $aarPath `
      ./mobile/backend
    if ($LASTEXITCODE -ne 0) {
      throw "gomobile bind failed with exit code $LASTEXITCODE."
    }
    Require-File $aarPath
    New-Item -ItemType Directory -Path $appAARDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $appAARPath -PathType Leaf) {
      $appAARPreviouslyExisted = $true
      $appAARBackupPath = Join-Path $aarDirectory ("mobilebackend.previous-{0}.aar" -f $PID)
      Copy-Item -LiteralPath $appAARPath -Destination $appAARBackupPath -Force
    }
    Copy-Item -LiteralPath $aarPath -Destination $appAARPath -Force

    Set-Item -Path Env:ORG_GRADLE_PROJECT_memoarkVersionName -Value $Version
    Set-Item -Path Env:ORG_GRADLE_PROJECT_memoarkVersionCode -Value $VersionCode
    Set-Item -Path Env:ORG_GRADLE_PROJECT_memoarkKeystorePath -Value $keystorePath
    Set-Item -Path Env:ORG_GRADLE_PROJECT_memoarkKeystorePassword -Value $signingPassword
    Set-Item -Path Env:ORG_GRADLE_PROJECT_memoarkKeyAlias -Value ([string]$signingProfile.keyAlias)
    Set-Item -Path Env:ORG_GRADLE_PROJECT_memoarkKeyPassword -Value $signingPassword
    $gradleWrapper = Join-Path $repositoryRoot "mobile\android\gradlew.bat"
    Require-File $gradleWrapper
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      # javac and Gradle report non-fatal warnings on stderr.
      $ErrorActionPreference = "Continue"
      & $gradleWrapper -p (Join-Path $repositoryRoot "mobile\android") clean assembleRelease --no-daemon
      $gradleExitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($gradleExitCode -ne 0) {
      throw "Android release build failed with exit code $gradleExitCode."
    }
  }
  finally {
    Pop-Location
  }

  $gradleAPK = Join-Path $repositoryRoot "mobile\android\app\build\outputs\apk\release\app-release.apk"
  Require-File $gradleAPK
  Copy-Item -LiteralPath $gradleAPK -Destination $apkPath

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 converts native stderr into ErrorRecord objects;
    # both tools are validated by their exit codes below.
    $ErrorActionPreference = "Continue"
    $signatureOutput = @(& $apksigner verify --verbose --print-certs $apkPath 2>&1)
    $signatureExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($signatureExitCode -ne 0) {
    throw "APK signature verification failed: $($signatureOutput -join ' ')"
  }
  $signatureDigestLine = @($signatureOutput | Where-Object { $_ -match "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)" })[0]
  if ($null -eq $signatureDigestLine) {
    throw "APK signer certificate digest was not reported."
  }
  $null = $signatureDigestLine -match "Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)"
  $certificateDigest = $Matches[1].ToLowerInvariant()

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $badging = @(& $aapt dump badging $apkPath 2>&1)
    $aaptExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($aaptExitCode -ne 0) {
    throw "Unable to inspect the APK manifest: $($badging -join ' ')"
  }
  $packageLine = @($badging | Where-Object { $_ -like "package:*" })[0]
  if ($packageLine -notmatch "name='com\.memoark\.app'" -or $packageLine -notmatch "versionCode='$VersionCode'" -or $packageLine -notmatch "versionName='$([regex]::Escape($Version))'") {
    throw "APK package, versionCode, or versionName is incorrect: $packageLine"
  }
  if (@($badging | Where-Object { $_ -match "^(?:minSdkVersion|sdkVersion):'26'$" }).Count -ne 1) {
    throw "APK minimum Android API is not 26."
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
  try {
    $abis = @(
      $archive.Entries |
        ForEach-Object {
          if ($_.FullName -match "^lib/([^/]+)/libgojni\.so$") { $Matches[1] }
        } |
        Sort-Object -Unique
    )
  }
  finally {
    $archive.Dispose()
  }
  $requiredABIs = @("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
  foreach ($abi in $requiredABIs) {
    if ($abis -notcontains $abi) {
      throw "APK is missing required ABI: $abi"
    }
  }

  $sourceSBOM = Get-Content -LiteralPath $stagedSBOM -Raw | ConvertFrom-Json
  $sourceProperties = @($sourceSBOM.metadata.properties)
  if (@($sourceProperties | Where-Object { $_.name -eq "memoark:go-package" })[0].value -ne "./mobile/backend" -or
      @($sourceProperties | Where-Object { $_.name -eq "memoark:cgo-enabled" })[0].value -ne "1" -or
      @($sourceProperties | Where-Object { $_.name -eq "memoark:go-target" })[0].value -ne "android/arm64") {
    throw "Android SBOM does not describe the mobile backend build."
  }

  Copy-Item -LiteralPath $stagedNotices -Destination $noticesPath
  Copy-Item -LiteralPath $stagedSBOM -Destination $sbomPath
  $releaseManifest = [ordered]@{
    format = "memoark.android-release"
    formatVersion = 1
    application = [ordered]@{
      name = "MemoArk"
      applicationId = "com.memoark.app"
      version = $Version
      versionCode = $VersionCode
      gitRevision = $gitRevision
      minimumAndroidAPI = 26
      targetAndroidAPI = 35
    }
    runtime = [ordered]@{
      backend = "embedded Go server"
      frontend = "embedded Vite application"
      database = "SQLite in application-private storage"
      localURL = "http://127.0.0.1:5230/"
      loopbackOnly = $true
      supportedABIs = $abis
    }
    signing = [ordered]@{
      scheme = "APK Signature Scheme v2"
      certificateSHA256 = $certificateDigest
    }
    files = @(
      [ordered]@{ path = $apkName; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath).Hash.ToLowerInvariant() },
      [ordered]@{ path = $noticesName; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $noticesPath).Hash.ToLowerInvariant() },
      [ordered]@{ path = $sbomName; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $sbomPath).Hash.ToLowerInvariant() }
    )
  }
  $releaseManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  $apkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $apkChecksumPath -Value ("{0} *{1}" -f $apkHash, $apkName) -Encoding ASCII

  Write-Output "Created signed Android APK: $apkPath"
  Write-Output "Created Android APK checksum: $apkChecksumPath"
  Write-Output "Created Android SBOM: $sbomPath"
  Write-Output "Created Android license disclosure: $noticesPath"
  Write-Output "APK signing certificate SHA-256: $certificateDigest"
}
finally {
  if ($appAARPreviouslyExisted -and -not [string]::IsNullOrWhiteSpace($appAARBackupPath) -and (Test-Path -LiteralPath $appAARBackupPath -PathType Leaf)) {
    Copy-Item -LiteralPath $appAARBackupPath -Destination $appAARPath -Force
  }
  elseif (Test-Path -LiteralPath $appAARPath -PathType Leaf) {
    Remove-Item -LiteralPath $appAARPath -Force
  }
  if (-not [string]::IsNullOrWhiteSpace($appAARBackupPath) -and (Test-Path -LiteralPath $appAARBackupPath -PathType Leaf)) {
    Remove-Item -LiteralPath $appAARBackupPath -Force
  }
  foreach ($name in $environmentNames) {
    Restore-EnvironmentValue -Name $name -Value $previousEnvironment[$name]
  }
  $signingPassword = $null
  if ($frontendBuildStarted) {
    $restoreOutput = & git -C $repositoryRoot restore --worktree --source=HEAD -- $frontendIndexRelativePath 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to restore the tracked frontend build placeholder: $($restoreOutput -join ' ')"
    }
  }
  $finalWorktreeStatus = (& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to verify the source worktree after Android release packaging."
  }
  if (-not [string]::IsNullOrWhiteSpace(($finalWorktreeStatus -join "`n").Trim())) {
    throw "Android release packaging changed the source worktree. Inspect git status before using the APK."
  }
}
