/**
 * Staff-editor mode state — viewing preferences + active tools.
 *
 * Lives outside `melodyStore` because these aren't part of the song. The
 * octave shift survives a reload (localStorage); the active tool is
 * ephemeral and resets on refresh.
 *
 * The toolbar writes, the staff editor reads, snap/render branch on these.
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
