// Attempt-local evidence is observed in the SDK projection, never recovered
// from raw omitted content. Raw entries attest identity/completion only.
import { createHash } from "node:crypto";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { OwnedTurnRead } from "./owned-turn";

export interface FinalizationEvidence {
  readonly retained: readonly Message[];
  readonly terminalRetained: boolean;
  /** Immutable active-path/projection/content proof, not just eligibility. */
  readonly proof?: string;
}
export const FINALIZATION_EVIDENCE_MAX_MESSAGES = 64;
export const FINALIZATION_EVIDENCE_MAX_BYTES = 65_536;
export const FINALIZATION_PROOF_MAX_ENTRIES = 256;
export const FINALIZATION_PROOF_MAX_BYTES = 262_144;
export const FINALIZATION_PROOF_MAX_NODES = 16_384;
export const FINALIZATION_PROOF_MAX_DEPTH = 64;
const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

interface JsonBudget { bytes: number; nodes: number }
const overflow = Symbol("optional finalization proof is unsupported or oversized");
/**
 * Bounded JSON data only. Check encoded string size BEFORE stringify; never call
 * getters/toJSON, aggregate arbitrary history, or clone unbounded input. Each
 * value/property name consumes a node. Cycles/non-data objects fail closed.
 */
function encode(value: unknown, budget: JsonBudget, depth = 0, active = new Set<object>()): string {
  if (++budget.nodes > FINALIZATION_PROOF_MAX_NODES || depth > FINALIZATION_PROOF_MAX_DEPTH) throw overflow;
  const token = (text: string): string => {
    budget.bytes -= Buffer.byteLength(text, "utf8");
    if (budget.bytes < 0) throw overflow;
    return text;
  };
  if (typeof value === "string") {
    // UTF-16 length is a cheap lower bound on UTF-8 JSON size. Account for
    // escapes and lone surrogates before allocating even a single JSON token.
    if (value.length + 2 > budget.bytes) throw overflow;
    let bytes = 2;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) bytes += 2;
      else if (c < 32) bytes += 6;
      else if (c >= 0xd800 && c <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else if (c >= 0xd800 && c <= 0xdfff) bytes += 6;
      else bytes += c < 128 ? 1 : c < 2048 ? 2 : 3;
      if (bytes > budget.bytes) throw overflow;
    }
    return token(JSON.stringify(value));
  }
  if (value === null) return token("null");
  if (typeof value === "boolean") return token(value ? "true" : "false");
  if (typeof value === "number") return token(Number.isFinite(value) ? String(value) : "null");
  if (typeof value !== "object" || active.has(value)) throw overflow;
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) && Object.getPrototypeOf(value) !== null) throw overflow;
  active.add(value);
  const parts = [token(array ? "[" : "{")];
  if (array) {
    if (value.length > FINALIZATION_PROOF_MAX_NODES - budget.nodes) throw overflow;
    for (let i = 0; i < value.length; i++) {
      if (i > 0) parts.push(token(","));
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor !== undefined && !("value" in descriptor)) throw overflow;
      parts.push(encode(descriptor?.value ?? null, budget, depth + 1, active));
    }
  } else {
    // Do not allocate Object.keys(an arbitrarily wide object) before the cap.
    for (const key in value) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable) continue;
      if (!("value" in descriptor)) throw overflow;
      if (descriptor.value === undefined) {
        if (++budget.nodes > FINALIZATION_PROOF_MAX_NODES) throw overflow;
        continue; // JSON object semantics; still charge traversal work.
      }
      if (parts.length > 1) parts.push(token(","));
      parts.push(encode(key, budget, depth + 1, active), token(":"), encode(descriptor.value, budget, depth + 1, active));
    }
  }
  parts.push(token(array ? "]" : "}"));
  active.delete(value);
  return parts.join("");
}
function boundedJson(value: unknown, bytes: number): string {
  return encode(value, { bytes, nodes: 0 });
}
function spanHashes(span: readonly SessionEntry[]): readonly string[] {
  const budget = { bytes: FINALIZATION_PROOF_MAX_BYTES, nodes: 0 };
  // Shared budget across ALL own entries, including user, terminal, and metadata.
  return span.map(entry => digest(encode(entry, budget)));
}

export function terminalAnswer(message: Message | undefined): message is AssistantMessage {
  return message?.role === "assistant" && ["stop", "end_turn"].includes(message.stopReason as string) &&
    !message.content.some((part) => part.type === "toolCall");
}

