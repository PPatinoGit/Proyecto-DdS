/*
  Audit trail.

  Every row is a small, redacted fact: who did what, to which object and when.
  Callers never pass passwords, tokens or file contents in `metadata`, so the
  table is safe to expose through the admin API.

  Writing an audit row is best effort: a failure must not undo an operation
  that already succeeded, but it is logged on the server so it can be found.
*/

import { db } from "./db";
import type {
  AuditAction,
  AuditActorType,
  AuditEvent,
  AuditMetadata,
} from "./types";

export type AuditEventInput = {
  actorType: AuditActorType;
  actorId?: string | number | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | number | null;
  metadata?: AuditMetadata;
};

function toMetadata(value: string | null): AuditMetadata {
  if (value === null || value === "") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as AuditMetadata;
    }
  } catch {
    /* A corrupt row is shown without metadata, never as a broken page. */
  }
  return {};
}

/** Stores one audit event. Never throws: auditing must not break the request. */
export async function recordAudit(input: AuditEventInput): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, metadata)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        input.actorType,
        input.actorId === undefined || input.actorId === null ? null : String(input.actorId),
        input.action,
        input.targetType ?? null,
        input.targetId === undefined || input.targetId === null ? null : String(input.targetId),
        JSON.stringify(input.metadata ?? {}),
      ],
    });
  } catch (error) {
    console.error("Could not write the audit log", error);
  }
}

/** Most recent events first; `limit` is capped by the caller and here. */
export async function listAuditEvents(limit: number): Promise<AuditEvent[]> {
  const result = await db.execute({
    sql: `SELECT id, created_at, actor_type, actor_id, action, target_type, target_id, metadata
          FROM audit_log ORDER BY id DESC LIMIT ?`,
    args: [Math.min(Math.max(1, limit), 200)],
  });

  return result.rows.map((row) => ({
    id: Number(row.id),
    createdAt: String(row.created_at),
    actorType: row.actor_type as AuditActorType,
    actorId: row.actor_id === null ? null : String(row.actor_id),
    action: row.action as AuditAction,
    targetType: row.target_type === null ? null : String(row.target_type),
    targetId: row.target_id === null ? null : String(row.target_id),
    metadata: toMetadata(row.metadata === null ? null : String(row.metadata)),
  }));
}
