import test from "node:test";
import assert from "node:assert/strict";
import { buildStaffDashboardData } from "./staff-dashboard.ts";
import type { StaffCaseListItem } from "./api-types.ts";

const assignedUser = {
  id: 42,
  email: "coordinator@example.com",
  role: "coordinator" as const,
};

test("buildStaffDashboardData groups related cases into derived events", () => {
  const cases: StaffCaseListItem[] = [
    {
      id: 1,
      case_code: "C-001",
      status: "pending_review",
      urgency: "high",
      incident_type: "fire",
      location_summary: "North Hall",
      needs_summary: "Need evacuation assistance",
      latest_public_update: null,
      assigned_staff_user: null,
      created_at: "2026-07-09T10:00:00.000Z",
      updated_at: "2026-07-09T10:15:00.000Z",
    },
    {
      id: 2,
      case_code: "C-002",
      status: "active",
      urgency: "critical",
      incident_type: "fire",
      location_summary: "North Hall",
      needs_summary: "Smoke spreading through the hallway",
      latest_public_update: "Evacuation support is in progress.",
      assigned_staff_user: assignedUser,
      created_at: "2026-07-09T10:02:00.000Z",
      updated_at: "2026-07-09T10:20:00.000Z",
    },
    {
      id: 3,
      case_code: "C-003",
      status: "closed",
      urgency: "low",
      incident_type: "medical",
      location_summary: "East Gate",
      needs_summary: "Medication pickup completed",
      latest_public_update: "Reporter confirmed they are safe.",
      assigned_staff_user: assignedUser,
      created_at: "2026-07-09T09:30:00.000Z",
      updated_at: "2026-07-09T09:45:00.000Z",
    },
  ];

  const dashboard = buildStaffDashboardData(cases);

  assert.equal(dashboard.summary.totalCases, 3);
  assert.equal(dashboard.summary.totalEvents, 2);
  assert.equal(dashboard.summary.openCases, 2);
  assert.equal(dashboard.summary.unassignedCases, 1);
  assert.equal(dashboard.summary.criticalCases, 1);
  assert.equal(dashboard.summary.awaitingVerificationGroups, 0);
  assert.equal(dashboard.summary.readyToPublishGroups, 1);
  assert.equal(dashboard.summary.publishedGroups, 1);
  assert.equal(dashboard.summary.lastUpdatedAt, "2026-07-09T10:20:00.000Z");

  const firstEvent = dashboard.events[0];
  assert.equal(firstEvent.title, "North Hall");
  assert.equal(firstEvent.caseCount, 2);
  assert.equal(firstEvent.status, "active");
  assert.equal(firstEvent.publishState, "ready_to_publish");
  assert.equal(firstEvent.highestUrgency, "critical");
  assert.equal(firstEvent.unassignedCaseCount, 1);
  assert.equal(firstEvent.summary, "Evacuation support is in progress.");
  assert.equal(firstEvent.latestPublicUpdate, "Evacuation support is in progress.");
  assert.deepEqual(
    firstEvent.relatedCases.map((item) => item.case_code),
    ["C-002", "C-001"],
  );
});

test("buildStaffDashboardData falls back to reported needs when no public update exists", () => {
  const cases: StaffCaseListItem[] = [
    {
      id: 9,
      case_code: "C-009",
      status: "waiting_for_information",
      urgency: "medium",
      incident_type: "utilities",
      location_summary: "South Shelter",
      needs_summary: "Water supply is still unavailable",
      latest_public_update: null,
      assigned_staff_user: null,
      created_at: "2026-07-08T14:00:00.000Z",
      updated_at: "2026-07-08T14:30:00.000Z",
    },
  ];

  const dashboard = buildStaffDashboardData(cases);

  assert.equal(dashboard.events[0]?.summary, "Water supply is still unavailable");
  assert.equal(dashboard.events[0]?.publishState, "ready_to_publish");
});
