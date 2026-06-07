# Parallax WASM build (Plaits) — compiles plaits_shim.cc + the vendored Plaits
# DSP core + the stmlib subset it needs into public/plaits.{js,wasm} for the
# AudioWorklet to consume. Mirrors build.ps1 (Braids).
#
# Requires emsdk at $env:USERPROFILE\emsdk (run once with
# `emsdk install latest && emsdk activate latest`).

$ErrorActionPreference = "Stop"

$SHIM_DIR   = $PSScriptRoot
$REPO_ROOT  = Resolve-Path (Join-Path $SHIM_DIR "..\..")
$VENDOR_DIR = Join-Path $REPO_ROOT "dsp\vendor"
$BUILD_DIR  = Join-Path $REPO_ROOT "dsp\build"
$OUT_DIR    = Join-Path $REPO_ROOT "public"

# Source emsdk environment for this session if emcc isn't already on PATH
if (-not (Get-Command emcc.bat -ErrorAction SilentlyContinue)) {
  $env_script = Join-Path $env:USERPROFILE "emsdk\emsdk_env.ps1"
  if (-not (Test-Path $env_script)) {
    throw "emsdk not found at $env:USERPROFILE\emsdk. Install with: git clone https://github.com/emscripten-core/emsdk.git `$env:USERPROFILE\emsdk; cd `$env:USERPROFILE\emsdk; .\emsdk install latest; .\emsdk activate latest"
  }
  $env:EMSDK_QUIET = "1"
  & $env_script | Out-Null
}

if (-not (Test-Path $BUILD_DIR)) { New-Item -ItemType Directory -Path $BUILD_DIR | Out-Null }

# Every .cc in the vendored Plaits tree (engines, voice, fm, physical_modelling,
# speech, chords, oscillator, fx, resources) — gathered dynamically so a new
# upstream file is picked up without editing this list.
$plaits_sources = Get-ChildItem -Path (Join-Path $VENDOR_DIR "plaits") -Recurse -Filter *.cc |
  ForEach-Object { $_.FullName }

$sources = @(
  (Join-Path $SHIM_DIR "plaits_shim.cc")
) + $plaits_sources + @(
  (Join-Path $VENDOR_DIR "stmlib\dsp\atan.cc"),
  (Join-Path $VENDOR_DIR "stmlib\dsp\units.cc"),
  (Join-Path $VENDOR_DIR "stmlib\utils\random.cc")
)

$includes = @(
  "-I$VENDOR_DIR",
  "-I$VENDOR_DIR\stmlib"
)

# Emscripten flags. -DTEST keeps user_data.h on its mock branch (no STM32 flash
# include / read) — the same flag the Braids build uses. Plaits' resource tables
# are larger than Braids', so INITIAL_MEMORY is bumped accordingly.
$em_flags = @(
  "-O3",
  "-DTEST",
  "-std=c++14",
  "-fno-exceptions",
  "-fno-rtti",
  "-s", "MODULARIZE=1",
  "-s", "EXPORT_ES6=1",
  "-s", "EXPORT_NAME=createPlaitsModule",
  "-s", "ENVIRONMENT=web,worker",
  "-s", "WASM=1",
  "-s", "ALLOW_MEMORY_GROWTH=0",
  "-s", "INITIAL_MEMORY=16777216",     # 16 MB — Plaits LUTs + buffers fit comfortably
  "-s", "TOTAL_STACK=262144",          # 256 KB
  "-s", "ASSERTIONS=0",
  "-s", "FILESYSTEM=0",
  "-s", "MALLOC=emmalloc",
  "-s", "EXPORTED_FUNCTIONS=['_plaits_init','_plaits_set_engine','_plaits_set_note','_plaits_set_harmonics','_plaits_set_timbre','_plaits_set_morph','_plaits_set_decay','_plaits_set_lpg_colour','_plaits_set_trigger','_plaits_set_level','_plaits_alloc','_plaits_free','_plaits_render','_malloc','_free']",
  "-s", "EXPORTED_RUNTIME_METHODS=['HEAP16','HEAPU8','HEAPF32']"
)

$out_js   = Join-Path $BUILD_DIR "plaits.js"
$out_wasm = Join-Path $BUILD_DIR "plaits.wasm"

Write-Host "Compiling Plaits WASM ($($plaits_sources.Count) Plaits sources)..."
$args_all = @($sources) + $includes + $em_flags + @("-o", $out_js)
& emcc.bat @args_all
if ($LASTEXITCODE -ne 0) { throw "emcc failed with exit code $LASTEXITCODE" }

Copy-Item -Force $out_js   (Join-Path $OUT_DIR "plaits.js")
Copy-Item -Force $out_wasm (Join-Path $OUT_DIR "plaits.wasm")

$wasm_size = (Get-Item (Join-Path $OUT_DIR "plaits.wasm")).Length
$js_size   = (Get-Item (Join-Path $OUT_DIR "plaits.js")).Length
Write-Host ("Built: public/plaits.wasm = {0:N0} bytes, public/plaits.js = {1:N0} bytes" -f $wasm_size, $js_size)
