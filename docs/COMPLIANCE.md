# Distribution compliance / 发行合规

## What ships in a release / 发行包携带什么？

Every MemoArk native Windows archive contains:

- LICENSE: source-code license and upstream copyright terms;
- NOTICE: MemoArk and Memos provenance notice;
- TRADEMARKS.md: project identity and non-endorsement rules;
- PRIVACY.md: self-hosted privacy statement;
- ADVERTISING.md: advertising, sponsorship, and affiliate disclosure rules;
- THIRD_PARTY_NOTICES: exact application dependency notices for that archive;
- sbom/SBOM.cdx.json: exact CycloneDX source-build SBOM for that archive.

Every MemoArk-maintained Linux container image contains the first six documents plus
/usr/local/memos/sbom.cdx.json, its matching **application source-build** SBOM. A separate
Buildx SPDX SBOM inventories Alpine and other operating-system packages. Keep that image SBOM
with the exact image digest when publishing; it is not interchangeable with the application
source-build SBOM.

THIRD_PARTY_NOTICES covers the linked Go modules, the statically linked Go standard
library/runtime, and the browser application's pnpm production tree. Its Go runtime entry preserves
both the Go LICENSE and PATENTS texts. It is not a complete notice file for Alpine or any other
container operating-system package.

## Source baseline versus release provenance / 源码基线与发行溯源

The repository tracks a reproducible **source baseline**:

- THIRD_PARTY_NOTICES;
- notices/memoark-source-linux-*.THIRD_PARTY_NOTICES;
- sbom/memoark-source-linux-*.cdx.json.

The baseline records targets, dependency manifests, resolved dependency licenses, and Go runtime
license hashes. It deliberately does **not** record an application version, Git revision, or Git
timestamp. This keeps ordinary development Docker builds usable and prevents generated files from
changing the commit that they claim to describe.

Exact version-and-revision-bound notices and SBOMs are release artifacts. They are generated only
inside an isolated worktree, copied into the release record and runtime image, then discarded with
that worktree. COMPLIANCE_CHECK=true accepts only those exact release materials; it rejects the
source baseline by design.

To install the web dependency tree and verify the tracked baseline:

~~~powershell
cd G:\项目\memoark\web
corepack pnpm install --frozen-lockfile
cd ..
node scripts/compliance/generate-third-party-materials.mjs --check
node scripts/compliance/generate-third-party-materials.mjs --notices-output notices/memoark-source-linux-amd64.THIRD_PARTY_NOTICES --check
node scripts/compliance/generate-third-party-materials.mjs --goos linux --goarch arm64 --notices-output notices/memoark-source-linux-arm64.THIRD_PARTY_NOTICES --check
node scripts/compliance/generate-third-party-materials.mjs --goos linux --goarch arm --goarm 7 --notices-output notices/memoark-source-linux-armv7.THIRD_PARTY_NOTICES --check
~~~

Run the same commands without --check after a dependency, lockfile, Go toolchain, or compliance
generator change. Do not pass --application-version for the source baseline.

## Strict container release record / 严格容器发行记录

Use the single release entry point for a commercial container build:

~~~powershell
cd G:\项目\memoark
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-container-release.ps1 -Version 0.29.1-memoark.9 -Platform linux/amd64
~~~

The script only releases the current clean HEAD; it intentionally has no commit override,
deployment, push, tag, load, run, stop, or remove option. It:

1. creates a detached disposable worktree at that exact commit;
2. runs pnpm install --frozen-lockfile, frontend lint/test/release, go mod tidy -diff, and
   GOFLAGS=-parallel=1 go test -count=1 -p 1 ./... (the scoped setting also reaches nested
   database-driver test processes, keeping database-container tests isolated);
3. generates target-specific materials with --provenance release, including the exact version and
   Git revision;
4. builds and retains an OCI archive with COMPLIANCE_CHECK=true and Buildx --sbom=true;
5. writes a release record under
   build/releases/memoark-<version>-<12-character-git-revision>/;
6. removes the disposable worktree and confirms that the source worktree remains clean.

The release artifact contains images/ OCI archives, notices/, source CycloneDX files, image SPDX files,
image-SBOM provenance JSON (OCI index, image-manifest, attestation-manifest, attestation reference,
SPDX-layer, and OCI-archive SHA-256 digests), release-manifest.json, and SHA256SUMS. It is ignored by
Git and is the artifact to retain with the release. The script rejects an output path under .local\data,
uses an exclusive release lock, and snapshots
memoark-local before and after the build. It never operates the container; any change to its ID,
image, state or restart timing, ports, mounts, health status, or restart policy fails the release
preparation. The strict gate accepts an image SBOM only when both the OCI attestation reference
and the in-toto SPDX subject bind it to the retained archive's image-manifest digest.

Build several targets by repeating -Platform:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-container-release.ps1 -Version 0.29.1-memoark.9 -Platform linux/amd64,linux/arm64,linux/arm/v7
~~~

The wrapper validates a strict OCI build but does not publish it. Publish the retained OCI archive
instead of rebuilding from a normal source checkout, verify that the destination image-manifest digest
equals release-manifest.json, attach the accompanying SPDX SBOM to that exact digest, and complete the
distribution-channel review below.

scripts/generate-image-sbom.ps1 remains the lower-level strict builder. It requires exact release
materials already present in its working tree and writes an OCI archive, SPDX file, and digest-bound
provenance JSON sidecar under build/releases/; call it through package-container-release.ps1 for a
repeatable release.

## Native archive / 原生 Windows 压缩包

Create a Windows archive from a clean source worktree:

~~~powershell
cd G:\项目\memoark
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1 -GoOS windows -GoArch amd64 -Version 0.29.1-memoark.9
~~~

The script rejects local tracked or untracked changes, builds the embedded frontend itself, restores
the tracked frontend placeholder afterward, and verifies the source worktree is clean before accepting
the archive. It writes an inspectable staging folder and ZIP under build/releases/, generates
release-provenance notices/SBOMs in the staging folder, builds the native binary with the same version
and Git revision, and verifies that the final ZIP contains every required disclosure file.

The Windows archive includes `START-MemoArk.cmd` and `README-LOCAL-zh-CN.txt`. The launcher forces
`127.0.0.1` binding and uses `%LOCALAPPDATA%\MemoArk` unless the user explicitly supplies an override.
It also includes a version/revision/target `RELEASE-MANIFEST.json`, internal `SHA256SUMS.txt`, and an
adjacent `<archive>.zip.sha256` checksum for the final ZIP. It is intentionally limited to Windows
archives; POSIX archive permissions must be packaged and checked from a native target environment before
Linux or macOS binary distribution is supported.

## Remaining release review / 尚待完成的发行审查

- The map feature uses third-party CARTO tiles and OpenStreetMap Nominatim reverse geocoding.
  Their terms, attribution, rate limits, and any operator-specific privacy disclosures require a
  separate review before representing the map integration as commercially cleared.
- A commercial container release still needs a distribution-channel review for its Alpine/OS
  component notices and any corresponding source-availability obligations. The application notice
  file and source-build SBOM do not settle those operating-system obligations.
