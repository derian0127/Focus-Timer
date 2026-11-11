# Compila Focus Timer y genera el instalador. Ejecutar desde la raíz del proyecto:
#   powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
# Deja un registro en build-log.txt y copia el instalador a la carpeta release\.
$ErrorActionPreference = "Continue"
Set-Location "$PSScriptRoot\.."
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:NO_COLOR = "1"
$env:CARGO_TERM_COLOR = "never"
$log = Join-Path (Get-Location) "build-log.txt"

function Log($text) {
  $text | Out-Host
  $text | Out-File -FilePath $log -Encoding utf8 -Append
}

# Las herramientas escriben su progreso en stderr. Se ejecutan a través de cmd
# para unir stdout y stderr sin que PowerShell lo trate como un error.
function Step($name, $command) {
  Log "`n--- $name ---"
  Log "> $command"
  cmd /c "$command 2>&1" | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) {
    Log "FALLO en: $name (codigo $LASTEXITCODE)"
    exit 1
  }
}

"== Focus Timer build $(Get-Date -Format s) ==" | Out-File -FilePath $log -Encoding utf8

Log "--- entorno ---"
foreach ($tool in "node", "npm", "rustc", "cargo", "rustup") {
  $found = Get-Command $tool -ErrorAction SilentlyContinue
  if ($found) { Log ("{0,-7} {1}" -f $tool, $found.Source) } else { Log ("{0,-7} NO ENCONTRADO" -f $tool) }
}
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
  $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($vs) { Log "MSVC    $vs" } else { Log "MSVC    Visual Studio instalado, pero SIN las herramientas de C++" }
} else {
  Log "MSVC    NO ENCONTRADO (falta vswhere.exe)"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Log "FALLO: no se encuentra cargo. Ejecuta 1-preparar-entorno.cmd y abre una ventana nueva."
  exit 1
}
Step "versiones" "node --version && rustc --version && cargo --version && rustup show active-toolchain"

Step "npm ci" "npm ci --no-audit --no-fund"
Step "pruebas de interfaz (vitest)" "npm test"
Step "pruebas de Rust" "cargo test --workspace"
Step "tauri build" "npm run app:build"

New-Item -ItemType Directory -Force release | Out-Null
Get-ChildItem "target\release\bundle\nsis\*-setup.exe" | Copy-Item -Destination release -Force
Copy-Item "target\release\focus-timer.exe" release -Force
Log "`n--- resultado ---"
Get-ChildItem release | ForEach-Object {
  Log ("{0}  {1:N2} MB  SHA256 {2}" -f $_.Name, ($_.Length / 1MB), (Get-FileHash $_.FullName -Algorithm SHA256).Hash)
}
Log "BUILD OK"
