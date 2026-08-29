import type { NewCarnet } from "./pod";

/** Le programme "Échauffement quotidien" (semaine 1) transposé en carnet. */
export const echauffementSemaine1: NewCarnet = {
  titre: "Échauffement quotidien",
  objectif: "15-20 min par jour, 7j/7, avec Feiyue ou pieds nus (surface propre/sécurisée)",
  frequence: "7x/semaine",
  modele: {
    titre: "Séance d'échauffement",
    blocs: [
      {
        titre: "Activation cardiovasculaire",
        ordre: 1,
        dureeSecondes: 300,
        exercices: [
          {
            titre: "Marche rapide",
            repetitions: "3-5 min",
            note: "Focus roulade du pied (talon → orteils), bras qui balancent naturellement. À la maison: marche sur place en levant les genoux.",
          },
        ],
      },
      {
        titre: "Mobilité articulaire",
        ordre: 2,
        dureeSecondes: 300,
        exercices: [
          { titre: "Cercles de chevilles", repetitions: "10 dans chaque sens, par pied" },
          { titre: "Cercles de hanches", repetitions: "10 dans chaque sens (mains sur les hanches)" },
          { titre: "Fentes marchées", repetitions: "5 par jambe", note: "Pour ouvrir les hanches" },
          { titre: "Rotations du bassin", repetitions: "10 cercles larges (mains sur les hanches)" },
          {
            titre: "Étirements dynamiques des mollets",
            repetitions: "5 répétitions par jambe, maintien 2-3s",
            note: "Fente basse, genou avant à 90°, talon arrière au sol",
          },
        ],
      },
      {
        titre: "Activation musculaire",
        ordre: 3,
        dureeSecondes: 300,
        exercices: [
          {
            titre: "Squats pieds nus",
            repetitions: "3 séries de 10",
            note: "Descends lentement (3s), remonte en poussant sur les talons",
          },
          {
            titre: "Équilibre sur une jambe",
            repetitions: "30 secondes par jambe, yeux ouverts",
            note: "Variante difficile: yeux fermés, ou pied libre sur le genou (flamingo)",
          },
          { titre: "Montées sur la pointe des pieds", repetitions: "3 séries de 15", note: "Sur une marche pour plus d'amplitude" },
          { titre: "Sauts légers sur place", repetitions: "2 séries de 10", note: "Pieds joints, atterrissage en silence" },
        ],
      },
      {
        titre: "Transition vers la course",
        ordre: 4,
        dureeSecondes: 240,
        exercices: [
          { titre: "Course sur place", repetitions: "1 min" },
          { titre: "Petits pas rapides", repetitions: "3 x 20 secondes" },
          { titre: "Accélérations progressives", repetitions: "3 x (10s marche très rapide + 20s marche normale)" },
        ],
      },
    ],
  },
};
