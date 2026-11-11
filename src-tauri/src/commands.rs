//! Única superficie que la interfaz puede invocar. Todo argumento se valida
//! aquí o en `focus-core`; la interfaz nunca envía rutas de archivo.

use crate::{system, AppCtx};
use focus_core::settings::{Settings, Sound};
use focus_core::timer::{validate_break_ms, Phase, SessionKind, Snapshot, TimerError};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub const EVENT_STATE: &str = "timer://state";
pub const EVENT_FINISHED: &str = "timer://finished";

/// Extensiones admitidas para el sonido personalizado.
pub const AUDIO_EXTENSIONS: [&str; 6] = ["mp3", "wav", "ogg", "flac", "m4a", "aac"];
/// Tamaño máximo del sonido personalizado: 10 MB.
pub const MAX_AUDIO_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Serialize)]
pub struct AppState {
    timer: Snapshot,
    settings: Settings,
    widget: bool,
}

fn err(e: TimerError) -> String {
    e.to_string()
}

#[tauri::command]
pub fn get_state(ctx: State<AppCtx>) -> AppState {
    AppState {
        timer: ctx.timer.snapshot(),
        settings: ctx.settings(),
        widget: ctx.widget.load(std::sync::atomic::Ordering::SeqCst),
    }
}

/// Convierte la ventana en widget (en lugar de minimizarla) o la restaura.
#[tauri::command]
pub fn window_set_widget(app: AppHandle, on: bool) {
    system::set_widget(&app, on);
}

/// Inicia una sesión. Con `duration_ms` cambia antes la duración (solo si no
/// hay una sesión en curso).
#[tauri::command]
pub fn timer_start(ctx: State<AppCtx>, duration_ms: Option<u64>) -> Result<Snapshot, String> {
    let default_ms = ctx.settings().default_duration_ms;
    ctx.timer
        .apply(|t| {
            match duration_ms {
                Some(ms) => t.set_duration(ms)?,
                // Tras un descanso, «iniciar» vuelve a la duración de enfoque predeterminada.
                None if t.kind() == SessionKind::Break => t.set_duration(default_ms)?,
                None => {}
            }
            t.start()
        })
        .map_err(err)
}

