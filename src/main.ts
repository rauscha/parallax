import { mount } from "svelte";
import "./ui/themes/tokens.css";
import "./ui/themes/base.css";
import { loadUiFonts } from "./ui/themes/fonts";
import "./state/theme";       // attach theme → <html data-theme=…> subscriber
import App from "./App.svelte";
import { hydrateLineage } from "./state/lineage";

// Self-hosted webfonts (replaces the Google Fonts <link> — true offline type).
loadUiFonts();

const target = document.getElementById("app");
if (!target) throw new Error("#app root element missing from index.html");

const app = mount(App, { target });

// Load the persisted "Recent sounds" ring (idb) into its store on boot. Fire-and-
// forget: it degrades to in-memory if idb is unavailable, and merges rather than
// clobbers if a roll somehow lands before it resolves.
void hydrateLineage();

// Register the service worker for installability + offline use. Production only
// — there's no SW in dev. Dynamically imported so it stays out of the dev graph
// entirely; the autoUpdate registerType applies new builds on the next load.
if (import.meta.env.PROD) {
  import("./state/pwa-register").then((m) => m.registerPwa());
}

// Dev-only debug handle. Stripped from production builds (import.meta.env.DEV is
// statically false there, so the block is dead-code-eliminated). Lets the
// preview harness read the live audio graph numerically — the only reliable
// signal-presence check on a machine where canvas/screenshot readback is wedged.
if (import.meta.env.DEV) {
  import("./audio/AudioEngine").then(({ audioEngine }) => {
    (window as unknown as { __parallax?: unknown }).__parallax = { audioEngine };
  });
}

export default app;
