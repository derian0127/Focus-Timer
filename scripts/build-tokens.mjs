// Genera src/styles/tokens.css a partir de design/color-tokens.json.
// Los mismos valores están en las variables del archivo de Figma.
import { readFileSync, writeFileSync } from "node:fs";

const { light, dark } = JSON.parse(readFileSync(new URL("../design/color-tokens.json", import.meta.url), "utf8"));
const block = (map) => Object.entries(map).map(([k, v]) => `  --ft-color-${k}: ${v};`).join("\n");
const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 };
const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 999 };

const css = `/* GENERADO por scripts/build-tokens.mjs — no editar a mano. */
:root {
  color-scheme: light;
${block(light)}
${Object.entries(space).map(([k, v]) => `  --ft-space-${k}: ${v}px;`).join("\n")}
${Object.entries(radius).map(([k, v]) => `  --ft-radius-${k}: ${v}px;`).join("\n")}
  --ft-font: "Hanken Grotesk Variable", "Segoe UI", system-ui, sans-serif;
  --ft-ease: cubic-bezier(0.2, 0, 0, 1);
  --ft-fast: 150ms;
  --ft-medium: 200ms;
}

:root[data-theme="dark"] {
  color-scheme: dark;
${block(dark)}
}
`;
writeFileSync(new URL("../src/styles/tokens.css", import.meta.url), css);
console.log("tokens.css generado");
