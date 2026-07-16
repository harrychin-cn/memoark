# MemoArk Android 发布

## 首次配置签名

```powershell
.\scripts\android\initialize-signing.ps1
```

脚本会在 `%LOCALAPPDATA%\MemoArk\signing` 创建发布密钥和加密签名配置。两份文件必须一起备份；后续 APK 必须继续使用同一密钥，Android 才允许覆盖升级并保留数据。密钥和密码不会写入仓库。

## 一次生成完整发布包

工作区提交并保持干净后运行：

```powershell
.\scripts\package-complete-release.ps1 -Version 0.29.1-memoark.11 -AndroidVersionCode 11
```

输出位于 `build/releases`，包括：

- `MemoArk-Setup.exe`
- Windows 便携 ZIP
- 已签名 Android APK
- Windows/Android SBOM
- Windows/Android 第三方许可披露
- `SHA256SUMS.txt`

发布脚本只生成本地产物，不会提交、推送、触发 GitHub Actions 或创建 GitHub Release。
