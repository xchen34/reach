import { ApiError } from "@/lib/api";

const staffSessionStorageKey = "Reach.staff.access-token";

export type StaffAuthReason =
  | "expired"
  | "invalid"
  | "logged_out"
  | "missing"
  | "revoked";

export type StaffMagicLinkFailureReason =
  | "expired"
  | "invalid"
  | "missing"
  | "unknown"
  | "used";

export class MissingStaffSessionError extends Error {
  constructor() {
    super("Missing staff session.");
    this.name = "MissingStaffSessionError";
  }
}

export class UnauthorizedStaffSessionError extends Error {
  reason: StaffAuthReason;

  constructor(reason: StaffAuthReason) {
    super("Unauthorized staff session.");
    this.name = "UnauthorizedStaffSessionError";
    this.reason = reason;
  }
}

export function buildStaffLoginHref(reason?: StaffAuthReason) {
  const path = "/staff/login";
  if (!reason) {
    return path;
  }

  return `${path}?reason=${reason}`;
}

export function buildStaffMagicLinkHref(token: string) {
  return `/staff/magic-link?token=${encodeURIComponent(token)}`;
}

export function readStoredStaffAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(staffSessionStorageKey);
}

export function storeStaffAccessToken(accessToken: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(staffSessionStorageKey, accessToken);
}

export function clearStaffAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(staffSessionStorageKey);
}

export function getMagicLinkFailureReason(detail: string | null | undefined): StaffMagicLinkFailureReason {
  if (detail === "token_expired") {
    return "expired";
  }

  if (detail === "token_used") {
    return "used";
  }

  if (detail === "invalid_token") {
    return "invalid";
  }

  return "unknown";
}

export function getStaffAuthReason(detail: string | null | undefined): StaffAuthReason {
  if (detail === "Session expired.") {
    return "expired";
  }

  if (detail === "Session revoked.") {
    return "revoked";
  }

  if (detail === "Invalid session token.") {
    return "invalid";
  }

  return "missing";
}

export async function withStaffAuthorization<T>(
  accessToken: string | null,
  request: (accessToken: string) => Promise<T>,
): Promise<T> {
  if (!accessToken) {
    throw new MissingStaffSessionError();
  }

  try {
    return await request(accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearStaffAccessToken();
      throw new UnauthorizedStaffSessionError(getStaffAuthReason(error.detail));
    }

    throw error;
  }
}