function spanFor(own: OwnedTurnRead, path: readonly SessionEntry[]): readonly SessionEntry[] | undefined {
  if (own.foreign || own.omission !== undefined || own.userId === undefined) return undefined;
  const start = path.findIndex((entry) => entry.id === own.userId);
  if (start < 0 || path.length - start > FINALIZATION_PROOF_MAX_ENTRIES) return undefined;
  const span = path.slice(start);
  if (span.some((entry, index) => index > 0 && entry.type === "message" && entry.message.role === "user")) return undefined;
  const ids = new Set(span.map((entry) => entry.id));
  if (path.some((entry) => entry.type === "context_edit" && ids.has(entry.targetId))) return undefined;
  if (span.some((entry) => !["message", "compaction", "context_edit", "custom", "usage", "label", "session_info", "thinking_level_change", "model_change"].includes(entry.type))) return undefined;
  if (span.some((entry) => entry.type === "message" && !["user", "system", "assistant", "toolResult"].includes(entry.message.role))) return undefined;
  return span;
}

/** Exact complete successful receipt coverage. Does not establish factual truth. */
function completeReceipts(messages: readonly Message[]): number | undefined {
  const calls = new Map<string, { name: string; receipted: boolean }>();
  let receipts = 0;
  for (const message of messages) {
    if (message.role === "assistant") {
      if (!["stop", "end_turn", "toolUse", "tool_use"].includes(message.stopReason as string)) return undefined;
      for (const part of message.content) {
        if (part.type !== "toolCall") continue;
        if (!part.id || calls.has(part.id)) return undefined;
        calls.set(part.id, { name: part.name, receipted: false });
      }
    } else if (message.role === "toolResult") {
      const call = calls.get(message.toolCallId);
      if (call === undefined || call.receipted || call.name !== message.toolName || message.isError ||
        !message.content.some((part) => part.type === "text" && part.text.trim() !== "") ||
        message.content.some((part) => part.type !== "text") ||
        (message.nestedCalls !== undefined && (!message.nestedCalls.complete || message.nestedCalls.calls.some((nested) => nested.status !== "ok")))) return undefined;
      call.receipted = true;
      receipts++;
    } else if (message.role !== "system") return undefined;
  }
  return [...calls.values()].some((call) => !call.receipted) ? undefined : receipts;
}
function evidenceJson(messages: readonly Message[]): string | undefined {
  return messages.length > FINALIZATION_EVIDENCE_MAX_MESSAGES ? undefined
    : boundedJson(messages, FINALIZATION_EVIDENCE_MAX_BYTES);
}

/**
 * One bounded snapshot per enacted attempt. Only projected pre-terminal evidence
 * is copied, never the final answer. Prefix hashes include IDs, parents and
 * content; cheap polls track structure, while prefix growth and every recovery
 * gate freshly validate all bounded bytes. Invalidation is sticky, not retargeting.
 */
export class FinalizationEvidenceRetention {
  #observedPath: readonly { entry: SessionEntry; id: string; parentId: string | null; type: string; hash: string }[] = [];
  #entries: ReadonlyMap<string, Message> = new Map();
  #invalid = false;

