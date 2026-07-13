# Upstream feedback snapshot: 2026-07-13

This document records the public GitHub evidence used to plan MemoArk v0.1.0. It is a point-in-time snapshot, not a permanent claim
about upstream behavior.

## Method

- Repository examined: [`usememos/memos`](https://github.com/usememos/memos).
- Snapshot: 61,510 stars, 4,555 forks, and 10 open issues on 2026-07-13.
- Signals: reactions, comments, repeated reports, recency, concrete user impact, and fit with MemoArk's reliability focus.
- A closed issue is treated as solved only when its resolution or current code provides an equivalent behavior. Issues closed as
  `not planned` or by stale automation remain useful demand evidence.
- Interaction counts below are snapshots and will naturally change.

## Strong signals

| Source | Snapshot | User pain | MemoArk decision |
| --- | --- | --- | --- |
| [#2690 Offline Notes](https://github.com/usememos/memos/issues/2690) | Closed, `not planned`; 65 reactions, 26 comments | Writing stops when the server is unreachable; users want ordered sync after reconnect. | Start with a safe failed-save state and manual retry in [MemoArk #3](https://github.com/harrychin-cn/memoark/issues/3). Full offline sync stays in later research. |
| [#5825 Multi-tag filtering and masonry](https://github.com/usememos/memos/issues/5825) | Closed, `not planned`; 22 reactions, 14 comments | A previously available multi-tag workflow disappeared, and users repeatedly reported the regression. | Restore exact-tag AND filtering in [MemoArk #4](https://github.com/harrychin-cn/memoark/issues/4). Masonry remains separate. |
| [#5667 Unsaved memo text is lost](https://github.com/usememos/memos/issues/5667) | Closed, `completed`; 17 reactions, 10 comments | Long edits disappeared after token expiry or tab inactivity across several browsers. | MemoArk already adds visible draft recovery and conflict warnings; [MemoArk #3](https://github.com/harrychin-cn/memoark/issues/3) closes the network-failure gap. |
| [#778 Export memos to file](https://github.com/usememos/memos/issues/778) | Closed, `completed`; 15 reactions, 14 comments | Users want backup and freedom to leave without copying a live SQLite file manually. | MemoArk ships versioned JSON export; [MemoArk #2](https://github.com/harrychin-cn/memoark/issues/2) adds a tested restore path. |
| [#4823 Memos due date](https://github.com/usememos/memos/issues/4823) | Closed, `not planned`; 15 reactions, 18 comments | Users want follow-up dates and reminders. | Real demand, but deferred until core reliability work is complete. |
| [#3541 Listen to user feedback](https://github.com/usememos/memos/issues/3541) | Closed, `not planned`; 11 reactions, 23 comments | Users complained about removed workflows, UI regressions, difficult downgrade, and missing backup paths. | Preserve mature behavior, avoid surprise redesigns, document migrations, and keep decisions traceable to issues. |
| [#3802 Automatic database backup](https://github.com/usememos/memos/issues/3802) | Closed, `not planned`; repeated by #2211, #4567, and #5645 | Self-hosters must invent cron scripts and may discover recovery problems only after an upgrade. | Add a verified SQLite pre-migration backup in [MemoArk #1](https://github.com/harrychin-cn/memoark/issues/1). |
| [#5548 Data import and export](https://github.com/usememos/memos/issues/5548) | Closed, `not planned`; recent 2026 request with older duplicates | Users cannot reliably merge, move, or reconstruct an instance from a portable export. | Limit v0.1.0 import to a validated MemoArk v1 file and an empty account in [MemoArk #2](https://github.com/harrychin-cn/memoark/issues/2). |
| [#6073 Editing tags in one go](https://github.com/usememos/memos/issues/6073) | Open; created 2026-07-08 | Renaming a tag used by dozens of notes requires manual edits. | Add previewed exact-token rename/merge in [MemoArk #6](https://github.com/harrychin-cn/memoark/issues/6). |
| [#6087 Hashtag boundaries](https://github.com/usememos/memos/issues/6087) and [#6078 Apostrophe in tag name](https://github.com/usememos/memos/issues/6078) | Open; reproduced on v0.29.1 | URL fragments can become accidental tags while valid Ukrainian words are truncated. | Define one tested frontend/backend grammar in [MemoArk #5](https://github.com/harrychin-cn/memoark/issues/5). |

## Product conclusions

1. **Reliability is a market gap.** Backup, recovery, and portable restore recur across years of feedback.
2. **Closed does not always mean fixed.** Several high-interaction requests were closed as `not planned` while users were still
   asking for them.
3. **Small regressions matter.** Multi-tag filtering is narrow, visible, and inexpensive to restore, making it a strong first win.
4. **Offline work must be staged.** A failed-save outbox is useful and testable; full replication needs a separate design because a
   bad sync implementation can lose or duplicate notes.
5. **Scope discipline is part of the product.** MemoArk v0.1.0 should finish recovery paths before adding AI, collaboration, or billing.

