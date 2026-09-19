import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLogEntry } from "@/types";

export type NewAuditEntry = Omit<AuditLogEntry, "id" | "ts">;

/**
 * Append-only audit trail. Written via the service role because audit_log
 * deliberately has NO insert policy for authenticated users. Best-effort:
 * an audit failure logs loudly but never fails the operation that spawned it.
 */
export async function writeAudit(entry: NewAuditEntry): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("audit_log")
      .insert({
        entity: entry.entity,
        entity_id: entry.entityId,
        action: entry.action,
        actor_id: entry.actorId,
        model: entry.model,
        prompt_version: entry.promptVersion,
        source_ref: entry.sourceRef,
      });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (err) {
    console.error("[audit] failed to write audit_log entry:", err);
  }
}