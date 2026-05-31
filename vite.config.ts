import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true, // bind 0.0.0.0 so the dev server is reachable over Tailscale / LAN
    // Allow Tailscale MagicDNS hostnames (<node>.<tailnet>.ts.net) when fronted by
    // `tailscale serve` for HTTPS — required for the AudioWorklet's secure context.
    allowedHosts: ['.ts.net'],
  },
})
