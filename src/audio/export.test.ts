import { describe, it, expect } from "vitest";
import {
  RELEASE_TAIL_MS,
  computeLoopDurationMs,
  buildExportFilename,
  extForMimeType,
} from "./export";

describe("computeLoopDurationMs (4 bars = 960/tempo seconds)", () => {
  it("is 8000 ms at 120 BPM", () => {
    expect(computeLoopDurationMs(120)).toBe(8000);
  });
  it("is 16000 ms at 60 BPM", () => {
    expect(computeLoopDurationMs(60)).toBe(16000);
  });
  it("is 4800 ms at 200 BPM", () => {
    expect(computeLoopDurationMs(200)).toBe(4800);
  });
  it("is 4000 ms at 240 BPM", () => {
    expect(computeLoopDurationMs(240)).toBe(4000);
  });
});

describe("RELEASE_TAIL_MS", () => {
  it("is the fixed 2 s tail", () => {
    expect(RELEASE_TAIL_MS).toBe(2000);
  });
});

describe("buildExportFilename", () => {
  it("assembles the documented scheme", () => {
    expect(buildExportFilename("csaw", 120, "2026-06-20", "webm")).toBe(
      "parallax-CSAW-120bpm-2026-06-20.webm",
    );
  });
  it("uppercases and strips non-alphanumerics from the model code", () => {
    // Real Braids codes include "SYN-Q", "TOY*", "SQR-", "SWx3".
    expect(buildExportFilename("syn-q", 90, "2026-01-02", "ogg")).toBe(
      "parallax-SYNQ-90bpm-2026-01-02.ogg",
    );
    expect(buildExportFilename("toy*", 120, "2026-01-02", "webm")).toBe(
      "parallax-TOY-120bpm-2026-01-02.webm",
    );
  });
  it("falls back to PATCH when the model code is empty", () => {
    expect(buildExportFilename("", 120, "2026-06-20", "webm")).toBe(
      "parallax-PATCH-120bpm-2026-06-20.webm",
    );
  });
});

describe("extForMimeType", () => {
  it("maps webm/opus to webm", () => {
    expect(extForMimeType("audio/webm;codecs=opus")).toBe("webm");
  });
  it("maps ogg/opus to ogg", () => {
    expect(extForMimeType("audio/ogg;codecs=opus")).toBe("ogg");
  });
  it("maps mp4/aac to mp4", () => {
    expect(extForMimeType("audio/mp4")).toBe("mp4");
  });
  it("defaults to webm for an empty or unknown mime", () => {
    expect(extForMimeType("")).toBe("webm");
    expect(extForMimeType("audio/flac")).toBe("webm");
  });
});
