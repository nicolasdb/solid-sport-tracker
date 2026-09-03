/**
 * Garde l'écran allumé pendant une séance.
 *
 * Sans ça, le téléphone se verrouille en pleine séance : l'usager doit le
 * réveiller pour savoir où il en est, et le navigateur en arrière-plan est
 * dépriorisé par le système.
 *
 * Deux chemins vers le *même* mécanisme système, pas un fort et un faible :
 *
 * 1. `navigator.wakeLock` — l'API dédiée, quand elle existe.
 * 2. Une vidéo muette en boucle — le « truc YouTube ». Un navigateur qui joue
 *    une vidéo demande lui-même l'inhibition de la veille : c'est le chemin
 *    média plutôt que le chemin API. Il ne *surpasse* pas le verrou natif, il
 *    rattrape les cas où celui-ci n'existe pas (Firefox mobile, iOS < 18.4) ou
 *    est relâché sans qu'on puisse le reprendre.
 *
 * Le verrou natif est relâché par le navigateur dès que la page passe en
 * arrière-plan, d'où la réacquisition sur `visibilitychange`. Si le verrou
 * tombe alors qu'on le voulait encore, on bascule sur la vidéo plutôt que
 * d'abandonner en silence.
 *
 * La vidéo n'a pas cette libération automatique — un onglet caché ne met pas
 * en pause une vidéo en cours tout seul, contrairement au verrou natif. Sans
 * l'écouteur ci-dessous, un tour de téléphone verrouillé pendant que l'onglet
 * reste ouvert en arrière-plan (pas fermé, juste oublié) laisserait la vidéo
 * boucler pour rien : plus personne ne regarde l'écran qu'elle empêche de
 * s'éteindre. La classe s'aligne donc elle-même sur le comportement du verrou
 * natif plutôt que de compter sur l'appelant pour y penser à chaque écran.
 *
 * `blank.webm` seulement : pas de variante MP4, donc Safari iOS ancien n'est
 * pas couvert par la retombée — c'est déjà la plateforme la plus contrainte
 * (cf. la limite haptique dans le README).
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private video: HTMLVideoElement | null = null;
  private wanted = false;

  constructor() {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Pas un drop : c'est la même mise en veille que le verrou natif
        // s'impose déjà tout seul, appliquée à la vidéo pour qu'elle la suive.
        this.stopVideo();
      } else {
        void this.reacquire();
      }
    });
  }

  /** Vrai dans tout navigateur : la retombée vidéo n'a besoin d'aucune API. */
  get supported(): boolean {
    return typeof document !== "undefined";
  }

  /**
   * Quel chemin tient l'écran, à l'instant présent. Affiché sur le bouton :
   * sans ça, « l'écran s'éteint quand même » est indiscernable de « le verrou
   * n'a jamais été pris », et on ne peut pas diagnostiquer à distance.
   */
  get status(): "native" | "video" | "off" {
    if (this.sentinel) return "native";
    if (this.video) return "video";
    return "off";
  }

  /**
   * Nombre de fois où le verrou est tombé alors qu'on le voulait encore, page
   * visible. C'est la mesure qui tranche : écran qui s'éteint avec ce compteur
   * à zéro = le système ignore un verrou bel et bien tenu, rien à corriger
   * côté page ; compteur qui monte = on perd le verrou et il faut rattraper.
   */
  drops = 0;

  private get nativeSupported(): boolean {
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
    this.stopVideo();
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
    if (this.sentinel) return;
    if (this.nativeSupported) {
      try {
        this.sentinel = await navigator.wakeLock.request("screen");
        this.sentinel.addEventListener("release", () => {
          this.sentinel = null;
          // Relâché sans qu'on l'ait demandé (et pas par un passage en
          // arrière-plan, qui a son propre rattrapage) : on prend la vidéo.
          if (this.wanted && document.visibilityState === "visible") {
            this.drops += 1;
            this.startVideo();
          }
        });
        this.stopVideo();
        return;
      } catch {
        // Refusé (batterie faible, page cachée) : la vidéo prend le relais.
        this.sentinel = null;
      }
    }
    this.startVideo();
  }

  /**
   * La lecture doit partir d'un geste utilisateur, comme l'AudioContext des
   * signaux : `acquire()` est appelé depuis le tap « Démarrer ». Un échec de
   * `play()` n'est pas rattrapable ici, on dégrade en silence.
   */
  private startVideo(): void {
    if (this.video) return;
    const video = document.createElement("video");
    video.src = `${import.meta.env.BASE_URL}blank.webm`;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    // Hors champ mais pas `display: none` : un navigateur met en pause une
    // vidéo qu'il considère comme non rendue.
    video.setAttribute(
      "style",
      "position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0;pointer-events:none"
    );
    document.body.appendChild(video);
    this.video = video;
    void video.play().catch(() => this.stopVideo());
  }

  private stopVideo(): void {
    const video = this.video;
    this.video = null;
    if (!video) return;
    video.pause();
    video.remove();
  }
}
