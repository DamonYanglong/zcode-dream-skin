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
import { supportDir, userThemesDir, fileUrlOf } from "./lib/platform.mjs";
import { cssColorLum } from "./lib/color.mjs";

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
// 查找顺序：用户主题库（ZDS_THEMES_DIR 或平台默认目录）→ 仓库内 themes/
const candidates = [
  path.join(process.env.ZDS_THEMES_DIR || userThemesDir(), THEME),
  path.join(root, "themes", THEME),
];
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
const themeCssRaw = fs.readFileSync(themeCssPath, "utf8");

/**
 * 注入前文字色兜底：任何主题（旧导入/手调/市场包）只要把过暗的文字色放进暗壳
 * （或过亮的放进浅壳），在此自动纠正——引擎级保障，无需逐主题处理。
 * 触发阈值刻意收紧（<0.18 / >0.82），只拦真正不可读的，不碰正常的中性色。
 */
function sanitizeThemeCss(css) {
  const fixes = [];
  const out = css.replace(/(html\.dark|html:not\(\.dark\))\s*\{([^}]*)\}/g, (whole, sel, body) => {
    const isDark = sel === "html.dark";
    const hueM = /--color-(?:panel|header):\s*hsl\(\s*([\d.]+)/.exec(body);
    const hue = hueM ? hueM[1] : "225";
    const newBody = body.replace(
      /(--color-(?:foreground|foreground-subtle|popover-foreground)):\s*([^;!]+)/gi,
      (line, prop, value) => {
        const lum = cssColorLum(value);
        if (lum === null) return line;
        const alphaM = /\/\s*([\d.]+)\s*\)$/.exec(value);
        const alpha = alphaM ? ` / ${alphaM[1]}` : "";
        let fixed = null;
        if (isDark && lum < 0.18) fixed = `hsl(${hue} 6% 90%${alpha})`;
        if (!isDark && lum > 0.82) fixed = `hsl(${hue} 6% 14%${alpha})`;
        if (!fixed) return line;
        fixes.push(`${sel} ${prop}: ${value.trim()} → ${fixed}`);
        return `${prop}: ${fixed}`;
      },
    );
    return newBody !== body ? `${sel} {${newBody}}` : whole;
  });
  for (const f of fixes) console.log(`[zds] ⚠ 文字色自动纠正: ${f}`);
  return out;
}
const themeCss = sanitizeThemeCss(themeCssRaw);

// 背景引用改用 file:// URL：data URI 超过 ~2MB 会超出 Chromium custom property
// 值上限被静默置空（大肥鱼/三上悠亚 1.8MB PNG 踩过），file URL 零体积且免传输。
// 用 pathToFileURL 生成：Windows 盘符路径（C:\...）手拼会得到非法 URL。
let bgFileUrl = "";
if (theme.image) {
  const imgPath = path.join(themeDir, theme.image);
  if (!fs.existsSync(imgPath)) {
    console.error(`[zds] 背景图缺失: ${imgPath}`);
    process.exit(1);
  }
  bgFileUrl = fileUrlOf(imgPath);
  const { size } = fs.statSync(imgPath);
  console.log(`[zds] 背景图 ${theme.image}（${(size / 1024).toFixed(0)} KiB）→ ${bgFileUrl}`);
}

// 引擎公共层：对话页「消息窄列卡片化 + 薄蒙层」。可读性由消息卡片承担，
// 背景图大面积裸露（对齐 Codex 观感）；在主题 CSS 之后注入，覆盖其对话页蒙层。
const CHROME_CSS = `
  html:has(.history-message) {
    background-image:
      linear-gradient(180deg, rgb(8 10 14/.08) 0%, rgb(8 10 14/.14) 32%, rgb(8 10 14/.59) 68%, rgb(8 10 14/.78) 100%),
      linear-gradient(90deg, rgb(8 10 14/.44) 0%, rgb(8 10 14/.28) 48%, rgb(8 10 14/.09) 100%),
      var(--zds-bg) !important;
  }
  html:not(.dark):has(.history-message) {
    background-image:
      linear-gradient(180deg, rgb(250 247 238/.06) 0%, rgb(250 247 238/.16) 32%, rgb(250 247 238/.56) 68%, rgb(250 247 238/.72) 100%),
      linear-gradient(90deg, rgb(250 247 238/.49) 0%, rgb(250 247 238/.29) 48%, rgb(250 247 238/.09) 100%),
      var(--zds-bg) !important;
  }
  html:has(.history-message) .history-message {
    /* 近实底：Codex 的消息卡片底来自原生 token（panel 实色），不是半透明透图 */
    background: rgb(16 16 18/.94) !important;
    border: 1px solid rgb(255 255 255/.06) !important;
    border-radius: 16px !important;
    padding: 10px 16px !important;
    margin-bottom: 12px !important;
    max-width: 940px !important;
  }
  html:not(.dark):has(.history-message) .history-message {
    background: rgb(250 247 240/.94) !important;
    border-color: rgb(0 0 0/.06) !important;
  }
`;
// 右侧浮层面板（文件预览/Git 审查等）兜底：这类容器与主区共用透明变量且无稳定
// DOM 特征，用「右半区 + 大尺寸 + 全透明 + 内容丰富」特征动态补实底，
// 否则代码文字直接叠在背景图上不可读。布局空容器因内容少被排除。
const PANEL_GUARD = `
  if (!window.__zdsPanelGuard) {
    window.__zdsPanelGuard = true;
    const patch = () => {
      for (const el of document.querySelectorAll("body div")) {
        if (el.dataset.zdsPanel) continue;
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!r) continue;
        if (r.width < 400 || r.height < 400) continue;
        if (r.left < window.innerWidth * 0.45) continue;
        if ((el.innerText || "").length < 200) continue;
        const cs = getComputedStyle(el);
        if (cs.backgroundColor === "rgba(0, 0, 0, 0)" && (!cs.backgroundImage || cs.backgroundImage === "none")) {
          el.dataset.zdsPanel = "1";
          el.style.backgroundColor = "rgb(13 15 18 / .97)";
          el.style.borderRadius = "16px";
        }
      }
    };
    let raf = 0;
    const mo = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; patch(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    patch();
  }
`;

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

