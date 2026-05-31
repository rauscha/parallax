import { atom } from "nanostores";

export type ThemeId = "lab" | "ko" | "phosphor";

export const THEMES: { id: ThemeId; name: string; tagline: string }[] = [
  { id: "lab",      name: "Lab Instrument", tagline: "Precise. Teal trace on near-black." },
  { id: "ko",       name: "K.O. Console",   tagline: "Warm body, hot orange, dark scope." },
  { id: "phosphor", name: "Phosphor",       tagline: "Vintage CRT. Green bloom. Scanlines." },
];

const STORAGE_KEY = "parallax:theme";

function readInitial(): ThemeId {
  if (typeof localStorage === "undefined") return "lab";
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
  if (stored === "lab" || stored === "ko" || stored === "phosphor") return stored;
  return "lab";
}

export const themeStore = atom<ThemeId>(readInitial());

export function setTheme(id: ThemeId) {
  themeStore.set(id);
}

themeStore.subscribe((id) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
});