  observe(own: OwnedTurnRead, path: readonly SessionEntry[]): void {
    if (this.#invalid) return;
    try {
      this.#observe(own, path);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — optional recovery must not break ordinary retained output
      void thrown;
      this.#invalidate();
    }
  }

  #observe(own: OwnedTurnRead, path: readonly SessionEntry[]): void {
    const span = spanFor(own, path);
    if (span === undefined) {
      if (own.userId !== undefined || own.foreign) this.#invalidate();
      return;
    }
    if (this.#invalid) return;
    if (this.#observedPath.some((previous, index) => {
      const entry = span[index];
      return entry === undefined || entry.id !== previous.id || entry.parentId !== previous.parentId || entry.type !== previous.type;
    })) { this.#invalidate(); return; }
    // The 10-ms path observes cheap lineage changes, not repeated content bytes.
    // No identity cache is authoritative: read() always validates ALL content,
    // and each changed/growing prefix is fully validated before snapshotting.
    if (span.length === this.#observedPath.length && span.every((entry, index) => entry === this.#observedPath[index]!.entry)) return;
    const hashes = spanHashes(span);
    if (this.#observedPath.some((previous, index) => hashes[index] !== previous.hash)) { this.#invalidate(); return; }
    this.#observedPath = span.map((entry, index) => ({ entry, id: entry.id, parentId: entry.parentId, type: entry.type, hash: hashes[index]! }));
    // Do not read raw evidence content into the snapshot. Select candidates by
    // identity from the projection first, then require complete prefix coverage.
    const projected = own.messages;
    if (projected === undefined) return;
    const last = [...span].reverse().find((entry) => entry.type === "message" && ["assistant", "toolResult"].includes(entry.message.role));
    const terminal = last?.type === "message" && terminalAnswer(last.message as Message) ? last.message : undefined;
    const evidenceEntries = span.filter((entry) => entry.type === "message" && entry.message.role !== "user" && entry.message !== terminal);
    if (evidenceEntries.some((entry) => entry.type !== "message" || !projected.includes(entry.message as Message))) return;
    const observed = evidenceEntries.flatMap((entry) => entry.type === "message" ? [entry.message as Message] : []);
    const serialized = evidenceJson(observed);
    if (serialized === undefined) { this.#invalidate(); return; }
    // Copy exactly the data whose bytes were bounded and hashed. structuredClone
    // also copies JSON-invisible array properties/undefined keys and can invoke
    // their getters; those are neither evidence nor part of the validated proof.
    const copied = JSON.parse(serialized) as Message[];
    if ((completeReceipts(copied) ?? 0) === 0) return;
    // Do not pin the terminal (possibly not observed). Completion will be proved
    // later; only the actually observed evidence prefix is retained here.
    const lastEvidence = evidenceEntries.at(-1);
    const end = span.findIndex((entry) => entry === lastEvidence);
    if (end < 0 || end >= FINALIZATION_PROOF_MAX_ENTRIES) { this.#invalidate(); return; }
    this.#entries = new Map(evidenceEntries.flatMap((entry, index) => entry.type === "message"
      ? [[entry.id, copied[index]!] as const] : []));
  }

  read(own: OwnedTurnRead, path: readonly SessionEntry[]): FinalizationEvidence | undefined {
    this.observe(own, path);
    if (this.#invalid) return undefined;
    try {
      const span = spanFor(own, path);
      if (span === undefined) return undefined;
      const hashes = spanHashes(span);
      if (this.#observedPath.some((previous, index) => hashes[index] !== previous.hash)) { this.#invalidate(); return undefined; }
      return buildEvidence(own, span, this.#entries, hashes);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — unsupported/oversized optional proof refuses recovery only
      void thrown;
      this.#invalidate();
      return undefined;
    }
  }

  #invalidate(): void { this.#invalid = true; this.#observedPath = []; this.#entries = new Map(); }
}

/** Structural sufficiency, not a guarantee of semantic adequacy or truth. */
export function finalizationEvidence(own: OwnedTurnRead, path: readonly SessionEntry[], snapshots: ReadonlyMap<string, Message> = new Map()): FinalizationEvidence | undefined {
  try {
    const span = spanFor(own, path);
    return span === undefined ? undefined : buildEvidence(own, span, snapshots, spanHashes(span));
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — exported optional recovery reader also fails closed
    void thrown;
    return undefined;
  }
}

function buildEvidence(own: OwnedTurnRead, span: readonly SessionEntry[], snapshots: ReadonlyMap<string, Message>, hashes: readonly string[]): FinalizationEvidence | undefined {
  if (own.messages === undefined || own.messages.length > FINALIZATION_PROOF_MAX_ENTRIES) return undefined;
  const substantive = span.filter((entry) => entry.type === "message" && ["assistant", "toolResult"].includes(entry.message.role));
  const last = substantive.at(-1);
  if (last?.type !== "message") return undefined;
  const terminal = last.message as Message;
  if (!terminalAnswer(terminal) || !terminal.content.some((part) => part.type === "text" && part.text.trim() !== "")) return undefined;
  // New prompt constraints after the answer are not completed work.
  if (span.slice(span.indexOf(last) + 1).some((entry) => entry.type === "message")) return undefined;
  const projected = own.messages;
  const references = new Set(span.flatMap((entry) => entry.type === "message" ? [entry.message] : []));
  if (projected.some((message) => !references.has(message))) return undefined;
  const terminalRetained = projected.includes(terminal);
  // Missing output is supported only after an actual post-answer compaction,
  // using an earlier observed snapshot. An arbitrary filtered projection is
  // not a witness of SDK compaction and cannot open this capability.
  if (!terminalRetained && (snapshots.size === 0 || !span.slice(span.indexOf(last) + 1).some(entry => entry.type === "compaction"))) return undefined;
  const retained: Message[] = [];
  for (const entry of span) {
    if (entry.type !== "message" || entry.message.role === "user") continue;
    const message = entry.message as Message;
    if (message === terminal && !terminalRetained) continue;
    const eligible = projected.includes(message) ? message : snapshots.get(entry.id);
    if (eligible === undefined) return undefined;
    retained.push(eligible);
  }
  const serialized = evidenceJson(retained);
  if (serialized === undefined) return undefined;
  const copied = JSON.parse(serialized) as Message[];
  const receipts = completeReceipts(copied);
  if (receipts === undefined || (!terminalRetained && receipts === 0)) return undefined;
  // Own entry hashes bind exact user/terminal, parent links and metadata. The
  // ordered projection manifest binds reference-correlated own messages only;
  // unrelated pre-attempt history content is deliberately never serialized.
  const projection = projected.map(message => span.findIndex(entry => entry.type === "message" && entry.message === message));
  return { retained: copied, terminalRetained,
    proof: digest(hashes.join("") + digest(boundedJson(projection, FINALIZATION_PROOF_MAX_BYTES)) + digest(serialized)) };
}
