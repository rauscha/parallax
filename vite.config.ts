import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Build identifier shown in the footer so a deployed build is identifiable (and
// "did my push land?" is answerable at a glance). Prefer the CI commit SHA;
// fall back to a local `git rev-parse`, then "dev".
function buildId(): string {
  const sha = process.env.GITHUB_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// Content-Security-Policy for the deployed app. GitHub Pages can't serve a
// `_headers`/HTTP-header CSP, so we ship it as a <meta http-equiv> tag — but
// ONLY in production builds, because the Vite dev server needs inline scripts,
// eval and a websocket for HMR that a strict policy would break.
//
//   script-src  'wasm-unsafe-eval' — Braids compiles/instantiates WASM (main
//               thread + the AudioWorklet, which inherits the document CSP).
//   style-src   'unsafe-inline' — Svelte writes inline style="--var:…" bindings.
//   font-src    'self' — all webfonts are self-hosted under public/fonts/
//               (loaded via the FontFace API); no Google Fonts dependency.
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
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
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
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [
    svelte(),
    cspMeta(command === 'build'),
    // PWA: installable + offline. Only meaningful on build (no SW in dev — the
    // virtual:pwa-register module is a no-op there, and main.ts only registers
    // in PROD). Workbox precaches the whole shipped app INCLUDING the WASM
    // engines + worklets + Bravura font, so the synth works fully offline once
    // visited. base (/parallax/) flows through to the manifest scope/start_url
    // and the SW registration path automatically. We register manually
    // (injectRegister: false) via an ES module import so there's no inline
    // script for the strict production CSP to block.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'pwa-icon.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'Parallax',
        short_name: 'Parallax',
        description: 'A macro-oscillator playground — explained as you play.',
        theme_color: '#0B0E11',
        background_color: '#0B0E11',
        display: 'standalone',
        orientation: 'any',
        categories: ['music', 'entertainment'],
        // SVG icons (sizes:"any") — modern Chrome/Edge/Android accept these for
        // installability. No rasteriser is available in this toolchain to mint
        // PNGs; a future asset-generator pass (needs sharp) could add crisp
        // PNG/Apple-touch variants. pwa-icon.svg is full-bleed for maskable.
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm}'],
        // plaits.wasm is ~191 KB; give headroom so nothing is silently skipped.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
