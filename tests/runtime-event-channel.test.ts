// V9d-T — failing tests for the runtime-event channel and `masked` co-fire (V9d).
//
// Spec: pi-integration-contract/runtime-event-channel.md §"Runtime event
// channel", the §"system-note-details-shapes" display/content matrix, the
// group-A/group-B partition, the success-side null-policy, and PIC-1
// (runtime-event-channel.md#pic-1) clauses (a)–(g).
//
// These tests red on their own primary assertions while the V9d
// runtime-event-channel implementation is absent (the V9d-T seam stubs are
// inert), per the per-phase TDD ritual's "fail red for the intended reason".

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";
import {
  GROUP_A_KINDS,
  MASKED_CEILING_IDS,
  NON_ALWAYS_LOG_KINDS,
  alwaysLogGroup,
  buildDiagnosticsBatchNote,
  buildPanicNote,
  buildRecoveryNote,
  buildRuntimeEventNote,
  buildStructuralNote,
  cascadeReemit,
  computeMasked,
  dedupKey,
  emitPanic,
  emitRuntimeEvent,
  isAlwaysLogKind,
  successSideNote,
  type MaskedPredicateInput,
  type RuntimeEvent,
  type RuntimeEventEmitContext,
} from "../src/runtime/runtime-event-channel";

// --- recording channel double --------------------------------------------

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

function baseEvent(overrides?: Partial<RuntimeEvent>): RuntimeEvent {
  return {
    kind: "transport",
    loom: "/demo",
    invocation_id: "00000000-0000-4000-8000-000000000000",
    query_site: { file: "a.loom", line: 3, column: 1 },
    message: "boom",
    occurred_at: 1700000000000,
    ...overrides,
  };
}

function panicDiag(): Diagnostic {
  return {
    severity: "error",
    code: "loom/runtime/index-out-of-bounds",
    file: "a.loom",
    range: { start: { line: 2, column: 1 }, end: { line: 2, column: 2 } },
    message: "index out of bounds: 5 not in 0..3",
  };
}

// --- PIC-1 `masked` hard-ceiling co-fire ----------------------------------

describe("V9d-T — PIC-1 masked hard-ceiling co-fire", () => {
  // The reachable scalars for the only loom-1.0 non-empty mask.
  const reachable: MaskedPredicateInput = {
    kind: "validation",
    validationCause: "schema_validation",
    atTypedQueryResponse: true,
    turnKind: "forced_respond",
    toolLoopSlotCount: 4,
    maxRounds: 4,
  };

  it("PIC-1(a)/(c): the reachable mask is exactly ['ceiling#2'] from the closed id set on a typed-query response", () => {
    const masked = computeMasked(reachable);
    expect(masked).toEqual(["ceiling#2"]);
    // Closed identifier set (clause a): every entry is one of the four ids.
    for (const id of masked ?? []) {
      expect(MASKED_CEILING_IDS as readonly string[]).toContain(id);
    }
  });

  it("PIC-1(b): masked is omitted (undefined, never []) when no co-fire occurs", () => {
    // max_rounds: 0 makes the forced respond turn the only turn — unreachable.
    expect(computeMasked({ ...reachable, maxRounds: 0, toolLoopSlotCount: 0 })).toBeUndefined();
    // A free-phase turn is never the co-fire surface.
    expect(computeMasked({ ...reachable, turnKind: "free_phase" })).toBeUndefined();
    // A non-typed-query-response site omits masked.
    expect(computeMasked({ ...reachable, atTypedQueryResponse: false })).toBeUndefined();
    // The canonical-absence rule forbids emitting `[]`.
    expect(computeMasked({ ...reachable, turnKind: "free_phase" })).not.toEqual([]);
  });

  it("PIC-1(e): emitting the masked-bearing validation event causes exactly one emission carrying ['ceiling#2'] (pure read)", () => {
    const { deps, sent } = makeChannel();
    const masked = computeMasked(reachable);
    const event = baseEvent({ kind: "validation", message: "schema validation failed" });
    if (masked !== undefined) {
      event.masked = masked;
    }
    const ctx: RuntimeEventEmitContext = {
      topLevelCascade: false,
      userFacingTemplate: "",
    };

    emitRuntimeEvent(event, ctx, deps);

    // Evaluating the predicate causes no second emission on the channel.
    expect(sent).toHaveLength(1);
    const carried = (sent[0]!.details as { event: RuntimeEvent }).event;
    expect(carried.masked).toEqual(["ceiling#2"]);
  });

  it("PIC-1(f)/(g): the cascade twin copies masked verbatim, but the dedup key excludes masked", () => {
    const origin = baseEvent({ kind: "validation", masked: ["ceiling#2"] });

    // Clause (f): verbatim copy including masked and occurred_at.
    const twin = cascadeReemit(origin);
    expect(twin).toEqual(origin);
    expect(twin.masked).toEqual(["ceiling#2"]);
    expect(twin.occurred_at).toBe(origin.occurred_at);

    // Clause (g): two events differing only in masked share one dedup key.
    const withMask = baseEvent({ masked: ["ceiling#2"] });
    const withoutMask = baseEvent();
    expect(dedupKey(withMask)).toBe(dedupKey(withoutMask));
  });
});

