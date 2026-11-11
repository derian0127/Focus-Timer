//! Configuración del usuario: modelo, saneado y persistencia.
//!
//! Todo valor que entra (del disco o de la interfaz) pasa por [`Settings::sanitize`]
//! o [`Settings::merge_patch`]. Un campo inválido o desconocido se sustituye por
//! su valor por defecto; nunca impide que la aplicación arranque.

use crate::timer::{MAX_BREAK_MS, MAX_DURATION_MS, MIN_BREAK_MS, MIN_DURATION_MS};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io::{self, Write};
use std::path::Path;

pub const SETTINGS_VERSION: u32 = 1;
/// Tamaño máximo aceptado para `settings.json`. Un archivo mayor se ignora.
const MAX_SETTINGS_BYTES: u64 = 64 * 1024;
/// Longitud máxima de la ruta del sonido personalizado.
const MAX_PATH_CHARS: usize = 1024;
/// Opacidad mínima del fondo del widget: por debajo se pierde de vista.
pub const MIN_WIDGET_OPACITY: u8 = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CounterStyle {
    Digital,
    #[default]
    Ring,
    Minimal,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TimeVisibility {
    #[default]
    Show,
    Progress,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Sound {
    #[default]
    Bell,
    Bowl,
    Wood,
    Chime,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    #[default]
    Tray,
    Exit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub default_duration_ms: u64,
    /// Duración del descanso sugerido al terminar una sesión (1–60 min).
    pub break_duration_ms: u64,
    pub counter_style: CounterStyle,
    /// Último estilo no compacto; es al que vuelve el botón «expandir».
    pub last_full_style: CounterStyle,
    pub time_visibility: TimeVisibility,
    pub theme: Theme,
    pub sound: Sound,
    /// 0–100.
    pub volume: u8,
    pub muted: bool,
    pub custom_sound_path: Option<String>,
    pub autostart: bool,
    pub close_behavior: CloseBehavior,
    pub always_on_top: bool,
    /// Posición física de la ventana principal, si se conoce.
    pub window_pos: Option<(i32, i32)>,
    /// Posición física del widget (la ventana al minimizar), si se conoce.
    pub widget_pos: Option<(i32, i32)>,
    /// Opacidad del fondo del widget, en % (20–100). 100 = sin transparencia.
    pub widget_opacity: u8,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            default_duration_ms: 25 * 60 * 1_000,
            break_duration_ms: 5 * 60 * 1_000,
            counter_style: CounterStyle::Ring,
            last_full_style: CounterStyle::Ring,
            time_visibility: TimeVisibility::Show,
            theme: Theme::System,
            sound: Sound::Bell,
            volume: 70,
            muted: false,
            custom_sound_path: None,
            autostart: false,
            close_behavior: CloseBehavior::Tray,
            always_on_top: false,
            window_pos: None,
            widget_pos: None,
            widget_opacity: 100,
        }
    }
}

fn field<T: DeserializeOwned>(obj: &Map<String, Value>, key: &str) -> Option<T> {
    obj.get(key).and_then(|v| serde_json::from_value(v.clone()).ok())
}

impl Settings {
    /// Construye una configuración válida a partir de JSON arbitrario.
    pub fn sanitize(value: &Value) -> Self {
        let mut s = Self::default();
        if let Some(obj) = value.as_object() {
            s.apply(obj);
        }
        s
    }

    /// Aplica sobre `self` los campos presentes y válidos de `patch`.
    /// Los campos ausentes, de tipo incorrecto o fuera de rango se ignoran.
    pub fn merge_patch(&self, patch: &Value) -> Self {
        let mut s = self.clone();
        if let Some(obj) = patch.as_object() {
            s.apply(obj);
        }
        s
    }

