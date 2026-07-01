import { describe, expect, it } from "vitest";
import {
  classifyShutdownReason,
  type PinnedConstantSnapshotSource,
  type SessionShutdownEventLike,
} from "../src/extension/unknown-reason-rule";
import { SDK_SURFACE_INVENTORY } from "../src/extension/sdk-inventory";

// V9h-T — failing tests for the `session_shutdown` unknown-reason rule (paired
// V9h implementation leaf).
//
// Spec: pi-integration-contract/unknown-reason-rule.md
//   PIC-45 — closed-set membership check against the snapshot's `literals`
//            field, with the unknown-reason fallback (reason-unknown W + full
//            five-sub-step teardown);
//   PIC-46 — constant-source pinning (single-site edit): the closed set is
//            sourced from the `SessionShutdownEvent.reason` snapshot entry in
//            `SDK_SURFACE_INVENTORY`, and the membership check consumes that
//            entry's `literals` field with no separate copy in the handler;
//   PIC-47 — handler-internal `try`/`catch` discipline: the fixed
//            snapshot-then-`event.reason` read order, the catch-arm-per-failing
//            -read discriminator, and the `pinned-constant-unreadable`
//            `details.failure` closed discriminator set;
//   PIC-48 — anchor-stable contract surface: the two diagnostic codes, the
//            brace-form closed-set literal, and the three discriminator
//            literals are byte-exact contract substrings.
//
// Each test cites its REQ-ID inline per the conventions.md REQ-ID-discipline
// and Diagnostic-message-anchor rules; expected diagnostic messages are sourced
// verbatim from the diagnostics/code-registry-host.md *Message* column. These
// tests exercise the seam the paired V9h implementation fills in; they MUST
// fail red for the intended reason (the reads / membership check / four-arm
// routing / discriminators are absent), not on a compile error or harness
// throw.

// --- anchor-stable contract-surface literals (PIC-48), sourced verbatim from
//     unknown-reason-rule.md #pic-48 and diagnostics/code-registry-host.md ---
const REASON_UNKNOWN_CODE = "loom/host/session-shutdown-reason-unknown";
const PINNED_CONSTANT_UNREADABLE_CODE =
  "loom/host/session-shutdown-pinned-constant-unreadable";
// The (c) brace-form closed-set literal `{"quit", "reload", "new", "resume", "fork"}`.
const CLOSED_SET = ["quit", "reload", "new", "resume", "fork"] as const;
// Registry *Message* column templates (with the placeholder filled).
const reasonUnknownMessage = (observed: string): string =>
  `session_shutdown event.reason outside closed set: ${observed}`;
const pinnedConstantUnreadableMessage = (failure: string): string =>
  `session_shutdown pinned-constant read failed: ${failure}`;

// The healthy pinned-constant snapshot the runtime would locate in
// `SDK_SURFACE_INVENTORY` via the composite predicate
// `(kind === "type-union-snapshot") && (path === "SessionShutdownEvent.reason")`.
const healthySnapshotEntry = (): PinnedConstantSnapshotSource => ({
  kind: "type-union-snapshot",
  path: "SessionShutdownEvent.reason",
  literals: [...CLOSED_SET],
});
// A full synthetic inventory with the healthy snapshot entry plus decoy rows.
const healthyInventory = (): readonly PinnedConstantSnapshotSource[] => [
  { kind: "namespace-function", path: "pi.registerCommand" },
  healthySnapshotEntry(),
  { kind: "engines-pin", path: "pi-engines-node" },
];

const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });
const throwingReasonEvent = (thrown: unknown): SessionShutdownEventLike => ({
  get reason(): unknown {
    throw thrown;
  },
});

// ============================================================================
// PIC-45 — closed-set membership check (+ unknown-reason fallback)
// ============================================================================

