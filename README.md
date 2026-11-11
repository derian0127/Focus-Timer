# Focus Timer

**Un temporizador de enfoque pequeño, rápido y privado.**
Para Windows, Linux y macOS. Sin cuentas, sin internet y sin telemetría.

### [⬇️ Descargar la última versión](https://github.com/derian0127/Focus-Timer/releases/latest)

---

## Instalar en 3 pasos

1. Pulsa **Descargar** y elige el archivo de tu sistema.
2. Ábrelo con doble clic.
3. Listo: busca **Focus Timer** en tu menú de aplicaciones.

| Tu sistema | Descarga este archivo |
|---|---|
| **Windows** 10 u 11 | `Focus Timer_…_x64-setup.exe` |
| **macOS** 10.15 o posterior (Intel y Apple Silicon) | `.dmg` |
| **Linux** Ubuntu, Debian, Mint | `.deb` |
| **Linux** Fedora, openSUSE | `.rpm` |
| **Linux** cualquier otra | `.AppImage` (clic derecho → Propiedades → «Permitir ejecutar») |

> **¿Te sale una advertencia al abrirlo?** Es normal: la app es gratuita y aún no está firmada.
> - **Windows:** «Más información» → «Ejecutar de todas formas».
> - **macOS:** clic derecho sobre la app → «Abrir». Si dice que está dañada, ejecuta una vez en la Terminal: `xattr -cr "/Applications/Focus Timer.app"`
> - **Linux:** funciona en cualquier escritorio (GNOME, KDE Plasma, XFCE, Cinnamon, MATE…). Solo GNOME no muestra el icono de la bandeja por defecto: instala la extensión «AppIndicator». En los demás aparece sin hacer nada.

---

## Qué hace

- **Widget flotante.** Al minimizar se convierte en un widget diminuto, siempre visible, que arrastras donde quieras y con transparencia ajustable.
- **Cuatro estilos de contador.** Digital, Anillo, Minimal y Compacto, o solo el progreso si prefieres no ver los números.
- **Descansos inteligentes.** Al terminar un enfoque largo te propone un descanso con la duración que elijas y la recuerda.
- **Rápido.** Sesiones de 00:01 a 180:00 y preajustes de 15, 25, 45 y 60 minutos.
- **Sonidos a tu gusto.** Cuatro avisos integrados o tu propio audio, con volumen y silencio.
- **Se ve bien.** Tema claro, oscuro o el del sistema.
- **Discreto.** Vive en la bandeja del sistema, puede arrancar con el equipo y avisa solo cuando termina.
- **Privado y ligero.** Nada sale de tu equipo; la configuración se guarda en un solo archivo local.

## Cómo se usa

1. Elige un preajuste (15, 25, 45 o 60 min) o escribe tu propia duración.
2. Pulsa **Espacio** para empezar.
3. Minimiza y sigue trabajando: el widget te acompaña.
4. Cuando suene el aviso, toma el descanso que te propone.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| Espacio | Iniciar, pausar, reanudar o repetir |
| R | Reiniciar la sesión |
| Esc | Cancelar; salir del editor o de Ajustes; ampliar el widget |
| 1–4 | Preajustes de 15, 25, 45 y 60 min |
| Ctrl+, | Abrir o cerrar Ajustes |

---

## Preguntas frecuentes

**¿Necesito usar la Terminal o compilar algo?** No. Basta con descargar el instalador y abrirlo.

**¿Se conecta a internet?** No. La única excepción: en Windows 10 sin actualizar, el instalador descarga WebView2 de Microsoft durante la instalación.

**¿Dónde guarda mis datos?** En un archivo `settings.json` dentro de la carpeta `com.focustimer.desktop`: `%APPDATA%` en Windows, `~/.local/share` en Linux y `~/Library/Application Support` en macOS. Para restablecer la configuración, cierra la app y bórralo.

**¿Cómo actualizo?** Descarga la versión nueva e instálala encima; no hay actualizador automático.

**¿Qué formatos de audio acepta?** MP3, WAV, OGG, FLAC y M4A/AAC de hasta 10 MB. Si el archivo no se puede reproducir, suena la campana integrada.

**¿Y si el equipo se suspende?** El tiempo real cuenta: si despierta después del final, la sesión aparece como completada.

**Linux y macOS.** Se compilan automáticamente en GitHub, pero se han probado menos que Windows. El widget, la transparencia y la bandeja pueden variar según el escritorio (en Wayland, «siempre visible» depende del compositor). Si algo falla, abre un [issue](https://github.com/derian0127/Focus-Timer/issues).

---

## Para desarrolladores

<details>
<summary><b>Compilar desde el código</b></summary>

Las versiones publicadas las compila GitHub Actions (`.github/workflows/build.yml`) al subir una etiqueta `v*`.

**Windows** — requisitos:

| Herramienta | Versión |
|---|---|
| Node.js | 22 o posterior |
| Rust | 1.90 o posterior (`stable-x86_64-pc-windows-msvc`) |
| Build Tools de Visual Studio | Carga «Desarrollo para el escritorio con C++» |
| WebView2 Runtime | Incluido en Windows 11 |

`1-preparar-entorno.cmd` comprueba todo y, con winget, instala lo que falte (las Build Tools ocupan varios GB y piden permisos de administrador). Después abre una terminal nueva y haz doble clic en `2-compilar.cmd`, o:

```powershell
npm ci
npm test                 # pruebas de la interfaz (Vitest)
cargo test --workspace   # pruebas de Rust
npm run app:build        # compila y genera el instalador
```

Resultado: `target\release\bundle\nsis\Focus Timer_1.0.0_x64-setup.exe` y `target\release\focus-timer.exe`. `scripts\build-windows.ps1` copia ambos a `release\` y deja el registro en `build-log.txt`.

**Linux** — Node 22+, Rust estable y `libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`; luego `npm ci && npm run app:build`.

**macOS** — Node 22+, Rust estable y Xcode Command Line Tools. Antes de compilar: `npx tauri icon design/app-icon.png` y copia `icon.icns` a `src-tauri/icons/`.

</details>

<details>
<summary><b>Desarrollo y estructura</b></summary>

```powershell
npm run app:dev   # aplicación con recarga en caliente
npm run dev       # solo la interfaz en http://127.0.0.1:1420, con un backend simulado
npm run tokens    # regenera src/styles/tokens.css desde design/color-tokens.json
```

```
crates/focus-core/   Lógica pura en Rust: temporizador y configuración (con sus pruebas)
src-tauri/           Aplicación Tauri: comandos, hilo del temporizador, bandeja, ventana
src/                 Interfaz React: ipc/ · state/ · audio/ · ui/ · styles/
tests/               Pruebas de la interfaz
design/              Tokens de color e icono de origen
docs/                Análisis, diseño y documentación técnica
scripts/             Preparación del entorno, compilación y generación de tokens
```

Más detalle en `docs/`.

</details>

---

## Licencia

MIT. La tipografía Hanken Grotesk se distribuye bajo SIL Open Font License 1.1.
