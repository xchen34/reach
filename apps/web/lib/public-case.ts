import {
  type AnonymousCaseSubmissionRequest,
  caseStatuses,
  incidentTypes,
  urgencyLevels,
} from "@/lib/api-types";

export const submissionLimits = {
  locationSummaryMin: 5,
  locationSummaryMax: 280,
  needsSummaryMin: 5,
  needsSummaryMax: 4000,
  reporterNameMax: 120,
  reporterPhoneMax: 40,
} as const;

export type SubmissionField =
  | "incident_type"
  | "urgency"
  | "location_summary"
  | "needs_summary"
  | "reporter_name"
  | "reporter_email"
  | "reporter_phone";

export type SubmissionErrorCode =
  | "incident_type"
  | "urgency"
  | "location_summary_min"
  | "location_summary_max"
  | "needs_summary_min"
  | "needs_summary_max"
  | "reporter_name_max"
  | "reporter_email_invalid"
  | "reporter_phone_max";

export type SubmissionErrors = Partial<Record<SubmissionField, SubmissionErrorCode>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildSubmissionPayload(
  values: AnonymousCaseSubmissionRequest,
): AnonymousCaseSubmissionRequest {
  return {
    ...values,
    reporter_name: normalizeOptional(values.reporter_name),
    reporter_email: normalizeOptional(values.reporter_email),
    reporter_phone: normalizeOptional(values.reporter_phone),
  };
}

export function validateSubmissionPayload(
  values: AnonymousCaseSubmissionRequest,
): SubmissionErrors {
  const errors: SubmissionErrors = {};

  if (!incidentTypes.includes(values.incident_type)) {
    errors.incident_type = "incident_type";
  }

  if (!urgencyLevels.includes(values.urgency)) {
    errors.urgency = "urgency";
  }

  const locationSummary = values.location_summary.trim();
  if (locationSummary.length < submissionLimits.locationSummaryMin) {
    errors.location_summary = "location_summary_min";
  } else if (locationSummary.length > submissionLimits.locationSummaryMax) {
    errors.location_summary = "location_summary_max";
  }

  const needsSummary = values.needs_summary.trim();
  if (needsSummary.length < submissionLimits.needsSummaryMin) {
    errors.needs_summary = "needs_summary_min";
  } else if (needsSummary.length > submissionLimits.needsSummaryMax) {
    errors.needs_summary = "needs_summary_max";
  }

  const reporterName = values.reporter_name?.trim() ?? "";
  if (reporterName.length > submissionLimits.reporterNameMax) {
    errors.reporter_name = "reporter_name_max";
  }

  const reporterEmail = values.reporter_email?.trim() ?? "";
  if (reporterEmail && !emailPattern.test(reporterEmail)) {
    errors.reporter_email = "reporter_email_invalid";
  }

  const reporterPhone = values.reporter_phone?.trim() ?? "";
  if (reporterPhone.length > submissionLimits.reporterPhoneMax) {
    errors.reporter_phone = "reporter_phone_max";
  }

  return errors;
}

export function isKnownCaseStatus(value: string): value is (typeof caseStatuses)[number] {
  return caseStatuses.includes(value as (typeof caseStatuses)[number]);
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
