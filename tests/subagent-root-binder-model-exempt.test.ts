// Bug 0178, element (a) — a `mode: subagent` callee whose `params:` block is not
// binder-bypass-eligible fails to register inside its own spawned child, because
// the load-time binder-model gate is blind to the subagent-root regime PIC-60
// exempts from the binder entirely. The child's `-p "/<slug>"` then degrades to
// ordinary prompt text, one unbudgeted assistant turn runs, and the process exits
// 0 with no `theta_result` envelope — so the parent reports an exit detail
// (`subagent child exited without a return envelope: exited code 0`) instead of
// the cause. This file is that report's §Fix (c)(5) witness: §Reproduction (b)'s
// direct rows plus §Reproduction (a)'s `tools:`-named grandchild row, re-driven
// through real spawned children.
//
// THE MECHANISM, BY SYMBOL. `runComposePass`
// (`src/extension/production-composition.ts`) classifies each parsed theta's
// bypass eligibility from its static `params:` fields over `classifyBinderBypass`
// (`src/binder/binder-envelope.ts`), resolves a binder model for every non-bypass
// theta over `resolveBinderModel` (`src/binder/binder-model.ts`), and `continue`s
// past registration when the two-step chain (`bind_model:` → `theta.binderModel`)
// resolves to nothing. The same function has already bound the regime from
// `detectSubagentRootRegime` (`src/runtime/subagent-root-regime.ts`) before that
// loop, and the child-side marshalled path never calls the binder at all —
// `driveSubagentRootRegime` intakes the params through `#intakeSubagentRootParams`
// and binds them via `bindParamsInbound` (`src/runtime/inbound-boundary.ts`), both
// in `src/extension/production-theta-producer.ts`. The precondition is enforced
// against a call the process cannot make.
//
// WHAT EACH ROW ASSERTS. Every row's expected value is the SPECIFIED behaviour,
// not the current one. `binder-bypass-and-envelope.md` §Binder bypass
// (#bypass-cases) admits exactly two shapes — no params, and one non-defaulted
// `string` field — so `sev: Sev`, `box: Box` and `xs: array<string>` are all
// `{ kind: "binder" }`, and all three must nevertheless run in a child that
// `subagent.md` #pic-60 says skips the binder entirely.
//
//   pstr    single-string bypass ........... control, unchanged behaviour
//   penum   named enum ..................... red today
//   psch    named schema ................... red today
//   parr    array<string>, no named type ... red today (the bypass CLASS is the
//                                            trigger, not the named type)
//   penumbm / pschbm / parrbm ............... the same three fixtures plus ONE
//                                            frontmatter line, `bind_model:`
//
// The `bind_model:` rows are the over-reach fence: element (a) must not change
// them. They also PIN the three red rows' expected values empirically — each is
// byte-identical to its subject row apart from that one line (they are built from
// the same body/params fragments below), so their measured `true` / `"w"` / `"a"`
// is what the subject rows must return once registration stops being refused.
//
// WHY `stdoutLines === 2` IS ASSERTED BESIDE THE ENVELOPE. Two lines is the
// session line plus the envelope — a child that registered its slug and ran a
// pure tail expression, with NO model turn. A green envelope beside a ~30-line
// stdout would mean the argv was still processed as prompt text and the turn the
// defect causes still happened (bug 0178 §Reproduction (b)); the line count is the
// only observable that separates the two.
//
// `penum` IS DOUBLE-DUTY. Its body compares the marshalled param against the
// callee's OWN declaring enum (`sev == Sev.High`), so a green `true` also
// witnesses the child-side inbound projection: `#intakeSubagentRootParams` routes
// the marshalled JSON through `bindParamsInbound`, which reattaches the
// declaring-enum tag across a real child boundary. That is bug 0172's §Fix (c)(6)
// child-side witness, which 0172's own fix could not write because this defect
// kills the child. An untagged bare `"high"` would take the cross-type arm of
// `valuesEqual` (`src/runtime/value.ts`) — the rule `runtime-value-model.md`
// §Wire-name translation states — and read `false`, so the assertion
// discriminates the projection, not merely the value's presence.
//
// TIER: integration — real spawned `pi` children through the production launch
// path (`launchSubagentChild` + `createProductionSpawnFn` + `driveSubagentChild`).
// A unit test cannot reach it: the refusal is taken by a DIFFERENT process's load
// pass, reading that process's own settings and regime marker, and the only
// parent-visible consequence is the exit-without-envelope carrier the child never
// contradicts. The composition-seam tier one rung down
// (`subagent-root-registration-refusal-envelope.test.ts`) can see the load
// decision but not the argv→prompt degradation and not the stdout-line count, so
// it cannot distinguish "registered and ran" from "prompted a model and exited".
// §Fix (c)(5) prescribes exactly one integration tier for this reason. Live tier
// would add a provider and nothing else.
//
// TOKENS. Every fixture body is a pure tail expression, so a child that REGISTERS
// its slug spends none: the specified behaviour of this file is provider-free.
// Pre-fix, each red row spends exactly one assistant turn — that is the defect
// being witnessed, not the harness, and it is what `stdoutLines` counts.
//
// HERMETICITY (§Fix (c)(5)'s "the witness must have no `theta.binderModel` in
// scope — a route states how it guarantees that"). `theta.binderModel` is read
// from BOTH `~/.pi/agent/settings.json` and `<cwd>/<config-dir>/settings.json`
// (`loadSettings`, `src/discovery/settings.ts`), and `mergeSettings` in that same
// module replaces a scalar wholesale with the project side. This witness therefore
// does not hope the operator's global file is empty: it PLANTS
// `<scratchDir>/.pi/settings.json` with a reference that matches no model on any
// machine and spawns every child with `cwd: <scratchDir>`. A reference matching no
// available model resolves to no model — `binder-model-and-context.md` §Binder
// model states it explicitly — and produces the same
// `theta/load/binder-model-unresolved`, so the refusal under test is guaranteed
// rather than machine-dependent. (Measured: swapping the planted reference for one
// the registry does match flips the same theta to registered, so the file is read
// and load-bearing.) The scratch tree deliberately has no `<scratchDir>/.pi/theta`
// directory — the fixtures live in `<scratchDir>/thetas` and reach the child
// through `thetaDirs`, so the planted settings file is the only thing `.pi/` holds.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three: `process.argv[1]`
// replaced by the repo's own pi CLI entry through the injected `ExecutableHost`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` naming this working tree's `extensions/`, and
// `parentPid: process.pid` written beside it so the AUTHENTICATED control plane
// (`subagent.md` #subagent-control-plane-authentication) does not strip the pin.
// Without them the observation would name whatever ambient theta install the
// machine carries. Every launch also names BOTH params carriers and the
// callable-hash carrier — the chosen one carrying its value, the others explicitly
// `undefined` — because the patch is layered over this process's inherited
// environment and a single-key patch cannot clear an inherited sibling
// (`marshalParams`, `src/runtime/subagent-params.ts`, and the inline-first
// preference in `readMarshalledParams` that makes a leftover carrier silently
// win).
//
// Spec: pi-integration-contract/subagent.md #pic-58 (the regime and its env-marker
// selection), #subagent-launch-contract (the `-p "/<slug>"` row, one invocation per
// process), #pic-60 (the marshalled-params channel — "the binder is skipped
// entirely"), #pic-59 (the return envelope and the fail-closed no-envelope rule);
// binder/binder-bypass-and-envelope.md #bypass-cases (the two bypass shapes);
// binder/binder-model-and-context.md §Binder model (the refusal rule and the
// no-match-resolves-to-no-model rule); invocation.md §INV-5; tool-calls.md
// §"Argument shape" (a `.theta` callable takes its callee `params:` positionally
// in declaration order).

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
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../src/runtime/subagent-callable-hash";
import {
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
} from "../src/runtime/subagent-params";
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
 * the PIC-62 launch shape). NEVER CONTACTED by the specified behaviour: every
 * fixture body below is a pure tail expression.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/**
 * The planted project-settings binder-model reference. Chosen to match no model
 * in any host registry, so the two-step chain resolves to nothing on every
 * machine — the hermeticity guarantee this file's header states.
 */
