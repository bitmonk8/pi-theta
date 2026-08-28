// Bug 0174 — a typed `invoke<T>` of a `mode: prompt` callee fails
// return-validation for every named-enum position, where the byte-identical
// callee body as `mode: subagent` returns `Ok`
// (`docs/bugs/0174-typed-invoke-enum-return-validation-prompt-cell.md`). This
// file is §Reproduction (a)'s four failing pairs and §Reproduction (b)'s three
// controls, re-driven through real spawned children.
//
// THE ASYMMETRY, IN ONE PROCESS TREE. `#validateInvokeReturn`
// (`src/extension/production-theta-producer.ts:3564`) is reached from both cells
// of `#driveCallee` (`:3306`) — the prompt→prompt attach cell at `:3410` and the
// subagent spawn cell at `:3448` — and routes the callee's `Ok` payload through
// the AJV gate (`:3591`). What crosses that gate differs by cell:
//
//   - the subagent cell's value crossed `serializeOkEnvelope`
//     (`src/runtime/subagent-envelope.ts:94`) child-side and `parseEnvelopeLine`
//     (`:149`) parent-side, so it arrives a JSON primitive;
//   - the prompt→prompt attach cell (guard `callerMode === "prompt" &&
//     callee.frontmatter.mode === "prompt"`, `:3376`) runs the callee body
//     in-process, so the callee's own value arrives — and a named-enum variant's
//     carrier is `new String(wire)` (`makeEnumValue`, `src/runtime/value.ts:135`,
//     the carrier at `:136`), whose `typeof` is `"object"`.
//
// `{"type":"string","enum":[…]}` refuses the boxed carrier, and the caller
// observes `Err(InvokeInfraError { cause: "return_validation" })`.
//
// WHY THE ROOT IS A SPAWNED `mode: subagent` CHILD AND THE CELL STILL RUNS
// INSIDE IT. The subagent-root regime drives its own body through
// `bindPromptConversation` (`:2199`, PIC-58) — it borrows prompt-mode driver
// mechanics while applying the subagent frontmatter contract — and that binding
// threads `callerMode: "prompt"` into `#resolveInvoke` (`:1557`). So a
// `mode: subagent` theta running as its own process root still selects the
// prompt→prompt attach cell for a `mode: prompt` callee, and the `*-prompt` rows
// below execute in-process inside the spawned root while the `*-sub` rows spawn
// grandchildren. One drive therefore observes both legs of the same value.
//
// WHY THIS TIER. `tests/invoke-return-enum-carrier-projection.test.ts` is the
// unit half and reaches the refusing gate directly; it cannot exhibit the
// asymmetry, because the subagent leg's normalisation is a process boundary. The
// pairing — byte-identical callee bodies differing only in `mode:`, run under one
// root, with `DIAGS=[]` — is the report's headline observable and needs the real
// production launch path to exist at all.
//
// TOKENS: none. Every theta body here is a pure tail expression or a `let`
// chain ending in one; no callee issues a query, so no provider is contacted.
// The marshalled `--provider`/`--model` reference (PIC-62) only satisfies the
// launch argv shape.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three: `process.argv[1]`
// replaced by the repo's own pi CLI entry through the `ExecutableHost`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/`,
// and `parentPid` written beside it so the AUTHENTICATED control plane does not
// strip the pin. Without them the observation would name whatever ambient theta
// install the machine carries. The harness shape is bug 0067's witness,
// `tests/subagent-invoke-inbound-enum-tag.test.ts`.
//
// FIXTURE SHAPE CONSTRAINTS. No callee declares `params:`, and no body feeds a
// `.keys()` call into an `array<T>`-declared sink. Both shapes make a spawned
// child exit 0 with NO `theta_result` envelope, which would replace this file's
// observable with a launch-path one:
// `docs/bugs/0178-subagent-callee-nonbypass-params-unregistered-in-child.md`
// (a `params:` block that is not binder-bypass-eligible fails to register inside
// its own child) and
// `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md` (an
// `array<T>` sink refuses any expression the inference pass leaves nominal, and
// a spawned child's root cannot report the refusal). Both are open. Every
// declaration a fixture needs is made in its own body and the value returned
// directly.
//
// WHAT IS RED HERE. Every `*Prompt*` field of the report reds: `Ok` is refused,
// so the row's `ok` flag is `false` and its tag/field flags follow. Every
// `*Sub*` field is green today and pins §Fix (d)(4) — the leg that already works
// does not move. The three controls (d/e/g) are the over-reach fence and are
// green on both sides.
//
// Spec: invocation.md:36 (§Final-value propagation across callees — "A
// `prompt`-mode child attaches to the caller's current conversation, but the
// final value still propagates through the same return surface", and INV-5's
// envelope rule), :28 (§Typed return — the form that carries a value back), :55
// (§Cross-mode semantics — the callee's mode selects conversation isolation, not
// validation); runtime-value-model.md:13 (the enum row and its cross-enum
// equality rule), :16 (the boxed-`String` reference encoding), :34 (§Wire-name
// translation, the inbound bullet's post-AJV ordering);
// pi-integration-contract/subagent.md (PIC-58 launch contract, PIC-59 envelope).

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import { WallClock } from "../src/seams/wall-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED: no fixture below issues a query.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0174 prompt-cell ` +
        `enum-return witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}

// ---------------------------------------------------------------------------
// The callee fixtures. Each row's two callees are byte-identical below the
// frontmatter; only `mode:` differs, which is the whole point of the pairing.
// ---------------------------------------------------------------------------

const PROMPT_FRONTMATTER = "---\nmode: prompt\n---\n";
const SUBAGENT_FRONTMATTER = "---\nmode: subagent\n---\n";

const SEV_DECL = 'enum Sev { High = "high", Low = "low" }\n';

/** Row a — a root-position named-enum variant, the plainest failing shape. */
const BODY_A = SEV_DECL + "Sev.High\n";

/**
 * Row b — a multi-field object whose enum crosses a `let` before it is placed in
 * the returned constructor, so the failure cannot be attributed to a value that
 * was never bound.
 */
const BODY_B =
  SEV_DECL +
  "schema B { crossed: boolean, viaLet: boolean, rawEnum: Sev, rawStr: string }\n" +
  "let e = Sev.High\n" +
  'let s = "PSTR"\n' +
  "B { crossed: e == Sev.High, viaLet: true, rawEnum: e, rawStr: s }\n";

/** Row c — a named-enum ARRAY ELEMENT; the measured refusal position is `/0`. */
const BODY_C = SEV_DECL + "[Sev.High]\n";

/**
 * Row f — the depth row: one named-enum field and one plain `string` field, so
 * the refusal is at `/sev` while `/who` validates on its own.
 */
const BODY_F =
  SEV_DECL + "schema Box { sev: Sev, who: string }\n" + 'Box { sev: Sev.High, who: "w" }\n';

/** Controls (§Reproduction (b)) — the same cell, no enum anywhere. */
const BODY_D = '"PSTR"\n';
const BODY_E = "schema S { a: string, b: boolean }\n" + 'S { a: "x", b: true }\n';
const BODY_G = "[1, 2, 3]\n";

const FIXTURES: Readonly<Record<string, string>> = {
  "kidap.theta": PROMPT_FRONTMATTER + BODY_A,
  "kidas.theta": SUBAGENT_FRONTMATTER + BODY_A,
  "kidbp.theta": PROMPT_FRONTMATTER + BODY_B,
  "kidbs.theta": SUBAGENT_FRONTMATTER + BODY_B,
  "kidcp.theta": PROMPT_FRONTMATTER + BODY_C,
  "kidcs.theta": SUBAGENT_FRONTMATTER + BODY_C,
  "kidfp.theta": PROMPT_FRONTMATTER + BODY_F,
  "kidfs.theta": SUBAGENT_FRONTMATTER + BODY_F,
  "kiddp.theta": PROMPT_FRONTMATTER + BODY_D,
  "kidep.theta": PROMPT_FRONTMATTER + BODY_E,
  "kidgp.theta": PROMPT_FRONTMATTER + BODY_G,
};

/**
 * The driven root: eleven typed `invoke`s — four pairs plus three controls —
 * each reduced through `match` to report fields, so a refused row is DATA rather
 * than an unwind. `?` would propagate the first `Err` and hide every row behind
 * it.
 *
 * Every annotation resolves against this root's own declarations:
 * `#resolveReturnSite` (`src/extension/production-theta-producer.ts:3507`)
 * resolves an `invoke<T>` annotation in the CALLER's body.
 */
