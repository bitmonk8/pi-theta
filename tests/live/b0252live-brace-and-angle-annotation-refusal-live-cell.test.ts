// H8a live witness — bug 0252: `annotationSourceIsNotTypeExpression`
// (src/parser/type-layer-checks.ts) declined — admitted without judging — any
// `let` annotation text carrying BOTH a brace and an angle bracket, so junk
// each half of that conjunct refuses on its own loaded clean when both
// characters appeared. `let y: {a: integer, b > c, m: integer} = …` drew an
// EMPTY diagnostic list, the theta REGISTERED, and the interior then declined
// whole in `letAnnotationToCompatType` to a deferring nominal, withholding
// `theta/parse/let-rhs-type-mismatch` and
// `theta/parse/reassign-rhs-type-mismatch` on that binding with nothing on any
// channel
// (docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md).
//
// §Fix ROUTE (a), NARROWED TO THE AUTHOR-WRITTEN BRACE GROUP. A
// brace-and-angle text that is not a single enclosing brace group
// (`isSingleEnclosingBraceGroup`, src/parser/params.ts) keeps bug 0124's SHRED
// decline; a text that IS one is a group no split here cuts, so a kind-matched
// scan of it (`braceGroupCarriesUnmatchedCloseToken`, same module as the
// recogniser) refuses a close token that closes nothing or closes the wrong
// kind, and everything else reaches the shared refusable-text sink unchanged.
// The route mints no diagnostic code and moves no registry row's identity.
// CITED BY SYMBOL, NEVER BY LINE: bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// stale-citation class for absolute line numbers into the files this route
// edits.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/brace-and-angle-annotation-junk-refusal.test.ts` pins the diagnostic
// bytes at the `parseThetaDocument` boundary. This route moves a REGISTRATION
// outcome — every §Reproduction (A), (B) and (C) row registers at HEAD and
// refuses after — and no offline cell observes the real
// discovery → load → `pi.registerCommand` path deciding it. That is the live
// cell §Fix's "Witness" clause owes ("A live cell is owed if the route changes
// a registration outcome"). It runs through the shipped production composition
// root (`bootShippedExtension`, ./harness), the same path the sibling
// standalone cells `tests/live/inline-object-stray-close-token-live-cell.test.ts`
// and `tests/live/reassign-rhs-type-mismatch-live-cell.test.ts` use.
//
// THREE PARTS:
//   (1) OFFENDER — a theta whose `let` annotation is the brace-and-angle junk
//       behind the former exemption (`{a: integer, b > c, m: integer}`) must be
//       ABSENT from the registered set: the refusal is error-severity
//       `theta/parse/*`, and `hasLoadParseError`
//       (src/extension/production-composition.ts) then withholds registration.
//       At HEAD this theta registers, which is the class itself.
//   (2) CONTROL — the byte-neighbour whose annotation drops the junk entry and
//       is otherwise the same file (`{a: integer, m: integer}`, the same two
//       declared fields, the same `params:`, the same body). It must REGISTER
//       and drive a REAL turn, so the offender's absence is bounded to the junk
//       rather than to the inline-object annotation, the `params:` field or the
//       binder.
//   (3) A precondition control (`b0252livectl`) — an ordinary `mode: prompt`
//       theta in the same workspace, registration-only, so a missing
//       registration above cannot be misattributed to a broken workspace.
//
// SENTINEL DISCIPLINE: the control's drive discriminator is the ANSWER to the
// theta's own arithmetic question over the two INTERPOLATED bound values
// (19 * 27 = 513) — never a "reply with exactly this string" echo, which
// current models read as prompt injection (AGENTS.md; bug 0243). 513 is
// computable only from values that actually reached the rendered body, so the
// drive proves a real turn ran over a real bind.
//
// SUBAGENT CHILD PINS: not reached — every theta below is `mode: prompt` with
// no `tools:` and no `invoke(...)`, so no RFC-0006 child launches. The shared
// harness (./harness) sets BOTH #subagent-child-pins plus the parent-pid
// carriage at module scope regardless, which importing it inherits.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips,
// and every registration assertion carries the registered set in its message.
//
// OFFLINE ATTRIBUTION GUARD: the diagnostic block runs BEFORE the live host is
// required, so a neutralised fix reds here with zero tokens spent.
//
// Token cost: one live drive (one binder pass plus one body turn).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { parseDoc } from "../helpers/e2e-s1";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

const NOT_TYPE_EXPR = "theta/parse/annotation-type-not-expression";

/**
 * The refusal's normative *Message* (DIAG-4) with its `<name>` placeholder
 * filled. Sourced from the registry rather than transcribed, so a reworded row
 * reds by naming the registry instead of by a stale string comparison.
 */
