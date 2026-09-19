#!/usr/bin/env node
/**
 * zcode-dream-skin/scripts/status.mjs
 * 查看端口、渲染目标与主题注入状态（原 status.sh 的跨平台版）。
 * 用法: node scripts/status.mjs [--port 9342]
 * @author DamonYanglong
 * @date 2026/09/18
 */

const args = process.argv.slice(2);
const PORT = Number((() => {
  const i = args.indexOf("--port");
  return (i !== -1 && args[i + 1]) ? args[i + 1] : (process.env.ZDS_PORT || "9342");
})());

let version;
try {
  version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
} catch {
  console.error(`[zds] CDP 端口 ${PORT} 未开启（ZCode 未以换肤模式启动）。`);
  process.exit(1);
}
console.log(`[zds] CDP 端口 ${PORT} · ${version.Browser || "Chromium"}`);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const pages = targets.filter((t) => t.type === "page");

console.log("");
console.log("[zds] 渲染目标：");
for (const t of pages) {
  const label = t.title || t.url.slice(0, 70);
  console.log(`  - ${label}  [${t.url.slice(0, 70)}]`);
}

console.log("");
for (const t of pages.filter((x) => x.webSocketDebuggerUrl)) {
  const theme = await new Promise((resolve) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    const timer = setTimeout(() => { try { ws.close(); } catch {} ; resolve("(超时)"); }, 5000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({
      id: 1, method: "Runtime.evaluate",
      params: { expression: `document.documentElement.getAttribute("data-zds-theme")`, returnByValue: true },
    })));
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) {
        clearTimeout(timer);
        ws.close();
        resolve(m.result?.result?.value ?? "(无)");
      }
    });
    ws.addEventListener("error", () => { clearTimeout(timer); resolve("(连接失败)"); });
  });
  console.log(`[zds] «${t.title || t.url.slice(0, 50)}» 当前主题: ${theme}`);
}
