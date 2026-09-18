#!/usr/bin/env node
/**
 * zcode-dream-skin/scripts/import-theme.mjs
 * 从 Codex Dream Skin 本地主题库导入主题，自动生成 ZCode 主题包。
 *
 * 配色策略：源 theme.json 带 colors 则映射；否则从背景图取平均色（sips 1x1）
 * 按色相/饱和度自动推导暗、亮两套语义变量。
 *
 * 用法:
 *   node scripts/import-theme.mjs --list                 # 列出可导入主题
 *   node scripts/import-theme.mjs --all                  # 导入全部
 *   node scripts/import-theme.mjs --id preset-xxx        # 导入指定主题
 *   node scripts/import-theme.mjs --dir /path/to/theme   # 导入任意 Codex 格式主题目录
 * @author DamonYanglong
 * @date 2026/09/18
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const CODEX_THEMES_DIR = path.join(
  process.env.HOME, "Library/Application Support/CodexDreamSkinStudio/themes",
);

// ---------- 颜色工具 ----------
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`非法十六进制颜色: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslCss([h, s, l]) {
  return `${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** sips 把图缩到 1x1 PNG，解析出全图平均色（macOS 自带，无需图像库） */
function averageColorOfImage(imgPath) {
  const tmp = `/tmp/zds-avg-${process.pid}.png`;
  try {
    execFileSync("/usr/bin/sips", ["-s", "format", "png", "-z", "1", "1", imgPath, "--out", tmp], { stdio: "pipe" });
    const png = fs.readFileSync(tmp);
    // 找 IDAT chunk
    let off = 8, idat = null, colorType = null;
    while (off + 8 <= png.length) {
      const len = png.readUInt32BE(off);
      const type = png.toString("ascii", off + 4, off + 8);
      if (type === "IHDR") colorType = png[off + 8 + 9];
      if (type === "IDAT") { idat = png.subarray(off + 8, off + 8 + len); break; }
      off += 12 + len;
    }
    if (!idat) throw new Error("PNG 无 IDAT");
    const raw = inflateSync(idat); // 1x1: [filter, ...像素]
    const px = raw.subarray(1);
    if (colorType === 2) return [px[0], px[1], px[2]];
    if (colorType === 6) return [px[0], px[1], px[2]]; // RGBA
    if (colorType === 0) return [px[0], px[0], px[0]]; // 灰度
    throw new Error(`不支持的 PNG color type: ${colorType}`);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

// ---------- 调色板推导 ----------
/**
 * 由源调色板（可能为空）+ 背景图平均色推导暗/亮两套变量值。
 * 返回 { dark: {...}, light: {...} }，值为 CSS 字符串。
 */
function derivePalettes(srcColors, avgRgb) {
  const [h, s] = srcColors?.panel
    ? rgbToHsl(hexToRgb(srcColors.panel))
    : rgbToHsl(avgRgb);
  const accentSrc = srcColors?.accent ? rgbToHsl(hexToRgb(srcColors.accent)) : null;
  const accentH = accentSrc?.[0] ?? h;
  const accentS = clamp01((accentSrc?.[1] ?? s) * 0.9 + 0.15);

  const sat = (x) => clamp01(s * x);
  const aHue = accentH, aSat = accentS;
  const H = (deg) => (deg * 360).toFixed(1);
  // 内部格式约定：纯色 "H S% L%"，带透明度 "H S% L% / a"，输出时统一由 normalize 包 hsl()
  const panel_ = (sv, lv, a) => `${H(h)} ${(sv * 100).toFixed(1)}% ${lv}% / ${a}`;
  const acc_ = (lv, a) => `${H(aHue)} ${(aSat * 100).toFixed(1)}% ${lv}% / ${a}`;

  const dark = {
    header: panel_(sat(0.6), 8, 0.8),
    panel: panel_(sat(0.6), 9, 0.82),
    sidebar: panel_(sat(0.7), 5, 0.84),
    card: panel_(sat(0.7), 12, 0.88),
    popover: panel_(sat(0.7), 12, 0.97),
    input: panel_(sat(0.6), 9, 0.9),
    brand: hslCss([aHue, aSat, 0.62]),
    accent: acc_(62, 0.14),
    border: acc_(62, 0.24),
    borderHover: acc_(62, 0.45),
    surface: acc_(62, 0.05),
    surfaceHover: acc_(62, 0.1),
    selected: acc_(62, 0.16),
    fg: srcColors?.text ?? hslCss([h, sat(0.25), 0.9]),
    fgSubtle: srcColors?.muted ?? hslCss([h, sat(0.2), 0.72]),
    fgSubtlest: hslCss([h, sat(0.18), 0.58]),
    terminalBg: panel_(sat(0.6), 5, 0.92),
    trajUser: hslCss([aHue, aSat, 0.72]),
    dialogVeil: panel_(sat(0.6), 9, 0.78),
    sidebarBg: panel_(sat(0.7), 5, 0.72),
    baseTone: `${H(h)} ${(sat(0.6) * 100).toFixed(1)}% 5%`,
  };

  const light = {
    header: panel_(sat(0.3), 94, 0.78),
    panel: panel_(sat(0.3), 94, 0.8),
    sidebar: panel_(sat(0.32), 92, 0.86),
    card: panel_(sat(0.3), 96, 0.88),
    popover: panel_(sat(0.3), 96, 0.97),
    input: panel_(sat(0.3), 96, 0.92),
    brand: hslCss([aHue, aSat, 0.38]),
    accent: acc_(50, 0.18),
    border: panel_(sat(0.4), 25, 0.25),
    borderHover: panel_(sat(0.4), 25, 0.45),
    surface: panel_(sat(0.5), 30, 0.05),
    surfaceHover: panel_(sat(0.5), 30, 0.09),
    selected: acc_(50, 0.18),
    fg: hslCss([h, sat(0.2), 0.14]),
    fgSubtle: hslCss([h, sat(0.18), 0.36]),
    fgSubtlest: hslCss([h, sat(0.15), 0.52]),
    terminalBg: panel_(sat(0.2), 94, 0.95),
    trajUser: hslCss([aHue, aSat, 0.38]),
    homeVeil: panel_(sat(0.3), 94, 0.38),
    bgVeil: panel_(sat(0.3), 94, 0.42),
    dialogVeil: panel_(sat(0.3), 94, 0.45),
    sidebarBg: panel_(sat(0.3), 94, 0.72),
    baseTone: `${H(h)} ${(sat(0.3) * 100).toFixed(1)}% 94%`,
  };
  return { dark, light };
}

// ---------- theme.css 生成 ----------
// 内部调色板值的两种形态：纯色 "hsl(H S% L%)" / 带透明度 "H S% L% / a"
// 内部格式约定：纯色 "H S% L%"，带透明度 "H S% L% / a"，hex 源色直接透传
function normalize(value) {
  if (value.startsWith("#")) return value;
  return `hsl(${value})`;
}

function themeCssBlock(selector, p, focus) {
  const v = (name) => normalize(p[name]);
  return `html${selector} {
  --color-background: transparent !important;
  --color-background-win-alt: transparent !important;
  --color-header: ${v("header")} !important;
  --color-panel: ${v("panel")} !important;
  --color-sidebar: ${v("sidebar")} !important;
  --color-card: ${v("card")} !important;
  --color-card-selected: ${v("selected")} !important;
  --color-popover: ${v("popover")} !important;
  --color-popover-header: ${v("popover")} !important;
  --color-popover-foreground: ${v("fg")} !important;
  --color-input: ${v("input")} !important;
  --color-input-focused: ${v("popover")} !important;

  --color-surface: ${v("surface")} !important;
  --color-surface-hover: ${v("surfaceHover")} !important;
  --color-hover: ${v("surfaceHover")} !important;
  --color-selected: ${v("selected")} !important;

  --color-brand: ${v("brand")} !important;
  --color-accent: ${v("accent")} !important;

  --color-border: ${v("border")} !important;
  --color-border-hover: ${v("borderHover")} !important;

  --color-foreground: ${v("fg")} !important;
  --color-foreground-subtle: ${v("fgSubtle")} !important;
  --color-foreground-subtlest: ${v("fgSubtlest")} !important;

  --color-terminal-bg: ${v("terminalBg")} !important;
  --color-terminal-selection: ${v("selected")} !important;

  --color-trajectory-user: ${v("trajUser")} !important;
}
`;
}

function generateThemeCss(palettes, focus, themeName) {
  const pos = `${Math.round((focus?.focusX ?? 0.7) * 100)}% ${Math.round((focus?.focusY ?? 0.5) * 100)}%`;
  const D = (a) => `hsl(${palettes.dark.baseTone} / ${a})`;
  const L = (a) => `hsl(${palettes.light.baseTone} / ${a})`;
  const panelD = palettes.dark.sidebarBg.split(" / ")[0];
  const panelL = palettes.light.sidebarBg.split(" / ")[0];
  return `/*
 * zcode-dream-skin · ${themeName}（AUTO-GENERATED —— 配色由背景图自动推导，可手调）
 * 方向渐变 scrim（对齐 Codex Dream Skin）：首页左重右透，对话页顶部清、底部实。
 */
html {
  background-size: auto, auto, cover !important;
  background-position: center, center, ${pos} !important;
  background-repeat: no-repeat !important;
}

html.dark:not(:has(.history-message)) {
  background-image:
    linear-gradient(90deg, ${D(".90")} 0%, ${D(".76")} 50%, ${D(".18")} 84%, transparent 100%),
    linear-gradient(transparent, transparent),
    var(--zds-bg) !important;
  --color-background-alt: transparent !important;
}
html.dark:has(.history-message) {
  background-image:
    linear-gradient(180deg, ${D(".10")} 0%, ${D(".18")} 32%, ${D(".76")} 68%, ${D("1")} 100%),
    linear-gradient(90deg, ${D(".56")} 0%, ${D(".36")} 48%, ${D(".12")} 100%),
    var(--zds-bg) !important;
  --color-background-alt: transparent !important;
}
html:not(.dark):not(:has(.history-message)) {
  background-image:
    linear-gradient(90deg, ${L(".96")} 0%, ${L(".82")} 50%, ${L(".20")} 84%, transparent 100%),
    linear-gradient(transparent, transparent),
    var(--zds-bg) !important;
  --color-background-alt: transparent !important;
}
html:not(.dark):has(.history-message) {
  background-image:
    linear-gradient(180deg, ${L(".08")} 0%, ${L(".22")} 34%, ${L(".78")} 70%, ${L("1")} 100%),
    linear-gradient(90deg, ${L(".68")} 0%, ${L(".40")} 48%, ${L(".12")} 100%),
    var(--zds-bg) !important;
  --color-background-alt: transparent !important;
}

aside[data-testid="sidebar"] {
  background: hsl(${panelD} / .46) !important;
  -webkit-backdrop-filter: blur(24px) saturate(1.15) !important;
}
html.dark:has(.history-message) aside[data-testid="sidebar"] {
  background: hsl(${panelD} / .70) !important;
}
html:not(.dark) aside[data-testid="sidebar"] {
  background: hsl(${panelL} / .48) !important;
}
html:not(.dark):has(.history-message) aside[data-testid="sidebar"] {
  background: hsl(${panelL} / .72) !important;
}

${themeCssBlock(".dark", palettes.dark, focus)}
${themeCssBlock(":not(.dark)", palettes.light, focus)}
`;
}

// ---------- 导入流程 ----------
function loadSourceTheme(dir) {
  const jsonPath = path.join(dir, "theme.json");
  if (!fs.existsSync(jsonPath)) throw new Error(`缺少 theme.json: ${dir}`);
  const meta = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const imgName = meta.image || "background.jpg";
  const imgPath = path.join(dir, imgName);
  if (!fs.existsSync(imgPath)) throw new Error(`缺少背景图 ${imgName}: ${dir}`);
  return { meta, imgPath, imgName };
}

function importOne(srcDir) {
  const { meta, imgPath, imgName } = loadSourceTheme(srcDir);
  const id = `codex-${meta.id || path.basename(srcDir)}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const destDir = path.join(root, "themes", id);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(imgPath, path.join(destDir, imgName));

  const avgRgb = averageColorOfImage(imgPath);
  const palettes = derivePalettes(meta.colors, avgRgb);
  fs.writeFileSync(path.join(destDir, "theme.css"), generateThemeCss(palettes, meta.art, meta.name || id));
  fs.writeFileSync(path.join(destDir, "theme.json"), JSON.stringify({
    schema: "zcode-dream-skin-theme/1",
    id,
    name: meta.name || id,
    appearance: "adaptive",
    image: imgName,
    importedFrom: "Codex Dream Skin",
    sourceId: meta.id,
    autoGenerated: true,
    derivedFrom: { averageColor: `#${avgRgb.map((x) => x.toString(16).padStart(2, "0")).join("")}` },
  }, null, 2));
  console.log(`[zds] ✓ 已导入 «${meta.name || id}» → themes/${id}/（平均色 ${`#${avgRgb.map((x) => x.toString(16).padStart(2, "0")).join("")}`}）`);
  return id;
}

