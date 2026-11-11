# Focus Timer — Documentación técnica

Fecha: 2026-11-10 · Versión 1.0.0

## 1. Módulos

| Módulo | Ubicación | Responsabilidad | Depende de |
|---|---|---|---|
| Lógica del temporizador | `crates/focus-core/src/timer.rs` | Máquina de estados, validación de duraciones, reloj inyectable | — |
| Configuración y persistencia | `crates/focus-core/src/settings.rs` | Modelo, saneado campo a campo, lectura tolerante, escritura atómica | serde, serde_json |
| Servicio del temporizador | `src-tauri/src/service.rs` | Hilo propio que hace avanzar el temporizador y publica instantáneas | focus-core |
| Comandos (IPC) | `src-tauri/src/commands.rs` | Única superficie invocable desde la interfaz; validación de entradas; archivo de audio | focus-core, tauri |
| Servicios del sistema | `src-tauri/src/system.rs` | Ventana, bandeja, inicio con Windows, aviso de fin | tauri, plugins |
| Cliente IPC | `src/ipc/` | Interfaz `Backend`, implementación Tauri y backend en memoria | @tauri-apps/api |
| Estado de la UI | `src/state/` | Refleja instantáneas y traduce gestos en comandos | ipc |
| Sonido | `src/audio/` | Síntesis de los sonidos integrados y reproducción | Web Audio |
| Interfaz | `src/ui/`, `src/styles/` | Componentes MD3 propios y vistas | state |

Reglas: `ui → state → ipc`. Ningún componente llama a Tauri directamente. `focus-core` no conoce Tauri ni Windows.

## 2. Temporizador

Fases: `idle → running ⇄ paused → finished`.

| Operación | Desde | Efecto |
|---|---|---|
| `start` | idle, finished | running con la duración completa |
| `pause` | running | paused; congela el restante |
| `resume` | paused | running |
| `reset` | running, paused | Duración completa, misma fase |
| `cancel` | cualquiera | idle con la duración predeterminada |
| `set_duration` | idle, finished | Cambia la duración; pasa a idle (enfoque) |
| `start_break` | idle, finished | running como descanso de 1–60 min |

**Descanso.** Cada sesión es de enfoque o de descanso (`kind`). Al terminar un enfoque de 5 minutos o más, la interfaz sugiere un descanso cuya duración se edita ahí mismo (1–60 min, 5 por defecto) y se recuerda en `breakDurationMs`. Tras un descanso, iniciar vuelve a la duración de enfoque predeterminada. No hay ciclos automáticos ni contador de sesiones.

**Medición.** `restante = base − transcurrido`. `transcurrido` es el reloj monotónico más una corrección: en cada tick se comparan monotónico y reloj de pared desde el inicio; si el de pared va más de 5 s por delante, la diferencia se suma como tiempo suspendido. La corrección solo crece, así que atrasar la hora del sistema no devuelve tiempo.

**Hilo.** Duerme en una variable de condición. Con una sesión en marcha despierta en cada cambio de segundo visible, con un máximo de 500 ms. Publica `timer://state` cuando cambia la fase, la duración o el segundo visible, y `timer://finished` una sola vez al terminar. La interfaz no tiene temporizadores propios: dibuja la última instantánea.

## 3. IPC

| Comando | Argumentos | Devuelve |
|---|---|---|
| `get_state` | — | `{ timer, settings }` |
| `timer_start` | `durationMs?` | Instantánea |
| `timer_start_break` | `durationMs` (1–60 min) | Instantánea |
| `timer_pause` / `timer_resume` / `timer_reset` / `timer_cancel` | — | Instantánea |
| `timer_set_duration` | `durationMs` | Instantánea |
| `settings_update` | `patch` (campos parciales) | Configuración validada |
| `sound_pick_custom` | — | Configuración o `null` si se cancela |
| `sound_read_custom` | — | Bytes del archivo elegido |

Errores: `invalid_duration`, `invalid_transition`, `sound_not_found`, `sound_unsupported_format`, `sound_too_large`, `settings_write_failed`.

## 4. Seguridad

