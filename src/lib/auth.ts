import {
  login,
  handleIncomingRedirect,
  getDefaultSession,
  fetch as authFetch,
} from "@inrupt/solid-client-authn-browser";
import { getSolidDataset, getThing, getUrl } from "@inrupt/solid-client";

const CLIENT_NAME = "Solid Sport Tracker";
const OIDC_ISSUER_PREDICATE = "http://www.w3.org/ns/solid/terms#oidcIssuer";

/**
 * Découvre le fournisseur OIDC déclaré par un WebID (triple solid:oidcIssuer
 * dans son propre profil), pour éviter de demander un provider en dur.
 */
export async function discoverOidcIssuer(webId: string): Promise<string> {
  const profileUrl = webId.split("#")[0];
  const dataset = await getSolidDataset(profileUrl);
  const me = getThing(dataset, webId);
  if (!me) {
    throw new Error(`Le WebID ${webId} est introuvable dans son propre profil.`);
  }
  const issuer = getUrl(me, OIDC_ISSUER_PREDICATE);
  if (!issuer) {
    throw new Error("Aucun solid:oidcIssuer déclaré dans ce profil WebID.");
  }
  return issuer;
}

export async function loginWithWebId(webId: string): Promise<void> {
  const oidcIssuer = await discoverOidcIssuer(webId);
  await login({
    oidcIssuer,
    redirectUrl: window.location.href.split("?")[0],
    clientName: CLIENT_NAME,
  });
}

export async function completeLogin(): Promise<void> {
  await handleIncomingRedirect({ restorePreviousSession: true });
}

export function getSession() {
  return getDefaultSession();
}

export async function logout(): Promise<void> {
  await getDefaultSession().logout();
}

export { authFetch };
