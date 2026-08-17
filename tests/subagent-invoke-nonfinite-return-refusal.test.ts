// Bug 0180 — a typed `invoke<T>` of a `mode: subagent` callee whose final value
// carries a non-finite `number` binds a value the callee never returned, or a
// refusal that blames the wrong thing. `serializeOkEnvelope` is `JSON.stringify`
// and JSON has no non-finite form, so the child writes
// `{"theta_result":{"v":1,"ok":null}}`; the parent then refuses that `null` under
// `{"type":"number"}` with `invoke<number> return value failed validation` — a
// message naming the annotation for a callee that returned exactly the annotated
// type — or ADMITS it under `{"type":["number","null"]}` and binds `null` where
// the callee produced `Infinity`, with no diagnostic anywhere.
// `docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md`.
//
// THIS FILE IS THE PARENT'S VIEW. The unit witness
// (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts`) drives the shipped
// child-side writer `driveSubagentRootRegime` in-process and observes the
// envelope line it writes. What that cannot show is what the INVOKE PARENT then
// binds: the envelope is consumed by `driveSubagentChild`
// (`src/runtime/subagent-json-driver.ts`), settled as the crossing `Result`, and
// handed to `#validateInvokeReturn` — a chain the bug document itself marks
// "read from source rather than driven" (§Provenance) for exactly this hop. Here
// it is driven: real spawned `pi` children, the real production spawn path, and
// the parent's own binding as the observable.
//
// WHAT MOVES UNDER THE SETTLED ROUTE (§Fix (b) — refuse child-side). The child
// detects a non-finite `number` anywhere in the `Ok` payload BEFORE
// `serializeOkEnvelope` and writes an `err` envelope instead, carrying an
// `InvokeInfraError { cause: "return_validation" }` whose message names the value
// and its RFC-6901 position. `#validateInvokeReturn` early-returns on a
// non-`Ok` result, so that carrier reaches the caller verbatim. So:
//
//   - `invoke<number>`      HEAD: Err "invoke<number> return value failed validation"
//                           after: Err "subagent return value is not JSON-representable: Infinity"
//   - `invoke<number|null>` HEAD: Ok(null) — the S1 arm, silent
//                           after: the same named refusal
//   - `invoke<NBox>`        HEAD: Ok({n:null,who:"w"}) — the S1 arm one level down
//                           after: the same refusal, positioned ` at /n`
//
// The prompt→prompt leg is UNTOUCHED (§Fix (a) and (d) are not taken), so no row
// here spawns a `mode: prompt` callee; that leg's zero-flip evidence is the unit
// witness's PROMPT cells.
//
// SPEC. `docs/spec_topics/invocation.md:36` (§Final-value propagation across
// callees) fixes the return surface as mode-invariant and fixes the envelope as
// this leg's CARRIAGE — the value "crosses the subagent boundary as the `ok` arm
// of the single-JSONL-line `{"theta_result": …}` return envelope" — with INV-5
// requiring the parent to derive the result solely from it. Nothing specifies it
// as a filter that substitutes one value for another. `:55` (§Cross-mode
// semantics) fixes that the callee's mode selects conversation isolation and
// nothing else. `docs/spec_topics/runtime-value-model.md:8` (the `number` row)
// names the non-finite results as values of the type;
// `docs/spec_topics/expressions.md:232` fixes that `1 / 0` produces one without
// panicking; `docs/spec_topics/query/query-escapes-stringification.md:22` is the
// rendering the refusal message reuses (`Infinity` → `Infinity`).
// `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59) owns the
// envelope and its fail-closed inventory, and its `Ok`-values bullet carries the
// false premise — measured at `34db8505` as `:110`: "**`Ok` values** serialise
// per the runtime value model (JSON-representable by construction)."
// `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15) is why
// the finite rows below assert UNCHANGED values.
//
// TOKENS: none. Every callee body is a pure tail expression and the root is a
// `let` chain ending in one, so no query is issued and no provider is contacted.
// The marshalled `--provider`/`--model` reference (PIC-62) only satisfies the
// launch argv shape.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three, and each is a
// LOUD precondition rather than a skip: `process.argv[1]` replaced by the repo's
// own pi CLI entry through the `ExecutableHost` (under vitest `argv[1]` is
// vitest's entry script, and rung 1 would spawn `node <vitest-entry>`),
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/` so
// the child loads the build under test rather than an ambient install, and
// `parentPid` written beside it because the control plane is AUTHENTICATED
// (`subagent.md` #subagent-control-plane-authentication) and an unauthenticated
// pin is stripped in silence. The harness shape is bug 0067's witness
// (`tests/subagent-invoke-inbound-enum-tag.test.ts`) and bug 0174's
// (`tests/invoke-prompt-cell-enum-return.test.ts`).
//
// FIXTURE SHAPE CONSTRAINTS, inherited from bug 0174's witness. No callee
// declares `params:` and no body feeds a `.keys()` call into an `array<T>`-declared
// sink: both shapes make a spawned child exit 0 with NO `theta_result` envelope
// (bugs 0178 and 0179), which would replace this file's observable with a
// launch-path one. Every declaration a fixture needs is made in its own body.
//
// TIER: integration (real spawned children). The unit tier cannot reach this
// observable — the parent's binding is produced by a chain that begins with a
// real child process's stdout — and the live tier is not needed, because no
// fixture issues a query, so no provider or model participates and the whole run
// is deterministic.

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
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
      `precondition unmet: ${what} not found at ${path} — the bug-0180 non-finite ` +
        `subagent-return witness needs the repo install (npm install) and the built extension ` +
        `entry; it never silently skips.`,
    );
  }
}

// ===========================================================================
// Registry anchor (DIAG-4). The expected refusal message is COMPOSED from the
// halves of the registry row's *Message* template via `registryMessage`, never
// copied as prose — the same discipline
// `tests/subagent-root-registration-refusal-envelope.test.ts` follows.
// ===========================================================================

/** `theta/runtime/subagent-return-value-not-representable` — the route-(b) refusal code. */
const REFUSAL_CODE = "theta/runtime/subagent-return-value-not-representable";

/** The `<value>` placeholder the registry row's *Message* template carries. */
const VALUE_PLACEHOLDER = "<value>";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/** The registry row's normative *Message* template, `undefined` while the row is absent. */
const REFUSAL_TEMPLATE = registryMessage(REGISTRY, REFUSAL_CODE) as string | undefined;

/**
 * The expected shipped refusal message for a refusal at `pointer` rendering
 * `value`, composed from the registry template's halves: the head with its
 * trailing `: ` stripped, the ` at <pointer>` segment (empty at the root), `: `,
 * and the `String(value)` rendering.
 *
 * The shipped string interpolates `<value>` and carries a positional segment the
 * template does not spell out, exactly as
 * `theta/runtime/subagent-params-validation-failed`'s registry template
 * (`docs/spec_topics/diagnostics/code-registry-runtime.md:31`) omits the
 * ` at <path>` segment `refuseParams` emits
 * (`src/runtime/subagent-params.ts:304`) — hence an anchored composition over
 * the template's byte-identical halves rather than a bare comparison to it.
 *
 * A missing or malformed row yields an UNMATCHABLE marker naming the gap rather
 * than a throw: the throw would unwind before this file's primary observables
 * (which row bound what) were asserted, and the copied-prose fallback DIAG-4
 * forbids would let a wrong message pass. Route (b) registers the code in the
 * same commit (§Fix (b), "It needs a registered code and its same-commit spec
 * edits"), so the marker is itself a correct red.
 */
function expectedRefusalMessage(pointer: string, value: number): string {
  const template = REFUSAL_TEMPLATE;
  if (template === undefined) {
    return (
      `<unavailable: docs/spec_topics/diagnostics/code-registry-runtime.md carries no Message ` +
      `row for ${REFUSAL_CODE}, and DIAG-4 makes that column the only source for this string>`
    );
  }
  const cut = template.indexOf(VALUE_PLACEHOLDER);
  const head = cut < 0 ? "" : template.slice(0, cut);
  const separator = ": ";
  if (cut < 0 || !head.endsWith(separator)) {
    return (
      `<unavailable: the ${REFUSAL_CODE} registry Message template ${JSON.stringify(template)} ` +
      `does not carry ${VALUE_PLACEHOLDER} after a ${JSON.stringify(separator)} separator, so ` +
      `the ' at <pointer>' segment has no anchored insertion point>`
    );
  }
  const tail = template.slice(cut + VALUE_PLACEHOLDER.length);
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
}

// ---------------------------------------------------------------------------
// The callee fixtures. Every one is `mode: subagent`, so every `invoke` below
// spawns a real grandchild and crosses a real PIC-59 envelope.
// ---------------------------------------------------------------------------

const SUBAGENT_FRONTMATTER = "---\nmode: subagent\n---\n";

const NBOX_DECL = "schema NBox { n: number | null, who: string }\n";

/**
 * Three files carrying the byte-identical non-finite body, one per annotation
 * under test, so no two rows share a callee and a per-callee effect cannot
 * confound them.
 */
const NONFINITE_BODY = "1 / 0\n";

const FIXTURES: Readonly<Record<string, string>> = {
  // `invoke<number>` — the loud, misattributed arm.
  "kidnum.theta": SUBAGENT_FRONTMATTER + NONFINITE_BODY,
  // `invoke<number | null>` — the S1 arm at the root.
  "kidnul.theta": SUBAGENT_FRONTMATTER + NONFINITE_BODY,
  // `invoke<NBox>` — the S1 arm one level down, at a nullable schema field.
  "kidnbox.theta": SUBAGENT_FRONTMATTER + NBOX_DECL + 'NBox { n: 1 / 0, who: "w" }\n',
  // The finite control: the leg itself is sound.
  "kidctl.theta": SUBAGENT_FRONTMATTER + "3 / 2\n",
  // The pinned NON-GOAL: `-0` is finite, so it must keep crossing as an `ok`
  // envelope (carrying `0`). The lost sign is a separately recorded residual.
  "kidneg.theta": SUBAGENT_FRONTMATTER + "0 * -1\n",
};

/**
 * The driven root: five typed `invoke`s reduced through `match` into report
 * fields, so a refused row is DATA rather than an unwind. `?` would propagate
 * the first `Err` and hide every row behind it.
 *
 * Every annotation resolves against this root's own declarations —
 * `#resolveReturnSite` resolves an `invoke<T>` annotation in the CALLER's body.
 */
