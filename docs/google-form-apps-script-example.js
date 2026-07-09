function onFormSubmit(e) {
  var values = e.namedValues || {};

  var payload = {
    report_kind: "missing",
    location_summary: firstValue(values["Last known location"]),
    details_summary: firstValue(values["What makes you think they may be missing or unreachable?"]),
    language_code: "en",
    reporter_name: firstValue(values["Reporter name"]),
    reporter_email: firstValue(values["Reporter contact"]),
    subject_name: firstValue(values["Who are you trying to locate?"]),
    source_form_name: "Missing Person Form",
    source_entry_id: String(new Date().getTime())
  };

  var response = UrlFetchApp.fetch("https://YOUR_BEACON_HOST/ingest/google-form", {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-beacon-ingest-token": "YOUR_SHARED_INGEST_TOKEN"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}

function firstValue(value) {
  if (!value || !value.length) {
    return "";
  }
  return String(value[0]).trim();
}
