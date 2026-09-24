/**
 * Live MIDI input — PURE device-selection logic. No Web MIDI, no Svelte, no
 * globals, so it is unit-testable under Node (mirrors the project's pure-layer
 * convention: lineage-core.ts / serialization.ts). The Web MIDI plumbing lives
 * in the impure shell `midi-input.ts`, which imports these helpers.
 *
 * Why remember the NAME and not the Web MIDI `id`: the id is minted by the
 * browser and is not guaranteed stable across sessions, profiles or reboots.
 * The name ("MIDIIN5 (ESI M4U eX)") is the best handle the browser gives us —
 * but it is not permanent. Windows MIDI Services (Windows 11, in-box from
 * November 2026) lets the user switch a device between classic WinMM names,
 * "new style" names, and names of their own, and a switch renames every port.
 * So a name that no longer matches is expected, and must never be papered
 * over: the chooser says HOW it chose, and the UI shows anything but a clean
 * match.
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
 * How `chooseInput` arrived at its answer.
 * - `remembered` — the remembered name, verbatim.
 * - `renamed`    — the remembered port, recognised under a new name.
 * - `missing`    — a name was remembered but nothing matched; first input instead.
 * - `default`    — nothing was remembered; first input.
 */
export type InputMatch = "remembered" | "renamed" | "missing" | "default";

export interface InputChoice {
  id: string;
  match: InputMatch;
}

/**
 * Which input should be bound, given what is plugged in and what we remembered.
 * Prefers the remembered name exactly, then the same port under a new name,
 * then the first available input so a single-controller setup still works.
 * Null when nothing is plugged in.
 */
export function chooseInput(
  inputs: readonly MidiInputInfo[],
  rememberedName: string | null,
): InputChoice | null {
  if (inputs.length === 0) return null;
  if (rememberedName === null) return { id: inputs[0].id, match: "default" };
  const exact = inputs.find((i) => i.name === rememberedName);
  if (exact) return { id: exact.id, match: "remembered" };
  const renamed = findRenamed(inputs, rememberedName);
  if (renamed) return { id: renamed.id, match: "renamed" };
  return { id: inputs[0].id, match: "missing" };
}

/*
 * Second pass: the same port under another naming style. Microsoft builds both
 * styles from one device string and one 1-based port number (their naming
 * tests, microsoft/MIDI NamingTests.cpp):
 *
 *   classic      "ESI M4U eX"            "MIDIIN5 (ESI M4U eX)"
 *   new style    "ESI M4U eX group 1"    "ESI M4U eX group 5"
 *   numbered     "MIDIMATE II"           "MIDIMATE II 2"
 *
 * So a name reduces to (device, port), and two names are the same port when
 * any reading of one equals any reading of the other. Port 1 goes bare in both
 * classic and numbered styles, hence the bare reading. A custom name has no
 * such structure and is correctly not recognised.
 *
 * This is a guess, so it has to be an unambiguous one: two candidates (two
 * identical interfaces, say) means no match, never "the first".
 */

interface PortKey {
  device: string;
  port: number;
}

/** Every way a port name can be read as a (device, 1-based port) pair. */
function portKeys(name: string): PortKey[] {
  const n = name.trim().replace(/\s+/g, " ").toLowerCase();
  const classic = /^midiin(\d+) \((.+)\)$/.exec(n);
  if (classic) return [{ device: classic[2], port: Number(classic[1]) }];
  const keys: PortKey[] = [{ device: n, port: 1 }];
  const numbered = /^(.+?)(?: group |[ -])(\d+)$/.exec(n);
  if (numbered) keys.push({ device: numbered[1], port: Number(numbered[2]) });
  return keys;
}

function findRenamed(
  inputs: readonly MidiInputInfo[],
  rememberedName: string,
): MidiInputInfo | null {
  const wanted = portKeys(rememberedName);
  const samePort = (name: string) =>
    portKeys(name).some((k) => wanted.some((w) => w.device === k.device && w.port === k.port));
  const hits = inputs.filter((i) => samePort(i.name));
  return hits.length === 1 ? hits[0] : null;
}

/** What the UI must tell the user about a choice that was not a clean match. */
export interface RecallNotice {
  match: Extract<InputMatch, "renamed" | "missing">;
  rememberedName: string;
}

/** The notice for a choice, or null when there is nothing to say. */
export function recallNotice(
  choice: InputChoice | null,
  rememberedName: string | null,
): RecallNotice | null {
  if (choice === null || rememberedName === null) return null;
  if (choice.match !== "renamed" && choice.match !== "missing") return null;
  return { match: choice.match, rememberedName };
}

/**
 * On a device change, whether to run the chooser again. A binding that is
 * still plugged in is kept — an explicit pick must survive an unrelated device
 * arriving — unless it was only a stand-in for a missing remembered port,
 * which may be the device that just arrived.
 */
export function shouldRechoose(stillBound: boolean, recall: RecallNotice | null): boolean {
  return !stillBound || recall?.match === "missing";
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
