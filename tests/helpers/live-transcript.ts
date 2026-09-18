// Shared observations over live drives' settled transcripts and system notes.
import { expect } from "vitest";
import type { DrivenTurn, LiveExtensionHandle } from "../live/harness";

export { collectSystemNotes } from "./recording-system-note-channel";

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). A
 * successful drive must produce none of them.
 */
export const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

/** Require a clean parent drive after its invoke results were explicitly matched. */
export function assertNoFailClosedEnding(turn: Pick<DrivenTurn, "systemNotes">, stem: string): void {
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const failurePattern = new RegExp(`^theta /${escapedStem} (returned Err|cancelled|aborted)`);
  const failureNotes = turn.systemNotes.filter((n) => failurePattern.test(n));
  expect(
    failureNotes,
    "the invoking parent's own drive surfaced fail-closed system note(s) " +
      "— the fixture itself is broken: " + JSON.stringify(failureNotes),
  ).toEqual([]);
}

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
