/**
 * Patch "postcard" renderer (M5 delight). Draws a shareable card of the current
 * sound + melody to a canvas: the wordmark, engine · model, the macro-knob
 * dials, a mini piano-roll of the melody, and a tempo/key footer — all in the
 * live theme's colours (passed in by the caller via getComputedStyle).
 *
 * Pure drawing: it touches only the canvas + the data/colours handed to it, so
 * the layout is deterministic and the same inputs always produce the same card.
 * 1200×630 is the conventional social-card size.
 */

export interface PostcardColors {
  bg: string;
  surface: string;
  surfaceSunken: string;
  hairline: string;
  text: string;
  textDim: string;
  signal: string;
  signalDeep: string;
  accent: string;
}

export interface PostcardData {
  engineName: string;
  modelCode: string;
  modelName: string;
  familyLabel: string;
  knobs: Array<{ label: string; value: number }>; // value 0..1
  tempo: number;
  keyName: string;
  scale: string;
  events: Array<{ startStep: number; durationSteps: number; midi: number }>;
}

export const POSTCARD_W = 1200;
export const POSTCARD_H = 630;
const PAD = 64;
const TOTAL_STEPS = 64;
const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// The Parallax oscilloscope mark (dim trace behind a bright one), drawn into a
// box of the given size at (x,y).
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, signal: string, dim: string): void {
  const s = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const wave = (baseline: number, peak: number) => {
    ctx.beginPath();
    ctx.moveTo(4, baseline);
    // Two-hump quadratic, mirroring favicon.svg's Q…T…T…T path.
    const cps: Array<[number, number, number, number]> = [
      [7, peak, 10, baseline],
      [13, baseline - (baseline - peak), 16, baseline],
      [19, peak, 22, baseline],
      [25, baseline - (baseline - peak), 28, baseline],
    ];
    for (const [cx, cy, ex, ey] of cps) ctx.quadraticCurveTo(cx, cy, ex, ey);
  };
  ctx.strokeStyle = dim;
  ctx.lineWidth = 2.4;
  wave(18, 13);
  ctx.stroke();
  ctx.strokeStyle = signal;
  ctx.lineWidth = 2.8;
  wave(16, 10);
  ctx.stroke();
  ctx.restore();
}

// A single macro-knob dial: a 270° track with the value arc + label + percent.
function drawDial(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  value: number, label: string, colors: PostcardColors,
): void {
  const START = Math.PI * 0.75;       // -135°
  const SWEEP = Math.PI * 1.5;        // 270°
  const v = Math.max(0, Math.min(1, value));
  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, START, START + SWEEP);
  ctx.strokeStyle = colors.hairline;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.stroke();
  // Value arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, START, START + SWEEP * v);
  ctx.strokeStyle = colors.signal;
  ctx.lineWidth = 8;
  ctx.stroke();
  // Pointer
  const ang = START + SWEEP * v;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * (radius - 6), cy + Math.sin(ang) * (radius - 6));
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 3;
  ctx.stroke();
  // Percent in the middle
  ctx.fillStyle = colors.text;
  ctx.font = `600 26px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(v * 100)}`, cx, cy + 2);
  // Label below
  ctx.fillStyle = colors.textDim;
  ctx.font = `500 18px ${MONO}`;
  ctx.textBaseline = "top";
  ctx.fillText(label.toUpperCase(), cx, cy + radius + 12);
}

function drawPianoRoll(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  events: PostcardData["events"], colors: PostcardColors,
): void {
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = colors.surfaceSunken;
  ctx.fill();

  // Bar dividers every 16 steps (4 bars).
  ctx.strokeStyle = colors.hairline;
  ctx.lineWidth = 1;
  for (let bar = 1; bar < 4; bar++) {
    const bx = x + (bar * 16 / TOTAL_STEPS) * w;
    ctx.beginPath();
    ctx.moveTo(bx, y + 8);
    ctx.lineTo(bx, y + h - 8);
    ctx.stroke();
  }

  if (events.length === 0) {
    ctx.fillStyle = colors.textDim;
    ctx.font = `500 20px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("— no melody —", x + w / 2, y + h / 2);
    return;
  }

  let lo = Infinity, hi = -Infinity;
  for (const e of events) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); }
  // Pad the pitch range so notes don't hug the edges; floor the span at an
  // octave so a one- or two-note melody still looks reasonable.
  lo -= 2; hi += 2;
  const span = Math.max(12, hi - lo);
  const innerY = y + 12;
  const innerH = h - 24;
  const rowH = innerH / (span + 1);

  for (const e of events) {
    const ex = x + (e.startStep / TOTAL_STEPS) * w;
    const ew = Math.max(4, (Math.min(e.durationSteps, TOTAL_STEPS - e.startStep) / TOTAL_STEPS) * w - 2);
    const ey = innerY + (hi - e.midi) * rowH;
    roundRectPath(ctx, ex + 1, ey, ew, Math.max(4, rowH * 0.7), 3);
    ctx.fillStyle = colors.signal;
    ctx.fill();
  }
}

/** Render the whole postcard. Caller sizes the canvas via POSTCARD_W/H. */
export function renderPostcard(
  canvas: HTMLCanvasElement,
  data: PostcardData,
  colors: PostcardColors,
): void {
  canvas.width = POSTCARD_W;
  canvas.height = POSTCARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background + a subtle inner frame.
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, POSTCARD_W, POSTCARD_H);
  ctx.strokeStyle = colors.hairline;
  ctx.lineWidth = 2;
  roundRectPath(ctx, 14, 14, POSTCARD_W - 28, POSTCARD_H - 28, 16);
  ctx.stroke();

  // Header: mark + wordmark (left), tempo/key/scale (right).
  drawMark(ctx, PAD, PAD - 6, 52, colors.signal, colors.textDim);
  ctx.fillStyle = colors.text;
  ctx.font = `600 34px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Parallax", PAD + 70, PAD + 20);

  ctx.fillStyle = colors.textDim;
  ctx.font = `500 22px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText(`${data.tempo} BPM · ${data.keyName} ${data.scale}`, POSTCARD_W - PAD, PAD + 20);

  // Engine · model headline.
  ctx.textAlign = "left";
  ctx.fillStyle = colors.textDim;
  ctx.font = `500 22px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${data.engineName.toUpperCase()} · ${data.familyLabel.toUpperCase()}`, PAD, 188);
  ctx.fillStyle = colors.signal;
  ctx.font = `600 76px ${MONO}`;
  ctx.fillText(data.modelName, PAD, 262);
  ctx.fillStyle = colors.textDim;
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(data.modelCode.toUpperCase(), PAD, 300);

  // Macro-knob dials, right-aligned in the header band.
  const dialR = 46;
  const dialGap = 150;
  const dialCount = Math.min(data.knobs.length, 3);
  const dialsRight = POSTCARD_W - PAD - dialR;
  for (let i = 0; i < dialCount; i++) {
    const k = data.knobs[i];
    const cx = dialsRight - (dialCount - 1 - i) * dialGap;
    drawDial(ctx, cx, 228, dialR, k.value, k.label, colors);
  }

  // Melody piano-roll across the lower third.
  drawPianoRoll(ctx, PAD, 372, POSTCARD_W - PAD * 2, 168, data.events, colors);

  // Footer.
  ctx.fillStyle = colors.textDim;
  ctx.font = `500 20px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("andrewrausch.com/parallax", PAD, POSTCARD_H - 40);
  ctx.fillStyle = colors.signal;
  ctx.textAlign = "right";
  ctx.fillText("◐", POSTCARD_W - PAD, POSTCARD_H - 38);
}