    fn apply(&mut self, obj: &Map<String, Value>) {
        if let Some(ms) = field::<u64>(obj, "defaultDurationMs") {
            if (MIN_DURATION_MS..=MAX_DURATION_MS).contains(&ms) {
                self.default_duration_ms = ms;
            }
        }
        if let Some(ms) = field::<u64>(obj, "breakDurationMs") {
            if (MIN_BREAK_MS..=MAX_BREAK_MS).contains(&ms) {
                self.break_duration_ms = ms;
            }
        }
        if let Some(v) = field::<CounterStyle>(obj, "lastFullStyle") {
            if v != CounterStyle::Compact {
                self.last_full_style = v;
            }
        }
        if let Some(v) = field::<CounterStyle>(obj, "counterStyle") {
            self.counter_style = v;
            if v != CounterStyle::Compact {
                self.last_full_style = v;
            }
        }
        if let Some(v) = field(obj, "timeVisibility") {
            self.time_visibility = v;
        }
        if let Some(v) = field(obj, "theme") {
            self.theme = v;
        }
        if let Some(v) = field::<u64>(obj, "volume") {
            if v <= 100 {
                self.volume = v as u8;
            }
        }
        if let Some(v) = field::<u64>(obj, "widgetOpacity") {
            if (u64::from(MIN_WIDGET_OPACITY)..=100).contains(&v) {
                self.widget_opacity = v as u8;
            }
        }
        if let Some(v) = field(obj, "muted") {
            self.muted = v;
        }
        if let Some(v) = obj.get("customSoundPath") {
            match v {
                Value::Null => self.custom_sound_path = None,
                Value::String(p) if !p.is_empty() && p.chars().count() <= MAX_PATH_CHARS && !p.contains('\0') => {
                    self.custom_sound_path = Some(p.clone());
                }
                _ => {}
            }
        }
        if let Some(v) = field(obj, "sound") {
            self.sound = v;
        }
        if self.sound == Sound::Custom && self.custom_sound_path.is_none() {
            self.sound = Sound::default();
        }
        if let Some(v) = field(obj, "autostart") {
            self.autostart = v;
        }
        if let Some(v) = field(obj, "closeBehavior") {
            self.close_behavior = v;
        }
        if let Some(v) = field(obj, "alwaysOnTop") {
            self.always_on_top = v;
        }
        for (key, slot) in [("windowPos", &mut self.window_pos), ("widgetPos", &mut self.widget_pos)] {
            match obj.get(key) {
                Some(Value::Null) => *slot = None,
                Some(v) => {
                    if let Ok(p) = serde_json::from_value::<(i32, i32)>(v.clone()) {
                        *slot = Some(p);
                    }
                }
                None => {}
            }
        }
        self.version = SETTINGS_VERSION;
    }

