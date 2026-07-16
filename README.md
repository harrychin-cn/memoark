# MemoArk

<img align="right" height="96" src="web/public/memoark-logo.svg" alt="MemoArk logo" />

**Reliable, self-hosted notes with draft safety and portable data.**

MemoArk is an independent open-source project based on [Memos](https://github.com/usememos/memos). It keeps the lightweight,
Markdown-first experience while focusing on the failure cases that make people lose trust in note apps.

> **Project status:** early development. The current baseline is Memos `v0.29.1` at commit `5f194da`.

> **普通用户：** 请查看 [中文功能使用说明](docs/user-guide-zh-CN.md)，或前往
> [GitHub 最新版本页面](https://github.com/harrychin-cn/memoark/releases/latest) 下载 Windows 安装包、Windows 便携版和 Android APK。

## What MemoArk adds

- **Edit draft protection** — unsaved edits are cached locally while you type.
- **Visible recovery** — restore or discard a recovered draft instead of silently overwriting server content.
- **Conflict awareness** — warns when the server copy changed after the local draft was created.
- **Portable export** — download normal and archived notes as versioned JSON.
- **Self-hosted by default** — your database stays on infrastructure you control.

Development priorities are tracked in the [MemoArk roadmap](ROADMAP.md), with the public upstream feedback behind each decision kept
in [the research snapshot](docs/product/upstream-feedback-2026-07-13.md).

## Desktop and mobile use

MemoArk provides complete local packages that do not require Docker, Node.js, Go, a VPS, or an external server:

- **Windows installer:** download `MemoArk-Setup.exe`; it creates desktop and Start menu shortcuts and runs without a console window.
- **Windows portable:** download the `windows-amd64.zip` archive and run `START-MemoArk.cmd` after extracting it.
- **Android:** download the `Android.apk`; the frontend, local backend, and SQLite database are included in the app.

See the [Chinese user guide / 中文功能使用说明](docs/user-guide-zh-CN.md) for installation, first use, memo editing, attachments,
sharing, import/export, backup, upgrades, uninstallation, and troubleshooting.

## Server quick start

Prerequisites: Git, Node.js 24+, pnpm 11+, and Docker.

```bash
git clone https://github.com/harrychin-cn/memoark.git
cd memoark

cd web
pnpm install --frozen-lockfile
pnpm release
cd ..

docker compose -f scripts/compose.yaml up -d --build
```

Open [http://localhost:5230](http://localhost:5230). The default Compose file binds only to localhost, and runtime data is stored in
the Docker volume `memoark-data`.

Stop the instance without deleting its data:

```bash
docker compose -f scripts/compose.yaml down
```

Before upgrading an existing SQLite database, MemoArk creates and verifies a backup when schema migrations are pending. See
[SQLite migration backups and restore](docs/operations/sqlite-migration-backups.md) for the backup location, Docker behavior, and manual
restore procedure.

## Windows local development package

The release page provides a normal Windows installer and a portable archive. The program, database, and attachments stay on the same
Windows computer, and the local service binds only to `127.0.0.1`. User data is stored under `%LOCALAPPDATA%\MemoArk` by default and
is retained across upgrades and uninstallation.

Maintainers can build the complete Windows and Android release set from a clean source worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-complete-release.ps1 -Version 0.29.1-memoark.12 -AndroidVersionCode 12
```

The output includes `MemoArk-Setup.exe`, the portable ZIP, a signed Android APK, SHA-256 checksums, release manifests, notices, and
CycloneDX SBOMs. See the [user guide](docs/user-guide-zh-CN.md) for end-user instructions.

## Development

Frontend:

```bash
cd web
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm dev
```

Backend:

```bash
go test ./...
go run ./cmd/memos --port 8081
```

The Go module path, API resource names, `MEMOS_*` environment variables, binary name, and data directory remain compatible with the
upstream project for now. This is intentional and avoids a risky mass rename.

## Trust and disclosures

- [Privacy / 隐私说明](PRIVACY.md) explains what a self-hosted instance stores, the browser data used by MemoArk, and optional
  connections to services configured by an instance operator.
- [Advertising and sponsorship / 广告与赞助披露](docs/ADVERTISING.md) records the project's current commercial relationships and
  the rules for advertising, sponsorships, and affiliate links.
- [Trademarks and project identity / 商标与项目标识](TRADEMARKS.md) distinguishes factual upstream attribution from affiliation or
  endorsement.
- [Third-party notice source baseline](THIRD_PARTY_NOTICES) and [distribution compliance](docs/COMPLIANCE.md) explain the
  tracked dependency baseline, exact release notices/SBOMs, and reproducible container/native-package release steps.

The MemoArk-maintained distribution currently contains no paid placement or affiliate links. Any future paid, sponsored, or affiliate
content must be clearly labelled **where it appears / 在内容实际展示位置就地标注**. A link to a central policy alone is not enough;
the nearby label must identify the commercial relationship and who benefits from it. Self-hosted instance operators remain responsible
for content and integrations they add independently.

## Reporting problems

- [Bug reports](https://github.com/harrychin-cn/memoark/issues/new?template=bug_report.yml)
- [Feature requests](https://github.com/harrychin-cn/memoark/issues/new?template=feature_request.yml)
- [Security reports](https://github.com/harrychin-cn/memoark/security/advisories/new)

Please include the MemoArk version, deployment method, database type, and clear reproduction steps.

## Upstream and license

MemoArk is based on Memos and is not affiliated with or endorsed by the original Memos project. The full upstream Git history is kept
so changes remain traceable and future security updates can be reviewed cleanly.

The original Memos copyright and MIT license are preserved in [LICENSE](LICENSE). MemoArk's attribution details are recorded in
[NOTICE](NOTICE). Changes made for MemoArk are also distributed under the MIT License. See [TRADEMARKS.md](TRADEMARKS.md) for the
separate rules covering project names and visual identity.