| Medida | Dónde |
|---|---|
| CSP `default-src 'self'`; sin scripts ni estilos remotos | `tauri.conf.json` |
| Permisos de la ventana: escuchar eventos, arrastrar, cerrar (el modo widget lo aplica el backend con `window_set_widget`) | `capabilities/default.json` |
| Sin plugins `fs`, `shell` ni `http`; sin ejecución de comandos | `src-tauri/Cargo.toml` |
| La interfaz no envía rutas: el selector se abre en Rust y solo se lee el archivo elegido | `commands.rs` |
| Archivo de audio: lista de extensiones, tamaño 1 byte–10 MB, debe ser archivo regular | `validate_audio_file` |
| `settings_update` descarta `customSoundPath`, `windowPos`, `widgetPos` y `version` | `commands.rs` |
| Configuración: cada campo validado; archivo > 64 KB ignorado; escritura atómica | `settings.rs` |
| Sin red, sin telemetría, sin secretos en el código | Todo el proyecto |

Pendiente declarado: los comandos propios no llevan permisos individuales (Tauri los permite a la única ventana local). Si algún día se añade una segunda ventana o contenido remoto, hay que declararlos en `build.rs`.

## 5. Dependencias

Directas, con versión exacta en `package.json` y `Cargo.lock`:

| Dependencia | Versión | Licencia | Motivo |
|---|---|---|---|
| tauri (+ tauri-build) | 2.12 | MIT / Apache-2.0 | Framework: ventana, IPC, bandeja |
| tauri-plugin-single-instance | 2.5 | MIT / Apache-2.0 | Una sola instancia |
| tauri-plugin-autostart | 2.7 | MIT / Apache-2.0 | Inicio con Windows |
| tauri-plugin-dialog | 2.8 | MIT / Apache-2.0 | Selector nativo de archivo |
| serde, serde_json | 1 | MIT / Apache-2.0 | Configuración e IPC |
| react, react-dom | 19.3.1 | MIT | Interfaz |
| @tauri-apps/api | 2.12.4 | MIT / Apache-2.0 | Cliente IPC |
| @fontsource-variable/hanken-grotesk | 5.3.0 | OFL-1.1 | Tipografía empaquetada |
| Dev: vite 8.3.7, vitest 5.1.0, typescript 7.0.2, jsdom 31.0.0, @testing-library/react 16.3.3, @types/react(-dom), @tauri-apps/cli 2.12.4 | | MIT / Apache-2.0 | Compilación y pruebas |

Descartadas por innecesarias: `tauri-plugin-store` y `tauri-plugin-window-state` (la configuración y la posición se guardan con código propio), `@vitejs/plugin-react` (Vite 8 transforma JSX sin él), librerías de estado, de componentes y de iconos, y cualquier archivo de audio.

## 6. Pruebas

| Requisito del encargo | Prueba |
|---|---|
| Inicio | `timer.rs::start_counts_down`; `app.test.tsx` «inicia una sesión con una sola interacción» |
| Pausa y reanudación | `pause_freezes_and_resume_continues`; «pausa, reanuda, reinicia y cancela» |
| Reinicio | `reset_keeps_phase` |
| Finalización | `finishes_exactly_once`, `late_tick_does_not_underflow`; «al terminar muestra la indicación visual…» |
| Precisión temporal | `irregular_ticks_do_not_drift` |
| Reproducción de sonidos | `audio.test.ts` (síntesis, volumen, silencio, archivo propio, respaldo) |
| Persistencia | `settings.rs::round_trips_through_disk`, `missing_or_corrupt_file_falls_back_to_defaults`; «cada control guarda su valor» |
| Validación de tiempos | `validates_durations`, `duration_bounds_are_enforced`; `time.test.ts`; «rechaza duraciones inválidas…» |
| Ventana minimizada | `unobserved_time_still_counts` (lógica). El comportamiento real con la ventana oculta es prueba manual |
| Suspensión de Windows | `suspend_*` (ambos comportamientos posibles del reloj). La suspensión real es prueba manual |
| Botones sin función, accesibilidad, teclado | «auditoría de la interfaz», «atajos de teclado» |

### Pruebas manuales en Windows (Fase 5)

1. Instalar, abrir, iniciar una sesión de 00:10 y comprobar sonido e indicación visual.
2. Iniciar 01:00, minimizar; el aviso debe sonar a tiempo.
3. Iniciar 02:00, cerrar a la bandeja; al terminar la ventana reaparece.
4. Iniciar 05:00, suspender el equipo 1 minuto; al volver debe quedar ≈ 04:00 menos lo transcurrido.
5. Iniciar 01:00, suspender 2 minutos; al volver debe estar completada.
6. Cambiar cada ajuste, cerrar del todo y reabrir: se conservan.
7. Sonido propio: elegir un MP3; vista previa; borrar el archivo y comprobar que suena la campana.
8. Estilo Compacto con «siempre visible» sobre otra ventana a pantalla completa.
9. Recorrer toda la interfaz solo con teclado.
10. Medir memoria y CPU en reposo y con sesión en marcha (Administrador de tareas).

