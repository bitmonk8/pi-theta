// Bug 0172, boundary 2 — a typed `.theta`-callable tool-call return never
// acquires a runtime schema, so neither AJV nor the inbound wire-name
// translation pass runs on it. `docs/spec_topics/tool-calls.md:23` gives the
// registered-theta row the return type `Result<T, QueryError>` where `T` is the
// callee's inferred return type, and `runToolCallEffect`
// (`src/runtime/effectful-statement-host.ts:273`) routes such a call through the
// invoke trampoline. But `#resolveCallAsInvoke`
// (`src/extension/production-theta-producer.ts:3149`) builds the `InvokeChild`
// with `returnSchema` `null` (`:3164`), and `#validateInvokeReturn` (`:3436`)
// returns its argument unchanged on that value (`:3442-3443`) — before AJV and
// before the pass. `docs/spec_topics/runtime-value-model.md:34` names
// "tool-call return decoding where typed" as one of the four inbound boundaries
// and states the rule once for all of them.
//
// WHY THIS FILE SPAWNS A REAL CHILD, AND WHY NOTHING CHEAPER WITNESSES IT. An
// IN-PROCESS callee's final value is already theta-side: its object was built by
// `buildObjectSchemaValue` (`src/runtime/value.ts:385`), so it is already
// branded and already declaration-ordered, and its enum variants already carry
// their declaring-enum tags. Such a value crosses the invoke return boundary
// tagged whether or not any pass runs, so an in-process cell cannot witness this
// defect at all. Only a `mode: subagent` callee's `theta_result` envelope
// carries the raw wire form — `JSON.stringify` child-side, `JSON.parse`
// parent-side (PIC-59) — which is the one provenance at this boundary where the
// tag is genuinely absent and the pass is the only thing that can restore it.
// The same reasoning is why bug 0067's witness
// (`tests/subagent-invoke-inbound-enum-tag.test.ts`) spawns, and this file
// reuses that harness shape.
//
// EVERY CALLEE IS `mode: subagent`. Bug 0174 (open) measures that a typed
// `invoke<T>` of a `mode: prompt` callee fails return-validation for every
// named-enum position, because the in-process value reaches AJV as a boxed
// `String`. Pinning a prompt-mode callee with an enum-bearing return — as green
// OR as a correct `Err` — would encode that open bug's behaviour, so this file
// exercises subagent-mode callees only.
//
// TOKENS: none. Every theta body below is a pure tail expression or a single
// `return`; no callee issues a query, so no provider is contacted. The
// marshalled `--provider`/`--model` reference only satisfies the PIC-62 launch
// argv shape.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three: `process.argv[1]`
// replaced by the repo's own pi CLI entry through the `ExecutableHost`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/`,
// and `parentPid` written beside it so the AUTHENTICATED control plane does not
// strip the pin. Without them the observation would name whatever ambient theta
// install the machine carries.
//
// WHAT IS RED HERE AND WHY. Cells (a) and (b) red on the untranslated envelope:
// a bare string that compares `false` against the caller's own variant, at the
// root and at nested-object-field depth. Both are assertions over the driven
// root's own report object, never a compile or harness error. Cells (c) through
// (f) are controls, green on both sides.
//
// THE ORDER HALF IS NOT ASSERTED HERE, and bug 0120's coordination note is why:
// this boundary's producer is a theta child whose object `buildObjectSchemaValue`
// already ordered before `JSON.stringify`, so the envelope arrives in
// declaration order and a rebuild that orders changes nothing observable. The
// order half is witnessed where a MODEL chooses the order —
// `tests/inbound-boundary-typed-query.test.ts`,
// `tests/inbound-boundary-binder-args.test.ts` and
// `tests/inbound-rebuild-declaration-order.test.ts`.
//
// THE BRAND HALF IS NOT ASSERTED HERE. `schemaTagOf` is not a theta-side
// surface, and the only theta-visible consequence of the brand — the QRY-18
// outbound render's rename map — needs a query, which would cost tokens and
// determinism. The brand half of this bug is witnessed at the two boundaries
// whose value is readable in-process: `tests/inbound-boundary-typed-query.test.ts`
// and `tests/inbound-boundary-binder-args.test.ts`.
//
// TIER: integration (real child process), offline and provider-free. A unit
// test cannot reach it: the wire form only exists across the process boundary,
// and `#resolveCallAsInvoke` / `#validateInvokeReturn` are private to
// `ProductionThetaProducer`. A live test would add a provider and nothing else.
//
// Spec: runtime-value-model.md:34 (§Wire-name translation, the inbound bullet
// and its four-boundary closing sentence), :13 (the enum row), :22 (the
// cross-type equality rule an untagged variant falls into); tool-calls.md:23
// (the registered-theta return-type row); expressions.md:118 (the
// declaration-order `keys()` clause); pi-integration-contract/subagent.md
// (PIC-58 launch contract, PIC-59 envelope).

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
      `precondition unmet: ${what} not found at ${path} — the bug-0172 \`.theta\`-callable ` +
        `witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}

/** Frontmatter every callee shares: the spawned-process regime whose envelope carries the wire form. */
const SUBAGENT_FRONTMATTER = ["---", "mode: subagent", "---"];

/** Enum-root tail: the shallowest position the derivation names, and the plainest envelope. */
const KID_ENUM = [
  ...SUBAGENT_FRONTMATTER,
  'enum Sev { High = "high", Low = "low" }',
  "Sev.High",
  "",
].join("\n");

/** Schema-root tail with a named-enum field — the depth the walk must recurse to. */
const KID_OBJECT = [
  ...SUBAGENT_FRONTMATTER,
  'enum Sev { High = "high", Low = "low" }',
  "schema P { sev: Sev, who: string }",
  'P { sev: Sev.High, who: "w" }',
  "",
].join("\n");

/** Floor: a plain-string tail names no declared type, so the derivation stays `null`. */
const KID_PLAIN = [...SUBAGENT_FRONTMATTER, '"plain"', ""].join("\n");

/** Floor: a body carrying a `return` statement, which the derivation deliberately excludes. */
const KID_RETURN = [
  ...SUBAGENT_FRONTMATTER,
  'enum Sev { High = "high", Low = "low" }',
  "return Sev.High",
  "",
].join("\n");

/**
 * The driven root: four `<name>()` calls through frontmatter `tools:`, each
 * compared against a locally constructed variant of the caller's own
 * declarations, with one in-process control on the same line.
 */
const TOP = [
  "---",
  "mode: subagent",
  "tools:",
  "  - ./kid.theta",
  "  - ./kidobj.theta",
  "  - ./kidplain.theta",
  "  - ./kidret.theta",
  "---",
  'enum Sev { High = "high", Low = "low" }',
  "schema R { crossed: boolean, objSev: boolean, objWho: string, " +
    "plainTail: string, retStmt: boolean, local: boolean }",
  "let re = kid()",
  "let ve = re?",
  "let ro = kidobj()",
  "let vo = ro?",
  "let rp = kidplain()",
  "let vp = rp?",
  "let rr = kidret()",
  "let vr = rr?",
  "R { crossed: ve == Sev.High, objSev: vo.sev == Sev.High, objWho: vo.who, " +
    "plainTail: vp, retStmt: vr == Sev.High, local: Sev.High == Sev.High }",
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

describe("bug 0172 — a typed .theta-callable tool-call return performs the inbound translation pass (tool-calls.md:23)", () => {
  it(
    "a named-enum value returned by a tools:-named subagent callee compares equal to the caller's own variant",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // One discovery root holds every fixture so the root theta's `./` callee
      // paths resolve beside it.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0172-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      writeFileSync(join(thetaDir, "kid.theta"), KID_ENUM);
      writeFileSync(join(thetaDir, "kidobj.theta"), KID_OBJECT);
      writeFileSync(join(thetaDir, "kidplain.theta"), KID_PLAIN);
      writeFileSync(join(thetaDir, "kidret.theta"), KID_RETURN);
      writeFileSync(join(thetaDir, "top.theta"), TOP);

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
      // inherits down to the grandchildren the root theta's calls spawn;
      // `parentPid` is what authenticates the pin at each level, so omitting it
      // would strip the pin silently and bind ambient builds instead.
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top",
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
          calleePath: join(thetaDir, "top.theta"),
          emitDiagnostic,
          clock: new WallClock(),
        });
        clearTimeout(watchdog);

        expect(
          killedByWatchdog,
          "the driven root made no progress within 90s — the four nested subagent spawns did " +
            "not settle, so nothing about the inbound pass was observed",
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

        // (a) PRIMARY. runtime-value-model.md:34 reattaches the declaring-enum
        // tag "so the resulting value compares equal to a locally constructed
        // variant of the same enum", and tool-calls.md:23 types this call site
        // by inference over the statically resolved callee. Soft across the
        // report's fields so ONE run names every position that lost its tag.
        expect.soft(
          report.crossed,
          "(a) tool-calls.md:23 + runtime-value-model.md:34 — a `<name>()` call through frontmatter " +
            "`tools:` whose callee's inferred return type is a named enum must yield a TAGGED " +
            "variant; an untagged bare string takes valuesEqual's cross-type arm (:22) and reads false",
        ).toBe(true);

        // (b) PRIMARY. Same rule at nested-object-field depth: :34's walk
        // "recurses through arrays, nested object fields".
        expect.soft(
          report.objSev,
          "(b) runtime-value-model.md:34 — the walk recurses through nested object fields, so a " +
            "named-enum FIELD of a schema-typed callable return must compare equal to the " +
            "caller's own variant",
        ).toBe(true);

        // (c) CONTROL. runtime-value-model.md:12 keys object values by
        // theta-side names, so re-tagging and re-branding never rename.
        expect.soft(
          report.objWho,
          "(c) runtime-value-model.md:12 — a returned object is keyed by theta-side names, so a " +
            "plain declared field stays readable at its own name",
        ).toBe("w");

        // (d) CONTROL, the derivation's floor. A callee whose tail is a plain
        // string names no declared type, so no schema is derived, no AJV runs
        // and no pass follows — the value crosses exactly as it does today.
        // Green on both sides; this cell is not a red witness.
        expect.soft(
          report.plainTail,
          "(d) the derivation names a type only for a tail that is a schema constructor or an " +
            "enum-variant access; a plain-string tail keeps `null` and its value crosses unchanged",
        ).toBe("plain");

        // (e) CONTROL, the derivation's floor. A body carrying a `return`
        // statement is excluded from the derivation, so it acquires no schema
        // and its enum value crosses untagged, leaving the comparison false.
        // Green on both sides; this cell is not a red witness, and it reds only
        // if the derivation is widened past the conservative shape.
        expect.soft(
          report.retStmt,
          "(e) a body with a `return` statement is outside the conservative derivation, so it " +
            "acquires no schema and its enum value stays an untagged string (:22)",
        ).toBe(false);

        // (f) CONTROL: the same comparison in-process, same theta, same line —
        // isolates the loss to the values that crossed the process boundary.
        expect.soft(
          report.local,
          "(f) the comparison mechanism itself must hold in-process; a red here means the fixture, " +
            "not the boundary, is what failed",
        ).toBe(true);

        // The defect is silent: no `Err`, no diagnostic. An empty drain is part
        // of the signature, and a non-empty one means the run failed for a
        // different reason than the missing pass.
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
