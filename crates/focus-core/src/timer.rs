//! Temporizador de cuenta atrás.
//!
//! El tiempo restante nunca se obtiene contando ticks: se calcula como
//! `base − transcurrido`, donde `transcurrido` sale de un reloj monotónico
//! corregido con el reloj de pared (ver [`Timer::sync`]). Perder un tick, o
//! que el proceso se quede sin CPU, no acumula error.

use serde::Serialize;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Duración mínima de una sesión: 1 segundo.
pub const MIN_DURATION_MS: u64 = 1_000;
/// Duración máxima de una sesión: 180 minutos.
pub const MAX_DURATION_MS: u64 = 180 * 60 * 1_000;
/// Diferencia entre reloj de pared y monotónico a partir de la cual se asume
/// que el equipo estuvo suspendido. Por debajo se considera ruido (ajustes NTP).
pub const SUSPEND_THRESHOLD_MS: u64 = 5_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimerError {
    /// La duración está fuera de `[MIN_DURATION_MS, MAX_DURATION_MS]` o los segundos son > 59.
    InvalidDuration,
    /// La operación no tiene sentido en la fase actual.
    InvalidTransition,
}

impl std::fmt::Display for TimerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            TimerError::InvalidDuration => "invalid_duration",
            TimerError::InvalidTransition => "invalid_transition",
        })
    }
}

impl std::error::Error for TimerError {}

pub fn validate_duration_ms(ms: u64) -> Result<u64, TimerError> {
    if (MIN_DURATION_MS..=MAX_DURATION_MS).contains(&ms) {
        Ok(ms)
    } else {
        Err(TimerError::InvalidDuration)
    }
}

/// Convierte minutos y segundos (0–59) en milisegundos validados.
pub fn duration_from_parts(minutes: u32, seconds: u32) -> Result<u64, TimerError> {
    if seconds > 59 {
        return Err(TimerError::InvalidDuration);
    }
    validate_duration_ms((minutes as u64 * 60 + seconds as u64) * 1_000)
}

/// Fuente de tiempo. Se inyecta para que las pruebas sean deterministas.
pub trait Clock {
    /// Milisegundos de un reloj monotónico con origen arbitrario.
    fn mono_ms(&self) -> u64;
    /// Milisegundos del reloj de pared (época Unix).
    fn wall_ms(&self) -> u64;
}

/// Reloj real: `Instant` + `SystemTime`.
pub struct SystemClock {
    origin: Instant,
}

impl SystemClock {
    pub fn new() -> Self {
        Self { origin: Instant::now() }
    }
}

impl Default for SystemClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for SystemClock {
    fn mono_ms(&self) -> u64 {
        self.origin.elapsed().as_millis() as u64
    }
    fn wall_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_millis() as u64
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Idle,
    Running,
    Paused,
    Finished,
}

/// Tipo de sesión: de enfoque o de descanso.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionKind {
    Focus,
    Break,
}

/// Duración mínima y máxima de un descanso: de 1 a 60 minutos.
pub const MIN_BREAK_MS: u64 = 60_000;
pub const MAX_BREAK_MS: u64 = 60 * 60_000;

pub fn validate_break_ms(ms: u64) -> Result<u64, TimerError> {
    if (MIN_BREAK_MS..=MAX_BREAK_MS).contains(&ms) {
        Ok(ms)
    } else {
        Err(TimerError::InvalidDuration)
    }
}

/// Estado observable del temporizador en un instante.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub phase: Phase,
    pub kind: SessionKind,
    pub duration_ms: u64,
    pub remaining_ms: u64,
}

pub struct Timer<C: Clock> {
    clock: C,
    phase: Phase,
    kind: SessionKind,
    duration_ms: u64,
    /// Restante en el momento del último arranque o reanudación.
    base_remaining_ms: u64,
    started_mono: u64,
    started_wall: u64,
    /// Tiempo que el reloj de pared avanzó y el monotónico no (suspensión).
    /// Solo crece mientras la sesión corre.
    skew_ms: u64,
}