/** 注入页面的 JS：幂等——先清旧标记/样式，再挂新样式。
 * appearance=dark/light 的主题会强制对应外壳（对齐 Codex：暗图配暗壳），
 * auto 则跟随 ZCode 自身明暗。 */
const forceDark = theme.appearance === "dark";
const forceLight = theme.appearance === "light";
const injectExpr = `(() => {
  const de = document.documentElement;
  de.removeAttribute("data-zds-theme");
  document.getElementById(${JSON.stringify(STYLE_ROOT_ID)})?.remove();
  document.getElementById(${JSON.stringify(STYLE_THEME_ID)})?.remove();
  const s1 = document.createElement("style");
  s1.id = ${JSON.stringify(STYLE_ROOT_ID)};
  s1.textContent = ":root{--zds-bg:url(" + ${JSON.stringify(bgFileUrl)} + ")}";
  const s2 = document.createElement("style");
  s2.id = ${JSON.stringify(STYLE_THEME_ID)};
  s2.textContent = ${JSON.stringify(themeCss)};
  const s3 = document.createElement("style");
  s3.id = "zds-chrome";
  s3.textContent = ${JSON.stringify(CHROME_CSS)};
  document.head.append(s1, s2, s3);
  const guard = document.createElement("script");
  guard.textContent = ${JSON.stringify(PANEL_GUARD)};
  document.head.append(guard);
  de.setAttribute("data-zds-theme", ${JSON.stringify(THEME)});
  ${forceDark ? `if (!de.classList.contains("dark")) { de.classList.add("dark"); de.dataset.zdsForcedDark = "1"; }
  if (!de.dataset.zdsOrigTheme) de.dataset.zdsOrigTheme = de.classList.contains("theme-zai-dark") ? "theme-zai-dark" : "theme-zai-light";
  de.classList.remove("theme-zai-light", "theme-zai-dark");
  de.classList.add("theme-zai-dark");` : ""}
  ${forceLight ? `if (de.classList.contains("dark")) { de.classList.remove("dark"); de.dataset.zdsForcedDark = ""; }
  if (!de.dataset.zdsOrigTheme) de.dataset.zdsOrigTheme = de.classList.contains("theme-zai-dark") ? "theme-zai-dark" : "theme-zai-light";
  de.classList.remove("theme-zai-light", "theme-zai-dark");
  de.classList.add("theme-zai-light");` : ""}
  ${!forceDark && !forceLight ? `if (de.dataset.zdsOrigTheme) { de.classList.remove("theme-zai-light", "theme-zai-dark"); de.classList.add(de.dataset.zdsOrigTheme); delete de.dataset.zdsOrigTheme; }
  if (de.dataset.zdsForcedDark) { de.classList.remove("dark"); delete de.dataset.zdsForcedDark; }` : ""}
  return "applied";
})()`;

const verifyExpr = `(() => ({
  theme: document.documentElement.getAttribute("data-zds-theme") || null,
  rootStyle: !!document.getElementById(${JSON.stringify(STYLE_ROOT_ID)}),
  themeStyle: !!document.getElementById(${JSON.stringify(STYLE_THEME_ID)}),
  dark: document.documentElement.classList.contains("dark"),
  title: document.title,
}))()`;const evalCmd = (expr) => ({
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
  console.error("[zds] 请先用 scripts/start-themed.mjs 以调试端口启动 ZCode。");
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

// 状态文件：菜单栏/托盘 app 读取以显示当前主题
try {
  const stateDir = process.env.ZDS_STATE_DIR || supportDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "current-theme"), THEME, "utf8");
} catch { /* 状态文件失败不影响注入 */ }
process.exit(okCount > 0 ? 0 : 1);
