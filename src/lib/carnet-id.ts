/**
 * Décode la date de création portée par le slug d'un carnet.
 *
 * `createCarnet` et `createLogbookFromProtocol` nomment le container
 * `<titre-slugifié>-<Date.now().toString(36)>/` — l'horodatage est déjà là,
 * inutile d'écrire un champ `dateCréation` pour ce que le nom porte déjà.
 * Sert à distinguer deux carnets au même titre dans le sélecteur, sans lecture
 * supplémentaire.
 */
export function carnetCreatedAt(carnetContainerUrl: string): Date | null {
  const segment = carnetContainerUrl.replace(/\/$/, "").split("/").pop() ?? "";
  const token = segment.split("-").pop() ?? "";
  if (!/^[0-9a-z]+$/.test(token)) return null;
  const ms = parseInt(token, 36);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  // Un slug antérieur à ce schéma (carnet `st:` très ancien, ou renommé à la
  // main) peut produire un nombre qui n'est pas une date plausible.
  if (date.getFullYear() < 2020 || date.getFullYear() > 2100) return null;
  return date;
}
