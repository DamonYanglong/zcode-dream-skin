# ZCode Dream Skin

给 ZCode 桌面端换一张会呼吸的脸。灵感与工程范式来自
[Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin)（MIT），针对 ZCode 的
Tailwind v4 语义变量体系重写了主题层。

**非 ZCode 官方产品。** 不修改 `.app`、`app.asar` 与代码签名——只做本机回环 CDP 注入。

## 它是怎么工作的

ZCode 是 Electron 应用，暗色外观由 `.dark` class + 一整套语义 CSS 变量驱动
（`--color-background / panel / sidebar / surface / card / brand / border / terminal-*`，
见 `app.asar/out/renderer/assets/styles-*.css`）。因此换肤只需要：

1. 以 `--remote-debugging-port=9342` 重启 ZCode（Chromium 标准开关）
2. 注入器经 `127.0.0.1` 连 CDP，往渲染进程挂两个 `<style>`：
   - 背景图 data URI（`--zds-bg`）
   - 主题 CSS（覆盖语义变量为半透明色，让背景透出）
3. 恢复 = 移除这两个 `<style>`，官方外观立即还原

## 快速开始

```bash
# 1. 退出 ZCode（重要：已在运行的实例没有调试端口）
# 2. 以换肤模式启动并注入默认主题
./scripts/start-themed.sh

# 切换主题（themes/ 下任意目录名）
./scripts/start-themed.sh --theme gothic-void-crusade

# 查看状态
./scripts/status.sh

# 恢复官方外观（无需重启）
node scripts/restore.mjs
```

要求：macOS、node ≥ 22（零 npm 依赖）、ZCode 桌面端。

## 主题包格式

```
themes/<id>/
├── theme.json   # schema=zcode-dream-skin-theme/1，声明 image/appearance/colors
├── theme.css    # 变量覆盖 CSS（#zds-theme-css）
└── background.jpg
```

`theme.css` 里用 `var(--zds-bg)` 引用背景，`apply.mjs` 会把图片内嵌为 data URI。

## 安全边界

- CDP 只绑 `127.0.0.1`；换肤会话期间本机调试端口是敏感面，**勿在期间运行来路不明的程序**
- 恢复日常使用：`node scripts/restore.mjs` 后退出 ZCode 正常重开（关闭调试端口）
- 不改写任何账号、模型供应商、API 配置

## 已知限制

- ZCode 更新后语义变量可能改名/调整，主题 CSS 需要随之维护
- 窗口重开/页面重载后注入会丢失，重跑 `./scripts/start-themed.sh`（幂等）
- 浅色主题未适配（当前主题按 dark 外观设计）

## 致谢

本项目站在 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 的肩膀上，
感谢它贡献的工程范式与产品经验：本机回环 CDP 注入与安全模型、主题包资产（MIT）、
以及「首页图片清晰 / 任务页 ambient 蒙层」的双态交互策略。没有这个优秀的开源项目，
就没有 ZCode Dream Skin。也感谢 [seansong-ideogram](https://github.com/seansong-ideogram)
创作的 Gothic Void Crusade 背景艺术（MIT）。
- Gothic Void Crusade 背景图由 [seansong-ideogram](https://github.com/seansong-ideogram) 创作（MIT）

## 接入 Codex Dream Skin 主题市场

你从 [DreamSkin.cc](https://dreamskin.cc) 市场装到本机 Codex 客户端的主题，都在
`~/Library/Application Support/CodexDreamSkinStudio/themes/`。本项目可以直接消费它们：

```bash
node scripts/import-theme.mjs --zip x.zip     # 直接导入市场下载的 ZIP 包
node scripts/import-theme.mjs --list          # 列出可导入主题
node scripts/import-theme.mjs --all           # 全部导入
node scripts/import-theme.mjs --id preset-x   # 导入指定主题
node scripts/import-theme.mjs --dir /path     # 导入任意 Codex 格式主题目录

node scripts/apply.mjs --theme codex-preset-x # 切到导入的主题
```

导入目的地：菜单栏 app 走用户主题库（`~/Library/Application Support/ZCodeDreamSkin/themes`），
CLI 默认同路径，加 `--into-repo` 才写入仓库（用于贡献主题）。

配色策略：源主题带 `colors` 则映射；否则**从背景图自动取平均色推导**暗/亮两套变量
（`sips` 1×1 采样，macOS 自带）。生成的 `theme.css` 头部带 `AUTO-GENERATED` 标记，可手调。

> 版权注意：市场主题的素材权利各异（上游 NOTICE 明确列出受限素材）。导入的主题
> 仅本地使用；不可再分发的素材已被 `.gitignore` 挡在仓库外，请勿强行提交。
