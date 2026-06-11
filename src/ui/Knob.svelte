<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ParameterDescriptor } from '../audio/types';
  import { activeParamStore } from '../state/stores';
  import { hapticTick } from './haptics';

  let { spec, value, onchange }: {
    spec: ParameterDescriptor;
    value: number;
    onchange: (v: number) => void;
  } = $props();

  const SWEEP = 270;   // total dial travel, in degrees
  const START = -135;  // angle at min (measured clockwise from 12 o'clock)
  const DRAG_PX = 200; // vertical pixels for a full min→max sweep

  // ── Detent at the factory default ──
  // A magnetic notch as you drag past `spec.default`: the value sticks there
  // until you pull beyond a wider break-away (hysteresis, so it can't chatter),
  // with a haptic tick on catch. For bipolar params (FM, default 0) this *is*
  // the classic centre detent; for the rest it's a "snaps back to home" feel.
  const DETENT_CATCH   = 0.025;  // enter the notch within ±2.5% of range
  const DETENT_RELEASE = 0.05;   // must travel ±5% past default to escape it
  let detentHeld = $state(false);

  let dragging = $state(false);
  let startY = 0;
  let startVal = 0;

  // ── Knob ↔ Explain-card highlight link ──
  // The user is "engaged" with this knob while hovering, keyboard-focused, or
  // dragging it. Publish that to the shared store so the matching Explain card
  // lights up; subscribe back so hovering the card (or any other writer) lights
  // this knob too. Drag is part of the union deliberately — on touch there's no
  // hover, so the drag is what keeps the card lit while you turn the knob.
  let hovered = $state(false);
  let focused = $state(false);
  const engaged = $derived(hovered || focused || dragging);

  let activeId = $state<string | null>(activeParamStore.get());
  const unsubscribe = activeParamStore.subscribe((v) => { activeId = v; });
  const active = $derived(activeId === spec.id);

  $effect(() => {
    if (engaged) activeParamStore.set(spec.id);
    // Only clear if we're the one currently shown — never stomp another knob.
    else if (activeParamStore.get() === spec.id) activeParamStore.set(null);
  });

  const range = $derived(spec.max - spec.min);
  const step = $derived(spec.step ?? (range || 1) / 1000);
  const norm = $derived(range === 0 ? 0 : (value - spec.min) / range); // 0..1
  const angle = $derived(START + norm * SWEEP);
  const decimals = $derived((spec.step ?? 0) >= 1 ? 0 : 2);
  const readout = $derived(
    spec.format ? spec.format(value) : `${value.toFixed(decimals)}${spec.unit ?? ''}`,
  );

  function clamp(v: number) {
    return Math.min(spec.max, Math.max(spec.min, v));
  }
  function snap(v: number) {
    const s = Math.round((v - spec.min) / step) * step + spec.min;
    return clamp(+s.toFixed(6));
  }

  // RAF-coalesce onchange so dragging (which fires on every pixel) collapses
  // to one cross-thread postMessage per animation frame. Without this, the
  // lo-fi sliders (bits/rate/sign/drift) easily push 30-60+ messages/sec onto
  // the audio thread — a known click-risk on weak phones. Final value always
  // flushes on pointerup so the engine never sits a frame behind on release.
  let pendingValue: number | null = null;
  let rafHandle = 0;
  function flush() {
    rafHandle = 0;
    if (pendingValue !== null) {
      const v = pendingValue;
      pendingValue = null;
      onchange(v);
    }
  }
  function commit(v: number) {
    pendingValue = snap(v);
    if (!rafHandle) rafHandle = requestAnimationFrame(flush);
  }
  function commitNow(v: number) {
    if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
    pendingValue = null;
    onchange(snap(v));
  }
  onDestroy(() => {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    unsubscribe();
    // A knob torn down mid-engage (e.g. model switch) must not leave the store
    // pointing at a param that no longer has a knob.
    if (activeParamStore.get() === spec.id) activeParamStore.set(null);
  });

  /** Stick the raw drag value to `spec.default` inside the detent zone. */
  function applyDetent(raw: number): number {
    if (range === 0) return raw;
    const dist = Math.abs(raw - spec.default) / range;
    const threshold = detentHeld ? DETENT_RELEASE : DETENT_CATCH;
    if (dist < threshold) {
      if (!detentHeld) { detentHeld = true; hapticTick(); }   // tick only on catch
      return spec.default;
    }
    detentHeld = false;
    return raw;
  }

  // ── Vertical-drag interaction ──
  function onPointerDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
    startY = e.clientY;
    startVal = value;
    // If we grab the knob already sitting on its default, treat the detent as
    // pre-held so the first nudge doesn't fire a spurious tick.
    detentHeld = range !== 0 && Math.abs(startVal - spec.default) / range < DETENT_RELEASE;
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dy = startY - e.clientY;        // drag up → increase
    const fine = e.shiftKey ? 0.2 : 1;    // hold shift for fine control
    commit(applyDetent(startVal + (dy / DRAG_PX) * range * fine));
  }
  function endDrag(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    detentHeld = false;
    // Flush any RAF-pending value so the engine sees the exact release point.
    if (pendingValue !== null) commitNow(pendingValue);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  function onKeyDown(e: KeyboardEvent) {
    const mult = e.shiftKey ? 10 : 1;
    let next = value;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight': next = value + step * mult; break;
      case 'ArrowDown':
      case 'ArrowLeft':  next = value - step * mult; break;
      case 'Home': next = spec.min; break;
      case 'End':  next = spec.max; break;
      case 'Delete':
      case 'Backspace': next = spec.default; break;   // keyboard reset
      default: return;                                 // ignore the rest
    }
    e.preventDefault();
    e.stopPropagation();   // don't let the global note-key harness see this
    commit(next);
  }

  // ── SVG dial geometry (40×40 viewBox) ──
  const CX = 20, CY = 20, R = 15;
  function pt(a: number): [number, number] {
    const r = (a * Math.PI) / 180;
    return [CX + R * Math.sin(r), CY - R * Math.cos(r)];
  }
  function arc(a0: number, a1: number): string {
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  const trackPath = $derived(arc(START, START + SWEEP));
  const valuePath = $derived(arc(START, angle));
  const tip = $derived(pt(angle));

  // Detent tick — a small notch on the track at the default position.
  const defaultNorm = $derived(range === 0 ? 0 : (spec.default - spec.min) / range);
  const defaultAngle = $derived(START + defaultNorm * SWEEP);
  function ptR(a: number, r: number): [number, number] {
    const rad = (a * Math.PI) / 180;
    return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
  }
  const detentTick = $derived.by(() => {
    const [x1, y1] = ptR(defaultAngle, 13);
    const [x2, y2] = ptR(defaultAngle, 18);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  });
</script>

<div
  class="knob"
  class:dragging
  class:active
  role="slider"
  tabindex="0"
  aria-label={spec.label}
  aria-valuemin={spec.min}
  aria-valuemax={spec.max}
  aria-valuenow={value}
  aria-valuetext={readout}
  title="Drag up/down · Shift = fine · double-click resets"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
  onfocus={() => (focused = true)}
  onblur={() => (focused = false)}
  ondblclick={() => commitNow(spec.default)}
  onkeydown={onKeyDown}
>
  <span class="knob-label">{spec.label}</span>
  <svg class="dial" viewBox="0 0 40 40" aria-hidden="true">
    <path class="track" d={trackPath} />
    <path class="detent-tick" class:snapped={detentHeld && dragging} d={detentTick} />
    <path class="value" d={valuePath} />
    <line class="needle" x1={CX} y1={CY} x2={tip[0]} y2={tip[1]} />
    <circle class="hub" cx={CX} cy={CY} r="2.5" />
  </svg>
  <span class="knob-value">{readout}</span>
</div>

<style>
  .knob {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    width: 3.6rem;
    padding: 0.2rem;
    border-radius: var(--radius-md);
    cursor: ns-resize;
    touch-action: none;   /* vertical drag must not scroll the page on mobile */
    user-select: none;
    -webkit-user-select: none;
    outline: none;
  }
  .knob:focus-visible {
    box-shadow: 0 0 0 2px var(--signal);
  }
  .knob-label {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .dial {
    width: 2.5rem;
    height: 2.5rem;
  }
  .track {
    fill: none;
    stroke: var(--knob-track);
    stroke-width: 3.5;
    stroke-linecap: round;
  }
  .value {
    fill: none;
    stroke: var(--knob-fill);
    stroke-width: 3.5;
    stroke-linecap: round;
  }
  .needle {
    stroke: var(--knob-pointer);
    stroke-width: 2;
    stroke-linecap: round;
  }
  /* Notch at the default value. Lights up while the drag is caught in it. */
  .detent-tick {
    stroke: var(--knob-tick);
    stroke-width: 1;
    stroke-linecap: round;
    opacity: 0.6;
    transition: stroke var(--t-fast), opacity var(--t-fast);
  }
  .detent-tick.snapped {
    stroke: var(--signal);
    opacity: 1;
  }
  .hub {
    fill: var(--knob-pointer);
  }
  /* Subtle surface lift while turning — a non-colour cue (colourblind rule);
     the value is still read from the arc + the number. */
  .knob.dragging {
    background: var(--surface-raised);
  }
  /* Engaged (hover / focus / drag) or lit from the matching Explain card. The
     ring matches :focus-visible so keyboard focus stays just as crisp, plus a
     glow so the link reads at a glance. Defined after :focus-visible so it wins
     when both apply. */
  .knob.active {
    background: var(--surface-raised);
    box-shadow: 0 0 0 2px var(--signal), 0 0 14px var(--signal-glow);
  }
  .knob-value {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  /* Tighter on phones — shrink the dial and trim the surround so more knobs fit
     per row and the controls column eats less vertical space. The whole .knob
     box is still the drag target, so this stays comfortably tappable. */
  @media (max-width: 720px) {
    .knob { width: 3.1rem; padding: 0.1rem; gap: 0.05rem; }
    .dial { width: 2.1rem; height: 2.1rem; }
    .knob-label { font-size: 0.54rem; letter-spacing: 0.04em; }
    .knob-value { font-size: 0.6rem; }
  }
</style>
