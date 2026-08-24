// H8a live witness — bug 0263: a `params:` field whose type text STARTS with a
// quote character (`p: "a" | "b"`, the spec's own literal-union text written
// without enclosing single quotes) is not valid YAML, so FM-5 discarded the
// whole recovered frontmatter document and the load's COMPLETE diagnostic list
// was one `theta/load/missing-mode` on a file whose `mode:` line is present and
// correct — the author's actual mistake, one pair of enclosing single quotes,
// named nowhere
// (docs/bugs/0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md
// §Reproduction row 1, §Why it matters).
//
// §Fix, ROUTE A AS ADJUDICATED: a new general frontmatter-parse-failure row,
// `theta/load/malformed-frontmatter-yaml`, emitted at FM-5's discard point in
// place of the `theta/load/missing-mode` the discard produced, carrying the
// position and the offending source line the parser's first error already
// holds plus a `(in 'params:' field '<param>')` clause when the failing
// position falls on a `params:` field line. The refusal stays fail-closed
// (§Fix constraint 5) and a block that parses is untouched (constraint 6).
// `tests/frontmatter-yaml-parse-failure-diagnostic.test.ts` is the offline
// witness over `parseThetaDocument`.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT. The offline witness pins
// the diagnostic bytes and the null frontmatter directly. This route moves the
// REGISTRATION-side statement of the same class through the real discovery →
// load → `pi.registerCommand` path: the offender stays out of the registered
// set under its NEW code (rather than under the misattributed one), and its
// byte-neighbour — the same file with the one pair of enclosing single quotes
// the diagnostic's *Hint* names — registers and completes a real turn over
// both bound `params:` fields. Registration itself is fail-closed on both
// sides of the fix, so the moved observable this cell protects is that the
// refusal is still TOTAL after the diagnostic changed: nothing about the new
// emission path lets a rejected frontmatter block reach the registered set.
// The nearest sibling mirror is
// tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts, whose
// three-part shape this cell follows.
//
// THREE PARTS:
//   (1) OFFENDER — a theta whose `params:` field is the unquoted `p: "a" | "b"`
//       — must be ABSENT from the registered set: the refusal is
//       error-severity, and `hasLoadParseError`
//       (src/extension/production-composition.ts) then withholds registration.
//   (2) CONTROL — the byte-neighbour whose same field wraps the whole scalar in
//       the single quotes the offender omits (`p: '"a" | "b"'`) and is
//       otherwise the same file. It must REGISTER and drive a REAL turn over
//       both bound `params:` fields, so the offender's absence is bounded to
//       the missing enclosing quotes rather than to the literal-union
//       `params:` shape, the binder or the workspace.
//   (3) A precondition control (`b0263livectl`), an ordinary `mode: prompt`
//       theta in the same workspace, registration-only, so a missing
//       registration above cannot be misattributed to a broken workspace.
//
// SENTINEL DISCIPLINE: the control's drive discriminator is the ANSWER to
// fixed-pair arithmetic over a bound `params:` field (263 + 514 = 777) — never
// a "reply with exactly this string" echo, which current models read as prompt
// injection (AGENTS.md; bug 0243). The enum-typed field's arrival is read off
// the DETERMINISTIC outbound render instead, behind a committed marker.
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

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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

const CODE = "theta/load/malformed-frontmatter-yaml";

/**
 * DIAG-4: the expected message is sourced from the registry's *Message*
 * column, never from copied prose.
 */
const REGISTRY_TEMPLATE: string = (() => {
  const page = readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const message = registryMessage(parseRegistry(page), CODE) as string | undefined;
  if (message === undefined) {
    throw new Error(
      `docs/spec_topics/diagnostics/code-registry-load.md carries no row for ${CODE}; ` +
        "bug 0263's registry row is the source of this cell's expected message (DIAG-4)",
    );
  }
  return message;
})();

/** The bound integer and the fixed addend; their sum is the drive's oracle. */
const N_VALUE = 263;
const ADDEND = 514;
/** 263 + 514 — computable only from a value that reached the rendered body. */
const SUM = String(N_VALUE + ADDEND);

/** The enum arm the slash argument names, and its deterministic render. */
const P_VALUE = "a";

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0263LIVE-BOUND";

const PRECONDITION_STEM = "b0263livectl";
const CONTROL_STEM = "b0263livecontrol";
const OFFENDER_STEM = "b0263liveoffender";

/**
 * One theta over a `params:`-declared literal union, differing ONLY in whether
 * the whole type text is wrapped in the enclosing single quotes YAML needs for
 * a scalar that itself begins with a quote character. The body interpolates
 * both bound fields behind a committed marker and then asks for a sum over the
 * integer one, so the drive carries two independent observables: the
 * deterministic outbound render (`userTexts`) and the model's arithmetic
 * answer.
 */
