import type { CSSProperties } from "react";

// The OKLCH hue (0 to 360) of a #rrggbb colour, so Sunroom can tint chips by hue.
export function oklchHue(hex: string | null): number | null {
  const m = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const lin = (x: string) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(m[1]), lin(m[2]), lin(m[3])];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return Math.round(h < 0 ? h + 360 : h);
}

// CSS variables for a category colour: --cat for X-Vault, --cat-h for Sunroom.
export function catVars(color: string | null, fallback: string): CSSProperties {
  const hue = oklchHue(color);
  return { "--cat": color ?? fallback, ...(hue === null ? {} : { "--cat-h": hue }) } as CSSProperties;
}
