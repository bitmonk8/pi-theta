// Bug 0067 — a `mode: subagent` callee's final value re-enters its `invoke`
// parent as raw `JSON.parse` output; without the inbound translation pass a
// named-enum variant arrives as a bare untagged string. The pass restores the
// tag, and under bug 0337's file-qualified tags it keys on the CHILD's own
// declaring file: the restored variant is a TAGGED enum that compares `false`
// against the parent's own same-named `Sev.High` (declared in a different
// file), the tag preserved rather than dropped to a bare string.
//
// `docs/spec_topics/runtime-value-model.md:34` names `invoke` returns as one of
// the four inbound boundaries at which the runtime MUST rebuild the validated
// JSON with theta-side names and reattach each named-enum position's
// declaring-enum tag "so the resulting value compares equal to a locally
// constructed variant of the same enum", recursing "through arrays, nested
// object fields, and `Result.Ok` / `Result.Err` payloads" with "tags attached at
// the same depth as the value the schema annotates". The subagent boundary is
// the one `invoke` return that genuinely arrives as JSON — the child's
// `theta_result` envelope (`docs/spec_topics/pi-integration-contract/subagent.md:101`,
// PIC-59; `:110` "`Ok` values serialise per the runtime value model") — and the
// enum row of `runtime-value-model.md:13` makes the tag's ABSENCE from that JSON
// normative, so the child's serialisation is correct and the parent's decode is
// the obligation under test. Under bug 0337 that reattached tag keys on the
// CHILD's declaring file, so the decoded variant compares equal to the child's
// own declaration and UNEQUAL to the parent's own same-named `Sev` — the
// direction this witness now pins.
//
// The witness must use the TYPED `invoke<Schema>` form:
// `docs/spec_topics/invocation.md:28` (§Typed return) fixes untyped
// `invoke(...)` as returning `Result<null, QueryError>` — "the runtime discards
// the child's return value entirely" — so an untyped site carries no value to
// lose a tag from and cannot witness this defect at all.
//
// Every theta body below is a pure tail expression: zero model queries, zero
// tokens, deterministic. The root theta is itself a spawned child, so its four
// `invoke`s run the real production return path rather than an in-process
// shortcut.
//
// The child is pinned to THIS working tree's extension and to the repo's own pi
// CLI entry (AGENTS.md #subagent-child-pins) so the observation names the build
// under test rather than whatever ambient theta install the machine carries.
//
// Spec: runtime-value-model.md (§Wire-name translation, §Equality),
// invocation.md (§Typed return, INV-5), pi-integration-contract/subagent.md
// (PIC-58 launch contract, PIC-59 envelope).

import {
  requireRealSubagentPathsFor,
  runDrivenSubagentFixtureCell,
} from "./helpers/real-subagent-spawn";
import { reportOf } from "./helpers/subagent-fn-child-regime";
import { describe, expect, it } from "vitest";

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED: every scratch theta below is a pure tail expression
 * — zero queries — so no provider resolution or credential is required. The
 * values only satisfy the launch contract's argv shape.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
const requireRealSubagentPaths = requireRealSubagentPathsFor(
  `the bug-0067 inbound ` +
    `enum-tag witness needs the repo install (npm install); it never silently skips.`,
);

/** Frontmatter every fixture shares: the spawned-process callee regime under test. */
const SUBAGENT_FRONTMATTER = ["---", "mode: subagent", "---"];

/**
 * Root-position named enum: the plainest shape the envelope can carry, and the
 * one `#validateInvokeReturn`'s AJV gate admits without any object wrapper.
 */
const KID_ENUM = [...SUBAGENT_FRONTMATTER, 'enum Sev { High = "high" }', "Sev.High", ""].join("\n");

/**
 * Named-enum FIELD inside a schema-typed object, plus one `as`-renamed field so
 * the same drive also witnesses that re-tagging never renames.
 */
const KID_OBJECT = [
  ...SUBAGENT_FRONTMATTER,
  'enum Sev { High = "high" }',
  'schema P { sev: Sev, who as "Who": string }',
  'P { sev: Sev.High, who: "w" }',
  "",
].join("\n");

