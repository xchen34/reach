export const en = {
  meta: {
    languageLabel: "English interface",
  },
  caseStatus: {
    labels: {
      pending_review: "Pending review",
      active: "Active",
      waiting_for_information: "Waiting for information",
      safe_resolved: "Safe and resolved",
      closed: "Closed",
    },
  },
  home: {
    eyebrow: "Beacon Phase 1",
    title: "Share what is happening.",
    description:
      "Use this form to send an anonymous case report. If you are in immediate danger, contact local emergency services now.",
    privacy: "Only share contact details if you want follow-up from staff.",
    languagePicker: "Language selector",
    form: {
      title: "Anonymous case submission",
      incidentType: {
        label: "Incident type",
        hint: "Choose the closest match.",
        options: {
          medical: "Medical",
          fire: "Fire",
          evacuation: "Evacuation",
          shelter: "Shelter",
          utilities: "Utilities",
          other: "Other",
        },
      },
      urgency: {
        label: "Urgency",
        hint: "Choose the current level of urgency.",
        options: {
          low: "Low",
          medium: "Medium",
          high: "High",
          critical: "Critical",
        },
      },
      locationSummary: {
        label: "Location",
        hint: "Include the safest helpful location details you can share.",
      },
      needsSummary: {
        label: "What do you need right now?",
        hint: "Describe the situation and immediate needs.",
      },
      reporterName: {
        label: "Your name (optional)",
        hint: "Leave blank if you want to stay anonymous.",
      },
      reporterPhone: {
        label: "Phone number (optional)",
        hint: "Include a number only if staff may contact you.",
      },
      reporterEmail: {
        label: "Email (optional)",
        hint: "Include an email only if staff may contact you.",
      },
      submit: "Send report",
      submitting: "Sending report...",
      errors: {
        network: "The request could not reach the server. Check your connection and try again.",
        server: "The server could not process the report right now. Please try again.",
      },
      validation: {
        incident_type: "Choose an incident type.",
        urgency: "Choose an urgency level.",
        location_summary_min: "Enter at least 5 characters for the location.",
        location_summary_max: "Keep the location under 280 characters.",
        needs_summary_min: "Enter at least 5 characters for the situation.",
        needs_summary_max: "Keep the situation under 4000 characters.",
        reporter_name_max: "Keep the name under 120 characters.",
        reporter_email_invalid: "Enter a valid email address.",
        reporter_phone_max: "Keep the phone number under 40 characters.",
      },
    },
    success: {
      badge: "Submitted",
      title: "Your report was sent.",
      description:
        "Keep the private link below if you want to check the case status later.",
      caseCodeLabel: "Case code",
      statusLabel: "Current status",
      shareLinkLabel: "Private status link",
      shareLinkHelp:
        "Treat this link as private. Anyone with it can view this case status page.",
      openShareLink: "Open private status page",
      submitAnother: "Submit another report",
    },
  },
  share: {
    eyebrow: "Private case status",
    title: "Current case status",
    description:
      "This page shows the current public status for the submitted case.",
    caseCodeLabel: "Case code",
    statusLabel: "Status",
    locationLabel: "Location",
    needsLabel: "Reported needs",
    latestUpdateLabel: "Latest public update",
    latestUpdateFallback: "No public update has been posted yet.",
    createdAtLabel: "Submitted",
    footer:
      "This page does not contact emergency services. If danger is immediate, contact local emergency services now.",
    loading: "Loading the private status page...",
    notFoundTitle: "Private status page not found",
    notFoundBody:
      "This share link is invalid or no longer available. Check the full link and try again.",
    retry: "Try again",
    errorTitle: "The private status page is unavailable",
    errorBody:
      "The server could not load this case status right now. Please try again.",
  },
};