function paramsTheta(unionField: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: ${unionField}`,
    "  n: integer",
    "---",
    "@`" +
      BODY_MARKER +
      " p=${p} n=${n}. What is ${n} plus " +
      String(ADDEND) +
      "? Answer with the number only.`",
    "",
  ].join("\n");
}

/**
 * The subject — the type text starts with `"`, so YAML reads the leading quoted
 * scalar as the whole value and rejects the rest of the line. The frontmatter
 * block never parses, so no field on it is read.
 */
const OFFENDER = paramsTheta('"a" | "b"');

/**
 * The byte-neighbour control: the correctly authored spelling the new row's
 * *Hint* names — the whole scalar wrapped in single quotes.
 */
const CONTROL = paramsTheta("'\"a\" | \"b\"'");

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
  "",
].join("\n");

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * control's drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}

/**
 * The offender's expected rendering. The failing position is the union bar on
 * the field line — the fifth line of the file, which is the fourth line of the
 * frontmatter block plus the block's own one-line offset — and the field line
 * sits inside the `params:` block, so the scope clause names `p`.
 */
const OFFENDER_MESSAGE = REGISTRY_TEMPLATE.replace("<line>", "5")
  .replace("<column>", "10")
  .replace("<text>", 'p: "a" | "b"')
  .replace("<scope>", " (in 'params:' field 'p')");

describe("bug 0263 live: a `params:` field whose type text begins with a quote character is refused at live production load under the frontmatter-parse-failure row and un-registers the theta, while its byte-neighbour control (enclosing single quotes added) registers and drives", () => {
  it("keeps the unquoted `p: \"a\" | \"b\"` out of the registered set under the located frontmatter-parse-failure diagnostic while `p: '\"a\" | \"b\"'` registers and completes a real turn over both bound fields", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries the new located refusal ALONE and the
    // control carries none, so a neutralised fix reds here before a single
    // token is spent. At HEAD before bug 0263's fix this list was one
    // `theta/load/missing-mode`, which is the misattribution itself.
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: the unquoted leading-quote type text must draw one located " +
        `${CODE} line naming the position, the offending source line and the ` +
        "`params:` field, and nothing else — never theta/load/missing-mode on a file whose " +
        "`mode:` line is present (bug 0263 §Fix constraint 1)",
    ).toEqual([`error ${CODE}: ${OFFENDER_MESSAGE}`]);
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
      "attribution: the byte-neighbour control (enclosing single quotes added) must carry zero " +
        "diagnostics — bug 0263 §Fix constraint 6 leaves a block that parses untouched",
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
        "the byte-neighbour control `p: '\"a\" | \"b\"'` did not register — the fix over-refuses " +
          "a frontmatter block that parses, or a literal-union `params:` theta cannot register " +
          "in this harness at all (check the `bind_model:` chain). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (1) OFFENDER: the fixed observable, read off the settled
      // `ExtensionRunner` — never a `prompt()` resolution. The refusal is
      // fail-closed on both sides of bug 0263's fix (§Fix constraint 5); what
      // this asserts is that the new emission path did not open it.
      expect(
        handle.command(OFFENDER_STEM),
        "the unquoted `p: \"a\" | \"b\"` REGISTERED — a frontmatter block the YAML parser " +
          "rejected reached the registered set, so the new diagnostic replaced the refusal " +
          "instead of carrying it. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "the refused theta's slash name must not appear in the registered set.",
      ).not.toContain(OFFENDER_STEM);

      const controlTurn = await driveSlashCaptureTurn(
        handle,
        `/${CONTROL_STEM} p is ${P_VALUE} and n is ${String(N_VALUE)}`,
      );
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render both bound `params:` fields — the binder did " +
          "not bind `{p, n}` for a contract that declares them, so the offender's absence " +
          "above would be unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " +
          JSON.stringify(controlTurn.systemNotes),
      ).toContain(`${BODY_MARKER} p=${P_VALUE} n=${String(N_VALUE)}`);
      expect(
        controlTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the control's drive ended fail-closed. Notes: " +
          JSON.stringify(controlTurn.systemNotes),
      ).toEqual([]);
      expect(
        controlTurn.text,
        "the control's live reply did not contain the arithmetic oracle " +
          `(${SUM}, from ${String(N_VALUE)} plus ${String(ADDEND)}) — the sum is computable ` +
          "only from a bound value that reached the rendered body. Reply: " +
          JSON.stringify(controlTurn.text),
      ).toContain(SUM);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
