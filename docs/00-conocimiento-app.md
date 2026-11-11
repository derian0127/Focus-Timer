# Focus Timer — Conocimiento de la app (leer primero)

Resumen para retomar el trabajo sin releer el código. Actualizado: 2026-11-10. Verificado contra el código el mismo día (ajustes, límites, comandos IPC, tamaños de ventana y versiones); si algún valor discrepa, manda el código. Detalle en `01-analisis-y-arquitectura.md`, `02-diseno-ui-ux.md` y `03-documentacion-tecnica.md`; abrirlos solo si este archivo no basta.

## Qué es

App de escritorio para Windows 10/11 x64, con soporte preparado (sin probar) para Linux y macOS: temporizador de enfoque pequeño, local y sin red ni telemetría. Versión 1.0.0, licencia MIT (Derian Cortes). Interfaz en español.

- Stack: Tauri 2.12 + React 19 + TypeScript 7 + Vite 8; lógica en Rust (workspace con `crates/focus-core`).
- Carpeta en el PC de Derian: `C:\Users\Administrator\Desktop\Timer`. Aún no es repositorio git (sin historial: conviene un commit inicial antes de seguir cambiando cosas).
- Se compila en su PC con `2-compilar.cmd` (npm ci → vitest → cargo test → tauri build → copia a `release\`). Registro en `build-log.txt`.
- Datos: `settings.json` en la carpeta de datos de `com.focustimer.desktop` (`%APPDATA%` en Windows, `~/.local/share` en Linux, `~/Library/Application Support` en macOS).
- Multiplataforma: `src-tauri/tauri.linux.conf.json` (deb, rpm, AppImage) y `tauri.macos.conf.json` (dmg universal, `macOSPrivateApi` por la transparencia; el crate `tauri` lleva la feature `macos-private-api` solo en macOS) se fusionan automáticamente con `tauri.conf.json`. `.github/workflows/build.yml` compila los tres sistemas y adjunta instaladores a la Release al subir una etiqueta `v*`; genera `icon.icns` desde `design/app-icon.png`.

## Mapa del código

| Ruta | Contenido |
|---|---|
| `crates/focus-core/src/timer.rs` | Máquina de estados `idle → running ⇄ paused → finished`, `kind` focus/break, reloj inyectable, corrección por suspensión |
| `crates/focus-core/src/settings.rs` | `Settings` (serde camelCase), `sanitize` / `merge_patch` campo a campo, escritura atómica |
| `src-tauri/src/main.rs` | `AppCtx` (timer, settings, `widget`, `full_pos`), plugins, eventos de ventana, registro de comandos |
| `src-tauri/src/commands.rs` | Única superficie IPC (ver abajo) |
| `src-tauri/src/service.rs` | Hilo del temporizador; emite `timer://state` y `timer://finished` |
| `src-tauri/src/system.rs` | Ventana (modos completo/compacto/widget), posición, bandeja, autostart, aviso de fin |
| `src-tauri/tauri.conf.json` | Ventana `main` 400×600, sin decoraciones, `transparent: true`, CSP estricta, NSIS |
| `src-tauri/capabilities/default.json` | Solo listen/unlisten, start-dragging y close |
| `src/ipc/` | `types.ts` (tipos + interfaz `Backend`), `tauri.ts` (real), `memory.ts` (simulado para pruebas y `npm run dev`) |
| `src/state/store.ts` | `Model` { ready, timer, settings, view, widget, editing } y acciones |
| `src/ui/` | `TimerView`, `SettingsView`, `CompactView`, `WidgetView`, `TitleBar`, `Counter` (Time/Bar/Ring/Segments), `DurationEditor`, `controls`, `icons` |
| `src/styles/` | `tokens.css` (generado desde `design/color-tokens.json`, no editar) y `app.css` |
| `src/audio/` | Sonidos sintetizados con Web Audio + archivo propio |
| `tests/` | Vitest + Testing Library: `app.test.tsx`, `store.test.ts`, `audio.test.ts`, `time.test.ts` |

Regla de capas: `ui → state → ipc`. Ningún componente llama a Tauri. `focus-core` no conoce Tauri.

## IPC

Comandos: `get_state` → `{ timer, settings, widget }`; `timer_start(durationMs?)`, `timer_start_break(durationMs)`, `timer_pause`, `timer_resume`, `timer_reset`, `timer_cancel`, `timer_set_duration(durationMs)`; `settings_update(patch)`; `sound_pick_custom`, `sound_read_custom`; `window_set_widget(on)`.

Eventos: `timer://state`, `timer://finished` (Snapshot) y `window://widget` (bool).

`Snapshot` = { phase, kind, durationMs, remainingMs }.

## Settings

`defaultDurationMs` (1 s–180 min, 25 min), `breakDurationMs` (1–60 min, 5), `counterStyle` (digital | ring | minimal | compact), `lastFullStyle`, `timeVisibility` (show | progress), `theme` (system | light | dark), `sound` (bell | bowl | wood | chime | custom), `volume` 0–100, `muted`, `customSoundPath`, `autostart`, `closeBehavior` (tray | exit), `alwaysOnTop`, `windowPos`, `widgetPos`, `widgetOpacity` (20–100).

La interfaz no puede fijar `customSoundPath`, `windowPos`, `widgetPos` ni `version`. Un campo inválido se ignora, nunca rompe el arranque.

## Comportamiento que hay que recordar

- **Descanso:** al terminar un enfoque de ≥ 5 min se sugiere un descanso con duración editable ahí mismo; se recuerda en `breakDurationMs`. El umbral es `BREAK_SUGGESTION_THRESHOLD_MS` en `src/ipc/types.ts`, aplicado por `suggestsBreak` en `src/lib/time.ts` (solo UI; el backend valida 1–60 min con `validate_break_ms`).
- **Compacto:** estilo de contador que deja la ventana en 300×64; «Ampliar» vuelve a `lastFullStyle`.
- **Widget:** minimizar (botón propio o minimizado nativo, detectado en `WindowEvent::Resized`) no va a la barra de tareas: `system::set_widget` deja la ventana siempre visible, sin botón en la barra de tareas y con tamaño según estilo — Digital 124×84, Minimal 124×60, Anillo 104×104, Compacto usa el último estilo completo. Botones al pasar el ratón (acción principal y ampliar); Esc o clic en la bandeja amplían. Estado no persistente; posición propia en `widgetPos`.
- **Transparencia:** Ajustes → Apariencia → «Transparencia del widget» (0–80 % en la interfaz; se guarda como `widgetOpacity` = 100 − transparencia, 20–100). Solo atenúa el fondo del widget con `color-mix` sobre `--bg`; texto y progreso opacos.
- **Cerrar:** a la bandeja o salir, según `closeBehavior`. Al terminar una sesión la ventana reaparece y suena el aviso.
- **Atajos:** Espacio (acción principal), R (reiniciar), Esc (cancelar / salir de editor o Ajustes / ampliar widget), 1–4 (preajustes), Ctrl+, (Ajustes).

## Estilo visual

Material Design 3 con identidad propia: verde primario, ámbar para descanso y fin, superficies cálidas, tipografía Hanken Grotesk empaquetada, iconos propios de 24 px. Colores solo por tokens `--ft-*`; las fases cambian variables en `.app[data-phase|data-kind]`.

## Cómo trabajar en ella

1. Los cambios se preparan y prueban fuera del PC (vitest, `tsc --noEmit`, `cargo test -p focus-core`) y se copian a la carpeta. `src-tauri` solo se compila en Windows: lo que toque ventana o plugins queda sin verificar hasta que Derian compile.
2. En la carpeta conectada no se puede borrar ni renombrar: sobrescribir en sitio (`cat origen > destino`), no usar `sed -i`, `tar -x` directo ni git.
3. Toda función nueva lleva prueba (`tests/` o `#[cfg(test)]`) y, si cambia el comportamiento, una línea en `03-documentacion-tecnica.md` y en `README.md`.
4. Dependencias mínimas: no añadir crates ni paquetes sin necesidad clara.

## Estado y pendientes (2026-11-10)

- Compilada e instalada por Derian la versión con descanso; funciona.
- Widget y transparencia: en el código, **sin compilar todavía en Windows**. Revisar al probar: parpadeo al minimizar desde la barra de tareas, comportamiento con Win+D, ancho real de 124 px y efectos de `transparent: true` en la ventana normal.
- Linux/macOS: configuración y CI escritas, **nunca ejecutadas ni probadas**. Pendiente: lanzar el workflow a mano y corregir fallos; comprobar widget, transparencia y bandeja (en Wayland «siempre visible» depende del compositor; GNOME necesita AppIndicator). macOS sin firmar: clic derecho → Abrir.
- Publicación en GitHub (repositorio ya creado, falta subir el código): `.gitignore` ya excluye `release/`, `Claude outputs/`, `build-log.txt` y `setup-report.json`. El README ya está reescrito con descripción e instalación por sistema. Faltan captura o GIF del widget, README en inglés y Release `v1.0.0` con los instaladores (sin firmar: aviso de SmartScreen).
