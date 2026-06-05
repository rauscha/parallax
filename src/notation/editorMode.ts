/**
 * Editor-mode state — surface selection, staff tools, grid controls.
 *
 * Lives outside `melodyStore` because these aren't part of the song.
 * Persisted values survive a reload (localStorage); ephemeral ones reset.
 */
import { atom } from "nanostores";

export type OctaveShift = -1 | 0;
export type EditorTool =
  | "normal"     // snap-to-scale; default
  | "sharp"      // force ♯ on the clicked position
  | "flat"       // force ♭
  | "natural"    // force ♮ (bypass snap)
  | "rest";      // tap inserts a rest (= trims previous note to end at S)

const OCT_KEY = "parallax.staff.octaveShift";

function readStoredOctave(): OctaveShift {
  if (typeof localStorage === "undefined") return 0;
  try {
    const v = localStorage.getItem(OCT_KEY);
    return v === "-1" ? -1 : 0;
  } catch {
    return 0;
  }
}

export const octaveShiftStore = atom<OctaveShift>(readStoredOctave());
export function setOctaveShift(v: OctaveShift): void {
  octaveShiftStore.set(v);
  try { localStorage.setItem(OCT_KEY, String(v)); } catch { /* private mode */ }
}

export const editorToolStore = atom<EditorTool>("normal");
export function setEditorTool(v: EditorTool): void { editorToolStore.set(v); }
/** Toggle a tool — click the active one to clear back to normal. */
export function toggleEditorTool(v: EditorTool): void {
  editorToolStore.set(editorToolStore.get() === v ? "normal" : v);
}

/* ——— Surface (which sequencer UI is shown) ————————————————————————— */

export type Surface = "staff" | "grid";
const SURFACE_KEY = "parallax.surface";

function readStoredSurface(): Surface {
  if (typeof localStorage === "undefined") return "staff";
  try {
    return localStorage.getItem(SURFACE_KEY) === "grid" ? "grid" : "staff";
  } catch { return "staff"; }
}

export const surfaceStore = atom<Surface>(readStoredSurface());
export function setSurface(v: Surface): void {
  surfaceStore.set(v);
  try { localStorage.setItem(SURFACE_KEY, v); } catch { /* private mode */ }
}

/* ——— Grid controls ——————————————————————————————————————————————————
   baseOctave: bottom octave of the visible pitch range (C<n>).
   foldToScale: true = In Key (rows = scale degrees); false = Chromatic (all 12). */

const GRID_OCT_KEY  = "parallax.grid.baseOctave";
const GRID_FOLD_KEY = "parallax.grid.foldToScale";

function readStoredGridOctave(): number {
  if (typeof localStorage === "undefined") return 3;
  try {
    const v = parseInt(localStorage.getItem(GRID_OCT_KEY) ?? "");
    return Number.isFinite(v) && v >= 2 && v <= 5 ? v : 3;
  } catch { return 3; }
}

function readStoredFold(): boolean {
  if (typeof localStorage === "undefined") return true;
  try { return localStorage.getItem(GRID_FOLD_KEY) !== "false"; }
  catch { return true; }
}

export const gridBaseOctaveStore = atom<number>(readStoredGridOctave());
export function setGridBaseOctave(v: number): void {
  const clamped = Math.max(2, Math.min(5, v));
  gridBaseOctaveStore.set(clamped);
  try { localStorage.setItem(GRID_OCT_KEY, String(clamped)); } catch {}
}

export const foldToScaleStore = atom<boolean>(readStoredFold());
export function setFoldToScale(v: boolean): void {
  foldToScaleStore.set(v);
  try { localStorage.setItem(GRID_FOLD_KEY, String(v)); } catch {}
}