const TOP_TYPED = [
  "---",
  "mode: subagent",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev, who: string }",
  "schema B { crossed: boolean, viaLet: boolean, rawEnum: Sev, rawStr: string }",
  "schema S { a: string, b: boolean }",
  // 0337: the `*NotStr` fields are tag-presence discriminators — each proves
  // its sibling `*Tag` field's value is still a TAGGED enum, not a dropped
  // bare string, on BOTH legs (mode invariance).
  "schema R {",
  "  aPromptOk: boolean, aPromptTag: boolean, aPromptNotStr: boolean,",
  "  aSubOk: boolean, aSubTag: boolean, aSubNotStr: boolean,",
  "  bPromptOk: boolean, bPromptTag: boolean, bPromptNotStr: boolean, bPromptStr: string,",
  "  bSubOk: boolean, bSubTag: boolean, bSubNotStr: boolean, bSubStr: string,",
  "  cPromptOk: boolean, cPromptTag: boolean, cPromptNotStr: boolean,",
  "  cSubOk: boolean, cSubTag: boolean, cSubNotStr: boolean,",
  "  fPromptOk: boolean, fPromptTag: boolean, fPromptNotStr: boolean, fPromptWho: string,",
  "  fSubOk: boolean, fSubTag: boolean, fSubNotStr: boolean, fSubWho: string,",
  "  dPromptOk: boolean, dPromptVal: string,",
  "  ePromptOk: boolean, ePromptA: string, ePromptB: boolean,",
  "  gPromptOk: boolean, gPromptElem0: integer",
  "}",
  'let ap = invoke<Sev>("./kidap.theta")',
  "let apOk = match ap { Ok(v) => true, Err(e) => false }",
  "let apTag = match ap { Ok(v) => v == Sev.High, Err(e) => false }",
  'let apNotStr = match ap { Ok(v) => v == "high", Err(e) => false }',
  'let asub = invoke<Sev>("./kidas.theta")',
  "let asOk = match asub { Ok(v) => true, Err(e) => false }",
  "let asTag = match asub { Ok(v) => v == Sev.High, Err(e) => false }",
  'let asNotStr = match asub { Ok(v) => v == "high", Err(e) => false }',
  'let bp = invoke<B>("./kidbp.theta")',
  "let bpOk = match bp { Ok(v) => true, Err(e) => false }",
  "let bpTag = match bp { Ok(v) => v.rawEnum == Sev.High, Err(e) => false }",
  'let bpNotStr = match bp { Ok(v) => v.rawEnum == "high", Err(e) => false }',
  'let bpStr = match bp { Ok(v) => v.rawStr, Err(e) => "ERR" }',
  'let bs = invoke<B>("./kidbs.theta")',
  "let bsOk = match bs { Ok(v) => true, Err(e) => false }",
  "let bsTag = match bs { Ok(v) => v.rawEnum == Sev.High, Err(e) => false }",
  'let bsNotStr = match bs { Ok(v) => v.rawEnum == "high", Err(e) => false }',
  'let bsStr = match bs { Ok(v) => v.rawStr, Err(e) => "ERR" }',
  'let cp = invoke<array<Sev>>("./kidcp.theta")',
  "let cpOk = match cp { Ok(v) => true, Err(e) => false }",
  "let cpTag = match cp { Ok(v) => v[0] == Sev.High, Err(e) => false }",
  'let cpNotStr = match cp { Ok(v) => v[0] == "high", Err(e) => false }',
  'let cs = invoke<array<Sev>>("./kidcs.theta")',
  "let csOk = match cs { Ok(v) => true, Err(e) => false }",
  "let csTag = match cs { Ok(v) => v[0] == Sev.High, Err(e) => false }",
  'let csNotStr = match cs { Ok(v) => v[0] == "high", Err(e) => false }',
  'let fp = invoke<Box>("./kidfp.theta")',
  "let fpOk = match fp { Ok(v) => true, Err(e) => false }",
  "let fpTag = match fp { Ok(v) => v.sev == Sev.High, Err(e) => false }",
  'let fpNotStr = match fp { Ok(v) => v.sev == "high", Err(e) => false }',
  'let fpWho = match fp { Ok(v) => v.who, Err(e) => "ERR" }',
  'let fs = invoke<Box>("./kidfs.theta")',
  "let fsOk = match fs { Ok(v) => true, Err(e) => false }",
  "let fsTag = match fs { Ok(v) => v.sev == Sev.High, Err(e) => false }",
  'let fsNotStr = match fs { Ok(v) => v.sev == "high", Err(e) => false }',
  'let fsWho = match fs { Ok(v) => v.who, Err(e) => "ERR" }',
  'let dp = invoke<string>("./kiddp.theta")',
  "let dpOk = match dp { Ok(v) => true, Err(e) => false }",
  'let dpVal = match dp { Ok(v) => v, Err(e) => "ERR" }',
  'let ep = invoke<S>("./kidep.theta")',
  "let epOk = match ep { Ok(v) => true, Err(e) => false }",
  'let epA = match ep { Ok(v) => v.a, Err(e) => "ERR" }',
  "let epB = match ep { Ok(v) => v.b, Err(e) => false }",
  'let gp = invoke<array<integer>>("./kidgp.theta")',
  "let gpOk = match gp { Ok(v) => true, Err(e) => false }",
  "let gpElem0 = match gp { Ok(v) => v[0], Err(e) => 0 - 1 }",
  "R {",
  "  aPromptOk: apOk, aPromptTag: apTag, aPromptNotStr: apNotStr,",
  "  aSubOk: asOk, aSubTag: asTag, aSubNotStr: asNotStr,",
  "  bPromptOk: bpOk, bPromptTag: bpTag, bPromptNotStr: bpNotStr, bPromptStr: bpStr,",
  "  bSubOk: bsOk, bSubTag: bsTag, bSubNotStr: bsNotStr, bSubStr: bsStr,",
  "  cPromptOk: cpOk, cPromptTag: cpTag, cPromptNotStr: cpNotStr,",
  "  cSubOk: csOk, cSubTag: csTag, cSubNotStr: csNotStr,",
  "  fPromptOk: fpOk, fPromptTag: fpTag, fPromptNotStr: fpNotStr, fPromptWho: fpWho,",
  "  fSubOk: fsOk, fSubTag: fsTag, fSubNotStr: fsNotStr, fSubWho: fsWho,",
  "  dPromptOk: dpOk, dPromptVal: dpVal,",
  "  ePromptOk: epOk, ePromptA: epA, ePromptB: epB,",
  "  gPromptOk: gpOk, gPromptElem0: gpElem0",
  "}",
  "",
].join("\n");

