import * as Tone from "tone";
import { audioEngine } from "../audio/AudioEngine";
import { isPlayingStore, melodyStore } from "../state/stores";

let installed = false;

/**
 * Adopt the engine's AudioContext as Tone's context so the scheduler and the
 * Braids worklet share one timeline (BPM ramps + note-on times stay in lockstep).
 * Must be called once after `audioEngine.start()` and before `installPart()`.
 */
export function installSequencer(): void {
  if (installed) return;
  const ctx = audioEngine.audioContext;
  if (!ctx) throw new Error("installSequencer: AudioEngine not started — call audioEngine.start() first.");

  Tone.setContext(ctx);
  const transport = Tone.getTransport();
  transport.bpm.value = melodyStore.get().tempo;

  let lastTempo = melodyStore.get().tempo;
  melodyStore.subscribe((m) => {
    if (m.tempo !== lastTempo) {
      lastTempo = m.tempo;
      transport.bpm.value = m.tempo;
    }
  });

  installed = true;
}

export function playTransport(): void {
  Tone.getTransport().start();
  isPlayingStore.set(true);
}

export function stopTransport(): void {
  Tone.getTransport().stop();
  audioEngine.currentEngine?.allNotesOff();
  isPlayingStore.set(false);
}

/**
 * Halt the scheduler at the current position WITHOUT silencing sounding notes —
 * their envelope release rings out naturally. Used by audio export to capture
 * the release tail after the loop ends. Unlike stopTransport(), it does NOT
 * reset to beat 0 and does NOT call allNotesOff().
 */
export function pauseTransport(): void {
  Tone.getTransport().pause();
  isPlayingStore.set(false);
}
