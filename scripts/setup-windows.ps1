# Comprueba e instala lo necesario para compilar Focus Timer en Windows.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 [-Install]
# Sin -Install solo informa; con -Install usa winget para instalar lo que falte.
param([switch]$Install)
$ErrorActionPreference = "Continue"

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msvc = $false
if (Test-Path $vswhere) {
  $found = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  $msvc = [bool]$found
}
$webview = Test-Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (-not $webview) { $webview = Test-Path "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" }

$report = [ordered]@{
  "Windows"                  = (Get-CimInstance Win32_OperatingSystem).Caption + " " + [Environment]::OSVersion.Version
  "Node.js"                  = $(if (Have node) { node --version } else { "FALTA" })
  "npm"                      = $(if (Have npm) { npm --version } else { "FALTA" })
  "Rust (rustc)"             = $(if (Have rustc) { rustc --version } else { "FALTA" })
  "Cargo"                    = $(if (Have cargo) { cargo --version } else { "FALTA" })
  "MSVC Build Tools (C++)"   = $(if ($msvc) { "OK" } else { "FALTA" })
  "WebView2 Runtime"         = $(if ($webview) { "OK" } else { "FALTA (el instalador de la app lo descarga)" })
  "winget"                   = $(if (Have winget) { "OK" } else { "FALTA" })
}
$report.GetEnumerator() | ForEach-Object { "{0,-26} {1}" -f $_.Key, $_.Value }
$report | ConvertTo-Json | Set-Content -Encoding UTF8 "$PSScriptRoot\..\setup-report.json"

if (-not $Install) { return }
if (-not (Have winget)) { Write-Error "winget no está disponible; instala las herramientas a mano (ver README)."; return }

if (-not (Have node)) { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements }
if (-not (Have rustc)) { winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements }
if (-not $msvc) {
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements `
    --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
}
"Instalación terminada. Abre una terminal NUEVA y ejecuta de nuevo este script sin -Install para comprobar."
