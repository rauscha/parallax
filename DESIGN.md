---
name: Parallax
description: A browser instrument that runs real synthesis engines and explains them while you play. Four skins, one per engine, on one shared chassis.
colors:
  # Phosphor: the Braids skin, and the landing theme.
  phosphor-bg: "#0A0805"
  phosphor-surface: "#100C07"
  phosphor-surface-raised: "#15110A"
  phosphor-surface-sunken: "#070503"
  phosphor-hairline: "#2C2418"
  phosphor-text: "#D5E6CC"
  phosphor-text-muted: "#8FA682"
  phosphor-text-dim: "#7D9A6F"
  phosphor-signal: "#7DFF6B"
  phosphor-signal-deep: "rgba(125, 255, 107, 0.18)"
  phosphor-accent: "#FFB347"
  phosphor-danger: "#FF6B5C"
  phosphor-scope-bg: "#050402"
  # Sandbox: the Plaits skin. The one light body.
  sandbox-bg: "#E9E5DC"
  sandbox-surface: "#DAD4C7"
  sandbox-surface-raised: "#C9C2B3"
  sandbox-surface-sunken: "#CFC8B8"
  sandbox-hairline: "#8C8779"
  sandbox-text: "#1A1A1A"
  sandbox-text-muted: "#3A3A3A"
  sandbox-text-dim: "#4D4D4D"
  sandbox-signal: "#FF5A1F"
  sandbox-signal-ink: "#8A2A0A"
  sandbox-signal-deep: "rgba(255, 90, 31, 0.22)"
  sandbox-danger: "#911B11"
  sandbox-scope-bg: "#0D0D0D"
  sandbox-scope-trace: "#FF8A4F"
  # Lab: the Laxsynth skin. Also the :root fallback.
  lab-bg: "#24232B"
  lab-surface: "#2D2C35"
  lab-surface-raised: "#383640"
  lab-surface-sunken: "#1C1B22"
  lab-hairline: "#46434F"
  lab-text: "#ECEAF2"
  lab-text-muted: "#C2BECE"
  lab-text-dim: "#A8A4B4"
  lab-signal: "#4FD6C4"
  lab-signal-ink: "#6FE6D6"
  lab-signal-deep: "rgba(79, 214, 196, 0.18)"
  lab-accent: "#F4C45A"
  lab-danger: "#FF7A7A"
  lab-scope-bg: "#17161C"
  # Rings ("Soundboard"): the Rings skin.
  rings-bg: "#221A13"
  rings-surface: "#2B2118"
  rings-surface-raised: "#362A1E"
  rings-surface-sunken: "#1B140E"
  rings-hairline: "#4A3B2A"
  rings-text: "#F2E9DB"
  rings-text-muted: "#C9B99F"
  rings-text-dim: "#A89877"
  rings-signal: "#E3A94C"
  rings-signal-deep: "rgba(227, 169, 76, 0.16)"
  rings-accent: "#E77E52"
  rings-danger: "#FF8A70"
  rings-scope-bg: "#140E08"
  rings-scope-trace: "#FFC46B"
typography:
  wordmark:
    fontFamily: "Space Grotesk, system-ui, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  model-code:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "1.1rem"
    fontWeight: 600
    letterSpacing: "0.05em"
  model-name:
    fontFamily: "Space Grotesk, system-ui, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 500
  prose:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "max(13px, 0.8rem)"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Inter, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "max(11px, 0.7rem)"
    fontWeight: 400
    letterSpacing: "0.1em"
  readout:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "max(11px, 0.7rem)"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  hairline: "1px"
  tight: "4px"
  sm: "8px"
  md: "12px"
  region-y: "14px"
  region-x: "18px"
components:
  button-signal:
    backgroundColor: "{colors.phosphor-signal}"
    textColor: "{colors.phosphor-bg}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-tool:
    backgroundColor: "{colors.phosphor-surface-raised}"
    textColor: "{colors.phosphor-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  segmented-option:
    backgroundColor: "{colors.phosphor-surface-sunken}"
    textColor: "{colors.phosphor-text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  segmented-option-selected:
    backgroundColor: "{colors.phosphor-signal-deep}"
    textColor: "{colors.phosphor-signal}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  model-row:
    backgroundColor: "{colors.phosphor-surface-sunken}"
    textColor: "{colors.phosphor-text-muted}"
    padding: "5px 10px"
  model-row-selected:
    backgroundColor: "{colors.phosphor-signal-deep}"
    textColor: "{colors.phosphor-text}"
    padding: "5px 10px"
  explain-card:
    backgroundColor: "{colors.phosphor-surface-sunken}"
    textColor: "{colors.phosphor-text-dim}"
    typography: "{typography.prose}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  explain-card-active:
    backgroundColor: "{colors.phosphor-signal-deep}"
    textColor: "{colors.phosphor-text-dim}"
    rounded: "{rounded.sm}"
  input-search:
    backgroundColor: "{colors.phosphor-surface-sunken}"
    textColor: "{colors.phosphor-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
