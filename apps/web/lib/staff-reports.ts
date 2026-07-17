import type { StaffIncidentSummary, StaffReportListItem, ReportTriageStatus } from "./api-types";

export type ReportTriageBucket = "untriaged" | "linkedNew" | "linkedExisting" | "rejected" | "other";

export interface StaffReportSummary {
  total: number;
  untriaged: number;
  linkedNew: number;
  linkedExisting: number;
  rejected: number;
  other: number;
}

export function selectDefaultIncidentId(incidents: StaffIncidentSummary[]) {
  const activeReachDemo = incidents.find((incident) => incident.slug === "reach-demo" && incident.status === "active");
  if (activeReachDemo) {
    return activeReachDemo.id;
  }

  return incidents.find((incident) => incident.status === "active")?.id ?? incidents[0]?.id ?? null;
}

export function summarizeReports(reports: StaffReportListItem[]): StaffReportSummary {
  return reports.reduce<StaffReportSummary>(
    (summary, report) => {
      const bucket = getReportTriageBucket(report.triage_status);
      summary.total += 1;
      summary[bucket] += 1;
      return summary;
    },
    {
      total: 0,
      untriaged: 0,
      linkedNew: 0,
      linkedExisting: 0,
      rejected: 0,
      other: 0,
    },
  );
}

export function getReportTriageBucket(status: ReportTriageStatus): ReportTriageBucket {
  if (status === "awaiting_review") {
    return "untriaged";
  }
  if (status === "linked_to_new_case") {
    return "linkedNew";
  }
  if (status === "linked_to_existing_case" || status === "linked_to_case") {
    return "linkedExisting";
  }
  if (status === "out_of_scope" || status === "invalid_or_insufficient") {
    return "rejected";
  }
  return "other";
}

export function getReportPrimaryText(report: StaffReportListItem) {
  return {
    submissionType: report.submission_type ?? "Submission",
    personName: report.person_name ?? "Person not named",
    ageGender: [report.approximate_age, report.gender].filter(Boolean).join(" / ") || "Age or gender not provided",
    currentStatus: report.current_status ?? report.original_narrative_preview,
  };
}
