import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Content-Security-Policy for the deployed app. GitHub Pages can't serve a
// `_headers`/HTTP-header CSP, so we ship it as a <meta http-equiv> tag — but
// ONLY in production builds, because the Vite dev server needs inline scripts,
// eval and a websocket for HMR that a strict policy would break.
//
//   script-src  'wasm-unsafe-eval' — Braids compiles/instantiates WASM (main
//               thread + the AudioWorklet, which inherits the document CSP).
//   style-src   'unsafe-inline' — Svelte writes inline style="--var:…" bindings;
//               fonts.googleapis.com — the Inter/Space-Grotesk/Mono stylesheet.
//   font-src    fonts.gstatic.com — those web fonts (Bravura is self-hosted).
//   worker-src  'self' blob: — 'self' covers the same-origin braids-worklet.js
//               module; `blob:` is REQUIRED by Tone.js, whose Transport clock
//               ticker runs in a Web Worker created from a Blob URL
//               (node_modules/tone/.../clock/Ticker.js). Without `blob:` the
//               worker is blocked by CSP and — because the block is async, not a
//               thrown error — Tone never falls back to its setTimeout clock, so
//               the Transport silently stops firing scheduled notes (the playhead
//               still sweeps off the audio clock, but the sequencer makes no
//               sound). Do NOT tighten this back to 'self' without forcing
//               Tone's clockSource to "timeout". Creating a blob worker already
//               requires script execution (gated by script-src 'self'), so this
//               adds negligible attack surface.
// Note: frame-ancestors / X-Frame-Options can't be set via <meta>, so
// clickjacking protection would need real headers GitHub Pages doesn't offer.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function cspMeta(enabled: boolean): Plugin {
  return {
    name: 'parallax-csp-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        if (!enabled) return html
        const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        return html.replace(/<head>/, `<head>\n    ${tag}`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // Production lands at andrewrausch.com/parallax/ (a GitHub Pages project page),
  // so assets must be served from /parallax/. Dev + Tailscale stay at root so the
  // local test URLs don't need the prefix. `vite preview` serves the *built*
  // output (whose assets reference /parallax/), so it must use the same base —
  // otherwise every asset 404s into the SPA fallback. Change this one literal if
  // the deploy path changes (root host → '/'). Runtime asset loads use
  // import.meta.env.BASE_URL.
  base: command === 'build' || isPreview ? '/parallax/' : '/',
  plugins: [svelte(), cspMeta(command === 'build')],
  server: {
    host: true, // bind 0.0.0.0 so the dev server is reachable over Tailscale / LAN
    // Honor PORT env var so tooling (Claude Preview, CI) can pin a chosen port;
    // falls through to Vite's default (5173, then 5174, ...) when unset.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    strictPort: !!process.env.PORT,
    // Allow Tailscale MagicDNS hostnames (<node>.<tailnet>.ts.net) when fronted by
    // `tailscale serve` for HTTPS — required for the AudioWorklet's secure context.
    allowedHosts: ['.ts.net'],
  },
}))