---

# Design System: Parallax

## Overview

**Creative North Star: "The Open Panel"**

Parallax is an instrument with its cover off. While it plays, you can see what each part does: the prose under a knob rewrites itself as you turn it, the scope shows what changed, and Show me performs the control for you. The visual system exists to keep that loop legible. Nothing decorative competes with a readout, and nothing a learner needs is hidden behind a hover.

The mood is a bench instrument: precise, quiet, legible under work light. Panels are flat and divided by hairlines; corners are barely rounded; type is mostly monospaced because most of what it sets is a measurement, a code or a label. Each engine wears its own skin (a phosphor CRT for Braids, a light hardware body for Plaits, a grey console for Laxsynth, a walnut soundboard for Rings), and the skin changes when the engine does. Character comes from the skin; the chassis underneath, with its layout, components, type roles and token names, is the same for all four.

Color is held back until something is live. Idle controls sit in muted text inside hairline outlines; the signal color appears on what is selected, sounding or being turned, and always alongside a second cue a colorblind eye can read.

**Key Characteristics:**
- Four skins on one shared token schema; the skin follows the engine, never a manual switch.
- Flat panels separated by 1px hairline gaps and small tonal steps; shadows only on things that float.
- Monospace for labels, codes, readouts and the Explain prose; a grotesque for names and the wordmark.
- The scope is always a dark screen set into the body, even on the light Sandbox skin.
- Every state survives desaturation: weight, a ▸ marker, an outline or a label carries it, and color only reinforces.

## Colors

Each skin is a complete palette on the same schema: a surface tier (bg, surface, raised, sunken), a hairline, three text levels, one signal, an accent, a danger color and a scope screen. Components read only the semantic names, so a component written once looks native in all four skins.

### Primary
- **Phosphor Trace** (phosphor-signal): the Braids skin's signal. The scope trace, knob fills, selected engine and model, the Surprise button. Bright enough to be text on its dark body, so it doubles as its own ink.
- **Hot Signal** (sandbox-signal): the Plaits skin's signal. A fill and trace color only: at 2.5:1 on the light body it is never used for text. Lettering that wants the signal uses **Rust Ink** (sandbox-signal-ink) instead.
- **Console Signal** (lab-signal): the Laxsynth skin's signal, with a brighter **Console Ink** (lab-signal-ink) for text on the dark grey body.
- **Brass** (rings-signal): the Rings skin's signal, text-safe on walnut. The scope trace is a step brighter still (**Lit Brass**, rings-scope-trace) so the trace reads by luminance alone.

### Secondary
- **Amber** (phosphor-accent), **Gold** (lab-accent), **Ember Copper** (rings-accent): a secondary signal for the active note and record-type states. Sandbox uses charcoal as its accent rather than a second color.

### Neutral
- **Surface tier** (`*-bg`, `*-surface`, `*-surface-raised`, `*-surface-sunken`): bg is the page; surface carries the transport and menus; raised carries buttons and pills; sunken carries inset wells (search field, model list, Explain cards, segmented-control tracks). In the dark skins raised is lighter than bg; in Sandbox raised is darker, like a pressed hardware panel.
- **Hairline** (`*-hairline`): every outline and the 1px gap between regions.
- **Text levels** (`*-text`, `*-text-muted`, `*-text-dim`): primary text, secondary text and quiet labels. All three clear WCAG AA (4.5:1) on all four grounds in every skin; `contrast.test.ts` enforces it and its list of excused pairs is empty.
- **Scope screen** (`*-scope-bg`): the darkest value in each skin. In Sandbox it is near-black inside a light body, on purpose.
- **Danger** (`*-danger`): error text only, AA on every ground.

### Named Rules
**The Second Channel Rule.** No distinction is carried by hue alone. A selected row gets a ▸ marker and an inset bar; a selected pill gets weight and an outline; an engaged knob gets a ring. Test: desaturate the screen; if two states look the same, the design is wrong.

