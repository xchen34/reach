var BEACON_HOST = "https://YOUR_BEACON_HOST";
var BEACON_INGEST_TOKEN = "YOUR_SHARED_INGEST_TOKEN";

var FORM_CONFIG = {
  "Safe Check-In Form": {
    report_kind: "safe",
    source_form_name: "Safe Check-In Form",
    mapRow: mapSafeCheckInRow
  },
  "Missing Person Form": {
    report_kind: "missing",
    source_form_name: "Missing Person Form",
    mapRow: mapMissingPersonRow
  },
  "Update / Lead Form": {
    report_kind: "update",
    source_form_name: "Update / Lead Form",
    mapRow: mapUpdateLeadRow
  }
};

function onFormSubmit(e) {
  var namedValues = e.namedValues || {};
  var formName = detectFormName_(e, namedValues);
  var formConfig = FORM_CONFIG[formName];

  if (!formConfig) {
    throw new Error("No Beacon ingest mapping configured for form: " + formName);
  }

  var payload = formConfig.mapRow(namedValues);
  payload.report_kind = formConfig.report_kind;
  payload.source_form_name = formConfig.source_form_name;
  payload.source_entry_id = buildSourceEntryId_(e);

  var response = UrlFetchApp.fetch(BEACON_HOST + "/ingest/google-form", {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-beacon-ingest-token": BEACON_INGEST_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log("Beacon ingest status: " + response.getResponseCode());
  Logger.log(response.getContentText());
}

function mapSafeCheckInRow(values) {
  return {
    location_summary: firstValue_(values["Current location or last safe location"]),
    details_summary: joinSections_([
      "Safe report for: " + firstValue_(values["Who are you reporting about?"]),
      "Status confirmed at: " + firstValue_(values["When was this status confirmed?"]),
      "How this was confirmed: " + firstValue_(values["How do you know this?"]),
      "Short update: " + firstValue_(values["Short update"])
    ]),
    language_code: normalizeLanguageCode_(values["Language code"]),
    urgency: "low",
    incident_type: "other",
    reporter_name: firstValue_(values["Reporter name"]),
    reporter_email: firstValue_(values["Reporter contact email"]),
    reporter_phone: firstValue_(values["Reporter contact phone"]),
    subject_name: firstValue_(values["Who are you reporting about?"]),
    public_update_hint: firstValue_(values["Public summary suggestion"]) || "Safe check-in received. Waiting for volunteer verification.",
    source_relationship: mapSourceRelationship_(firstValue_(values["How do you know this?"])),
    public_visibility_requested: mapYesNo_(firstValue_(values["Can part of this update be shown publicly?"])),
    submitted_at: firstValue_(values["Timestamp"])
  };
}

function mapMissingPersonRow(values) {
  return {
    location_summary: firstValue_(values["Last known location"]),
    details_summary: joinSections_([
      "Missing or unreachable report for: " + firstValue_(values["Who are you trying to locate?"]),
      "Last confirmed contact or sighting: " + firstValue_(values["When were they last confirmed reachable or seen?"]),
      "Reason for concern: " + firstValue_(values["What makes you think they may be missing or unreachable?"]),
      "Known needs or vulnerabilities: " + firstValue_(values["Known needs or vulnerabilities"])
    ]),
    language_code: normalizeLanguageCode_(values["Language code"]),
    urgency: "high",
    incident_type: "other",
    reporter_name: firstValue_(values["Reporter name"]),
    reporter_email: firstValue_(values["Reporter contact email"]),
    reporter_phone: firstValue_(values["Reporter contact phone"]),
    subject_name: firstValue_(values["Who are you trying to locate?"]),
    public_update_hint: "Missing-person report received. Waiting for volunteer verification.",
    source_relationship: mapSourceRelationship_(firstValue_(values["How do you know this?"])),
    callback_allowed: mapYesNo_(firstValue_(values["Can volunteers contact you for verification?"])),
    public_visibility_requested: mapYesNo_(firstValue_(values["Can a public-safe summary be shown on the board?"])),
    submitted_at: firstValue_(values["Timestamp"])
  };
}

function mapUpdateLeadRow(values) {
  return {
    location_summary: firstValue_(values["Related location"]),
    details_summary: joinSections_([
      "Update about: " + firstValue_(values["Who or what is this update about?"]),
      "Update type: " + firstValue_(values["Type of update"]),
      "Update details: " + firstValue_(values["Update details"]),
      "Confirmed at: " + firstValue_(values["When did this happen or when was it confirmed?"]),
      "How this is known: " + firstValue_(values["How do you know this?"])
    ]),
    language_code: normalizeLanguageCode_(values["Language code"]),
    urgency: "medium",
    incident_type: mapIncidentType_(firstValue_(values["Type of update"])),
    reporter_name: firstValue_(values["Reporter name"]),
    reporter_email: firstValue_(values["Reporter contact email"]),
    reporter_phone: firstValue_(values["Reporter contact phone"]),
    subject_name: firstValue_(values["Who or what is this update about?"]),
    public_update_hint: firstValue_(values["Public summary suggestion"]) || "Community update received. Waiting for volunteer verification.",
    source_relationship: mapSourceRelationship_(firstValue_(values["How do you know this?"])),
    public_visibility_requested: mapYesNo_(firstValue_(values["Can this update be made public?"])),
    update_category: mapUpdateCategory_(firstValue_(values["Type of update"])),
    submitted_at: firstValue_(values["Timestamp"])
  };
}

function detectFormName_(e, namedValues) {
  if (e && e.source && typeof e.source.getTitle === "function") {
    return e.source.getTitle();
  }

  return firstValue_(namedValues["Form name"]);
}

function buildSourceEntryId_(e) {
  if (e && e.range) {
    return String(e.range.getRow());
  }

  return String(new Date().getTime());
}

function mapSourceRelationship_(value) {
  var normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.indexOf("i am the person") >= 0) {
    return "self";
  }
  if (normalized.indexOf("family") >= 0 || normalized.indexOf("friend") >= 0 || normalized.indexOf("direct contact") >= 0) {
    return "family_friend";
  }
  if (normalized.indexOf("neighbor") >= 0 || normalized.indexOf("community") >= 0) {
    return "community_member";
  }
  if (normalized.indexOf("witness") >= 0 || normalized.indexOf("on-site") >= 0 || normalized.indexOf("onsite") >= 0) {
    return "on_site";
  }
  return "other";
}

function mapIncidentType_(value) {
  var normalized = String(value || "").trim().toLowerCase();
  if (normalized.indexOf("shelter") >= 0 || normalized.indexOf("resource") >= 0) {
    return "shelter";
  }
  return "other";
}

function mapUpdateCategory_(value) {
  var normalized = String(value || "").trim().toLowerCase();
  if (normalized.indexOf("safe sighting") >= 0) {
    return "safe_sighting";
  }
  if (normalized.indexOf("missing-person lead") >= 0 || normalized.indexOf("missing person lead") >= 0) {
    return "missing_lead";
  }
  if (normalized.indexOf("correction") >= 0) {
    return "correction";
  }
  if (normalized.indexOf("shelter") >= 0 || normalized.indexOf("resource") >= 0) {
    return "resource_update";
  }
  return "other";
}

function mapYesNo_(value) {
  var normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "yes" || normalized === "y" || normalized === "true") {
    return true;
  }
  if (normalized === "no" || normalized === "n" || normalized === "false") {
    return false;
  }
  return null;
}

function normalizeLanguageCode_(value) {
  var normalized = String(firstValue_(value) || "en").trim().toLowerCase();
  return normalized || "en";
}

function firstValue_(value) {
  if (!value) {
    return "";
  }
  if (Object.prototype.toString.call(value) === "[object Array]") {
    return String(value[0] || "").trim();
  }
  return String(value).trim();
}

function joinSections_(items) {
  return items
    .map(function (item) {
      return String(item || "").trim();
    })
    .filter(function (item) {
      return item.length > 0;
    })
    .join("\n");
}
