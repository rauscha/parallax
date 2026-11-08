---
target: the explain loop (knob → card → Show me → prose)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/andrew/repos/parallax/src/ui/ExplainPanel.svelte"
target_fingerprint: "sha256:ed3c7b31a3e840b266b9e04ad428bc94f91030ccd53bd9957d6e83bead23b487"
target_path: /home/andrew/repos/parallax/src/ui/ExplainPanel.svelte
timestamp: 2026-11-08T00-03-24Z
slug: src-ui-explainpanel-svelte
---
Method: dual-agent (A: design review · B: detector + headless browser overlay, CSP bypassed in test context)

## Design Health Score — 25/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Knob turn with nothing playing is silent, scope flat; on phone the lit card is ~530px below the knob |
| 2 | Match System / Real World | 3 | Hardware vocabulary good; values as 0.50 / 50%, never as the positions the prose uses |
| 3 | User Control and Freedom | 3 | Stop, restore, double-click reset, undo all solid |
| 4 | Consistency and Standards | 2 | Rings card order Str/Bri/Dam/Pos vs knobs Str/Bri/Pos/Dam; decimals vs percent; "0.00semi" |
| 5 | Error Prevention | 3 | Sweep interrupt/restore careful; Show me disabled until audio ready |
| 6 | Recognition Rather Than Recall | 2 | Card↔knob mapped across the screen; 8 of 10 Braids knobs explain nothing |
| 7 | Flexibility and Efficiency | 2 | 47 tab stops from model list to knob; no key for Show me |
| 8 | Aesthetic and Minimalist Design | 3 | ~110px empty under cards at 1440×900, clipped at 1280×720 |
| 9 | Error Recovery | 2 | Show me on Rings fails silently (one dead strike under a sweeping knob) |
| 10 | Help and Documentation | 3 | Corpus excellent; nothing teaches the loop itself |

## Design Specificity Verdict
Content specific, form generic. Dashboard composition (controls right, text cards left), joined only by a shared highlight. Cards are text + button + percent: no dial, no range, no position. The product's most original idea rests on its weakest link.

Detector: ExplainPanel/Knob/ParamPanel clean. App.svelte 8 raw 0.7rem/0.72rem sizes (L268, 289, 367, 397, 469, 549, 555, 560), 66 across src/; on phone these render 10.3–10.6px, under the 11px floor (real). Phosphor --label-tracking 0.08em inherited from body (base.css:26) into all prose (wide-tracking). Active card text 4.3:1 (--text-dim on .card.active wash, ExplainPanel.svelte:172). False positives: scanlines, phosphor knob glow, Bravura font, detector's own overlay labels.

## Priority Issues
1. [P1] Knob turn silent from cold start. Fix: audition on touch using Show me's demo-note/ownsNote logic. /impeccable onboard
2. [P1] Card prose static per model (types.ts:74 knob.text); "where it sits" is a bare percent. Fix: 3–5 value bands per knob meaning + range ruler with band ticks and needle. /impeccable shape, /impeccable clarify
3. [P1] Show me on struck sounds (Rings; Braids KICK/SNAR/CYMB/PLUK/BELL) strikes once then sweeps 2.6s (show-me.ts:164): demonstrates nothing. Fix: struck/sustained flag; stepped re-strike sweep at 0/25/50/75/100. /impeccable harden
4. [P2] Link ends rarely share the screen (phone ~530px; 1280×720 Rings 4th card + Show me below fold). Fix: sticky engaged-knob strip on phone; mini dial in card header on desktop. /impeccable adapt, /impeccable layout
5. [P2] Dead-end knobs (FM, Attack, Release, Bits, Rate, Sign, Drift, Gain; 32 unused param descriptions in src/audio/engines) and core prose in --text-dim while Surprise is brightest. Fix: context card for non-macro knobs; raise prose level. /impeccable clarify, /impeccable typeset

## Persona Red Flags
Jordan: no cue to turn a knob or try Show me; silent turn; Listen-for names knobs before Jordan finds them; Surprise is brightest; offline toast over first run.
Sam: card link pointer-only (ExplainPanel.svelte:109); no aria-describedby knob→prose; Show me 11 tab stops after knobs; model list 47 stops.
M8 owner: no hardware-unit readout (hex 00–FF claim unverified); Bits/Rate/Sign/Drift unexplained; Show me never names the value where the character appears; percussive Show me misleads.

## Minor Observations
0.01s for 5ms attack; ParamPanel.svelte:70-84 dead code. Sandbox arc lighter than track in grayscale (needle saves it). Hover/turn/sweep card states identical. TIMBRE vs Timbre case. Stale ExplainPanel header comment (9–12). Stale Flowsheet ignore in .impeccable/config.json. Possible sticky lit card after engine swap on phone.

## Questions to Consider
1. Should the macro knobs move into the Explain cards?
2. Should Show me end on the most demonstrative value with a before/after scope pair?
3. Is "where it sits" a number, or a position on a ruler the prose names?
