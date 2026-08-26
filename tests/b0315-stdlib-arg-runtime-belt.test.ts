import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaDocument } from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isThetaPanic, surfaceUnexpectedThrow } from "../src/runtime/runtime-panics";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0315 — the RUNTIME belt witness (laundered receiver).
//
// The parse-layer arity check the design brief adds
// (`.pi/tmp/fixes/0315-design-brief.md`, exercised by
// tests/b0315-stdlib-arg-surface.test.ts) fires only for a STATICALLY-
// RESOLVABLE built-in receiver — a laundered receiver (a method call on a
// statically-unresolvable value, e.g. an unannotated `fn` parameter) is
// deliberately admitted at parse (bug 0315 §Non-goals / the deferral
// `checkMethodCall` documents). The residue is closed by a runtime belt in the
// three dispatchers (`evaluateStringMember` / `evaluateArrayMember` /
// `evaluateObjectMember`): a `StdlibMethodArgumentDefectError` thrown when
// `args.length` is outside the member's arity, INSTEAD of the current unchecked
// `args[0] as …` cast (src/runtime/stdlib-string.ts:73 etc.). The defect routes
// through the existing `surfaceUnexpectedThrow` → `theta/runtime/internal-error`
// surface, exactly as `QuestionOperandDefectError` (bug 0019) does.
//
// FIXTURE — `fn f(x) { return x.replace("-") }` applied to `"a-b"`. The receiver
// `x` is an unannotated parameter, so `classifyReceiver` answers `"unknown"` and
// `checkMethodCall` defers: the theta is parse-clean today AND after the fix
// (the belt, not the parse layer, is the subject here). At HEAD the call
// RESOLVES to the JS-coerced `"aundefinedb"` (`"a" + undefined + "b"` via
// `replaceLiteral`, src/runtime/stdlib-string.ts:118). After the fix the
// dispatcher belt throws the arity defect, so the drive no longer resolves with
// the silently-corrupted value.
//
// TIER — unit, offline, provider-free, deterministic (default `npm test`). The
// belt fires inside `executeBody` over the in-process production prompt-mode
// binding — a query-free body dispatches no model. An integration or live tier
// would put a session round-trip or a stochastic model between the fixture and
// the throw for no added observable.
//
// HARNESS — the production-executor `run`/`disposition` shape of
// tests/enum-shadow-member-type.test.ts's (r) group: `parseThetaDocument` →
// `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`,
// capturing a throw and classifying it through the runtime-defect surface
// `surfaceUnexpectedThrow` (the same surface the top-level slash catch feeds
// the belt defect into). GENUINELY RED AT HEAD: today the drive RESOLVES with
// `"aundefinedb"`, so the "does not resolve corrupted" and "threw" assertions
// both red on the measured buggy outcome — never a silent pass (mirrors bug
// 0019's `expectQuestionDefect` "must NOT resolve with a silently-corrupted
// outcome").

// Sourced inline (design brief: NO new runtime registry code — the belt reuses
// the existing runtime-defect surface).
const INTERNAL_ERROR = "theta/runtime/internal-error";

const FM = "---\nmode: prompt\n---\n";

/** The laundered-receiver belt fixture: parse-clean today and after the fix. */
const BELT_BODY = 'fn f(x) { return x.replace("-") }\nlet y = f("a-b")\ny';

