# Provenance of the committed engine binaries

Parallax ships a few engine artifacts **prebuilt and committed** under `public/`
so GitHub Pages CI can publish the app with no Emscripten toolchain (see
CLAUDE.md → Hosting). This is the one place trust isn't backed by a CI rebuild,
so this file records exactly what those artifacts are and how to regenerate
them. (security M-3)

## What's opaque vs. readable

- **Opaque (compiled):** `public/braids.wasm`, `public/plaits.wasm`,
  `public/rings.wasm`, and their Emscripten JS glue `public/braids.js`,
  `public/plaits.js`, `public/rings.js`. These come out of the Emscripten
  build of the C++ shim + vendored Mutable Instruments DSP and can't be
  eyeballed — hence this file.
- **Hand-maintained (readable):** the AudioWorklet processors
  `public/braids-worklet.js`, `public/plaits-worklet.js`,
  `public/laxsynth-worklet.js`, `public/rings-worklet.js` are plain JS, edited
  by hand and reviewable in the diff. Laxsynth is **pure JS** — it has no
  `.wasm` at all. They're listed here only so their hashes are pinned
  alongside the binaries.

## SHA-256 of the committed artifacts

Recorded 2026-06-12; `braids.wasm` re-pinned 2026-06-15 after the A7 rebuild
(envelope-range clamp landed in the shim). The Emscripten JS glue `braids.js` is
byte-identical across that rebuild — the clamp only changed compiled DSP, not the
loader — so only the `.wasm` row moved. Hashes are over the committed (LF) blobs;
regenerate with:

```sh
sha256sum public/braids.wasm public/braids.js \
          public/plaits.wasm public/plaits.js \
          public/rings.wasm public/rings.js \
          public/braids-worklet.js public/plaits-worklet.js \
          public/laxsynth-worklet.js public/rings-worklet.js
```

| File | SHA-256 |
|------|---------|
| `public/braids.wasm`         | `07d274371071e60cc9f079d009b21aa2a62fe01d514112e3c5d56cdb109e8145` |
| `public/braids.js`           | `ee0590665bfd77e41b3b512cea5160fa38633596768f512a351e614954b2d5e3` |
| `public/plaits.wasm`         | `669906ba48c5168652e0d5a4fad2d93ef8ea0311416f403c33bd09462e52937d` |
| `public/plaits.js`           | `c23a94ed8ef53d380d42ab89ca860980acf1a72520bc2d9990dd9a6ef3649df0` |
| `public/rings.wasm`          | `efe916aeb9e65266a45f225061ff0e32bbff5271fe8e49ec698ef93bb85d1d2e` |
| `public/rings.js`            | `ed18e9fa1605fc86e2df86a0c46902e9a521b67ece1ce942f96b7cd57e288f76` |
| `public/braids-worklet.js`   | `72f8d02a291ee03f10218cf3b40614652b55361235c4ef93c21ba8fc1b0a4d78` |
| `public/plaits-worklet.js`   | `f1d9a7aa2124b798375330fb1366366ac59276e57853c533326fd1b3fdcd9cb5` |
| `public/laxsynth-worklet.js` | `17fe058a615677abb08338397892f2275cc562bda6447b92896f145314bc13c1` |
| `public/rings-worklet.js`    | `6a238375d9810163a043c64994c25aea0abdf1332311a6feb9b36ca0b6bee253` |

> Note: `braids-worklet.js`, `plaits-worklet.js`, `laxsynth-worklet.js`, and
> `rings-worklet.js` are hand-edited JS, so their hashes change whenever those
> files are edited (e.g. the A2 dispose path / A7 envelope clamp) — that's
> expected, not a rebuild.
> The `.wasm` + glue `.js` hashes only change on an Emscripten rebuild.

## Source

- **Vendored DSP:** Émilie Gillet's open-source firmware (`pichenettes/eurorack`
  → `braids/`, `plaits/`, `stmlib/`), vendored under `dsp/vendor/` as regular
  files (not a git submodule). See `dsp/vendor/README.md` for the trimmed
  subtree list and `LICENSE-Braids.txt` for the MIT license + attribution.
  - **eurorack upstream commit:** `08460a69a7e1f7a81c5a2abcc7189c9a6b7208d4` — pinned at the
    2026-07-11 Rings vendoring. The braids/plaits vendoring predates this pin
    and its upstream HEAD was never captured; treat this hash as authoritative
    for `rings/` only.
- **Shim (our code, MIT):** `dsp/shim/braids_shim.cc`, `dsp/shim/plaits_shim.cc`,
  `dsp/shim/rings_shim.cc`.

## Rebuild

Requires Emscripten (`emcc`). PowerShell-only build scripts today (desktop):

```powershell
# once per shell, if emcc isn't on PATH:
& "$env:USERPROFILE\emsdk\emsdk_env.ps1"

npm run wasm          # -> dsp/shim/build.ps1        (braids.wasm + braids.js)
npm run wasm:plaits   # -> dsp/shim/build-plaits.ps1 (plaits.wasm + plaits.js)
npm run wasm:rings    # -> dsp/shim/build-rings.ps1  (rings.wasm + rings.js)
```

The scripts copy the emitted `.wasm` + `.js` into `public/`. After a rebuild:
1. record the new SHA-256s in the table above,
2. record the **emcc version** (`emcc --version`) here — the current
   `braids.wasm` was built 2026-06-15 with **emcc 5.0.7**
   (`263db4cffa6f9fc2ec514a70abac81362ea41849`). The `plaits.wasm` binary
   predates this rebuild and its emcc version was not captured at the time.
   The `rings.wasm` was built 2026-07-11, also with **emcc 5.0.7**
   (`263db4cffa6f9fc2ec514a70abac81362ea41849`) — same toolchain, no drift.
3. record the **eurorack commit** the build was made from (see Source above) —
   *still unrecorded:* the M1 vendoring didn't capture upstream `HEAD`, and it
   can't be recovered from the vendored tree after the fact. Capture it at the
   next re-vendoring.

Laxsynth has no rebuild step — it's authored directly in
`public/laxsynth-worklet.js`.
