param([switch]$Qa)
$ErrorActionPreference = 'Stop'
$previousConfig = $env:TAURI_CONFIG
Push-Location (Join-Path $PSScriptRoot '..')
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
  $config = Get-Content 'src-tauri/tauri.preview.conf.json' -Raw | ConvertFrom-Json
  if ($Qa) {
    $config.identifier = 'com.skyze.rohelper.workspace.qa'
    $config.app.windows[0].title = 'Кремлёвский Ассистент — UI QA'
  }
  $env:TAURI_CONFIG = $config | ConvertTo-Json -Depth 30 -Compress
  & cargo build --release --features tauri/custom-protocol --manifest-path src-tauri/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
  & node scripts/check-exe-version.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Executable version check failed.' }
  & node scripts/check-workspace-assets.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Embedded frontend check failed.' }
  Write-Output (Join-Path (Get-Location) 'src-tauri/target/release/ro-helper.exe')
} finally {
  $env:TAURI_CONFIG = $previousConfig
  Pop-Location
}
