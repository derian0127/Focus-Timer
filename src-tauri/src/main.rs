// En release no se abre una consola junto a la ventana.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod service;
mod system;

use focus_core::settings::Settings;
use service::TimerService;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Argumento con el que el inicio automático lanza la app oculta en la bandeja.
pub const HIDDEN_ARG: &str = "--hidden";

/// Estado compartido de la aplicación.
pub struct AppCtx {
    pub timer: TimerService,
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    /// La ventana está en modo widget (sustituye a minimizar). No se guarda:
    /// la app siempre arranca con la ventana normal.
    pub widget: AtomicBool,
    /// Última posición conocida de la ventana normal mientras se muestra el widget.
    pub full_pos: Mutex<Option<(i32, i32)>>,
}

impl AppCtx {
    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Sustituye la configuración en memoria y la guarda en disco.
    pub fn store(&self, next: Settings) -> Result<(), String> {
        next.save(&self.settings_path).map_err(|e| format!("settings_write_failed: {e}"))?;
        *self.settings.lock().unwrap_or_else(|e| e.into_inner()) = next;
        Ok(())
    }
}

fn main() {
    let app = tauri::Builder::default()
        // Debe ser el primer plugin: una segunda ejecución solo enfoca la existente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            system::show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let mut settings = Settings::load(&settings_path);
            // El sistema operativo es la fuente de verdad del inicio automático.
            if let Ok(enabled) = handle.autolaunch().is_enabled() {
                settings.autostart = enabled;
            }

            let timer = TimerService::new(settings.default_duration_ms);
            let emitter = handle.clone();
            timer.spawn(move |snapshot, finished| {
                let _ = emitter.emit(commands::EVENT_STATE, snapshot);
                system::update_tray(&emitter, snapshot);
                if finished {
                    let _ = emitter.emit(commands::EVENT_FINISHED, snapshot);
                    system::notify_finished(&emitter);
                }
            });

            app.manage(AppCtx {
                timer,
                settings: Mutex::new(settings.clone()),
                settings_path,
                widget: AtomicBool::new(false),
                full_pos: Mutex::new(None),
            });
            system::create_tray(&handle)?;

            let start_hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            system::init_main_window(&handle, &settings, !start_hidden);
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                let app = window.app_handle();
                system::remember_window_position(app);
                if app.state::<AppCtx>().settings().close_behavior == focus_core::settings::CloseBehavior::Tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // Minimizar desde Windows (barra de tareas, Win+↓) también deja el
            // widget. Se aplaza un instante para no cambiar la ventana desde
            // dentro de su propio evento ni en mitad de la animación.
            WindowEvent::Resized(_) => {
                let app = window.app_handle();
                if window.is_minimized().unwrap_or(false) && !system::is_widget(app) {
                    let app = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(150));
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            let still_minimized = handle
                                .get_webview_window("main")
                                .is_some_and(|w| w.is_minimized().unwrap_or(false));
                            if still_minimized {
                                system::set_widget(&handle, true);
                            }
                        });
                    });
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::timer_start,
            commands::timer_start_break,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_reset,
            commands::timer_cancel,
            commands::timer_set_duration,
            commands::settings_update,
            commands::window_set_widget,
            commands::sound_pick_custom,
            commands::sound_read_custom,
        ])
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar Focus Timer");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            system::remember_window_position(handle);
        }
    });
}