impl<C: Clock> Timer<C> {
    pub fn new(clock: C, duration_ms: u64) -> Result<Self, TimerError> {
        let duration_ms = validate_duration_ms(duration_ms)?;
        Ok(Self {
            clock,
            phase: Phase::Idle,
            kind: SessionKind::Focus,
            duration_ms,
            base_remaining_ms: duration_ms,
            started_mono: 0,
            started_wall: 0,
            skew_ms: 0,
        })
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn duration_ms(&self) -> u64 {
        self.duration_ms
    }

    pub fn kind(&self) -> SessionKind {
        self.kind
    }

    fn mark_started(&mut self) {
        self.started_mono = self.clock.mono_ms();
        self.started_wall = self.clock.wall_ms();
        self.skew_ms = 0;
    }

    fn elapsed_ms(&self) -> u64 {
        self.clock.mono_ms().saturating_sub(self.started_mono) + self.skew_ms
    }

    pub fn remaining_ms(&self) -> u64 {
        match self.phase {
            Phase::Idle => self.duration_ms,
            Phase::Paused => self.base_remaining_ms,
            Phase::Finished => 0,
            Phase::Running => self.base_remaining_ms.saturating_sub(self.elapsed_ms()),
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            phase: self.phase,
            kind: self.kind,
            duration_ms: self.duration_ms,
            remaining_ms: self.remaining_ms(),
        }
    }

    /// Contrasta el reloj monotónico con el de pared.
    ///
    /// Si el de pared va más de [`SUSPEND_THRESHOLD_MS`] por delante, el equipo
    /// estuvo suspendido con un reloj monotónico que no avanzó: esa diferencia
    /// se suma al tiempo transcurrido. La corrección nunca disminuye, así que
    /// atrasar la hora del sistema no devuelve tiempo a la sesión.
    fn sync(&mut self) {
        if self.phase != Phase::Running {
            return;
        }
        let mono = self.clock.mono_ms().saturating_sub(self.started_mono);
        let wall = self.clock.wall_ms().saturating_sub(self.started_wall);
        let gap = wall.saturating_sub(mono);
        if gap > SUSPEND_THRESHOLD_MS && gap > self.skew_ms {
            self.skew_ms = gap;
        }
    }

    /// Avanza la máquina de estados. Devuelve `true` solo en la llamada en la
    /// que la sesión pasa a `Finished`.
    pub fn tick(&mut self) -> bool {
        self.sync();
        if self.phase == Phase::Running && self.remaining_ms() == 0 {
            self.phase = Phase::Finished;
            return true;
        }
        false
    }

    /// Cambia la duración de la próxima sesión. Solo en `Idle` o `Finished`.
    pub fn set_duration(&mut self, ms: u64) -> Result<(), TimerError> {
        let ms = validate_duration_ms(ms)?;
        match self.phase {
            Phase::Idle | Phase::Finished => {
                self.duration_ms = ms;
                self.base_remaining_ms = ms;
                self.phase = Phase::Idle;
                self.kind = SessionKind::Focus;
                Ok(())
            }
            _ => Err(TimerError::InvalidTransition),
        }
    }

    /// Inicia un descanso de `ms` (1–60 min). Solo en `Idle` o `Finished`.
    pub fn start_break(&mut self, ms: u64) -> Result<(), TimerError> {
        let ms = validate_break_ms(ms)?;
        match self.phase {
            Phase::Idle | Phase::Finished => {
                self.duration_ms = ms;
                self.base_remaining_ms = ms;
                self.kind = SessionKind::Break;
                self.mark_started();
                self.phase = Phase::Running;
                Ok(())
            }
            _ => Err(TimerError::InvalidTransition),
        }
    }

    /// `Idle`/`Finished` → `Running` con la duración completa, como sesión de enfoque.
    pub fn start(&mut self) -> Result<(), TimerError> {
        match self.phase {
            Phase::Idle | Phase::Finished => {
                self.kind = SessionKind::Focus;
                self.base_remaining_ms = self.duration_ms;
                self.mark_started();
                self.phase = Phase::Running;
                Ok(())
            }
            _ => Err(TimerError::InvalidTransition),
        }
    }

    pub fn pause(&mut self) -> Result<(), TimerError> {
        if self.phase != Phase::Running {
            return Err(TimerError::InvalidTransition);
        }
        if self.tick() {
            return Ok(());
        }
        self.base_remaining_ms = self.remaining_ms();
        self.phase = Phase::Paused;
        Ok(())
    }

    pub fn resume(&mut self) -> Result<(), TimerError> {
        if self.phase != Phase::Paused {
            return Err(TimerError::InvalidTransition);
        }
        self.mark_started();
        self.phase = Phase::Running;
        Ok(())
    }

    /// Vuelve a la duración completa conservando la fase: una sesión en marcha
    /// sigue en marcha y una pausada sigue pausada.
    pub fn reset(&mut self) -> Result<(), TimerError> {
        match self.phase {
            Phase::Running => {
                self.base_remaining_ms = self.duration_ms;
                self.mark_started();
                Ok(())
            }
            Phase::Paused => {
                self.base_remaining_ms = self.duration_ms;
                Ok(())
            }
            _ => Err(TimerError::InvalidTransition),
        }
    }

    /// Abandona la sesión y vuelve a `Idle`. Válido en cualquier fase.
    pub fn cancel(&mut self) {
        self.phase = Phase::Idle;
        self.kind = SessionKind::Focus;
        self.base_remaining_ms = self.duration_ms;
        self.skew_ms = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::rc::Rc;

    #[derive(Clone, Default)]
    struct FakeClock {
        mono: Rc<Cell<u64>>,
        wall: Rc<Cell<u64>>,
    }

    impl FakeClock {
        fn new() -> Self {
            let c = Self::default();
            c.wall.set(1_800_000_000_000);
            c
        }
        /// Tiempo normal: avanzan los dos relojes.
        fn advance(&self, ms: u64) {
            self.mono.set(self.mono.get() + ms);
            self.wall.set(self.wall.get() + ms);
        }
        /// Suspensión con monotónico congelado: solo avanza el de pared.
        fn suspend(&self, ms: u64) {
            self.wall.set(self.wall.get() + ms);
        }
        fn set_wall_back(&self, ms: u64) {
            self.wall.set(self.wall.get() - ms);
        }
    }

    impl Clock for FakeClock {
        fn mono_ms(&self) -> u64 {
            self.mono.get()
        }
        fn wall_ms(&self) -> u64 {
            self.wall.get()
        }
    }

    const MIN: u64 = 60_000;

    fn timer(ms: u64) -> (Timer<FakeClock>, FakeClock) {
        let c = FakeClock::new();
        (Timer::new(c.clone(), ms).unwrap(), c)
    }

    #[test]
    fn validates_durations() {
        assert_eq!(validate_duration_ms(999), Err(TimerError::InvalidDuration));
        assert_eq!(validate_duration_ms(1_000), Ok(1_000));
        assert_eq!(validate_duration_ms(MAX_DURATION_MS), Ok(MAX_DURATION_MS));
        assert_eq!(validate_duration_ms(MAX_DURATION_MS + 1), Err(TimerError::InvalidDuration));
        assert_eq!(duration_from_parts(25, 0), Ok(25 * MIN));
        assert_eq!(duration_from_parts(0, 1), Ok(1_000));
        assert_eq!(duration_from_parts(0, 0), Err(TimerError::InvalidDuration));
        assert_eq!(duration_from_parts(1, 60), Err(TimerError::InvalidDuration));
        assert_eq!(duration_from_parts(180, 0), Ok(MAX_DURATION_MS));
        assert_eq!(duration_from_parts(180, 1), Err(TimerError::InvalidDuration));
        assert_eq!(duration_from_parts(u32::MAX, 59), Err(TimerError::InvalidDuration));
        assert!(Timer::new(FakeClock::new(), 0).is_err());
    }

    #[test]
    fn starts_idle_with_full_duration() {
        let (t, _) = timer(25 * MIN);
        assert_eq!(t.snapshot(), Snapshot { phase: Phase::Idle, kind: SessionKind::Focus, duration_ms: 25 * MIN, remaining_ms: 25 * MIN });
    }

    #[test]
    fn start_counts_down() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        assert_eq!(t.phase(), Phase::Running);
        c.advance(10_000);
        assert_eq!(t.remaining_ms(), 25 * MIN - 10_000);
        assert_eq!(t.start(), Err(TimerError::InvalidTransition));
    }

    #[test]
    fn pause_freezes_and_resume_continues() {
        let (mut t, c) = timer(10 * MIN);
        t.start().unwrap();
        c.advance(4 * MIN);
        t.pause().unwrap();
        assert_eq!(t.phase(), Phase::Paused);
        c.advance(30 * MIN);
        assert!(!t.tick());
        assert_eq!(t.remaining_ms(), 6 * MIN);
        t.resume().unwrap();
        c.advance(MIN);
        assert_eq!(t.remaining_ms(), 5 * MIN);
        assert_eq!(t.resume(), Err(TimerError::InvalidTransition));
    }

    #[test]
    fn pause_requires_running() {
        let (mut t, _) = timer(MIN);
        assert_eq!(t.pause(), Err(TimerError::InvalidTransition));
    }

    #[test]
    fn reset_keeps_phase() {
        let (mut t, c) = timer(10 * MIN);
        assert_eq!(t.reset(), Err(TimerError::InvalidTransition));
        t.start().unwrap();
        c.advance(3 * MIN);
        t.reset().unwrap();
        assert_eq!(t.phase(), Phase::Running);
        assert_eq!(t.remaining_ms(), 10 * MIN);
        c.advance(MIN);
        assert_eq!(t.remaining_ms(), 9 * MIN);
        t.pause().unwrap();
        t.reset().unwrap();
        assert_eq!(t.phase(), Phase::Paused);
        assert_eq!(t.remaining_ms(), 10 * MIN);
    }

    #[test]
    fn cancel_returns_to_idle_from_any_phase() {
        let (mut t, c) = timer(5 * MIN);
        t.start().unwrap();
        c.advance(MIN);
        t.cancel();
        assert_eq!(t.snapshot(), Snapshot { phase: Phase::Idle, kind: SessionKind::Focus, duration_ms: 5 * MIN, remaining_ms: 5 * MIN });
        t.start().unwrap();
        t.pause().unwrap();
        t.cancel();
        assert_eq!(t.phase(), Phase::Idle);
    }

    #[test]
    fn finishes_exactly_once() {
        let (mut t, c) = timer(MIN);
        t.start().unwrap();
        c.advance(MIN - 1);
        assert!(!t.tick());
        assert_eq!(t.remaining_ms(), 1);
        c.advance(1);
        assert!(t.tick());
        assert_eq!(t.snapshot().phase, Phase::Finished);
        assert_eq!(t.remaining_ms(), 0);
        c.advance(MIN);
        assert!(!t.tick());
    }

    #[test]
    fn late_tick_does_not_underflow() {
        let (mut t, c) = timer(MIN);
        t.start().unwrap();
        c.advance(10 * MIN);
        assert_eq!(t.remaining_ms(), 0);
        assert!(t.tick());
    }

    #[test]
    fn restart_after_finish_and_set_duration() {
        let (mut t, c) = timer(MIN);
        t.start().unwrap();
        c.advance(MIN);
        assert!(t.tick());
        t.start().unwrap();
        assert_eq!(t.remaining_ms(), MIN);
        assert_eq!(t.set_duration(2 * MIN), Err(TimerError::InvalidTransition));
        c.advance(MIN);
        t.tick();
        t.set_duration(2 * MIN).unwrap();
        assert_eq!(t.snapshot(), Snapshot { phase: Phase::Idle, kind: SessionKind::Focus, duration_ms: 2 * MIN, remaining_ms: 2 * MIN });
        assert_eq!(t.set_duration(0), Err(TimerError::InvalidDuration));
    }

    /// Precisión: muchos ticks irregulares no acumulan deriva.
    #[test]
    fn irregular_ticks_do_not_drift() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        let steps = [7, 993, 1_000, 16, 2_513, 250, 1, 999, 61_000, 333];
        let mut total = 0;
        for i in 0..5_000 {
            let s = steps[i % steps.len()];
            if total + s >= 25 * MIN {
                break;
            }
            c.advance(s);
            total += s;
            assert!(!t.tick());
            assert_eq!(t.remaining_ms(), 25 * MIN - total);
        }
    }

