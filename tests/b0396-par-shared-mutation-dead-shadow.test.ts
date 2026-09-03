// Bug 0396 — the CTRL-4 `par-shared-mutation` scan's `bodyLocals` set leaks out
// of nested `if`/`while`/`for` statement blocks, so a DEAD block-scoped
// `let mut x` masks the refusal of a LATER outer write in the same body:
// `par for i in [1,2] { if true { let mut x = 9 } x = 5 }` loads clean and the
// write LANDS on the outer `let mut x` under concurrent workers.
// (docs/bugs/0396-par-shared-mutation-scan-masked-by-dead-shadow.md)
//
// ROOT CAUSE (verified against the tree as it stands):
//   `scanParForBlock` (`src/parser/theta-document.ts`) threads ONE mutable
//   `bodyLocals` Set through the whole body walk. The `let` arm of
//   `scanParForStmt` adds names to it (`bodyLocals.add(s.name)`) and never
//   removes them, and the reassign arm admits a write iff the target is
//   body-local (`outerMutables.has(s.target) && !bodyLocals.has(s.target)`). The
//   nested-statement-block arms — `if` then/else, `while`, `for` — recurse with
//   the SAME set, so a `let` declared in a nested block persists into sibling
//   statements after the block closes and defeats the second conjunct. The
//   block-EXPRESSION arm (`scanParForExpr`'s `case "block"`) already passes
//   `new Set(bodyLocals)` — its comment names the exact hazard ("a COPY of
//   `bodyLocals` keeps them from masking a sibling's shared-mutation refusal") —
//   so E6 refuses while E1/E3/E5 do not. Runtime belt: a `par for` iteration
//   scope (`runParForIteration`, `src/runtime/statement-executor.ts`) binds via
//   `bindIterationVariable`, which carries no write boundary — `writeBinding`
//   (`src/runtime/lexical-environment.ts`) stops only at `fnActivationBoundary`
//   (bug 0370) — so the masked write walks out of the iteration onto the outer
//   slot.
//
// EXPECTED (CTRL-4, `docs/spec_topics/control-flow.md`): "assignment to a
// `let mut` declared
// outside the body is `theta/parse/par-shared-mutation`." A block-scoped `let`
// that is OUT OF SCOPE at the write site cannot make the write body-local — the
// runtime proves the point by landing the write on the outer binding. So E1/E3/
// E5 must draw `par-shared-mutation` at parse exactly as E2/E4/E6 do, and no
// runtime layer may let the masked write mutate the outer binding.
//
// TIER: unit, offline, provider-free, deterministic — the sibling b0370 shape
// (parseThetaDocument → createProductionProducerDeps → bindPromptConversation →
// executeBody). Every parse verdict settles inside one `parseThetaDocument` over
// a string; the runtime-belt witness settles inside one `executeBody` over the
// produced AST. No seam here needs a provider, a child process, or a discovery
// round trip, so neither an integration nor a live tier could reach a decision
// this tier cannot: the CTRL-4 scan is pure parse-time analysis and the belt is
// a pure `LexicalEnvironment` write walk.
//
// ASSERTION CONTRACT: parse rows assert the AGGREGATED error-severity
// `.diagnostics` CODES (the stable registry-owned contract, the b0370 house
// pattern), never the message prose. The runtime-belt row asserts the OUTER
// binding's final value via the body tail `x` (the robust observable named in
// the bug's §Fix); it does NOT over-assert the aggregate par-for outcome shape.
//
// RED WITNESSES: E1/E3/E5 parse cells (HEAD `[]`, spec `[par-shared-mutation]`)
// and the E1 runtime cell (HEAD outer `x` = 5, spec outer `x` = 0). CONTROLS
// (E2/E4/E6/BODYLOCAL/PLAINFOR) are byte-identical fork/post-fix — GREEN now and
// after; a control red means the harness drifted, not the fix.
//
// NO SILENT SKIPPING: the runtime cells demand a value probe; a throw fails
// loudly naming the unmet precondition rather than early-returning.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";

