# ZCode Dream Skin

给 ZCode 桌面端换一张会呼吸的脸。灵感与工程范式来自
[Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin)（MIT），
针对 ZCode 的 Tailwind v4 语义变量体系重写了主题层。

**非 ZCode 官方产品。** 不修改 `.app`、`app.asar` 与代码签名——只做本机回环 CDP 注入。

## 安装（macOS 菜单栏 App，推荐）

从 [Releases](../../releases) 下载 `ZCodeDreamSkin-vX.Y.Z.dmg`，拖入 Applications 启动。
首次打开未签名 app：右键 → 打开。

启动后**没有窗口**——它常驻菜单栏（调色板图标；多显示器 setup 下可能出现在
副屏的菜单栏上）。菜单功能：

- **切换主题**：列出内置 + 你导入的全部主题，勾选当前
- **以换肤模式启动 ZCode…**：带调试端口重启 ZCode 并注入（首次或重开后）
- **重新注入当前主题**：ZCode 页面重载后补一下
- **恢复官方外观**：移除注入样式，立即还原
- **导入主题 ZIP…**：选择 DreamSkin 市场下载的主题包，一键入库
- **导入 Codex 主题库全部…**：把已装进 Codex 客户端的市场主题批量转换
- **打开主题文件夹**：`~/Library/Application Support/ZCodeDreamSkin/themes`

退出 app 或正常重启 ZCode 即关闭调试端口，恢复日常使用。

## 安装（Windows 托盘 App）

从 [Releases](../../releases) 下载 **`ZCodeDreamSkin-Setup-vX.Y.Z.exe`**，双击按向导
完成（中英双语）。安装包自带 Node 运行时（无需另装 node、无需管理员权限，按用户安装
到 `%LOCALAPPDATA%\Programs\ZCodeDreamSkin`），「设置-应用」可正常卸载。装完自动启动
托盘；之后从开始菜单「ZCode Dream Skin」文件夹启动。

- **ZCode Dream Skin**：常驻托盘（调色板图标），菜单功能与 macOS 菜单栏 app 对应
- **ZCode Dream Skin 恢复官方外观**：应急还原入口（弹窗反馈结果）

用户主题库在 `%APPDATA%\ZCodeDreamSkin\themes`。托盘为 PowerShell + WinForms 实现
（系统自带）。另有 zip 便携包（解压后双击 `install.cmd`）。
更新 = 运行新 Setup.exe 覆盖安装（主题保留）。

## 它是怎么工作的

ZCode 是 Electron 应用，外观由 `.dark` class（以及 ZCode 自有的
`theme-zai-light/dark` class）+ 一整套语义 CSS 变量驱动。换肤只需要：

1. 以 `--remote-debugging-port=9342` 重启 ZCode（Chromium 标准开关）
2. 注入器经 `127.0.0.1` 连 CDP，往渲染进程挂两个 `<style>`：
   背景图层（`file://` 引用主题图，**任意大小**）+ 方向渐变 scrim 与语义变量覆盖
3. 恢复 = 移除这两个 `<style>` 并还原外观 class，官方外观立即还原

注入器自带文字色兜底：任何主题（含旧版导入与市场包）只要把过暗的颜色放进暗壳、
或过亮的放进浅壳，注入时自动纠正为主题色相的可读色，无需逐主题处理。

视觉层叠模型对齐 Codex Dream Skin：**首页**水平 hero-scrim（文字区重、
焦点图区裸露）；**对话页**垂直 task-fade + 水平 task-shade（顶部清、
底部输入区实底）；侧栏独立半透明 + 毛玻璃。

## 主题包格式

```
themes/<id>/
├── theme.json   # schema=zcode-dream-skin-theme/1
├── theme.css    # 变量覆盖 + 渐变 scrim（#zds-theme-css）
└── background.* # 任意大小；jpg/png/webp
```

`theme.json` 关键字段：

