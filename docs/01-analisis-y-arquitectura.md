# Focus Timer — Fase 1: análisis, stack y arquitectura

Fecha: 2026-11-10 · Estado: **aceptado**. Decisiones de Derian: stack Tauri 2 + React + TypeScript; la compilación y el instalador se hacen en su PC (opción 1 de R1).

Convención de este documento: **[verificado]** = comprobado hoy contra la fuente indicada; **[estimación]** = orden de magnitud de referencia, no medido en este proyecto (se medirá en la Fase 4); **[hipótesis]** = hay que demostrarlo con una prueba en Windows.

---

## 1. Decisión

**Tauri 2 (backend Rust) + React 19 + TypeScript + Vite, con CSS propio basado en tokens de Material Design 3.**

El motor del temporizador, la persistencia y la integración con Windows viven en Rust. La interfaz web solo dibuja el estado que recibe.

## 2. Alternativas evaluadas

| Criterio | Tauri 2 | Electron | .NET 10 + WPF | .NET + WinUI 3 |
|---|---|---|---|---|
| Instalador [estimación] | 3–6 MB (usa el WebView2 del sistema) | 80–100 MB (incluye Chromium) | <5 MB si el equipo ya tiene .NET Desktop Runtime; 60–70 MB autocontenido | Decenas de MB autocontenido (Windows App SDK) |
| Memoria en reposo [estimación] | 60–120 MB sumando los procesos de WebView2 | 150–300 MB | 50–90 MB | 60–100 MB |
| Arranque [estimación] | <1 s | 1–2 s | <1 s | ~1 s |
| Fidelidad al diseño MD3 propio | Alta: CSS/SVG, tokens 1:1 con Figma | Alta (igual que Tauri) | Media: hay que construir cada control en XAML; no hay MD3 oficial | Baja: el lenguaje nativo es Fluent, no MD3 |
| Modelo de seguridad | Capacidades y permisos por comando; sin Node en la UI | Requiere endurecer a mano (contextIsolation, sandbox…) | Proceso nativo con todos los permisos del usuario | Igual que WPF |
| Mantenimiento | Tauri 2.12.5 publicado el 2026-11-06 [verificado: crates.io] | Muy activo; actualizaciones de Chromium frecuentes y obligatorias | .NET 10 es LTS hasta 2028-11-14 [verificado: política de soporte de .NET] | Activo, empaquetado más frágil |
| Herramientas para compilar en Windows | Rust + MSVC Build Tools + Node | Node | SDK de .NET | SDK de .NET + Windows App SDK |

### Lectura honesta de la tabla

- **Tauri no gana en memoria frente a WPF.** WebView2 es Chromium multiproceso; la ventaja real de Tauri es el tamaño en disco y la libertad de diseño, no la RAM. Si la RAM fuese el criterio dominante, WPF sería igual o mejor.
- **WPF es la alternativa seria.** Es nativo, estable y con LTS. Lo descarto por el coste de diseño: los cuatro estilos de contador, el anillo de progreso y un sistema MD3 con identidad propia son días de trabajo en XAML frente a horas en CSS/SVG, y el resultado en Figma se traslada 1:1 a tokens CSS.
- **Electron queda fuera** por tamaño y consumo; no aporta nada que este producto necesite.
- **WinUI 3 queda fuera** porque empuja hacia Fluent y su empaquetado sin MSIX sigue siendo incómodo.

### Por qué React y no algo más pequeño

Preact o Svelte producirían un bundle menor, pero aquí el bundle se carga desde disco y la diferencia no es perceptible. React 19 aporta el ecosistema de pruebas más maduro (Vitest + Testing Library) y es lo que más gente sabe mantener. No se usa ninguna librería de estado, de componentes ni de estilos: la UI es pequeña y esas dependencias no se justifican.

## 3. Arquitectura

```
┌──────────────────────── Proceso Rust (Tauri) ────────────────────────┐
│  timer-core (crate puro, sin dependencias)                           │
│    máquina de estados · reloj inyectable · validación de duraciones  │
│  app                                                                 │
│    timer_service   hilo propio; emite «timer://state» a la UI        │
│    settings        JSON versionado, validación, escritura atómica    │
│    sound_files     selector nativo + lectura acotada del audio local │
│    system          bandeja, inicio con Windows, ventana, instancia   │
│                    única                                             │
│    commands        única superficie expuesta a la UI (IPC tipado)    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ invoke() / eventos
┌───────────────────────────────┴──────── WebView2 ────────────────────┐
│  ipc/        cliente tipado de comandos y eventos                    │
│  state/      store mínimo (useSyncExternalStore)                     │
│  audio/      sintetizador Web Audio + reproductor de archivo local   │
│  ui/         componentes MD3 propios · 4 estilos de contador         │
│  styles/     tokens.css (generado desde design/tokens.json)          │
└──────────────────────────────────────────────────────────────────────┘
```

