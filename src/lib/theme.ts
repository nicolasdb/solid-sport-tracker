/**
 * Clair / sombre, choisi par l'usager.
 *
 * Trois états, pas deux : un choix explicite pose `data-theme` sur `<html>`,
 * « système » retire l'attribut et laisse `prefers-color-scheme` décider. Sans
 * le troisième état, un appareil qui bascule tout seul au coucher du soleil ne
 * peut plus le faire une fois le bouton touché.
 *
 * C'est un réglage d'appareil et de moment, au même titre que le son ou le
 * verrou d'écran : plein soleil dehors contre salle sombre. Il vit donc dans
 * `localStorage` et non sur le pod, et il s'applique dès le démarrage — avant
 * le premier écran, pour ne pas afficher le mauvais fond une fraction de
 * seconde.
 */
export type ThemeChoice = "system" | "light" | "dark";

const THEME_KEY = "sst:theme";

export const THEME_CYCLE: ThemeChoice[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "🌗 Auto",
  light: "☀️ Clair",
  dark: "🌙 Sombre",
};

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Stockage indisponible : le thème ne survit pas à la session, tant pis.
  }
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(choice) + 1) % THEME_CYCLE.length];
}
