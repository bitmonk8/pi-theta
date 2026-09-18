// Shared observations over live drives' settled transcripts and system notes.
import type { LiveExtensionHandle } from "../live/harness";

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). A
 * successful drive must produce none of them.
 */
export const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

/** Count appended assistant messages carrying an on-session respond tool call. */
export function countOnSessionRespondCalls(handle: LiveExtensionHandle, entriesBefore: number): number {
  const appended = handle.sessionManager.getEntries().slice(entriesBefore) as readonly {
    readonly type?: string;
    readonly message?: { readonly role?: string; readonly content?: unknown };
  }[];
  return appended.filter(
    (e) =>
      e.type === "message" &&
      e.message?.role === "assistant" &&
      Array.isArray(e.message.content) &&
      (e.message.content as { type?: string; name?: string }[]).some(
        (c) => c.type === "toolCall" && String(c.name ?? "").startsWith("__theta_respond_"),
      ),
  ).length;
}

/**
 * Extract the `theta-system-note` channel contents from a slice of in-memory
 * SessionManager entries (their `content`, string or text-part array). Mirrors
 * the hardening probe harness's reader of the same channel.
 */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") notes.push(t);
        }
      }
    } else if (e.customType === "theta-progress-entry") {
      // PIC-72 (runtime-event-channel.md): the three migrated operator-note
      // classes (parse/load/type diagnostic BATCH, structural-change,
      // binder-model recovery) deliver through the `theta-progress-entry`
      // custom-entry channel instead of `theta-system-note` whenever both
      // entry members are present (entry-channel.ts). The entry's `data`
      // carries the SAME `SystemNote` shape the message channel used to
      // carry (PIC-71: byte-identical rendered content), so extracting its
      // `content` keeps every existing substring assertion working
      // unchanged — a channel-union repair, not a weakening.
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
  return notes;
}
