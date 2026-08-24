// V4e-T — load-time pre-evaluation failure routing (tests). These tests are
// written against the seam the paired V4e implementation leaf fills in; they
// MUST fail red for the intended reason (the pre-eval routing is absent),
// citing ERR-1…ERR-6 and ERR-16 inline. Each cause's assembled
// `theta-system-note` is handed to the router; the router MUST route it onto the
// `theta-system-note` channel with `triggerTurn:false`, never firing a turn and
// never becoming an evaluation outcome.
//
// Spec: errors-and-results/error-model.md (ERR-1…ERR-6, ERR-16),
// hard-ceilings/ceilings-3-and-4.md (CIO-1 ceiling-#4 slash-load `params`
// cross-route through ceiling #3), pi-integration-contract/
// runtime-event-channel.md §"System notes".

import { describe, expect, it, vi } from "vitest";
import {
  createLoadFailurePreEvalRouter,
  type PreEvalFailureCause,
} from "../src/extension/load-pre-eval";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";
import { preEvalCauseOf } from "../src/extension/production-composition";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// A recording `theta-system-note` channel. `pi.sendMessage` is the only surface
// asserted against — it carries the fixed `triggerTurn:false` option, so a
// routed pre-eval failure never fires a turn.
function recordingChannel(): {
  channel: SystemNoteChannelDeps;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const sendMessage = vi.fn<SystemNoteSender["sendMessage"]>();
  const channel: SystemNoteChannelDeps = {
    pi: { sendMessage },
    ui: { notify: vi.fn() },
    emitDiagnostic: vi.fn<(d: Diagnostic) => void>(),
  };
  return { channel, sendMessage };
}

// Pull the single `sendMessage` call and read its message + options.
function onlyNote(sendMessage: ReturnType<typeof vi.fn>): {
  customType: string;
  content: string;
  details: SystemNoteDetails;
  triggerTurn: unknown;
} {
  expect(sendMessage).toHaveBeenCalledTimes(1);
  const [message, options] = sendMessage.mock.calls[0] as [
    { customType: string; content: string; details: SystemNoteDetails },
    { triggerTurn: unknown },
  ];
  return {
    customType: message.customType,
    content: message.content,
    details: message.details,
    triggerTurn: options.triggerTurn,
  };
}

// A representative assembled `theta-system-note` for a diagnostic-batch cause
// (ERR-1…ERR-4, ERR-6). The producing subsystem assembles it; V4e routes it.
function diagNote(code: string): SystemNote {
  const diagnostic: Diagnostic = {
    severity: "error",
    code,
    message: `pre-eval failure: ${code}`,
  };
  return {
    content: `pre-eval failure: ${code}`,
    display: true,
    details: { diagnostics: [diagnostic] },
  };
}

