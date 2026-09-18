import { describe, it, expect } from "vitest";
import {
  chooseInputId,
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

describe("chooseInputId", () => {
  it("returns the remembered device when it is plugged in", () => {
    expect(chooseInputId(allPorts, "MIDIIN5 (ESI M4U eX)")).toBe("id-5");
  });

  it("falls back to the first input when the remembered device is absent", () => {
    const frontOnly = [1, 2, 3, 4].map(esi);
    expect(chooseInputId(frontOnly, "MIDIIN5 (ESI M4U eX)")).toBe("id-1");
  });

  it("picks the first input when nothing is remembered", () => {
    expect(chooseInputId(allPorts, null)).toBe("id-1");
  });

  it("returns null when no inputs are present", () => {
    expect(chooseInputId([], "MIDIIN5 (ESI M4U eX)")).toBeNull();
  });

  it("matches by name, not by id, so it survives a new browser session", () => {
    // Same hardware, ids reassigned by the browser.
    const reassigned = allPorts.map((p, i) => ({ ...p, id: `fresh-${i + 1}` }));
    expect(chooseInputId(reassigned, "MIDIIN5 (ESI M4U eX)")).toBe("fresh-5");
  });

  it("is deterministic when two ports share a name", () => {
    const dupes: MidiInputInfo[] = [
      { id: "a", name: "Twin" },
      { id: "b", name: "Twin" },
    ];
    expect(chooseInputId(dupes, "Twin")).toBe("a");
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