const FM = "---\nmode: prompt\n---\n";

// ===========================================================================
// Shared parse + run harness (the b0370 shape, verbatim). No test internals are
// imported — the harness is reconstructed from the production entry points.
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: "b0396.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/** The aggregated error-severity diagnostic codes, sorted so the assertion is
 *  order-independent (the stable registry-owned contract). */
function codesOf(src: string): string[] {
  return parseOnly(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // (the b0370 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/**
 * Bind + run a self-contained prompt-mode body, capturing a throw. `gate`
 * controls the parse precondition: a value control demands a clean parse (a
 * rejection is a harness breach, failed loudly); the `runtime-only` gate ignores
 * parse diagnostics and drives `executeBody` over the produced AST — the E1
 * belt witness needs it because E1 parses `[]` at HEAD and `[par-shared-mutation]`
 * post-fix, and the belt observable is the runtime landing regardless of parse.
 */
async function probeSource(src: string, gate: "parse-clean" | "runtime-only"): Promise<Probe> {
  const doc = parseOnly(src);
  if (gate === "parse-clean") {
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
      );
    }
  }
  const theta: ThetaCompositionInput = {
    slashName: "b0396",
    sourcePath: "/proj/b0396.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

/** Drive a body and return the OUTER binding's final value via the body tail
 *  `x`. A throw fails loudly naming the unmet precondition — never a silent
 *  skip. The aggregate par-for outcome shape is deliberately NOT asserted (the
 *  bug's §Fix pins only the outer binding's value); the value is read off a
 *  successful execution's tail. */
async function tailValueOf(src: string, gate: "parse-clean" | "runtime-only", what: string): Promise<ThetaValue | undefined> {
  const probe = await probeSource(src, gate);
  if (probe.kind === "threw") {
    throw new Error(`${what}: expected a value probe carrying the outer binding's tail value, but the drive threw: ${String(probe.thrown)}`);
  }
  return probe.execution.result.value;
}

// ===========================================================================
// Fixture bodies (byte-identical to the bug's §Reproduction rows). Each body
// ends in a tail `x` reading the OUTER `let mut x`, so a masked write that lands
// is visible as that tail value.
// ===========================================================================

// E1/E3/E5 — a DEAD block-scoped `let mut x` inside a nested if / for / while
// masks the CTRL-4 refusal of the LATER outer write `x = 5`.
const E1 = "let mut x = 0\npar for i in [1, 2] { if true { let mut x = 9 }\nx = 5 }\nx";
const E3 = "let mut x = 0\npar for i in [1, 2] { for j in [1] { let mut x = 9 }\nx = 5 }\nx";
const E5 = "let mut x = 0\npar for i in [1, 2] { while false { let mut x = 9 }\nx = 5 }\nx";

// E2/E4/E6 — CONTROLS that refuse byte-identically at HEAD and post-fix.
// E2: the bare outer write. E4: the write BEFORE the shadow (the leak is
// file-linear). E6: the block-EXPRESSION arm that ALREADY copies the set.
const E2 = "let mut x = 0\npar for i in [1, 2] { x = 5 }\nx";
const E4 = "let mut x = 0\npar for i in [1, 2] { x = 5\nif true { let mut x = 9 } }\nx";
const E6 = "let mut x = 0\npar for i in [1, 2] { let d = { let mut x = 9\n1 }\nx = 5 }\nx";

// BODYLOCAL — a genuine body-level `let mut acc` written later in the SAME body
// scope stays admitted (the fix must not turn this into a false refusal).
const BODYLOCAL = "par for i in [1, 2] { let mut acc = 0\nif true { acc = 1 }\nacc }\n1";

// BODYLOCAL_RUN — same body shape as BODYLOCAL, but the tail binds the par-for
// RESULT to `r` instead of discarding it, so the per-iteration values are the
// observable. This is the belt's ACCEPT-direction witness: `parIterationBoundary`
// (`writeBinding`, `src/runtime/lexical-environment.ts`) must stop the write
// walk-out for an OUTER target while still letting a genuine body-local write
// land inside its own iteration. If that stop were ever checked ahead of the
// same-env slot check, this body-local write would misfire as a boundary
// rejection too, and each element would degrade from `Ok(1)` to an
// `internal_error` Err — no other cell here would catch that regression.
const BODYLOCAL_RUN = "let r = par for i in [1, 2] { let mut acc = 0\nif true { acc = 1 }\nacc }\nr";

// PLAINFOR — the E1 shape under a plain (non-par) `for`: outer writes are legal
// outside `par for` and must keep landing; the belt must not touch plain loops.
const PLAINFOR = "let mut x = 0\nfor i in [1, 2] { if true { let mut x = 9 }\nx = 5 }\nx";

const PAR_SHARED = "theta/parse/par-shared-mutation";

// ===========================================================================
// RED WITNESSES — a dead nested-block shadow masks the CTRL-4 refusal at parse.
// HEAD draws `[]` (the leaked `let mut x` defeats `!bodyLocals.has(s.target)`);
// the §Fix passes `new Set(bodyLocals)` into the three statement-block arms
// (`if`/`while`/`for`) so the dead shadow no longer masks — draws
// `[par-shared-mutation]`. Written to the POST-FIX contract, so RED now.
// ===========================================================================

describe("bug 0396 RED — a dead nested-block `let mut x` must not mask the CTRL-4 refusal", () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    ["E1 (nested if)", E1, "the shadow sits in a nested `if` then-block whose arm shares the set"],
    ["E3 (nested for)", E3, "the shadow sits in a nested plain `for` block whose arm shares the set"],
    ["E5 (nested while)", E5, "the shadow sits in a nested `while` block whose arm shares the set"],
  ];
  for (const [id, src, why] of rows) {
    it(`RED (${id}): draws [par-shared-mutation] — HEAD leaks the dead shadow and draws []`, () => {
      expect(
        codesOf(src),
        `${id}: the write assigns an outer \`let mut\` from a par-for body; ${why}; CTRL-4 refuses it`,
      ).toEqual([PAR_SHARED]);
    });
  }
});

