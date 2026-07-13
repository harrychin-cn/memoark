# Security Policy

## Supported Versions

MemoArk is currently a `0.x` project. Security fixes are provided for the latest release only; older releases do not receive backports.

If you run MemoArk in production, keep your instance updated to the latest release.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/harrychin-cn/memoark/security/advisories/new).

Do not open a public issue or pull request for a suspected vulnerability. Please include:

- A clear description of the issue
- Steps to reproduce
- The affected version or commit
- Deployment details relevant to reproduction
- Your assessment of the impact

Reports will be reviewed as time permits, and confirmed issues will be addressed in a regular or security release as appropriate.

## Disclosure and CVEs

MemoArk is self-hosted software and is still in the `0.x` stage. Security fixes may be shipped in normal releases and noted in release notes or the changelog.

## Self-Hosted Deployment Notes

The security posture of a MemoArk instance depends heavily on how it is deployed and operated. In particular:

- Keep MemoArk updated
- Put it behind a properly configured reverse proxy when exposed to the internet
- Require authentication for any non-public deployment
- Use TLS in production
- Limit access to trusted users and administrators

Reports that depend entirely on intentionally unsafe deployment choices, unsupported local patches, or administrator actions may be treated as deployment issues rather than product vulnerabilities.
