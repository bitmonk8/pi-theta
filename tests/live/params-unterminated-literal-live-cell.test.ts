// H8a live witness — bug 0232: a `params:` field whose inline object type's
// string literal never closes (`p: '{a as "w: integer, b: integer}'`) is
// admitted at HEAD's pre-fix disposition with zero diagnostics and lowers to
// the permissive `{}`, dropping the well-formed sibling field `b` too. §Fix
// (b) raises the position's own registered row,
// `theta/load/params-type-not-expression` (E, load), directly off the new
// `hasUnterminatedStringLiteral` predicate, which denies registration
// (docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/unterminated-literal-params-type-refusal.test.ts` pins the
// diagnostic bytes and the lowered artefact at the `parseThetaDocument`
// boundary directly. No offline cell observes the real discovery->
// registration path deciding whether a `.theta` whose `params:` field carries
// this class becomes a slash command at all. This cell drives that decision
// through the shipped production composition root (`bootShippedExtension`),
// mirroring the structure of bug 0059's own H8a cell at the SAME position
// (`tests/live/live-production-acceptance.test.ts`, "bug 0059: a params:
// right-hand side spelling no Type production draws
// params-type-not-expression and does not register"), and asserts on real
// observables -- the `theta-system-note` channel read off the settled
// `SessionManager`, and `handle.command(...)`/`handle.registeredNames()` --
// never on `prompt()` merely resolving.
//
// THREE THETAS, mirroring the bug 0059 / bug 0102 pair pattern:
//   (1) a precondition control (an ordinary `params:`-free theta), so an
//       absent BAD registration cannot be misattributed to a broken
//       workspace;
//   (2) GOOD -- the well-formed sibling `params:\n  p: string`, which must
//       still register, isolating the refusal to the unterminated literal
//       rather than to "a params:-declaring theta cannot register in this
//       harness at all";
//   (3) BAD -- `params:\n  p: '{a as "w: integer, b: integer}'` (§Reproduction
//       B row B2), which must NOT register.
//
// Registration is the observable this cell reads (mirroring bug 0059's own
// cell, which drives no query either): the diagnostic fires at LOAD time,
// before any drive is attempted, so no query need ever be constructed and no
// token is spent. This is a token-free registration cell, consistent with the
// convention already shipped at this exact `params:` position.
//
// SUBAGENT CHILD PINS: not required for the load/registration observable --
// every theta below is `mode: prompt` and drives no `invoke` -- but the
// shared harness sets BOTH #subagent-child-pins plus the parent-pid carriage
// at module scope regardless (`./harness`), the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution check runs BEFORE the live host
// is required, so a neutralised fix reds here with zero tokens spent (per
// AGENTS.md's "prefer the offline-attributable guard").

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bootShippedExtension, plantThetaWorkspace, requireLiveProvider, type PlantedTheta } from "./harness";
import { parseDoc } from "../helpers/e2e-s1";
// @ts-expect-error -- JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The `params:` position's own registered refusal -- the code this fix raises. */
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(new URL("../../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url)),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `'params:' field '<param>' right-hand side is not a theta type expression`
 * -- DIAG-4: the message half is read from the registry row rather than
 * copied, and `<param>` renders the field's own name (`p`).
 */
function paramsNotExprFragment(param: string): string {
  const template = registryMessage(REGISTRY, PARAMS_NOT_EXPR) as string | undefined;
  expect(
    template,
    `${PARAMS_NOT_EXPR} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${PARAMS_NOT_EXPR}: ${(template as string).replace("<param>", param)}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md
 * §"Assert on real observables").
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

const CTL = ["---", "mode: prompt", "---", '"THETA-LIVE-OK"', ""].join("\n");

/**
 * GOOD -- the same-shape sibling with a VALID type: `string` in place of the
 * unterminated inline-object spelling. `string` is the
 * `classifyBinderBypass` single-string-bypass shape (bug 0059's
 * `conformantParamsTypeTheta` uses the identical spelling for the identical
 * reason), so this sibling needs no `bind_model:` and no resolvable binder
 * model to register. No drive is attempted (registration is the observable,
 * matching bug 0059's own cell), so the body is a bare literal.
 */
const GOOD = ["---", "mode: prompt", "params:", "  p: string", "---", '"ok"', ""].join("\n");

/**
 * BAD -- §Reproduction B row B2: an unterminated wire-name literal beside a
 * well-formed sibling field `b`. Pre-fix this lowered `p` to the permissive
 * `{}`, dropping `b` entirely, with zero diagnostics.
 */
const BAD = [
  "---",
  "mode: prompt",
  "params:",
  '  p: \'{a as "w: integer, b: integer}\'',
  "---",
  '"ok"',
  "",
].join("\n");

describe("bug 0232 live: a params: field whose wire-name literal never closes is refused at registration, and the well-formed sibling still registers", () => {
  it("does not register the params: field carrying an unterminated wire-name literal beside a well-formed sibling, the theta-system-note channel carries theta/load/params-type-not-expression, and the well-formed sibling still registers", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the new refusal and GOOD is clean, so
    // neither live observable below can be produced by an unrelated load
    // failure. This reds a neutralised fix before any provider call is made.
    expect(
      parseDoc(BAD, "b0232livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + PARAMS_NOT_EXPR,
    ).toEqual([PARAMS_NOT_EXPR]);
    expect(
      parseDoc(GOOD, "b0232livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- the refusal must not disturb the " +
        "well-formed sibling spelling",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      { source: "project", stem: "b0232livectl", text: CTL },
      // The same-shape sibling: identical params: shape, a well-formed
      // interior -- must still register, isolating the refusal to the
      // unterminated literal rather than to "a params:-declaring theta never
      // registers in this harness".
      { source: "project", stem: "b0232livegood", text: GOOD },
      // The load-bearing broken theta: §Reproduction B row B2's own spelling.
      { source: "project", stem: "b0232livebad", text: BAD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0232livectl"),
        "the precondition control did not register -- a broken workspace, not the new gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b0232livegood"),
        "the well-formed sibling `p: string` did not register -- precondition unmet (a " +
          "params:-declaring theta cannot register in this harness at all, independent of this " +
          "bug). Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // params: field carrying an unterminated wire-name literal beside a
      // well-formed sibling does NOT register.
      expect(
        handle.command("b0232livebad"),
        "the params: field carrying an unterminated wire-name literal registered anyway " +
          "through the live discovery/session_start path -- theta/load/params-type-not-expression " +
          "did not fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0232livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = paramsNotExprFragment("p");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          PARAMS_NOT_EXPR +
          " for the BAD declaration -- the fix's registered-row raise did not fire. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
