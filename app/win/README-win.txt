ZCode Dream Skin（Windows 版）
==============================

给 ZCode 桌面端换肤的非官方小工具。本机回环 CDP 注入，不修改官方安装包。

安装（一步）
------------
双击 `ZCodeDreamSkin-Setup-vX.Y.Z.exe`，按向导完成即可（中英双语）。

- 安装包自带 Node 运行时，无需另装 node、无需管理员权限（按用户安装）
- 装完自动启动托盘；之后从开始菜单「ZCode Dream Skin」文件夹启动
- 未签名 exe 可能触发 SmartScreen：「更多信息 → 仍要运行」
- 「设置-应用」里可正常卸载（已保存的主题会保留）

没有 Setup.exe 时（便携/命令行场景）：解压 zip 包，双击其中的 install.cmd。

开始菜单
--------
  ZCode Dream Skin                常驻托盘（调色板图标）
  ZCode Dream Skin 恢复官方外观    应急还原入口（弹窗反馈结果）

托盘菜单
--------
- 切换主题：列出内置 + 你导入的全部主题，勾选当前
- 以换肤模式启动 ZCode…：带调试端口重启 ZCode 并注入（首次或重开后）
- 重新注入当前主题：ZCode 页面重载后补一下
- 恢复官方外观：移除注入样式，立即还原
- 导入主题 ZIP…：选择 DreamSkin 市场（dreamskin.cc）下载的主题包
- 打开主题文件夹：%APPDATA%\ZCodeDreamSkin\themes

安装位置： %LOCALAPPDATA%\Programs\ZCodeDreamSkin
更新：     运行新 Setup.exe 覆盖安装（主题与图片保留）
卸载：     「设置-应用」，或运行包内 uninstall.ps1（zip 场景）

命令行（可选）
--------------
  node engine\scripts\start-themed.mjs          以换肤模式启动并注入
  node engine\scripts\apply.mjs --theme <id>    注入/切换主题（幂等）
  node engine\scripts\restore.mjs               恢复官方外观
  node engine\scripts\status.mjs                查看端口/目标/当前主题
  node engine\scripts\screenshot.mjs --out shot.png

安全边界
--------
- CDP 只绑 127.0.0.1；换肤会话期间本机调试端口是敏感面，
  勿在期间运行来路不明的程序
- 退出托盘并正常重启 ZCode（不带调试端口）即恢复日常使用
- 不改写任何账号、模型供应商、API 配置

已知限制
--------
- 进入换肤模式需要重启 ZCode；重启会关掉当前 ZCode 会话，注意保存
- 窗口重开/页面重载后注入丢失，托盘"重新注入当前主题"即可（幂等）
- 托盘为 PowerShell 实现，勿重复启动（会出多个图标）