    /// Lee la configuración. Si el archivo no existe, es demasiado grande o no
    /// es JSON válido, devuelve los valores por defecto.
    pub fn load(path: &Path) -> Self {
        let too_big = fs::metadata(path).map(|m| m.len() > MAX_SETTINGS_BYTES).unwrap_or(false);
        if too_big {
            return Self::default();
        }
        match fs::read(path).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()) {
            Some(v) => Self::sanitize(&v),
            None => Self::default(),
        }
    }

    /// Escritura atómica: se escribe un temporal en el mismo directorio y se
    /// renombra sobre el destino, de modo que un corte a mitad de escritura no
    /// deja un archivo truncado.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("json.tmp");
        let data = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        {
            let mut f = fs::File::create(&tmp)?;
            f.write_all(&data)?;
            f.sync_all()?;
        }
        fs::rename(&tmp, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tmp_dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("focus-core-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn defaults_are_sane() {
        let s = Settings::default();
        assert_eq!(s.default_duration_ms, 1_500_000);
        assert_eq!(s.volume, 70);
        assert_eq!(s.counter_style, CounterStyle::Ring);
        assert_eq!(s.close_behavior, CloseBehavior::Tray);
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = tmp_dir("roundtrip");
        let path = dir.join("nested").join("settings.json");
        let s = Settings::default().merge_patch(&json!({
            "defaultDurationMs": 2_700_000, "breakDurationMs": 900_000, "counterStyle": "digital", "timeVisibility": "progress",
            "theme": "dark", "sound": "wood", "volume": 35, "muted": true, "autostart": true,
            "closeBehavior": "exit", "alwaysOnTop": true, "windowPos": [120, -40], "widgetPos": [1700, 900], "widgetOpacity": 55
        }));
        s.save(&path).unwrap();
        assert_eq!(Settings::load(&path), s);
        assert!(!path.with_extension("json.tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn missing_or_corrupt_file_falls_back_to_defaults() {
        let dir = tmp_dir("corrupt");
        let path = dir.join("settings.json");
        assert_eq!(Settings::load(&path), Settings::default());
        fs::write(&path, b"{ not json").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
        fs::write(&path, b"[1,2,3]").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
        fs::write(&path, vec![b' '; 70 * 1024]).unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn invalid_fields_fall_back_individually() {
        let s = Settings::sanitize(&json!({
            "defaultDurationMs": 0, "counterStyle": "hologram", "theme": 7, "volume": 250,
            "muted": "yes", "sound": "wood", "closeBehavior": null, "windowPos": "left",
            "unknownField": {"a": 1}
        }));
        let d = Settings::default();
        assert_eq!(s.default_duration_ms, d.default_duration_ms);
        assert_eq!(s.counter_style, d.counter_style);
        assert_eq!(s.theme, d.theme);
        assert_eq!(s.volume, d.volume);
        assert_eq!(s.muted, d.muted);
        assert_eq!(s.sound, Sound::Wood);
        assert_eq!(s.window_pos, None);
    }

    #[test]
    fn widget_opacity_bounds_are_enforced() {
        let d = Settings::default();
        assert_eq!(d.widget_opacity, 100);
        assert_eq!(d.merge_patch(&json!({"widgetOpacity": 20})).widget_opacity, 20);
        assert_eq!(d.merge_patch(&json!({"widgetOpacity": 19})).widget_opacity, 100);
        assert_eq!(d.merge_patch(&json!({"widgetOpacity": 101})).widget_opacity, 100);
        assert_eq!(d.merge_patch(&json!({"widgetOpacity": "half"})).widget_opacity, 100);
    }

    #[test]
    fn widget_position_is_kept_apart_from_the_window_position() {
        let s = Settings::default().merge_patch(&json!({"windowPos": [10, 20], "widgetPos": [1700, 900]}));
        assert_eq!(s.window_pos, Some((10, 20)));
        assert_eq!(s.widget_pos, Some((1700, 900)));
        let s = s.merge_patch(&json!({"widgetPos": "corner"}));
        assert_eq!(s.widget_pos, Some((1700, 900)));
        let s = s.merge_patch(&json!({"widgetPos": null}));
        assert_eq!(s.widget_pos, None);
        assert_eq!(s.window_pos, Some((10, 20)));
    }

    #[test]
    fn duration_bounds_are_enforced() {
        let d = Settings::default();
        assert_eq!(d.merge_patch(&json!({"defaultDurationMs": 999})).default_duration_ms, d.default_duration_ms);
        assert_eq!(d.merge_patch(&json!({"defaultDurationMs": 1000})).default_duration_ms, 1000);
        assert_eq!(d.merge_patch(&json!({"defaultDurationMs": MAX_DURATION_MS})).default_duration_ms, MAX_DURATION_MS);
        assert_eq!(d.merge_patch(&json!({"defaultDurationMs": MAX_DURATION_MS + 1})).default_duration_ms, d.default_duration_ms);
        assert_eq!(d.merge_patch(&json!({"defaultDurationMs": -5})).default_duration_ms, d.default_duration_ms);
        assert_eq!(d.merge_patch(&json!({"defaultDurationMs": 1500.5})).default_duration_ms, d.default_duration_ms);
    }

    #[test]
    fn break_duration_bounds_are_enforced() {
        let d = Settings::default();
        assert_eq!(d.break_duration_ms, 300_000);
        assert_eq!(d.merge_patch(&json!({"breakDurationMs": 600_000})).break_duration_ms, 600_000);
        assert_eq!(d.merge_patch(&json!({"breakDurationMs": 59_999})).break_duration_ms, 300_000);
        assert_eq!(d.merge_patch(&json!({"breakDurationMs": 3_600_001})).break_duration_ms, 300_000);
    }

    #[test]
    fn patch_only_touches_given_fields() {
        let base = Settings::default().merge_patch(&json!({"volume": 10, "theme": "dark"}));
        let s = base.merge_patch(&json!({"muted": true}));
        assert_eq!(s.volume, 10);
        assert_eq!(s.theme, Theme::Dark);
        assert!(s.muted);
    }

    #[test]
    fn compact_remembers_last_full_style() {
        let s = Settings::default().merge_patch(&json!({"counterStyle": "digital"}));
        assert_eq!(s.last_full_style, CounterStyle::Digital);
        let s = s.merge_patch(&json!({"counterStyle": "compact"}));
        assert_eq!(s.counter_style, CounterStyle::Compact);
        assert_eq!(s.last_full_style, CounterStyle::Digital);
        let s = s.merge_patch(&json!({"lastFullStyle": "compact"}));
        assert_eq!(s.last_full_style, CounterStyle::Digital);
    }

    #[test]
    fn custom_sound_requires_a_path() {
        let d = Settings::default();
        assert_eq!(d.merge_patch(&json!({"sound": "custom"})).sound, Sound::Bell);
        let s = d.merge_patch(&json!({"sound": "custom", "customSoundPath": "C:\\Users\\a\\ding.mp3"}));
        assert_eq!(s.sound, Sound::Custom);
        let s = s.merge_patch(&json!({"customSoundPath": null}));
        assert_eq!(s.sound, Sound::Bell);
        assert_eq!(d.merge_patch(&json!({"customSoundPath": "a\u{0}b"})).custom_sound_path, None);
        assert_eq!(d.merge_patch(&json!({"customSoundPath": "x".repeat(2000)})).custom_sound_path, None);
    }

    #[test]
    fn serializes_camel_case_for_the_ui() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(v["defaultDurationMs"], 1_500_000);
        assert_eq!(v["counterStyle"], "ring");
        assert_eq!(v["timeVisibility"], "show");
        assert_eq!(v["closeBehavior"], "tray");
        assert_eq!(v["version"], SETTINGS_VERSION);
    }
}
