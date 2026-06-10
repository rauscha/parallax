import { engineIdStore } from "./stores";

/**
 * Theming follows the engine. Each synth voice wears its own skin, so selecting
 * an engine (EnginePicker / preset / share-link) is what switches the theme —
 * there is no separate manual theme control. `engineIdStore` is the single
 * source of truth; this module just mirrors it onto <html data-theme>.
 */
export type ThemeId = "lab" | "sandbox" | "phosphor";

const ENGINE_THEME: Record<string, ThemeId> = {
  braids: "phosphor",   // vintage CRT green
  plaits: "sandbox",    // warm TE-style body
  laxsynth: "lab",      // SNES-inspired indigo
};

/** Browser chrome colour per theme — keeps the mobile status bar in step. */
const THEME_COLOR: Record<ThemeId, string> = {
  lab: "#24232B",
  sandbox: "#E9E5DC",
  phosphor: "#0A0805",
};

export function themeForEngine(engineId: string): ThemeId {
  return ENGINE_THEME[engineId] ?? "phosphor";
}

function apply(engineId: string) {
  if (typeof document === "undefined") return;
  const theme = themeForEngine(engineId);
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

apply(engineIdStore.get());
engineIdStore.subscribe(apply);
