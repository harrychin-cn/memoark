# Privacy / 隐私说明

Last updated / 最后更新：2026-07-14

## Scope / 适用范围

MemoArk is self-hosted software, not a hosted service operated by the project
contributors. The person or organization operating an instance controls that
instance's accounts, notes, attachments, configuration, logs, retention, and
access policies. This document describes the MemoArk-maintained distribution;
an independent instance operator may make different choices.

MemoArk 是自托管软件，不是由项目贡献者运营的托管服务。实例运营者控制该实例中的账户、
笔记、附件、配置、日志、保留期限和访问策略。本文说明 MemoArk 项目维护的发行版；独立
实例运营者可能采用不同的配置和规则。

## What the MemoArk project receives / MemoArk 项目会收到什么

The MemoArk-maintained distribution does not intentionally send note content,
account data, usage analytics, crash reports, advertising identifiers, or
telemetry to MemoArk contributors. Contributors do not receive data from a
self-hosted instance merely because the software is installed.

MemoArk 项目维护的发行版不会主动向 MemoArk 贡献者发送笔记内容、账户数据、使用分析、
崩溃报告、广告标识符或遥测数据。仅安装自托管软件不会使项目贡献者收到实例数据。

Information submitted directly through GitHub issues, discussions, pull
requests, or security reports is handled by the platform used for that
submission and is outside the running MemoArk instance.

用户主动通过 GitHub Issue、Discussion、Pull Request 或安全报告提交的信息，由相应平台
处理，不属于运行中的 MemoArk 实例数据流。

## Data stored by an instance and browser / 实例与浏览器存储的数据

Depending on how the instance is used, its database and attachment storage may
contain account information, authentication settings, notes, comments,
reactions, attachments, locations, integration settings, and audit-relevant
server logs.

根据实际使用情况，实例数据库和附件存储中可能包含账户信息、认证设置、笔记、评论、
回应、附件、位置、集成配置以及与审计有关的服务器日志。

The web application uses browser storage for functions such as authentication
tokens and expiry information, editor drafts and failed-save recovery,
language, theme and view preferences, and temporary OAuth state. Anyone using
a shared device should sign out and clear site data when appropriate.

网页应用会使用浏览器存储保存认证令牌及过期时间、编辑器草稿与保存失败恢复数据、语言、
主题和视图偏好，以及临时 OAuth 状态。在共用设备上使用时，应在需要时退出登录并清理
站点数据。

## Optional outbound connections / 可选的对外连接

MemoArk can contact services other than the self-hosted instance when a user or
administrator uses or configures the corresponding feature. These connections
may include:

- map tiles from CARTO and reverse geocoding from OpenStreetMap Nominatim when
  map or location features are used;
- identity providers configured for SSO;
- AI or transcription providers configured by an administrator;
- SMTP servers, S3-compatible object storage, and webhook destinations;
- remote URLs fetched for link metadata or remote media opened by a user.

MemoArk 在用户或管理员使用、配置相应功能时，可能连接自托管实例以外的服务，包括：

- 使用地图或位置功能时访问 CARTO 地图瓦片和 OpenStreetMap Nominatim 反向地理编码；
- 管理员配置的 SSO 身份提供商；
- 管理员配置的 AI 或语音转写提供商；
- SMTP 服务器、S3 兼容对象存储和 Webhook 目标；
- 为链接元数据抓取的远程地址，或用户打开的远程媒体。

Those providers receive the information necessary to perform the requested
operation and apply their own terms and privacy policies. Instance operators
decide which optional integrations are enabled and are responsible for
informing their users about operator-specific data flows.

这些服务会收到完成相应操作所需的信息，并适用其各自的条款和隐私政策。实例运营者决定
启用哪些可选集成，并负责向实例用户说明运营者特有的数据流。

## Retention, deletion, and security / 保留、删除与安全

Instance operators control backups, retention, account deletion, log handling,
and access to stored data. Users should contact their instance operator for
requests concerning data held by that instance. Security vulnerabilities in
MemoArk itself should be reported as described in [SECURITY.md](SECURITY.md).

实例运营者控制备份、保留期限、账户删除、日志处理和数据访问。涉及某个实例所持有数据的
请求，应联系该实例运营者。MemoArk 软件本身的安全漏洞应按照
[SECURITY.md](SECURITY.md) 提交。

Advertising, sponsorship, and affiliate-link disclosure rules are documented
separately in [docs/ADVERTISING.md](docs/ADVERTISING.md).

广告、赞助和推广链接的披露规则见 [docs/ADVERTISING.md](docs/ADVERTISING.md)。
