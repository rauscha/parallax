/**
 * One-loop audio export — realtime MediaRecorder tap on the master bus.
 *
 * Pure helpers (duration math, filename, extension) live here with NO Tone /
 * store / AudioEngine imports, so they unit-test in Node. The transport-driving
 * orchestrator that needs those lives in `export-loop.ts`.
 */

/** Fixed release tail appended after the loop so the last note's decay isn't cut. */
export const RELEASE_TAIL_MS = 2000;

/**
 * Length of one 4-bar loop in milliseconds at the given tempo.
 * 4 bars × 4 beats = 16 beats; 16 beats / tempo BPM × 60 s = 960 / tempo s.
 */
export function computeLoopDurationMs(tempo: number): number {
  return (960 / tempo) * 1000;
}

/**
 * Download filename: `parallax-{MODELCODE}-{tempo}bpm-{date}.{ext}`.
 * `modelCode` is uppercased and reduced to [A-Z0-9] (real codes include
 * "SYN-Q", "TOY*", "SWx3"); an empty code falls back to "PATCH".
 */
export function buildExportFilename(
  modelCode: string,
  tempo: number,
  date: string,
  ext: string,
): string {
  const safe = modelCode.toUpperCase().replace(/[^A-Z0-9]/g, "") || "PATCH";
  return `parallax-${safe}-${tempo}bpm-${date}.${ext}`;
}

/** Map a MediaRecorder mime type to a download file extension. */
export function extForMimeType(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("mpeg") || mime.includes("aac")) return "mp4";
  return "webm";
}