// ===========================================================================
// Harness.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** The site `surfaceUnexpectedThrow` frames a non-panic throw against. */
const SITE = {
  file: "b0315.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/** One drive's disposition — refused by the load, evaluated, or thrown out of. */
type Run =
  | { readonly kind: "refused"; readonly doc: ThetaDocument }
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

async function run(body: string): Promise<Run> {
  const doc = parseDoc(FM + body, "b0315.theta");
  if (errors(doc.diagnostics).length > 0) {
    return { kind: "refused", doc };
  }
  const theta: ThetaCompositionInput = {
    slashName: "b0315",
    sourcePath: "/theta/b0315.theta",
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

/** A drive's disposition as one comparable string (names the arrived value in a red). */
function disposition(r: Run): string {
  if (r.kind === "refused") {
    return `REFUSED AT PARSE — ${errors(r.doc.diagnostics).map((d) => d.code).join(", ")}`;
  }
  if (r.kind === "value") {
    return `LOADED AND RAN — outcome=${r.execution.outcome}, value=${JSON.stringify(r.execution.result.value)}`;
  }
  if (isThetaPanic(r.thrown)) {
    const panic = r.thrown as { readonly code: string; readonly message: string };
    return `LOADED AND PANICKED — ${panic.code}: ${panic.message}`;
  }
  const diag = surfaceUnexpectedThrow(r.thrown, SITE);
  return `LOADED AND THREW — ${String(diag?.code)}: ${String(diag?.message)}`;
}

// ===========================================================================
// The belt witness.
// ===========================================================================

describe("bug 0315 — the runtime dispatcher belt closes the laundered-receiver residue", () => {
  it("`fn f(x) { return x.replace(\"-\") }` applied to \"a-b\" throws an internal-error defect, not \"aundefinedb\"", async () => {
    const r = await run(BELT_BODY);

    // The bug's symptom, named exactly: today the laundered-receiver `replace`
    // call resolves to `"a" + undefined + "b"`. Post-fix the belt fires, so the
    // drive must not resolve with that silently-corrupted value.
    expect(
      disposition(r),
      "the belt must fire on the wrong-arity call — at HEAD the laundered-receiver " +
        '`replace("-")` resolves to the JS-coerced "aundefinedb" (bug 0315 §Reproduction P2a)',
    ).not.toContain("aundefinedb");

    // The defect propagates out of `executeBody` as a throw (mirrors bug 0019's
    // `QuestionOperandDefectError`), which the runtime-defect surface classifies.
    expect(
      r.kind,
      `the belt defect must abort the drive (a throw), not resolve — disposition: ${disposition(r)}`,
    ).toBe("threw");

    const thrown = (r as { readonly thrown: unknown }).thrown;
    expect(
      isThetaPanic(thrown),
      "the belt defect is a plain defect Error routed to the runtime-defect surface, not one of the six closed panics",
    ).toBe(false);

    const diag = surfaceUnexpectedThrow(thrown, SITE);
    expect(
      diag?.code,
      `the belt defect routes through surfaceUnexpectedThrow to ${INTERNAL_ERROR} (design brief: reuses the existing runtime-defect surface)`,
    ).toBe(INTERNAL_ERROR);
    expect(
      diag?.message,
      "the belt message names the offending stdlib method",
    ).toMatch(/replace/);
    expect(
      diag?.message,
      "the belt message names the arity defect (arguments / arity)",
    ).toMatch(/argument|arity/i);
  });

  it("CONTROL: `fn f(x) { return x.replace(\"-\", \"+\") }` applied to \"a-b\" still resolves to \"a+b\"", async () => {
    // The no-false-positive pin: a CORRECT-arity call on the same laundered
    // receiver must pass through the belt untouched and keep its value. Green
    // now AND after the fix (design brief: the belt fires ONLY on genuine arity
    // mismatch; correct-arity calls on statically-deferred receivers are
    // untouched).
    const r = await run('fn f(x) { return x.replace("-", "+") }\nlet y = f("a-b")\ny');
    expect(r.kind, `a correct-arity laundered call must resolve, not throw — disposition: ${disposition(r)}`).toBe(
      "value",
    );
    const execution = (r as { readonly execution: BodyExecution }).execution;
    expect(execution.outcome, "the correct-arity call succeeds").toBe("success");
    expect(execution.result.value, "`\"a-b\".replace(\"-\", \"+\")` is `\"a+b\"`").toBe("a+b");
  });
});