- `appearance`: `"dark"` / `"light"` / `"adaptive"` —— **暗图必须配暗壳**。
  声明 dark/light 的主题会在注入时强制 ZCode 对应外观；adaptive 跟随系统
- `art.focusX/focusY`: 背景焦点（渐变留白侧的反方向）
- `image`: 背景图文件名

主题 CSS 里用 `var(--zds-bg)` 引用背景，`apply.mjs` 注入时以 `file://` URL
指向主题图文件。

## 命令行

```bash
node scripts/start-themed.mjs                   # 以换肤模式启动 ZCode 并注入
node scripts/apply.mjs --theme <id>             # 注入/切换主题（幂等）
node scripts/apply.mjs --theme <id> --port N    # 指定调试端口
node scripts/restore.mjs                        # 恢复官方外观
node scripts/status.mjs                         # 查看端口/目标/当前主题
node scripts/screenshot.mjs --out shot.png      # 截图（主题调试用）
```

要求：macOS 或 Windows、node ≥ 22（零 npm 依赖）、ZCode 桌面端。
ZCode 安装在非标准位置时，设 `ZDS_ZCODE_EXE` 指向其可执行文件。

## 接入 Codex Dream Skin 主题市场

[DreamSkin.cc](https://dreamskin.cc) 市场下载的主题 ZIP 可以直接导入：

```bash
node scripts/import-theme.mjs --zip x.zip     # 导入市场 ZIP 包
node scripts/import-theme.mjs --list          # 列出可导入主题
node scripts/import-theme.mjs --all           # 全部导入 Codex 本地主题库
node scripts/import-theme.mjs --dir /path     # 导入解压后的主题目录
node scripts/import-theme.mjs --into-repo ... # 贡献回仓库时加此参数
```

- 导入目的地：默认用户主题库（macOS `~/Library/Application Support/ZCodeDreamSkin/themes`，
  Windows `%APPDATA%\ZCodeDreamSkin\themes`），菜单栏/托盘 app 与命令行都能看到；
  `--into-repo` 写入仓库（用于贡献）
- 配色：源主题带 `colors` 则映射；否则从背景图自动取平均色推导暗/亮两套变量
  （macOS `sips` / Windows `System.Drawing`，均为系统自带）。生成的 `theme.css` 带
  `AUTO-GENERATED` 标记，可手调
- 市场 ZIP 里针对 Codex 的 `theme.css` 不会被使用（DOM 体系不同），视觉全部
  由本项目按 ZCode 的变量体系重新生成

> 版权注意：市场主题的素材权利各异（上游 NOTICE 有清单）。导入的主题默认只进
> 用户主题库（不进仓库）；可再分发的素材才提交到仓库。

## 安全边界

- CDP 只绑 `127.0.0.1`；换肤会话期间本机调试端口是敏感面，**勿在期间运行来路不明的程序**
- 恢复日常使用：`node scripts/restore.mjs` 后退出 ZCode 正常重开（关闭调试端口）
- 不改写任何账号、模型供应商、API 配置

## 已知限制

- ZCode 更新后语义变量可能改名/调整，主题 CSS 需要随之维护
- 窗口重开/页面重载后注入会丢失，菜单栏"重新注入当前主题"或重跑 start-themed（幂等）
- 多显示器下，菜单栏图标可能出现在副屏的菜单栏上
- Windows 托盘为 PowerShell 实现（v1）：长操作（换肤启动）期间托盘短暂无响应属正常；
  进入换肤模式需要重启 ZCode，会关闭当前会话，注意保存
## 致谢

本项目站在 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 的肩膀上，
感谢它贡献的工程范式与产品经验：本机回环 CDP 注入与安全模型、主题包资产（MIT）、
方向渐变 scrim 的层叠手法，以及「首页图片清晰 / 任务页 ambient 蒙层」的双态交互策略。
没有这个优秀的开源项目，就没有 ZCode Dream Skin。也感谢
[seansong-ideogram](https://github.com/seansong-ideogram) 创作的 Gothic Void Crusade
背景艺术（MIT）。
