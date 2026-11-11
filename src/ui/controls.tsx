import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant,
  size = "l",
  icon,
  children,
  ...rest
}: ButtonProps & { variant: "filled" | "tonal" | "tertiary" | "text"; size?: "l" | "m"; icon?: IconName }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size}`} {...rest}>
      {icon && <Icon name={icon} size={size === "l" ? 24 : 20} />}
      <span>{children}</span>
    </button>
  );
}

/** Botón de icono. `label` es obligatorio: es su nombre accesible. */
export function IconButton({
  icon,
  label,
  variant = "standard",
  size = 40,
  pressed,
  ...rest
}: ButtonProps & { icon: IconName; label: string; variant?: "standard" | "tonal"; size?: 32 | 40 | 48; pressed?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${variant} icon-btn-${size}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon name={icon} size={size === 48 ? 24 : size === 40 ? 20 : 18} />
    </button>
  );
}

export function Chip({ selected, children, ...rest }: ButtonProps & { selected: boolean }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} {...rest}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="segment"
          onClick={() => onChange(o.value)}
        >
          {o.value === value && <Icon name="check" size={16} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch-thumb" />
    </button>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}

export function Stack({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stack">
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}
