MemoArk Windows 本地使用说明
==============================

这不是需要部署到 VPS、NAS 或 Docker 的版本。
双击 START-MemoArk.cmd 后，MemoArk 只会在当前电脑启动，并自动用浏览器打开：

  http://127.0.0.1:5230/

首次打开时创建账号即可开始使用。

数据存放位置
------------

默认数据目录：

  %LOCALAPPDATA%\MemoArk

其中包含 SQLite 数据库和本地附件。升级时只替换解压后的程序文件，不要删除这个数据目录。
请定期备份整个 MemoArk 数据目录。

安全与网络
----------

启动器固定使用 127.0.0.1，只允许当前电脑访问；不会默认暴露给局域网或公网。
因此手机、其他电脑和外网不能直接访问这份本地实例。需要多设备同步或持续在线时，再部署服务器版。

启动与停止
----------

1. 解压完整 ZIP 到任意普通文件夹。
2. 双击 START-MemoArk.cmd。
3. 保持弹出的命令窗口打开；浏览器会在服务就绪后自动打开。
4. 使用完毕时，回到命令窗口按 Ctrl+C，等待程序退出后再关闭窗口。

如果本机已有 Docker 或另一份 MemoArk 占用 5230 端口，启动器会打开正在运行的本地实例，
而不会启动第二个实例。不要让两个实例同时使用同一个数据目录。

高级用法
--------

- 临时换端口：在命令提示符中先执行 set MEMOARK_PORT=15230，再双击或运行启动器。
- 临时换数据目录：先执行 set "MEMOARK_DATA_DIR=D:\\My MemoArk Data"，再运行启动器。
- 自动化测试可设置 MEMOARK_NO_BROWSER=1，阻止启动器自动打开浏览器。

本压缩包内的 LICENSE、NOTICE、THIRD_PARTY_NOTICES、SBOM.cdx.json、PRIVACY.md、
TRADEMARKS.md 和 ADVERTISING.md 是发行材料的一部分，请一并保留。
