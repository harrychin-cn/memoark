[CmdletBinding()]
param(
  [string]$ProfilePath = (Join-Path $env:LOCALAPPDATA "MemoArk\signing\android-release-profile.json")
)

$ErrorActionPreference = "Stop"

$resolvedProfilePath = [System.IO.Path]::GetFullPath($ProfilePath)
if (Test-Path -LiteralPath $resolvedProfilePath) {
  throw "Android signing profile already exists: $resolvedProfilePath"
}

$signingDirectory = Split-Path -Parent $resolvedProfilePath
New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
$keystorePath = Join-Path $signingDirectory "memoark-android-release.p12"
if (Test-Path -LiteralPath $keystorePath) {
  throw "Android signing keystore already exists: $keystorePath"
}

$keytool = Get-Command keytool -ErrorAction Stop
$passwordBytes = [byte[]]::new(36)
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $randomNumberGenerator.GetBytes($passwordBytes)
}
finally {
  $randomNumberGenerator.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes)
$passwordVariable = "MEMOARK_ANDROID_INITIAL_SIGNING_PASSWORD"

try {
  Set-Item -Path "Env:$passwordVariable" -Value $password
  & $keytool.Source `
    -genkeypair `
    -noprompt `
    -storetype PKCS12 `
    -keystore $keystorePath `
    -alias memoark `
    -keyalg RSA `
    -keysize 3072 `
    -validity 10000 `
    -dname "CN=MemoArk Local Release, O=MemoArk, C=CN" `
    -storepass:env $passwordVariable `
    -keypass:env $passwordVariable
  if ($LASTEXITCODE -ne 0) {
    throw "keytool failed with exit code $LASTEXITCODE."
  }

  $securePassword = ConvertTo-SecureString -String $password -AsPlainText -Force
  $profile = [ordered]@{
    format = "memoark.android-signing-profile"
    formatVersion = 1
    keystorePath = $keystorePath
    keyAlias = "memoark"
    encryptedPassword = ConvertFrom-SecureString -SecureString $securePassword
    keystoreSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $keystorePath).Hash.ToLowerInvariant()
  }
  $profile | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $resolvedProfilePath -Encoding UTF8
}
catch {
  if (Test-Path -LiteralPath $resolvedProfilePath) {
    Remove-Item -LiteralPath $resolvedProfilePath -Force
  }
  if (Test-Path -LiteralPath $keystorePath) {
    Remove-Item -LiteralPath $keystorePath -Force
  }
  throw
}
finally {
  Remove-Item -Path "Env:$passwordVariable" -ErrorAction SilentlyContinue
  $password = $null
}

Write-Output "Created Android release signing profile: $resolvedProfilePath"
Write-Output "Created Android release keystore: $keystorePath"
Write-Output "Back up both files together; the encrypted password is bound to this Windows user."
