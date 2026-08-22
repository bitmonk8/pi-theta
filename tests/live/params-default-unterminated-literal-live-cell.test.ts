// H8a live witness — bug 0239: a `params:` field whose DEFAULT half carries a
// string literal that never closes (`p: 'string = "abc'`) is admitted at HEAD
// with zero diagnostics, lowers `{"type":"string"}` with `required: []`, and
// records the unterminated bytes `"abc` as the field's `defaultSource`. §Fix
// (a) route 2 adds a default-side guard in `parseParams`'s per-field default
// loop (`src/parser/params.ts`) testing that half with bug 0232's existing
// predicate `hasUnterminatedStringLiteral`, raising the registered row
// `theta/parse/unterminated-string` (E), which denies registration
// (docs/bugs/0239-params-default-unterminated-literal-admitted.md).
//
// THE DEFAULT HALF IS WHAT THIS CELL ADDS. Bug 0232's own H8a cell
// (`tests/live/params-unterminated-literal-live-cell.test.ts`) drives the same
// class through the TYPE half of the field, where `splitParamValue`
// (src/parser/frontmatter.ts) leaves the malformation for that bug's guard to
// see. Here the top-level `=` is reached before any quote opens, so the type
// half is the clean `string` and the whole malformation lands in the default
// half — a different guard, a different registered code, and the same
// discovery→registration decision. This cell is the default-half twin of that
// file — .
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/params-default-unterminated-literal-refusal.test.ts` pins the
// diagnostic bytes, the lowering and the recorded `defaultSource` at the
// `parseThetaDocument` boundary directly. No offline cell observes the real
// discovery→registration path deciding whether a `.theta` whose `params:`
// default carries this class becomes a slash command at all. This cell drives
// that decision through the shipped production composition root
// (`bootShippedExtension`), mirroring bug 0232's cell at the neighbouring half
// of the same field, and asserts on real observables — the
// `theta-system-note` channel read off the settled `SessionManager`, and
// `handle.command(...)` / `handle.registeredNames()` — never on `prompt()`
// merely resolving.
//
// THREE THETAS, the pattern bugs 0059 / 0102 / 0232 share at this position:
//   (1) a precondition control (an ordinary `params:`-free theta), so an
//       absent BAD registration cannot be misattributed to a broken
//       workspace;
//   (2) GOOD — `p: 'string = "abc"'`, the byte-neighbour differing in one
//       closing quote (§Reproduction row a3), which must still register:
//       that isolates the refusal to the unterminated span rather than to "a
//       params: default cannot register in this harness at all";
//   (3) BAD — `p: 'string = "abc'` (§Reproduction row a1), which must NOT
//       register.
//
// Registration is the observable this cell reads, exactly as bug 0232's does:
// the diagnostic fires at LOAD time, before any drive is attempted, so no
// query need ever be constructed and no token is spent. Token-free
// registration cell, consistent with the convention already shipped at this
// `params:` position.
//
// SUBAGENT CHILD PINS: not required for the load/registration observable —
// every theta below is `mode: prompt` and drives no `invoke` — but the shared
// harness sets BOTH #subagent-child-pins plus the parent-pid carriage at
// module scope regardless (`./harness`), the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// NO SILENT SKIPPING: the live provider precondition is required through
// `requireLiveProvider`, which fails loudly naming the unmet precondition;
// there is no early return and no skip anywhere in this file.
//
// OFFLINE ATTRIBUTABLE GUARD, IN ITS OWN CELL. The attribution check is a
// SEPARATE `it` rather than the first statements of the live cell, so a
// neutralised fix reds it with zero tokens spent (AGENTS.md's
// "offline-attributable guard") WITHOUT masking the live cell: were it inline,
// the pre-fix red would stop before the live host was ever reached and the
// registration observable below — the only thing this file exists for — would
// never be exercised at all. Split, both reds are visible in one run: the
// offline one names the missing diagnostic, the live one names the theta that
// registered anyway.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bootShippedExtension,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveProvider,
  type PlantedTheta,
} from "./harness";
import { parseDoc } from "../helpers/e2e-s1";
// @ts-expect-error -- JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The registered row the default-side guard raises for these bytes. */
const UNTERMINATED = "theta/parse/unterminated-string";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `unterminated string literal` — DIAG-4: the message half is read from the
 * registry row rather than copied, and this row carries no placeholder.
 */
function unterminatedFragment(): string {
  const template = registryMessage(REGISTRY, UNTERMINATED) as string | undefined;
  expect(
    template,
    `${UNTERMINATED} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${UNTERMINATED}: ${template as string}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables").
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
 * WHY BOTH §Reproduction ROWS CARRY A `bind_model:` LINE.
 * `classifyBinderBypass` (`src/binder/binder-envelope.ts`) declines the
 * single-string bypass for a field that declares a default (`!field.hasDefault`),
 * so a one-field `params:` theta WITH a default is a non-bypass theta and needs
 * a resolvable binder model to load at all -- the disposition the committed
 * acceptance fixture `tests/live/acceptance/fixtures/acc-params-binder.theta`
 * states for itself ("A non-bypass theta with no resolvable binder model fails
 * to load").
 *
 * MEASURED at HEAD f5d0d125 without the line: `registeredNames()` was
 * `["b0239livectl"]` -- GOOD did not register EITHER, so the BAD theta's
 * absence was explained by the missing binder model and the refusal assertion
 * would have passed vacuously. The line is what makes registration decided by
 * the default's closure and nothing else. It is re-derived from the resolved
 * live host at plant time, the rule `materialiseHostBoundThetaDir`
 * (`tests/live/acceptance/harness.ts`) applies to the committed fixture for the
 * same reason: a hardcoded id is a model the shared selection rule may never
 * pick.
 */
function goodSrc(bindModel: string): string {
  // §Reproduction row a3: the byte-neighbour whose literal closes. It must
  // still register, which isolates the refusal to the unterminated span rather
  // than to the presence of a `params:` default. No drive is attempted
  // (registration is the observable, matching bug 0232's own cell), so the body
  // is a bare literal.
  return [
    "---",
    "mode: prompt",
    `bind_model: ${bindModel}`,
    "params:",
    `  p: 'string = "abc"'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

function badSrc(bindModel: string): string {
  // §Reproduction row a1: the same field with the closing quote removed.
  // Pre-fix this registered with zero diagnostics, recording the unterminated
  // bytes as the field's `defaultSource`, which the binder prompt then renders
  // verbatim and the declared-default recovery silently repairs.
  return [
    "---",
    "mode: prompt",
    `bind_model: ${bindModel}`,
    "params:",
    `  p: 'string = "abc'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The id the OFFLINE attribution cell parses against. A `bind_model:` value is
 * resolved against the model registry at LOAD time, never at parse time, so the
 * two sources' parse diagnostics are independent of which id sits on the line;
 * the attribution cell asserts that each source carries exactly one such line,
 * so a future edit cannot silently drop the registration precondition.
 */
const ATTRIBUTION_BIND_MODEL = "anthropic/claude-sonnet-5";

/** `<provider>/<model>` for the resolved live host, or a loud failure. */
function providerQualified(provider: LiveProvider): string {
  const name = (provider.model as { provider?: string }).provider ?? "";
  if (name === "" || provider.modelId === "") {
    failLoudly(
      "live-host precondition unmet: the resolved live model is not " +
        `provider-qualifiable (provider '${name}', model '${provider.modelId}'), ` +
        "so the two defaulted `params:` thetas below cannot be given a resolvable " +
        "`bind_model:` and their registration would be decided by the missing " +
        "binder model rather than by this bug.",
    );
  }
  return `${name}/${provider.modelId}`;
}

describe("bug 0239 live: a params: default whose string literal never closes is refused at registration, and the closed byte-neighbour still registers", () => {
  it("ATTRIBUTION (offline, token-free): BAD carries exactly theta/parse/unterminated-string and GOOD carries nothing", () => {
    // The two live observables below are only attributable to this bug if the
    // BAD source's sole diagnostic is the new refusal and the GOOD source is
    // clean. A neutralised fix reds this cell with zero tokens spent.
    const bad = badSrc(ATTRIBUTION_BIND_MODEL);
    const good = goodSrc(ATTRIBUTION_BIND_MODEL);
    expect(
      parseDoc(bad, "b0239livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + UNTERMINATED,
    ).toEqual([UNTERMINATED]);
    expect(
      parseDoc(good, "b0239livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- the refusal must not disturb the " +
        "closed byte-neighbour of §Reproduction row a3",
    ).toEqual([]);
    // The registration precondition itself: without exactly one resolvable
    // `bind_model:` line each, neither defaulted theta registers and the
    // refusal assertion in the live cell passes vacuously (measured at HEAD).
    expect(
      [(bad.match(/^bind_model:.*$/gm) ?? []).length, (good.match(/^bind_model:.*$/gm) ?? []).length],
      "attribution: each defaulted-params theta must carry exactly one `bind_model:` line -- " +
        "a non-bypass theta with no resolvable binder model does not load, which would explain " +
        "the BAD theta's non-registration without the guard ever firing",
    ).toEqual([1, 1]);
  });

  it("does not register the params: default carrying an unterminated string literal, the theta-system-note channel carries theta/parse/unterminated-string, and the closed byte-neighbour still registers", async () => {
    const provider = await requireLiveProvider();
    const bindModel = providerQualified(provider);
    const GOOD = goodSrc(bindModel);
    const BAD = badSrc(bindModel);
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      { source: "project", stem: "b0239livectl", text: CTL },
      // The byte-neighbour whose literal closes: must still register.
      { source: "project", stem: "b0239livegood", text: GOOD },
      // The load-bearing broken theta: §Reproduction row a1's own spelling.
      { source: "project", stem: "b0239livebad", text: BAD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0239livectl"),
        "the precondition control did not register -- a broken workspace, not the new gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b0239livegood"),
        "the closed byte-neighbour `p: 'string = \"abc\"'` did not register -- precondition " +
          "unmet (a params: default cannot register in this harness at all, independent of this " +
          "bug). Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // params: default carrying an unterminated string literal does NOT
      // register.
      expect(
        handle.command("b0239livebad"),
        "the params: default carrying an unterminated string literal registered anyway through " +
          "the live discovery/session_start path -- theta/parse/unterminated-string did not " +
          "fire at the default half. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0239livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unterminatedFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          UNTERMINATED +
          " for the BAD declaration -- the default-side guard did not fire. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
