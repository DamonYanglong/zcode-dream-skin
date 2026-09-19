#!/usr/bin/env node
/**
 * zcode-dream-skin/scripts/start-themed.mjs
 * 以回环调试端口启动 ZCode 并注入当前主题（原 start-themed.sh 的跨平台版）。
 * 用法: node scripts/start-themed.mjs [--theme <id>] [--port <1024-65535>]
 * @author DamonYanglong
 * @date 2026/09/18
 */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findZCode, isMac, isWin } from "./lib/platform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = (() => {
  const i = process.argv.indexOf("--port");
  const p = Number(i !== -1 ? process.argv[i + 1] : process.env.ZDS_PORT || "9342");
  if (!Number.isInteger(p) || p < 1024 || p > 65535) {
    console.error("[zds] --port 需要在 1024-65535 之间。");
    process.exit(1);
  }
  return p;
})();
const THEME = (() => {
  const i = process.argv.indexOf("--theme");
  return (i !== -1 && process.argv[i + 1]) ? process.argv[i + 1] : (process.env.ZDS_THEME || "gothic-void-crusade");
})();

async function cdpAlive() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

function zcodeRunning() {
  try {
    if (isMac) {
      execFileSync("/usr/bin/pgrep", ["-x", "ZCode"], { stdio: "ignore" });
      return true;
    }
    if (isWin) {
      const out = execFileSync("tasklist",
        ["/FI", "IMAGENAME eq ZCode.exe", "/FO", "CSV", "/NH"],
        { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).toString();
      return out.includes("ZCode.exe");
    }
    for (const name of ["ZCode", "zcode"]) {
      try { execFileSync("pgrep", ["-x", name], { stdio: "ignore" }); return true; } catch {}
    }
    return false;
  } catch { return false; }
}

function launchZCode() {
  const exe = findZCode();
  if (!exe) {
    console.error("[zds] 未找到 ZCode 可执行文件。");
    console.error(isWin
      ? "[zds] 查找了 %LOCALAPPDATA%\\Programs\\ZCode、C:\\Program Files\\ZCode 等位置；"
        + "自定义安装路径请设置环境变量 ZDS_ZCODE_EXE 后重试。"
      : "[zds] 请设置环境变量 ZDS_ZCODE_EXE 指向 ZCode 后重试。");
    process.exit(4);
  }
  console.log(`[zds] 以调试端口 ${PORT} 启动 ZCode（${exe}）...`);
  if (isMac) {
    spawn("/usr/bin/open", ["-a", exe, "--args", `--remote-debugging-port=${PORT}`],
      { stdio: "ignore", detached: true }).unref();
  } else {
    spawn(exe, [`--remote-debugging-port=${PORT}`], { stdio: "ignore", detached: true }).unref();
  }
}

async function waitCdp(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await cdpAlive()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------- 主流程 ----------
if (await cdpAlive()) {
  console.log(`[zds] 调试端口 ${PORT} 已就绪，直接注入主题。`);
} else if (zcodeRunning()) {
  console.error("[zds] ZCode 正在运行但没有调试端口。");
  console.error("[zds] 注入需要以 --remote-debugging-port 重启 ZCode；请先手动退出 ZCode 再运行本脚本。");
  process.exit(2);
} else {
  launchZCode();
  if (!await waitCdp(30000)) {
    console.error("[zds] 等待 CDP 端口超时（30s）。ZCode 可能不透传该开关，请提 issue。");
    process.exit(3);
  }
  console.log("[zds] CDP 端口就绪。");
}

const r = spawnSync(process.execPath,
  [path.join(here, "apply.mjs"), "--port", String(PORT), "--theme", THEME],
  { stdio: "inherit" });
process.exit(r.status ?? 1);
