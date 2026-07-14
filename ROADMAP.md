# MemoArk roadmap

Last reviewed: 2026-07-14

MemoArk prioritizes trust before feature count. A note app should protect unfinished writing, make upgrades reversible, and let users
leave with their data. Demand is measured from repeated reports, reactions, comments, recency, and whether an upstream issue was
actually solved rather than merely closed.

The research snapshot behind these decisions is in
[docs/product/upstream-feedback-2026-07-13.md](docs/product/upstream-feedback-2026-07-13.md).

The finite, verifiable delivery plan and current completion percentage are tracked in
[docs/plans/2026-07-14-v0.1.0-delivery-plan.md](docs/plans/2026-07-14-v0.1.0-delivery-plan.md).

## Shipped foundation

- Edit drafts are cached locally while typing.
- Recovered drafts can be restored or discarded explicitly.
- A stale local edit warns when the server copy has changed.
- Normal and archived notes can be exported as versioned `memoark.memo-export` v1 JSON.

## v0.1.0: recovery before expansion

Milestone: [MemoArk v0.1.0](https://github.com/harrychin-cn/memoark/milestone/1)

### P0 release blockers

- [x] [#1 Create a verified SQLite backup before schema migrations](https://github.com/harrychin-cn/memoark/issues/1)
- [x] [#2 Restore a MemoArk v1 JSON export into an empty account](https://github.com/harrychin-cn/memoark/issues/2)

### P1 high-value improvements

- [x] [#3 Preserve failed saves locally and provide a safe retry](https://github.com/harrychin-cn/memoark/issues/3)
- [x] [#4 Restore multi-tag AND filtering](https://github.com/harrychin-cn/memoark/issues/4)

**v0.1.0 is complete.** Issues #1 through #4 passed their automated, container, and real-browser acceptance gates, and the milestone
is closed. The release delivers reversible SQLite upgrades, empty-account JSON import, failed-save recovery, and multi-tag AND
filtering without expanding into unrelated organization features.

## v0.1.0 release gate

- Every P0 issue is complete.
- Any unfinished milestone issue is moved deliberately with a written reason; it is not silently abandoned.
- Upgrade from an older SQLite fixture, a fresh install, and a Docker restart all pass locally.
- Export-to-import round-trip tests pass for supported fields.
- Offline/failed-save browser tests prove that content survives reload and retry without duplicate notes.
- The release notes list unsupported backup/import data explicitly.

Gate result: **passed on 2026-07-14**. See [v0.1.0 release notes](docs/releases/v0.1.0.md) for commands, artifacts, and known limits.

## v0.1.1: tag consistency and maintenance

Milestone: [MemoArk v0.1.1](https://github.com/harrychin-cn/memoark/milestone/2)

- [ ] [#5 Fix hashtag boundaries and Unicode apostrophes](https://github.com/harrychin-cn/memoark/issues/5)
- [ ] [#6 Bulk rename or merge a tag with a preview](https://github.com/harrychin-cn/memoark/issues/6)

#5 and #6 were deliberately deferred with written reasons. They improve organization rather than recovery safety, and #6 should use
the shared parsing rules established by #5 instead of introducing a second tag parser.

## Later backlog

- Portable ZIP archives containing attachment files and checksums.
- Full offline reading and an ordered background synchronization outbox.
- Search across comments and highlighted search results.
- Third-party imports such as Google Takeout, Obsidian, and Markdown folders.
- Optional compact/masonry browsing and inline quick actions.
- Reminders and due dates after the reliability work is stable.

## Not in v0.1.0

- AI features, team workspaces, enterprise permissions, or a mobile rewrite.
- Full offline-first replication or cross-device draft synchronization.
- Automated cloud backups or MySQL/PostgreSQL backup orchestration.
- Billing or commercial packaging.
