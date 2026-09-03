/**
 * Ce qui distingue un WebID d'un autre, sans ce qui ne distingue rien.
 *
 * `https://pod.nicolasdb.eu/nicolas_claude/profile/card#me` tient en
 * `nicolas_claude`. Le schéma et le domaine sont identiques d'un pod à l'autre
 * chez un même fournisseur, et `/profile/card#me` est la convention CSS que
 * portent toutes les identités — trois morceaux qui occupaient la barre pendant
 * que la partie utile, à la fin, était justement celle que l'ellipse coupait.
 *
 * Le WebID entier reste dans `title` : c'est la valeur à copier, à vérifier,
 * à coller dans un ticket.
 */
export function shortWebId(webId: string): string {
  try {
    const url = new URL(webId);
    const path = url.pathname.replace(/\/profile\/card$/, "").replace(/^\/|\/$/g, "");
    // Un WebID hébergé à la racine n'a plus rien à montrer que son hôte.
    return path || url.host;
  } catch {
    return webId;
  }
}