// --- always-log exactly-once + success null-policy ------------------------

describe("V9d-T — always-log exactly-once emission and success null-policy", () => {
  it("each group-A always-log kind is a member and emits exactly once; the four excluded kinds are not members", () => {
    for (const kind of GROUP_A_KINDS) {
      expect(isAlwaysLogKind(kind)).toBe(true);

      const { deps, sent } = makeChannel();
      emitRuntimeEvent(
        baseEvent({ kind }),
        { topLevelCascade: false, userFacingTemplate: "" },
        deps,
      );
      expect(sent).toHaveLength(1);
    }
    // The complement: `validation`, `context_overflow`, `cancelled`, and
    // `invoke_callee` are deliberately NOT in the always-log set.
    for (const kind of NON_ALWAYS_LOG_KINDS) {
      expect(isAlwaysLogKind(kind)).toBe(false);
    }
  });

  it("the success side honours the null-policy: Ok(v) yields no system note", () => {
    expect(successSideNote()).toBeNull();
  });
});

// --- per-variant (details-key, display, content) matrix -------------------

describe("V9d-T — per-variant display/content matrix", () => {
  it("details: { diagnostics } parse/load/type batch → display true, content = serialised lines", () => {
    const content = "a.loom:1:1: loom/parse/unexpected-token: boom";
    const note = buildDiagnosticsBatchNote([panicDiag()], content);
    expect(note.display).toBe(true);
    expect(note.content).toBe(content);
    expect("diagnostics" in note.details).toBe(true);
  });

  it("details: { diagnostics: [Diagnostic] } runtime panic → display true, content = aborted framing", () => {
    const framing = "loom /demo aborted: index out of bounds: 5 not in 0..3";
    const note = buildPanicNote(panicDiag(), framing);
    expect(note.display).toBe(true);
    expect(note.content).toBe(framing);
    const carried = (note.details as { diagnostics: readonly Diagnostic[] }).diagnostics;
    expect(carried).toHaveLength(1);
  });

  it("details: { event } top-level cascade → display true, content = user-facing template", () => {
    const template = "loom /demo failed: boom";
    const note = buildRuntimeEventNote(baseEvent(), {
      topLevelCascade: true,
      userFacingTemplate: template,
    });
    expect(note.display).toBe(true);
    expect(note.content).toBe(template);
    expect("event" in note.details).toBe(true);
  });

  it("details: { event } author-handled / subagent invoke → display false, content = '' (verbatim)", () => {
    const note = buildRuntimeEventNote(baseEvent(), {
      topLevelCascade: false,
      userFacingTemplate: "loom /demo failed: boom",
    });
    expect(note.display).toBe(false);
    expect(note.content).toBe("");
    expect("event" in note.details).toBe(true);
  });

  it("details: { structural } → display true, content = verbatim structural template", () => {
    const content = "loom sources changed: +1 -0";
    const note = buildStructuralNote({ added: ["/x.loom"], removed: [] }, content);
    expect(note.display).toBe(true);
    expect(note.content).toBe(content);
    expect("structural" in note.details).toBe(true);
  });

  it("details: { recovery } binder-model hot-reload → display true, content = verbatim recovery template", () => {
    const content = "binder model recovered for: /demo";
    const note = buildRecoveryNote(["/demo"], content);
    expect(note.display).toBe(true);
    expect(note.content).toBe(content);
    expect("recovery" in note.details).toBe(true);
  });
});

// --- group-A/B single-shape routing ---------------------------------------

describe("V9d-T — group-A/B single-shape routing (no fan-out)", () => {
  it("group A: a single always-log failure routes to exactly one event-shape note and zero diagnostics-shape notes", () => {
    expect(alwaysLogGroup({ kind: "transport" })).toBe("A");

    const { deps, sent } = makeChannel();
    emitRuntimeEvent(
      baseEvent({ kind: "transport" }),
      { topLevelCascade: true, userFacingTemplate: "loom /demo failed: boom" },
      deps,
    );

    expect(sent).toHaveLength(1);
    const eventShape = sent.filter((n) => "event" in n.details);
    const diagShape = sent.filter((n) => "diagnostics" in n.details);
    expect(eventShape).toHaveLength(1);
    expect(diagShape).toHaveLength(0);
    expect(sent[0]!.customType).toBe(SYSTEM_NOTE_CHANNEL);
  });

  it("group B: a single runtime panic routes to exactly one diagnostics-shape note and zero event-shape notes", () => {
    expect(alwaysLogGroup({ code: "loom/runtime/index-out-of-bounds" })).toBe("B");

    const { deps, sent } = makeChannel();
    emitPanic(panicDiag(), "loom /demo aborted: index out of bounds: 5 not in 0..3", deps);

    expect(sent).toHaveLength(1);
    const diagShape = sent.filter((n) => "diagnostics" in n.details);
    const eventShape = sent.filter((n) => "event" in n.details);
    expect(diagShape).toHaveLength(1);
    expect(eventShape).toHaveLength(0);
  });
});

// Keep the `SystemNote` type import meaningful for readers of the fixtures.
export type { SystemNote };
