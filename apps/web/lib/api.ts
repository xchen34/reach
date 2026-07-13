import type {
  AuditLogEntryResponse,
  CurrentStaffSession,
  PublicIncidentReportPageResponse,
  PublicBoardResponse,
  StaffCaseIntakeReviewResponse,
  StaffCaseActionRequest,
  StaffCaseActionResponse,
  StaffCaseDetailResponse,
  StaffCasePublishRequest,
  StaffCasePublishResponse,
  StaffCaseRelationRequest,
  StaffCaseRelationResponse,
  StaffQueueResponse,
  StaffCaseVoiceResponse,
  StaffMagicLinkRequestResponse,
  StaffSessionResponse,
  ShareLinkCaseView,
} from "@/lib/api-types";

const publicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const internalBaseUrl = process.env.API_INTERNAL_BASE_URL ?? publicBaseUrl;

interface ApiErrorOptions {
  detail?: string | null;
  status?: number | null;
}

export class ApiError extends Error {
  detail: string | null;
  status: number | null;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.detail = options.detail ?? null;
    this.status = options.status ?? null;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const { baseUrl, resolvedPath } = resolveApiPath(path);

  try {
    response = await fetch(`${baseUrl}${resolvedPath}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Network request failed.");
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);

    throw new ApiError(detail ?? `API request failed with status ${response.status}.`, {
      detail,
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

export function getSharedCase(token: string) {
  return apiFetch<ShareLinkCaseView>(`/share/${encodeURIComponent(token)}`);
}

export function getPublicBoard() {
  return apiFetch<PublicBoardResponse>("/board");
}

export function getPublicIncidentReportPage(incidentSlug: string) {
  return apiFetch<PublicIncidentReportPageResponse>(
    `/incidents/${encodeURIComponent(incidentSlug)}/report`,
  );
}

export function requestStaffMagicLink(email: string) {
  return apiFetch<StaffMagicLinkRequestResponse>("/auth/request-magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyStaffMagicLink(token: string) {
  return apiFetch<StaffSessionResponse>("/auth/verify-magic-link", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getCurrentStaffSession(accessToken: string) {
  return apiFetch<CurrentStaffSession>("/staff/me", {
    headers: buildBearerHeaders(accessToken),
  });
}

export function getStaffPublishQueue(accessToken: string) {
  return apiFetch<StaffQueueResponse>("/staff/cases/queue", {
    headers: buildBearerHeaders(accessToken),
  });
}

export function getStaffCaseDetail(accessToken: string, caseId: number) {
  return apiFetch<StaffCaseDetailResponse>(`/staff/cases/${caseId}`, {
    headers: buildBearerHeaders(accessToken),
  });
}

export function getStaffCaseVoice(accessToken: string, caseId: number) {
  return apiFetch<StaffCaseVoiceResponse>(`/staff/cases/${caseId}/voice`, {
    headers: buildBearerHeaders(accessToken),
  });
}

export function getStaffCaseIntakeReview(accessToken: string, caseId: number) {
  return apiFetch<StaffCaseIntakeReviewResponse>(`/staff/cases/${caseId}/intake-review`, {
    headers: buildBearerHeaders(accessToken),
  });
}

export function listStaffCaseAudit(accessToken: string, caseId: number) {
  return apiFetch<AuditLogEntryResponse[]>(`/staff/cases/${caseId}/audit`, {
    headers: buildBearerHeaders(accessToken),
  });
}

export function createStaffCaseAction(
  accessToken: string,
  caseId: number,
  payload: StaffCaseActionRequest,
) {
  return apiFetch<StaffCaseActionResponse>(`/staff/cases/${caseId}/actions`, {
    method: "POST",
    headers: buildBearerHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function publishStaffCaseUpdate(
  accessToken: string,
  caseId: number,
  payload: StaffCasePublishRequest,
) {
  return apiFetch<StaffCasePublishResponse>(`/staff/cases/${caseId}/publish`, {
    method: "POST",
    headers: buildBearerHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function relateStaffCase(
  accessToken: string,
  caseId: number,
  payload: StaffCaseRelationRequest,
) {
  return apiFetch<StaffCaseRelationResponse>(`/staff/cases/${caseId}/relations`, {
    method: "POST",
    headers: buildBearerHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function logoutStaffSession(accessToken: string) {
  let response: Response;
  const { baseUrl, resolvedPath: path } = resolveApiPath("/auth/logout");

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: buildBearerHeaders(accessToken),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Network request failed.");
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);

    throw new ApiError(detail ?? `API request failed with status ${response.status}.`, {
      detail,
      status: response.status,
    });
  }
}

function buildBearerHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function resolveApiPath(path: string) {
  const isBrowser = typeof window !== "undefined";

  return {
    baseUrl: isBrowser ? "" : internalBaseUrl,
    resolvedPath: isBrowser ? `/api${path}` : path,
  };
}

async function readErrorDetail(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | { detail?: unknown }
    | null;

  return typeof payload?.detail === "string" ? payload.detail : null;
}