## 7. Resultados de la Fase 4 (2026-11-10, entorno Linux)

| Comprobación | Resultado |
|---|---|
| `cargo test --workspace` | 32 pruebas, 0 fallos (31 en `focus-core`, 1 en la app) |
| `npm test` (Vitest) | 71 pruebas, 0 fallos |
| `cargo clippy --workspace --all-targets -- -D warnings` | Sin avisos |
| `tsc --noEmit` (modo estricto) | Sin errores |
| `npm audit` | 0 vulnerabilidades en 144 paquetes (6 de producción) |
| `cargo audit` | 0 vulnerabilidades en 473 crates del `Cargo.lock`; 5 avisos |

Los 5 avisos de `cargo audit` son crates sin mantenimiento o con un fallo de solidez (`glib`, `zvariant`, `zvariant_derive`, `zbus_names`, `proc-macro-error`). Ninguno forma parte del árbol de dependencias de Windows (285 crates, comprobado con `cargo tree --target x86_64-pc-windows-msvc -i <crate>`): son dependencias de Tauri para Linux que aparecen en el `Cargo.lock` común.

**Lo que no está verificado todavía.** El backend se ha compilado y probado en Linux, no en Windows: el código específico de Windows de Tauri y sus plugins no se ha compilado aquí. Tampoco se ha visto la interfaz renderizada ni se han oído los sonidos. Rendimiento, consumo de memoria, tamaño del instalador y las diez pruebas manuales de §6 dependen de la compilación en Windows.

## 8. Compilación en Windows (2026-11-10)

Windows 11 Pro, Node 24.16, Rust 1.99.1, Build Tools 2022. Versión sin la función de descanso: 65 pruebas de interfaz y 30 de Rust en verde; instalador NSIS de 1,31 MB y ejecutable de 3,42 MB.

Corregido tras la primera prueba de uso: el icono ✓ de «Sesión completada» aparecía girado 90° y ampliado, porque la regla CSS que rota el anillo alcanzaba a cualquier SVG dentro de él. Ahora solo afecta al SVG del anillo.

## 9. Modo widget (al minimizar)

Minimizar no envía la ventana a la barra de tareas: la convierte en un widget flotante, siempre visible y sin botón en la barra de tareas.

| Estilo de contador | Tamaño del widget (px lógicos) | Contenido |
| --- | --- | --- |
| Digital | 124 × 84 | Tiempo + barra (o segmentos con «solo progreso») |
| Minimal | 124 × 60 | Tiempo (o barra fina con «solo progreso») |
| Anillo | 104 × 104 | Anillo con el tiempo dentro |
| Compacto | el del último estilo completo | — |

- **Entrada:** botón «Minimizar a widget» de la barra de título (comando `window_set_widget`) o minimizado nativo de Windows (barra de tareas, Win+↓), que `main.rs` detecta en `WindowEvent::Resized` y convierte en widget tras 150 ms.
- **Salida:** botón «Ampliar ventana» del widget (aparece al pasar el ratón), tecla Esc, clic en el icono de la bandeja o volver a ejecutar la app.
- **Estado:** `AppCtx.widget` (no se guarda; la app siempre arranca con la ventana normal). El backend avisa a la interfaz con el evento `window://widget`.
- **Posición:** el widget recuerda la suya en `widgetPos` (por defecto, esquina inferior derecha del área de trabajo); la ventana normal vuelve a la que tenía. La interfaz no puede fijar ninguna de las dos.
- **Transparencia:** ajuste «Transparencia del widget» (0–80 %, guardado como `widgetOpacity` 20–100). La ventana se crea con `transparent: true` y solo se atenúa el fondo con `color-mix`; el tiempo y el progreso siguen opacos. La ventana normal no cambia.
- **Código:** `system::set_widget` y `system::widget_size` (Rust), `src/ui/WidgetView.tsx` (interfaz).
- **Prueba manual:** minimizar con cada estilo, arrastrar el widget, pausar/reanudar desde él, dejar que termine una sesión en modo widget (debe sonar el aviso), ampliar y comprobar que la ventana vuelve a su sitio y a su ajuste de «siempre visible».

