# Google Form Column Mapping

This file maps suggested Google Form question labels to Reach's ingest payload for `POST /ingest/google-form`.

For Incident-scoped Google Sheets imports, prefer stable machine-readable columns:

- `subject_type`
  - accepted values: `person`, `pet`, `unknown`
  - missing values default to `unknown`
  - do not infer pets from free text
- `Reach photo attachment code`
  - optional code returned by the Reach photo upload section
  - used to link uploaded photos to the imported Report

## Shared notes

- Keep question titles stable after publishing the form. Apps Script mappings depend on exact labels unless you adjust the script.
- Prefer separate `Reporter contact email` and `Reporter contact phone` questions instead of one overloaded field.
- Include the default Google Forms `Timestamp` field and pass it through as `submitted_at`.

## Safe Check-In Form

Suggested sheet columns:

- `Timestamp`
- `Who are you reporting about?`
- `Current location or last safe location`
- `When was this status confirmed?`
- `How do you know this?`
- `Short update`
- `Reporter name`
- `Reporter contact email`
- `Reporter contact phone`
- `Can part of this update be shown publicly?`
- `Public summary suggestion`
- `Language code`

Reach mapping:

- `report_kind = "safe"`
- `subject_name <- Who are you reporting about?`
- `location_summary <- Current location or last safe location`
- `details_summary <- composed from subject / confirmed time / source / short update`
- `source_relationship <- How do you know this?`
- `public_visibility_requested <- Can part of this update be shown publicly?`

## Missing Person Form

Suggested sheet columns:

- `Timestamp`
- `Who are you trying to locate?`
- `Last known location`
- `When were they last confirmed reachable or seen?`
- `What makes you think they may be missing or unreachable?`
- `How do you know this?`
- `Known needs or vulnerabilities`
- `Reporter name`
- `Reporter contact email`
- `Reporter contact phone`
- `Can volunteers contact you for verification?`
- `Can a public-safe summary be shown on the board?`
- `Language code`

Reach mapping:

- `report_kind = "missing"`
- `subject_name <- Who are you trying to locate?`
- `location_summary <- Last known location`
- `details_summary <- composed from subject / last confirmation / concern / vulnerabilities`
- `callback_allowed <- Can volunteers contact you for verification?`
- `public_visibility_requested <- Can a public-safe summary be shown on the board?`

## Update / Lead Form

Suggested sheet columns:

- `Timestamp`
- `Who or what is this update about?`
- `Type of update`
- `Update details`
- `When did this happen or when was it confirmed?`
- `How do you know this?`
- `Related location`
- `Reporter name`
- `Reporter contact email`
- `Reporter contact phone`
- `Can this update be made public?`
- `Public summary suggestion`
- `Language code`

Reach mapping:

- `report_kind = "update"`
- `subject_name <- Who or what is this update about?`
- `location_summary <- Related location`
- `details_summary <- composed from update target / type / details / confirmed time / source`
- `update_category <- Type of update`
- `public_visibility_requested <- Can this update be made public?`

## Expected enum outputs

`source_relationship`

- `self`
- `family_friend`
- `community_member`
- `on_site`
- `other`

`update_category`

- `safe_sighting`
- `missing_lead`
- `correction`
- `resource_update`
- `other`
