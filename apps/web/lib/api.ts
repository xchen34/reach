import type {
  AnonymousCaseSubmissionRequest,
  CaseSubmissionResponse,
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
  const baseUrl = typeof window === "undefined" ? internalBaseUrl : publicBaseUrl;

  try {
    response = await fetch(`${baseUrl}${path}`, {
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

export function submitAnonymousCase(payload: AnonymousCaseSubmissionRequest) {
  return apiFetch<CaseSubmissionResponse>("/cases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSharedCase(token: string) {
  return apiFetch<ShareLinkCaseView>(`/share/${encodeURIComponent(token)}`);
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
