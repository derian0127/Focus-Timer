// Iconos propios de 24 px: trazo de 1,75 px con extremos redondeados.
const PATHS = {
  play: { d: "M8 5.2v13.6L19 12z", fill: true },
  pause: { d: "M7 5h3.6v14H7zM13.4 5H17v14h-3.6z", fill: true },
  restart: { d: "M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4.6h4.6" },
  close: { d: "M6.5 6.5l11 11M17.5 6.5l-11 11" },
  min: { d: "M6.5 12h11" },
  plus: { d: "M6.5 12h11M12 6.5v11" },
  tune: { d: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" },
  pin: { d: "M12 16.5V21M8.5 3.5h7l-1 5.5 3 4.5h-11l3-4.5z" },
  back: { d: "M19 12H5.5M11 6l-6 6 6 6" },
  check: { d: "M5 12.5l4.5 4.5L19 7.5" },
  volume: { d: "M4.5 10v4h3l4.5 3.5v-11L7.5 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" },
  mute: { d: "M4.5 10v4h3l4.5 3.5v-11L7.5 10zM16 9.5l5 5M21 9.5l-5 5" },
  expand: { d: "M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5L13 11M4.5 19.5L11 13" },
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = PATHS[name];
  const filled = "fill" in p;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={p.d}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