/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}

describe("bug 0174 — typed invoke return validation across the prompt→prompt and subagent cells", () => {
  it(
    "a named-enum return value crosses BOTH cells identically: the callee's mode selects conversation isolation, not whether the value validates",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // One discovery root holds every fixture so the root theta's `./` callee
      // paths resolve beside it.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0174-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top-typed.theta"), TOP_TYPED);

      // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
      // (node + the entry script); pinned to the repo's own pi install.
      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (p: string): boolean => existsSync(p),
        isGenericRuntime: (): boolean => false,
      };

      const diagnostics: Diagnostic[] = [];
      const emitDiagnostic = (d: Diagnostic): void => {
        diagnostics.push(d);
      };

      // The REAL production spawn path. The extension pin rides `parentEnv` and
      // inherits down to the grandchildren the root theta's subagent-mode
      // `invoke`s spawn; `parentPid` is what authenticates the pin at each
      // level, so omitting it would strip the pin silently and bind ambient
      // builds instead.
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top-typed",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            hostTools: [],
            noHostTools: true,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            projectTrust: false,
          },
          cwd: scratchDir,
          parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
          parentPid: process.pid,
          invokeDepth: 0,
          host,
        },
        { spawn: createProductionSpawnFn(), emitDiagnostic },
      );
      expect(launch.ok, `launch failed: ${JSON.stringify(diagnostics)}`).toBe(true);
      if (!launch.ok) {
        return;
      }
      const child = launch.child;

      // Subscribed BEFORE driving so the terminal `'close'` is never missed;
      // hoisted above the `try` so the `finally` can await the exit too.
      const exitPromise = new Promise<ChildExitInfo>((resolve) => child.onExit(resolve));

      try {
        // In-test bound BELOW the vitest timeout: on a stall (the root child or
        // any of its four grandchildren making no progress) kill the pair so the
        // drive settles fail-closed and the assertions below report loudly,
        // instead of the test and a live process tree hanging to the outer
        // timeout.
        let killedByWatchdog = false;
        const watchdog = setTimeout(() => {
          killedByWatchdog = true;
          child.kill();
        }, 90_000);

        const result = await driveSubagentChild({
          child,
          thetaAbort: new AbortController(),
          calleePath: join(thetaDir, "top-typed.theta"),
          emitDiagnostic,
          clock: new WallClock(),
        });
        clearTimeout(watchdog);

        expect(
          killedByWatchdog,
          "the driven root made no progress within 90s — the invoke set did not settle, so " +
            "nothing about the return boundary was observed",
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

        // Soft across every field so ONE run names every row that failed,
        // rather than stopping at the first.

        // ---------------------------------------------------------------
        // Row a — root-position enum. §Reproduction (a) `a-prompt` /
        // `a-sub`.
        // ---------------------------------------------------------------

        // PRIMARY. invocation.md:36 — "the final value still propagates through
        // the same return surface". The paired `a-sub` row below returns Ok from
        // the identical body.
        expect.soft(
          report.aPromptOk,
          "(aPromptOk) invocation.md:36 — a prompt-mode callee returning Sev.High must reach its " +
            "invoke<Sev> caller as Ok; the boxed String carrier reaches AJV unnormalised and " +
            'Err(InvokeInfraError { cause: "return_validation" }) is minted instead',
        ).toBe(true);
        // 0337: `kidap.theta`/`kidas.theta` declare their OWN `Sev`, distinct
        // from the caller's (`top-typed.theta`) `Sev` — the delivered variant
        // belongs to a declaration the caller never wrote, so it does NOT
        // compare equal to the caller's own `Sev.High`, on EITHER leg
        // (mode invariance: cross-file inequality is the same observable on
        // the prompt attach leg and the subagent spawn leg alike).
        expect.soft(
          report.aPromptTag,
          "0337: the delivered variant belongs to the callee's declaration (a different file), so it does not compare equal to the caller's own Sev.",
        ).toBe(false);
        // 0337: PRESERVE THE OWNING BUG'S SUBJECT — the delivered variant is a
        // TAGGED enum, not a dropped bare string.
        expect.soft(
          report.aPromptNotStr,
          "0337/0174: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);
        // CONTROL (§Fix (d)(4)): the leg that already passes does not move.
        expect.soft(
          report.aSubOk,
          "(aSubOk) CONTROL — the byte-identical subagent-mode callee already returns Ok; a red " +
            "here means the fix widened past this report",
        ).toBe(true);
        expect.soft(
          report.aSubTag,
          "0337: same cross-file inequality on the subagent leg — mode invariance means this leg agrees with the prompt leg above.",
        ).toBe(false);
        expect.soft(
          report.aSubNotStr,
          "0337/0174: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);

        // ---------------------------------------------------------------
        // Row b — a multi-field object whose enum crossed a `let`.
        // §Reproduction (a) `b-prompt` / `b-sub`.
        // ---------------------------------------------------------------

        expect.soft(
          report.bPromptOk,
          "(bPromptOk) a multi-field object carrying one named-enum field must cross the " +
            "prompt→prompt cell; the sibling boolean and string fields validate on their own",
        ).toBe(true);
        // 0337: same cross-file split as row a — `.rawEnum` belongs to the
        // callee's own declaration.
        expect.soft(
          report.bPromptTag,
          "0337: the enum field belongs to the callee's declaration (a different file), so it does not compare equal to the caller's own Sev.",
        ).toBe(false);
        expect.soft(
          report.bPromptNotStr,
          "(bPromptNotStr) 0337: the returned rawEnum field is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22)",
        ).toBe(false);
        expect.soft(
          report.bPromptStr,
          "(bPromptStr) the plain string field crosses unchanged",
        ).toBe("PSTR");
        expect.soft(report.bSubOk, "(bSubOk) CONTROL — the subagent leg already returns Ok").toBe(
          true,
        );
        expect.soft(
          report.bSubTag,
          "0337: same cross-file inequality on the subagent leg — mode invariance.",
        ).toBe(false);
        expect.soft(
          report.bSubNotStr,
          "(bSubNotStr) 0337: the returned rawEnum field is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22)",
        ).toBe(false);
        expect.soft(report.bSubStr, "(bSubStr) CONTROL — the subagent leg's string field").toBe(
          "PSTR",
        );

        // ---------------------------------------------------------------
        // Row c — array element. §Reproduction (a) `c-prompt` / `c-sub`; the
        // measured refusal position is `/0`.
        // ---------------------------------------------------------------

        expect.soft(
          report.cPromptOk,
          "(cPromptOk) a named-enum ARRAY ELEMENT must not refuse the whole payload",
        ).toBe(true);
        // 0337: same cross-file split as row a — element 0 belongs to the
        // callee's own declaration, on both legs (mode invariance).
        expect.soft(
          report.cPromptTag,
          "0337: element 0 belongs to the callee's declaration (a different file), so it does not compare equal to the caller's own Sev.",
        ).toBe(false);
        expect.soft(
          report.cPromptNotStr,
          "0337/0174: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);
        expect.soft(report.cSubOk, "(cSubOk) CONTROL — the subagent leg already returns Ok").toBe(
          true,
        );
        expect.soft(
          report.cSubTag,
          "0337: same cross-file inequality on the subagent leg — mode invariance.",
        ).toBe(false);
        expect.soft(
          report.cSubNotStr,
          "0337/0174: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);

        // ---------------------------------------------------------------
        // Row f — object field. §Reproduction (a) `f-prompt` / `f-sub`; the
        // measured refusal position is `/sev`, not the root.
        // ---------------------------------------------------------------

        expect.soft(
          report.fPromptOk,
          "(fPromptOk) one named-enum FIELD must not refuse an object whose other field is a " +
            "plain string that validates",
        ).toBe(true);
        // 0337: same cross-file split as row a — `.sev` belongs to the
        // callee's own declaration.
        expect.soft(
          report.fPromptTag,
          "0337: .sev belongs to the callee's declaration (a different file), so it does not compare equal to the caller's own Sev.",
        ).toBe(false);
        expect.soft(
          report.fPromptNotStr,
          "0337/0174: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);
        expect.soft(
          report.fPromptWho,
          "(fPromptWho) runtime-value-model.md:12 — the object is keyed by theta-side names and " +
            "the sibling field crosses unchanged",
        ).toBe("w");
        expect.soft(report.fSubOk, "(fSubOk) CONTROL — the subagent leg already returns Ok").toBe(
          true,
        );
        expect.soft(
          report.fSubTag,
          "0337: same cross-file inequality on the subagent leg — mode invariance.",
        ).toBe(false);
        expect.soft(
          report.fSubNotStr,
          "0337/0174: the returned value is a TAGGED enum, not a dropped bare string (cross-type equality is false per runtime-value-model.md:22).",
        ).toBe(false);
        expect.soft(report.fSubWho, "(fSubWho) CONTROL — the subagent leg's string field").toBe(
          "w",
        );

        // ---------------------------------------------------------------
        // Controls d / e / g — §Reproduction (b), the over-reach fence. The
        // same cell delivers every non-enum payload today; a fix that changes
        // any of these has widened past this report (§Fix (d)(7), GOV-15).
        // ---------------------------------------------------------------

        expect.soft(
          report.dPromptOk,
          "(dPromptOk) CONTROL — invoke<string> over the prompt→prompt cell",
        ).toBe(true);
        expect.soft(
          report.dPromptVal,
          "(dPromptVal) CONTROL — the string value is unchanged",
        ).toBe("PSTR");
        expect.soft(
          report.ePromptOk,
          "(ePromptOk) CONTROL — invoke<S> over an enum-FREE schema",
        ).toBe(true);
        expect.soft(report.ePromptA, "(ePromptA) CONTROL — the object's string field").toBe("x");
        expect.soft(report.ePromptB, "(ePromptB) CONTROL — the object's boolean field").toBe(true);
        expect.soft(
          report.gPromptOk,
          "(gPromptOk) CONTROL — invoke<array<integer>> over the prompt→prompt cell",
        ).toBe(true);
        expect.soft(
          report.gPromptElem0,
          "(gPromptElem0) CONTROL — the array's first element is unchanged",
        ).toBe(1);

        // The refusal is loud on the invoke boundary but silent on the
        // diagnostic channel: `#validateInvokeReturn` mints the
        // `InvokeInfraError` and emits nothing. An empty drain is part of the
        // signature, and a non-empty one means the run failed for a different
        // reason than the return-value refusal.
        expect.soft(
          diagnostics,
          `the drive emitted diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toEqual([]);

        // PIC-59: one invocation per process — after the envelope the child
        // self-exits 0.
        const exit = await exitPromise;
        expect(exit.code).toBe(0);
        expect(exit.signal).toBeNull();
      } finally {
        // Reap on every path (idempotent on an already-exited child), then await
        // its exit (bounded) before dropping the scratch dir — the dying child's
        // cwd is inside scratchDir, so an immediate rmSync could throw EBUSY and
        // replace the primary assertion error with a less diagnostic one.
        child.kill();
        let reapTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          exitPromise,
          new Promise<void>((resolve) => {
            reapTimer = setTimeout(resolve, 5_000);
          }),
        ]);
        clearTimeout(reapTimer);
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort scratch cleanup; never mask the primary test failure.
        }
      }
    },
    150_000,
  );
});
