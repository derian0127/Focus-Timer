//! Integración con el sistema operativo: ventana, bandeja e inicio automático.

use crate::AppCtx;
use focus_core::settings::{CounterStyle, Settings};
use focus_core::timer::{Phase, SessionKind, Snapshot};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, UserAttentionType, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

const MAIN: &str = "main";
const TRAY: &str = "main-tray";
const FULL_SIZE: (f64, f64) = (400.0, 600.0);
const FULL_MIN: (f64, f64) = (340.0, 480.0);
const COMPACT_SIZE: (f64, f64) = (300.0, 64.0);
/// Separación entre el widget y el borde del área de trabajo, en píxeles lógicos.
const WIDGET_MARGIN: f64 = 16.0;

/// Evento que avisa a la interfaz de que la ventana entra o sale del modo widget.
pub const EVENT_WIDGET: &str = "window://widget";

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

pub fn show_main_window(app: &AppHandle) {
    if is_widget(app) {
        set_widget(app, false);
        return;
    }
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Ajusta tamaño y límites de la ventana al modo compacto o completo.
fn apply_window_mode(w: &WebviewWindow, compact: bool) {
    let size = |(a, b): (f64, f64)| LogicalSize::new(a, b);
    if compact {
        let _ = w.set_min_size(Some(size(COMPACT_SIZE)));
        let _ = w.set_size(size(COMPACT_SIZE));
        let _ = w.set_resizable(false);
    } else {
        let _ = w.set_resizable(true);
        let _ = w.set_size(size(FULL_SIZE));
        let _ = w.set_min_size(Some(size(FULL_MIN)));
    }
}

pub fn is_widget(app: &AppHandle) -> bool {
    app.state::<AppCtx>().widget.load(Ordering::SeqCst)
}

/// Tamaño lógico del widget según el estilo de contador. Con el estilo
/// Compacto se usa el último estilo completo elegido.
pub fn widget_size(settings: &Settings) -> (f64, f64) {
    let style = match settings.counter_style {
        CounterStyle::Compact => settings.last_full_style,
        other => other,
    };
    match style {
        CounterStyle::Ring => (104.0, 104.0),
        CounterStyle::Minimal => (124.0, 60.0),
        CounterStyle::Digital | CounterStyle::Compact => (124.0, 84.0),
    }
}

/// Esquina inferior derecha del área de trabajo del monitor donde está la ventana.
fn default_widget_position(w: &WebviewWindow, (width, height): (f64, f64)) -> Option<PhysicalPosition<i32>> {
    let monitor = w.current_monitor().ok().flatten().or_else(|| w.primary_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let px = |v: f64| (v * scale).round() as i32;
    Some(PhysicalPosition::new(
        area.position.x + area.size.width as i32 - px(width + WIDGET_MARGIN),
        area.position.y + area.size.height as i32 - px(height + WIDGET_MARGIN),
    ))
}

/// Cambia entre la ventana normal y el widget: una ventana diminuta, siempre
/// visible y sin botón en la barra de tareas, que sustituye a minimizar.
/// Cada modo recuerda su propia posición.
pub fn set_widget(app: &AppHandle, on: bool) {
    let Some(w) = main_window(app) else { return };
    let ctx = app.state::<AppCtx>();
    if ctx.widget.load(Ordering::SeqCst) == on {
        return;
    }
    let settings = ctx.settings();
    if on {
        if w.is_minimized().unwrap_or(false) {
            let _ = w.unminimize();
        }
        // Posición de la ventana normal, para volver a ella al ampliar.
        if let Some(pos) = w.outer_position().ok().filter(|p| position_is_visible(&w, (p.x, p.y))) {
            *ctx.full_pos.lock().unwrap_or_else(|e| e.into_inner()) = Some((pos.x, pos.y));
        }
        ctx.widget.store(true, Ordering::SeqCst);
        let (width, height) = widget_size(&settings);
        let size = LogicalSize::new(width, height);
        let _ = w.set_min_size(Some(size));
        let _ = w.set_size(size);
        let _ = w.set_resizable(false);
        let target = settings
            .widget_pos
            .filter(|p| position_is_visible(&w, *p))
            .map(|(x, y)| PhysicalPosition::new(x, y))
            .or_else(|| default_widget_position(&w, (width, height)));
        if let Some(pos) = target {
            let _ = w.set_position(pos);
        }
        let _ = w.set_always_on_top(true);
        let _ = w.set_skip_taskbar(true);
        let _ = w.show();
    } else {
        if let Ok(pos) = w.outer_position() {
            if settings.widget_pos != Some((pos.x, pos.y)) {
                let mut next = settings.clone();
                next.widget_pos = Some((pos.x, pos.y));
                let _ = ctx.store(next);
            }
        }
        ctx.widget.store(false, Ordering::SeqCst);
        let _ = w.set_skip_taskbar(false);
        let _ = w.set_always_on_top(settings.always_on_top);
        apply_window_mode(&w, settings.counter_style == CounterStyle::Compact);
        let full_pos = *ctx.full_pos.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((x, y)) = full_pos.or(settings.window_pos).filter(|p| position_is_visible(&w, *p)) {
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    let _ = app.emit(EVENT_WIDGET, on);
}

/// Una posición guardada solo se restaura si cae dentro de algún monitor
/// conectado; si no, la ventana se queda centrada.
fn position_is_visible(w: &WebviewWindow, (x, y): (i32, i32)) -> bool {
    w.available_monitors().map(|ms| {
        ms.iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            x >= p.x && y >= p.y && x + 80 <= p.x + s.width as i32 && y + 40 <= p.y + s.height as i32
        })
    }).unwrap_or(false)
}

pub fn init_main_window(app: &AppHandle, settings: &Settings, visible: bool) {
    let Some(w) = main_window(app) else { return };
    apply_window_mode(&w, settings.counter_style == CounterStyle::Compact);
    if let Some(pos) = settings.window_pos.filter(|p| position_is_visible(&w, *p)) {
        let _ = w.set_position(PhysicalPosition::new(pos.0, pos.1));
    }
    let _ = w.set_always_on_top(settings.always_on_top);
    if visible {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Guarda la posición actual de la ventana (si no está minimizada). En modo
/// widget guarda la del widget y conserva la de la ventana normal.
pub fn remember_window_position(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    if w.is_minimized().unwrap_or(true) {
        return;
    }
    let Ok(pos) = w.outer_position() else { return };
    let ctx = app.state::<AppCtx>();
    let mut next = ctx.settings();
    if is_widget(app) {
        next.widget_pos = Some((pos.x, pos.y));
        if let Some(full) = *ctx.full_pos.lock().unwrap_or_else(|e| e.into_inner()) {
            next.window_pos = Some(full);
        }
    } else {
        next.window_pos = Some((pos.x, pos.y));
    }
    if next != ctx.settings() {
        let _ = ctx.store(next);
    }
}

/// Efectos de un cambio de configuración sobre el sistema. Si el inicio
/// automático no se puede cambiar, `next.autostart` refleja el estado real.
pub fn apply_settings_change(app: &AppHandle, old: &Settings, next: &mut Settings) {
    if next.autostart != old.autostart {
        let launcher = app.autolaunch();
        let _ = if next.autostart { launcher.enable() } else { launcher.disable() };
        next.autostart = launcher.is_enabled().unwrap_or(old.autostart);
    }
    let Some(w) = main_window(app) else { return };
    // El widget impone su propio tamaño y «siempre visible»; al ampliar se
    // aplica la configuración vigente.
    if is_widget(app) {
        return;
    }
    if next.always_on_top != old.always_on_top {
        let _ = w.set_always_on_top(next.always_on_top);
    }
    let (was, is) = (old.counter_style == CounterStyle::Compact, next.counter_style == CounterStyle::Compact);
    if was != is {
        apply_window_mode(&w, is);
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar Focus Timer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("Focus Timer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn update_tray(app: &AppHandle, snapshot: Snapshot) {
    let on_break = snapshot.kind == SessionKind::Break;
    let label = match (snapshot.phase, on_break) {
        (Phase::Idle, _) => "Focus Timer",
        (Phase::Running, false) => "Focus Timer — En foco",
        (Phase::Running, true) => "Focus Timer — Descanso",
        (Phase::Paused, false) => "Focus Timer — En pausa",
        (Phase::Paused, true) => "Focus Timer — Descanso en pausa",
        (Phase::Finished, false) => "Focus Timer — Sesión completada",
        (Phase::Finished, true) => "Focus Timer — Descanso terminado",
    };
    if let Some(tray) = app.tray_by_id(TRAY) {
        let _ = tray.set_tooltip(Some(label));
    }
}

/// Indicación visual de fin de sesión: si la ventana estaba en la bandeja
/// reaparece, y en cualquier caso parpadea en la barra de tareas.
pub fn notify_finished(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    if !w.is_visible().unwrap_or(true) {
        let _ = w.show();
    }
    let _ = w.request_user_attention(Some(UserAttentionType::Informational));
}
