/**
 * Which top-level view is showing. Two of them: the instrument, and the
 * flowsheet teacher (spec §4.4 — "its own route/view, not another panel crammed
 * into the main screen").
 *
 * **Where the route lives, and why.** In the URL fragment, as `#view=flowsheet`.
 * The fragment already looked taken by share links, but it isn't: share URLs are
 * `#p=<blob>`, and `share-url.ts` reads that with `URLSearchParams`, so the
 * fragment is a key/value space with exactly one key in use. Adding a second key
 * costs nothing and composes — `#p=…&view=flowsheet` is a shared sound *and* the
 * teacher, which is a link worth being able to send.
 *
 * The two alternatives were both worse:
 *
 * - **A real path** (`/parallax/flowsheet`) would need the GitHub Pages 404.html
 *   redirect trick, which fights the service worker's navigation fallback for a
 *   route nobody types by hand.
 * - **A separate HTML entry point** would be a full page load to switch views,
 *   which tears down the AudioContext and the engine with it. The flowsheet's
 *   entire job is to show the *sounding* voice; walking to it must not stop the
 *   note. That rules out anything that leaves this document.
 *
 * `replaceState` rather than `pushState`: switching views is not a navigation
 * anyone wants twelve entries of in their back button. Back still works, because
 * the popstate/hashchange listener below syncs the store either way.
 */
import { atom } from "nanostores";

export type ViewId = "instrument" | "flowsheet";

const KEY = "view";

/** The fragment's key/value pairs, ignoring the leading '#'. */
function params(): URLSearchParams {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  return new URLSearchParams(raw);
}

function readView(): ViewId {
  return params().get(KEY) === "flowsheet" ? "flowsheet" : "instrument";
}

export const viewStore = atom<ViewId>(
  typeof location === "undefined" ? "instrument" : readView(),
);

/**
 * Rewrite the fragment's `view` key, leaving every other key (`p`) intact.
 * Returns the fragment, without the '#'.
 */
export function fragmentWithView(view: ViewId, from: URLSearchParams = params()): string {
  const next = new URLSearchParams(from);
  if (view === "instrument") next.delete(KEY);
  else next.set(KEY, view);
  return next.toString();
}

export function setView(view: ViewId): void {
  if (viewStore.get() === view && readView() === view) return;
  const frag = fragmentWithView(view);
  // An empty fragment is written as the bare path, not as a dangling '#'.
  history.replaceState(null, "", frag ? `#${frag}` : location.pathname + location.search);
  viewStore.set(view);
}

/** Back/forward, or a hand-edited address bar, must move the view too. */
if (typeof window !== "undefined") {
  const sync = () => viewStore.set(readView());
  window.addEventListener("hashchange", sync);
  window.addEventListener("popstate", sync);
}
