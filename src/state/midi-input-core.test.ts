import { describe, it, expect } from "vitest";
import {
  chooseInput,
  recallNotice,
  shouldRechoose,
  readRememberedName,
  writeRememberedName,
  clearRememberedName,
  REMEMBERED_NAME_KEY,
  type MidiInputInfo,
} from "./midi-input-core";

const esi = (n: number): MidiInputInfo => ({
  id: `id-${n}`,
  name: n === 1 ? "ESI M4U eX" : `MIDIIN${n} (ESI M4U eX)`,
});

/** All eight ports of a real M4U eX: 4 front jacks, 4 rear. */
const allPorts = [1, 2, 3, 4, 5, 6, 7, 8].map(esi);

/*
 * The same eight ports after Windows MIDI Services switches to "new style"
 * names. The format is Microsoft's, from the ESI M8U eX fixture in their own
 * naming tests (microsoft/MIDI, NamingTests.cpp): the device name, then
 * "group", then the 1-based port. The browser ids are fresh too, because the
 * service restart that applies a rename re-enumerates every port.
 */
const newStyle = (n: number): MidiInputInfo => ({
  id: `new-${n}`,
  name: `ESI M4U eX group ${n}`,
});
const renamedPorts = [1, 2, 3, 4, 5, 6, 7, 8].map(newStyle);

/** A minimal Storage stand-in — enough surface for the two calls we make. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

/** Storage that throws on every access — private mode, or site data blocked. */
function hostileStorage(): Storage {
  const boom = () => { throw new DOMException("denied", "SecurityError"); };
  return {
    getItem: boom, setItem: boom, removeItem: boom,
    clear: boom, key: boom, get length(): number { return boom(); },
  } as unknown as Storage;
}

describe("chooseInput", () => {
  it("returns the remembered device when it is plugged in", () => {
    expect(chooseInput(allPorts, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "id-5", match: "remembered" });
  });

  it("falls back to the first input, and says so, when the remembered device is absent", () => {
    const frontOnly = [1, 2, 3, 4].map(esi);
    expect(chooseInput(frontOnly, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "id-1", match: "missing" });
  });

  it("picks the first input when nothing is remembered", () => {
    expect(chooseInput(allPorts, null)).toEqual({ id: "id-1", match: "default" });
  });

  it("returns null when no inputs are present", () => {
    expect(chooseInput([], "MIDIIN5 (ESI M4U eX)")).toBeNull();
  });

  it("matches by name, not by id, so it survives a new browser session", () => {
    // Same hardware, ids reassigned by the browser.
    const reassigned = allPorts.map((p, i) => ({ ...p, id: `fresh-${i + 1}` }));
    expect(chooseInput(reassigned, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "fresh-5", match: "remembered" });
  });

  it("is deterministic when two ports share a name", () => {
    const dupes: MidiInputInfo[] = [
      { id: "a", name: "Twin" },
      { id: "b", name: "Twin" },
    ];
    expect(chooseInput(dupes, "Twin")).toEqual({ id: "a", match: "remembered" });
  });
});

