# MemoArk 中文推广素材包

> 适用版本：`v0.29.1-memoark.12`
>
> 正式 Release：<https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12>
>
> 本文用于对外发布素材，产品安装和使用细节以[中文说明](user-guide-zh-CN.md)为准。

## 1. 发布口径

### 一句话介绍

MemoArk 是一个基于 Memos 的开源笔记应用，提供可直接安装的 Windows 和 Android 完整本地版，也支持自行部署；核心记录与整理功能可以在离线环境中使用，数据由用户自己保管。

### 可使用的产品卖点

- Windows 安装版、Windows 便携版和 Android APK 均已正式发布。
- 本地版内含前端、后端和 SQLite 数据库，不要求用户安装 Docker、Node.js、Go、VPS 或外部服务器。
- 支持 Markdown、标签、待办、附件、录音、位置、评论、搜索、过滤、置顶、归档和分享图片等笔记功能。
- 未保存内容会缓存在当前设备，可在意外刷新或退出后选择恢复，并在版本冲突时提醒用户核对。
- Windows 和 Android 本地版的核心功能可离线使用。
- 提供 33 种界面语言，以及跟随系统、浅色、深色和纸张主题。
- 支持 JSON 导入导出，适合迁移文字备忘录。
- Windows 用户可以在退出程序后复制整个 `%LOCALAPPDATA%\MemoArk` 数据目录进行完整备份。
- Release 提供 SHA-256 校验文件、Windows/Android CycloneDX SBOM、第三方许可披露和发布清单。
- 项目基于 Memos，保留上游 Git 历史，代码按 MIT License 发布。

### 不可使用的说法

- 不要说本地版支持公网分享或把本地分享链接直接发给其他设备访问。本地版只监听本机地址。
- 不要说本地版支持多设备云同步。当前没有提供这项能力。
- 不要把 JSON 导出称为“完整备份”“整机备份”或“附件备份”。JSON 不包含附件文件、评论和实例配置，也不会完整恢复关系、反应、位置和设置。
- 不要说所有功能都完全离线。录音转文字等功能需要管理员另外配置可用的 AI provider，部分自托管集成也需要网络。
- 不要说 Windows 安装包已经完成商业代码签名。当前 SmartScreen 可能显示“未知发布者”。
- 不要暗示 MemoArk 与 Memos 原项目存在官方隶属或背书关系。MemoArk 是基于 Memos 的独立项目。

## 2. 统一下载入口

对外发布时优先使用正式 Release 页面，让用户按设备自行选择文件：

**正式版下载：** <https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12>

