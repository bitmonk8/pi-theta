// PIC-79 causal units over actual SDK raw entries/projection. The raw helper
// receives an owned span; OwnedTurnAttempt supplies freshness and upper bounds.
import { describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { unhealedRecoveryOmission } from "../src/extension/host-recovery-omission";
import { mapPromptModeHostOmittedRecovery, PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE } from "../src/runtime/prompt-transport-mapping";
import { assistant, assistantMessage, user } from "./helpers/agent-message-fixtures";

const QUERY = "Review the own shard";
const ERROR = "provider returned error: raw own failure";
const evidence = { errorMessage: ERROR, stopReason: "error" };
function messages(sm: SessionManager): readonly Message[] {
  return buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
}
function rig() {
  const sm = SessionManager.inMemory();
  sm.appendMessage(user("prior query"));
  const prior = sm.appendMessage(assistant("prior answer"));
  const before = new Set(sm.getBranch().map((entry) => entry.id));
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), QUERY);
  const own = sm.appendMessage(user(QUERY));
  const fail = () => sm.appendMessage(assistantMessage({ text: "not an answer", stopReason: "error", errorMessage: ERROR }));
  const read = () => attempt.read(messages(sm), sm.getBranch(), true);
  return { sm, prior, before, attempt, own, fail, read };
}
function toolResult(): Message {
  return { role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text: "file" }], isError: false, timestamp: 0 };
}

