// V13g-T — failing tests for discarded-query result discipline and discard
// observability (V13g).
//
// Spec: query/query-escapes-stringification.md §"Discarded query results are a
// parse error" (QRY-19) and §"Observability of discarded results" (QRY-20),
// with the operator-facing runtime-event routing per
// pi-integration-contract/runtime-event-channel.md §"Runtime event channel".
//
// These tests red on their own primary assertions while the V13g implementation
// is absent (the V13g-T seam stubs are inert: the parse check never fires, and
// the discard-observability emitter emits one sentinel event unconditionally),
// per the per-phase TDD ritual's "fail red for the intended reason".

import { describe, expect, it } from "vitest";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import type { QueryError, TransportError } from "../src/runtime/query-error";
import {
  DISCARDED_QUERY_RESULT_CODE,
  DISCARDED_QUERY_RESULT_MESSAGE,
  buildDiscardEvent,
  checkDiscardedQueryResult,
  emitDiscardObservability,
  type DiscardEmitInput,
  type QueryStatement,
  type QueryStatementDisposition,
} from "../src/runtime/query-discard";

// --- recording channel double ---------------------------------------------

interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: SystemNoteDetails;
}

function makeChannel(): {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
} {
  const sent: SentNote[] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({ ...message });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, sent };
}

const RANGE = {
  start: { line: 7, column: 3 },
  end: { line: 7, column: 40 },
} as const;

function stmt(
  disposition: QueryStatementDisposition,
  overrides?: Partial<QueryStatement>,
): QueryStatement {
  return {
    isQuery: true,
    disposition,
    file: "a.loom",
    range: RANGE,
    ...overrides,
  };
}

/** A discarded `Err` payload (`transport`) whose kind/message the event preserves. */
function transportErr(): TransportError {
  return {
    kind: "transport",
    message: "provider connection reset",
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}

function emitInput(
  outcome: DiscardEmitInput["outcome"],
  overrides?: Partial<DiscardEmitInput>,
): DiscardEmitInput {
  return {
    outcome,
    form: "let-underscore",
    discardSite: { file: "a.loom", line: 12, column: 1 },
    loom: "/demo",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
    querySite: { file: "a.loom", line: 12, column: 9 },
    ...overrides,
  };
}

/** The single group-A `RuntimeEvent` carried by the one recorded note. */
function soleEvent(sent: readonly SentNote[]): RuntimeEvent {
  expect(sent).toHaveLength(1);
  const details = sent[0]!.details;
  expect("event" in details).toBe(true);
  return (details as { event: RuntimeEvent }).event;
}

// --- QRY-19 — discarded-query parse error ----------------------------------

describe("V13g-T — QRY-19 discarded-query result parse error", () => {
  it("QRY-19: a bare `@`...`` expression-statement fires loom/parse/discarded-query-result at its location; the acknowledging forms do not", () => {
    // Primary facet: the bare expression-statement position fires the error.
    const diag = checkDiscardedQueryResult(stmt("bare-expr-statement"));
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    // Diagnostic message anchored to the registry code + Message column.
    expect(diag?.code).toBe(DISCARDED_QUERY_RESULT_CODE);
    expect(diag?.message).toBe(DISCARDED_QUERY_RESULT_MESSAGE);
    expect(diag?.file).toBe("a.loom");
    expect(diag?.range).toEqual(RANGE);

    // Same-rule negative facets (folded in so no free-standing green remains):
    // only the bare expression-statement position triggers the error — the
    // `?`-propagate, `let _ =`-discard, and `let x = ...?`-bind forms are all
    // accepted, and a non-query bare statement is not a discarded-query result.
    expect(checkDiscardedQueryResult(stmt("propagate"))).toBeUndefined();
    expect(
      checkDiscardedQueryResult(stmt("discard-let-underscore")),
    ).toBeUndefined();
    expect(checkDiscardedQueryResult(stmt("bind"))).toBeUndefined();
    expect(
      checkDiscardedQueryResult(stmt("bare-expr-statement", { isQuery: false })),
    ).toBeUndefined();
  });
});

// --- QRY-20 — discard observability ----------------------------------------

describe("V13g-T — QRY-20 discard observability", () => {
  it("QRY-20: a discarded query that settles to Err emits exactly one operator-facing event (display:false) preserving kind/message, discard_site = the `let _ =` location", () => {
    const { deps, sent } = makeChannel();
    const err: QueryError = transportErr();
    const discardSite = { file: "a.loom", line: 12, column: 1 };

    emitDiscardObservability(
      emitInput({ ok: false, error: err }, { form: "let-underscore", discardSite }),
      deps,
    );

    // Routes through the always-log `loom-system-note` channel, group-A shape.
    expect(sent[0]!.customType).toBe(SYSTEM_NOTE_CHANNEL);
    const event = soleEvent(sent);
    // Operator-facing: display:false, empty companion content.
    expect(sent[0]!.display).toBe(false);
    expect(sent[0]!.content).toBe("");
    // Preserves the discarded Err's kind and message.
    expect(event.kind).toBe("transport");
    expect(event.message).toBe("provider connection reset");
    // Stamps discard_site with the discarding `let _ =` location.
    expect(event.discard_site).toEqual(discardSite);
  });

  it("QRY-20: the void-tail discard form stamps discard_site with the tail `@`...`` expression location", () => {
    const { deps, sent } = makeChannel();
    const tailSite = { file: "b.loom", line: 4, column: 5 };

    emitDiscardObservability(
      emitInput(
        { ok: false, error: transportErr() },
        { form: "void-tail", discardSite: tailSite },
      ),
      deps,
    );

    const event = soleEvent(sent);
    expect(sent[0]!.display).toBe(false);
    expect(event.discard_site).toEqual(tailSite);
  });

  it("QRY-20: a discarded Ok emits no event (nothing to observe), for either discard form", () => {
    for (const form of ["let-underscore", "void-tail"] as const) {
      const { deps, sent } = makeChannel();
      emitDiscardObservability(emitInput({ ok: true }, { form }), deps);
      expect(sent).toHaveLength(0);
    }
  });

  it("QRY-20: buildDiscardEvent copies the discarded Err's kind/message and stamps discard_site", () => {
    // The event-construction seam preserves the Err payload and stamps the
    // discard location, independent of the emission path.
    const err = transportErr();
    const input = emitInput(
      { ok: false, error: err },
      { discardSite: { file: "c.loom", line: 9, column: 2 } },
    );
    const event = buildDiscardEvent(err, input);
    expect(event.kind).toBe("transport");
    expect(event.message).toBe("provider connection reset");
    expect(event.discard_site).toEqual({ file: "c.loom", line: 9, column: 2 });
    expect(event.loom).toBe("/demo");
  });
});