**The Ink and Fill Rule.** `--signal` is for fills, traces and outlines. Text that wants the signal uses `--signal-ink`. In two skins they are the same value; never assume so.

**The Earned Signal Rule.** Idle controls are muted text in a hairline outline. The signal appears on what is selected, sounding or being touched, and goes away when it isn't.

**The No Wash Rule.** Translucent tints (`*-signal-deep`) may back a state that already reads without them, never carry one on their own.

## Typography

**Display Font:** Space Grotesk (with system-ui, Segoe UI)
**Body Font:** Inter (with system-ui, Segoe UI, Roboto)
**Label/Mono Font:** JetBrains Mono (with IBM Plex Mono, ui-monospace)

**Character:** A working instrument's lettering: monospaced for anything measured, coded or labeled, with a grotesque reserved for names. The Phosphor skin swaps both the display and body faces for JetBrains Mono, so the CRT is mono throughout. All three faces are self-hosted variable fonts, loaded through the FontFace API so the offline PWA keeps its real type.

### Hierarchy
- **Wordmark** (600, 1rem): "Parallax" in the header, the page's h1.
- **Model code** (mono 600, 1.1rem, 0.05em tracking): the four-letter code in the model picker (CSAW, MODL), in signal ink. The most-read word on the screen.
- **Model name** (500, 0.95rem): the model's full name under its code.
- **Prose** (mono 400, max(13px, 0.8rem), line-height 1.5): the Explain panel's "Listen for / Good for" notes and the knob cards. Capped at 80ch.
- **Body** (Inter 400, 0.78rem, line-height 1.4): the model's one-line description in the model picker.
- **Label** (mono 400, max(11px, 0.7rem), 0.08–0.1em tracking): region titles (Controls, Explain, Sequencer), group labels, knob labels, toggles, meta lines. Case comes from the skin's `--label-case`: uppercase in Phosphor, lowercase in Sandbox, as written in Lab and Rings.
- **Readout** (mono, tabular figures): knob values, percentages, tempo.

### Named Rules
**The 11px Floor Rule.** No text renders under 11px, on any screen. Two roles in `base.css` hold it: `--fs-label` for labels and readouts, `--fs-prose` for reading text. The floors are absolute, so a phone's smaller root size can't undercut them.

**The Measure Rule.** Reading text stops at 80ch. A wide panel gets empty space, not longer lines.

## Layout

Desktop is a fixed frame that never scrolls as a page: a header, a two-column grid (2fr | 1fr) and a transport bar. The left column stacks the scope, Explain and the sequencer; the right column holds the controls (engine, model, knobs, MIDI) and scrolls on its own. Regions are separated by a 1px hairline gap, padded 14px by 18px.

Explain leads the left column: its row gets the most height (0.8fr scope, 1.8fr Explain, 0.9fr sequencer) so every knob card and its Show me fit on a 1440×900 laptop. Knob cards sit side by side (auto-fit, 220px minimum), directly under the scope, and each macro knob lives inside its card: you turn it, read what it does and watch the picture change in one place. The Controls column keeps only the knobs without a card. Cards come before Listen for / Good for, so on a short screen the model notes are what scroll away. On a phone the order is scope, Explain, Controls, sequencer. When the step grid is showing, the sequencer row grows instead, because the grid fills height and the staff doesn't. If Explain still overflows, its text fades out at the bottom edge while more is hidden.

On phones (720px wide or less, or a touch screen 500px tall or less) the frame becomes one scrolling column: scope, controls, Explain, sequencer. The column is `minmax(0, 1fr)` so nothing can push it past the screen. A touch keyboard docks above the transport; below 560px wide its octave buttons move to a row above the keys so the keys get the full width. Overflow menus open as full-width sheets under the header.

### Named Rules
**The Explain Leads Rule.** When height is scarce, Explain keeps it. The scope has a floor (150px) and the sequencer gives way first.

## Elevation & Depth

