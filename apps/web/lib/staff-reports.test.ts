import assert from "node:assert/strict";
import test from "node:test";
import { getReportPrimaryText, selectDefaultIncidentId, summarizeReports } from "./staff-reports.ts";
import type { StaffIncidentSummary, StaffReportListItem } from "./api-types.ts";

test("selectDefaultIncidentId prefers the active Reach demo incident", () => {
  const incidents = [
    makeIncident({ id: 1, slug: "legacy-reach-intake", status: "archived" }),
    makeIncident({ id: 2, slug: "reach-demo", status: "active" }),
    makeIncident({ id: 3, slug: "other-active", status: "active" }),
  ];

  assert.equal(selectDefaultIncidentId(incidents), 2);
});

test("summarizeReports separates untriaged, linked, and rejected reports", () => {
  const reports = [
    makeReport({ triage_status: "awaiting_review" }),
    makeReport({ triage_status: "linked_to_new_case" }),
    makeReport({ triage_status: "linked_to_existing_case" }),
    makeReport({ triage_status: "invalid_or_insufficient" }),
  ];

  assert.deepEqual(summarizeReports(reports), {
    total: 4,
    untriaged: 1,
    linkedNew: 1,
    linkedExisting: 1,
    rejected: 1,
    other: 0,
  });
});

test("getReportPrimaryText uses mapped Google Sheets fields before narrative fallback", () => {
  const text = getReportPrimaryText(
    makeReport({
      submission_type: "A new report about a person",
      person_name: "Resident A",
      approximate_age: "72",
      gender: "Female",
      current_status: "Family cannot reach her.",
      original_narrative_preview: "Narrative fallback",
      original_narrative: "Narrative fallback",
    }),
  );

  assert.deepEqual(text, {
    submissionType: "A new report about a person",
    personName: "Resident A",
    ageGender: "72 / Female",
    currentStatus: "Family cannot reach her.",
  });
});

test("getReportPrimaryText uses subject-aware unnamed fallbacks", () => {
  assert.equal(getReportPrimaryText(makeReport({ subject_type: "person" })).personName, "Person not named");
  assert.equal(getReportPrimaryText(makeReport({ subject_type: "pet" })).personName, "Pet not named");
  assert.equal(getReportPrimaryText(makeReport({ subject_type: "unknown" })).personName, "Subject not named");
});

function makeIncident(overrides: Partial<StaffIncidentSummary>): StaffIncidentSummary {
  return {
    id: 1,
    internal_name: "Incident",
    public_name: "Incident",
    slug: "incident",
    disaster_type: "fire",
    affected_area: "North Tower",
    status: "active",
    intake_sources: [],
    ...overrides,
  };
}

function makeReport(overrides: Partial<StaffReportListItem>): StaffReportListItem {
  return {
    id: 1,
    incident_id: 2,
    intake_source_id: 1,
    report_code: "RPT-001",
    source_channel: "google_form",
    source_form_id: null,
    source_form_name: "Responses",
    source_entry_id: "Responses:2",
    submitted_at: "2026-07-13T22:46:11Z",
    received_at: "2026-07-17T14:23:30Z",
    language_code: "en",
    triage_status: "awaiting_review",
    reporter_relationship: null,
    is_first_hand: null,
    permission_to_contact: null,
    subject_type: "unknown",
    location_text: "North Tower",
    original_narrative_preview: "Narrative",
    original_narrative: "Narrative",
    submission_type: null,
    person_name: null,
    approximate_age: null,
    gender: null,
    current_status: null,
    linked_case: null,
    legacy_case_id: null,
    is_legacy_backfill: false,
    migration_note: null,
    source_label: "Google Forms / Google Sheets intake",
    attachments: [],
    ...overrides,
  };
}