const TOP_NONFINITE = [
  "---",
  "mode: subagent",
  "---",
  "schema NBox { n: number | null, who: string }",
  "schema R {",
  "  numOk: boolean, numMsg: string, numCause: string,",
  "  nulOk: boolean, nulMsg: string, nulCause: string,",
  "  boxOk: boolean, boxMsg: string, boxCause: string, boxWho: string,",
  "  ctlOk: boolean, ctlVal: number,",
  "  negOk: boolean, negVal: number",
  "}",
  'let rn = invoke<number>("./kidnum.theta")',
  "let numOk = match rn { Ok(v) => true, Err(e) => false }",
  'let numMsg = match rn { Ok(v) => "OK", Err(e) => e.message }',
  'let numCause = match rn { Ok(v) => "OK", Err(e) => e.cause }',
  'let ru = invoke<number | null>("./kidnul.theta")',
  "let nulOk = match ru { Ok(v) => true, Err(e) => false }",
  'let nulMsg = match ru { Ok(v) => "OK", Err(e) => e.message }',
  'let nulCause = match ru { Ok(v) => "OK", Err(e) => e.cause }',
  'let rb = invoke<NBox>("./kidnbox.theta")',
  "let boxOk = match rb { Ok(v) => true, Err(e) => false }",
  'let boxMsg = match rb { Ok(v) => "OK", Err(e) => e.message }',
  'let boxCause = match rb { Ok(v) => "OK", Err(e) => e.cause }',
  'let boxWho = match rb { Ok(v) => v.who, Err(e) => "ERR" }',
  'let rc = invoke<number>("./kidctl.theta")',
  "let ctlOk = match rc { Ok(v) => true, Err(e) => false }",
  "let ctlVal = match rc { Ok(v) => v, Err(e) => 0 - 1 }",
  'let rz = invoke<number>("./kidneg.theta")',
  "let negOk = match rz { Ok(v) => true, Err(e) => false }",
  "let negVal = match rz { Ok(v) => v, Err(e) => 0 - 1 }",
  "R {",
  "  numOk: numOk, numMsg: numMsg, numCause: numCause,",
  "  nulOk: nulOk, nulMsg: nulMsg, nulCause: nulCause,",
  "  boxOk: boxOk, boxMsg: boxMsg, boxCause: boxCause, boxWho: boxWho,",
  "  ctlOk: ctlOk, ctlVal: ctlVal,",
  "  negOk: negOk, negVal: negVal",
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

describe("bug 0180 — a typed invoke of a subagent-mode callee whose final value is non-finite", () => {
  it(
    "the parent binds a named refusal, not a substituted null nor a message blaming the annotation",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // One discovery root holds every fixture so the root theta's `./` callee
      // paths resolve beside it.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0180-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top-nonfinite.theta"), TOP_NONFINITE);

      // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
      // (node + the entry script); pinned to the repo's own pi install. Under
      // vitest `process.argv[1]` is vitest's own entry, so an unpinned rung 1
      // would spawn `node <vitest-entry> …` and the child would die instantly.
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
      // `invoke`s spawn; `parentPid` is what AUTHENTICATES the pin at each level,
      // so omitting it would strip the pin silently and bind ambient builds
      // instead.
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top-nonfinite",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            tools: [],
            emptyCallableSet: true,
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
        // any of its five grandchildren making no progress) kill the pair so the
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
          calleePath: join(thetaDir, "top-nonfinite.theta"),
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
        const seen = JSON.stringify(report);

        // Soft across every field so ONE run names every row that is wrong,
        // rather than stopping at the first.

        // DIAG-4 anchor, asserted first and softly: every message expectation
        // below is composed from this row's halves, so an absent row is named
        // once here rather than inferred from three unmatchable comparisons.
        expect.soft(
          REFUSAL_TEMPLATE,
          `DIAG-4 anchor (bug 0180 §Fix (b)): docs/spec_topics/diagnostics/code-registry-runtime.md ` +
            `must carry the Message row for ${REFUSAL_CODE}, joining the four OTHER RFC-0006 ` +
            `marshalling codes already enumerated there`,
        ).toBeDefined();

        // ---------------------------------------------------------------
        // Row num — `invoke<number>`. The LOUD, MISATTRIBUTED arm.
        //
        // At HEAD the caller gets `Err` with `invoke<number> return value failed
        // validation` — the annotation's name, for a callee that returned exactly
        // the annotated type (`runtime-value-model.md:8`: the non-finite results
        // ARE values of `number`). The value was destroyed in the child's
        // envelope writer, one process away from the message. Under route (b) the
        // refusal happens where the corruption happens and names the value.
        // ---------------------------------------------------------------

        expect.soft(
          report.numOk,
          `(numOk) invocation.md:36 — the refusal itself is correct given its input, so this ` +
            `stays an Err; the row exists to pin WHICH Err. Report: ${seen}`,
        ).toBe(false);
        expect.soft(
          report.numMsg,
          `(numMsg) PRIMARY (bug 0180 §Fix (b)) — the message must name the non-finite value ` +
            `the child could not represent, not the annotation the callee satisfied. Report: ` +
            seen,
        ).toBe(expectedRefusalMessage("", Infinity));
        expect.soft(
          report.numCause,
          `(numCause) the existing return_validation cause carries it — route (b) adds no ` +
            `InvokeInfraCause member. Report: ${seen}`,
        ).toBe("return_validation");

        // ---------------------------------------------------------------
        // Row nul — `invoke<number | null>`. THE S1 ARM.
        //
        // `number | null` lowers to `{"type":["number","null"]}` and the
        // substituted `null` is a member, so at HEAD BOTH legs return `Ok` with
        // different values — `Infinity` on the prompt cell, `null` here — and
        // nothing reports it: no diagnostic code, no runtime event, no system
        // note. That is GOV-15 observable (a) moving on the callee's `mode:`
        // frontmatter alone. §Fix (b) "removes the silent arm entirely … no
        // caller ever binds a `null` the callee did not produce."
        // ---------------------------------------------------------------

        expect.soft(
          report.nulOk,
          `(nulOk) PRIMARY (bug 0180, the S1 arm): a nullable annotation must not silently admit ` +
            `the substituted null — at HEAD this binds Ok(null) where the callee produced ` +
            `Infinity. Report: ${seen}`,
        ).toBe(false);
        expect.soft(
          report.nulMsg,
          `(nulMsg) and the refusal names the value, so the author is told what was lost. ` +
            `Report: ${seen}`,
        ).toBe(expectedRefusalMessage("", Infinity));
        expect.soft(
          report.nulCause,
          `(nulCause) carried on the same cause as the non-nullable arm. Report: ${seen}`,
        ).toBe("return_validation");

        // ---------------------------------------------------------------
        // Row box — `invoke<NBox>` over `schema NBox { n: number | null, who:
        // string }`. THE S1 ARM ONE LEVEL DOWN.
        //
        // Measured: the envelope carries `{"n":null,"who":"w"}`, the same
        // compiled document validates it `{"ok":true}`, and the caller binds a
        // record whose `n` the callee never produced while its sibling `who`
        // crossed intact — so the corruption is invisible field-by-field. Under
        // route (b) the position rides the message as an RFC-6901 pointer,
        // reported in the process where it is still true of the real value.
        // ---------------------------------------------------------------

        expect.soft(
          report.boxOk,
          `(boxOk) PRIMARY (bug 0180, the S1 arm at depth): a nullable schema FIELD must not ` +
            `silently absorb the substituted null. Report: ${seen}`,
        ).toBe(false);
        expect.soft(
          report.boxMsg,
          `(boxMsg) the position is the RFC-6901 JSON Pointer to the offending field. Report: ` +
            seen,
        ).toBe(expectedRefusalMessage("/n", Infinity));
        expect.soft(
          report.boxCause,
          `(boxCause) same carrier at depth. Report: ${seen}`,
        ).toBe("return_validation");
        expect.soft(
          report.boxWho,
          `(boxWho) the whole payload is refused, so no field of it binds — at HEAD the sibling ` +
            `string field crosses intact and makes the lost 'n' invisible. Report: ${seen}`,
        ).toBe("ERR");

        // ---------------------------------------------------------------
        // CONTROLS — the over-reach fence (GOV-15,
        // `governance/source-language-stability.md:5`). GREEN NOW and MUST STAY
        // GREEN: §Reproduction (b)'s finite control shows "the leg itself is
        // sound: the loss is specific to the values `JSON.stringify` has no form
        // for."
        // ---------------------------------------------------------------

        expect.soft(
          report.ctlOk,
          `(ctlOk) CONTROL — 3 / 2 is finite and crosses the leg today. Report: ${seen}`,
        ).toBe(true);
        expect.soft(
          report.ctlVal,
          `(ctlVal) CONTROL — and binds unchanged. Report: ${seen}`,
        ).toBe(1.5);

        // The PINNED NON-GOAL. `0 * -1` is `-0`, which `JSON.stringify` renders
        // `0`, so the sign is lost — a separately recorded residual, NOT this
        // report's class. `-0` is finite and route (b) detects finiteness only,
        // so the `ok` envelope must still be written and the caller must still
        // bind. A red here means the detection widened into sign preservation and
        // newly refuses a today-passing input with no registered class behind it.
        expect.soft(
          report.negOk,
          `(negOk) CONTROL / PINNED NON-GOAL — -0 is finite, so it must keep crossing as an ok ` +
            `envelope. Report: ${seen}`,
        ).toBe(true);
        expect.soft(
          report.negVal,
          `(negVal) CONTROL — the caller binds 0; the lost sign is a recorded residual, not this ` +
            `report's class. Report: ${seen}`,
        ).toBe(0);

        // The parent's own diagnostic drain. At HEAD it is EMPTY — that is the
        // report's point: the loud arm mints an `InvokeInfraError` and emits
        // nothing, and the silent arm emits nothing either. Route (b) puts the
        // diagnostic in the CHILD process (asserted at the writer in
        // `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`), whose
        // diagnostic channel is process-local, so this parent-side drain stays
        // empty across the fix. A non-empty drain here means the run failed for a
        // different reason than the return boundary.
        expect.soft(
          diagnostics,
          `the parent-side drive emitted diagnostics: ${JSON.stringify(diagnostics)}`,
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
