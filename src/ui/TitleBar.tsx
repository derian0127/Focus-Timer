import { useModel, useStore } from "../state/context";
import { statusLabel } from "../strings";
import { IconButton } from "./controls";

/** Barra de título propia: zona de arrastre, estado de la sesión y controles de ventana. */
export function TitleBar() {
  const store = useStore();
  const { timer, settings, view } = useModel();
  const inSettings = view === "settings";
  return (
    <header className="titlebar" data-tauri-drag-region>
      {inSettings ? (
        <div className="titlebar-left">
          <IconButton icon="back" label="Volver (Esc)" size={32} onClick={() => store.setView("timer")} />
          <h1 className="titlebar-title">Ajustes</h1>
        </div>
      ) : (
        <div className="status" data-tauri-drag-region>
          <span className="status-dot" />
          <span>{statusLabel(timer)}</span>
        </div>
      )}
      <div className="titlebar-actions">
        {!inSettings && (
          <>
            <IconButton
              icon="pin"
              label={settings.alwaysOnTop ? "Dejar de mantener siempre visible" : "Mantener siempre visible"}
              size={32}
              pressed={settings.alwaysOnTop}
              onClick={() => void store.patchSettings({ alwaysOnTop: !settings.alwaysOnTop })}
            />
            <IconButton icon="tune" label="Ajustes (Ctrl+,)" size={32} onClick={() => store.setView("settings")} />
          </>
        )}
        <IconButton icon="min" label="Minimizar a widget" size={32} onClick={store.minimize} />
        <IconButton icon="close" label="Cerrar ventana" size={32} onClick={store.close} />
      </div>
    </header>
  );
}
