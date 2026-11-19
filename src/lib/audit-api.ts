/*
  Typed call to the admin audit endpoint.
*/

import { apiFetch } from "./api";
import type { AuditEvent } from "./types";

export type AuditResponse = { events: AuditEvent[] };

/** GET /api/audit?limit=… */
export function fetchAudit(limit: number, signal?: AbortSignal): Promise<AuditResponse> {
  return apiFetch<AuditResponse>(`/api/audit?limit=${limit}`, { signal });
}
