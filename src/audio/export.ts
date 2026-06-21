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

/** Preferred capture mime types, best-first. Opus is transparent for synth material. */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

/** True when the browser can record audio at all. */
export function isExportSupported(): boolean {
  return typeof MediaRecorder !== "undefined";
}

/** First supported preferred mime type, or "" to let MediaRecorder pick its default. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Taps a GainNode (the master bus) into a MediaStream and records it. The tap is
 * a SECOND consumer of `source` — the existing `source → analyser → destination`
 * path is untouched, so the user keeps hearing the loop while it records.
 *
 *   source → analyser → destination        (unchanged)
 *        ↘ MediaStreamDestination → MediaRecorder
 */
export class AudioExporter {
  private readonly tap: MediaStreamAudioDestinationNode;
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  readonly mimeType: string;

  constructor(private readonly ctx: AudioContext, private readonly source: GainNode) {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("Audio export is not supported in this browser.");
    }
    this.mimeType = pickMimeType();
    this.tap = ctx.createMediaStreamDestination();
    source.connect(this.tap);
    this.recorder = this.mimeType
      ? new MediaRecorder(this.tap.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.tap.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
  }

  /** Begin recording immediately. */
  start(): void {
    this.recorder.start();
  }

  /** Stop recording, disconnect the tap, and resolve with the assembled Blob. */
  stop(): Promise<Blob> {
    return new Promise<Blob>((resolve) => {
      this.recorder.onstop = () => {
        try { this.source.disconnect(this.tap); } catch { /* already disconnected */ }
        const type = this.recorder.mimeType || this.mimeType || "audio/webm";
        resolve(new Blob(this.chunks, { type }));
      };
      this.recorder.stop();
    });
  }
}
