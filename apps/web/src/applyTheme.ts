import { colors, dashboardFontSizes, fonts } from '@wechiau/ui/theme';

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * Exposes the shared design tokens as CSS variables (--green, --text-muted…)
 * so styles.css uses the same values as the phone apps.
 */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(colors)) root.style.setProperty(`--${kebab(name)}`, value);
  for (const [name, value] of Object.entries(dashboardFontSizes)) root.style.setProperty(`--size-${kebab(name)}`, `${value}px`);
  root.style.setProperty('--font', fonts.web);
}
