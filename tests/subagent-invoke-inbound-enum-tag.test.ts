// Bug 0067 — a `mode: subagent` callee's final value re-enters its `invoke`
// parent as raw `JSON.parse` output with no inbound translation pass, so a
// named-enum variant arrives untagged and `v == Sev.High` is `false` in the
// parent where the child's identical value compares `true`.
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
// the obligation under test.
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

/** This working tree's extension entry (the build under test; mirrors the acceptance harness pin). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED: every scratch theta below is a pure tail expression
 * — zero queries — so no provider resolution or credential is required. The
 * values only satisfy the launch contract's argv shape.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0067 inbound ` +
        `enum-tag witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}

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
  "schema R { crossed: boolean, local: boolean, objSev: boolean, objWho: string, " +
    "elem0: boolean, anon: boolean }",
  'let re = invoke<Sev>("./kid.theta")',
  "let ve = re?",
  'let ro = invoke<P>("./kidobj.theta")',
  "let vo = ro?",
  'let ra = invoke<array<Sev>>("./kidarr.theta")',
  "let va = ra?",
  'let rq = invoke<Q>("./kidanon.theta")',
  "let vq = rq?",
  "R { crossed: ve == Sev.High, local: Sev.High == Sev.High, objSev: vo.sev == Sev.High, " +
    'objWho: vo.who, elem0: va[0] == Sev.High, anon: vq.s == "a" }',
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

describe("bug 0067 — subagent invoke return: inbound named-enum tag reattachment", () => {
  it(
    "a named-enum value crossing the PIC-59 envelope compares equal to the parent's own variant at every depth",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // One discovery root holds all five fixtures so the root theta's `./`
      // callee paths resolve beside it.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0067-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      writeFileSync(join(thetaDir, "kid.theta"), KID_ENUM);
      writeFileSync(join(thetaDir, "kidobj.theta"), KID_OBJECT);
      writeFileSync(join(thetaDir, "kidarr.theta"), KID_ARRAY);
      writeFileSync(join(thetaDir, "kidanon.theta"), KID_ANON);
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
      // inherits down to the grandchildren the root theta's `invoke`s spawn;
      // `parentPid` is what authenticates the pin at each level, so omitting it
      // would strip the pin silently and bind ambient builds instead.
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
        expect.soft(
          report.crossed,
          "(crossed) runtime-value-model.md:34 — a named-enum value returned by a subagent-mode " +
            "callee must compare equal to the caller's own variant of the same enum; " +
            "an untagged bare string takes valuesEqual's cross-type arm and reads false",
        ).toBe(true);

        // PRIMARY. Same rule at object-field depth: the sidecar's named-enum
        // position for `P.sev` maps to `Sev`, so the validated string is
        // re-tagged where the schema annotates it.
        expect.soft(
          report.objSev,
          "(objSev) runtime-value-model.md:34 — the inbound walk recurses through nested object " +
            "fields, so a named-enum FIELD of a returned schema-typed object must compare " +
            "equal to the caller's own variant",
        ).toBe(true);

        // PRIMARY. Same rule at array-element depth: :34 states the walk
        // "recurses through arrays".
        expect.soft(
          report.elem0,
          "(elem0) runtime-value-model.md:34 — the inbound walk recurses through arrays, so a " +
            "named-enum ARRAY ELEMENT of a returned `array<Sev>` must compare equal to " +
            "the caller's own variant",
        ).toBe(true);

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
