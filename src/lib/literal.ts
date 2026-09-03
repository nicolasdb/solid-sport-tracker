import {
  getStringNoLocale,
  getStringWithLocale,
  type Thing,
} from "@inrupt/solid-client";
import { loadLang } from "./i18n";

/**
 * Lit un littéral quelle que soit sa langue.
 *
 * **Le piège que ceci désamorce.** `getStringNoLocale` ne rend *que* les
 * littéraux sans balise de langue : sur `act:title "Échauffement"@fr` il rend
 * `null`. Toutes les recettes écrites jusqu'ici sont sans balise, donc tout
 * fonctionne — mais le jour où le skill d'écriture de recettes se met à baliser
 * (ce qui est la bonne façon de faire en RDF, et ce vers quoi on va), chaque
 * titre deviendrait vide d'un coup. La lecture doit savoir gérer les deux
 * *avant* que l'écriture ne change, pas après.
 *
 * Ordre : la langue de l'interface d'abord — une recette bilingue doit
 * s'afficher dans la langue qu'on lit —, puis le littéral sans balise, puis
 * l'anglais et le français comme derniers recours. Mieux vaut un titre dans la
 * mauvaise langue qu'une ligne vide.
 *
 * Ce que ceci ne fait pas : choisir la langue de l'interface d'après la
 * recette. Le contenu est dans sa langue, l'interface dans celle de l'usager.
 */
export function readLiteral(thing: Thing, predicate: string): string | null {
  const preferred = loadLang();
  return (
    getStringWithLocale(thing, predicate, preferred) ??
    getStringNoLocale(thing, predicate) ??
    getStringWithLocale(thing, predicate, "en") ??
    getStringWithLocale(thing, predicate, "fr") ??
    null
  );
}
