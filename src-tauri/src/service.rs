//! Servicio del temporizador: posee el [`Timer`] y un hilo que lo hace avanzar.
//!
//! El hilo duerme en una variable de condición. Despierta cuando un comando
//! cambia el estado o, mientras hay una sesión en marcha, en cada cambio de
//! segundo (con un máximo de 500 ms para detectar pronto la vuelta de una
//! suspensión). No depende de la interfaz: sigue funcionando con la ventana
//! minimizada u oculta.

use focus_core::timer::{Phase, Snapshot, SystemClock, Timer, TimerError};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

const MAX_SLEEP_MS: u64 = 500;

type Shared = Arc<(Mutex<Timer<SystemClock>>, Condvar)>;

#[derive(Clone)]
pub struct TimerService {
    shared: Shared,
}

fn lock(shared: &Shared) -> MutexGuard<'_, Timer<SystemClock>> {
    shared.0.lock().unwrap_or_else(|e| e.into_inner())
}

impl TimerService {
    pub fn new(default_duration_ms: u64) -> Self {
        let timer = Timer::new(SystemClock::new(), default_duration_ms)
            .or_else(|_| Timer::new(SystemClock::new(), 25 * 60 * 1_000))
            .expect("la duración por defecto es válida");
        Self { shared: Arc::new((Mutex::new(timer), Condvar::new())) }
    }

    /// Ejecuta una operación sobre el temporizador y despierta al hilo para que
    /// publique el nuevo estado.
    pub fn apply<R>(&self, f: impl FnOnce(&mut Timer<SystemClock>) -> Result<R, TimerError>) -> Result<Snapshot, TimerError> {
        let mut timer = lock(&self.shared);
        timer.tick();
        f(&mut timer)?;
        let snapshot = timer.snapshot();
        drop(timer);
        self.shared.1.notify_all();
        Ok(snapshot)
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut timer = lock(&self.shared);
        timer.tick();
        timer.snapshot()
    }

    /// Arranca el hilo. `on_state(snapshot, finished)` se llama sin el cerrojo
    /// tomado, cada vez que cambia la fase, la duración o el segundo visible.
    pub fn spawn(&self, on_state: impl Fn(Snapshot, bool) + Send + 'static) {
        let shared = self.shared.clone();
        thread::Builder::new()
            .name("focus-timer".into())
            .spawn(move || {
                let mut last: Option<Snapshot> = None;
                let mut timer = lock(&shared);
                loop {
                    let finished = timer.tick();
                    let snap = timer.snapshot();
                    let changed = last.is_none_or(|l| {
                        l.phase != snap.phase
                            || l.duration_ms != snap.duration_ms
                            || l.remaining_ms.div_ceil(1_000) != snap.remaining_ms.div_ceil(1_000)
                    });
                    if changed || finished {
                        last = Some(snap);
                        drop(timer);
                        on_state(snap, finished);
                        timer = lock(&shared);
                        continue;
                    }
                    timer = if snap.phase == Phase::Running {
                        // Hasta el siguiente cambio de segundo visible.
                        let to_boundary = snap.remaining_ms - (snap.remaining_ms - 1) / 1_000 * 1_000;
                        let wait = to_boundary.clamp(1, MAX_SLEEP_MS);
                        shared.1.wait_timeout(timer, Duration::from_millis(wait)).unwrap_or_else(|e| e.into_inner()).0
                    } else {
                        shared.1.wait(timer).unwrap_or_else(|e| e.into_inner())
                    };
                }
            })
            .expect("no se pudo crear el hilo del temporizador");
    }
}
