/**
 * One-loop audio export orchestrator. Drives the transport for a clean capture:
 * stop → rewind → record exactly one 4-bar loop → pause-and-let-ring for the
 * fixed release tail → stop recorder → restore prior play state → download.
 *
 * Lives apart from `export.ts` because it imports Tone (via transport) + stores;
 * keeping `export.ts` Tone-free lets its pure helpers unit-test under vitest.
 */
import { audioEngine } from "./AudioEngine";
import { melodyStore, isPlayingStore, patchStore } from "../state/stores";
import { playTransport, stopTransport, pauseTransport } from "../sequencer/transport";
import {
  AudioExporter,
  RELEASE_TAIL_MS,
  computeLoopDurationMs,
  buildExportFilename,
  extForMimeType,
  isExportSupported,
} from "./export";

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the navigation/download has grabbed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Capture the current loop and download it. Resolves once the file download has
 * been triggered. Throws if audio isn't started or export is unsupported.
 */
export async function exportOneLoop(): Promise<void> {
  if (!isExportSupported()) throw new Error("Audio export is not supported in this browser.");
  const ctx = audioEngine.audioContext;
  const masterGain = audioEngine.masterGainNode;
  if (!ctx || !masterGain) throw new Error("Audio engine not started.");

  const { tempo } = melodyStore.get();
  const loopMs = computeLoopDurationMs(tempo);
  const wasPlaying = isPlayingStore.get();

  // Clean start: halt + rewind to beat 0, then begin recording, then play.
  stopTransport();
  const exporter = new AudioExporter(ctx, masterGain);
  exporter.start();
  playTransport();

  // One full loop, then halt scheduling (no hard cut) so the last note rings
  // into the fixed release tail; stop the recorder once the tail elapses.
  await delay(loopMs);
  pauseTransport();
  await delay(RELEASE_TAIL_MS);
  const blob = await exporter.stop();

  // Restore the transport to its pre-export state.
  if (wasPlaying) playTransport();
  else stopTransport();

  // Guard: ensure we captured audio.
  if (blob.size === 0) throw new Error("Export produced no audio.");

  // Build the filename from the live patch + tempo + today's date.
  const { modelId, engineId } = patchStore.get();
  const ext = extForMimeType(blob.type || exporter.mimeType);
  const date = new Date().toISOString().slice(0, 10);
  const filename = buildExportFilename(modelId ?? engineId, tempo, date, ext);
  triggerDownload(blob, filename);
}