// ===========================================================================
// CONTROLS — refusals byte-identical fork/post-fix (regression guards). E2/E4/E6
// draw `[par-shared-mutation]` at HEAD and must keep drawing it after the fix.
// E6 is the load-bearing control: its block-EXPRESSION shadow already copies the
// set, so it refuses today — the whole defect is that the three
// statement-block arms do not copy. If E6 reds post-fix the fix over-reached.
// ===========================================================================

describe("bug 0396 CONTROL — genuine par-shared-mutation refusals stay byte-identical", () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    ["E2 (bare write)", E2, "the plain outer write, no shadow at all"],
    ["E4 (write before shadow)", E4, "the write precedes the shadow — the leak is strictly file-linear"],
    ["E6 (block-expression shadow)", E6, "the shadow is a `let`-initialiser block EXPRESSION — the arm that ALREADY copies"],
  ];
  for (const [id, src, why] of rows) {
    it(`CONTROL (${id}): [par-shared-mutation] at HEAD and post-fix — ${why}`, () => {
      expect(codesOf(src), `${id}: ${why}; byte-identical refusal guard`).toEqual([PAR_SHARED]);
    });
  }
});

// ===========================================================================
// CONTROL — a genuine body-level local stays admitted. `acc` is declared at body
// depth (in the shared set) BEFORE its write, so the write is legitimately
// body-local; the fix (which only copies the set into nested blocks) must not
// turn this into a false refusal. GREEN now and after.
// ===========================================================================

describe("bug 0396 CONTROL — a genuine body-level local write stays admitted", () => {
  it("CONTROL (BODYLOCAL): a body-depth `let mut acc` written later draws [] — must not become a false refusal", () => {
    expect(
      codesOf(BODYLOCAL),
      "BODYLOCAL: `acc` is declared at body depth before the write, so the write is legitimately body-local",
    ).toEqual([]);
  });
});