Reglas de dependencia: `ui → state → ipc`; ningún componente llama a `invoke` directamente; `timer-core` no conoce Tauri.

### 3.1 Temporizador (el punto crítico)

- **El motor está en Rust, no en JavaScript.** Chromium ralentiza los temporizadores de páginas ocultas o minimizadas (hasta un disparo por minuto tras varios minutos en segundo plano). Un `setInterval` en la UI retrasaría el aviso final. El hilo de Rust no sufre esa limitación.
- **No se cuentan ticks.** Se guarda el instante de inicio y la duración; el tiempo restante siempre se *calcula* (`duración − transcurrido`). Perder un tick no acumula error.
- **Reloj doble.** Transcurrido = reloj monotónico (`Instant`), contrastado con el reloj de pared (`SystemTime`). Si el de pared va más de 5 s por delante, se asume suspensión y se usa el de pared; si alguien atrasa la hora del sistema, se mantiene el monotónico. Así el resultado no depende de si el contador monotónico de Windows avanza o no durante la suspensión **[hipótesis: se comprobará suspendiendo el equipo en la Fase 4]**.
- **Semántica ante suspensión:** el tiempo real cuenta. Si el equipo duerme y despierta después del final, la sesión aparece como terminada.
- **La UI interpola.** Recibe instantáneas `{estado, restante_ms, emitido_en}` y anima con `requestAnimationFrame`; si la ventana está oculta no se dibuja nada.
- El reloj es un *trait* inyectable: las pruebas de precisión, pausa y suspensión usan un reloj falso y son deterministas.

### 3.2 Sonido

- **Sonidos integrados sintetizados con Web Audio** (osciladores + envolventes). No hay archivos de audio que licenciar ni empaquetar, y el volumen y la vista previa son triviales.
- **Archivo local personalizado:** el selector nativo se abre desde Rust; Rust valida extensión y tamaño (límite 10 MB), guarda la ruta y entrega los bytes a la UI. La UI nunca envía rutas, así que no puede pedir archivos arbitrarios.
- Riesgo: la política de reproducción automática de WebView2. Se fija por configuración y se prueba con la ventana minimizada.

### 3.3 Persistencia

