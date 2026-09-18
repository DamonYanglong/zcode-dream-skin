#!/usr/bin/env node
/**
 * zcode-dream-skin/scripts/apply.mjs
 * 通过 CDP（仅回环）向 ZCode 渲染进程注入主题：背景图层 + 语义 CSS 变量覆盖。
 * 零 npm 依赖，要求 node >= 22（原生 WebSocket / fetch）。
 * @author longfei5
 * @date 2026/09/18
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// ---------- 参数 ----------
const args = process.argv.slice(2);
function argOf(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT = Number(argOf("--port", process.env.ZDS_PORT || "9342"));
const THEME = argOf("--theme", process.env.ZDS_THEME || "gothic-void-crusade");
const HOST = "127.0.0.1";
const STYLE_ROOT_ID = "zds-root-vars";
const STYLE_THEME_ID = "zds-theme-css";

if (typeof WebSocket !== "function") {
  console.error("[zds] 此 node 版本缺少原生 WebSocket，请使用 node >= 22。");
  process.exit(1);
}

// ---------- 读取主题包 ----------
// 查找顺序：ZDS_THEMES_DIR（用户主题目录，菜单栏 app 用）→ 仓库内 themes/
const userThemesDir = process.env.ZDS_THEMES_DIR || "";
const candidates = [
  userThemesDir ? path.join(userThemesDir, THEME) : null,
  path.join(root, "themes", THEME),
].filter(Boolean);
const themeDir = candidates.find((p) => fs.existsSync(path.join(p, "theme.json")));
if (!themeDir) {
  console.error(`[zds] 找不到主题 «${THEME}»（查找了: ${candidates.join(", ")}）`);
  process.exit(1);
}
const theme = JSON.parse(fs.readFileSync(path.join(themeDir, "theme.json"), "utf8"));
const themeCssPath = path.join(themeDir, "theme.css");
if (!fs.existsSync(themeCssPath)) {
  console.error(`[zds] 主题不完整，缺少 ${themeCssPath}`);
  process.exit(1);
}
if (theme.schema !== "zcode-dream-skin-theme/1") {
  console.error(`[zds] 不支持的主题 schema: ${theme.schema}`);
  process.exit(1);
}
const themeCss = fs.readFileSync(themeCssPath, "utf8");

let bgDataUri = "";
if (theme.image) {
  const imgPath = path.join(themeDir, theme.image);
  const buf = fs.readFileSync(imgPath);
  const mime = theme.image.endsWith(".png") ? "image/png"
    : theme.image.endsWith(".webp") ? "image/webp" : "image/jpeg";
  bgDataUri = `data:${mime};base64,${buf.toString("base64")}`;
  console.log(`[zds] 背景图 ${theme.image}（${(buf.length / 1024).toFixed(0)} KiB）已内嵌。`);
}

// ---------- CDP 工具 ----------
async function listTargets() {
  const res = await fetch(`http://${HOST}:${PORT}/json`);
  if (!res.ok) throw new Error(`/json HTTP ${res.status}`);
  return res.json();
}

/** 连单个 target，按序执行 CDP 命令，返回结果数组 */
function runCdp(wsUrl, commands) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const results = [];
    let nextId = 1;
    const pending = new Map();
    const timer = setTimeout(() => {
      reject(new Error("CDP 会话超时"));
      try { ws.close(); } catch {}
    }, 15000);
    ws.addEventListener("open", () => {
      for (const c of commands) {
        const id = nextId++;
        pending.set(id, c);
        ws.send(JSON.stringify({ id, ...c }));
      }
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        results.push(msg);
        if (results.length === pending.size) {
          clearTimeout(timer);
          ws.close();
          resolve(results);
        }
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket 连接失败: ${wsUrl}`));
    });
  });
}

/** 注入页面的 JS：幂等——先清旧标记/样式，再挂新样式 */
const injectExpr = `(() => {
  const de = document.documentElement;
  de.removeAttribute("data-zds-theme");
  document.getElementById(${JSON.stringify(STYLE_ROOT_ID)})?.remove();
  document.getElementById(${JSON.stringify(STYLE_THEME_ID)})?.remove();
  const s1 = document.createElement("style");
  s1.id = ${JSON.stringify(STYLE_ROOT_ID)};
  s1.textContent = ":root{--zds-bg:url(" + ${JSON.stringify(bgDataUri)} + ")}";
  const s2 = document.createElement("style");
  s2.id = ${JSON.stringify(STYLE_THEME_ID)};
  s2.textContent = ${JSON.stringify(themeCss)};
  document.head.append(s1, s2);
  de.setAttribute("data-zds-theme", ${JSON.stringify(THEME)});
  return "applied";
})()`;

const verifyExpr = `(() => ({
  theme: document.documentElement.getAttribute("data-zds-theme") || null,
  rootStyle: !!document.getElementById(${JSON.stringify(STYLE_ROOT_ID)}),
  themeStyle: !!document.getElementById(${JSON.stringify(STYLE_THEME_ID)}),
  dark: document.documentElement.classList.contains("dark"),
  title: document.title,
}))()`;

const evalCmd = (expr) => ({
  method: "Runtime.evaluate",
  params: { expression: expr, returnByValue: true, awaitPromise: true },
});

// ---------- 主流程 ----------
// /json/version 通了不代表渲染页面已创建（启动时序），轮询等待 page target 出现。
const WAIT_PAGE_MS = Number(argOf("--wait-page-ms", "30000"));
let targets;
try {
  const deadline = Date.now() + WAIT_PAGE_MS;
  for (;;) {
    targets = await listTargets();
    if (targets.some((t) => t.type === "page" && t.webSocketDebuggerUrl)) break;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 500));
  }
} catch (e) {
  console.error(`[zds] 无法连接 CDP 端点 http://${HOST}:${PORT} —— ${e.message}`);
  console.error("[zds] 请先用 scripts/start-themed.sh 以调试端口启动 ZCode。");
  process.exit(1);
}

const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (pages.length === 0) {
  console.error("[zds] CDP 端点上没有可注入的 page target。");
  process.exit(1);
}

let okCount = 0;
for (const page of pages) {
  const label = page.title || page.url.slice(0, 80);
  try {
    const results = await runCdp(page.webSocketDebuggerUrl, [
      evalCmd(injectExpr),
      evalCmd(verifyExpr),
    ]);
    const injected = results[0]?.result?.result?.value;
    const verified = results[1]?.result?.result?.value;
    if (injected === "applied" && verified?.theme === THEME && verified.themeStyle) {
      okCount++;
      console.log(`[zds] ✓ 已注入 «${label}»（dark=${verified.dark}）`);
    } else {
      console.error(`[zds] ✗ «${label}» 注入未验证通过: ${JSON.stringify(verified)}`);
    }
  } catch (e) {
    console.error(`[zds] ✗ «${label}» 注入失败: ${e.message}`);
  }
}

console.log(`[zds] 完成：${okCount}/${pages.length} 个页面成功应用主题 «${theme.name}»。`);

// 状态文件：菜单栏 app 读取以显示当前主题
try {
  const stateDir = process.env.ZDS_STATE_DIR ||
    path.join(process.env.HOME || "", "Library/Application Support/ZCodeDreamSkin");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "current-theme"), THEME, "utf8");
} catch { /* 状态文件失败不影响注入 */ }
process.exit(okCount > 0 ? 0 : 1);