// ===========================================================================
// CONTROL — plain (non-par) `for` is unaffected. The E1 shape under a plain
// `for` has no shared-mutation restriction: outer writes are legal and must keep
// landing (parse [], the outer `x` ends at 5). Neither the parse scan nor the
// runtime belt may touch plain loops. GREEN now and after.
// ===========================================================================

describe("bug 0396 CONTROL — plain (non-par) `for` outer writes stay legal and land", () => {
  it("CONTROL (PLAINFOR parse): the plain-for E1 shape parses [] — no par-shared-mutation scan applies", () => {
    expect(
      codesOf(PLAINFOR),
      "PLAINFOR: a plain `for` carries no CTRL-4 shared-mutation restriction",
    ).toEqual([]);
  });

  it("CONTROL (PLAINFOR runtime): the outer write lands — tail `x` = 5 at HEAD and post-fix", async () => {
    const value = await tailValueOf(PLAINFOR, "parse-clean", "PLAINFOR runtime");
    expect(
      value,
      "PLAINFOR runtime: a plain-for outer write is legal; the belt must NOT touch plain loops",
    ).toEqual(5);
  });
});

// ===========================================================================
// RED WITNESS — the runtime belt. Driven `runtime-only` (E1 parses [] at HEAD),
// `executeBody` runs the par-for body: the masked `x = 5` walks out of the
// iteration scope (no write boundary there — `runParForIteration` binds via
// `bindIterationVariable`, and `writeBinding` stops only at
// `fnActivationBoundary`) and LANDS on the outer binding, so the tail `x`
// reads 5. The §Fix's runtime belt marks the iteration scope a write boundary so
// the cross-boundary write is rejected and the outer `x` stays 0. Written to the
// POST-FIX value (0), so RED now (reads 5). The observable is the OUTER binding's
// final value only — the aggregate par-for outcome shape is not asserted.
// ===========================================================================

describe("bug 0396 RED — the masked write must not land on the outer binding at runtime", () => {
  it("RED (E1 runtime belt): outer `x` stays 0 — HEAD lands the masked write and reads 5", async () => {
    const value = await tailValueOf(E1, "runtime-only", "E1 runtime belt");
    expect(
      value,
      "E1 runtime belt: the dead-shadow-masked write crosses the par-for iteration boundary and mutates the shared outer `let mut x` (data race under concurrent workers); CTRL-4 forbids it landing",
    ).toEqual(0);
  });
});

// ===========================================================================
// GREEN — the belt's ACCEPT direction. A body-local write (`acc`, declared and
// written inside the SAME iteration, never crossing `parIterationBoundary`)
// must still land inside its own iteration and produce `Ok(1)`, not degrade to
// an `internal_error` Err. No other cell in this file drives a body-local
// write through `executeBody` and inspects the per-iteration result, so a
// `parIterationBoundary` stop reordered ahead of the same-env slot check in
// `writeBinding` would pass every existing cell here while reading `Err` on
// this one.
// ===========================================================================

describe("bug 0396 GREEN — the belt's accept direction: a body-local write lands inside its own iteration", () => {
  it("GREEN (BODYLOCAL_RUN): each iteration's result is Ok(1) — the boundary stop must not reject a same-env write", async () => {
    const value = await tailValueOf(BODYLOCAL_RUN, "parse-clean", "BODYLOCAL_RUN belt accept-direction");
    expect(
      value,
      "BODYLOCAL_RUN belt accept-direction: `acc` is written inside its own iteration scope, never crossing the `parIterationBoundary` write boundary; a boundary reordered ahead of the same-env slot check would misclassify this as a cross-boundary write and downgrade the element to an `internal_error` Err",
    ).toEqual([
      { ok: true, value: 1 },
      { ok: true, value: 1 },
    ]);
  });
});