describe("PIC-45 — closed-set membership check", () => {
  it("classifies each closed-set member as a member with no diagnostic (PIC-45)", () => {
    for (const reason of CLOSED_SET) {
      const result = classifyShutdownReason(eventWith(reason), healthyInventory());
      expect(result.isClosedSetMember).toBe(true);
      expect(result.capturedEventReason).toBe(reason);
      expect(result.pinnedConstantReadOk).toBe(true);
      expect(result.diagnostic).toBeUndefined();
    }
  });

  it("routes an off-set reason to reason-unknown with details.observed (PIC-45)", () => {
    const result = classifyShutdownReason(eventWith("bogus"), healthyInventory());
    // Non-member: unknown-reason fallback fires (the full five-sub-step teardown
    // runs downstream; classification signals non-member).
    expect(result.isClosedSetMember).toBe(false);
    expect(result.diagnostic?.code).toBe(REASON_UNKNOWN_CODE);
    expect(result.diagnostic?.severity).toBe("warning");
    expect(result.diagnostic?.details?.observed).toBe("bogus");
    expect(result.diagnostic?.message).toBe(reasonUnknownMessage("bogus"));
    // Captured value is String(event.reason) on the unknown path; snapshot read
    // succeeded so pinnedConstantReadOk holds.
    expect(result.capturedEventReason).toBe("bogus");
    expect(result.pinnedConstantReadOk).toBe(true);
  });

  it("coerces symbol/undefined/number/object reasons via String(...) without throwing (PIC-45)", () => {
    const cases: ReadonlyArray<{ reason: unknown; observed: string }> = [
      { reason: undefined, observed: "undefined" },
      { reason: 42, observed: "42" },
      { reason: true, observed: "true" },
      { reason: Symbol("s"), observed: "Symbol(s)" },
      { reason: {}, observed: "[object Object]" },
    ];
    for (const { reason, observed } of cases) {
      const result = classifyShutdownReason(eventWith(reason), healthyInventory());
      expect(result.isClosedSetMember).toBe(false);
      expect(result.diagnostic?.code).toBe(REASON_UNKNOWN_CODE);
      expect(result.diagnostic?.details?.observed).toBe(observed);
      expect(result.capturedEventReason).toBe(observed);
    }
  });

  it("treats a throwing event.reason property access as unknown with observed \"<unreadable>\" (PIC-45)", () => {
    const result = classifyShutdownReason(
      throwingReasonEvent(new Error("getter boom")),
      healthyInventory(),
    );
    expect(result.isClosedSetMember).toBe(false);
    expect(result.diagnostic?.code).toBe(REASON_UNKNOWN_CODE);
    expect(result.diagnostic?.details?.observed).toBe("<unreadable>");
    expect(result.diagnostic?.message).toBe(reasonUnknownMessage("<unreadable>"));
    expect(result.capturedEventReason).toBe("<unreadable>");
    // The event-side throw does not defeat the (successful) snapshot read.
    expect(result.pinnedConstantReadOk).toBe(true);
  });

  it("falls back to observed \"<unreadable>\" when String(event.reason) itself throws (PIC-45)", () => {
    // An off-set object whose toString/Symbol.toPrimitive throws makes String(...)
    // throw — the one object case the "coerces without throwing" tolerance omits.
    const hostileToString: unknown = {
      toString(): string {
        throw new Error("toString boom");
      },
    };
    const result = classifyShutdownReason(eventWith(hostileToString), healthyInventory());
    expect(result.isClosedSetMember).toBe(false);
    expect(result.diagnostic?.code).toBe(REASON_UNKNOWN_CODE);
    expect(result.diagnostic?.details?.observed).toBe("<unreadable>");
    expect(result.capturedEventReason).toBe("<unreadable>");
  });

  it("reads membership from the snapshot's literals field, not a hard-coded set (PIC-45)", () => {
    // A snapshot whose literals omit "quit" makes "quit" an unknown reason; a
    // hard-coded closed set in the handler would wrongly classify it a member.
    const narrowedInventory: readonly PinnedConstantSnapshotSource[] = [
      { kind: "type-union-snapshot", path: "SessionShutdownEvent.reason", literals: ["reload"] },
    ];
    const quit = classifyShutdownReason(eventWith("quit"), narrowedInventory);
    expect(quit.isClosedSetMember).toBe(false);
    expect(quit.diagnostic?.code).toBe(REASON_UNKNOWN_CODE);
    const reload = classifyShutdownReason(eventWith("reload"), narrowedInventory);
    expect(reload.isClosedSetMember).toBe(true);
    expect(reload.diagnostic).toBeUndefined();
  });
});

