import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Production lands at andrewrausch.com/parallax/ (a GitHub Pages project page),
  // so assets must be served from /parallax/. Dev + Tailscale stay at root so the
  // local test URLs don't need the prefix. Change this one literal if the deploy
  // path changes (root host → '/'). Runtime asset loads use import.meta.env.BASE_URL.
  base: command === 'build' ? '/parallax/' : '/',
  plugins: [svelte()],
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
