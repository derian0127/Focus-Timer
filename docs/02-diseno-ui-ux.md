# Focus Timer — Fase 2: diseño UI/UX y sistema de diseño

Fecha: 2026-11-10 · Estado: pendiente de tu revisión

Archivo de Figma: https://www.figma.com/design/DzhkXCGL86QvJQZIut8PaZ

| Página | Contenido |
|---|---|
| Pantallas | Ventana principal en 5 estados + Ajustes, en claro y oscuro (12 marcos); 6 paneles de estilo × visibilidad y la ventana compacta, en claro y oscuro |
| Componentes | 9 conjuntos, 56 variantes: Button, IconButton, Chip, Switch, Segmented, Slider, Progress/Ring, Progress/Bar, Status |
| Fundamentos | 54 muestras de color, 10 estilos de texto, escalas de espaciado y radios |

## 1. Identidad

Un instrumento silencioso: papel cálido, tinta y un único acento verde pino. El ámbar aparece solo cuando algo cambia de estado (pausa, sesión completada), de modo que el color informa en lugar de decorar.

- **Sin gradientes, sin tarjetas, sin sombras internas.** La jerarquía sale del tamaño tipográfico y del tono de superficie. La única sombra es la de la ventana.
- **Las cifras son el producto.** Hanken Grotesk ExtraLight a 112 px, cifras tabulares (el ancho no baila al contar).
- **Ventana sin marco de Windows.** Barra de título propia de 48 px que hace de indicador de estado.

## 2. Tokens

Fuente de verdad en código: `design/color-tokens.json` → `tokens.css`. En Figma: colecciones «Color · Claro», «Color · Oscuro» y «Dimensión»; cada variable lleva su sintaxis web (`var(--ft-color-primary)`).

### Color (roles MD3)

| Rol | Claro | Oscuro | Uso |
|---|---|---|---|
| primary / on-primary | `#206640` / `#FFFFFF` | `#90D6A7` / `#00341B` | Acción principal, progreso en foco |
| secondary-container / on- | `#DCE9D8` / `#2C382C` | `#394539` / `#D9E6D5` | Acciones secundarias, selección |
| tertiary / on-tertiary | `#795200` / `#FFFFFF` | `#F9BC57` / `#3E2800` | Pausa, sesión completada |
| tertiary-container / on- | `#FFDEAE` / `#493000` | `#5A3C00` / `#FFDEAE` | Fondo de «sesión completada» |
| surface | `#FEF9ED` | `#17160F` | Fondo de ventana |
| surface-container-high / -highest | `#EDE8DD` / `#E7E2D7` | `#2B2A23` / `#36352D` | Campos, pista de progreso |
| on-surface / on-surface-variant | `#1F1E17` / `#4A4D3F` | `#EAE5DA` / `#C0C2B1` | Texto principal / secundario |
| outline / outline-variant | `#767969` / `#CBCEBC` | `#8A8D7D` / `#414436` | Bordes de control / divisores |
| error | `#BA1A1A` | `#FFB4AB` | Validación |

Paletas generadas en HCT: primario H158 C38, secundario H150 C12, terciario H78 C44, neutro H105 C5, neutro variante H125 C9. Contraste calculado: texto principal 15,9:1 (claro) y 14,4:1 (oscuro); texto secundario ≥ 7:1; primario sobre superficie 6,6:1 y 10,7:1; borde de control ≥ 4,2:1.

### Tipografía (Hanken Grotesk variable)

| Estilo | Peso | Tamaño / interlínea / tracking | Uso |
|---|---|---|---|
| timer/xl | 200 | 112 / 100 % / −3 % | Contador digital |
| timer/lg | 300 | 64 / 100 % / −2 % | Contador en anillo, editor |
| timer/md | 300 | 44 / 100 % / −1,5 % | Anillo pequeño |
| timer/sm | 500 | 26 / 100 % / −0,5 % | Ventana compacta |
| title/lg · title/md | 600 | 22 / 128 % · 16 / 150 % | Títulos, botón grande |
| body/md | 400 | 14 / 143 % | Texto de ajustes |
| label/lg · label/md · label/sm | 600 · 500 · 600 | 14 · 12 · 11 | Botones, estado, sección |

