# Parallax WASM build — compiles braids_shim.cc + minimal Braids/stmlib
# sources into public/braids.{js,wasm} for the AudioWorklet to consume.
#
# Requires emsdk to be installed at $env:USERPROFILE\emsdk (run once with
# `emsdk install latest && emsdk activate latest`).

$ErrorActionPreference = "Stop"

# Resolve paths relative to this script
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

# Compilation units — the minimal set needed for MacroOscillator to produce sound.
$sources = @(
  (Join-Path $SHIM_DIR "braids_shim.cc"),
  (Join-Path $VENDOR_DIR "braids\macro_oscillator.cc"),
  (Join-Path $VENDOR_DIR "braids\analog_oscillator.cc"),
  (Join-Path $VENDOR_DIR "braids\digital_oscillator.cc"),
  (Join-Path $VENDOR_DIR "braids\quantizer.cc"),
  (Join-Path $VENDOR_DIR "braids\resources.cc"),
  (Join-Path $VENDOR_DIR "stmlib\utils\random.cc")
)

$includes = @(
  "-I$VENDOR_DIR",
  "-I$VENDOR_DIR\stmlib"
)

# Emscripten flags
$em_flags = @(
  "-O3",
  "-DTEST",                           # skip __attribute__((section(".ramtext")))
  "-std=c++14",
  "-fno-exceptions",
  "-fno-rtti",
  "-s", "MODULARIZE=1",
  "-s", "EXPORT_ES6=1",
  "-s", "EXPORT_NAME=createBraidsModule",
  "-s", "ENVIRONMENT=web,worker",     # worklet uses worker-like env
  "-s", "WASM=1",
  "-s", "ALLOW_MEMORY_GROWTH=0",
  "-s", "INITIAL_MEMORY=2097152",      # 2 MB — tables + buffers fit comfortably
  "-s", "TOTAL_STACK=131072",
  "-s", "ASSERTIONS=0",
  "-s", "FILESYSTEM=0",
  "-s", "MALLOC=emmalloc",
  "-s", "EXPORTED_FUNCTIONS=['_braids_init','_braids_set_shape','_braids_set_pitch','_braids_set_parameters','_braids_strike','_braids_set_bits','_braids_set_sample_rate_khz','_braids_set_signature','_braids_set_drift','_braids_alloc','_braids_free','_braids_render','_malloc','_free']",
  "-s", "EXPORTED_RUNTIME_METHODS=['HEAP16','HEAPU8','HEAPF32']"
)

$out_js   = Join-Path $BUILD_DIR "braids.js"
$out_wasm = Join-Path $BUILD_DIR "braids.wasm"

Write-Host "Compiling Braids WASM..."
$args_all = @($sources) + $includes + $em_flags + @("-o", $out_js)
& emcc.bat @args_all
if ($LASTEXITCODE -ne 0) { throw "emcc failed with exit code $LASTEXITCODE" }

# Copy outputs into public/ so Vite serves them at /braids.js and /braids.wasm
Copy-Item -Force $out_js   (Join-Path $OUT_DIR "braids.js")
Copy-Item -Force $out_wasm (Join-Path $OUT_DIR "braids.wasm")

$wasm_size = (Get-Item (Join-Path $OUT_DIR "braids.wasm")).Length
$js_size   = (Get-Item (Join-Path $OUT_DIR "braids.js")).Length
Write-Host ("Built: public/braids.wasm = {0:N0} bytes, public/braids.js = {1:N0} bytes" -f $wasm_size, $js_size)
