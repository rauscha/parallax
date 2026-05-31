# Parallax — Deep Review

**Date:** 2026-05-31 · **Reviewed at:** commit `d6389c8` (main) · **Milestones built:** M0 (scaffold), M1 (authentic Braids WASM engine + oscilloscope + keyboard note-trigger), **M2 (control surface — committed during this review; see note below)**

Method: seven read-only reviewers fanned out across Security, Efficiency, UI/UX, Visual Design, Delight, Effectiveness, and Bugs, then a focused second wave re-checked the newly-arrived M2 UI. This document synthesizes all of them. Severity is labelled in text — **[P0]** most urgent to **[P3]** least — never by colour (every cue here is readable without colour vision).

> **A note on how this review unfolded (it matters).** When this session began, `git status` was clean. Minutes later, a complete, uncommitted **M2 control surface** appeared in the working tree — it had reached this machine through the **Google Drive folder sync**, never committed and never pushed. We caught it, type-checked it (clean), and committed + pushed it (`d6389c8`) so it can't be lost. This is both good news (M2 is real and now safe) and a flashing warning light about how the project is being synced across your machines. It is the **first item in the action plan.**

---

## 1. Executive summary

**The north star (recorded for this review).**
*End goal:* a single, gorgeous, responsive web app (PWA) that recreates the **authentic** Mutable Instruments Braids macro-oscillator in the browser — set its parameters, watch a live oscilloscope, read a panel that explains what each control does *in the currently-selected model*, and click out a 4-bar melody to noodle along. The engine is hot-swappable behind a clean interface; everything routes as MIDI note numbers. v1 = MIDI file import/export + shareable URL links.
*Guiding principle:* **authentic substance first, then make it genuinely beautiful** — a real Braids DSP engine before any UI flesh, then a sleek, minimal, teaching instrument.

**Overall verdict: on track, and the hardest part is genuinely done.** The defining bet of this whole project — recreating the *real* Braids firmware in the browser rather than approximating it — has paid off. The vendored code is Émilie Gillet's actual MIT C++; the engine instantiates the real `MacroOscillator` and renders all 47 models at 96 kHz, resampled to your sound card's rate, with the lo-fi grit intact. You confirmed it sounds right by ear, and the code backs that up. The architecture underneath is clean enough that the later milestones really can "drop in" as planned — and M2 just demonstrated that by landing the control panel with **zero changes to the engine**. This is a well-built foundation, not a demo held together with tape.

What it is *not* yet is the *beautiful, effortless, alive* instrument the second half of the guiding principle calls for. That's expected at this stage — but it's where almost all of the findings cluster, and a few of them are sharp.

**The five things that matter most:**

1. **Your repository is living inside Google Drive — including the hidden `.git` folder that holds all of git's history.** This is almost certainly why uncommitted work surfaced mid-session. Google Drive and git are both trying to be the "source of truth" for the same files, and they will eventually collide. **[P0 — CRITICAL]** as a process risk. Fix described in §2.

2. **Two latent but serious audio-reliability bugs.** If the WebAssembly engine ever fails to load (a corrupt file, a low-memory phone, an old browser), the app hangs **silently forever** with no error — it looks started but makes no sound. And a held note can get **stuck droning** if you Alt-Tab or otherwise lose keyboard focus mid-press. Both are **[P0 — CRITICAL]**, both are cheap to fix.