describe("chooseInput across a Windows MIDI Services rename", () => {
  it("finds an old-style port under its new-style name", () => {
    // The 2026-09-17 bug: RD-700GX on port 5. A bare fallback lands on group 1.
    expect(chooseInput(renamedPorts, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "new-5", match: "renamed" });
  });

  it("finds the bare old-style first port as group 1", () => {
    // Classic WinMM names port 1 with the device name alone, no MIDIIN prefix.
    expect(chooseInput(renamedPorts, "ESI M4U eX"))
      .toEqual({ id: "new-1", match: "renamed" });
  });

  it("finds a new-style port again after a switch back to old-style names", () => {
    expect(chooseInput(allPorts, "ESI M4U eX group 5"))
      .toEqual({ id: "id-5", match: "renamed" });
  });

  it("reads a plain trailing port number as the same port", () => {
    // Microsoft's MIDIMATE II fixture: new style "MIDIMATE II 2" is classic
    // "MIDIIN2 (MIDIMATE II)".
    const midimate: MidiInputInfo[] = [
      { id: "m1", name: "MIDIMATE II" },
      { id: "m2", name: "MIDIMATE II 2" },
    ];
    expect(chooseInput(midimate, "MIDIIN2 (MIDIMATE II)"))
      .toEqual({ id: "m2", match: "renamed" });
  });

  it("ignores case and runs of spaces in the device name", () => {
    const shouty = [{ id: "s5", name: "ESI  M4U EX group 5" }];
    expect(chooseInput(shouty, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "s5", match: "renamed" });
  });

  it("prefers an exact name over a renamed look-alike", () => {
    const both: MidiInputInfo[] = [
      { id: "look-alike", name: "ESI M4U eX group 5" },
      { id: "exact", name: "MIDIIN5 (ESI M4U eX)" },
    ];
    expect(chooseInput(both, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "exact", match: "remembered" });
  });

  it("does not match the same port number on a different device", () => {
    const other: MidiInputInfo[] = [
      { id: "k", name: "nanoKEY2" },
      { id: "o5", name: "MIDIIN5 (Other Interface)" },
    ];
    expect(chooseInput(other, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "k", match: "missing" });
  });

  it("does not match a different port on the same device", () => {
    const withoutFive = renamedPorts.filter((p) => p.id !== "new-5");
    expect(chooseInput(withoutFive, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "new-1", match: "missing" });
  });

  it("refuses to guess between two look-alikes", () => {
    // Two identical interfaces: either could be the one. Say so, don't pick.
    const twins: MidiInputInfo[] = [
      { id: "k", name: "nanoKEY2" },
      { id: "t1", name: "ESI M4U eX group 5" },
      { id: "t2", name: "ESI M4U eX group 5" },
    ];
    expect(chooseInput(twins, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "k", match: "missing" });
  });

  it("cannot recognise a custom name, so reports the fallback", () => {
    // Windows MIDI Services also lets the user type any name up to 31 chars.
    const custom = [{ id: "c1", name: "M4U front 1" }, { id: "c5", name: "RD-700GX" }];
    expect(chooseInput(custom, "MIDIIN5 (ESI M4U eX)"))
      .toEqual({ id: "c1", match: "missing" });
  });
});

describe("recallNotice", () => {
  const saved = "MIDIIN5 (ESI M4U eX)";

  it("is silent when the remembered port was found by name", () => {
    expect(recallNotice({ id: "id-5", match: "remembered" }, saved)).toBeNull();
  });

  it("is silent when nothing was remembered", () => {
    expect(recallNotice({ id: "id-1", match: "default" }, null)).toBeNull();
  });

  it("is silent when nothing is plugged in", () => {
    expect(recallNotice(null, saved)).toBeNull();
  });

  it("reports a port that was found under a new name", () => {
    expect(recallNotice({ id: "new-5", match: "renamed" }, saved))
      .toEqual({ match: "renamed", rememberedName: saved });
  });

  it("reports a fallback to some other port", () => {
    expect(recallNotice({ id: "id-1", match: "missing" }, saved))
      .toEqual({ match: "missing", rememberedName: saved });
  });
});

describe("shouldRechoose", () => {
  const saved = "MIDIIN5 (ESI M4U eX)";

  it("chooses again when the bound input has gone", () => {
    expect(shouldRechoose(false, null)).toBe(true);
  });

  it("keeps a bound input that is still plugged in", () => {
    // An explicit pick must survive an unrelated device arriving.
    expect(shouldRechoose(true, null)).toBe(false);
  });

  it("keeps a renamed match that is still plugged in", () => {
    expect(shouldRechoose(true, { match: "renamed", rememberedName: saved })).toBe(false);
  });

  it("looks again while bound to a stand-in, in case the remembered port arrived", () => {
    expect(shouldRechoose(true, { match: "missing", rememberedName: saved })).toBe(true);
  });
});

describe("remembered-name storage", () => {
  it("round-trips a device name", () => {
    const s = fakeStorage();
    writeRememberedName(s, "MIDIIN5 (ESI M4U eX)");
    expect(readRememberedName(s)).toBe("MIDIIN5 (ESI M4U eX)");
  });

  it("reads null before anything has been stored", () => {
    expect(readRememberedName(fakeStorage())).toBeNull();
  });

  it("clears the stored name", () => {
    const s = fakeStorage();
    writeRememberedName(s, "MIDIIN5 (ESI M4U eX)");
    clearRememberedName(s);
    expect(readRememberedName(s)).toBeNull();
  });

  it("stores under a namespaced key", () => {
    const s = fakeStorage();
    writeRememberedName(s, "Twin");
    expect(s.getItem(REMEMBERED_NAME_KEY)).toBe("Twin");
  });

  it("reads null instead of throwing when storage is unavailable", () => {
    expect(readRememberedName(hostileStorage())).toBeNull();
  });

  it("swallows a write failure when storage is unavailable", () => {
    expect(() => writeRememberedName(hostileStorage(), "Twin")).not.toThrow();
  });

  it("swallows a clear failure when storage is unavailable", () => {
    expect(() => clearRememberedName(hostileStorage())).not.toThrow();
  });
});