`settings.json` en `%APPDATA%\<identificador>\`. Esquema versionado, cada campo validado al leer (un valor inválido vuelve a su valor por defecto, no rompe la app), escritura atómica (temporal + renombrado). No se guarda historial de sesiones.

## 4. Alcance

**Incluido:** todo lo de las secciones 4 y 5 del encargo, más tema «Sistema», recordar posición de la ventana y atajos (Espacio, R, Esc, Ctrl+,).

**Interpretaciones que conviene que valides:**

- *Reiniciar* vuelve a la duración completa y sigue en el estado en que estaba; *Cancelar* abandona la sesión y vuelve al inicio.
- *Compacto* es el cuarto estilo de contador y encoge la ventana a un widget pequeño, pensado para usarse con «siempre visible».
- *Visibilidad del tiempo* tiene dos valores: «Mostrar tiempo» y «Solo progreso». La tercera opción del encargo («visualización minimalista») ya la cubre el estilo de contador Minimal.
- Duración válida: de 00:01 a 180:00.
- Idioma de la interfaz: español.

**Excluido a propósito:** descansos tipo Pomodoro, estadísticas, historial, cuentas, sincronización, telemetría, atajos globales del sistema.

**Actualizaciones:** la v1 no incluye actualizador automático. Un actualizador exige un servidor y conexiones salientes, lo que choca con «sin conexiones externas». Se actualiza instalando una versión nueva. Queda documentado cómo añadir el actualizador firmado de Tauri si más adelante lo quieres.

## 5. Dependencias previstas

| Dependencia | Para qué | Alternativa nativa considerada |
|---|---|---|
| `tauri` 2.12 (features: tray-icon) | Ventana, IPC, bandeja | — (es el framework) |
| `tauri-plugin-single-instance` | Segunda ejecución enfoca la existente | API de mutex de Windows a mano: más código inseguro |
| `tauri-plugin-autostart` | Inicio con Windows | Escribir la clave `Run` del registro a mano |
| `tauri-plugin-dialog` | Selector nativo del archivo de audio | Ninguna razonable |
| `tauri-plugin-window-state` | Recordar posición y tamaño | Guardarlo en `settings.json` (se decide en Fase 3) |
| `serde`, `serde_json` | Configuración e IPC | Ya vienen con Tauri |
| `react`, `react-dom` 19 | UI | — |
| `@fontsource-variable/hanken-grotesk` | Tipografía empaquetada localmente (OFL-1.1) | Fuente del sistema: pierde identidad |
| Dev: `vite`, `vitest`, `@testing-library/react`, `typescript`, `@tauri-apps/cli` | Compilación y pruebas | — |

Todas son oficiales de Tauri o estándar de facto, con publicaciones en los últimos tres meses [verificado: crates.io y npm]. La auditoría (`cargo audit`, `npm audit`, licencias) se hace en la Fase 4 sobre los archivos de bloqueo reales.

## 6. Seguridad

- CSP `default-src 'self'`; sin contenido remoto; fuentes empaquetadas.
- Capacidades de Tauri: solo los comandos propios de la app. Sin plugin `fs`, `shell` ni `http`.
- Validación en Rust de todo lo que llega por IPC (duraciones, volumen, enumeraciones).
- La app no abre ninguna conexión de red. **Una salvedad:** si el equipo no tiene WebView2, el instalador lo descarga de Microsoft. Windows 11 lo trae de serie.
- **El instalador no irá firmado.** Windows SmartScreen mostrará un aviso la primera vez. Firmarlo requiere un certificado de pago; queda fuera del alcance y documentado.

## 7. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | **No puedo compilar para Windows desde mis entornos.** Ninguno tiene la librería estándar de Rust para Windows ni el SDK de MSVC, y la red no permite descargarlos [verificado]. Tampoco hay SDK de .NET, así que el problema no cambia eligiendo WPF. | Bloquea el instalador (Fase 5) | Compilar en tu PC o en GitHub Actions — **decisión tuya, ver abajo** |
| R2 | Temporizadores ralentizados en ventana oculta | Aviso tardío | Motor en Rust (§3.1) |
| R3 | Comportamiento del reloj al suspender | Tiempo incorrecto | Reloj doble + prueba real |
| R4 | Reproducción automática de audio en WebView2 | Sin sonido al terminar | Configuración explícita + prueba minimizada |
| R5 | Instalador sin firmar | Aviso de SmartScreen | Documentado |
| R6 | Figma: tu plan Starter limita las variables a 1 modo por colección [verificado] | No hay conmutador Claro/Oscuro en una sola colección | Dos colecciones: «Color · Claro» y «Color · Oscuro» |
| R7 | TypeScript 7 y Vite 8 son versiones mayores recientes | Incompatibilidades de herramientas | Fijar versiones exactas; bajar a la mayor anterior si alguna falla |
| R8 | No puedo oír los sonidos ni ver la app en Windows desde mis entornos | Calidad sin verificar | Verificación en tu equipo en la Fase 5 |

### R1: cómo se compila

1. **En tu PC.** Se instalan Rust y las Build Tools de Visual Studio para C++ (varios GB, requiere administrador). Permite probar de verdad la app instalada, la suspensión y el sonido.
2. **GitHub Actions.** Un repositorio tuyo compila el instalador en un runner de Windows. No instala nada en tu equipo; la prueba de la app instalada la haces tú.
3. **Solo código.** Entrego el proyecto y las instrucciones, y compilas tú.

Lo que sí puedo hacer en mis entornos sin depender de esto: todo el código, las pruebas de `timer-core` y de la UI, la compilación de la interfaz y la revisión visual en un navegador.

## 8. Diseño (adelanto de la Fase 2)

- Tipografía: **Hanken Grotesk** variable (OFL-1.1), cifras tabulares por defecto [verificado en el archivo de fuente], pesos 100–900.
- Color: paletas tonales MD3 propias. Primario verde pino `#206640`, terciario ámbar `#795200`, superficies papel cálido `#FEF9ED`; en oscuro `#90D6A7` sobre `#17160F`. Contraste de texto ≥ 6,5:1 en ambos temas [verificado por cálculo].
- Archivo de Figma: https://www.figma.com/design/DzhkXCGL86QvJQZIut8PaZ (creado; escritura comprobada).
