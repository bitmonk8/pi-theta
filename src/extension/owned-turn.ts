// Attempt-local provenance over the existing raw path and SDK-built messages.
// No host ownership token exists: text is a correlation guard, not authentication.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Message } from "@earendil-works/pi-ai";
import { thisTurnSettled, trailingCompactionUnanswered } from "./turn-settlement";

function userText(message: Message): string | undefined {
  if (message.role !== "user") return undefined;
  return typeof message.content === "string" ? message.content
    : message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
}

export interface OwnedTurnRead {
  readonly messages: readonly Message[] | undefined;
  readonly settled: boolean;
  readonly foreign: boolean;
  readonly relocated: boolean;
  readonly userId: string | undefined;
  readonly user: Message | undefined;
}

/** Pins the first enacted matching send; never retargets to a later user. */
export class OwnedTurnAttempt {
  readonly #beforeIds: ReadonlySet<string>;
  readonly #start: number;
  readonly #text: string;
  #userId: string | undefined;
  #user: Message | undefined;
  #foreign = false;
  #ambiguous = false;

  constructor(messages: readonly Message[], path: readonly SessionEntry[], text: string) {
    this.#beforeIds = new Set(path.map((entry) => entry.id));
    this.#start = messages.length;
    this.#text = text;
  }

  read(messages: readonly Message[], path: readonly SessionEntry[], allowRelocation: boolean): OwnedTurnRead {
    const freshUsers = path.filter((entry) => entry.type === "message" && entry.message.role === "user" && !this.#beforeIds.has(entry.id));
    const first = freshUsers[0];
    if (first?.type === "message") {
      const candidate = first.message as Message;
      if (userText(candidate) !== this.#text || (this.#userId !== undefined && this.#userId !== first.id)) {
        this.#ambiguous = true;
        this.#foreign = true;
      } else if (this.#userId === undefined) {
        this.#userId = first.id;
        this.#user = candidate;
      }
      if (freshUsers.length > 1) {
        this.#foreign = true;
        // Equal text is not proof of caller identity. Do not pick either send.
        if (freshUsers.slice(1).some((entry) => entry.type === "message" && userText(entry.message as Message) === this.#text)) {
          this.#ambiguous = true;
        }
      }
    }
    // Some seam consumers supply no raw path. Positional correlation preserves
    // their ordinary no-interleaving contract, but is not provenance for a
    // foreign window. Production always supplies the chronological path.
    const positional = messages.findIndex((message, index) => index >= this.#start && message.role === "user");
    if (path.length === 0 && this.#user === undefined && positional !== -1 && userText(messages[positional]!) === this.#text) {
      this.#user = messages[positional];
    }
    const anchor = this.#user === undefined ? -1 : messages.indexOf(this.#user);
    const next = anchor === -1 ? -1 : messages.findIndex((message, index) => index > anchor && message.role === "user");
    if (next !== -1) this.#foreign = true;
    let slice: readonly Message[] | undefined;
    let relocated = false;
    if (!this.#ambiguous && anchor !== -1 && (anchor >= this.#start || allowRelocation)) {
      slice = messages.slice(anchor, next === -1 ? messages.length : next);
      relocated = anchor < this.#start;
    }
    const ownAt = path.findIndex((entry) => entry.id === this.#userId);
    const rawEnd = ownAt === -1 ? -1 : path.findIndex((entry, index) => index > ownAt && entry.type === "message" && entry.message.role === "user");
    const ownPath = ownAt === -1 ? path : path.slice(ownAt, rawEnd === -1 ? path.length : rawEnd);
    if (this.#foreign) {
      // Both bounds must survive projection. In particular, an omitted foreign
      // user cannot leave its assistant inside the accepted own span. Replaced
      // own messages likewise cannot be correlated by string/value equality.
      const references = new Set(ownPath.flatMap((entry) => entry.type === "message" ? [entry.message] : []));
      const ownIds = new Set(ownPath.map((entry) => entry.id));
      const editedOwn = path.some((entry) => entry.type === "context_edit" && ownIds.has(entry.targetId));
      // SDK custom messages are projected wrappers, not raw message references.
      // They neither open a user turn nor supply an ending/failure/answer. Only
      // the evidence-bearing roles need reference correlation here.
      const unprovenEvidence = slice?.some((message) =>
        (message.role === "user" || message.role === "assistant" || message.role === "toolResult") && !references.has(message));
      if (ownAt === -1 || editedOwn || unprovenEvidence === true) slice = undefined;
    } else if (slice === undefined && allowRelocation && !this.#ambiguous) {
      // PIC-78's existing split-turn fallback, ONLY in a no-foreign window and
      // ONLY after a compaction appended by this attempt. Do not ungate 0501.
      const compacted = path.some((entry) => entry.type === "compaction" && !this.#beforeIds.has(entry.id));
      const summary = compacted ? messages.findIndex((message) => (message.role as string) === "compactionSummary") : -1;
      if (summary !== -1 && !messages.some((message) => message.role === "user")) {
        slice = messages.slice(summary + 1);
        relocated = true;
      }
    }
    const settled = slice !== undefined && !trailingCompactionUnanswered(ownPath) && (
      relocated ? slice.some((message) => message.role === "assistant") : thisTurnSettled(slice, 0, ownPath)
    );
    return { messages: slice, settled, foreign: this.#foreign, relocated, userId: this.#userId, user: this.#user };
  }
}
