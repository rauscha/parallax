# Parallax WASM build (Rings) — compiles rings_shim.cc + the vendored Rings
# DSP core + the stmlib subset it needs into public/rings.{js,wasm} for the
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

# Every .cc in the vendored Rings tree (engines, voice, fm, physical_modelling,
# speech, chords, oscillator, fx, resources) — gathered dynamically so a new
# upstream file is picked up without editing this list.
$rings_sources = Get-ChildItem -Path (Join-Path $VENDOR_DIR "rings") -Recurse -Filter *.cc |
  ForEach-Object { $_.FullName }

$sources = @(
  (Join-Path $SHIM_DIR "rings_shim.cc")
) + $rings_sources + @(
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
  "-s", "EXPORT_NAME=createRingsModule",
  "-s", "ENVIRONMENT=web,worker",
  "-s", "WASM=1",
  "-s", "ALLOW_MEMORY_GROWTH=0",
  "-s", "INITIAL_MEMORY=16777216",     # 16 MB — Plaits LUTs + buffers fit comfortably
  "-s", "TOTAL_STACK=262144",          # 256 KB
  "-s", "ASSERTIONS=0",
  "-s", "FILESYSTEM=0",
  "-s", "MALLOC=emmalloc",
  "-s", "EXPORTED_FUNCTIONS=['_rings_init','_rings_set_model','_rings_set_note','_rings_set_structure','_rings_set_brightness','_rings_set_damping','_rings_set_position','_rings_strum','_rings_alloc','_rings_free','_rings_render','_malloc','_free']",
  "-s", "EXPORTED_RUNTIME_METHODS=['HEAP16','HEAPU8','HEAPF32']"
)

$out_js   = Join-Path $BUILD_DIR "rings.js"
$out_wasm = Join-Path $BUILD_DIR "rings.wasm"

Write-Host "Compiling Rings WASM ($($rings_sources.Count) Rings sources)..."
$args_all = @($sources) + $includes + $em_flags + @("-o", $out_js)
& emcc.bat @args_all
if ($LASTEXITCODE -ne 0) { throw "emcc failed with exit code $LASTEXITCODE" }

Copy-Item -Force $out_js   (Join-Path $OUT_DIR "rings.js")
Copy-Item -Force $out_wasm (Join-Path $OUT_DIR "rings.wasm")

$wasm_size = (Get-Item (Join-Path $OUT_DIR "rings.wasm")).Length
$js_size   = (Get-Item (Join-Path $OUT_DIR "rings.js")).Length
Write-Host ("Built: public/rings.wasm = {0:N0} bytes, public/rings.js = {1:N0} bytes" -f $wasm_size, $js_size)