/** Named-enum ARRAY ELEMENT — the depth the inbound walk must recurse to. */
const KID_ARRAY = [...SUBAGENT_FRONTMATTER, 'enum Sev { High = "high" }', "[Sev.High]", ""].join(
  "\n",
);

/**
 * Anonymous string-literal union — absent from the lowering pass's *Named-enum
 * positions* sidecar by construction, so it must receive NO tag and keep plain
 * string equality.
 */
const KID_ANON = [
  ...SUBAGENT_FRONTMATTER,
  'schema Q { s: "a" | "b" }',
  'Q { s: "a" }',
  "",
].join("\n");

/**
 * The driven root: four typed `invoke`s across the envelope, each compared
 * against a locally constructed variant of the caller's own declarations, with
 * two in-process controls on the same line.
 */
const TOP_TYPED = [
  ...SUBAGENT_FRONTMATTER,
  'enum Sev { High = "high" }',
  'schema P { sev: Sev, who as "Who": string }',
  'schema Q { s: "a" | "b" }',
  // 0337: the three `*NotStr` fields are tag-presence discriminators — each
  // proves its sibling field's value is still a TAGGED enum (not a bare
  // string that a naive flip would also satisfy).
  "schema R { crossed: boolean, local: boolean, objSev: boolean, objWho: string, " +
    "elem0: boolean, anon: boolean, crossedNotStr: boolean, objSevNotStr: boolean, " +
    "elem0NotStr: boolean }",
  'let re = invoke<Sev>("./kid.theta")',
  "let ve = re?",
  'let ro = invoke<P>("./kidobj.theta")',
  "let vo = ro?",
  'let ra = invoke<array<Sev>>("./kidarr.theta")',
  "let va = ra?",
  'let rq = invoke<Q>("./kidanon.theta")',
  "let vq = rq?",
  "R { crossed: ve == Sev.High, local: Sev.High == Sev.High, objSev: vo.sev == Sev.High, " +
    'objWho: vo.who, elem0: va[0] == Sev.High, anon: vq.s == "a", ' +
    'crossedNotStr: ve == "high", objSevNotStr: vo.sev == "high", elem0NotStr: va[0] == "high" }',
  "",
].join("\n");

