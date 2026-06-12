/**
 * Self-hosted UI webfonts — Inter, JetBrains Mono, Space Grotesk — registered
 * via the FontFace API so `import.meta.env.BASE_URL` resolves the /parallax/
 * sub-path correctly (the same base-safe idiom as the Bravura loader; a CSS
 * `url()` to a public asset wouldn't get the base prefix on the project page).
 *
 * This replaces the Google Fonts <link>, so the installed PWA renders its real
 * type *offline* instead of falling back to system fonts despite the
 * "Ready to work offline" toast. (ux-ui §6.7)
 *
 * Each woff2 is the Latin subset of the family's *variable* font, so one file
 * per family covers every weight the themes use (Inter 400/500/600, JetBrains
 * Mono 400/500, Space Grotesk 500/600). Workbox precaches them via the
 * fonts/*.woff2 glob, so they're available with no network.
 *
 * Inter (OFL), JetBrains Mono (OFL), Space Grotesk (OFL) — see their licenses.
 */
const FONTS: ReadonlyArray<{ family: string; file: string; weight: string }> = [
  { family: "Inter",          file: "inter-latin.woff2",          weight: "100 900" },
  { family: "JetBrains Mono", file: "jetbrains-mono-latin.woff2", weight: "100 800" },
  { family: "Space Grotesk",  file: "space-grotesk-latin.woff2",  weight: "300 700" },
];

export function loadUiFonts(): void {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const base = import.meta.env.BASE_URL;
  for (const f of FONTS) {
    try {
      const face = new FontFace(
        f.family,
        `url("${base}fonts/${f.file}") format("woff2")`,
        { weight: f.weight, style: "normal", display: "swap" },
      );
      face.load()
        .then((loaded) => { (document.fonts as FontFaceSet).add(loaded); })
        .catch((err) => console.warn(`[fonts] ${f.family} load failed`, err));
    } catch {
      /* FontFace unsupported — system fallback from the token stacks applies */
    }
  }
}