describe("V4e-T — load-time pre-evaluation failure routing", () => {
  it("ERR-1: a host-incompatible pre-eval failure routes onto theta-system-note without firing a turn", () => {
    // ERR-1: host-incompatibility detected by the capability probe (V9a)
    // surfaces `theta/load/host-incompatible`; it MUST route pre-eval, never
    // firing a turn.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "capability-probe",
      diagNote("theta/load/host-incompatible"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.customType).toBe("theta-system-note");
    // The routing never fires a turn (ERR-1: `triggerTurn:false`).
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-2: a lex/parse/type failure routes pre-eval with triggerTurn:false", () => {
    // ERR-2: lex / parse / type batches route pre-eval.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "lex-parse-type",
      diagNote("theta/parse/unterminated-template"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-3: a frontmatter failure routes pre-eval with triggerTurn:false", () => {
    // ERR-3: frontmatter rejection (V6a) surfaces e.g. `theta/load/missing-mode`.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure("frontmatter", diagNote("theta/load/missing-mode"));

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-4: a binder-model resolution failure routes pre-eval with triggerTurn:false", () => {
    // ERR-4: binder-model resolution failure (V11a) surfaces
    // `theta/load/binder-model-unresolved`.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "binder-model",
      diagNote("theta/load/binder-model-unresolved"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-5: a binder arg-binding failure (ceiling #3) routes pre-eval with triggerTurn:false", () => {
    // ERR-5: binder argument-binding failure (hard ceiling #3, V11f) surfaces a
    // rendered binder system-note; it routes pre-eval, never an evaluation
    // outcome (excluded from the success/fail/cancelled trichotomy).
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    const note: SystemNote = {
      content: "theta /demo: argument binding failed — could not parse arguments",
      display: true,
      details: { event: { kind: "ceiling", surfaced: "ceiling#3" } },
    };
    router.routePreEvalFailure("binder-arg-binding", note);

    const routed = onlyNote(sendMessage);
    expect(routed.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(routed.triggerTurn).toBe(false);
  });

  it("ERR-6: a tools: resolution failure routes pre-eval with triggerTurn:false", () => {
    // ERR-6: `tools:` resolution failure (V10a/V6a) surfaces e.g.
    // `theta/load/unknown-tool`.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "tools-resolution",
      diagNote("theta/load/unknown-tool"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-16: the slash-load params arm of ceiling #4, cross-routed via CIO-1 / ceiling #3 no-retry, routes pre-eval with triggerTurn:false and omits masked", () => {
    // ERR-16: the slash-load `params` arm of ceiling #4, cross-routed through
    // ceiling #3's no-retry classification per CIO-1. The breach is detected and
    // the row rendered at the boundary that owns it — ceiling #4's depth walk at
    // the post-default-merge AJV validation hook, whose AJV-on-`args` class
    // renders the row below — and the assembled note routes pre-eval here,
    // never becoming an evaluation outcome.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    const crossRoute: SystemNote = {
      content:
        "theta /demo: argument binding produced invalid args — /a/b/c/d/e JSON document depth exceeds 5",
      display: true,
      // PIC-1 (c): this site's reachable `masked` domain is EMPTY. The
      // originating ceiling is recoverable from the rendered note's
      // `<ajv-summary>`, so the cross-route surfaces ceiling #3 alone.
      details: { event: { kind: "ceiling", surfaced: "ceiling#3" } },
    };
    router.routePreEvalFailure("slash-load-params", crossRoute);

    // Primary assertion — the cross-route note routes pre-eval onto the
    // theta-system-note channel with `triggerTurn:false`, never firing a turn.
    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);

    // PIC-1 (b)/(c) — `masked` is absent, not `[]`, at a site whose reachable
    // mask domain is empty.
    const details = note.details as { readonly event: Record<string, unknown> };
    expect(details.event["surfaced"]).toBe("ceiling#3");
    expect("masked" in details.event).toBe(false);
  });

  it("ERR-1…ERR-6/ERR-16: every load-time cause routes onto theta-system-note (no cause becomes an evaluation outcome)", () => {
    // Exercise every diagnostic-batch cause through the one routing surface:
    // each MUST surface exactly one theta-system-note carrying
    // `triggerTurn:false`, so no cause ever fires a turn or becomes an
    // evaluation Failure.
    const cases: ReadonlyArray<readonly [PreEvalFailureCause, string]> = [
      ["capability-probe", "theta/load/host-incompatible"],
      ["lex-parse-type", "theta/parse/unterminated-template"],
      ["frontmatter", "theta/load/missing-mode"],
      ["binder-model", "theta/load/binder-model-unresolved"],
      ["tools-resolution", "theta/load/unknown-tool"],
    ];
    for (const [cause, code] of cases) {
      const { channel, sendMessage } = recordingChannel();
      const router = createLoadFailurePreEvalRouter({ channel });

      router.routePreEvalFailure(cause, diagNote(code));

      const note = onlyNote(sendMessage);
      expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
      expect(note.triggerTurn).toBe(false);
    }
  });

  // Bug 0109 finding 1 (widened by bug 0108 §Fix Residual 2 with a third code).
  //
  // WHAT THIS PINS: `preEvalCauseOf` (`src/extension/production-composition.ts`)
  // maps a shipped load-path diagnostic code to the ERR-1…ERR-6 pre-evaluation
  // failure cause it realises. The eleven codes named below (registry rows
  // `code-registry-load.md:13`, `:25`–`:33`, `:41`) map to ERR-6
  // `tools-resolution`: the eight ENTRY-family codes emitted by
  // `resolveCallableSet` (`src/parser/callable-set.ts`) —
  // `malformed-tool-entry`, `invalid-tool-rename`, `invalid-derived-tool-name`,
  // `invalid-pi-tool-name`, `tool-name-collision`, `unknown-tool`,
  // `unresolvable-theta-path`, `prompt-mode-callable` — plus the
  // `tools:`-surface `theta/load/callee-has-errors` pushed by
  // `checkCalleeHasErrors` with `surface: "tools"` in
  // `production-composition.ts` — nine codes in all.
  //
  // The family boundary is the `tools:` surface, not the entry granularity, so
  // two further codes belong beside the nine codes above: the FIELD-shape
  // rejection `theta/load/malformed-tools-field`, which refuses a declared
  // `tools:` field whose value is neither admitted spelling
  // (`src/parser/frontmatter.ts:1372-1381`, bug 0104), and the PIC-64 rung-3
  // refusal `theta/load/extension-tool-unreachable`, which
  // `checkExtensionToolReachability`
  // (`src/extension/extension-tool-reachability.ts:212-231`) raises only for
  // names in the theta's callable set — i.e. only for `tools:` entries.
  //
  // NOT NAMED BELOW: `theta/load/invoke-path-escape` (registry row
  // `code-registry-load.md:35`) also triggers on a `tools:` `.theta` entry, so
  // it too reaches `preEvalCauseOf` from the `tools:` surface, but it maps to
  // ERR-3 `frontmatter` here (the `theta/load/` fall-through arm). This code's
  // FN-7-list absence is what bug 0260 §Non-goals leaves where it stands; its
  // ERR-3 classification here is untouched because bug 0260's settled §Fix
  // names exactly the two codes above and does not reclassify it.
  //
  // WHAT THIS CANNOT PIN: this table restates the eleven-code `tools:`-surface
  // family rather than deriving it from source, so it reds (proven by
  // mutation) when any code ALREADY LISTED here diverges from the batch, but
  // it cannot red on a resolver code added to `callable-set.ts` and to the
  // registry yet never added to this table — a source-derived family gate is
  // open bug 0107's axis, outside bug 0109's settled §Fix.
  //
  // WHY A DIRECT-CALL CELL: the mapping has no routable observable.
  // `routePreEvalFailure` (`src/extension/load-pre-eval.ts`) discards its cause
  // argument (`void cause;`) and delivers every cause over the one
  // `theta-system-note` surface with the same fixed options, so a `tools:` code
  // misclassified as ERR-3 `frontmatter` produces a byte-identical note. The
  // cell therefore asserts `preEvalCauseOf` itself; the function is pure and
  // total on `string`, so nothing else can witness the divergence.
  //
  // The three non-`tools:` rows are guards: `theta/load/missing-mode` MUST stay
  // ERR-3 `frontmatter` (reds if the batch is over-widened into the ERR-3 arm),
  // `theta/load/host-incompatible` ERR-1, `theta/load/binder-model-unresolved`
  // ERR-4, and one `theta/parse/` code the ERR-2 `lex-parse-type` arm.
  //
  it("ERR-6: preEvalCauseOf maps the eleven tools:-surface codes named below to tools-resolution (bug 0109 finding 1, bug 0260)", () => {
    const rows: ReadonlyArray<{
      readonly code: string;
      readonly cause: PreEvalFailureCause;
    }> = [
      // The eleven `tools:`-surface codes → ERR-6, in registry order
      // (`docs/spec_topics/diagnostics/code-registry-load.md`).
      {
        code: "theta/load/extension-tool-unreachable",
        cause: "tools-resolution",
      },
      { code: "theta/load/malformed-tool-entry", cause: "tools-resolution" },
      { code: "theta/load/malformed-tools-field", cause: "tools-resolution" },
      { code: "theta/load/unknown-tool", cause: "tools-resolution" },
      { code: "theta/load/unresolvable-theta-path", cause: "tools-resolution" },
      { code: "theta/load/prompt-mode-callable", cause: "tools-resolution" },
      { code: "theta/load/tool-name-collision", cause: "tools-resolution" },
      { code: "theta/load/invalid-tool-rename", cause: "tools-resolution" },
      { code: "theta/load/invalid-derived-tool-name", cause: "tools-resolution" },
      { code: "theta/load/invalid-pi-tool-name", cause: "tools-resolution" },
      { code: "theta/load/callee-has-errors", cause: "tools-resolution" },
      // Guards on the neighbouring arms.
      { code: "theta/load/host-incompatible", cause: "capability-probe" },
      { code: "theta/load/binder-model-unresolved", cause: "binder-model" },
      { code: "theta/load/missing-mode", cause: "frontmatter" },
      { code: "theta/parse/unterminated-template", cause: "lex-parse-type" },
    ];

    for (const { code, cause } of rows) {
      // `expect.soft` so one run's red names every offending code, not just the
      // first: the defect class is a batch that omits several members at once.
      expect.soft(preEvalCauseOf(code), code).toBe(cause);
    }
  });
});