function refusalLine(binder: string): string {
  const template = registryMessage(REGISTRY, NOT_TYPE_EXPR) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${NOT_TYPE_EXPR}`,
  ).toBeDefined();
  const text = template as string;
  expect(
    text,
    `DIAG-4: the ${NOT_TYPE_EXPR} Message template must carry the <name> placeholder; template=${JSON.stringify(template)}`,
  ).toContain("<name>");
  return `error ${NOT_TYPE_EXPR}: ${text.replace("<name>", binder)}`;
}

/** The two declared values the slash argument names; their product is the oracle. */
const A_VALUE = 19;
const M_VALUE = 27;
/** 19 * 27 — computable only from values that BOTH reached the rendered body. */
const PRODUCT = String(A_VALUE * M_VALUE);

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0252LIVE-BOUND";

/** The `let` binder the refusal names. */
const BINDER = "y";

const PRECONDITION_STEM = "b0252livectl";
const CONTROL_STEM = "b0252livecontrol";
const OFFENDER_STEM = "b0252liveoffender";

/**
 * One theta over a `params:`-supplied object value, differing ONLY in the `let`
 * annotation text. The value comes from `params:` rather than from a literal so
 * the CONTROL's annotation is satisfied and the control registers — a literal
 * initialiser would draw `theta/parse/let-rhs-type-mismatch` and withhold the
 * control's registration for a reason that is not this bug.
 *
 * The body interpolates both bound fields behind a committed marker and then
 * asks for their product, so the drive carries two independent observables: the
 * deterministic outbound render (`userTexts`) and the model's arithmetic answer.
 */
function annotatedLetTheta(annotation: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: '{a: integer, m: integer}'",
    "---",
    `let ${BINDER}: ${annotation} = p`,
    "@`" +
      BODY_MARKER +
      " a=${" +
      BINDER +
      ".a} m=${" +
      BINDER +
      ".m}. What is ${" +
      BINDER +
      ".a} times ${" +
      BINDER +
      ".m}? Answer with the number only.`",
    "",
  ].join("\n");
}

/** §Reproduction row A2 — the stray depth-0 `>` between the two declared fields. */
const OFFENDER = annotatedLetTheta("{a: integer, b > c, m: integer}");

/** The byte-neighbour control: the same annotation without the junk entry. */
const CONTROL = annotatedLetTheta("{a: integer, m: integer}");

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");

/** The slash argument naming both values in natural language (the binder's input). */
const SLASH_ARG = ` a is ${String(A_VALUE)} and m is ${String(M_VALUE)}`;

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * control's drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

describe("bug 0252 live: a `let` annotation carrying brace-and-angle junk is REFUSED at live production load and un-registers the theta, while its byte-neighbour control registers and drives", () => {
  it("keeps `{a: integer, b > c, m: integer}` out of the registered set while `{a: integer, m: integer}` registers and completes a real turn over both bound fields", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries the refusal ALONE (§Fix constraint 3 —
    // one diagnostic per offending annotation) and the control carries none, so
    // a neutralised fix reds here before a single token is spent.
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: the junk `let` annotation must draw the refusal and nothing else — at HEAD " +
        "the brace-and-angle conjunct declines before the sink runs and this list is EMPTY, " +
        "which is bug 0252 itself",
    ).toEqual([refusalLine(BINDER)]);
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
      "attribution: the byte-neighbour control must carry zero diagnostics — the route must not " +
        "over-refuse a well-formed inline-object annotation over a `params:`-supplied value",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: CONTROL_STEM, text: CONTROL },
      { source: "project", stem: OFFENDER_STEM, text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (2) CONTROL: registers, and its drive proves the whole path the
      // offender is denied — bind, render, turn — is live in this workspace.
      expect(
        handle.command(CONTROL_STEM),
        "the byte-neighbour control `let y: {a: integer, m: integer} = p` did not register — the " +
          "route over-refuses a well-formed annotation, or an inline-object `params:` theta " +
          "cannot register in this harness at all (check the `bind_model:` chain). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (1) OFFENDER: the fixed observable, read off the settled
      // `ExtensionRunner` — never a `prompt()` resolution. At HEAD this theta
      // registers with an empty diagnostic list.
      expect(
        handle.command(OFFENDER_STEM),
        "`let y: {a: integer, b > c, m: integer} = p` REGISTERED — the brace-and-angle conjunct " +
          "still exempts the annotation from `theta/parse/annotation-type-not-expression`, so " +
          "the theta loads and its binding's type checks stay withheld. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "the refused theta's slash name must not appear in the registered set.",
      ).not.toContain(OFFENDER_STEM);

      const controlTurn = await driveSlashCaptureTurn(handle, `/${CONTROL_STEM}${SLASH_ARG}`);
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render both bound fields — the binder did not bind " +
          "`{a, m}` for a contract that declares them, so the offender's absence above would be " +
          "unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " +
          JSON.stringify(controlTurn.systemNotes),
      ).toContain(`${BODY_MARKER} a=${String(A_VALUE)} m=${String(M_VALUE)}`);
      expect(
        controlTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the control's drive ended fail-closed. Notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toEqual([]);
      expect(
        controlTurn.text,
        "the control's live reply did not contain the arithmetic oracle " +
          `(${PRODUCT}, from ${String(A_VALUE)} times ${String(M_VALUE)}) — the product is ` +
          "computable only from two values that BOTH reached the rendered body. Reply: " +
          JSON.stringify(controlTurn.text),
      ).toContain(PRODUCT);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
