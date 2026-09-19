/**
 * zcode-dream-skin/scripts/lib/color.mjs
 * 颜色工具：hex/hsl 解析、WCAG 相对亮度、CSS 颜色值亮度判定。
 * @author DamonYanglong
 * @date 2026/09/19
 */

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`非法十六进制颜色: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/** WCAG 相对亮度（0 黑 ~ 1 白） */
export function relLum(rgb) {
  const lin = (u) => {
    u /= 255;
    return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/**
 * 解析 CSS 颜色值（#rrggbb / hsl(H S% L% [/ a])，空格或逗号分隔均可），返回相对亮度；
 * 无法解析返回 null。
 */
export function cssColorLum(value) {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return relLum(hexToRgb(v));
  const m = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i.exec(v);
  if (m) return relLum(hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100));
  return null;
}
