# Focus Timer

**Un temporizador de enfoque pequeño, rápido y privado para Windows, Linux y macOS.**
Sin cuentas, sin internet, sin telemetría: tu configuración vive solo en tu equipo.

## Por qué te va a gustar

- **Widget flotante.** Al minimizar no desaparece en la barra de tareas: se convierte en un widget diminuto, siempre visible, que arrastras donde quieras y con transparencia ajustable.
- **Cuatro estilos de contador.** Digital, Anillo, Minimal y Compacto (una barra de 300 × 64), o solo el progreso si prefieres no mirar los números.
- **Descansos inteligentes.** Al terminar un enfoque largo te propone un descanso con la duración que elijas, y la recuerda.
- **Rápido de usar.** Sesiones de 00:01 a 180:00, preajustes de 15, 25, 45 y 60 minutos y atajos de teclado para todo.
- **Sonidos a tu gusto.** Cuatro avisos integrados (campana, cuenco, madera, campanilla) o tu propio archivo de audio, con volumen y silencio.
- **Se ve bien.** Diseño Material 3 con tema claro, oscuro o el del sistema.
- **Discreto.** Vive en la bandeja del sistema, puede arrancar con el equipo y te avisa solo cuando la sesión termina.
- **Ligero y privado.** Hecho con Tauri y Rust: instalador pequeño, poco consumo y ninguna conexión de red.

## Instalación

Descarga el instalador de tu sistema desde la página de [Releases](../../releases):

| Sistema | Archivo |
|---|---|
| Windows 10/11 (x64) | `Focus Timer_x.y.z_x64-setup.exe` |
| Linux (Debian, Ubuntu…) | `.deb` |
| Linux (Fedora, openSUSE…) | `.rpm` |
| Linux (cualquiera) | `.AppImage` (`chmod +x` y ejecutar) |
| macOS 10.15 o posterior (Intel y Apple Silicon) | `.dmg` |

Los instaladores no están firmados:

- **Windows:** SmartScreen avisa la primera vez. «Más información» → «Ejecutar de todas formas».
- **macOS:** la primera vez, clic derecho sobre la app → «Abrir». Si dice que está dañada: `xattr -cr "/Applications/Focus Timer.app"`.
- **Linux:** en GNOME hace falta la extensión «AppIndicator» para ver el icono de bandeja.

## Compilar desde el código

Las versiones de Linux y macOS las compila GitHub Actions (`.github/workflows/build.yml`) al publicar una etiqueta `v*`. Para compilar tú mismo:

- **Linux:** Node 22+, Rust estable y `libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`; luego `npm ci && npm run app:build`.
- **macOS:** Node 22+, Rust estable y Xcode Command Line Tools; antes de compilar genera el icono con `npx tauri icon design/app-icon.png` y copia `icon.icns` a `src-tauri/icons/`.

### Windows

| Herramienta | Versión | Para qué |
|---|---|---|
| Windows | 10 u 11, x64 | Sistema de destino |
| Node.js | 22 o posterior | Interfaz y CLI de Tauri |
| Rust | 1.90 o posterior (rustup, toolchain `stable-x86_64-pc-windows-msvc`) | Backend |
| Build Tools de Visual Studio | Carga «Desarrollo para el escritorio con C++» | Enlazador MSVC y SDK de Windows |
| WebView2 Runtime | Incluido en Windows 11 | Motor de la interfaz |

`1-preparar-entorno.cmd` comprueba todo lo anterior y, con winget, instala lo que falte. Las Build Tools ocupan varios GB y piden permisos de administrador. Después hay que abrir una terminal nueva.

## Compilar

Doble clic en `2-compilar.cmd`, o desde una terminal en la raíz del proyecto:

```powershell
npm ci
npm test                 # pruebas de la interfaz (Vitest)
cargo test --workspace   # pruebas de Rust
npm run app:build        # compila y genera el instalador
```

Resultado:

- Instalador: `target\release\bundle\nsis\Focus Timer_1.0.0_x64-setup.exe`
- Ejecutable suelto: `target\release\focus-timer.exe`

El script `scripts\build-windows.ps1` hace esos pasos, copia ambos archivos a `release\` y deja el registro en `build-log.txt`.

## Desarrollo

```powershell
npm run app:dev   # aplicación con recarga en caliente
npm run dev       # solo la interfaz en http://127.0.0.1:1420, con un backend simulado
npm run tokens    # regenera src/styles/tokens.css desde design/color-tokens.json
```

## Atajos

| Tecla | Acción |
|---|---|
| Espacio | Iniciar, pausar, reanudar o repetir |
| R | Reiniciar la sesión |
| Esc | Cancelar la sesión; salir del editor o de Ajustes |
| 1–4 | Elegir preajuste (15, 25, 45, 60 min) |
| Ctrl+, | Abrir o cerrar Ajustes |

## Estructura

```
crates/focus-core/   Lógica pura en Rust: temporizador y configuración (con sus pruebas)
src-tauri/           Aplicación Tauri: comandos, hilo del temporizador, bandeja, ventana
src/                 Interfaz React: ipc/ · state/ · audio/ · ui/ · styles/
tests/               Pruebas de la interfaz
design/              Tokens de color e icono de origen
docs/                Análisis, diseño y documentación técnica
scripts/             Preparación del entorno, compilación y generación de tokens
```

## Dónde se guardan los datos

`settings.json` dentro de la carpeta de datos de la aplicación (`com.focustimer.desktop`): `%APPDATA%\` en Windows, `~/.local/share/` en Linux y `~/Library/Application Support/` en macOS. Es el único archivo que la aplicación escribe. Para restablecer la configuración, bórralo con la aplicación cerrada.

## Limitaciones conocidas

- **El instalador no está firmado.** Windows SmartScreen muestra «Windows protegió su PC» la primera vez; hay que pulsar «Más información» → «Ejecutar de todas formas». Firmarlo requiere un certificado de firma de código de pago.
- **Sin actualizador automático.** Para actualizar se instala la versión nueva encima.
- **WebView2.** Si el equipo no lo tiene (Windows 10 sin actualizar), el instalador lo descarga de Microsoft. Es la única conexión de red de todo el producto y ocurre solo durante la instalación.
- **Sonido personalizado.** Los formatos dependen de los códecs de WebView2: MP3, WAV, OGG, FLAC y M4A/AAC, hasta 10 MB. Si el archivo se mueve o no se puede decodificar, suena la campana integrada.
- **Linux y macOS: sin probar en equipos reales.** Se compilan en CI, pero el widget flotante, la transparencia y la bandeja pueden comportarse distinto (en Wayland, «siempre visible» depende del compositor).
- **Suspensión.** El tiempo real cuenta: si el equipo se suspende y despierta después del final, la sesión aparece como completada.

Más detalle en `docs/`.

## Licencia

MIT. La tipografía Hanken Grotesk se distribuye bajo SIL Open Font License 1.1.
