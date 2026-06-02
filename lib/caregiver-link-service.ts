/**
 * caregiver-link-service.ts
 *
 * Thin client for the `link` tRPC router, used by CaregiverProvider. The
 * provider sits *outside* the tRPC React provider in the tree (see
 * app/_layout.tsx), so it can't use the React hooks — this mirrors the raw
 * fetch approach already used by monitoring-service.ts for the same reason.
 */
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./_core/auth";
import type { LinkMethod } from "./caregiver-state";

export interface ServerLink {
  monitoredOpenId: string;
  monitoredName: string | null;
  displayName: string | null;
  relationship: string | null;
  method: LinkMethod;
  status: "active" | "revoked";
  linkedAt: number;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (Platform.OS !== "web") {
    const token = await Auth.getSessionToken();
    if (!token) return null; // not authenticated yet
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** superjson tRPC success envelope: { result: { data: { json } } } */
function parseData(body: any): any {
  const d = body?.result?.data;
  return d?.json ?? d ?? null;
}

/** superjson tRPC error envelope: { error: { json: { message } } } */
function parseError(body: any): string {
  return body?.error?.json?.message ?? body?.error?.message ?? "Erro inesperado.";
}

/**
 * Thrown when the user isn't authenticated yet (native, no session token).
 * Callers treat this like "offline" — keep the local cache, don't clear.
 */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("NOT_AUTHENTICATED");
    this.name = "NotAuthenticatedError";
  }
}

export async function redeemInvite(input: {
  code: string;
  displayName?: string;
  relationship?: string;
  method: "code" | "qr";
}): Promise<{ monitoredOpenId: string; monitoredName: string | null }> {
  const headers = await authHeaders();
  if (!headers) throw new NotAuthenticatedError();
  const res = await fetch(`${getApiBaseUrl()}/api/trpc/link.redeemInvite`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ json: input }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(parseError(body));
  return parseData(body);
}

export async function fetchMyLink(): Promise<ServerLink | null> {
  const headers = await authHeaders();
  if (!headers) throw new NotAuthenticatedError();
  const params = encodeURIComponent(JSON.stringify({ json: null }));
  const res = await fetch(`${getApiBaseUrl()}/api/trpc/link.getMyLink?input=${params}`, {
    headers,
    credentials: "include",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(parseError(body));
  return parseData(body);
}

export async function revokeServerLink(otherOpenId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new NotAuthenticatedError();
  const res = await fetch(`${getApiBaseUrl()}/api/trpc/link.revokeLink`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ json: { otherOpenId } }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseError(body));
  }
}
