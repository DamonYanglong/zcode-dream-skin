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
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { codexThemesDir, isMac, isWin, userThemesDir } from "./lib/platform.mjs";
import { hexToRgb, relLum } from "./lib/color.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// 导入目的地：app 上下文用 ZDS_THEMES_DIR；CLI 默认进用户主题库（菜单栏 app 可见），--into-repo 才进仓库
function themesDestDir() {
  if (process.env.ZDS_THEMES_DIR) return process.env.ZDS_THEMES_DIR;
  if (args.includes("--into-repo")) return path.join(root, "themes");
  return userThemesDir();
}

// ---------- 颜色工具 ----------
// hexToRgb / relLum 复用 lib/color.mjs；此处只保留调色板推导专用的 hsl 工具
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

/** 平均色取法按平台选择自带工具：macOS sips / Windows System.Drawing / Linux ImageMagick */
function averageColorOfImage(imgPath) {
  if (isMac) return averageColorViaSips(imgPath);
  if (isWin) return averageColorViaSystemDrawing(imgPath);
  return averageColorViaMagick(imgPath);
}

/** macOS：sips 把图缩到 1x1 PNG，解析出全图平均色（系统自带，无需图像库） */
function averageColorViaSips(imgPath) {
  const tmp = path.join(os.tmpdir(), `zds-avg-${process.pid}.png`);
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

/** Windows：System.Drawing 缩到 1x1 取像素（系统自带）。路径走环境变量避免引号转义 */
function averageColorViaSystemDrawing(imgPath) {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$img=[System.Drawing.Image]::FromFile($env:ZDS_IMG)",
    "$bmp=New-Object System.Drawing.Bitmap 1,1",
    "$g=[System.Drawing.Graphics]::FromImage($bmp)",
    "$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$g.DrawImage($img,0,0,1,1)",
    "$p=$bmp.GetPixel(0,0)",
    "Write-Output (\"{0} {1} {2}\" -f $p.R,$p.G,$p.B)",
    "$g.Dispose(); $bmp.Dispose(); $img.Dispose()",
  ].join("; ");
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ZDS_IMG: imgPath },
  }).toString().trim();
  const m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(out);
  if (!m) throw new Error(`System.Drawing 返回无法解析: ${out}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Linux/WSL：ImageMagick magick/convert 缩到 1x1，txt:- 输出解析十六进制色 */
function averageColorViaMagick(imgPath) {
  for (const bin of ["magick", "convert"]) {
    try {
      const out = execFileSync(bin, [imgPath, "-resize", "1x1!", "txt:-"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
      const m = /#([0-9a-f]{6})/i.exec(out);
      if (m) {
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
    } catch { /* 换下一个候选 */ }
  }
  throw new Error("Linux 取平均色需要 ImageMagick（magick 或 convert）");
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

  // 源主题文字色只给适合对应外壳的调色板用：深色文字进暗壳会直接不可读
  // （DeepSeek 鲸鱼娘的 #352970/#030303 踩过），亮度不达标就走推导值
  const srcText = srcColors?.text;
  const srcMuted = srcColors?.muted;
  const darkFg = srcText && relLum(hexToRgb(srcText)) >= 0.5 ? srcText : hslCss([h, sat(0.25), 0.9]);
  const darkFgSubtle = srcMuted && relLum(hexToRgb(srcMuted)) >= 0.45 ? srcMuted : hslCss([h, sat(0.2), 0.72]);
  const lightFg = srcText && relLum(hexToRgb(srcText)) <= 0.62 ? srcText : hslCss([h, sat(0.2), 0.14]);

  // 内部格式约定：纯色 "H S% L%"，带透明度 "H S% L% / a"，输出时统一由 normalize 包 hsl()
  const panel_ = (sv, lv, a) => `${H(h)} ${(sv * 100).toFixed(1)}% ${lv}% / ${a}`;
  const acc_ = (lv, a) => `${H(aHue)} ${(aSat * 100).toFixed(1)}% ${lv}% / ${a}`;

  // 市场调色板细粒度映射（缺字段回退到面板/accent 推导）：
  // line→边框系、highlight→选中/表面态、secondary→用户消息色、panelAlt→输入框底
  const lineHsl = srcColors?.line ? rgbToHsl(hexToRgb(srcColors.line)) : null;
  const hlHsl = srcColors?.highlight ? rgbToHsl(hexToRgb(srcColors.highlight)) : null;
  const secHsl = srcColors?.secondary ? rgbToHsl(hexToRgb(srcColors.secondary)) : null;
  const paltHsl = srcColors?.panelAlt ? rgbToHsl(hexToRgb(srcColors.panelAlt)) : null;
  const lHue = lineHsl?.[0] ?? aHue, lSat = lineHsl ? clamp01(lineHsl[1]) : aSat;
  const selHue = hlHsl?.[0] ?? aHue, selSat = hlHsl ? clamp01(hlHsl[1]) : aSat;
  const inHue = paltHsl?.[0] ?? h, inSat = paltHsl ? clamp01(paltHsl[1]) : s;
  const line_ = (lv, a) => `${H(lHue)} ${(lSat * 100).toFixed(1)}% ${lv}% / ${a}`;
  const sel_ = (lv, a) => `${H(selHue)} ${(selSat * 100).toFixed(1)}% ${lv}% / ${a}`;
  const input_ = (sv, lv, a) => `${H(inHue)} ${(clamp01(inSat * sv) * 100).toFixed(1)}% ${lv}% / ${a}`;
  const trajOf = (hslArr, lv) => hslCss([hslArr[0], clamp01(hslArr[1]), lv]);

  const dark = {
    header: panel_(sat(0.6), 8, 0.8),
    panel: panel_(sat(0.6), 9, 0.82),
    sidebar: panel_(sat(0.7), 5, 0.84),
    card: panel_(sat(0.7), 12, 0.88),
    popover: panel_(sat(0.7), 12, 0.97),
    input: input_(0.6, 9, 0.9),
    brand: hslCss([aHue, aSat, 0.62]),
    accent: acc_(62, 0.14),
    border: line_(60, 0.28),
    borderHover: line_(60, 0.5),
    surface: sel_(62, 0.05),
    surfaceHover: sel_(62, 0.1),
    selected: sel_(62, 0.16),
    fg: darkFg,
    fgSubtle: darkFgSubtle,
    fgSubtlest: hslCss([h, sat(0.18), 0.58]),
    terminalBg: panel_(sat(0.6), 5, 0.92),
    trajUser: secHsl ? trajOf(secHsl, 0.72) : hslCss([aHue, aSat, 0.72]),
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
    input: input_(0.3, 96, 0.92),
    brand: hslCss([aHue, aSat, 0.38]),
    accent: acc_(50, 0.18),
    border: line_(32, 0.25),
    borderHover: line_(32, 0.45),
    surface: sel_(50, 0.05),
    surfaceHover: sel_(50, 0.09),
    selected: sel_(50, 0.18),
    fg: lightFg,
    fgSubtle: hslCss([h, sat(0.18), 0.36]),
    fgSubtlest: hslCss([h, sat(0.15), 0.52]),
    terminalBg: panel_(sat(0.2), 94, 0.95),
    trajUser: secHsl ? trajOf(secHsl, 0.38) : hslCss([aHue, aSat, 0.38]),
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

function generateThemeCss(palettes, focus, themeName, avgLum = 0) {
  const pos = `${Math.round((focus?.focusX ?? 0.7) * 100)}% ${Math.round((focus?.focusY ?? 0.5) * 100)}%`;
  const D = (a) => `hsl(${palettes.dark.baseTone} / ${a})`;
  const L = (a) => `hsl(${palettes.light.baseTone} / ${a})`;
  const panelD = palettes.dark.sidebarBg.split(" / ")[0];
  const panelL = palettes.light.sidebarBg.split(" / ")[0];
  // 亮图（平均亮度>0.5）双壳都走轻薄路线：图本身即底色，纱只保文字区/输入区可读。
  // 暗壳对话页蒙层加厚防"亮底亮字"；浅色壳大幅减纱防"白纱洗图"（对齐市场效果图观感）。
  const brightArt = avgLum > 0.5;
  const convoV = brightArt ? [".60", ".68", ".88", "1"] : [".10", ".18", ".76", "1"];
  const convoH = brightArt ? [".70", ".50", ".25"] : [".56", ".36", ".12"];
  const homeL = brightArt ? ["0", "0", "0", "0"] : [".96", ".82", ".20", "0"];
  const convoVL = brightArt ? [".12", ".25", ".55", ".88"] : [".08", ".22", ".78", "1"];
  const convoHL = brightArt ? [".50", ".28", ".08"] : [".68", ".40", ".12"];
  return `/*
 * zcode-dream-skin · ${themeName}（AUTO-GENERATED —— 配色由背景图自动推导，可手调）
 * 方向渐变 scrim（对齐 Codex Dream Skin）：首页左重右透，对话页顶部清、底部实。
${brightArt ? " * 亮色背景图：双壳自动轻薄化——暗壳对话页蒙层加厚保可读，浅色壳减纱保鲜艳。\n" : ""} */
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
    linear-gradient(180deg, ${D(convoV[0])} 0%, ${D(convoV[1])} 32%, ${D(convoV[2])} 68%, ${D(convoV[3])} 100%),
    linear-gradient(90deg, ${D(convoH[0])} 0%, ${D(convoH[1])} 48%, ${D(convoH[2])} 100%),
    var(--zds-bg) !important;
  --color-background-alt: transparent !important;
}
html:not(.dark):not(:has(.history-message)) {
  background-image:
    linear-gradient(90deg, ${L(homeL[0])} 0%, ${L(homeL[1])} 50%, ${L(homeL[2])} 84%, ${L(homeL[3])} 100%),
    linear-gradient(transparent, transparent),
    var(--zds-bg) !important;
  --color-background-alt: transparent !important;
}
html:not(.dark):has(.history-message) {
  background-image:
    linear-gradient(180deg, ${L(convoVL[0])} 0%, ${L(convoVL[1])} 34%, ${L(convoVL[2])} 70%, ${L(convoVL[3])} 100%),
    linear-gradient(90deg, ${L(convoHL[0])} 0%, ${L(convoHL[1])} 48%, ${L(convoHL[2])} 100%),
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
  const destDir = path.join(themesDestDir(), id);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(imgPath, path.join(destDir, imgName));

  // 平均色优先复用已记录值（重推导无需图像工具）；没有才现场采样
  const avgRgb = meta.derivedFrom?.averageColor
    ? hexToRgb(meta.derivedFrom.averageColor)
    : averageColorOfImage(imgPath);
  const avgLum = relLum(avgRgb);
  const palettes = derivePalettes(meta.colors, avgRgb);
  fs.writeFileSync(path.join(destDir, "theme.css"), generateThemeCss(palettes, meta.art, meta.name || id, avgLum));
  fs.writeFileSync(path.join(destDir, "theme.json"), JSON.stringify({
    schema: "zcode-dream-skin-theme/1",
    id,
    name: meta.name || id,
    appearance: "adaptive",
    image: imgName,
    importedFrom: "Codex Dream Skin",
    sourceId: meta.id,
    autoGenerated: true,
    sourceColors: meta.colors || null,   // 留档：便于日后重推导配色
    derivedFrom: { averageColor: `#${avgRgb.map((x) => x.toString(16).padStart(2, "0")).join("")}` },
  }, null, 2));
  console.log(`[zds] ✓ 已导入 «${meta.name || id}» → themes/${id}/（平均色 ${`#${avgRgb.map((x) => x.toString(16).padStart(2, "0")).join("")}`}，亮度 ${avgLum.toFixed(2)}${avgLum > 0.5 ? "，亮图：暗壳蒙层加厚" : ""}）`);
  return id;
}

// ---------- ZIP 导入 ----------
/** 解压按平台选自带工具：Windows tar.exe（Win10+ 内置 bsdtar，可读 zip）；其余用 unzip */
function unzipTo(zipPath, destDir) {
  if (isWin) {
    execFileSync("tar", ["-xf", zipPath, "-C", destDir], { windowsHide: true });
  } else {
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir]);
  }
}