describe("0499 latest effective owned raw omission", () => {
  it("does not invent evidence without an omission", () => {
    const r = rig();
    r.sm.appendMessage(assistant("answer"));
    expect(r.read().omission).toBeUndefined();
    expect(unhealedRecoveryOmission([], r.before)).toBeUndefined();
  });
  it("retains raw error evidence independently of the projected settled predicate", () => {
    const r = rig();
    r.sm.appendMessage(assistantMessage({ text: "partial", stopReason: "toolUse" }));
    const target = r.fail();
    r.sm.appendContextEdit(target, null);
    expect(r.read()).toMatchObject({ settled: true, foreign: false, omission: evidence });
    expect(messages(r.sm).some((message) => message.role === "assistant" && message.stopReason === "error")).toBe(false);
    expect(r.sm.getBranch().find((entry) => entry.id === target)).toMatchObject({ type: "message", message: { errorMessage: ERROR } });
  });
  it("an omitted-only round is unanswered in projection but has attributable raw evidence", () => {
    const r = rig();
    r.sm.appendContextEdit(r.fail(), null);
    expect(r.read()).toMatchObject({ settled: false, foreign: false, omission: evidence });
  });
  it("an omission of a previous turn during this attempt is not own evidence", () => {
    const r = rig();
    r.sm.appendContextEdit(r.prior, null);
    r.sm.appendMessage(assistant("answer"));
    expect(r.read()).toMatchObject({ settled: true, relocated: true, omission: undefined });
  });
  it("old omission is outside the fresh-id regime", () => {
    const sm = SessionManager.inMemory();
    sm.appendMessage(user("prior"));
    const prior = sm.appendMessage(assistantMessage({ stopReason: "error", errorMessage: ERROR }));
    sm.appendContextEdit(prior, null);
    const before = new Set(sm.getBranch().map((entry) => entry.id));
    expect(unhealedRecoveryOmission(sm.getBranch(), before)).toBeUndefined();
  });
  it("a visible later own assistant heals without deleting earlier narration", () => {
    const r = rig();
    r.sm.appendMessage(assistant("valid narration"));
    r.sm.appendContextEdit(r.fail(), null);
    r.sm.appendMessage(assistant("finished retry"));
    expect(r.read().omission).toBeUndefined();
    expect(r.read().messages?.filter((message) => message.role === "assistant")).toHaveLength(2);
  });
  it("a later visible error is healed evidence, not rewritten success", () => {
    const r = rig();
    r.sm.appendContextEdit(r.fail(), null);
    r.fail();
    expect(r.read()).toMatchObject({ settled: true, omission: undefined });
    expect(r.read().messages?.at(-1)).toMatchObject({ stopReason: "error", errorMessage: ERROR });
  });
  it("a non-null replacement does not omit the assistant", () => {
    const r = rig();
    r.sm.appendContextEdit(r.fail(), { content: "replacement" });
    expect(r.read().omission).toBeUndefined();
  });
  it("superseding non-null edit restores an omitted target", () => {
    const r = rig();
    const target = r.fail();
    r.sm.appendContextEdit(target, null);
    expect(r.read().omission).toEqual(evidence);
    r.sm.appendContextEdit(target, { content: "restored" });
    expect(r.read().omission).toBeUndefined();
    expect(messages(r.sm).at(-1)).toMatchObject({ role: "assistant", content: [{ type: "text", text: "restored" }] });
  });
  it("a newer null edit after restoration is effective again", () => {
    const r = rig();
    const target = r.fail();
    r.sm.appendContextEdit(target, null);
    r.sm.appendContextEdit(target, { content: "restored" });
    r.sm.appendContextEdit(target, null);
    expect(r.read().omission).toEqual(evidence);
  });
  it("newest effective assistant omission wins; a later tool-result omission cannot mask it", () => {
    const r = rig();
    r.sm.appendContextEdit(r.fail(), null);
    const newest = r.sm.appendMessage(assistantMessage({ stopReason: "length" }));
    r.sm.appendContextEdit(newest, null);
    r.sm.appendContextEdit(r.sm.appendMessage(toolResult()), null);
    expect(r.read().omission).toEqual({ errorMessage: undefined, stopReason: "length" });
  });
  it("newest effective null edit, not target order, controls healing", () => {
    const r = rig();
    const oldestTarget = r.fail();
    const newestTarget = r.sm.appendMessage(assistantMessage({ stopReason: "length" }));
    r.sm.appendContextEdit(newestTarget, null);
    r.sm.appendContextEdit(oldestTarget, null);
    expect(r.read().omission).toEqual(evidence);
  });
  it.each(["user", "toolResult", "custom"] as const)("null editing %s is not an assistant omission", (role) => {
    const r = rig();
    const target = role === "user" ? r.own : role === "toolResult"
      ? r.sm.appendMessage(toolResult()) : r.sm.appendCustomMessageEntry("fixture-note", "note", true);
    r.sm.appendContextEdit(target, null);
    expect(r.read().omission).toBeUndefined();
  });
  it("a foreign assistant cannot heal the raw own omission", () => {
    const r = rig();
    r.sm.appendContextEdit(r.fail(), null);
    r.sm.appendMessage(user("foreign query"));
    r.sm.appendMessage(assistant("foreign success"));
    expect(r.read()).toMatchObject({ foreign: true, omission: evidence, messages: undefined });
  });
  it("a foreign omission cannot contaminate a healthy own turn", () => {
    const r = rig();
    r.sm.appendMessage(assistant("own success"));
    r.sm.appendMessage(user("foreign query"));
    r.sm.appendContextEdit(r.fail(), null);
    expect(r.read()).toMatchObject({ foreign: true, settled: true, omission: undefined });
  });
  it("cannot infer an own send from a raw omission after a mismatched fresh user", () => {
    const sm = SessionManager.inMemory();
    const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), QUERY);
    sm.appendMessage(user("foreign query"));
    sm.appendContextEdit(sm.appendMessage(assistantMessage({ stopReason: "error", errorMessage: ERROR })), null);
    expect(attempt.read(messages(sm), sm.getBranch(), true)).toMatchObject({ foreign: true, omission: undefined });
  });
  it("a continuation cannot inherit the preceding attempt's omission", () => {
    const r = rig();
    r.sm.appendContextEdit(r.fail(), null);
    const continuation = new OwnedTurnAttempt(messages(r.sm), r.sm.getBranch(), "continue own turn");
    r.sm.appendMessage(user("continue own turn"));
    r.sm.appendMessage(assistant("finished continuation"));
    expect(continuation.read(messages(r.sm), r.sm.getBranch(), true)).toMatchObject({ settled: true, omission: undefined });
  });
  it("raw reason fields are defensive strings, not coerced fabricated values", () => {
    const r = rig();
    const raw = { ...assistant("raw"), stopReason: 42, errorMessage: { message: "not a string" } } as unknown as AssistantMessage;
    r.sm.appendContextEdit(r.sm.appendMessage(raw), null);
    expect(r.read().omission).toEqual({ stopReason: undefined, errorMessage: undefined });
  });
});

describe("0499 approved omission transport mapper", () => {
  it.each([
    [ERROR, "error", ERROR],
    ["", "error", ""],
    [undefined, "length", "omitted assistant stopped with length"],
    [undefined, undefined, "omitted assistant stopped with unknown"],
  ] as const)("preserves raw error %s and reason %s", (errorMessage, stopReason, detail) => {
    expect(PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE).toBe("on-session host recovery did not complete: ");
    expect(mapPromptModeHostOmittedRecovery({ errorMessage, stopReason }, "openai-responses")).toEqual({
      kind: "transport", message: `on-session host recovery did not complete: ${detail}`,
      http_status: null, provider: "openai-responses", retryable: true,
    });
  });
});
