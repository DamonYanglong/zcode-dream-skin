/**
 * zcode-dream-skin/scripts/lib/platform.mjs
 * 跨平台路径与工具：支持目录、主题库、Codex 主题库、ZCode 可执行文件定位。
 * macOS: ~/Library/Application Support；Windows: %APPDATA%；Linux: XDG。
 * @author DamonYanglong
 * @date 2026/09/18
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const isMac = process.platform === "darwin";
export const isWin = process.platform === "win32";

/** 用户支持目录（状态文件 current-theme 的家） */
export function supportDir() {
  if (isMac) {
    return path.join(os.homedir(), "Library/Application Support/ZCodeDreamSkin");
  }
  if (isWin) {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "ZCodeDreamSkin");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "ZCodeDreamSkin");
}

/** 用户主题库（导入主题的默认目的地；菜单栏/托盘 app 与 CLI 共享） */
export function userThemesDir() {
  return path.join(supportDir(), "themes");
}

/** Codex Dream Skin 本地主题库（导入源）。Windows 实际位置在 LOCALAPPDATA（上游文档） */
export function codexThemesDir() {
  if (isMac) {
    return path.join(os.homedir(), "Library/Application Support/CodexDreamSkinStudio/themes");
  }
  if (isWin) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CodexDreamSkin", "themes"),
      path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "CodexDreamSkinStudio", "themes"),
    ];
    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
  }
  return path.join(supportDir(), "codex-themes");
}

/**
 * ZCode 可执行文件定位（start-themed 拉起调试端口用）。
 * macOS 返回 .app；Windows 依次探测常见安装位；支持 ZDS_ZCODE_EXE 覆盖。
 */
export function findZCode() {
  if (process.env.ZDS_ZCODE_EXE && fs.existsSync(process.env.ZDS_ZCODE_EXE)) {
    return process.env.ZDS_ZCODE_EXE;
  }
  if (isMac) return "/Applications/ZCode.app";
  if (isWin) {
    const programDirs = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs") : null,
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter(Boolean);
    for (const dir of programDirs) {
      const exe = path.join(dir, "ZCode", "ZCode.exe");
      if (fs.existsSync(exe)) return exe;
    }
    return null;
  }
  for (const bin of ["zcode", "ZCode"]) {
    const p = path.join("/usr/bin", bin); // 仅作占位探测，Linux 上通常无桌面端
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 平台正确的 file:// URL（Windows 盘符路径不能手拼，交给 node:url） */
export const fileUrlOf = (p) => pathToFileURL(p).href;
