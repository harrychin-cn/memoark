# MemoArk User Guide

[中文说明](user-guide-zh-CN.md) | **English Guide**

This guide is for everyday users who install MemoArk directly on Windows or Android. Both editions run the backend, frontend, and SQLite database locally, with no need for Docker, Node.js, Go, a VPS, or an external server.

## 1. Download and Installation

Download the appropriate file from the [latest GitHub release](https://github.com/harrychin-cn/memoark/releases/latest):

- Windows installer: `MemoArk-Setup.exe`
- Windows portable edition: the ZIP archive whose filename ends with `windows-amd64.zip`
- Android: the installation package whose filename ends with `Android.apk`
- Download verification: `SHA256SUMS.txt`

### Windows Installer Edition

1. Double-click `MemoArk-Setup.exe` and follow the setup wizard.
2. The installer creates shortcuts on the desktop and in the Start menu.
3. Double-click **MemoArk**. The application starts in the background without leaving a command-line window open.
4. Your browser opens the local MemoArk page; create the administrator account on first use.

The default data directory is `%LOCALAPPDATA%\MemoArk`. It contains the SQLite database, attachments, and logs. Upgrading or uninstalling the application does not delete this directory.

To stop MemoArk completely, use **Exit MemoArk** in the Start menu instead of forcibly terminating a process that may be writing data.

### Windows Portable Edition

1. Extract the entire ZIP archive to a regular folder. Do not run it from inside the archive.
2. Double-click `START-MemoArk.cmd`.
3. Keep the command window open; MemoArk opens automatically in your browser.
4. When finished, press `Ctrl+C` in the command window and wait for the application to exit.

The portable edition also stores data in `%LOCALAPPDATA%\MemoArk` by default, so it can use the same local data as the installer edition. Do not run both editions at the same time.

### Android Edition

1. After downloading the APK, follow the system prompt to allow your browser or file manager to “install unknown apps.”
2. Install and open MemoArk; create the administrator account on first use.
3. For future upgrades, install the new APK from the same release source directly. Do not uninstall the existing version first.

Android data is stored in the app's private directory. Installing an update over the existing version preserves the data, but uninstalling the app usually deletes it. Export any memos you need to keep before uninstalling.

## 2. Initial Setup

### Create an Account

On first launch, the “Create your account” screen appears. Enter a username and password to register. The first account becomes the administrator of the local instance. Keep the password safe.

### Change the Language and Theme

- Before signing in: use the language and theme menus at the bottom of the sign-in or registration page.
- After signing in: go to **Settings → Preferences → Appearance**.
- Available themes: Sync with system, Light, Dark, and Paper.
- Language and theme changes take effect immediately. When signed in, your language selection is saved to your account.

## 3. Create and Edit Memos

1. Return to **Home**, click the editor, and enter your content.
2. Select a visibility level:
   - **Private**: only you can view the memo.
   - **Workspace**: members signed in to the same instance can view the memo.
   - **Public**: anyone can view the memo without signing in; administrators can disable public memos.
3. Click **Save**.

The editor supports Markdown, for example:

```markdown
# Heading
- Regular list
- [ ] To-do item
**Bold**, `code`, and https://example.com
```

Enter `#tag-name` to add a tag. Enter `/` to open command suggestions. The insert menu can be used to:

- Upload image, audio, video, or document attachments
- Add a location
- Link another memo
- Record an audio attachment

Recording requires microphone permission. “Transcribe” also requires the administrator to configure an available AI provider first.

### Draft Protection

Unsaved content being edited is cached on the current device:

- After an unexpected refresh or exit, you can choose **Restore** or **Discard** when editing again.
- If the server version has changed, a conflict notice appears. After restoring, review the content before saving it manually.
- If sending fails, you can keep the local draft and try again.

The draft cache is local to the current device and browser. It is not a complete data backup.

## 4. Find and Organize Memos

- **Search**: find memos by their content.
- **Filters**: filter by tag, visibility, creator, presence of code, links, to-do items, and other criteria.
- **Sort**: sort by creation or update time, with newest or oldest first.
- **Calendar**: view memos for a selected date.
- **Pin**: keep frequently used content at the top.
- **Archive**: remove a memo from Home while keeping it; restore it from the **Archived** page.
- **Delete**: permanently delete a memo and its related attachments, links, and references. This cannot be undone.
- **Shortcuts**: save frequently used filter criteria and apply them again with one click.

## 5. Attachments, Comments, and Notifications

### Attachments

Select **Upload file** while editing a memo. Android opens the system file picker, while Windows opens the browser file selection window.

On the **Attachments** page, you can browse files by media, audio, and document categories. You can also remove uploaded files that are not associated with any memo.

### Comments, Mentions, and Notifications

When comments are enabled by an administrator, you can post comments on a memo's detail page. Member mentions in memo content or comments appear on the **Notifications** page; notifications can be archived.

## 6. Sharing

Open a memo's More actions menu to:

- Copy the content or a regular link
- Create a share link with an expiration time
- View and revoke previously created share links
- Generate a PNG image from the memo
- Use Android's system share sheet to share text or images

A regular page link does not automatically make a private or workspace memo public. To provide public access, create a dedicated share link. You can revoke it at any time after sharing.

The local Windows and Android editions listen only on the local device, so copied page links and share links generally open only on that device and cannot be accessed from someone else's device.
When sharing content externally from a local edition, prefer sharing an image, copying the text, or using Android's system share sheet. A share link is suitable for sending to others only when MemoArk is deployed on a server they can reach.

## 7. Import, Export, and Backup

Go to **Settings → My Account**:

- **Export Memos**: download a JSON file containing all regular and archived memos for the current account.
- **Import MemoArk JSON**: run a preflight check, then import into an empty account that has no memos.

The current JSON export contains memo data and attachment metadata, but not the attachment files, comments, or instance configuration. Importing also does not restore attachments, comments, relationships, reactions, locations, or settings.
Therefore, JSON is suitable for migrating text memos, not as a complete disk backup. The maximum import file size is 64 MiB.

### Complete Windows Backup

1. Use **Exit MemoArk** in the Start menu and confirm that the application has stopped.
2. Copy the entire `%LOCALAPPDATA%\MemoArk` directory to another drive.
3. Also keep your latest JSON export so that you can restore text content separately if needed.

Before restoring a complete backup, exit MemoArk and then restore the entire data directory. Do not replace the SQLite database while the application is running.

### Android Backup

Regular Android users cannot directly copy the app's private database. Use **Export Memos** regularly, and save the JSON file to the phone's Documents folder, cloud storage, or another device through the system save window.
Because JSON does not include attachment files, keep separate copies of important original attachments. You must export before uninstalling the app.

## 8. Settings Reference

Regular accounts can use:

- My Account: avatar, display name, password, import and export, and access tokens
- Preferences: language, theme, default visibility, and time display
- Webhooks and linked identities

Administrators can also manage:

- Members and registration rules
- Instance name, public access, and system settings
- Memo comments, locations, sensitive content, and reactions
- Tags, attachment storage, email notifications, SSO, AI providers, and resource statistics

Before changing advanced settings such as storage, SSO, AI, or access tokens, record the original values and create a data backup.

## 9. Mobile Usage

- **Back button**: closes the current dialog or returns to the previous page first; exits the app when there is no page to return to.
- **Select files**: uses the Android system file picker when uploading attachments or importing JSON.
- **Save files**: uses the system save window to choose a location when exporting JSON or images.
- **System sharing**: sends text or generated images to installed apps such as WeChat, email, or cloud storage.
- **Background or screen lock**: the app stops the local backend and safely closes the database. The local backend restarts automatically when you return to the app.

## 10. Upgrading and Uninstalling

### Windows

- Exit MemoArk before upgrading, then run the new `MemoArk-Setup.exe` to install over the existing version.
- Uninstall MemoArk through Windows **Installed apps** or **Uninstall MemoArk** in the Start menu.
- Uninstalling removes only the application, shortcuts, and registration information. It does not delete user data in `%LOCALAPPDATA%\MemoArk`.
- Manually delete the data directory only when you are certain that you no longer need the data.

### Android

- Install the new APK directly over the existing version. When the signing key matches, the account, database, and attachments are preserved.
- Do not upgrade by uninstalling first and then reinstalling.
- Uninstalling on Android usually deletes the account, database, and attachments. Export before uninstalling.

## 11. Frequently Asked Questions

### Windows Starts but No Page Opens

Open MemoArk again from the Start menu, or visit `http://127.0.0.1:5230/` in your browser. If it still does not respond, run **Exit MemoArk** first and then start it again.

### The Page Says the Port Is in Use

Another MemoArk instance is usually already running. Do not allow two applications to use the same data directory at the same time; exit the old instance and try again.

### Android Upload or Recording Fails

Check that the system allows MemoArk to access the selected file or microphone, then select the file again or restart the recording.

### Old Text Remains After Changing the Language

Confirm that you have installed the latest version, select the language again under **Settings → Preferences**, and then fully exit and reopen the app. If the issue can still be reproduced consistently, submit an issue with a screenshot of the page, your MemoArk version, operating system version, and selected language.

### How to Report an Issue

- [Report a bug](https://github.com/harrychin-cn/memoark/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/harrychin-cn/memoark/issues/new?template=feature_request.yml)
- [Privacy notice](../PRIVACY.md)
- [Report a security issue](https://github.com/harrychin-cn/memoark/security/advisories/new)

When reporting an issue, include your MemoArk version, Windows or Android system version, steps to reproduce, expected result, and actual result. Include screenshots whenever possible.