| 设备或用途 | 文件 | 直接下载 |
| --- | --- | --- |
| Windows 普通用户 | `MemoArk-Setup.exe` | [下载安装程序](https://github.com/harrychin-cn/memoark/releases/download/v0.29.1-memoark.12/MemoArk-Setup.exe) |
| Windows 便携使用 | `memoark-0.29.1-memoark.12-windows-amd64.zip` | [下载便携 ZIP](https://github.com/harrychin-cn/memoark/releases/download/v0.29.1-memoark.12/memoark-0.29.1-memoark.12-windows-amd64.zip) |
| Android 手机 | `MemoArk-0.29.1-memoark.12-Android.apk` | [下载 Android APK](https://github.com/harrychin-cn/memoark/releases/download/v0.29.1-memoark.12/MemoArk-0.29.1-memoark.12-Android.apk) |
| 完整性校验 | `SHA256SUMS.txt` | [下载 SHA-256 校验文件](https://github.com/harrychin-cn/memoark/releases/download/v0.29.1-memoark.12/SHA256SUMS.txt) |

相关入口：

- 项目首页：<https://github.com/harrychin-cn/memoark>
- 中文说明：<https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-zh-CN.md>
- English Guide：<https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-en.md>
- 问题反馈：<https://github.com/harrychin-cn/memoark/issues/new?template=bug_report.yml>
- 功能建议：<https://github.com/harrychin-cn/memoark/issues/new?template=feature_request.yml>

## 3. 朋友圈

### 标题或开场

```text
MemoArk 正式发布：Windows 和 Android 都能直接安装的本地笔记应用
```

### 短文案

```text
最近在做的开源笔记应用 MemoArk 发布正式本地版了。

Windows 有安装包和便携 ZIP，Android 有可直接安装的 APK；不需要自己部署服务器，核心记录与整理功能离线可用。支持 Markdown、标签、待办、附件、搜索、归档、草稿恢复和分享图片，数据保存在自己的设备上。

下载和使用说明：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
```

### 长文案

```text
MemoArk v0.29.1-memoark.12 正式发布。

这是一个基于 Memos 的独立开源笔记应用。这一版已经准备好 Windows 安装程序、Windows 便携 ZIP 和 Android APK，普通用户不需要安装 Docker、Node.js、Go，也不需要先准备 VPS 或外部服务器。

它保留了轻量、Markdown 优先的记录体验，支持标签、待办、附件、录音、搜索、过滤、置顶和归档；未保存内容会先缓存在当前设备，遇到意外刷新或退出时可以尝试恢复。备忘录也可以生成 PNG 图片，方便从本地版发给别人。

本地版的核心功能可以离线使用，Windows 数据默认放在 %LOCALAPPDATA%\MemoArk，Android 数据放在 App 私有目录。需要注意：本地版不提供公网分享和多设备云同步；JSON 导出适合迁移文字备忘录，不等于包含附件的完整备份。

本次 Release 同时提供 SHA-256、SBOM、第三方许可披露和发布清单。欢迎试用，也欢迎反馈真实问题。

正式版下载：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12

中文说明：
https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-zh-CN.md
```

## 4. 微信群

### 标题

```text
[开源发布] MemoArk：可直接安装的 Windows / Android 本地笔记应用
```

### 短文案

```text
分享一个刚发布的开源笔记应用 MemoArk。Windows 和 Android 都有完整本地版，不用自己搭服务器，核心功能离线可用；支持 Markdown、标签、待办、附件、搜索、草稿恢复、归档和分享图片。

下载：https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
说明：https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-zh-CN.md
```

### 长文案

```text
给群里分享一个开源项目：MemoArk v0.29.1-memoark.12。

适合想在自己电脑或手机上保存笔记、又不想先学服务器部署的用户：
1. Windows 提供普通安装包和便携 ZIP；
2. Android 提供完整本地 APK；
3. 内含前端、后端和 SQLite，核心记录与整理功能离线可用；
4. 支持 Markdown、标签、待办、附件、录音、搜索、过滤、归档、评论和分享图片；
5. 有当前设备草稿缓存和冲突提醒；
6. 提供 33 种界面语言和 4 种主题；
7. Release 附带 SHA-256、SBOM 和第三方许可披露。

边界也提前说清楚：本地版只在当前设备访问，不支持公网分享或多设备云同步；JSON 导出主要用于迁移文字备忘录，不是包含附件的完整备份。

正式版下载：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12

如果遇到问题，可以在 GitHub 提交 Issue，带上版本、系统和复现步骤即可。
```

## 5. 小红书

### 备选标题

```text
1. 不会部署服务器，也能用的开源本地笔记 App
2. Windows + Android，本地笔记工具 MemoArk 发布了
3. 我把开源笔记做成了普通人也能安装的本地版
4. 一个支持 Markdown 和草稿恢复的本地笔记应用
5. 数据留在自己设备上的开源笔记工具
```

### 短文案

```text
分享一个不需要先搭服务器的开源笔记应用：MemoArk。

✅ Windows 安装包 + 便携 ZIP
✅ Android 本地 APK
✅ 核心功能离线可用
✅ Markdown、标签、待办、附件、搜索、归档
✅ 未保存草稿可恢复，冲突会提醒
✅ 33 种界面语言，4 种主题
✅ 可把备忘录生成图片再分享

数据保存在自己的设备上。先说明边界：本地版没有公网分享和多设备云同步，JSON 导出用于迁移文字内容，不是完整备份。

下载地址：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12

#开源软件 #笔记软件 #Markdown #效率工具 #Windows软件 #Android应用 #本地优先
```

### 长文案

```text
如果你想用开源笔记，但看到“Docker、数据库、VPS”就不想继续，可以试试 MemoArk。

MemoArk 是基于 Memos 的独立开源项目。这次发布把前端、后端和 SQLite 都放进了本地安装包：Windows 普通用户下载 MemoArk-Setup.exe，Android 用户下载 APK，第一次打开创建账号就能开始记录。Windows 还有便携 ZIP，适合不想走安装流程的人。

日常记录需要的功能比较完整：
• Markdown、标签和待办
• 图片、音频、视频和文档附件
• 搜索、过滤、日历、置顶和归档
• 评论、提及和通知
• 未保存草稿恢复与版本冲突提醒
• 生成 PNG 分享图片
• 33 种界面语言
• 跟随系统、浅色、深色、纸张主题

本地版的核心记录与整理功能可以离线运行。Windows 数据默认放在 %LOCALAPPDATA%\MemoArk；Android 数据放在 App 私有目录。

也把限制说在前面：
1. 本地版只监听当前设备，复制链接不能直接给其他设备访问；需要对外发送时可用分享图片、复制正文或 Android 系统分享。
2. 当前没有多设备云同步。
3. JSON 导出不包含附件文件、评论和实例配置，更适合迁移文字备忘录，不应当作完整备份。
4. Windows 安装包暂时没有商业代码签名，SmartScreen 可能显示“未知发布者”。

正式版和完整使用说明都放在 GitHub：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12

#开源软件 #笔记软件 #Markdown笔记 #效率工具 #Windows软件 #Android应用 #本地笔记
```

### 置顶评论

```text
下载时请认准 GitHub 正式 Release。Windows 普通用户选 MemoArk-Setup.exe，Android 用户选文件名以 Android.apk 结尾的安装包；需要核验文件时下载 SHA256SUMS.txt。详细安装、升级和数据说明见 Release 里的中文说明链接。
```

## 6. 知乎

### 备选标题

```text
1. 不想部署服务器，如何使用开源的本地笔记应用？
2. MemoArk：把 Memos 的轻量体验带到 Windows 和 Android 本地版
3. 一个开源笔记应用怎样兼顾本地使用、草稿保护和数据迁移？
```

### 短文案

```text
如果主要需求是“下载安装到自己的电脑或手机上，不先搭服务器”，可以看看 MemoArk。

MemoArk 是基于 Memos 的独立开源项目，正式版提供 Windows 安装程序、Windows 便携 ZIP 和 Android APK。本地包内含前端、后端和 SQLite，核心记录与整理功能可以离线使用。它支持 Markdown、标签、待办、附件、搜索、过滤、归档、评论、草稿恢复和分享图片，并提供 33 种界面语言。

它不是云同步服务：Windows 和 Android 本地版只监听当前设备，不支持公网分享或多设备云同步。JSON 导出适合迁移文字备忘录，但不包含附件文件、评论和实例配置，不能当作完整备份。

正式 Release：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
```

### 长文案

```text
很多开源笔记项目本身并不难用，真正挡住普通用户的往往是部署：需要准备服务器、安装 Docker、配置数据库，再处理升级和备份。MemoArk 想解决的是这一步。

MemoArk 是一个基于 Memos 的独立开源项目，保留轻量、Markdown 优先的记录方式，同时提供可直接安装的 Windows 和 Android 完整本地版。用户下载 Windows 安装程序或 Android APK 后即可在本机运行；前端、Go 后端和 SQLite 数据库都包含在安装包里，不要求另外安装 Docker、Node.js、Go，也不要求拥有 VPS。

在日常笔记方面，它支持 Markdown、标签、待办、附件、录音、位置、评论、提及、搜索、过滤、日历、置顶和归档。备忘录可以生成 PNG 图片，Android 还可以调用系统分享菜单发送文字或图片。未保存正文会缓存在当前设备上，发生意外刷新或退出时可以恢复；如果服务端版本已经变化，界面会提示冲突，避免静默覆盖。

本地版的核心功能可以离线使用，但“本地”也意味着需要明确边界。Windows 和 Android 本地版只监听本机地址，复制出来的页面链接或分享链接通常不能被其他设备访问，因此它不是公网分享工具，也没有提供多设备云同步。需要把内容发给别人时，更适合生成分享图片或复制正文。

数据迁移和备份同样需要区分：JSON 导出包含普通及归档备忘录和附件元数据，适合迁移文字内容，但不包含附件文件、评论和实例配置，也不能完整恢复所有关系与设置。Windows 用户如果需要完整备份，应先退出 MemoArk，再复制整个 %LOCALAPPDATA%\MemoArk 数据目录；Android 用户卸载前应导出需要保留的备忘录，并另外保存重要附件原文件。

当前正式 Release 同时提供 Windows/Android CycloneDX SBOM、第三方许可披露、SHA-256 校验文件和发布清单。项目代码按 MIT License 发布，并保留上游 Git 历史，便于追踪来源。

下载与中文说明：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-zh-CN.md
```

## 7. V2EX

### 标题

```text
[分享创造] MemoArk：提供 Windows / Android 完整本地包的开源 Memos 分支
```

### 短文案

```text
做了一个基于 Memos 的独立开源项目 MemoArk，目标是让不想部署服务器的用户也能直接使用。

当前 Release 提供 Windows Setup、Windows 便携 ZIP 和 Android APK。本地包包含前端、Go 后端与 SQLite，核心功能离线可用；新增/强化了本地草稿恢复、冲突提醒、Android 系统文件与分享流程，以及 33 种语言的一致性检查。

边界：本地版只监听本机地址，不提供公网分享或多设备云同步；JSON 导出用于文字备忘录迁移，不是完整备份。

Repo：https://github.com/harrychin-cn/memoark
Release：https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
```

### 长文案

```text
项目地址：https://github.com/harrychin-cn/memoark
正式 Release：https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12

MemoArk 是基于 Memos v0.29.1 基线维护的独立开源项目，主要补齐普通用户直接在 Windows / Android 本机使用的路径。

这次发布包含：

- MemoArk-Setup.exe：Windows 普通安装版；
- memoark-0.29.1-memoark.12-windows-amd64.zip：Windows 便携版；
- MemoArk-0.29.1-memoark.12-Android.apk：Android 完整本地版；
- SHA256SUMS.txt、独立 SHA-256、Windows/Android CycloneDX SBOM、第三方许可披露与发布清单。

本地包内含前端、Go 后端和 SQLite，不需要另外安装 Docker、Node.js、Go 或准备 VPS。Windows 本地服务只监听 127.0.0.1:5230；默认数据目录是 %LOCALAPPDATA%\MemoArk。Android 使用 App 私有目录，并在进入后台、锁屏或退出时关闭本地后端和数据库，返回 App 后自动重启。

功能包括 Markdown、标签、待办、附件、录音、位置、评论、搜索、过滤、归档和分享图片。编辑器对未保存正文提供当前设备草稿缓存，恢复时如果发现版本变化会提示冲突。界面现有 33 种语言，并支持浅色、深色、纸张和跟随系统主题。

有几个限制主动说明：

1. 本地版没有公网分享能力，页面链接和分享链接通常只能在当前设备打开；
2. 没有多设备云同步；
3. JSON 导出不含附件文件、评论和实例配置，只适合迁移文字备忘录；
4. Windows 安装包暂未使用商业代码签名证书，可能触发 SmartScreen“未知发布者”；
5. MemoArk 与上游 Memos 项目没有官方隶属或背书关系。

欢迎实际试用后反馈问题。提交 Issue 时最好附上 MemoArk 版本、系统版本和复现步骤。
```

## 8. B站

### 视频标题

```text
1. 不用服务器的开源笔记？MemoArk Windows / Android 本地版体验
2. 把 Memos 装进电脑和手机：MemoArk 安装与功能演示
3. 开源本地笔记 MemoArk：安装、草稿恢复、分享和备份边界
```

### 短简介

```text
MemoArk 是一个基于 Memos 的独立开源笔记应用，提供 Windows 安装版、便携版和 Android 完整本地 APK。本视频演示安装、Markdown 记录、附件、搜索整理、草稿恢复、分享图片，以及本地数据和 JSON 导出的正确使用方式。

下载：https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
源码：https://github.com/harrychin-cn/memoark
```

### 长简介

```text
MemoArk v0.29.1-memoark.12 已正式发布。

本地版内含前端、Go 后端和 SQLite，Windows 与 Android 用户无需安装 Docker、Node.js、Go，也不需要准备 VPS。核心记录与整理功能可离线运行。

本期内容：
00:00 MemoArk 是什么
00:30 Windows / Android 下载文件怎么选
01:30 第一次启动与创建账号
02:10 Markdown、标签、待办和附件
03:20 搜索、过滤、置顶和归档
04:10 草稿恢复与冲突提醒
05:00 生成分享图片与 Android 系统分享
05:50 数据目录、JSON 导出和备份边界
07:00 已知限制与开源信息

请注意：本地版不支持公网分享或多设备云同步。JSON 导出适合迁移文字备忘录，但不包含附件文件、评论和实例配置，不是完整备份。

正式版下载：
https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12

中文说明：
https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-zh-CN.md

问题反馈：
https://github.com/harrychin-cn/memoark/issues/new?template=bug_report.yml

#开源软件 #笔记软件 #Markdown #Windows软件 #Android #效率工具
```

### 置顶评论

```text
下载文件选择：Windows 普通用户用 MemoArk-Setup.exe；便携使用选 windows-amd64.zip 并完整解压；Android 选 Android.apk。Windows 安装包暂未使用商业代码签名，Android 首次安装需要允许当前下载应用“安装未知应用”。需要核验文件时请使用 Release 中的 SHA256SUMS.txt。
```

## 9. 开源社区

适用于 GitHub Discussions、开源中国、Gitee 动态、技术论坛或项目周报。

### 标题

```text
MemoArk v0.29.1-memoark.12 发布：Windows / Android 完整本地版与 33 种语言支持
```

### 短文案

```text
MemoArk v0.29.1-memoark.12 已发布。MemoArk 是基于 Memos 的独立开源笔记项目，本版提供 Windows Setup、Windows 便携 ZIP 和 Android 本地 APK，内含前端、Go 后端与 SQLite，核心功能可离线使用。

本版完成 33 种界面语言一致性检查，并提供草稿恢复、版本冲突提醒、附件、搜索整理、分享图片和 JSON 文字备忘录迁移等能力。Release 附带 SHA-256、CycloneDX SBOM、第三方许可披露和发布清单。

Release：https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
Repository：https://github.com/harrychin-cn/memoark
```

### 长文案

```text
MemoArk v0.29.1-memoark.12 正式发布。

MemoArk 是基于 Memos 的独立开源项目，面向本地使用场景补齐了可直接安装的 Windows 和 Android 发行形式，同时保留自托管能力。本地包包含前端、Go 后端和 SQLite 数据库，普通用户无需另外准备 Docker、Node.js、Go、VPS 或外部服务器。

主要能力：

- Markdown、标签、待办、附件、录音、位置与评论；
- 搜索、过滤、日历、置顶、归档与常用过滤捷径；
- 当前设备草稿缓存、恢复选择和版本冲突提醒；
- 备忘录 PNG 图片生成与 Android 系统分享；
- JSON 文字备忘录迁移；
- 33 种界面语言和 4 种主题。

发布产物：

- Windows 标准安装程序；
- Windows amd64 便携 ZIP；
- Android 完整本地 APK；
- SHA-256 校验文件；
- Windows/Android CycloneDX SBOM；
- 第三方许可披露和发布清单。

已知边界：Windows 和 Android 本地版只监听当前设备，不提供公网分享或多设备云同步；JSON 导出不包含附件文件、评论和实例配置，不能替代完整备份；Windows 安装包暂未使用商业代码签名证书。

MemoArk 保留上游 Git 历史，代码按 MIT License 发布。欢迎试用、审阅和提交可复现的问题。

Repository：https://github.com/harrychin-cn/memoark
Release：https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
中文说明：https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-zh-CN.md
```

## 10. FAQ

### MemoArk 是什么？

MemoArk 是一个基于 Memos 的独立开源笔记应用，保留轻量、Markdown 优先的体验，并提供可直接安装的 Windows 和 Android 完整本地版，也支持自行部署。

### MemoArk 和 Memos 是什么关系？

MemoArk 基于 Memos 开发并保留上游 Git 历史，但它是独立项目，与 Memos 原项目没有官方隶属或背书关系。

### 不会部署服务器能用吗？

可以。Windows 安装版、Windows 便携版和 Android APK 都包含本地运行需要的组件。普通用户不需要安装 Docker、Node.js、Go，也不需要准备 VPS。

### 没有网络能用吗？

本地版的核心记录与整理功能可以离线使用。录音转文字等依赖外部服务的功能需要管理员另行配置可用的 AI provider，并可能需要网络。

### 支持哪些平台？

当前正式 Release 提供 Windows amd64 安装版、Windows amd64 便携版和 Android APK；项目也保留自托管方式。当前 Release 没有 macOS、Linux 桌面或 iOS 本地安装包。

### 支持多设备云同步吗？

当前本地版不支持多设备云同步。Windows 和 Android 各自在当前设备保存数据。

### 能把分享链接发给其他人吗？

本地版只监听本机地址，页面链接或分享链接通常只能在当前设备打开。需要把内容发给别人时，可以生成 PNG 分享图片、复制正文，或在 Android 上使用系统分享菜单。只有自行部署到对方可访问的服务器后，分享链接才适合对外发送。

### 数据保存在哪里？

Windows 默认保存在 `%LOCALAPPDATA%\MemoArk`，其中包含 SQLite 数据库、附件和日志。Android 数据保存在 App 私有目录。

### JSON 导出是不是完整备份？

不是。JSON 包含普通及归档备忘录和附件元数据，但不包含附件文件、评论和实例配置，也不能完整恢复关系、反应、位置和设置。它主要用于迁移文字备忘录。

### 怎样备份 Windows 数据？

先从开始菜单执行“退出 MemoArk”，确认程序已经停止，再完整复制 `%LOCALAPPDATA%\MemoArk` 到其他磁盘。不要在程序运行时替换 SQLite 数据库。

### Android 卸载后数据还在吗？

Android 卸载 App 通常会删除应用私有目录中的账号、数据库和附件。卸载前必须导出需要保留的备忘录，并另外保存重要附件原文件。升级时应直接覆盖安装，不要先卸载旧版。

### Windows 为什么提示“未知发布者”？

当前 Windows 安装包暂未使用商业代码签名证书，因此 SmartScreen 可能显示“未知发布者”。请从项目正式 Release 下载，并使用 `SHA256SUMS.txt` 核验文件。

### Android 为什么要求“安装未知应用”？

APK 从 GitHub 下载，不是通过应用商店安装，因此 Android 首次安装时会要求授权当前浏览器或文件管理器安装未知应用。

### 支持哪些语言和主题？

当前界面提供 33 种语言。主题支持跟随系统、浅色、深色和纸张。

### 是免费开源的吗？

项目代码按 MIT License 发布。正式 Release 同时提供第三方许可披露、SBOM 和发布清单。

### 遇到问题怎样反馈？

在 GitHub 提交 Issue，并说明 MemoArk 版本、Windows 或 Android 系统版本、操作步骤、预期结果和实际结果，尽量附上截图。

## 11. 评论回复模板

### “这和 Memos 有什么区别？”

```text
MemoArk 基于 Memos，保留轻量和 Markdown 优先的体验，当前重点是补齐普通用户可直接安装的 Windows / Android 本地版、草稿恢复、故障提示和数据迁移路径。它是独立项目，不代表 Memos 官方。
```

### “要自己买服务器吗？”

```text
使用 Windows 或 Android 本地版不需要服务器，安装包里已经包含前端、后端和 SQLite。只有你主动选择自托管、并希望其他设备访问时，才需要准备可访问的服务器环境。
```

### “能同步电脑和手机吗？”

```text
当前本地版没有多设备云同步，电脑和手机的数据各自保存在当前设备。不要把它当作云同步服务；现阶段可以用 JSON 迁移文字备忘录，但附件需要另外处理。
```

### “链接能发给朋友打开吗？”

```text
Windows 和 Android 本地版只监听当前设备，所以链接通常不能在朋友的设备上打开。对外发送内容建议生成分享图片、复制正文，或使用 Android 系统分享。自行部署到对方可访问的服务器后，分享链接才适合发给别人。
```

### “导出 JSON 就算备份了吗？”

```text
不算完整备份。JSON 主要用于迁移文字备忘录，不包含附件文件、评论和实例配置。Windows 做完整备份要先退出 MemoArk，再复制整个 %LOCALAPPDATA%\MemoArk；Android 还要单独保留重要附件原文件。
```

### “数据安全吗，会不会上传？”

```text
Windows 和 Android 本地版把数据库保存在当前设备，核心记录与整理功能可离线运行。是否使用需要联网的 AI provider 或自托管集成，取决于管理员是否另外配置。项目代码和隐私说明都可以在 GitHub 查看。
```

### “为什么 Windows 会拦截？”

```text
当前安装包没有商业代码签名证书，SmartScreen 可能显示“未知发布者”。请只从项目正式 Release 下载，并用同页的 SHA256SUMS.txt 核验文件；文件校验值也写在 Release 说明中。
```

### “APK 安装不了怎么办？”

```text
请确认下载的是文件名以 Android.apk 结尾的正式 Release 文件，并允许当前浏览器或文件管理器“安装未知应用”。如果仍失败，请提供手机系统版本、MemoArk 版本和报错截图。
```

### “支持 iPhone / Mac / Linux 吗？”

```text
当前正式 Release 的本地安装包是 Windows amd64 和 Android APK，没有 macOS、Linux 桌面或 iOS 本地包。项目保留自托管方式，但不要把自托管网页访问和本地安装包混为一谈。
```

### “可以录音转文字吗？”

```text
可以录制音频附件；“转为文字”需要管理员另外配置可用的 AI provider，不能把它宣传成完全离线内置功能。
```

### “Windows 安装版和便携版数据互通吗？”

```text
两者默认都使用 %LOCALAPPDATA%\MemoArk，因此可以读取同一份本机数据，但不要同时启动两个实例。便携 ZIP 要先完整解压，再按中文说明启动。
```

### “卸载会不会删除数据？”

```text
Windows 卸载不会删除 %LOCALAPPDATA%\MemoArk 用户数据；Android 卸载通常会删除 App 私有数据。无论哪个平台，升级前都建议先按中文说明保留数据，Android 不要通过先卸载再安装的方式升级。
```

### “是免费的吗？有没有广告？”

```text
项目代码按 MIT License 发布。当前 MemoArk 维护的发行版没有付费展示或联盟链接；第三方许可、广告与赞助披露都可以在仓库中查看。
```

### “怎么反馈 Bug？”

```text
请到 https://github.com/harrychin-cn/memoark/issues/new?template=bug_report.yml 提交，并附上 MemoArk 版本、系统版本、复现步骤、预期结果、实际结果和截图，这样最容易定位。
```

## 12. 发布检查清单

### 发布前

- [ ] 标题里写清楚 MemoArk，不冒充 Memos 官方版本。
- [ ] 使用正式 Release 链接，不上传来源不明的二次打包文件。
- [ ] 文件名与版本保持为 `v0.29.1-memoark.12`，不要混用旧版本截图或旧下载地址。
- [ ] Windows、Android 和自托管三种使用方式不要混写。
- [ ] 只写“核心功能离线可用”，不写“全部功能永久完全离线”。
- [ ] 不宣称公网分享、多设备云同步、完整 JSON 备份、商业代码签名或未发布的平台支持。
- [ ] 涉及 JSON 时明确“不包含附件文件、评论和实例配置”。
- [ ] 涉及 Android 卸载时提醒 App 私有数据通常会被删除。
- [ ] 涉及 Windows 安装时说明 SmartScreen 可能显示“未知发布者”。
- [ ] 至少保留一个中文说明入口，避免只给安装包不提供使用说明。
- [ ] 截图使用仓库 README 中的真实桌面和手机界面，不使用与当前版本不一致的概念图。

### 发布时

- [ ] 首屏或前两段说明适用平台：Windows、Android，本项目也支持自托管。
- [ ] 下载入口指向 GitHub 正式 Release。
- [ ] 长文末尾附上限制说明、中文指南和问题反馈入口。
- [ ] 平台允许时附带 SHA-256 校验文件入口。
- [ ] 标签保持准确，例如“开源软件”“本地笔记”“Markdown”，不使用“云同步”“网盘替代”等误导标签。

### 发布后

- [ ] 自己打开一次发布内容中的 Release、指南和 Issue 链接。
- [ ] 检查平台是否截断链接或把 URL 识别成不可点击文本。
- [ ] 对“同步、分享、备份、签名、平台支持”问题优先使用本文标准回复。
- [ ] 收到 Bug 时引导用户提供版本、系统、复现步骤和截图，不在评论区猜测原因。
- [ ] 后续版本发布时同步更新版本号、文件名、SHA-256 入口和已验证能力。

## 13. 简短英文发布文案

### English title

```text
MemoArk v0.29.1-memoark.12: installable local note app for Windows and Android
```

### Short post

```text
MemoArk is an independent open-source note app based on Memos. The v0.29.1-memoark.12 release provides a Windows installer, a Windows portable ZIP, and a complete local Android APK. Each local edition includes the frontend, backend, and SQLite database, so no Docker, Node.js, Go, VPS, or external server is required for everyday use.

Core note-taking and organization features work offline, including Markdown, tags, to-do items, attachments, search, filters, archives, draft recovery, and shareable PNG images. The interface is available in 33 languages.

Local editions do not provide public-internet sharing or multi-device cloud sync. JSON export is intended for text memo migration and is not a complete backup.

Release: https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
Guide: https://github.com/harrychin-cn/memoark/blob/main/docs/user-guide-en.md
```

### One-line post

```text
MemoArk is an open-source, Markdown-first note app with installable Windows and Android local editions, offline core features, on-device data, draft recovery, and 33 interface languages: https://github.com/harrychin-cn/memoark/releases/tag/v0.29.1-memoark.12
```