function importZip(zipPath) {
  if (!fs.existsSync(zipPath)) throw new Error(`文件不存在: ${zipPath}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "zds-zip-"));
  try {
    unzipTo(zipPath, work);
    // zip-slip 防护：确认解压产物都留在 work 内
    const check = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (!path.resolve(full).startsWith(path.resolve(work))) throw new Error("zip 路径越界，已拒绝");
        if (e.isDirectory()) check(full);
      }
    };
    check(work);
    // 主题根：work 根目录有 theme.json → 直接用；否则找含 theme.json 的最浅子目录
    let themeRoot = null;
    const find = (dir, depth) => {
      if (themeRoot || depth > 3) return;
      if (fs.existsSync(path.join(dir, "theme.json"))) { themeRoot = dir; return; }
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) find(path.join(dir, e.name), depth + 1);
      }
    };
    find(work, 0);
    if (!themeRoot) throw new Error("zip 内未找到 theme.json（不是有效的主题包）");
    importOne(themeRoot);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ---------- 入口 ----------
const args = process.argv.slice(2);
if (args.includes("--list")) {
  const srcDir = codexThemesDir();
  if (!fs.existsSync(srcDir)) { console.error(`[zds] 未找到 Codex 主题库: ${srcDir}`); process.exit(1); }
  for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try {
      const { meta } = loadSourceTheme(path.join(srcDir, d.name));
      console.log(`  - ${meta.id || d.name}  «${meta.name || d.name}»${meta.colors ? " (带 colors)" : " (自动配色)"}`);
    } catch { /* 跳过不完整目录 */ }
  }
  process.exit(0);
}
const dirIdx = args.indexOf("--dir");
if (dirIdx !== -1) { importOne(path.resolve(args[dirIdx + 1])); process.exit(0); }
const zipIdx = args.indexOf("--zip");
if (zipIdx !== -1) { importZip(path.resolve(args[zipIdx + 1])); process.exit(0); }
if (args.includes("--all")) {
  const srcDir = codexThemesDir();
  for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (d.isDirectory()) { try { importOne(path.join(srcDir, d.name)); } catch (e) { console.error(`[zds] ✗ ${d.name}: ${e.message}`); } }
  }
  process.exit(0);
}
const idIdx = args.indexOf("--id");
if (idIdx !== -1) { importOne(path.join(codexThemesDir(), args[idIdx + 1])); process.exit(0); }
console.error("用法: import-theme.mjs --list | --all | --id <sourceId> | --dir <path> | --zip <file.zip> [--into-repo]");
process.exit(1);
