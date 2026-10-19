// PIC-79: raw omission evidence is separate from PIC-78's projected classifier.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { HostOmittedRecoveryEvidence } from "../runtime/prompt-transport-mapping";

/**
 * Consume an already attributable, upper-bounded raw own span. This helper
 * cannot choose an anchor or extend the span across a foreign user. Latest
 * edits win exactly as in the SDK projection; a later own assistant heals
 * the newest effective omission, but a tool-result edit cannot mask it.
 */
export function unhealedRecoveryOmission(
  ownPath: readonly SessionEntry[],
  beforeIds: ReadonlySet<string>,
): HostOmittedRecoveryEvidence | undefined {
  const assistants = new Map(ownPath.flatMap((entry) =>
    entry.type === "message" && entry.message.role === "assistant" && !beforeIds.has(entry.id)
      ? [[entry.id, entry.message] as const] : []));
  const edited = new Set<string>();
  let laterAssistant = false;
  for (let i = ownPath.length - 1; i >= 0; i -= 1) {
    const entry = ownPath[i];
    if (entry === undefined) continue;
    if (entry.type === "message" && entry.message.role === "assistant" && !beforeIds.has(entry.id)) {
      laterAssistant = true;
    }
    if (entry.type !== "context_edit" || edited.has(entry.targetId)) continue;
    edited.add(entry.targetId);
    if (entry.replacement !== null || beforeIds.has(entry.id)) continue;
    const target = assistants.get(entry.targetId);
    if (target === undefined) continue;
    if (laterAssistant) return undefined;
    return {
      errorMessage: typeof target.errorMessage === "string" ? target.errorMessage : undefined,
      stopReason: typeof target.stopReason === "string" ? target.stopReason : undefined,
    };
  }
  return undefined;
}
