import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WCAG AA guard for every theme's text-on-background pairs. The user is
 * colorblind: luminance contrast is the one channel guaranteed to work, so
 * these floors are hard gates, not lint.
 */
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

const THEMES = ["lab", "sandbox", "phosphor", "rings"] as const;
const TEXT_TOKENS = ["--text", "--text-muted", "--text-dim", "--danger", "--signal-ink"];

function block(theme: string): string {
  const m = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`));
  if (!m) throw new Error(`theme block not found: ${theme}`);
  return m[1];
}

function token(body: string, name: string): string {
  const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token ${name} missing`);
  const v = m[1].trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return ref ? token(body, ref[1]) : v;
}

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme token contrast (WCAG AA)", () => {
  for (const theme of THEMES) {
    it(`${theme}: text tokens ≥ 4.5:1 on --bg`, () => {
      const body = block(theme);
      const bg = token(body, "--bg");
      for (const name of TEXT_TOKENS) {
        const c = contrast(token(body, name), bg);
        expect(c, `${theme} ${name} = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${theme}: --on-signal ≥ 4.5:1 on --signal`, () => {
      const body = block(theme);
      const c = contrast(token(body, "--on-signal"), token(body, "--signal"));
      expect(c, `${theme} on-signal = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
