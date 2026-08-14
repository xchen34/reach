var Reach_HOST = "https://YOUR_Reach_HOST";
var Reach_INGEST_TOKEN = "YOUR_SHARED_INGEST_TOKEN";

/**
 * Install this as a Google Apps Script "On form submit" trigger on the response
 * spreadsheet. The script does not send form answers to Beacon. It only tells
 * Beacon that the linked Sheet changed, then Beacon imports through its single
 * Google Sheets mapping path.
 */
function onFormSubmit(e) {
  var response = UrlFetchApp.fetch(Reach_HOST + "/ingest/sync-intake", {
    method: "post",
    headers: {
      "x-beacon-ingest-token": Reach_INGEST_TOKEN
    },
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Beacon intake sync failed with status " + status + ": " + response.getContentText());
  }

  Logger.log("Beacon intake sync status: " + status);
  Logger.log(response.getContentText());
}
