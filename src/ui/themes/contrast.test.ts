import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WCAG AA guard for every theme's text-on-background pairs. The user is
 * colorblind: luminance contrast is the one channel guaranteed to work, so
 * these floors are hard gates, not lint.
 */
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

const THEMES = ["lab", "sandbox", "phosphor", "rings", "graph"] as const;
const TEXT_TOKENS = ["--text", "--text-muted", "--text-dim", "--danger", "--signal-ink", "--accent"];
/**
 * Every ground text is set on. Checking --bg alone let the graph theme's "FB"
 * label ship at 4.41:1 on a silent operator node (--surface-sunken) — found by
 * the 2026-09-15 flowsheet audit, not by this file.
 */
const GROUNDS = ["--bg", "--surface", "--surface-sunken", "--surface-raised"];

/**
 * Pairs that fall short today, recorded rather than silently skipped. They are
 * in themes that passed Andrew's eye pass, and raising --text-dim that far would
 * pull it onto --text-muted, so the fix is a design decision, not a token nudge.
 * Each entry must still genuinely fail — the test below removes the excuse the
 * moment a pair is fixed, so this list can only shrink.
 */
const KNOWN_SHORTFALLS: ReadonlyArray<readonly [theme: string, token: string, ground: string]> = [
  ["lab", "--text-dim", "--surface-raised"],       // 4.22:1
  ["sandbox", "--text-dim", "--surface-sunken"],   // 4.14:1
  ["sandbox", "--text-dim", "--surface-raised"],   // 3.89:1
];
const isKnown = (theme: string, name: string, ground: string) =>
  KNOWN_SHORTFALLS.some(([t, n, g]) => t === theme && n === name && g === ground);

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
    for (const ground of GROUNDS) {
      it(`${theme}: text tokens ≥ 4.5:1 on ${ground}`, () => {
        const body = block(theme);
        const bg = token(body, ground);
        for (const name of TEXT_TOKENS) {
          const c = contrast(token(body, name), bg);
          if (isKnown(theme, name, ground)) {
            expect(c, `${theme} ${name} on ${ground} now passes — remove it from KNOWN_SHORTFALLS`)
              .toBeLessThan(4.5);
            continue;
          }
          expect(c, `${theme} ${name} on ${ground} = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
    it(`${theme}: --on-signal ≥ 4.5:1 on --signal`, () => {
      const body = block(theme);
      const c = contrast(token(body, "--on-signal"), token(body, "--signal"));
      expect(c, `${theme} on-signal = ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
