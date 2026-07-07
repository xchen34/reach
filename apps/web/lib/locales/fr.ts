export const fr = {
  meta: {
    languageLabel: "Interface francaise",
  },
  caseStatus: {
    labels: {
      pending_review: "En attente de revue",
      active: "Active",
      waiting_for_information: "En attente d'informations",
      safe_resolved: "Situation resolue",
      closed: "Cloture",
    },
  },
  home: {
    eyebrow: "Beacon Phase 1",
    title: "Expliquez ce qui se passe.",
    description:
      "Utilisez ce formulaire pour envoyer un signalement anonyme. Si le danger est immediat, contactez maintenant les services d'urgence locaux.",
    privacy: "Ne partagez vos coordonnees que si vous souhaitez un suivi de l'equipe.",
    languagePicker: "Selection de langue",
    form: {
      title: "Signalement anonyme",
      incidentType: {
        label: "Type d'incident",
        hint: "Choisissez l'option la plus proche.",
        options: {
          medical: "Medical",
          fire: "Incendie",
          evacuation: "Evacuation",
          shelter: "Hebergement",
          utilities: "Services essentiels",
          other: "Autre",
        },
      },
      urgency: {
        label: "Urgence",
        hint: "Choisissez le niveau d'urgence actuel.",
        options: {
          low: "Faible",
          medium: "Moyenne",
          high: "Elevee",
          critical: "Critique",
        },
      },
      locationSummary: {
        label: "Lieu",
        hint: "Ajoutez les details utiles que vous pouvez partager en securite.",
      },
      needsSummary: {
        label: "De quoi avez-vous besoin maintenant ?",
        hint: "Decrivez la situation et les besoins immediats.",
      },
      reporterName: {
        label: "Votre nom (optionnel)",
        hint: "Laissez vide si vous souhaitez rester anonyme.",
      },
      reporterPhone: {
        label: "Numero de telephone (optionnel)",
        hint: "Ajoutez un numero seulement si l'equipe peut vous contacter.",
      },
      reporterEmail: {
        label: "Email (optionnel)",
        hint: "Ajoutez un email seulement si l'equipe peut vous contacter.",
      },
      submit: "Envoyer le signalement",
      submitting: "Envoi en cours...",
      errors: {
        network: "La requete n'a pas pu atteindre le serveur. Verifiez votre connexion et reessayez.",
        server: "Le serveur ne peut pas traiter le signalement pour le moment. Reessayez plus tard.",
      },
      validation: {
        incident_type: "Choisissez un type d'incident.",
        urgency: "Choisissez un niveau d'urgence.",
        location_summary_min: "Entrez au moins 5 caracteres pour le lieu.",
        location_summary_max: "Le lieu doit rester sous 280 caracteres.",
        needs_summary_min: "Entrez au moins 5 caracteres pour la situation.",
        needs_summary_max: "La description doit rester sous 4000 caracteres.",
        reporter_name_max: "Le nom doit rester sous 120 caracteres.",
        reporter_email_invalid: "Entrez une adresse email valide.",
        reporter_phone_max: "Le numero doit rester sous 40 caracteres.",
      },
    },
    success: {
      badge: "Envoye",
      title: "Votre signalement a ete envoye.",
      description:
        "Conservez le lien prive ci-dessous si vous voulez verifier le statut plus tard.",
      caseCodeLabel: "Code du dossier",
      statusLabel: "Statut actuel",
      shareLinkLabel: "Lien prive de suivi",
      shareLinkHelp:
        "Traitez ce lien comme prive. Toute personne qui le possede peut voir cette page de statut.",
      openShareLink: "Ouvrir la page de suivi",
      submitAnother: "Envoyer un autre signalement",
    },
  },
  share: {
    eyebrow: "Statut prive du dossier",
    title: "Statut actuel du dossier",
    description:
      "Cette page affiche le statut public actuel du dossier signale.",
    caseCodeLabel: "Code du dossier",
    statusLabel: "Statut",
    locationLabel: "Lieu",
    needsLabel: "Besoins signales",
    latestUpdateLabel: "Derniere mise a jour publique",
    latestUpdateFallback: "Aucune mise a jour publique pour le moment.",
    createdAtLabel: "Envoye le",
    footer:
      "Cette page ne contacte pas les services d'urgence. Si le danger est immediat, contactez maintenant les services d'urgence locaux.",
    loading: "Chargement de la page de suivi privee...",
    notFoundTitle: "Page de suivi privee introuvable",
    notFoundBody:
      "Ce lien de partage est invalide ou n'est plus disponible. Verifiez le lien complet et reessayez.",
    retry: "Reessayer",
    errorTitle: "La page de suivi privee est indisponible",
    errorBody:
      "Le serveur ne peut pas charger ce statut pour le moment. Reessayez plus tard.",
  },
};