// ---------- 入口 ----------
const args = process.argv.slice(2);
if (args.includes("--list")) {
  if (!fs.existsSync(CODEX_THEMES_DIR)) { console.error(`[zds] 未找到 Codex 主题库: ${CODEX_THEMES_DIR}`); process.exit(1); }
  for (const d of fs.readdirSync(CODEX_THEMES_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try {
      const { meta } = loadSourceTheme(path.join(CODEX_THEMES_DIR, d.name));
      console.log(`  - ${meta.id || d.name}  «${meta.name || d.name}»${meta.colors ? " (带 colors)" : " (自动配色)"}`);
    } catch { /* 跳过不完整目录 */ }
  }
  process.exit(0);
}
const dirIdx = args.indexOf("--dir");
if (dirIdx !== -1) { importOne(path.resolve(args[dirIdx + 1])); process.exit(0); }
if (args.includes("--all")) {
  for (const d of fs.readdirSync(CODEX_THEMES_DIR, { withFileTypes: true })) {
    if (d.isDirectory()) { try { importOne(path.join(CODEX_THEMES_DIR, d.name)); } catch (e) { console.error(`[zds] ✗ ${d.name}: ${e.message}`); } }
  }
  process.exit(0);
}
const idIdx = args.indexOf("--id");
if (idIdx !== -1) { importOne(path.join(CODEX_THEMES_DIR, args[idIdx + 1])); process.exit(0); }
console.error("用法: import-theme.mjs --list | --all | --id <sourceId> | --dir <path>");
process.exit(1);
