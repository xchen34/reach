# Beacon Community Coordination MVP

Beacon is being repositioned from a lightweight case-management workflow toward a disaster and crisis information coordination tool. Google Forms remains the fastest intake layer. Beacon focuses on verification, deduplication, status updates, and public presentation.

## Product goal

Support a community-operated flow for:

- reporting that someone is safe;
- reporting that someone is missing or unreachable;
- sharing updates or leads;
- verifying incoming reports internally;
- publishing trustworthy, privacy-aware public updates.

Beacon is not an emergency dispatch system and must never replace official emergency services.

## Operating model

The intended structure is:

1. Google Form intake
2. Volunteer/staff verification in Beacon
3. Public board/cards for approved updates

This mirrors the real-world pattern seen in community-led disaster coordination: simple intake first, manual verification second, public information board third.

## Google Form design

Create three separate forms rather than one overloaded form.

## Google Form bridge

Beacon now includes a minimal private ingest bridge for Google Form submissions.

### Current bridge shape

- hidden backend route: `POST /ingest/google-form`
- hidden from shared OpenAPI contract
- protected by shared header:
  - `x-beacon-ingest-token: <BEACON_GOOGLE_FORM_INGEST_TOKEN>`
- writes into the current `cases` table so the existing staff queue and public board adapter can see the record immediately

### Current payload

```json
{
  "report_kind": "missing",
  "location_summary": "Tower 2 lobby near the lifts",
  "details_summary": "Family cannot reach one resident and asks volunteers to verify their status.",
  "language_code": "en",
  "reporter_name": "Community Lead",
  "reporter_email": "lead@example.com",
  "reporter_phone": "+1 555 000 1111",
  "subject_name": "Resident A",
  "public_update_hint": "Missing-person report received. Waiting for volunteer verification.",
  "source_form_name": "Missing Person Form",
  "source_entry_id": "entry-123"
}
```

### Suggested Apps Script pattern

Use Google Apps Script attached to the response sheet, then POST a normalized payload to Beacon whenever a new row arrives.

Pseudo-flow:

1. Form writes to Google Sheet
2. Apps Script reads the new row
3. Apps Script maps row columns into Beacon's normalized JSON payload
4. Apps Script sends `POST /ingest/google-form` with the shared ingest token

This keeps Google Forms as the public intake layer while Beacon remains the internal verification and public board system.

Reference starter file:

- `docs/google-form-apps-script-example.js`
- `docs/google-form-column-mapping.md`

### 1. Safe check-in form

Use when a person is reporting themselves safe or confirming another person's safety.

Required fields:

- `Who are you reporting about?`
  Notes: name, nickname, or household identifier
- `What is their current status?`
  Fixed option: `Safe`
- `Current location or last safe location`
- `When was this status confirmed?`
- `How do you know this?`
  Options:
  - `I am the person`
  - `Direct contact with the person`
  - `Direct contact with family/friend`
  - `Other`

Optional fields:

- `Short update`
- `Reporter name`
- `Reporter contact`
- `Can part of this update be shown publicly?`
  Options:
  - `Yes`
  - `No`
- `Public summary suggestion`

### 2. Missing / unreachable form

Use when someone cannot be reached and volunteers need to verify their status.

Required fields:

- `Who are you trying to locate?`
- `Last known location`
- `When were they last confirmed reachable or seen?`
- `What makes you think they may be missing or unreachable?`
- `How do you know this?`
  Options:
  - `Family member`
  - `Friend`
  - `Neighbor / community member`
  - `On-site witness`
  - `Other`

Optional fields:

- `Known needs or vulnerabilities`
- `Reporter name`
- `Reporter contact`
- `Can volunteers contact you for verification?`
  Options:
  - `Yes`
  - `No`
- `Can a public-safe summary be shown on the board?`
  Options:
  - `Yes`
  - `No`

### 3. Update / lead form

Use for new sightings, corrections, shelter/resource updates, or any follow-up lead tied to an existing person/location.

Required fields:

- `Who or what is this update about?`
- `Type of update`
  Options:
  - `Safe sighting`
  - `Missing-person lead`
  - `Correction`
  - `Shelter/resource update`
  - `Other`
- `Update details`
- `When did this happen or when was it confirmed?`
- `How do you know this?`

Optional fields:

- `Related location`
- `Reporter name`
- `Reporter contact`
- `Can this update be made public?`
- `Public summary suggestion`

## Internal Beacon domain

Beacon should stop treating these as generic `cases` and instead move toward `records`.

### Record

Core fields:

- `id`
- `record_type`
  - `safe_report`
  - `missing_report`
  - `update_report`
- `subject_name`
- `subject_alias`
- `location_summary`
- `report_text`
- `source_type`
  - `self_report`
  - `family_friend`
  - `community_member`
  - `on_site`
  - `social_media`
  - `phone`
  - `other`
- `status`
  - `unverified`
  - `safe_confirmed`
  - `missing_reported`
  - `needs_follow_up`
  - `duplicate`
  - `closed`
- `reporter_name`
- `reporter_contact`
- `public_visible`
- `public_summary`
- `public_location_summary`
- `last_verified_at`
- `created_at`
- `updated_at`

### Record note

- `id`
- `record_id`
- `author_user_id`
- `note`
- `created_at`

### Record link

Use to relate duplicates or update chains.

- `id`
- `source_record_id`
- `target_record_id`
- `link_type`
  - `possible_duplicate`
  - `confirmed_duplicate`
  - `related_update`
- `created_at`

## Public versus internal field boundary

Beacon must default to privacy and only expose explicitly approved fields.

### Internal only

- reporter contact details
- staff notes
- raw unverified text
- duplicate-review notes
- action history details beyond public-safe summary

### Public-safe by default when approved

- subject name or alias
- generalized location
- current public status
- short public summary
- source label
- last verified time

### Never infer or fabricate

- do not invent safety outcomes
- do not publish AI-generated summaries as facts
- do not show exact private contact details publicly

## Staff verification workflow

The staff workspace should shift from “case handling” to “record verification.”

Primary actions:

- mark as `safe_confirmed`
- mark as `missing_reported`
- mark as `needs_follow_up`
- mark as `duplicate`
- close record
- add internal note
- edit public summary
- set public visibility
- link to another related record

Secondary actions:

- update source label
- update generalized public location
- record verification timestamp

## Public board requirements

The public board should become the main public-facing output.

Essential card fields:

- name or alias
- status
- generalized location
- short public summary
- source label
- last verified time

Essential filters:

- all
- safe confirmed
- missing reported
- needs follow-up
- recently updated

Ordering:

- newest verified first
- then newest created

## What stays from the current codebase

Keep:

- Next.js app shell
- FastAPI backend
- staff login/session
- audit log foundations
- staff list/detail routing structure
- localization framework

Freeze or deprioritize:

- AI intake review
- transcript-first workflow
- synthetic event dashboard as the primary public story
- private share-link as the primary public experience

## Suggested implementation order

1. Keep Google Forms as external intake and wire their URLs into the homepage.
2. Introduce the new `record` vocabulary in frontend copy and internal planning.
3. Build the public board page.
4. Adapt staff list and detail pages into verification terminology.
5. Change backend models and APIs from `case` semantics to `record` semantics in one coherent pass.
6. Add duplicate-linking and public visibility controls.

## MVP success criteria

Beacon is meaningfully beyond a plain Google Form setup when all of the following are true:

- intake can stay in Google Forms without slowing incident response;
- volunteers can verify and update reports inside Beacon;
- duplicate or related reports can be tracked;
- a privacy-aware public board can be updated quickly;
- the public board is more trustworthy and more readable than a raw spreadsheet.
