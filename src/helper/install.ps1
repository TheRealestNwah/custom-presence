# Installs the Custom Presence helper for Waterfox (and Firefox) for the current Windows user.
# Run from the repo after `npm run build`:  powershell -ExecutionPolicy Bypass -File dist\helper\install.ps1
# Run with -Uninstall to remove it.
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$name = "custom_presence_helper"
$dest = Join-Path $env:LOCALAPPDATA "CustomPresence"
$keys = @(
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$name",
  "HKCU:\Software\Waterfox\NativeMessagingHosts\$name"
)

if ($Uninstall) {
  foreach ($k in $keys) { if (Test-Path $k) { Remove-Item $k -Force } }
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Write-Host "Custom Presence helper removed."
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js isn't installed (or isn't on PATH). Install it from https://nodejs.org and run this again." }

New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot "helper.cjs") (Join-Path $dest "helper.cjs") -Force

# Waterfox can only start .exe/.bat/.cmd files, so a small wrapper runs Node.
$cmd = Join-Path $dest "helper.cmd"
Set-Content -Path $cmd -Encoding ascii -Value "@echo off`r`n`"$node`" `"%~dp0helper.cjs`" %*"

$manifest = [ordered]@{
  name               = $name
  description        = "Custom Presence helper"
  path               = $cmd
  type               = "stdio"
  allowed_extensions = @("custom-presence@therealestnwah")
}
$manifestPath = Join-Path $dest "$name.json"
$manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding utf8

foreach ($k in $keys) {
  New-Item -Path $k -Force | Out-Null
  Set-Item -Path $k -Value $manifestPath
}

Write-Host "Custom Presence helper installed to $dest"
Write-Host "Restart Waterfox so the extension can start it."
