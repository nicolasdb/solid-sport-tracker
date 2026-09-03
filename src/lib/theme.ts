/**
 * Clair / sombre, choisi par l'usager.
 *
 * Deux états, pas trois. Un « auto » suivant `prefers-color-scheme` a été
 * essayé puis retiré : le bon thème ici ne dépend pas de l'heure mais de
 * l'endroit où l'on s'entraîne — plein soleil dehors à midi veut le thème
 * clair, une salle tamisée veut le sombre, et le système ne sait ni l'un ni
 * l'autre. Un troisième état qui se trompe autant coûte un tap de plus à
 * chaque séance pour en sortir.
 *
 * Le système décide quand même une fois : au tout premier lancement, faute de
 * mieux. Ensuite le choix de l'usager gagne, et `data-theme` est toujours posé
 * sur `<html>`.
 *
 * C'est un réglage d'appareil et de moment, au même titre que le son ou le
 * verrou d'écran. Il vit donc dans `localStorage` et non sur le pod, et il
 * s'applique dès le démarrage — avant le premier écran, pour ne pas afficher
 * le mauvais fond une fraction de seconde.
 */
export type ThemeChoice = "light" | "dark";

const THEME_KEY = "sst:theme";

export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: "☀️ Clair",
  dark: "🌙 Sombre",
};

function systemTheme(): ThemeChoice {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : systemTheme();
  } catch {
    return systemTheme();
  }
}

export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", choice);
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Stockage indisponible : le thème ne survit pas à la session, tant pis.
  }
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return choice === "dark" ? "light" : "dark";
}