### Dimensión

Espaciado: 4, 8, 12, 16, 20, 24, 32, 48. Radios: 4, 8 (chips, campos), 12 (ventana, teselas), 16 (ventana compacta), 28, completo (botones, interruptores).

## 3. Ventanas

| Ventana | Tamaño | Notas |
|---|---|---|
| Principal | 400 × 600 (mínimo 340 × 480) | Redimensionable; el contador escala con el ancho |
| Ajustes | Misma ventana, vista deslizada | Desplazamiento vertical si no cabe |
| Compacta | 300 × 64 | Estilo «Compacto»; se usa con «siempre visible» |

## 4. Estados de la ventana principal

| Estado | Indicador | Contador | Acciones |
|---|---|---|---|
| Listo | ● gris «Listo» | 25:00 + preajustes 15/25/45/60 | **Iniciar** |
| Edición | ● gris | Campos minutos : segundos, el activo con borde primario | **Iniciar**, Enter confirma, Esc descarta |
| En foco | ● verde «En foco» | Restante + «Termina a las 11:42» | Reiniciar · **Pausar** · Cancelar |
| En pausa | ● ámbar «En pausa» | Restante atenuado, progreso en gris | Reiniciar · **Reanudar** · Cancelar |
| Completada | ● ámbar «Completada» | Fondo ámbar, anillo lleno, ✓ | **Repetir** · Cerrar |

Iniciar una sesión cuesta una interacción (Iniciar o Espacio) con la duración por defecto, o dos eligiendo antes un preajuste.

## 5. Estilos de contador × visibilidad

| Estilo | Mostrar tiempo | Solo progreso |
|---|---|---|
| Digital | Cifras 112 px + barra de 4 px | 12 segmentos que se apagan |
| Anillo | Anillo de 256 px con cifras dentro | Anillo solo |
| Minimal | Solo cifras | Una línea de 2 px |
| Compacto | Ventana 300 × 64: cifras + barra + pausa | Igual sin cifras |

El progreso representa siempre el tiempo **restante**: empieza lleno y se vacía en sentido horario.

## 6. Interacción

- **Teclado:** Espacio inicia/pausa/reanuda · R reinicia · Esc cancela (o sale de edición/ajustes) · Ctrl+, abre ajustes · 1–4 eligen preajuste · Tab recorre todo; foco visible con anillo primario de 2 px.
- **Movimiento:** transiciones de 150–200 ms con la curva estándar de MD3; el progreso avanza de forma continua. Con «reducir movimiento» de Windows activo, sin transiciones.
- **Capas de estado MD3:** hover 8 %, foco 10 %, pulsado 10 % del color del contenido.
- **Accesibilidad:** cada botón de icono tiene nombre accesible; el cambio de estado se anuncia con `aria-live`; el tiempo restante se expone como `role="timer"`; objetivos táctiles ≥ 32 px.
- **Al terminar:** sonido (si no está silenciado), fondo ámbar, parpadeo en la barra de tareas; si la ventana estaba en la bandeja, reaparece sin robar el foco.

## 7. Limitaciones del archivo de Figma

- Tu plan Starter admite un solo modo por colección de variables. Claro y oscuro son dos colecciones, y los componentes llevan una propiedad `Tema` en lugar de cambiar de modo.
- Las pantallas están hechas con los mismos constructores que los componentes y enlazadas a las mismas variables y estilos, pero **no son instancias** de los conjuntos de la página Componentes. Cambiar un componente no actualiza las pantallas.
- No hay prototipo interactivo; las transiciones están descritas aquí.
- Los iconos son trazos propios de 24 px (1,75 px, extremos redondeados), no una librería.
