import type {
  AuditLogEntryResponse,
  AnonymousCaseSubmissionRequest,
  CaseSubmissionResponse,
  CurrentStaffSession,
  StaffCaseIntakeReviewResponse,
  StaffCaseActionRequest,
  StaffCaseActionResponse,
  StaffCaseDetailResponse,
  StaffCaseListItem,
  StaffCaseVoiceResponse,
  StaffMagicLinkRequestResponse,
  StaffSessionResponse,
  ShareLinkCaseView,
  VoiceIntakeCreateResponse,
  VoiceIntakeView,
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

export function submitAnonymousCase(payload: AnonymousCaseSubmissionRequest) {
  return apiFetch<CaseSubmissionResponse>("/cases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

interface UploadVoiceIntakeOptions {
  audioFile: Blob;
  fileName: string;
  languageCode?: string;
  durationSeconds?: number;
  onUploadProgress?: (progress: number) => void;
}

export async function uploadVoiceIntake({
  audioFile,
  fileName,
  languageCode,
  durationSeconds,
  onUploadProgress,
}: UploadVoiceIntakeOptions): Promise<VoiceIntakeCreateResponse> {
  if (typeof window !== "undefined") {
    return uploadVoiceIntakeInBrowser({
      audioFile,
      fileName,
      languageCode,
      durationSeconds,
      onUploadProgress,
    });
  }

  const formData = new FormData();
  formData.set("audio_file", audioFile, fileName);

  if (languageCode) {
    formData.set("language_code", languageCode);
  }

  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    formData.set("duration_seconds", durationSeconds.toString());
  }

  return fetchJson<VoiceIntakeCreateResponse>("/voice-intakes", {
    method: "POST",
    body: formData,
  });
}

export function retrieveVoiceIntake(voiceIntakeToken: string) {
  return apiFetch<VoiceIntakeView>("/voice-intakes/retrieve", {
    method: "POST",
    body: JSON.stringify({ voice_intake_token: voiceIntakeToken }),
  });
}

export function confirmVoiceIntake(voiceIntakeToken: string, confirmedTranscriptText: string) {
  return apiFetch<VoiceIntakeView>("/voice-intakes/confirm", {
    method: "POST",
    body: JSON.stringify({
      voice_intake_token: voiceIntakeToken,
      confirmed_transcript_text: confirmedTranscriptText,
    }),
  });
}

export function getSharedCase(token: string) {
  return apiFetch<ShareLinkCaseView>(`/share/${encodeURIComponent(token)}`);
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

export function listStaffCases(accessToken: string) {
  return apiFetch<StaffCaseListItem[]>("/staff/cases", {
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const { baseUrl, resolvedPath } = resolveApiPath(path);

  try {
    response = await fetch(`${baseUrl}${resolvedPath}`, {
      ...init,
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

function uploadVoiceIntakeInBrowser({
  audioFile,
  fileName,
  languageCode,
  durationSeconds,
  onUploadProgress,
}: UploadVoiceIntakeOptions): Promise<VoiceIntakeCreateResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    const normalizedAudioFile = normalizeAudioUpload(audioFile, fileName);
    formData.set("audio_file", normalizedAudioFile, normalizedAudioFile.name);

    if (languageCode) {
      formData.set("language_code", languageCode);
    }

    if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
      formData.set("duration_seconds", durationSeconds.toString());
    }

    const request = new XMLHttpRequest();
    request.open("POST", "/api/voice-intakes");
    request.responseType = "text";

    request.upload.addEventListener("progress", (event) => {
      if (!onUploadProgress || !event.lengthComputable) {
        return;
      }

      onUploadProgress(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("error", () => {
      reject(new ApiError("Network request failed."));
    });

    request.addEventListener("load", () => {
      const payloadText = request.responseText;
      const payload = payloadText ? safeJsonParse(payloadText) : null;

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as VoiceIntakeCreateResponse);
        return;
      }

      const detail =
        payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : null;

      reject(
        new ApiError(detail ?? `API request failed with status ${request.status}.`, {
          detail,
          status: request.status || null,
        }),
      );
    });

    request.send(formData);
  });
}

function normalizeAudioUpload(audioFile: Blob, fileName: string): File {
  const resolvedType = normalizeAudioContentType(audioFile.type, fileName);

  return new File([audioFile], ensureFileExtension(fileName, resolvedType), {
    type: resolvedType,
    lastModified: Date.now(),
  });
}

function normalizeAudioContentType(contentType: string, fileName: string) {
  const canonicalType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (canonicalType.startsWith("audio/") && canonicalType !== "audio/mp3") {
    return canonicalType;
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".m4a")) {
    return "audio/m4a";
  }

  if (lowerName.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (lowerName.endsWith(".ogg")) {
    return "audio/ogg";
  }

  if (lowerName.endsWith(".wav")) {
    return "audio/wav";
  }

  return "audio/webm";
}

function ensureFileExtension(fileName: string, contentType: string) {
  const lowerName = fileName.toLowerCase();
  const extension = getAudioFileExtension(contentType);

  if (lowerName.endsWith(extension)) {
    return fileName;
  }

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex > 0) {
    return `${fileName.slice(0, dotIndex)}${extension}`;
  }

  return `${fileName}${extension}`;
}

function getAudioFileExtension(contentType: string) {
  if (contentType.includes("mp4") || contentType.includes("m4a")) {
    return ".m4a";
  }

  if (contentType.includes("mpeg")) {
    return ".mp3";
  }

  if (contentType.includes("ogg")) {
    return ".ogg";
  }

  if (contentType.includes("wav")) {
    return ".wav";
  }

  return ".webm";
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
