/**
 * Live MIDI input — PURE device-selection logic. No Web MIDI, no Svelte, no
 * globals, so it is unit-testable under Node (mirrors the project's pure-layer
 * convention: lineage-core.ts / serialization.ts). The Web MIDI plumbing lives
 * in the impure shell `midi-input.ts`, which imports these helpers.
 *
 * Why remember the NAME and not the Web MIDI `id`: the id is minted by the
 * browser and is not guaranteed stable across sessions, profiles or reboots.
 * The name ("MIDIIN5 (ESI M4U eX)") comes from the device and is stable, so a
 * remembered name still finds the right port tomorrow.
 *
 * This matters on multi-port interfaces. An ESI M4U eX exposes eight MIDI INs
 * (four front jacks, four rear); binding "the first one" lands on front jack 1
 * and silently ignores a controller cabled into the back.
 */

export interface MidiInputInfo {
  id: string;
  name: string;
}

/** localStorage key for the remembered device name. Namespaced to the app. */
export const REMEMBERED_NAME_KEY = "parallax:midi-input-name";

/**
 * Which input should be bound, given what is plugged in and what we remembered.
 * Prefers the remembered device; falls back to the first available input so a
 * single-controller setup still works with no stored preference. Null when
 * nothing is plugged in.
 */
export function chooseInputId(
  inputs: readonly MidiInputInfo[],
  rememberedName: string | null,
): string | null {
  if (inputs.length === 0) return null;
  if (rememberedName !== null) {
    const match = inputs.find((i) => i.name === rememberedName);
    if (match) return match.id;
  }
  return inputs[0].id;
}

/*
 * Storage access is wrapped because it throws outright in some contexts — a
 * private window, or site data blocked — where a bare call would take the whole
 * MIDI panel down with it. Forgetting the device is the correct degradation.
 */

export function readRememberedName(storage: Storage): string | null {
  try {
    return storage.getItem(REMEMBERED_NAME_KEY);
  } catch {
    return null;
  }
}

export function writeRememberedName(storage: Storage, name: string): void {
  try {
    storage.setItem(REMEMBERED_NAME_KEY, name);
  } catch {
    /* preference is a convenience; never let it break input */
  }
}

export function clearRememberedName(storage: Storage): void {
  try {
    storage.removeItem(REMEMBERED_NAME_KEY);
  } catch {
    /* as above */
  }
}
