# Distribution compliance / 发行合规

## What each artifact carries / 各发行物携带的文件

Every MemoArk native Windows archive contains:

- `LICENSE`: source-code license and upstream copyright terms;
- `NOTICE`: MemoArk and Memos provenance notice;
- `TRADEMARKS.md`: project identity and non-endorsement rules;
- `PRIVACY.md`: self-hosted privacy statement;
- `ADVERTISING.md`: advertising, sponsorship, and affiliate disclosure rules;
- `THIRD_PARTY_NOTICES`: target-specific MemoArk application dependency notices;
- `sbom/SBOM.cdx.json`: target-specific CycloneDX source-build SBOM.

Every MemoArk-maintained Linux container image contains the first six documents plus
`/usr/local/memos/sbom.cdx.json`, its matching **application source-build** SBOM. For an
image, the shipped `THIRD_PARTY_NOTICES` is copied from the matching target-specific file under
`notices/`; the root `THIRD_PARTY_NOTICES` is the default Linux/amd64 audit copy. The
container image's separate SPDX SBOM includes Alpine and other operating-system packages;
release publishing must attach that SBOM to the exact image digest with Buildx `--sbom=true`.
It is not interchangeable with the source-build SBOM.

`THIRD_PARTY_NOTICES` deliberately covers the linked Go modules, the statically linked Go standard
library/runtime, and the browser application's pnpm production tree. Its Go runtime entry preserves
both the Go `LICENSE` and `PATENTS` texts. It is not a complete notice file for Alpine or any other
container operating-system package.

## Application notices and source-build SBOM / 应用依赖声明与源构建 SBOM

`THIRD_PARTY_NOTICES`, `notices/memoark-source-linux-amd64.THIRD_PARTY_NOTICES`, and
`sbom/memoark-source-linux-amd64.cdx.json` are generated from:

- Go modules actually linked by `./cmd/memos` for the selected `GOOS/GOARCH` with
  `CGO_ENABLED=0`, plus one synthetic component for the statically linked Go standard library and
  runtime;
- the physically installed pnpm production dependency tree used for the embedded web build.

They intentionally record build inputs. They are not a claim that every optional package is
present in every platform-specific browser bundle. The SBOM records both the Go version used to
analyze dependencies and the Go version declared for the binary build. Linux defaults the build
toolchain to the `golang:<version>-alpine` builder pinned in `scripts/Dockerfile`; native Windows
archives use the local Go toolchain for both values.

Generate and verify the files before a release. The application version must match the binary
or image version being released:

```powershell
cd G:\项目\memoark\web
corepack pnpm install --frozen-lockfile
cd ..
node scripts/compliance/generate-third-party-materials.mjs --application-version 0.29.1-memoark.8
node scripts/compliance/generate-third-party-materials.mjs `
  --application-version 0.29.1-memoark.8 `
  --notices-output notices/memoark-source-linux-amd64.THIRD_PARTY_NOTICES
node scripts/compliance/generate-third-party-materials.mjs --application-version 0.29.1-memoark.8 --check
node scripts/compliance/generate-third-party-materials.mjs `
  --application-version 0.29.1-memoark.8 `
  --notices-output notices/memoark-source-linux-amd64.THIRD_PARTY_NOTICES `
  --check
```

For another Linux architecture, pass its target and matching notice output explicitly. For
example, use `--goos linux --goarch arm64 --notices-output
notices/memoark-source-linux-arm64.THIRD_PARTY_NOTICES`; for arm/v7 use `--goos linux --goarch
arm --goarm 7 --notices-output notices/memoark-source-linux-armv7.THIRD_PARTY_NOTICES`. The
Dockerfile copies the matching source notice and SBOM. When `COMPLIANCE_CHECK=true`, it rejects a
build when their target, version, Git revision, Go build toolchain, runtime LICENSE/PATENTS hashes,
or dependency-manifest hashes do not match the binary being compiled. Ordinary local development
builds leave that strict release gate disabled.

The generator fails for a dependency with neither a declared license nor a classifiable local
license file. It excludes platform-incompatible pnpm optional packages that were not installed.
It also fails if a removed React Leaflet package reappears in the production dependency tree.

## Linux image SBOM and attestation / Linux 镜像 SBOM 与证明

After rebuilding the embedded frontend, create an inspectable local SPDX image SBOM for the
same version and commit:

```powershell
cd G:\项目\memoark
Push-Location web
corepack pnpm release
Pop-Location
node scripts/compliance/generate-third-party-materials.mjs --application-version 0.29.1-memoark.8
node scripts/compliance/generate-third-party-materials.mjs `
  --application-version 0.29.1-memoark.8 `
  --notices-output notices/memoark-source-linux-amd64.THIRD_PARTY_NOTICES
node scripts/compliance/generate-third-party-materials.mjs --application-version 0.29.1-memoark.8 --check
node scripts/compliance/generate-third-party-materials.mjs `
  --application-version 0.29.1-memoark.8 `
  --notices-output notices/memoark-source-linux-amd64.THIRD_PARTY_NOTICES `
  --check
powershell -ExecutionPolicy Bypass -File scripts/generate-image-sbom.ps1 `
  -Platform linux/amd64 `
  -Version 0.29.1-memoark.8 `
  -Commit (git rev-parse HEAD)
```

This creates `sbom/memoark-image-linux-amd64.spdx.json`. The command uses an OCI export so its
temporary verification build retains the Buildx SPDX attestation without changing a named local
deployment image.

When publishing an image, do not use a plain `docker build` followed by `docker push`. Build the
same version and commit with an SBOM attestation at publish time:

```powershell
docker buildx build `
  --platform linux/amd64 `
  --sbom=true `
  --build-arg COMPLIANCE_CHECK=true `
  --build-arg VERSION=0.29.1-memoark.8 `
  --build-arg COMMIT=(git rev-parse HEAD) `
  --tag <registry>/memoark:0.29.1-memoark.8 `
  --push `
  -f scripts/Dockerfile .
```

Keep the generated SPDX file with the release record as an independently inspectable copy. The
container image contains BusyBox, Alpine, and other OS components that are not covered by
`THIRD_PARTY_NOTICES`; preserve the image attestation and complete any OS-license notice or
source-availability review required for the intended distribution channel.

## Native archive / 原生 Windows 压缩包

First build the embedded frontend, then create a Windows archive:

```powershell
cd G:\项目\memoark
Push-Location web
corepack pnpm release
Pop-Location
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 `
  -GoOS windows `
  -GoArch amd64 `
  -Version 0.29.1-memoark.8
```

The script writes an inspectable staging folder and ZIP under `build/releases/`. It builds the
native binary, generates target-specific notices/SBOM with the same version, confirms their
presence, and verifies that the final ZIP contains every required disclosure file. The script is
intentionally limited to Windows archives; POSIX archive permissions must be packaged and checked
from a native target environment before Linux or macOS binary distribution is supported.

## Remaining release review / 尚待完成的发行审查

- The map feature uses third-party CARTO tiles and OpenStreetMap Nominatim reverse geocoding.
  Their terms, attribution, rate limits, and any operator-specific privacy disclosures require a
  separate review before representing the map integration as commercially cleared.
- A commercial container release still needs a distribution-channel review for its Alpine/OS
  component notices and any corresponding source-availability obligations. The application
  notice file and source-build SBOM do not settle those operating-system obligations.