The page itself is flat. Depth inside the frame comes from tone (the surface tier) and the 1px hairline, never from shadows: a raised pill is a lighter or darker panel, and an inset well is sunken. Shadows appear only on things that float above the page, and their size says how far above. Two skins add texture: a faint fractal grain over the whole frame (desktop only, off in Phosphor), and scanlines on the Phosphor scope.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 14px 40px rgba(0, 0, 0, 0.36)`): the overflow menu and the Presets, Recent and MIDI panels.
- **Toast** (`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4)`): the offline and Undo messages.
- **Modal** (`box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4–0.5)`): Tap to start, Match and Postcard.
- **Engaged glow** (`box-shadow: 0 0 0 2px var(--signal), 0 0 14px var(--signal-glow)`): a knob being turned or lit from its Explain card. The ring carries the state; the glow only adds to it.

### Named Rules
**The Flat Panel Rule.** Panels never cast shadows. If something in the frame needs to stand forward, give it a tonal step and a hairline.

## Shapes

Corners are barely rounded: 2px for buttons, pills and cards, 4px for wells and the model code plate, 8px for the largest sheets. Outlines are 1px hairlines. The only circles are the knob dials: an arc track, a value arc in the signal color, a needle and a hub, with a small tick at the default position. The scope is a plain rectangle with a centered graticule.

## Components

Every component reads semantic tokens only, so it reskins with the engine. The values below are named by role; the frontmatter shows them resolved in the Phosphor skin.

### Buttons
- **Shape:** gently squared (2px radius), 1px hairline outline.
- **Signal button:** the one filled button, Surprise me. Signal fill, `--on-signal` text, weight 600.
- **Tool buttons:** Match, MIDI, Presets, Recent, Postcard, Share, Export. Raised surface, primary text, label type. Hover lifts brightness 10% and turns the outline to the signal color.
- **Play:** a tool button that fills with the signal while playing (`aria-pressed`).
- **Show me:** a small tool button pinned to the foot of each Explain card. While sweeping it fills with the signal wash and its label changes to "■ Stop", so the state reads without color.
- **Focus:** a 2px signal outline, 2px offset, on everything.
- **Disabled:** 40% opacity, not-allowed cursor.
- **Touch:** at least 36px tall on touch screens, 44px for primary instrument controls.

### Segmented controls
- **Style:** a sunken track holding two to four options (Engine, Scope / Spectrum, Staff / Grid).
- **Selected:** signal fill or wash with an outline and weight 600; idle options are muted text.

### Model list
- **Rows:** a code column and a name, muted at rest, grouped under family headers.
- **Selected:** a signal wash, a 3px inset bar on the left edge, a ▸ marker before the code, and the code in signal ink at weight 600.

### Explain cards
- **Style:** a sunken panel (2px radius, hairline outline, 8px by 10px padding) with the knob's name and live percentage on top and its prose below.
- **Active:** when its knob is touched, or the card is hovered, it takes the signal wash and a signal outline; the knob lights in return.

### Inputs / Fields
- **Search:** a sunken well with a 4px radius and a hairline outline. Focus adds the 2px signal ring.
- **Selects:** raised surface, 2px radius. 16px text on touch screens so iOS doesn't zoom the page.

### Knob (signature component)
The control the whole product hangs on. A 2.5rem dial over a label and a live readout, sized to its label. Vertical drag (Shift for fine), keyboard arrows, double-click to reset, with a detent tick at the default. It is a real `role="slider"` with a spoken value. Engaged, it gets the 2px signal ring and glow, and its Explain card lights.

### Scope
A dark inset screen drawing the live waveform, edge-triggered so a periodic sound stands still. Each skin sets its trace width, glow, persistence and bloom: crisp in Lab, heavy CRT bloom in Phosphor, a long warm decay in Rings.

## Do's and Don'ts

### Do:
- **Do** read only semantic tokens (`--signal`, `--surface-sunken`, `--text-dim`) in components; a new skin fills the schema in `tokens.css` and passes `contrast.test.ts`.
- **Do** pair every color-coded state with weight, a marker, an outline, a label or a luminance step, and check it desaturated.
- **Do** keep text at 11px or larger (`--fs-label`) and reading text at 13px or larger (`--fs-prose`), capped at 80ch.
- **Do** use `--signal-ink` for any lettering in the signal color.
- **Do** keep the scope a dark screen in every skin.
- **Do** give touch controls at least 36px of height, and 16px text in form fields.

### Don't:
- **Don't** add a manual theme switcher; the skin follows the engine.
- **Don't** set text in Sandbox's Hot Signal; it is 2.5:1 on the light body.
- **Don't** carry meaning with a translucent tint alone.
- **Don't** put shadows on panels inside the frame; shadows are for popovers, toasts and modals.
- **Don't** use a colored side stripe as a card's accent; outline the whole card, as the active Explain card does.
- **Don't** brand anything "Mutable Instruments" or "Braids"; engine names are factual labels only.
