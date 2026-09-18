#!/bin/bash
#
# zcode-dream-skin/scripts/status.sh
# 查看 CDP 端口、渲染目标与主题注入状态。
#
set -Eeuo pipefail

PORT="${ZDS_PORT:-9342}"

if ! curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/json/version" 2>/dev/null; then
  echo "[zds] CDP 端口 ${PORT} 未开启（ZCode 未以换肤模式启动）。"
  exit 1
fi

echo ""
echo "[zds] 渲染目标："
curl -fsS "http://127.0.0.1:${PORT}/json" \
  | /usr/bin/python3 -c '
import json, sys
for t in json.load(sys.stdin):
    if t.get("type") == "page":
        print(f"  - {t.get(\"title\") or t.get(\"url\", \"\")[:70]}  [{t.get(\"url\", \"\")[:70]}]")
'

echo ""
node --input-type=module -e '
const PORT = Number(process.argv[1] ?? "9342");
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
for (const t of targets.filter((x) => x.type === "page" && x.webSocketDebuggerUrl)) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.addEventListener("open", () => ws.send(JSON.stringify({
    id: 1, method: "Runtime.evaluate",
    params: { expression: `document.documentElement.getAttribute("data-zds-theme")`, returnByValue: true },
  })));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id === 1) {
      console.log(`[zds] «${t.title || t.url.slice(0, 50)}» 当前主题: ${m.result?.result?.value ?? "(无)"}`);
      ws.close();
    }
  });
  await new Promise((r) => setTimeout(r, 800));
}
' "$PORT"