3. **The engine is authentic, but not yet *bit-accurate* to the hardware.** The lo-fi "Braids crunch" runs its processing stages in the *reverse* order from the real firmware, Braids' internal envelope isn't ported (it's faked outside the engine), and one lo-fi control (DRIFT) does nothing. It sounds great today; these are the gap between "sounds great" and "indistinguishable from the module." **[P1 — IMPORTANT]** against your authenticity principle.

4. **M2's UI is architecturally excellent but cosmetically and ergonomically unfinished.** The panel auto-generates from the engine's own parameter list (exactly the promised design) — but two CSS colour variables were never defined, so the model picker's "which one am I on?" highlight is invisible; the picker has no keyboard navigation; touch targets are too small for a phone; and the signature vertical-drag **Knob was quietly swapped out for plain sliders** (the knob code is parked in a comment). All **[P1]/[P2]**.

5. **It looks good, but "good" is a criticism here.** The three themes, typography, and colour-blind discipline are genuinely well done. But the oscilloscope — the intended glowing hero — uses a *faked* halo rather than real bloom, the "subtle grain" texture from the design brief is missing, several small labels fail contrast guidelines, and the resting scope is a **dead flat line**. The identity is *designed*; it is not yet fully *built*. **[P1]**.

**Bottom line:** the risky, irreversible-if-wrong core (authentic engine + clean architecture) is in hand and is the project's real achievement. The remaining work is the more forgiving, iterative kind — reliability hardening, authenticity polish, and making it look and feel as alive as the concept deserves.

---

## 2. Action plan (do this first)

Ordered by urgency. Each item: the problem, why it matters in plain terms, the fix, and rough effort.

### [P0 — CRITICAL] 1. Get your repository out of Google Drive's sync path
**Problem.** The project folder `C:\GDrive\Braids-tester` is inside Google Drive, and Drive is syncing *everything* in it — including `node_modules`, the build output, and critically the hidden **`.git`** directory where git stores every commit, branch, and the staging area. Evidence it's already causing trouble: your `git status` was clean at the start of this session, then minutes later a full set of uncommitted M2 files (and even a *staged* deletion, which only git itself creates) materialized — synced in from another machine by Drive, not by git.

**Why it matters.** Git and Google Drive are two systems that both think they own these files. Git expects `.git` to change only when *it* changes it. Drive rewrites those same files whenever another machine syncs. When they overlap — say, Drive is mid-sync while you run a commit — git's index or object database can be corrupted, or Drive spawns "conflicted copy" files inside `.git`, and you can **silently lose commits**. The analogy: it's two clinicians writing on the same paper chart at the same time with no protocol for who holds the pen. It works until the day it doesn't, and the failure is data loss. The cross-machine workflow you already use (`hand-off` / `pick-up`) is built around `git push`/`pull` precisely so Drive never has to touch `.git` — but that only works if the repo lives *outside* Drive.

**Fix.** Move the working repository to a normal, non-synced location (e.g. `C:\dev\parallax` or `~\projects\parallax`) on each machine, and rely on `git push`/`git pull` to move work between them — which is what GitHub is *for*. If you strongly prefer the folder stays under `C:\GDrive` for convenience, the minimum mitigation is to tell Google Drive to **exclude this folder from sync**, but moving it out is cleaner and removes the foot-gun entirely. Either way, `node_modules` and the WASM build can be regenerated on each machine (`npm install`, `npm run wasm`), so they never needed to ride along in the first place.

**Effort.** ~30 min, one-time, per machine. Highest value-for-effort item in this entire review.

### [P0 — CRITICAL] 2. Surface WASM load failures instead of hanging forever
**Problem.** The engine loads by handing the pre-fetched WebAssembly binary to a custom loader (a clever workaround for a real browser limitation — see Strengths). But the failure path is dead: if `WebAssembly.instantiate` throws (corrupt/truncated `braids.wasm`, out-of-memory on a weak phone, a browser lacking a needed WASM feature), the loader posts an error message that nothing acts on, and the promise the app is waiting on **never resolves or rejects**. The worklet then outputs silence forever, while the UI looks like it started normally.
*(`public/braids-worklet.js:66-73`, `src/audio/engines/BraidsEngine.ts:64-71`)*

**Why it matters.** "Silent and frozen with no error" is the worst failure mode — indistinguishable from "the app is broken," with no clue for you or a future user about what went wrong. It will happen to *someone* (some phone, some browser).

**Fix.** Make the "ready" wait in `BraidsEngine.init` race against a timeout, so a stuck load rejects after a few seconds; and have the worklet's error path actually propagate (surface a visible "audio engine failed to load — reload" state, reusing the error UI that already exists in `TapToStart`). **Effort:** small.

### [P0 — CRITICAL] 3. Stop stuck notes on focus loss
**Problem.** Hold a note key on the computer keyboard, then Alt-Tab to another app (or click the browser's address bar, or trigger a browser shortcut that steals focus), and release the key. The key-release event is delivered to *the other app*, never to Parallax — so the note is never told to stop. It droning forever, with no UI control to silence it short of reloading. A related, simpler version: hold a note, press `]` to shift octave, release — the release computes a *different* note number than the one that started, so the original keeps sounding.
*(`src/ui/KeyboardHarness.svelte`)*

**Why it matters.** A permanently stuck tone from an everyday gesture (Alt-Tab) is the kind of bug that makes an instrument feel unreliable and a little alarming. It's a hardware analogy to a relay that energizes but never releases.

**Fix.** On mount, listen for `window` `blur` and `visibilitychange` and call `allNotesOff()` (clearing the held-notes set). Track the *actual* MIDI number assigned at key-down (keyed by the physical key code) and release exactly that on key-up, regardless of the current octave. **Effort:** small.

### [P1 — IMPORTANT] 4. Define the two missing CSS colour tokens
**Problem.** The new model picker styles its search box, its scrolling list, and — most importantly — the **highlight bar behind the currently-selected model** using two colour variables, `--surface-sunken` and `--signal-deep`, that are **defined nowhere** in any of the three themes. An undefined CSS variable with no fallback paints *nothing* (transparent). So the selected-model highlight is invisible, and "which of 47 models am I on?" collapses onto a single tiny `▸` arrow glyph.
*(`src/ui/ModelPicker.svelte:168,186,213` — fix in `src/ui/themes/tokens.css`)*

**Why it matters.** This directly undercuts your hard colour-blindness requirement: the selected state was *supposed* to combine a filled bar (brightness cue) with the glyph; with the fill gone, it leans more on a faint colour shift, which is exactly what you can't rely on. It also just looks unfinished.

**Fix.** Add `--surface-sunken` (slightly darker than each theme's background) and `--signal-deep` (a low-opacity wash of each theme's signal colour) to all three theme blocks. Consider also adding a left-edge accent bar or bolder weight to the selected row so it survives even a subtle fill. **Effort:** ~10 min — then **eyeball it in a browser** (per your project rule for visual changes).

### [P1 — IMPORTANT] 5. Make the engine bit-accurate to the firmware (authenticity pass)
**Problem.** Three deviations from the real Braids DSP, all in `dsp/shim/braids_shim.cc`:
- **Lo-fi chain is in the wrong order.** Real Braids (`dsp/vendor/braids/braids.cc:284-291`) applies the bit-crush *at the sample-and-hold instant*, then runs the SIGN waveshaper **last, on the already-crushed signal**, mixed with a *quadratic* curve. The shim does the reverse — waveshapes the clean signal first, then crushes — and mixes SIGN *linearly*. These sound audibly different and the SIGN knob responds on the wrong taper.
- **Braids' internal AD envelope isn't ported.** The firmware shapes the oscillator with an internal attack-decay envelope that several models (kicks, snares, plucks, bells) *depend on* for their character. The shim has no envelope; release is faked by ramping an output volume node in JavaScript. So ~13 of the 47 models get an unnatural envelope, and percussive models can be hard-cut by the JS release. *(This also drives bug-finding behaviours below.)*
- **DRIFT does nothing.** The control is wired through the UI but the engine stores the value and never reads it (`braids_shim.cc:120-125`). Authentic drift is slow VCO pitch wander.

**Why it matters.** Your guiding principle is *authentic substance first*. Today the engine is "authentic enough to sound great" (you verified by ear); these are the items between that and "bit-accurate to the hardware." They also matter because the M4 explain panel will eventually *describe* behaviours the engine doesn't quite reproduce.

**Fix.** Reorder the per-sample loop to match `braids.cc` (mask-on-hold → gain → quadratic SIGN mix); expose and gate Braids' AD envelope from the shim (this also fixes the percussion-release bug in §4 of the bug list); implement DRIFT as slow random pitch modulation, or remove the stub until you do. Rebuild the WASM and re-listen. **Effort:** ~half-day total + a WASM rebuild.

### [P1 — IMPORTANT] 6. Audio reliability: resume on return, smooth the envelope ramps
- **Auto-resume.** Mobile browsers suspend audio when you switch tabs/apps; on return, the context stays suspended and everything is silent with no indication (the footer still cheerfully reads "audio ● READY"). Add a `visibilitychange` handler that calls `ctx.resume()`. *(`src/audio/AudioEngine.ts`)* **Effort:** small.
- **Envelope ramp anchoring.** Every note's attack/release ramp pins its starting point to the volume's value *right now* even when the note is scheduled for a *future* time — which is exactly how the M3 sequencer will schedule notes. The result is a click. Even today, a fast trill re-anchors mid-ramp and zippers. Use `cancelAndHoldAtTime` instead of the cancel-then-reset pattern. *(`src/audio/engines/BraidsEngine.ts:104-119`)* **Effort:** small-medium. Worth doing before M3.

### [P1 — IMPORTANT] 7. The control panel's ergonomics and the knob decision
- **Decide knob vs slider, and say which shipped.** The signature vertical-drag **Knob is parked** — commented out of `ParamPanel` in favour of native sliders, with an in-code note that knobs "eat too much vertical space." That's a legitimate layout call, but right now the commit history and hand-off describe an "auto-knob panel" that users won't see. Either ship the knob in a compact/horizontal form (the code is written and its keyboard/touch/ARIA support is excellent) or formally defer it — and correct the wording. *(`src/ui/ParamPanel.svelte:5-9,103-120`, `src/ui/Knob.svelte`)*
- **Model picker has no keyboard navigation.** You can't type "vow", arrow down, and hit Enter — there's no arrow/Enter/Escape handling on the list. For a keyboard-first user this breaks exactly where it should shine. *(`src/ui/ModelPicker.svelte`)*
- **Mobile is not playable or comfortable yet.** There is *no on-screen way to play a note* (the only input is the computer keyboard), so a phone — which the north star explicitly targets — can't make sound at all today. (This is roadmapped: the M3 staff will be a touch surface. But a minimal tappable note strip is a cheap interim.) On top of that, touch targets (steppers ~32px, the SCOPE/SPECTRUM buttons ~20px, native slider thumbs) are below the ~44px reliable-finger minimum, and there's no mobile bottom-sheet for the 47-model list. **Effort:** the keyboard-nav and target-size fixes are small; an interim note strip is small-medium; the full mobile pass is M3/M5.

### [P1 — IMPORTANT] 8. Make the hero actually glow, and fix the contrast misses
- **The scope's "glow" is faked.** The oscilloscope draws its trace twice (a wide semi-transparent stroke under a thin core) to imply a halo — but that's a hard-edged thick line, not the soft radial bloom a real CRT emits. Ironically the *new* Spectrum view does it correctly with real `shadowBlur`. The brief makes the scope "the visual hero… glows like a CRT against matte black"; right now it's competent, not luminous. *(`src/viz/Oscilloscope.svelte:143-148`)* (Trade-off: `shadowBlur` is one of the more expensive canvas operations, so apply it tastefully to the core trace and gate it for low-power/reduced-motion — see efficiency notes.)
- **"Subtle grain" is missing entirely.** A named part of the Lab Instrument identity; without it the large near-black panels read as a flat developer dashboard rather than matte equipment.
- **Contrast failures on small text.** `--text-dim` is ~3.3:1 against the background in all three themes (the guideline floor for small text is 4.5:1); it's used for region labels, the model index, group labels, family tags. K.O. Console's orange signal colour is 2.48:1 on its light body — and it's used for the *active value*, the very thing the eye should catch. For a reader who is colour-blind, low luminance contrast is the axis you're *most* sensitive to, and this is your own stated WCAG-AA requirement. *(`src/ui/themes/tokens.css`)*

**Fix.** Real bloom on the scope core (gated), add a low-opacity grain layer, and lift `--text-dim` to ~4.6:1 in each theme plus a darker "ink" orange for K.O. text. **Effort:** ~2-3 hrs total; verify in browser.

### [P1 — IMPORTANT] 9. Stop the lo-fi sliders from flooding the audio thread
**Problem.** Dragging the BITS / RATE / SIGN / DRIFT sliders fires a cross-thread message to the audio engine on *every pixel of movement* — easily 30-60+ messages per second, each a serialized hand-off onto the one thread that must never miss its real-time deadline. *(`src/ui/ParamPanel.svelte` → `src/audio/engines/BraidsEngine.ts:208-219`)*

**Why it matters.** A missed audio deadline is an audible click. On a weak phone, spamming the audio thread while dragging is exactly what nudges it toward a glitch. (The smooth params — timbre/color/fm — are fine; they use the correct sample-accurate path. Only these four discrete "message" params flood.)

**Fix.** Coalesce the message-type params to at most one update per animation frame, or commit them on pointer-up. **Effort:** ~30 min.

### [P1 — IMPORTANT] 10. Give the resting scope a pulse
**Problem.** When nothing is playing, the oscilloscope draws a **dead flat horizontal line**. A previous fix removed an idle "heartbeat" because a *drifting* sine "read as a glitch" — the right call on that execution, but it threw out the whole idea. The plan names this beat explicitly: "idle heartbeat… so it always feels alive." *(`src/viz/Oscilloscope.svelte:114-126`)*

**Why it matters.** This is a *personal* instrument; the gap between phrases is most of the time it's on screen, and right now the hero element looks *off* at rest. A real scope at idle isn't dead — it breathes. This is the single highest-leverage, lowest-cost character moment in the app.

**Fix.** Keep the line *stationary* (that's what fixed the glitch read) but animate only its opacity/glow-width on a slow ~4 s cycle; optionally a faint beam dot sweeping left→right. Gate on `prefers-reduced-motion`. **Effort:** ~20-40 min.

---

## 3. Vision & originality

**Where this is genuinely original.** The concept is strong precisely where it leans into Braids' own nature rather than generic "web synth toy" tropes:

- **The explain panel as the soul of the app.** TIMBRE and COLOR are meaningless without context — their effect *changes per model* — and almost no tool teaches this well. Treating a per-model, self-rewriting explanation (paired with a "show me" auto-sweep so the instrument demonstrates itself on the scope) as the *centre* of the product, not a help tooltip, is a legitimately fresh idea. The seed data for it — a faithful, concrete 47-model table of what each knob *does* per model — is already written and is one of the best things in the codebase.
- **An authentic, un-placeholdered firmware port in the browser.** Browser synths are common; faithful ports of a specific revered hardware oscillator running its *actual* DSP in an audio worklet are rare. This is the technically hard, genuinely uncommon achievement.
- **The "patch postcard"** (deferred to M5) — turning a sound into a shareable *image* of its own waveform — is a lovely, uncommon artifact idea that composes naturally with the planned share-URLs.

**Where it's derivative — honestly.** The three themes (Mutable's lab aesthetic / Teenage Engineering's playful orange / vintage CRT phosphor) are competent, well-differentiated *homage* rather than invention. The current control surface — sliders, a stepper-plus-search picker — is conventional and utilitarian; the one genuinely distinctive interaction (the vertical-drag detented knob) is parked in a comment, so the live surface reads "sleek and safe" with its personality sitting unused (including a defined-but-never-applied "spring" motion token). One small, smart originality *is* shipped: the picker's search matches on the *description* text too, so you can "type a vibe, find a model."

**Net:** a visionary concept wrapped around an authentic engine, with the *distinctive feel* (a luminous scope, tactile motion, the knob, the explain panel) still ahead of it. The most original ideas live in the engine's authenticity and the explain-panel concept; the most derivative parts are the theme styling and the slider/picker controls. Close the gap between the designed identity and the built one, and this crosses from "nicely themed" into genuinely distinctive.

---

## 4. Additional findings & suggestions ([P2] / [P3])

**Security & hygiene** *(the security review came back unusually clean — see appendix; these are forward-looking hardening, nothing is on fire):*
- **[P2]** No Content-Security-Policy. For a static site this is the single highest-leverage defense-in-depth: add a `public/_headers` file (Cloudflare Pages serves it verbatim) before launch, especially as M3-M5 add the share-URL and more UI. ~30 min.
- **[P2]** Fonts load from Google's CDN — a privacy leak (every visitor's browser pings Google) and your only off-origin dependency. Self-host the three fonts; it also makes the offline PWA (M5) work and lets the CSP collapse to "self." ~30-45 min.
- **[P2]** When you build the share-URL (M4), treat the `#hash` as hostile input: cap its length, wrap decompress/parse in try/catch, and **validate** the parsed object against the parameter schema before applying it (don't spread untrusted JSON into state). The `version` field already on the patch is the right hook. Note the rule now; ~1-2 hr when built.
- **[P3]** Add a commit-time secret guard (`git-secrets`/`gitleaks`) given how often you juggle API keys. History is clean today; this keeps it that way. ~20 min.
- **[P3]** The dev server binds all network interfaces (`0.0.0.0`). It's dev-only (no production exposure), but on untrusted Wi-Fi prefer running it only on trusted networks or binding the Tailscale interface specifically.

**Efficiency** *(the realtime audio path is excellent — allocation-free, tiny ~101 KB-gzipped bundle, no heavy libraries loaded yet; these are the leftovers):*
- **[P2]** Both visualizers re-read CSS theme colours via `getComputedStyle` **6× per frame** (~360 style reads/sec) for values that change only when you switch themes; they also re-fetch the canvas context every frame. Read once, cache, refresh on theme change. Fix both viz files together. *(`Oscilloscope.svelte`, `Spectrum.svelte`)*
- **[P2]** The scope's render loop keeps running when the tab is merely defocused-but-visible or scrolled off-screen. Gate it on visibility. (Also: neither visualizer honours `prefers-reduced-motion`.)
- **[P2]** The scope walks the whole sample buffer twice per frame (once to find the trigger, once to detect silence); fold the silence check into the trigger scan.
- **[P3]** `shadowBlur` on the spectrum's 56 bars is the heaviest per-frame op, though it's correctly skipped when silent and batched — revisit only if you see frame drops on mobile.

**Bugs / robustness** *(beyond the [P0]/[P1] ones above):*
- **[P2]** Pitch-bend isn't re-applied after a new note (the next note overwrites it). Latent — no bend UI yet, but the API is wrong. *(`BraidsEngine.ts:134-139`)*
- **[P2]** A failed engine load leaks the half-built audio node and its message listener (compounds the [P0] hang). Wrap init in try/catch that disposes a partial engine. *(`AudioEngine.ts:50`)*
- **[P2]** The scope can compute a zero/negative display window for very low-frequency or near-DC signals, producing an odd/flat frame. Clamp the window to ≥1. *(`Oscilloscope.svelte:104-140`)*
- **[P2]** "Panic"/all-notes-off won't reliably kill notes scheduled in the *future* (matters once the M3 sequencer exists). *(`BraidsEngine.ts:124-132`)*
- **[P2]** Hot-swap between engines tears down the old engine's volume node mid-release-ramp (click) and has a re-entrancy window if called twice quickly. Latent until a 2nd engine exists. *(`AudioEngine.ts:47-62`)*
- **[P3]** The ring buffer is sized for ~16 ms of headroom but the drain logic keeps it at one block, so the buffering the comment promises doesn't exist (not a live defect — a misleading comment + dead capacity). *(`braids-worklet.js:16,124-141`)*
- **[P3]** Several `catch {}` blocks swallow disconnect errors silently; a `console.debug` would make the failures above easier to diagnose.

**Architecture / state**
- **[P2]** The central stores (`patchStore`, `engineIdStore`) that are supposed to be the "single source of truth" are **defined but not wired** — the picker and panel keep their own local copies and talk to the engine directly. The plan's promise that undo / presets / share-URLs "fall out for free" only becomes true once the controls write through the store. Do this as the first step of M3, before the local-state pattern spreads. *(`src/state/stores.ts`)*
- **[P3]** Hot-swap is implemented and there are two real engines behind the interface, but the app only ever loads one and there's no `registry.ts` — so the hot-swap promise is structurally real but never exercised at runtime. A tiny dev toggle would prove it.

**Visual / polish**
- **[P2]** The "spring" motion token (`--t-spring`) is defined in all three themes and used **nowhere** — the tactile overshoot the brief wanted is entirely unrealized. Apply it to *one* high-touch moment (the model code-pill changing on prev/next) for a near-free tactile lift.
- **[P2]** `public/icons.svg` is a leftover starter-template sprite of social-media icons in off-brand purple — referenced nowhere. Delete it. (Good news: the *favicon* was already corrected to the on-brand teal scope-wave during the M2 work — nice mark.)
- **[P3]** The top-bar logo is a generic Unicode half-circle `◐`; inline the favicon's bespoke wave instead so the mark matches.
- **[P3]** `dist/` (the build output) is tracked and now stale; add it to `.gitignore` and rebuild before any deploy.

**Delight** *(small, in-scope-now character wins):*
- **[P3]** A scope "boot" sweep on audio-unlock (you already play a confirmation A440 there — draw during it) turns the mandatory tap-to-start click into a small reward.
- **[P3]** A brief glow-pulse on the scope/code-pill when you change models — cycling the 47 models is the *joy* of Braids and currently feels like changing a dropdown.
- **[P3]** A `%c`-styled console boot banner ("Parallax — based on Mutable Instruments Braids (MIT) · made for noodling") — pure personality, ~10 min, and you're the audience.

---

## 5. Flourishes (level-up ideas)

Three concrete ways to push from good to memorable, chosen to fit *this* project and north star.

1. **The breathing scope + boot sweep (do this now).** Make the idle oscilloscope alive — a stationary baseline that breathes in brightness/glow, plus a one-time energizing sweep when audio unlocks, synced to the confirmation note that already plays. *Why it fits:* the scope is the hero and the thing you'll stare at most; a resting state that's visibly alive is the cheapest, most on-brand soul this project can buy. *Impact:* high (it's the first and last thing you see). *Effort:* ~½ day including the bloom work from §2.8. Colour-blind-safe by construction (brightness only).

2. **The self-teaching "show me" sweep (M4, but design it in now).** A button that auto-sweeps TIMBRE (or COLOR) across its full range over ~2 seconds while the scope, spectrum, and the explain-panel diagram move together — the instrument demonstrating *itself*. *Why it fits:* it's the literal embodiment of the explain-panel thesis and the most original delight beat in the whole plan; the per-model data to drive it is already written. *Impact:* high — it's the feature that would make people *show this to someone else*. *Effort:* ~1 day on top of M4.

3. **The patch postcard (M5).** Export the current scope trace + 4-char model code + key parameters as a single shareable PNG "postcard" of your sound. *Why it fits:* it turns an ephemeral patch into an artifact, composes directly with the M5 share-URL work, and is genuinely uncommon. *Impact:* medium-high (it's your organic-sharing hook). *Effort:* ~½ day when M5 lands.

---

## 6. Concrete next steps (a sequenced checklist)

A practical order — safety and reliability first, then authenticity, then feel, then forward wiring.

1. **Move the repo out of Google Drive** (or exclude it from sync); confirm `node_modules` is regenerated locally, not synced. *(§2.1)*
2. **Define `--surface-sunken` / `--signal-deep`** in all three themes and eyeball the picker in a browser. *(§2.4)* — quick, visible win.
3. **Audio reliability batch:** WASM-load timeout/error surfacing; `window` blur/visibilitychange → all-notes-off; AudioContext resume on return; track held-note MIDI by key code. *(§2.2, §2.3, §2.6)*
4. **Decide the knob:** ship it compact or formally defer it, and correct the "auto-knob" wording in docs/commit history. *(§2.7)*
5. **Authenticity pass in the shim:** reorder the lo-fi chain, port + gate the AD envelope, implement or remove DRIFT; rebuild WASM; re-listen against the module/VCV reference. *(§2.5)*
6. **Coalesce the lo-fi `postMessage` flood.** *(§2.9)*
7. **Picker keyboard nav + ≥44px touch targets + an interim tappable note strip for phone.** *(§2.7)*
8. **Design-toward-stellar:** real (gated) scope bloom + breathing idle + boot sweep; subtle grain; fix `--text-dim` and K.O. orange contrast; apply `--t-spring` on model change. *(§2.8, §2.10, §5.1)*
9. **Hygiene:** add a CSP `_headers`, self-host fonts, delete `icons.svg`, gitignore `dist/`, optional git-secrets hook. *(§4)*
10. **Wire the central stores** as the first move of M3, so share-URLs/presets/undo fall out for free. *(§4)*
11. **Re-verify the whole thing in a browser** (your project rule for visual changes), then tag **`v0.3.0-m2`**.

---

## 7. Appendix — per-dimension summaries

> These are the seven reviewers' verdicts, lightly consolidated. Where the first pass examined UI files that M2 then replaced, the verdict reflects the **current committed code** (the second-wave re-check).

### Security — *health: genuinely clean for this stage; nothing on fire.*
Zero committed secrets across all of git history (scanned every commit for keys/tokens/private blocks — only false positives like the word "token" in "CSS tokens"). `npm audit`: **0 vulnerabilities** across 474 packages (only ~58 reach production); bleeding-edge versions are current releases, not sketchy pre-releases. No dangerous DOM sinks anywhere (no `{@html}`, `eval`, `innerHTML`); the one storage read validates against an allow-list; all text interpolation is auto-escaped by Svelte. The worklet message channel only carries self-originated, integer-coerced, range-clamped data. No PII or clinical data — only a theme name in localStorage. Production build ships no source maps; `.gitignore` is correct. **Forward-looking:** add a CSP, self-host fonts, and bake in safe share-URL deserialization before M4/M5. *Standout:* defensive-by-construction at every trust boundary; versioned state from day one. *Original:* the hand-rolled WASM loader is the one bespoke surface — clever and not a vulnerability, but you now own that loading path.

### Efficiency — *health: excellent for M1/M2.*
The realtime audio path is textbook **allocation-free** — `process()` creates zero objects, the resampler uses a fixed phase accumulator over two retained samples, and all lo-fi DSP happens in one C++ call over the whole block. Bundle is genuinely tiny (~75 KB JS + 14 KB CSS + 98 KB WASM ≈ **101 KB gzipped** cold load); Tone.js/tonal/midi are declared but imported nowhere, so they're tree-shaken to zero, and M2 added no heavy deps. The **dual-rAF footgun was avoided** — only one visualizer mounts at a time. *Leftovers:* the lo-fi-slider `postMessage` flood ([P1]); `getComputedStyle`/`getContext` per frame in both viz; scope loop doesn't pause when hidden; scope double-pass for silence. *Standout:* the WASM-loading strategy and the JS-gain-as-noteOff adaptation are clean, hard-won solutions.

### User Interface & Experience — *health: tasteful bones, real mobile/loading gaps.*
The colour-blind discipline, typography, and the oscilloscope already read as a real instrument. But: **no on-screen way to play on a phone** (keyboard-only) against a north star that names phone support; **no loading/error state** in the main app while the engine loads or if audio dies after backgrounding (the footer says "READY" while silent); **picker has no keyboard navigation**; **touch targets below 44px**; the tap-to-start modal doesn't trap focus. *Standout:* the audio-status and theme cues pair glyph+text+weight (not colour); the recent focus-fix generalizes well; tap-to-start explains *why* it needs a click and plays a confirmation tone. *Original:* the per-model explain-panel concept is genuinely novel; the current controls are conventional and "catching up to the vision."

### Visual & Art Design — *health: promising, already above "fine," but not yet stellar.*
One coherent token system with **all three themes fully realized** (not stubs — including per-theme type stacks and label casing). **Colour-blind discipline is exemplary** and the best-executed thing here. The 4-char model-code system is authentic and typographically justified; fonts are properly wired with fluid sizing and tabular figures; the new favicon is a smart on-concept mark. *Gaps:* the two undefined tokens ([P1]); the hero scope's glow is faked rather than real bloom ([P1]); "subtle grain" is missing ([P1]); `--text-dim` and K.O. orange fail contrast ([P1]); the spring motion token is unused; a dead off-brand `icons.svg` lingers. *Verdict:* the identity is *designed* but not yet fully *built* — close the bloom/grain/contrast/motion items and it becomes genuinely distinctive.

### Delight — *health: quietly well-crafted; the playful soul isn't switched on yet.*
The scope has real phosphor craft (persistence, two-pass glow, hysteresis triggering, per-theme tuning, scanlines on Phosphor) and the model descriptions have genuine *voice* ("the iconic boom," "sits between musical and broken"). Accessibility-as-character is handled with care. *But:* the idle scope is a **dead flat line** ([P1] — the highest-leverage cheap win), there's no startup beat, no feedback on model change or note-on (the "active note" colour token is defined but unused), and **no easter eggs** (which you explicitly love) — confirmed by full-source search. *Original:* the explain-panel "show me" sweep and the patch postcard are the standout ideas, both deferred but seeded.

### Effectiveness — *health: on track, impressively so.*
**The core bet landed:** the engine is the *authentic* Braids — real vendored MIT DSP, the real `MacroOscillator`, all 47 models correctly ordered against the firmware enum, rendered at 96 kHz and resampled, with the lo-fi grit present. The `ISynthEngine` seam is clean and MIDI-based; hot-swap is implemented; the context-aware schema mechanism the explain panel needs is in place; and **M2 proved the architecture** by adding a fully schema-driven control panel with zero engine changes and zero Braids-string leakage. *Honest caveats:* the lo-fi chain order, the un-ported AD envelope, the no-op DRIFT ([P1]/[P2] authenticity), and the central stores being defined-but-unwired ([P2]). *Bottom line:* **yes — it's becoming the thing the plan describes, and the foundation is sound.** The caveats are the distance between "authentic enough to sound great" (achieved) and "bit-accurate to the hardware" (a focused pass away).

### Bugs — *health: careful foundation with two critical reliability holes.*
Two **[P0]**: the silent-forever WASM-load hang, and stuck notes on focus loss. Several **[P1]**: envelope ramps that click on future-scheduled/retriggered notes, no audio resume after backgrounding, hot-swap cutting the release ramp, and noteOff not gating the firmware envelope (percussion rings). **[P2]**: pitch-bend not re-baselined, octave-shift-while-held stranding notes, init-failure leak, a degenerate scope frame on near-DC signals, unreliable future-note panic. *Standout:* MIDI→pitch quantization is correct and clamped on both sides; the "ready" gate closes most of the init-race surface; the ring-buffer arithmetic is correct; the typeahead-hijack stuck-note class is genuinely closed. *Original/fragile:* the cleverness (WASM bootstrap, JS-gain-as-noteOff) is also where the fragility concentrates — the dead reject-path and the faked envelope are the roots of several findings.

---

*Read-only review. No source files were modified by the review itself; the only writes this session were committing/pushing the recovered M2 work (`d6389c8`) and creating this report.*