// ============================================================================
// PIC-46 — constant-source pinning (single-site edit)
// ============================================================================

describe("PIC-46 — constant-source pinning", () => {
  it("sources the closed set from the SessionShutdownEvent.reason snapshot entry in SDK_SURFACE_INVENTORY (PIC-46)", () => {
    // The composite predicate the runtime keys on: kind + path (both clauses).
    const matches = SDK_SURFACE_INVENTORY.filter(
      (entry) =>
        (entry as { kind?: unknown }).kind === "type-union-snapshot" &&
        (entry as { path?: unknown }).path === "SessionShutdownEvent.reason",
    );
    // Exactly one such entry (single source of truth, no re-declared copy).
    expect(matches.length).toBe(1);
    expect((matches[0] as { literals?: unknown }).literals).toStrictEqual([...CLOSED_SET]);
  });

  it("consumes the injected snapshot literals (no separate copy in the handler) (PIC-46)", () => {
    // Extending the snapshot literals admits the new member without any handler
    // edit — witnessing that membership reads the injected field directly.
    const extendedInventory: readonly PinnedConstantSnapshotSource[] = [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...CLOSED_SET, "hibernate"],
      },
    ];
    const result = classifyShutdownReason(eventWith("hibernate"), extendedInventory);
    expect(result.isClosedSetMember).toBe(true);
    expect(result.diagnostic).toBeUndefined();
  });
});

// ============================================================================
// PIC-47 — handler-internal try/catch discipline + pinned-constant-unreadable
// ============================================================================

describe("PIC-47 — snapshot-read-failure discriminators", () => {
  it("routes an undefined SDK_SURFACE_INVENTORY to \"missing-entry\" before iterating (PIC-47)", () => {
    // The circular-init / live-binding gap: the block has not finished
    // initialising. MUST be guarded before the iteration primitive so it routes
    // to "missing-entry", not a "throw:TypeError: …" value.
    const result = classifyShutdownReason(eventWith("new"), undefined);
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    expect(result.diagnostic?.severity).toBe("warning");
    expect(result.diagnostic?.details?.failure).toBe("missing-entry");
    expect(result.diagnostic?.message).toBe(pinnedConstantUnreadableMessage("missing-entry"));
    expect(result.pinnedConstantReadOk).toBe(false);
    // event.reason read was never reached; captured value stays at its pre-init.
    expect(result.capturedEventReason).toBe("<unreadable>");
  });

  it("routes a no-matching-entry inventory to \"missing-entry\" (PIC-47)", () => {
    const noMatch: readonly PinnedConstantSnapshotSource[] = [
      { kind: "namespace-function", path: "pi.registerCommand" },
      { kind: "engines-pin", path: "pi-engines-node" },
    ];
    const result = classifyShutdownReason(eventWith("new"), noMatch);
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    expect(result.diagnostic?.details?.failure).toBe("missing-entry");
    expect(result.pinnedConstantReadOk).toBe(false);
  });

  it("routes a kind-mismatch entry at the matching path to \"missing-entry\" (defensive) (PIC-47)", () => {
    // An entry exists at the matching path but its kind is not
    // "type-union-snapshot": the composite predicate fails to match.
    const kindMismatch: readonly PinnedConstantSnapshotSource[] = [
      { kind: "engines-pin", path: "SessionShutdownEvent.reason", literals: [...CLOSED_SET] },
    ];
    const result = classifyShutdownReason(eventWith("new"), kindMismatch);
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    expect(result.diagnostic?.details?.failure).toBe("missing-entry");
  });

  it("routes a throwing .literals access to a \"throw:<String(error)>\" discriminator (PIC-47)", () => {
    const throwingLiterals: PinnedConstantSnapshotSource = {
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      get literals(): unknown {
        throw new Error("literals boom");
      },
    };
    const result = classifyShutdownReason(eventWith("new"), [throwingLiterals]);
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    const failure = result.diagnostic?.details?.failure as string | undefined;
    expect(failure?.startsWith("throw:")).toBe(true);
    expect(failure).toBe("throw:Error: literals boom");
    expect(result.pinnedConstantReadOk).toBe(false);
  });

  it("routes a throwing per-entry .kind read during iteration to a \"throw:\" discriminator (PIC-47)", () => {
    const throwingKind: PinnedConstantSnapshotSource = {
      get kind(): string {
        throw new Error("kind boom");
      },
      path: "SessionShutdownEvent.reason",
    };
    const result = classifyShutdownReason(eventWith("new"), [throwingKind]);
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    const failure = result.diagnostic?.details?.failure as string | undefined;
    expect(failure?.startsWith("throw:")).toBe(true);
  });
});

