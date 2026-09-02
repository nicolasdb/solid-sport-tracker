/**
 * Garde l'écran allumé pendant une séance.
 *
 * Sans ça, le téléphone se verrouille en pleine séance : l'usager doit le
 * réveiller pour savoir où il en est, et le navigateur en arrière-plan est
 * dépriorisé par le système.
 *
 * Le verrou est relâché par le navigateur dès que la page passe en
 * arrière-plan, d'où la réacquisition sur `visibilitychange`. L'API n'existe
 * pas partout (Firefox mobile, contextes non sécurisés) : l'absence de
 * support n'est pas une erreur, on dégrade en silence.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  get supported(): boolean {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  async acquire(): Promise<void> {
    this.wanted = true;
    await this.request();
  }

  async release(): Promise<void> {
    this.wanted = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    try {
      await sentinel?.release();
    } catch {
      // Verrou déjà perdu : rien à défaire.
    }
  }

  /** À appeler au retour en foreground : le verrou y a été relâché d'office. */
  async reacquire(): Promise<void> {
    if (!this.wanted) return;
    await this.request();
  }

  private async request(): Promise<void> {
    if (!this.supported || this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
      });
    } catch {
      // Refusé (batterie faible, page cachée) : on retentera au prochain retour.
      this.sentinel = null;
    }
  }
}