/// Inicia un descanso (1–60 min) y recuerda su duración para la próxima vez.
#[tauri::command]
pub fn timer_start_break(ctx: State<AppCtx>, duration_ms: u64) -> Result<Snapshot, String> {
    validate_break_ms(duration_ms).map_err(err)?;
    let snapshot = ctx.timer.apply(|t| t.start_break(duration_ms)).map_err(err)?;
    let mut settings = ctx.settings();
    if settings.break_duration_ms != duration_ms {
        settings.break_duration_ms = duration_ms;
        let _ = ctx.store(settings);
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn timer_pause(ctx: State<AppCtx>) -> Result<Snapshot, String> {
    ctx.timer.apply(|t| t.pause()).map_err(err)
}

#[tauri::command]
pub fn timer_resume(ctx: State<AppCtx>) -> Result<Snapshot, String> {
    ctx.timer.apply(|t| t.resume()).map_err(err)
}

#[tauri::command]
pub fn timer_reset(ctx: State<AppCtx>) -> Result<Snapshot, String> {
    ctx.timer.apply(|t| t.reset()).map_err(err)
}

/// Abandona la sesión y restaura la duración predeterminada.
#[tauri::command]
pub fn timer_cancel(ctx: State<AppCtx>) -> Result<Snapshot, String> {
    let default_ms = ctx.settings().default_duration_ms;
    ctx.timer
        .apply(|t| {
            t.cancel();
            t.set_duration(default_ms)
        })
        .map_err(err)
}

#[tauri::command]
pub fn timer_set_duration(ctx: State<AppCtx>, duration_ms: u64) -> Result<Snapshot, String> {
    ctx.timer.apply(|t| t.set_duration(duration_ms)).map_err(err)
}

/// Aplica un parche de configuración. Los campos inválidos se ignoran. La ruta
/// del sonido y las posiciones de ventana y widget no se aceptan desde la interfaz.
#[tauri::command]
pub fn settings_update(app: AppHandle, ctx: State<AppCtx>, mut patch: Value) -> Result<Settings, String> {
    if let Some(obj) = patch.as_object_mut() {
        obj.remove("customSoundPath");
        obj.remove("windowPos");
        obj.remove("widgetPos");
        obj.remove("version");
    }
    let old = ctx.settings();
    let mut next = old.merge_patch(&patch);
    system::apply_settings_change(&app, &old, &mut next);
    if next.default_duration_ms != old.default_duration_ms {
        let ms = next.default_duration_ms;
        // Solo afecta a la pantalla de inicio; una sesión en curso no se toca.
        let _ = ctx.timer.apply(|t| if t.phase() == Phase::Idle { t.set_duration(ms) } else { Ok(()) });
    }
    ctx.store(next.clone())?;
    Ok(next)
}

fn validate_audio_file(path: &Path) -> Result<u64, String> {
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if !AUDIO_EXTENSIONS.contains(&ext.as_str()) {
        return Err("sound_unsupported_format".into());
    }
    let meta = std::fs::metadata(path).map_err(|_| "sound_not_found".to_string())?;
    if !meta.is_file() {
        return Err("sound_not_found".into());
    }
    if meta.len() == 0 || meta.len() > MAX_AUDIO_BYTES {
        return Err("sound_too_large".into());
    }
    Ok(meta.len())
}

/// Abre el selector de archivos nativo. La ruta elegida se valida y se guarda
/// en la configuración; devuelve `None` si el usuario cancela.
#[tauri::command]
pub async fn sound_pick_custom(app: AppHandle, ctx: State<'_, AppCtx>) -> Result<Option<Settings>, String> {
    let picked = app.dialog().file().add_filter("Audio", &AUDIO_EXTENSIONS).blocking_pick_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    validate_audio_file(&path)?;
    let mut next = ctx.settings();
    next.custom_sound_path = Some(path.to_string_lossy().into_owned());
    next.sound = Sound::Custom;
    ctx.store(next.clone())?;
    Ok(Some(next))
}

/// Devuelve los bytes del sonido personalizado guardado. No recibe argumentos:
/// solo puede leerse el archivo que el usuario eligió en el selector.
#[tauri::command]
pub fn sound_read_custom(ctx: State<AppCtx>) -> Result<tauri::ipc::Response, String> {
    let path = ctx.settings().custom_sound_path.ok_or("sound_not_found")?;
    let path = Path::new(&path);
    validate_audio_file(path)?;
    let bytes = std::fs::read(path).map_err(|_| "sound_not_found".to_string())?;
    if bytes.len() as u64 > MAX_AUDIO_BYTES {
        return Err("sound_too_large".into());
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_audio_and_missing_files() {
        let dir = std::env::temp_dir().join(format!("focus-timer-audio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("payload.exe");
        std::fs::write(&exe, b"MZ").unwrap();
        assert_eq!(validate_audio_file(&exe), Err("sound_unsupported_format".into()));
        assert_eq!(validate_audio_file(&dir.join("missing.mp3")), Err("sound_not_found".into()));
        let empty = dir.join("empty.wav");
        std::fs::write(&empty, b"").unwrap();
        assert_eq!(validate_audio_file(&empty), Err("sound_too_large".into()));
        let folder = dir.join("folder.mp3");
        std::fs::create_dir_all(&folder).unwrap();
        assert_eq!(validate_audio_file(&folder), Err("sound_not_found".into()));
        let ok = dir.join("Ding.MP3");
        std::fs::write(&ok, b"ID3").unwrap();
        assert_eq!(validate_audio_file(&ok), Ok(3));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
