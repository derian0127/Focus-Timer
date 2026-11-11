//! Lógica de negocio de Focus Timer, independiente de la interfaz y del sistema operativo.
//!
//! - [`timer`]: máquina de estados del temporizador con reloj inyectable.
//! - [`settings`]: modelo de configuración, saneado y persistencia atómica.

pub mod settings;
pub mod timer;
