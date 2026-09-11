# Parallax WASM build (FM, engine #5) — compiles fm_shim.cc + the vendored msfa
# DSP core into public/fm.{js,wasm} for the AudioWorklet to consume.
# Mirrors build-rings.ps1.
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

# The vendored msfa tree is already trimmed to the FM voice (see
# dsp/vendor/msfa/README.md), so every .cc in it belongs in this build.
$msfa_sources = Get-ChildItem -Path (Join-Path $VENDOR_DIR "msfa") -Filter *.cc |
  ForEach-Object { $_.FullName }

$sources = @(
  (Join-Path $SHIM_DIR "fm_shim.cc")
) + $msfa_sources

$includes = @(
  "-I$VENDOR_DIR"
)

# msfa is small — no big resource tables — so this is the leanest of the four
# builds. INITIAL_MEMORY still matches the others for consistency.
$em_flags = @(
  "-O3",
  "-std=c++14",
  "-fno-exceptions",
  "-fno-rtti",
  "-s", "MODULARIZE=1",
  "-s", "EXPORT_ES6=1",
  "-s", "EXPORT_NAME=createFmModule",
  "-s", "ENVIRONMENT=web,worker",
  "-s", "WASM=1",
  "-s", "ALLOW_MEMORY_GROWTH=0",
  "-s", "INITIAL_MEMORY=16777216",     # 16 MB
  "-s", "TOTAL_STACK=262144",          # 256 KB
  "-s", "ASSERTIONS=0",
  "-s", "FILESYSTEM=0",
  "-s", "MALLOC=emmalloc",
  "-s", "EXPORTED_FUNCTIONS=['_fm_init','_fm_set_patch','_fm_update_patch','_fm_note_on','_fm_note_off','_fm_set_pitch_bend','_fm_alloc','_fm_free','_fm_block_size','_fm_render','_malloc','_free']",
  "-s", "EXPORTED_RUNTIME_METHODS=['HEAP16','HEAPU8','HEAPF32']"
)

$out_js   = Join-Path $BUILD_DIR "fm.js"
$out_wasm = Join-Path $BUILD_DIR "fm.wasm"

Write-Host "Compiling FM WASM ($($msfa_sources.Count) msfa sources)..."
$args_all = @($sources) + $includes + $em_flags + @("-o", $out_js)
& emcc.bat @args_all
if ($LASTEXITCODE -ne 0) { throw "emcc failed with exit code $LASTEXITCODE" }

Copy-Item -Force $out_js   (Join-Path $OUT_DIR "fm.js")
Copy-Item -Force $out_wasm (Join-Path $OUT_DIR "fm.wasm")

$wasm_size = (Get-Item (Join-Path $OUT_DIR "fm.wasm")).Length
$js_size   = (Get-Item (Join-Path $OUT_DIR "fm.js")).Length
Write-Host ("Built: public/fm.wasm = {0:N0} bytes, public/fm.js = {1:N0} bytes" -f $wasm_size, $js_size)
