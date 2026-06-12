import { defineConfig } from "vitest/config";

// The tests target the pure, DOM-free layers (serialization, grid geometry,
// MIDI convert, Part expansion), so the node environment is enough — no jsdom,
// no Web Audio. Only *.test.ts under src/ are collected.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