    /// Minimizar u ocultar la ventana equivale a que nadie consulte el
    /// temporizador durante un rato: al volver, el restante es el correcto.
    #[test]
    fn unobserved_time_still_counts() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(20 * MIN);
        assert_eq!(t.remaining_ms(), 5 * MIN);
    }

    /// Suspensión con reloj monotónico congelado: el tiempo real cuenta.
    #[test]
    fn suspend_with_frozen_monotonic_clock_counts_wall_time() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(5 * MIN);
        c.suspend(10 * MIN);
        assert!(!t.tick());
        assert_eq!(t.remaining_ms(), 10 * MIN);
        c.advance(MIN);
        t.tick();
        assert_eq!(t.remaining_ms(), 9 * MIN);
    }

    /// Suspensión con reloj monotónico que sí avanza: no se cuenta dos veces.
    #[test]
    fn suspend_with_advancing_monotonic_clock_is_not_double_counted() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(15 * MIN);
        t.tick();
        assert_eq!(t.remaining_ms(), 10 * MIN);
    }

    #[test]
    fn suspend_past_deadline_finishes_on_wake() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(MIN);
        c.suspend(3 * 60 * MIN);
        assert!(t.tick());
        assert_eq!(t.phase(), Phase::Finished);
    }

    #[test]
    fn small_wall_clock_adjustments_are_ignored() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(MIN);
        c.suspend(SUSPEND_THRESHOLD_MS);
        t.tick();
        assert_eq!(t.remaining_ms(), 24 * MIN);
    }

    #[test]
    fn setting_wall_clock_back_does_not_give_time_back() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(5 * MIN);
        c.suspend(10 * MIN);
        t.tick();
        c.set_wall_back(60 * MIN);
        t.tick();
        assert_eq!(t.remaining_ms(), 10 * MIN);
    }

    #[test]
    fn suspend_while_paused_is_ignored() {
        let (mut t, c) = timer(25 * MIN);
        t.start().unwrap();
        c.advance(5 * MIN);
        t.pause().unwrap();
        c.suspend(60 * MIN);
        t.tick();
        t.resume().unwrap();
        t.tick();
        assert_eq!(t.remaining_ms(), 20 * MIN);
    }

    #[test]
    fn pausing_at_zero_finishes() {
        let (mut t, c) = timer(MIN);
        t.start().unwrap();
        c.advance(MIN);
        t.pause().unwrap();
        assert_eq!(t.phase(), Phase::Finished);
    }

    #[test]
    fn break_session_lifecycle() {
        let (mut t, c) = timer(25 * MIN);
        assert_eq!(t.start_break(59_999), Err(TimerError::InvalidDuration));
        assert_eq!(t.start_break(MAX_BREAK_MS + 1), Err(TimerError::InvalidDuration));
        t.start().unwrap();
        assert_eq!(t.start_break(5 * MIN), Err(TimerError::InvalidTransition));
        c.advance(25 * MIN);
        assert!(t.tick());
        assert_eq!(t.kind(), SessionKind::Focus);
        t.start_break(5 * MIN).unwrap();
        assert_eq!(t.snapshot(), Snapshot { phase: Phase::Running, kind: SessionKind::Break, duration_ms: 5 * MIN, remaining_ms: 5 * MIN });
        c.advance(2 * MIN);
        t.pause().unwrap();
        t.reset().unwrap();
        assert_eq!(t.kind(), SessionKind::Break);
        t.resume().unwrap();
        c.advance(5 * MIN);
        assert!(t.tick());
        assert_eq!(t.snapshot().kind, SessionKind::Break);
        // Tras el descanso, fijar la duración o cancelar vuelve a enfoque.
        t.set_duration(25 * MIN).unwrap();
        assert_eq!(t.kind(), SessionKind::Focus);
        t.start_break(MIN).unwrap();
        t.cancel();
        assert_eq!(t.kind(), SessionKind::Focus);
    }

    #[test]
    fn snapshot_serializes_for_the_ui() {
        let (t, _) = timer(MIN);
        let json = serde_json::to_string(&t.snapshot()).unwrap();
        assert_eq!(json, r#"{"phase":"idle","kind":"focus","durationMs":60000,"remainingMs":60000}"#);
    }
}
