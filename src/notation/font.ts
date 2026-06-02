/**
 * Self-hosted Bravura SMuFL font loader.
 *
 * Loaded once via the FontFace API so `import.meta.env.BASE_URL` resolves
 * correctly under the `/parallax/` GitHub Pages base AND at root in dev.
 * Idempotent: repeated calls return the same Promise.
 *
 * Licensed under SIL OFL 1.1 (see LICENSE-Bravura.txt).
 * Bravura © Steinberg Media Technologies GmbH.
 */

let loading: Promise<void> | null = null;

export function loadBravura(): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !("fonts" in document)) {
    loading = Promise.resolve();
    return loading;
  }
  const url = `${import.meta.env.BASE_URL}fonts/Bravura.woff2`;
  const face = new FontFace("Bravura", `url("${url}") format("woff2")`, {
    display: "block",
  });
  loading = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
    })
    .catch((err) => {
      console.warn("[Bravura] load failed", err);
    });
  return loading;
}