describe("PIC-47 — the four literals-shape-invalid sub-cases", () => {
  // Each fixture exhibits exactly one structural defect; all four route to the
  // single "literals-shape-invalid" discriminator and MUST NOT emit reason-unknown.
  const subCases: ReadonlyArray<{ name: string; literals: unknown }> = [
    { name: "(1) literals is not an array", literals: "quit,reload" },
    { name: "(2) array with a non-string element", literals: ["quit", 7, "new"] },
    { name: "(3) the empty array", literals: [] },
    { name: "(4) array of strings containing the empty string", literals: ["quit", "", "new"] },
  ];
  for (const { name, literals } of subCases) {
    it(`routes ${name} to "literals-shape-invalid" (PIC-47)`, () => {
      const inventory: readonly PinnedConstantSnapshotSource[] = [
        { kind: "type-union-snapshot", path: "SessionShutdownEvent.reason", literals },
      ];
      const result = classifyShutdownReason(eventWith("new"), inventory);
      expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
      expect(result.diagnostic?.details?.failure).toBe("literals-shape-invalid");
      expect(result.diagnostic?.message).toBe(
        pinnedConstantUnreadableMessage("literals-shape-invalid"),
      );
      expect(result.pinnedConstantReadOk).toBe(false);
    });
  }
});

describe("PIC-47 — fixed read order and mutual exclusivity", () => {
  it("observes pinned-constant-unreadable (not reason-unknown) when the snapshot fails and event.reason also throws (PIC-47)", () => {
    // Snapshot read runs first: a failing snapshot wins even when event.reason
    // would itself throw — the event.reason read is never reached.
    const result = classifyShutdownReason(
      throwingReasonEvent(new Error("getter boom")),
      undefined,
    );
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    expect(result.diagnostic?.details?.failure).toBe("missing-entry");
  });

  it("emits at most one of the two mutually-exclusive codes per event (PIC-47)", () => {
    // Corrupted snapshot paired with a closed-set-member event.reason ("quit")
    // fires pinned-constant-unreadable, NOT the misleading reason-unknown.
    const result = classifyShutdownReason(eventWith("quit"), undefined);
    expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
    expect(result.diagnostic?.code).not.toBe(REASON_UNKNOWN_CODE);
  });
});

// ============================================================================
// PIC-47 / PIC-48(d) — "throw:<String(error)>" discriminator grammar
// (Acceptance criteria (a)–(d))
// ============================================================================