describe("bug 0067 — subagent invoke return: inbound named-enum tag reattachment", () => {
  it(
    "a named-enum value crossing the PIC-59 envelope belongs to the child's declaration and compares UNEQUAL to the parent's own same-named variant at every depth, tag preserved",
    async () => {
      requireRealSubagentPaths();

      // One discovery root holds all five fixtures so the root theta's `./`
      // callee paths resolve beside it. The shared shell launches the REAL
      // production spawn path (extension pin inherited by the grandchildren
      // the root theta's `invoke`s spawn) and reaps child and scratch dir on
      // every path.
      await runDrivenSubagentFixtureCell({
        tmpPrefix: "pi-theta-bug0067-",
        fixtures: {
          "kid.theta": KID_ENUM,
          "kidobj.theta": KID_OBJECT,
          "kidarr.theta": KID_ARRAY,
          "kidanon.theta": KID_ANON,
        },
        rootName: "top-typed",
        rootSource: TOP_TYPED,
        provider: CHILD_MODEL_PROVIDER,
        model: CHILD_MODEL_ID,
        // In-test bound BELOW the vitest timeout: on a stall (the root child or
        // any of its four grandchildren making no progress) kill the pair so the
        // drive settles fail-closed and the assertions below report loudly.
        watchdogMs: 90_000,
        body: async ({ result, killedByWatchdog, diagnostics, exitPromise }) => {

        expect(
          killedByWatchdog,
          "the driven root made no progress within 90s — the four nested subagent " +
            "spawns did not settle, so nothing about the inbound pass was observed",
        ).toBe(false);
        expect(
          result.ok,
          `the driven root resolved fail-closed instead of Ok: ${JSON.stringify(result)} ` +
            `diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toBe(true);
        if (!result.ok) {
          return;
        }
        const report = reportOf(result.value);

        // PRIMARY. runtime-value-model.md:34: the inbound pass reattaches the
        // declaring-enum tag "so the resulting value compares equal to a locally
        // constructed variant of the same enum", and :34 closes its boundary set
        // with "`invoke` returns". A root-position variant is the shallowest
        // case of "tags are attached at the same depth as the value the schema
        // annotates".
        // Soft across the six report fields so ONE run names every position that
        // lost its tag, rather than stopping at the shallowest.
        // 0337: `kid.theta` declares its OWN `Sev`, distinct from `top-typed.theta`'s
        // `Sev` — the crossed value belongs to a declaration the caller never
        // wrote, so it does NOT satisfy the caller's own `Sev.High` in `==`.
        expect.soft(
          report.crossed,
          "0337: the returned variant belongs to the callee's declaration (a different file), so it does not satisfy the caller's own Sev.",
        ).toBe(false);
        // 0337/0067: PRESERVE THE OWNING BUG'S SUBJECT — the returned value is a
        // TAGGED enum, not a dropped bare string (else `ve == "high"` would also
        // be true).
        expect.soft(
          report.crossedNotStr,
          "0337/0067: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);

        // PRIMARY. Same rule at object-field depth: the sidecar's named-enum
        // position for `P.sev` maps to `Sev`, so the validated string is
        // re-tagged where the schema annotates it.
        // 0337: same declaration split — `.sev` belongs to `kidobj.theta`'s own `Sev`.
        expect.soft(
          report.objSev,
          "0337: the returned field belongs to the callee's declaration (a different file), so it does not satisfy the caller's own Sev.",
        ).toBe(false);
        expect.soft(
          report.objSevNotStr,
          "0337/0067: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);

        // PRIMARY. Same rule at array-element depth: :34 states the walk
        // "recurses through arrays".
        // 0337: same declaration split — element 0 belongs to `kidarr.theta`'s own `Sev`.
        expect.soft(
          report.elem0,
          "0337: the returned element belongs to the callee's declaration (a different file), so it does not satisfy the caller's own Sev.",
        ).toBe(false);
        expect.soft(
          report.elem0NotStr,
          "0337/0067: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);

        // CONTROL that must stay green across the fix. runtime-value-model.md:12
        // keys object values by "theta-side names, regardless of any wire-name
        // renames": the field declared `who as "Who"` is read as `vo.who`, so
        // the inbound pass re-tags and re-brands without renaming.
        expect.soft(
          report.objWho,
          "(objWho) runtime-value-model.md:12 — a returned object is keyed by theta-side names, so " +
            'the field declared `who as "Who"` stays readable as `vo.who`',
        ).toBe("w");

        // CONTROL: the same comparison in-process, same theta, same line —
        // isolates the loss to the value that crossed the process boundary.
        expect.soft(
          report.local,
          "(local) the comparison mechanism itself must hold in-process; a red here means the " +
            "fixture, not the boundary, is what failed",
        ).toBe(true);

        // CONTROL that must stay green across the fix. runtime-value-model.md:34:
        // "Anonymous string-literal-union positions are absent from that sidecar
        // and receive no tag — equality on those falls back to plain string
        // equality", which is what keeps `Severity.Low == "low"` false per :22.
        expect.soft(
          report.anon,
          "(anon) runtime-value-model.md:34 — an anonymous string-literal-union position receives " +
            "no tag, so equality there stays plain string equality (over-tagging would " +
            'break the `Severity.Low == "low"` outcome pinned at :22)',
        ).toBe(true);

        // The defect is silent: no `Err`, no diagnostic. An empty drain is part
        // of the signature, and a non-empty one means the run failed for a
        // different reason than the missing inbound pass.
        expect.soft(
          diagnostics,
          `the drive emitted diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toEqual([]);

        // PIC-59: one invocation per process — after the envelope the child
        // self-exits 0.
        const exit = await exitPromise;
        expect(exit.code).toBe(0);
        expect(exit.signal).toBeNull();
        },
      });
    },
    150_000,
  );
});
