import type {
  CaseStatus,
  IncidentType,
  StaffCaseListItem,
  UrgencyLevel,
} from "./api-types";

export interface StaffDashboardEvent {
  id: string;
  title: string;
  status: CaseStatus;
  publishState: "awaiting_verification" | "ready_to_publish" | "published";
  caseCount: number;
  openCaseCount: number;
  unassignedCaseCount: number;
  highestUrgency: UrgencyLevel;
  incidentType: IncidentType;
  lastUpdatedAt: string;
  summary: string;
  latestPublicUpdate: string | null;
  relatedCases: StaffCaseListItem[];
}

export interface StaffDashboardSummary {
  totalEvents: number;
  totalCases: number;
  openCases: number;
  unassignedCases: number;
  criticalCases: number;
  awaitingVerificationGroups: number;
  readyToPublishGroups: number;
  publishedGroups: number;
  lastUpdatedAt: string | null;
}

export interface StaffDashboardData {
  source: "case-list-adapter";
  events: StaffDashboardEvent[];
  summary: StaffDashboardSummary;
}

const statusPriority: Record<CaseStatus, number> = {
  active: 5,
  pending_review: 4,
  waiting_for_information: 3,
  safe_resolved: 2,
  closed: 1,
};

const urgencyPriority: Record<UrgencyLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function buildStaffDashboardData(cases: StaffCaseListItem[]): StaffDashboardData {
  const groups = new Map<string, StaffCaseListItem[]>();

  for (const item of cases) {
    const key = buildEventKey(item);
    const existing = groups.get(key);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const events = Array.from(groups.entries())
    .map(([key, relatedCases]) => buildEvent(key, relatedCases))
    .sort((left, right) => {
      const updatedComparison =
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime();
      if (updatedComparison !== 0) {
        return updatedComparison;
      }

      return right.caseCount - left.caseCount;
    });

  const lastUpdatedAt = events[0]?.lastUpdatedAt ?? null;
  const awaitingVerificationGroups = events.filter(
    (event) => event.publishState === "awaiting_verification",
  ).length;
  const readyToPublishGroups = events.filter((event) => event.publishState === "ready_to_publish").length;
  const publishedGroups = events.filter((event) => event.publishState === "published").length;

  return {
    source: "case-list-adapter",
    events,
    summary: {
      totalEvents: events.length,
      totalCases: cases.length,
      openCases: cases.filter((item) => !isClosedStatus(item.status)).length,
      unassignedCases: cases.filter((item) => item.assigned_staff_user === null).length,
      criticalCases: cases.filter((item) => item.urgency === "critical").length,
      awaitingVerificationGroups,
      readyToPublishGroups,
      publishedGroups,
      lastUpdatedAt,
    },
  };
}

function buildEvent(key: string, cases: StaffCaseListItem[]): StaffDashboardEvent {
  const relatedCases = [...cases].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
  const leadCase = relatedCases[0];
  const status = relatedCases.reduce(
    (current, item) => (statusPriority[item.status] > statusPriority[current] ? item.status : current),
    leadCase.status,
  );
  const highestUrgency = relatedCases.reduce(
    (current, item) =>
      urgencyPriority[item.urgency] > urgencyPriority[current] ? item.urgency : current,
    leadCase.urgency,
  );
  const lastUpdatedAt = relatedCases.reduce(
    (current, item) =>
      new Date(item.updated_at).getTime() > new Date(current).getTime() ? item.updated_at : current,
    leadCase.updated_at,
  );
  const latestPublicUpdate = resolveLatestPublicUpdate(relatedCases);

  return {
    id: key,
    title: leadCase.location_summary,
    status,
    publishState: getPublishState(status),
    caseCount: relatedCases.length,
    openCaseCount: relatedCases.filter((item) => !isClosedStatus(item.status)).length,
    unassignedCaseCount: relatedCases.filter((item) => item.assigned_staff_user === null).length,
    highestUrgency,
    incidentType: leadCase.incident_type,
    lastUpdatedAt,
    summary: buildEventSummary(relatedCases),
    latestPublicUpdate,
    relatedCases,
  };
}

function buildEventSummary(cases: StaffCaseListItem[]) {
  const latestPublicUpdate = resolveLatestPublicUpdate(cases);
  if (latestPublicUpdate) {
    return latestPublicUpdate;
  }

  return cases[0]?.needs_summary ?? "";
}

function resolveLatestPublicUpdate(cases: StaffCaseListItem[]) {
  return cases.find((item) => item.latest_public_update)?.latest_public_update ?? null;
}

function buildEventKey(item: StaffCaseListItem) {
  return `${slugify(item.location_summary)}-${item.incident_type}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "event";
}

function isClosedStatus(status: CaseStatus) {
  return status === "safe_resolved" || status === "closed";
}

function getPublishState(status: CaseStatus): StaffDashboardEvent["publishState"] {
  if (status === "pending_review") {
    return "awaiting_verification";
  }

  if (status === "active" || status === "waiting_for_information") {
    return "ready_to_publish";
  }

  return "published";
}