describe("PIC-47 — throw-discriminator grammar", () => {
  // Force a "throw:" discriminator whose payload we control by throwing a
  // string (String(error) === the string itself) from the .literals getter.
  const failureFor = (thrown: unknown): string | undefined => {
    const entry: PinnedConstantSnapshotSource = {
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      get literals(): unknown {
        throw thrown;
      },
    };
    const result = classifyShutdownReason(eventWith("new"), [entry]);
    return result.diagnostic?.details?.failure as string | undefined;
  };

  it("(a) truncates the payload to at most 256 UTF-16 code units, inclusive at 256 (PIC-47)", () => {
    const at256 = "a".repeat(256);
    expect(failureFor(at256)).toBe(`throw:${at256}`);
    const over = "a".repeat(257);
    const failure = failureFor(over);
    expect(failure).toBe(`throw:${"a".repeat(256)}`);
    // Post-prefix payload length is capped at 256.
    expect((failure as string).length - "throw:".length).toBe(256);
  });

  it("(b) escapes control characters per the pinned escape classes (PIC-47)", () => {
    expect(failureFor("a\nb\rc\td")).toBe("throw:a\\nb\\rc\\td");
    // U+0000 and U+007F use the six-character lowercase \\uXXXX escape.
    expect(failureFor("\u0000")).toBe("throw:\\u0000");
    expect(failureFor("\u007f")).toBe("throw:\\u007f");
    expect(failureFor("\u009f")).toBe("throw:\\u009f");
    // Ordinary characters pass through unchanged.
    expect(failureFor("plain text")).toBe("throw:plain text");
  });

  it("(c) passes an interior colon and an inner \"throw:\" substring through unchanged (PIC-47)", () => {
    const colon = failureFor("a:b:c");
    expect(colon).toBe("throw:a:b:c");
    expect((colon as string).startsWith("throw:")).toBe(true);
    const innerThrow = failureFor("throw:inner");
    expect(innerThrow).toBe("throw:throw:inner");
    expect((innerThrow as string).startsWith("throw:")).toBe(true);
  });

  it("(d) falls back to \"throw:<unreadable>\" when String(error) itself throws (PIC-47)", () => {
    const hostileError: unknown = {
      toString(): string {
        throw new Error("coercion boom");
      },
    };
    expect(failureFor(hostileError)).toBe("throw:<unreadable>");
  });
});

// ============================================================================
// PIC-48 — anchor-stable contract surface (codes / literals byte-exact)
// ============================================================================

describe("PIC-48 — anchor-stable contract surface", () => {
  it("emits the byte-exact reason-unknown code substring (PIC-48 (a))", () => {
    const result = classifyShutdownReason(eventWith("bogus"), healthyInventory());
    expect(result.diagnostic?.code).toBe("loom/host/session-shutdown-reason-unknown");
  });

  it("emits the byte-exact pinned-constant-unreadable code substring (PIC-48 (b))", () => {
    const result = classifyShutdownReason(eventWith("new"), undefined);
    expect(result.diagnostic?.code).toBe(
      "loom/host/session-shutdown-pinned-constant-unreadable",
    );
  });

  it("pins the brace-form closed-set literal (PIC-48 (c))", () => {
    const matches = SDK_SURFACE_INVENTORY.filter(
      (entry) =>
        (entry as { kind?: unknown }).kind === "type-union-snapshot" &&
        (entry as { path?: unknown }).path === "SessionShutdownEvent.reason",
    );
    expect((matches[0] as { literals?: unknown } | undefined)?.literals).toStrictEqual([
      "quit",
      "reload",
      "new",
      "resume",
      "fork",
    ]);
  });

  it("emits only discriminator literals inhabiting the closed details.failure union (PIC-48 (d))", () => {
    const admits = (d: string): boolean =>
      d === "missing-entry" || d === "literals-shape-invalid" || d.startsWith("throw:");
    const fixtures: ReadonlyArray<readonly PinnedConstantSnapshotSource[] | undefined> = [
      undefined,
      [{ kind: "type-union-snapshot", path: "SessionShutdownEvent.reason", literals: [] }],
      [
        {
          kind: "type-union-snapshot",
          path: "SessionShutdownEvent.reason",
          get literals(): unknown {
            throw new Error("boom");
          },
        },
      ],
    ];
    for (const inventory of fixtures) {
      const result = classifyShutdownReason(eventWith("new"), inventory);
      expect(result.diagnostic?.code).toBe(PINNED_CONSTANT_UNREADABLE_CODE);
      expect(admits(result.diagnostic?.details?.failure as string)).toBe(true);
    }
  });
});