const UNMATCHABLE_BINDER_MODEL = "no-such-model-bug0178";

/**
 * The `bind_model:` reference the fence rows carry. Whether it resolves on the
 * measuring host does NOT decide those rows: the marked root skips binder-model
 * resolution outright, so `bind_model:` is a dead frontmatter line for it.
 * MEASURED — substituting `no-such-provider/no-such-model-0178` for the value
 * below and re-running this file leaves all three fence rows green with
 * `stdoutLines === 2`. The default gate therefore carries no model-registry or
 * credential dependency here.
 *
 * The rows still fence. While the gate was regime-blind they were green only on
 * a host where this reference resolved, and that dependence is exactly what made
 * them the over-reach boundary: each is byte-identical to its subject row apart
 * from this one line, so an exemption reaching past the marked root would move a
 * fence row and not its subject. The value is the bug report's own control
 * vehicle (§Reproduction (b)'s `bind_model:` rows) and is kept verbatim.
 */
const FENCE_BIND_MODEL = "anthropic/claude-haiku-4-5";

/** Per-row bound on a child making no progress, below the outer test timeout. */
const ROW_WATCHDOG_MS = 120_000;

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0178 subagent-root ` +
        `binder-model-exemption witness needs the repo install (npm install); it never ` +
        `silently skips.`,
    );
  }
}

/** Assemble one `mode: subagent` fixture, so a fence row differs by exactly its one extra line. */
function subagentFixture(spec: {
  readonly bindModel?: string;
  readonly tools?: readonly string[];
  readonly params?: readonly string[];
  readonly body: readonly string[];
}): string {
  return [
    "---",
    "mode: subagent",
    ...(spec.bindModel === undefined ? [] : [`bind_model: ${spec.bindModel}`]),
    ...(spec.tools === undefined ? [] : ["tools:", ...spec.tools.map((entry) => `  - ${entry}`)]),
    ...(spec.params === undefined ? [] : ["params:", ...spec.params.map((field) => `  ${field}`)]),
    "---",
    ...spec.body,
    "",
  ].join("\n");
}

// The three non-bypass shapes, each declared once and shared between its subject
// row and its `bind_model:` fence row — the byte-identity the fence depends on.
const ENUM_PARAMS = ["sev: Sev"] as const;
const ENUM_BODY = ['enum Sev { High = "high", Low = "low" }', "sev == Sev.High"] as const;
const ENUM_PAYLOAD = JSON.stringify({ sev: "high" });

const SCHEMA_PARAMS = ["box: Box"] as const;
const SCHEMA_BODY = ["schema Box { who: string }", "box.who"] as const;
const SCHEMA_PAYLOAD = JSON.stringify({ box: { who: "w" } });

const ARRAY_PARAMS = ["xs: array<string>"] as const;
const ARRAY_BODY = ["xs[0]"] as const;
const ARRAY_PAYLOAD = JSON.stringify({ xs: ["a"] });

/** One directly-driven child: the fixture, its marshalled payload, and the value PIC-60 owes back. */
interface DirectRow {
  readonly stem: string;
  readonly text: string;
  /** The `PI_THETA_PARAMS` value, exactly as `marshalParams` writes it on the env channel. */
  readonly params: string | undefined;
  readonly expected: unknown;
  /** What a red on this row means — folded into every failure message. */
  readonly claim: string;
}

const DIRECT_ROWS: readonly DirectRow[] = [
  {
    stem: "pstr",
    text: subagentFixture({ params: ["sev: string"], body: ["sev"] }),
    params: ENUM_PAYLOAD,
    expected: "high",
    claim:
      "CONTROL — a single-string-bypass callee skips binder-model resolution outright, so " +
      "element (a) must leave it exactly as it is",
  },
  {
    stem: "penum",
    text: subagentFixture({ params: ENUM_PARAMS, body: ENUM_BODY }),
    params: ENUM_PAYLOAD,
    expected: true,
    claim:
      "SUBJECT — a named-enum param is non-bypass, so the child's load pass refuses the very " +
      "slug it was launched to run; `true` additionally witnesses bindParamsInbound reattaching " +
      "the declaring-enum tag child-side (bug 0172 §Fix (c)(6))",
  },
  {
    stem: "psch",
    text: subagentFixture({ params: SCHEMA_PARAMS, body: SCHEMA_BODY }),
    params: SCHEMA_PAYLOAD,
    expected: "w",
    claim: "SUBJECT — a named-schema param is non-bypass",
  },
  {
    stem: "parr",
    text: subagentFixture({ params: ARRAY_PARAMS, body: ARRAY_BODY }),
    params: ARRAY_PAYLOAD,
    expected: "a",
    claim:
      "SUBJECT — `array<string>` names no declared type at all, so the trigger is the bypass " +
      "CLASS and not the named type (the finding that fixes the report's subject)",
  },
  {
    stem: "penumbm",
    text: subagentFixture({
      bindModel: FENCE_BIND_MODEL,
      params: ENUM_PARAMS,
      body: ENUM_BODY,
    }),
    params: ENUM_PAYLOAD,
    expected: true,
    claim:
      "FENCE — byte-identical to `penum` plus one `bind_model:` line; it passes today and " +
      "element (a) must not perturb it",
  },
  {
    stem: "pschbm",
    text: subagentFixture({
      bindModel: FENCE_BIND_MODEL,
      params: SCHEMA_PARAMS,
      body: SCHEMA_BODY,
    }),
    params: SCHEMA_PAYLOAD,
    expected: "w",
    claim: "FENCE — byte-identical to `psch` plus one `bind_model:` line",
  },
  {
    stem: "parrbm",
    text: subagentFixture({
      bindModel: FENCE_BIND_MODEL,
      params: ARRAY_PARAMS,
      body: ARRAY_BODY,
    }),
    params: ARRAY_PAYLOAD,
    expected: "a",
    claim: "FENCE — byte-identical to `parr` plus one `bind_model:` line",
  },
];

/**
 * §Reproduction (a)'s production surface: a no-params (so bypass-eligible, so
 * registering) `mode: subagent` root that reaches the enum callee through
 * frontmatter `tools:`. The harness drives the root; the root spawns the callee
 * as its own GRANDCHILD, which is where the refusal happens. `tool-calls.md`
 * §"Argument shape" fixes the call shape — a `.theta` callable takes the callee's
 * `params:` positionally in declaration order, and the call returns a `Result`
 * that `?` unwraps.
 */
const TOP_STEM = "toppenum";
const TOP_FIXTURE = subagentFixture({
  tools: ["./penum.theta"],
  body: ['let r = penum("high")', "let v = r?", "v"],
});

/** Everything one driven row exposes; carried verbatim into every failure message. */
interface RowOutcome {
  readonly stem: string;
  readonly ok: boolean;
  readonly payload: unknown;
  readonly exit: ChildExitInfo | "no exit observed";
  readonly stdoutLines: number;
  readonly stderrLines: number;
  readonly stderrTail: readonly string[];
  readonly diagnostics: readonly string[];
  readonly killedByWatchdog: boolean;
  /** Set when the launch itself never produced a child (an infra failure, not a verdict). */
  readonly launchFailure?: string;
}

function report(outcome: RowOutcome): string {
  return JSON.stringify(outcome);
}

/**
 * Launch one real child for `slug` through the production path and drive it to
 * its envelope, recording every channel the row's assertions read. Kills and
 * reaps on every path so the next row starts from a quiet process tree.
 */
async function driveDirect(input: {
  readonly slug: string;
  readonly thetaDir: string;
  readonly scratchDir: string;
  readonly params: string | undefined;
  readonly host: ExecutableHost;
}): Promise<RowOutcome> {
  const diagnostics: Diagnostic[] = [];
  const emitDiagnostic = (diagnostic: Diagnostic): void => {
    diagnostics.push(diagnostic);
  };
  const launch = launchSubagentChild(
    {
      argv: {
        slug: input.slug,
        thetaDirs: [input.thetaDir],
        systemPrompt: "",
        tools: [],
        emptyCallableSet: true,
        provider: CHILD_MODEL_PROVIDER,
        model: CHILD_MODEL_ID,
        projectTrust: false,
      },
      cwd: input.scratchDir,
      // The extension pin rides `parentEnv` and inherits down to any grandchild
      // the root theta's calls spawn; `parentPid` is what authenticates it at
      // each level. Both params carriers and the callable-hash carrier are named
      // so no carrier inherited from THIS process survives into the child.
      parentEnv: {
        ...process.env,
        [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY,
        [SUBAGENT_PARAMS_ENV]: input.params,
        [SUBAGENT_PARAMS_FILE_ENV]: undefined,
        [SUBAGENT_CALLABLE_HASHES_ENV]: undefined,
      },
      parentPid: process.pid,
      invokeDepth: 0,
      host: input.host,
    },
    { spawn: createProductionSpawnFn(), emitDiagnostic },
  );
  if (!launch.ok) {
    return {
      stem: input.slug,
      ok: false,
      payload: null,
      exit: "no exit observed",
      stdoutLines: 0,
      stderrLines: 0,
      stderrTail: [],
      diagnostics: diagnostics.map((d) => `${d.code}: ${d.message}`),
      killedByWatchdog: false,
      launchFailure: launch.reason,
    };
  }
  const child = launch.child;

  // Subscribed BEFORE driving so no line and no terminal `'close'` is missed.
  let stdoutLines = 0;
  const stderrLines: string[] = [];
  child.onStdoutLine((): void => {
    stdoutLines += 1;
  });
  child.onStderrLine((line: string): void => {
    stderrLines.push(line);
  });
  let exit: ChildExitInfo | "no exit observed" = "no exit observed";
  const exitPromise = new Promise<ChildExitInfo>((resolve) =>
    child.onExit((info) => {
      exit = info;
      resolve(info);
    }),
  );

  // In-test bound BELOW the outer timeout: on a stall, kill so the drive settles
  // fail-closed and the row reports loudly instead of hanging the suite with a
  // live process tree.
  let killedByWatchdog = false;
  let result: Awaited<ReturnType<typeof driveSubagentChild>>;
  try {
    const watchdog = setTimeout(() => {
      killedByWatchdog = true;
      child.kill();
    }, ROW_WATCHDOG_MS);
    result = await driveSubagentChild({
      child,
      thetaAbort: new AbortController(),
      calleePath: join(input.thetaDir, `${input.slug}.theta`),
      emitDiagnostic,
      clock: new WallClock(),
    });
    clearTimeout(watchdog);
  } finally {
    // Reap on every path (idempotent on an already-exited child), then await its
    // exit (bounded) before the next row: the dying child's cwd is inside the
    // scratch tree, so leaving it live could make the final cleanup throw EBUSY
    // and replace a primary assertion error with a less diagnostic one. Awaiting
    // here — before the record below is built — is also what makes `exit` and the
    // final `stdoutLines` count complete for a row whose drive settled on the
    // envelope rather than on the exit.
    child.kill();
    let reapTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => {
        reapTimer = setTimeout(resolve, 5_000);
      }),
    ]);
    clearTimeout(reapTimer);
  }
  return {
    stem: input.slug,
    ok: result.ok,
    payload: result.ok ? result.value : result.error,
    exit,
    stdoutLines,
    stderrLines: stderrLines.length,
    stderrTail: stderrLines.slice(-4),
    diagnostics: diagnostics.map((d) => `${d.code}: ${d.message}`),
    killedByWatchdog,
  };
}

describe("bug 0178 — a spawned subagent child registers the marked root theta whatever its params: bypass class (subagent.md #pic-60)", () => {
  it(
    "every non-bypass `params:` shape returns its marshalled value through the envelope with no model turn",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // One discovery root holds every fixture so the root theta's `./` callee
      // path resolves beside it; the planted settings file sits in `.pi/` with
      // no `theta/` subdirectory, so it adds no discovery root of its own.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0178-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      mkdirSync(join(scratchDir, ".pi"), { recursive: true });
      writeFileSync(
        join(scratchDir, ".pi", "settings.json"),
        JSON.stringify({ theta: { binderModel: UNMATCHABLE_BINDER_MODEL } }),
        "utf8",
      );
      for (const row of DIRECT_ROWS) {
        writeFileSync(join(thetaDir, `${row.stem}.theta`), row.text, "utf8");
      }
      writeFileSync(join(thetaDir, `${TOP_STEM}.theta`), TOP_FIXTURE, "utf8");

      // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
      // (node + the entry script); pinned to the repo's own pi install.
      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (path: string): boolean => existsSync(path),
        isGenericRuntime: (): boolean => false,
      };

      try {
        // Sequential: each row is a whole child process, and a concurrent fan-out
        // would make the per-row stdout-line counts (the model-turn observable)
        // race against each other's scheduling.
        const outcomes: RowOutcome[] = [];
        for (const row of DIRECT_ROWS) {
          outcomes.push(
            await driveDirect({
              slug: row.stem,
              thetaDir,
              scratchDir,
              params: row.params,
              host,
            }),
          );
        }
        const topOutcome = await driveDirect({
          slug: TOP_STEM,
          thetaDir,
          scratchDir,
          params: undefined,
          host,
        });

        // (A) The directly-driven children — §Reproduction (b). Soft across every
        // row so ONE run names every shape the child refuses.
        for (const [index, row] of DIRECT_ROWS.entries()) {
          const outcome = outcomes[index];
          if (outcome === undefined) {
            throw new Error(`row ${row.stem} produced no outcome — the drive loop is broken`);
          }
          expect
            .soft(
              outcome.killedByWatchdog,
              `${row.stem}: the child made no progress within ${ROW_WATCHDOG_MS}ms, so nothing ` +
                `about the binder-model gate was observed — ${report(outcome)}`,
            )
            .toBe(false);
          expect
            .soft(
              outcome.ok,
              `${row.stem}: ${row.claim}. subagent.md #pic-60 makes the binder unreachable on ` +
                `the marshalled path, so the child's load pass must not refuse this slug over a ` +
                `binder model it will never use — ${report(outcome)}`,
            )
            .toBe(true);
          expect
            .soft(
              outcome.payload,
              `${row.stem}: the envelope must carry the callee's final value over the marshalled ` +
                `param — ${report(outcome)}`,
            )
            .toEqual(row.expected);
          expect
            .soft(
              outcome.stdoutLines,
              `${row.stem}: 2 stdout lines is the session line plus the envelope — a registered ` +
                `slug running a pure tail expression, with NO model turn. A larger count means ` +
                `\`-p "/${row.stem}"\` was processed as prompt text — ${report(outcome)}`,
            )
            .toBe(2);
        }

        // (B) The reported production surface — §Reproduction (a). The root
        // registers (no `params:`), resolves its `tools:` callee by PATH, and
        // spawns it as a GRANDCHILD; the refusal happens one process further
        // down, which is why the harness's own diagnostic drain stays empty.
        //
        // This cell also measures the residue §Fix (a) route 1 (root-slug only)
        // leaves: the callee is a NON-root theta inside the root's child, so a
        // root-slug-scoped exemption does not cover it. If it stays red once the
        // direct rows go green, the residue is real and route 1 is insufficient.
        //
        // No `stdoutLines` assertion here: the root's stream also carries
        // whatever its own tool-call machinery renders, so the model-turn
        // observable belongs to the direct rows above.
        expect
          .soft(
            topOutcome.killedByWatchdog,
            `${TOP_STEM}: the root or its grandchild made no progress within ${ROW_WATCHDOG_MS}ms ` +
              `— ${report(topOutcome)}`,
          )
          .toBe(false);
        expect
          .soft(
            topOutcome.ok,
            `${TOP_STEM}: a tools:-named mode: subagent callee with a non-bypass params: ` +
              `block must be invocable — the parent's callable-set resolution ` +
              `(resolveCallableSet, src/parser/callable-set.ts) already admitted it on path, ` +
              `mode and rename alone, so the grandchild refusing to register it is the ` +
              `disagreement bug 0178 reports — ${report(topOutcome)}`,
          )
          .toBe(true);
        expect
          .soft(
            topOutcome.payload,
            `${TOP_STEM}: the grandchild's value must reach the root through the envelope and ` +
              `the root's own envelope must carry it out — ${report(topOutcome)}`,
          )
          .toEqual(true);
      } finally {
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort scratch cleanup; never mask the primary test failure.
        }
      }
    },
    900_000,
  );
});
