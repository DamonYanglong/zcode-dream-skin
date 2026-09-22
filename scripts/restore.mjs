#!/usr/bin/env node
/**
 * zcode-dream-skin/scripts/restore.mjs
 * 移除注入的主题样式，恢复 ZCode 官方外观（无需重启应用）。
 * 注意：调试端口仍保持开启，彻底恢复日常启动需退出 ZCode 后正常重开。
 * @author longfei5
 * @date 2026/09/18
 */

import { fileURLToPath } from "node:url";
import { supportDir } from "./lib/platform.mjs";

const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf("--port") + 1] || process.env.ZDS_PORT || "9342");
const HOST = "127.0.0.1";
const STYLE_IDS = ["zds-root-vars", "zds-theme-css", "zds-chrome"];

const restoreExpr = `(() => {
  const de = document.documentElement;
  const removed = ${JSON.stringify(STYLE_IDS)}.map((id) => {
    const el = document.getElementById(id);
    el?.remove();
    return !!el;
  });
  de.removeAttribute("data-zds-theme");
  // 清 guard 痕迹：补底元素样式与标记、guard 状态
  for (const el of document.querySelectorAll("[data-zds-panel]")) {
    delete el.dataset.zdsPanel;
    delete el.dataset.zdsPanelColor;
    el.style.backgroundColor = "";
    el.style.borderRadius = "";
    el.style.padding = "";
  }
  delete window.__zdsPanelGuardV;
  delete window.__zdsSkinSnapshot;
  delete window.__zdsSkinHidden;
  if (de.dataset.zdsForcedDark) { de.classList.remove("dark"); delete de.dataset.zdsForcedDark; }
  if (de.dataset.zdsOrigTheme) {
    de.classList.remove("theme-zai-light", "theme-zai-dark");
    de.classList.add(de.dataset.zdsOrigTheme);
    delete de.dataset.zdsOrigTheme;
  }
  return removed;
})()`;

function runCdp(wsUrl, command) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      reject(new Error("CDP 会话超时"));
      try { ws.close(); } catch {}
    }, 10000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ id: 1, ...command })));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket 连接失败"));
    });
  });
}

let targets;
try {
  const res = await fetch(`http://${HOST}:${PORT}/json`);
  targets = await res.json();
} catch (e) {
  console.error(`[zds] 无法连接 CDP 端点 http://${HOST}:${PORT} —— ${e.message}`);
  process.exit(1);
}

const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
let touched = 0;
for (const page of pages) {
  try {
    const r = await runCdp(page.webSocketDebuggerUrl, {
      method: "Runtime.evaluate",
      params: { expression: restoreExpr, returnByValue: true },
    });
    const removed = r?.result?.result?.value;
    if (removed?.some(Boolean)) touched++;
    console.log(`[zds] «${page.title || page.url.slice(0, 60)}» 清理: ${JSON.stringify(removed)}`);
  } catch (e) {
    console.error(`[zds] «${page.title}» 清理失败: ${e.message}`);
  }
}
console.log(`[zds] 已恢复官方外观（${touched} 个页面曾有注入残留）。`);
console.log("[zds] 提示：如需彻底关闭调试端口，请退出 ZCode 后正常重新打开。");

// 清除当前主题状态文件
try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const stateDir = process.env.ZDS_STATE_DIR || supportDir();
  fs.rmSync(path.join(stateDir, "current-theme"), { force: true });
} catch { /* 忽略 */ }
