#!/usr/bin/env node
/**
 * zcode-dream-skin/scripts/screenshot.mjs
 * 通过 CDP 抓取 ZCode 主窗口截图，用于主题调试与效果验证。
 * 用法: node scripts/screenshot.mjs [--port 9342] [--out /tmp/zds-shot.png]
 * @author DamonYanglong
 * @date 2026/09/18
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const argOf = (n, d) => (args.indexOf(n) !== -1 && args[args.indexOf(n) + 1] ? args[args.indexOf(n) + 1] : d);
const PORT = Number(argOf("--port", "9342"));
const OUT = argOf("--out", path.join(os.tmpdir(), "zds-shot.png"));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) { console.error("[zds] 没有 page target"); process.exit(1); }

const shot = await new Promise((resolve, reject) => {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener("open", () => ws.send(JSON.stringify({
    id: 1, method: "Page.captureScreenshot",
    params: { format: "png" },
  })));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id === 1) { ws.close(); resolve(m); }
  });
  ws.addEventListener("error", () => reject(new Error("ws error")));
  setTimeout(() => reject(new Error("timeout")), 10000);
});

if (!shot?.result?.data) { console.error("[zds] 截图失败:", JSON.stringify(shot).slice(0, 200)); process.exit(1); }
fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
console.log(`[zds] 截图已保存: ${OUT}（${(fs.statSync(OUT).size / 1024).toFixed(0)} KiB）`);
