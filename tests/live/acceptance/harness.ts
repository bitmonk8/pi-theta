// H9a-T — non-interactive `pi -p` real-host acceptance harness (test-support).
//
// This module SPAWNS the real `pi` binary in non-interactive print mode
// (`pi -p --theta <dir> "/<name>"`, process-and-exit) and captures its stdout,
// stderr, and exit code, so the acceptance suite drives theta the way an operator
// actually runs it — through real extension auto-load, flag/arg parsing, and
// discovery — rather than through the H8a programmatic `createAgentSession`
// harness. It exists only to give the H9a half of the opt-in `npm run
// test:live` suite a live, black-box `pi -p` driver; it is excluded from the
// default `npm test` (see `config/vitest/vitest.live.config.ts`).
//
// All nine committed feature-theta fixtures live under `./fixtures`, and the
// suite this harness drives is green 10/10 against a live host. A
// correct-reason red is tracked through `docs/bugs/` per AGENTS.md
// §"Expect documented correct-reason reds", not through an in-file banner.
// Bug 0030 adds this harness's `ACCEPTANCE_STDERR_ALLOWLIST` /
// `acceptanceStderrOffenders` / `assertStderrClean`, the per-area stderr gate
// `noninteractive-acceptance.test.ts` calls at every spawn site.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, expect } from "vitest";
import {
  AjvSchemaValidator,
  type LoweredSchema,
} from "../../../src/seams/schema-validator";
import {
  buildBinderEnvelopeSchema,
  type BuildBinderEnvelopeSchemaInput,
} from "../../../src/binder/binder-envelope";
import {
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { SUBAGENT_EXTENSION_PIN_ENV } from "../../../src/runtime/subagent-launcher";
import {
  RELOAD_REBUILD_REJECTED_PREFIX,
  STALE_QUIESCE_STDERR_PREFIX,
  SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
} from "../theta-stderr-prefixes";

/** The real `pi` CLI entry the acceptance runner spawns (the shipped `pi -p` binary). */
export const PI_CLI_ENTRY = fileURLToPath(
  new URL(
    "../../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    import.meta.url,
  ),
);

/**
 * The working-copy Pi extension entry (`<repo>/extensions`). The acceptance
 * runner loads THIS checkout's extension explicitly (`-ne -e <entry>`) rather
 * than relying on ambient extension discovery from the spawned process's `cwd`
 * (a throwaway scratch dir that contains no `package.json#pi.extensions`), so
 * the suite exercises the code under test in this working tree — never a
 * globally-installed theta build from an unrelated checkout.
 */
export const EXTENSION_ENTRY = fileURLToPath(
  new URL("../../../extensions", import.meta.url),
);

/**
 * Resolve the live provider/model the spawned `pi -p` session drives its turns
 * against — the ONE model-selection rule every `npm run test:live` half shares
 * (`tests/live/harness.ts` `requireLiveProvider`, this resolver, and
 * `tests/live/hardening/probe-harness.ts`): `ModelRegistry.getAvailable()`,
 * preferring `claude-sonnet-5`. `pi -p` inherits `process.env`, so a missing
 * credential surfaces as the live-host precondition failure (never a silent
 * skip).
 */
export async function resolveAcceptanceHost(): Promise<{
  readonly provider: string;
  readonly model: string;
}> {
  // 0.80.x: `ModelRegistry.create` is gone and `AuthStorage` is no longer a
  // public root export. Build the canonical `ModelRuntime` (its default
  // `CredentialStore` reads the operator's `agentDir/auth.json`), wrap it in the
  // synchronous `ModelRegistry` facade, and `refresh()` before the synchronous
  // `getAvailable()` read (the facade requires it).
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh();
  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    failLoudly(
      "live-host precondition unmet: no live provider/model configured " +
        "(ModelRegistry.getAvailable() is empty). Configure a provider and " +
        "credentials before running `npm run test:live`; this suite never " +
        "silently skips.",
    );
  }
  const idOf = (m: unknown): string => (m as { id?: string }).id ?? "";
  const providerOf = (m: unknown): string =>
    (m as { provider?: string }).provider ?? "";
  const model =
    available.find((m) => idOf(m) === "claude-sonnet-5") ??
    available.find((m) => idOf(m).includes("sonnet")) ??
    available[0];
  return { provider: providerOf(model), model: idOf(model) };
}

/** Directory holding the committed feature-theta fixtures (authored by the paired `H9a`). */
export const FEATURE_THETA_DIR = fileURLToPath(
  new URL("./fixtures", import.meta.url),
);

/**
 * The committed permitted-code list criterion (e) scores against — reused from
 * the single committed, reviewed reference set checked in alongside `H7a`'s
 * fixture `.theta` (`real-host-smoke-gate.md`), so the acceptance suite and the
 * manual smoke never diverge into separate permitted-code sets.
 */
export const PERMITTED_CODES_PATH = fileURLToPath(
  new URL("../../fixtures/h7a/permitted-codes.json", import.meta.url),
);

/** Fail loudly (never a silent skip — *No silent test skipping*), narrowing to `never`. */
export function failLoudly(message: string): never {
  assert.fail(message);
  // `assert.fail` throws; the explicit throw guarantees the `never` return.
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Feature-theta manifest — one committed `.theta` per functionality area (a)–(i).
// ---------------------------------------------------------------------------

/** The nine functionality areas the fuller feature-theta suite covers, per `H9a-T`. */
export type FeatureArea =
  | "prompt-sentinel" // (a) prompt-mode sentinel turn
  | "typed-query-named-schema" // (b) typed query with a named `schema` decl
  | "typed-query-inline" // (c) typed query with an inline object type
  | "params-binder" // (d) a params theta that forces a real binder pass
  | "subagent-success" // (e) subagent-mode spawn drives to a success terminal
  | "code-tool-loop" // (f) a code-tool loop
  | "imports-invoke" // (g) imports / invoke across thetas
  | "match-queryerror" // (h) error/result `match` surfacing a QueryError
  | "multi-source-discovery"; // (i) multi-source discovery (project + --theta CLI)

/** The invariant set a single feature theta's `pi -p` run is scored against. */
export interface FeatureInvariants {
  /** (all) The run completes without error — exit code 0, no thrown/aborted pipeline. */
  readonly noErrorExit: true;
  /** (all) Emitted `theta-system-note` codes ⊆ the committed permitted-code list. */
  readonly permittedCodesSubset: true;
  /**
   * (b)/(c) The typed-query response must validate against its declared schema
   * (`QRY-22`). Present iff the theta binds a typed query; carries the lowered
   * shape the response is checked against.
   */
  readonly typedQuerySchema?: LoweredSchema;
  /**
   * (d) DECISION (production conformance): the binder now runs OFF-session and
   * INVISIBLE — its `ok | needs_info | ambiguous` envelope MUST NOT reach the
   * user session / `pi -p` stdout (BND-3). On a successful bind the observable
   * proof is instead the `bind_echo` success note (`Running /<stem>: …`).
   * Present iff a binder pass fires; carries the per-theta envelope schema inputs
   * used to detect a leak (any emitted envelope validating against it is a
   * regression).
   */
  readonly binderEnvelope?: BuildBinderEnvelopeSchemaInput;
  /**
   * (e) A subagent-mode theta spawns an isolated `AgentSession` and drives it to
   * a SUCCESS terminal outcome (no error exit). The production subagent driver
   * no longer self-cancels; genuine mid-stream cancellation (a real `thetaAbort`
   * fire) is deterministically locked by the in-process regression test
   * `tests/production-subagent-query-model.test.ts`, not by this black-box
   * `pi -p` run (SIGTERM discards the buffer, so stdout cannot be scored).
   */
  readonly subagentSuccess?: true;
  /**
   * (i) The theta must also register when discovered from the `--theta` CLI source
   * (not only the project walk), proving discovery is source-general.
   */
  readonly multiSourceDiscovery?: true;
}

/** One committed feature theta: its slash name, fixture filename, and invariant set. */
export interface FeatureThetaSpec {
  readonly area: FeatureArea;
  /** The `(a)`–`(i)` label from `H9a-T`. */
  readonly label: string;
  /** The filename stem — the slash command `pi -p` invokes (`/<stem>`). */
  readonly stem: string;
  /** The fixture filename under `FEATURE_THETA_DIR`. */
  readonly fixtureFile: string;
  readonly invariants: FeatureInvariants;
}

const NAMED_REPLY_SCHEMA: LoweredSchema = {
  type: "object",
  properties: { status: { type: "string" }, summary: { type: "string" } },
  required: ["status", "summary"],
  additionalProperties: false,
};

const INLINE_REPLY_SCHEMA: LoweredSchema = {
  type: "object",
  properties: { ok: { type: "boolean" }, label: { type: "string" } },
  required: ["ok", "label"],
  additionalProperties: false,
};

const PARAMS_BINDER_SCHEMA: LoweredSchema = {
  type: "object",
  properties: { topic: { type: "string" }, count: { type: "number" } },
  required: ["topic", "count"],
  additionalProperties: false,
};

/**
 * The committed feature-theta suite — one theta per functionality area (a)–(i).
 * The `.theta` files are committed under `./fixtures` alongside this module.
 */
export const FEATURE_THETAS: readonly FeatureThetaSpec[] = [
  {
    area: "prompt-sentinel",
    label: "(a)",
    stem: "acc-prompt-sentinel",
    fixtureFile: "acc-prompt-sentinel.theta",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "typed-query-named-schema",
    label: "(b)",
    stem: "acc-typed-named",
    fixtureFile: "acc-typed-named.theta",
    invariants: {
      noErrorExit: true,
      permittedCodesSubset: true,
      typedQuerySchema: NAMED_REPLY_SCHEMA,
    },
  },
  {
    area: "typed-query-inline",
    label: "(c)",
    stem: "acc-typed-inline",
    fixtureFile: "acc-typed-inline.theta",
    invariants: {
      noErrorExit: true,
      permittedCodesSubset: true,
      typedQuerySchema: INLINE_REPLY_SCHEMA,
    },
  },
  {
    area: "params-binder",
    label: "(d)",
    stem: "acc-params-binder",
    fixtureFile: "acc-params-binder.theta",
    invariants: {
      noErrorExit: true,
      permittedCodesSubset: true,
      binderEnvelope: {
        paramsSchema: PARAMS_BINDER_SCHEMA,
        defaultedFields: ["count"],
      },
    },
  },
  {
    area: "subagent-success",
    label: "(e)",
    stem: "acc-subagent-success",
    fixtureFile: "acc-subagent-success.theta",
    invariants: {
      noErrorExit: true,
      permittedCodesSubset: true,
      subagentSuccess: true,
    },
  },
  {
    area: "code-tool-loop",
    label: "(f)",
    stem: "acc-code-tool-loop",
    fixtureFile: "acc-code-tool-loop.theta",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "imports-invoke",
    label: "(g)",
    stem: "acc-imports-invoke",
    fixtureFile: "acc-imports-invoke.theta",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "match-queryerror",
    label: "(h)",
    stem: "acc-match-queryerror",
    fixtureFile: "acc-match-queryerror.theta",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "multi-source-discovery",
    label: "(i)",
    stem: "acc-multi-source",
    fixtureFile: "acc-multi-source.theta",
    invariants: {
      noErrorExit: true,
      permittedCodesSubset: true,
      multiSourceDiscovery: true,
    },
  },
];

/** Look up a feature theta by area (throws loudly on an unknown area — never silent). */
export function featureTheta(area: FeatureArea): FeatureThetaSpec {
  const spec = FEATURE_THETAS.find((s) => s.area === area);
  if (spec === undefined) {
    failLoudly(`no feature-theta spec registered for area '${area}'`);
  }
  return spec;
}

/**
 * Resolve the committed feature-theta `.theta` file for a spec, or `undefined`
 * when the file is absent from disk. Every spec in `FEATURE_THETAS` has a
 * committed fixture, so `undefined` here names a fixture regression, not the
 * suite's normal state.
 */
export function resolveFeatureThetaPath(spec: FeatureThetaSpec): string | undefined {
  const path = fileURLToPath(
    new URL(`./fixtures/${spec.fixtureFile}`, import.meta.url),
  );
  return existsSync(path) ? path : undefined;
}

/** Load the committed permitted-code list criterion (e) scores against. */
export function loadPermittedCodes(): readonly string[] {
  const raw = readFileSync(PERMITTED_CODES_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((c) => typeof c === "string")) {
    failLoudly(
      `committed permitted-code list at ${PERMITTED_CODES_PATH} is not a string array`,
    );
  }
  return parsed as readonly string[];
}

// ---------------------------------------------------------------------------
// Live-host precondition (asserted only AFTER the feature-theta presence check).
// ---------------------------------------------------------------------------

/**
 * Require a configured, credentialed live provider/model. Fails loudly naming
 * the missing precondition (never a silent skip) via `resolveAcceptanceHost`.
 * Called only AFTER the feature-theta presence assertion, so a missing fixture
 * file reds before this ever runs, token-free. Returns the resolved model id
 * (the same host `spawnPiPrint` drives against).
 */
export async function requireLiveHost(): Promise<{ readonly modelId: string }> {
  return { modelId: (await resolveAcceptanceHost()).model };
}

// ---------------------------------------------------------------------------
// The `pi -p`-spawning runner and its observable-result parsers.
// ---------------------------------------------------------------------------

/** The captured result of one `pi -p --theta <dir> "/<name>"` process-and-exit run. */
export interface PiPrintResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SpawnPiPrintOptions {
  /** The primary `--theta <dir>` discovery source (the feature-theta fixtures dir). */
  readonly thetaDir: string;
  /** Additional `--theta <dir>` CLI sources (for multi-source discovery, area (i)). */
  readonly extraThetaDirs?: readonly string[];
  /** The slash command to invoke (`/<stem>`), plus any argument text. */
  readonly slashInvocation: string;
  /** Working directory for the spawned `pi` process. */
  readonly cwd: string;
  /** An optional deadline (ms) after which the run is aborted (cancellation, area (e)). */
  readonly abortAfterMs?: number;
}

/**
 * Spawn the real `pi` binary in non-interactive print mode
 * (`pi -p --theta <dir> "/<name>"`, process-and-exit) and capture stdout, stderr,
 * and the exit code. The paired `H9a` owns making each theta's observables
 * (binder envelope, typed-query response, cancellation) surface on stdout so
 * these captures can be scored; this harness only drives the process.
 */
export async function spawnPiPrint(options: SpawnPiPrintOptions): Promise<PiPrintResult> {
  const thetaDirs = [options.thetaDir, ...(options.extraThetaDirs ?? [])];
  // Drive the turns against the model the shared live-suite selection rule
  // resolves (see resolveAcceptanceHost).
  const host = await resolveAcceptanceHost();
  const args = [
    PI_CLI_ENTRY,
    "-p",
    // Load THIS working tree's extension (disable ambient discovery so the
    // scratch cwd cannot pull an unrelated globally-installed theta build).
    "-ne",
    "-e",
    EXTENSION_ENTRY,
    // The live provider/model the driven turns run against (see host above).
    "--provider",
    host.provider,
    "--model",
    host.model,
    // Bug 0008: ONE path.delimiter-joined --theta flag, never one flag per
    // dir — the host pi argv parser keeps only the LAST occurrence of a
    // repeated extension string flag, silently dropping every earlier root.
    ...(thetaDirs.length > 0 ? ["--theta", thetaDirs.join(delimiter)] : []),
    options.slashInvocation,
  ];
  return new Promise<PiPrintResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      // #subagent-extension-pin (bug 0002 defect 2): the `-ne -e` pin above only
      // covers the OUTER process; a subagent-mode theta makes the outer's theta
      // extension spawn an INNER child whose argv would otherwise rely on
      // ambient discovery — on a machine with a stale globally-installed theta
      // build the inner child silently binds to the WRONG extension (no
      // envelope, fail-closed (e)/(g)). The env knob makes the launcher pin
      // every nested child to the same working-tree build under test.
      env: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
      // Close the child's stdin: `pi -p` in non-interactive print mode reads its
      // prompt from argv, but an OPEN inherited stdin pipe leaves it waiting for
      // EOF and the process-and-exit run never terminates. `"ignore"` gives the
      // child an already-closed stdin so it exits after emitting its output.
      // (The same treatment is applied to the INNER subagent child by
      // `createProductionSpawnFn` — the bug 0002 primary fix.)
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    let timer: NodeJS.Timeout | undefined;
    if (options.abortAfterMs !== undefined) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.abortAfterMs);
    }
    child.on("error", (err) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

/**
 * Extract the `theta/{load,parse,runtime}/*` codes present in a captured
 * `pi -p` stream. The H9a call sites pass a stdout+stderr concatenation, so a
 * code surfacing on either stream is scored.
 */
export function parseSystemNoteCodes(output: string): readonly string[] {
  const codes = output.match(/theta\/(?:load|parse|runtime)\/[a-z0-9-]+/g) ?? [];
  return Array.from(new Set(codes));
}

/**
 * The committed stderr allowlist for the empty-capture gate below. Ships
 * EMPTY: the measured baseline (bug 0030 §Fix, `dd4f3d3b`, 2026-07-29) ran all
 * nine H9a areas — ten spawns, area (i) twice — and captured 0 bytes of
 * stderr on every one, so nothing is admissible yet. An entry is admissible
 * ONLY when it appears in a baseline RE-RECORDED in the bug document;
 * populating this reactively from a first red silently degrades the
 * empty-capture gate into the three-prefix-rejection form the same §Fix rule
 * rejected for this baseline, with no record that the gate's strictness
 * changed.
 */
export const ACCEPTANCE_STDERR_ALLOWLIST: readonly string[] = [];

/**
 * The lines of a captured H9a `pi -p` stderr stream the empty-capture gate
 * rejects: every non-blank line not covered by `ACCEPTANCE_STDERR_ALLOWLIST`,
 * in capture order, without a trailing newline. Blank/whitespace-only lines
 * — including the trailing newline every `console.error` write leaves behind
 * — are dropped before the allowlist filter runs, so a silent stream never
 * reports a phantom offender.
 */
export function acceptanceStderrOffenders(stderr: string): readonly string[] {
  return stderr
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .filter((line) => !ACCEPTANCE_STDERR_ALLOWLIST.some((entry) => line.includes(entry)));
}

/** Name the theta-owned stderr line class an offending line belongs to, or `undefined` for unrecognised (host) content. */
function knownStderrClassOf(line: string): string | undefined {
  if (line.includes(STALE_QUIESCE_STDERR_PREFIX)) {
    return "PIC-67 stale-quiesce line (STALE_QUIESCE_STDERR_PREFIX)";
  }
  if (line.includes(SYSTEM_NOTE_DELIVERY_FAILED_PREFIX)) {
    return "PIC-54 delivery-failed terminal cascade (SYSTEM_NOTE_DELIVERY_FAILED_PREFIX)";
  }
  if (line.includes(RELOAD_REBUILD_REJECTED_PREFIX)) {
    return "reload-debounce rejection sink (RELOAD_REBUILD_REJECTED_PREFIX)";
  }
  return undefined;
}

/**
 * Assert one H9a spawn's captured stderr is clean under the measured-baseline
 * empty-capture gate (bug 0030 §Fix). Reads `result.stderr` ONLY. Note CONTENT
 * on stdout stays governed by `assertCodesSubsetOfPermitted` — content only,
 * through its `theta/{load,parse,runtime}/<slug>` scan. The PRESENCE of a
 * theta-owned line on stdout is scored by no gate: a quiesce line, a
 * rebuild-rejected line, and a slug-less cascade carry no slug, so the scan
 * extracts `[]` from each and passes.
 *
 * ORTHOGONAL to `assertCodesSubsetOfPermitted` — bug 0030 §Fix's orthogonality
 * paragraph ("The new assertion is **orthogonal** to
 * `assertCodesSubsetOfPermitted`"): this gate rejects the delivery MECHANISM —
 * under the empty-capture form, any stderr line at all — regardless of which
 * code (if any) it quotes, while the permitted-code list keeps governing note
 * CONTENT on stdout. The two do not contradict on
 * `theta/runtime/internal-error`: that code is sanctioned as note content on
 * stdout, and the identical code arriving inside a
 * `system-note delivery failed:` cascade on stderr is a defect this gate
 * rejects in every area. The gate's form (empty-capture vs. three-prefix
 * rejection) was fixed by the recorded measurement (§Fix "Measured baseline",
 * `dd4f3d3b`, 2026-07-29 — 0 bytes of stderr on all ten H9a spawns), not by
 * preference; weakening it needs a re-recorded baseline, not a preference
 * change.
 */
export function assertStderrClean(result: PiPrintResult, spec: FeatureThetaSpec): void {
  const offenders = acceptanceStderrOffenders(result.stderr);
  const annotated = offenders.map((line) => {
    const knownClass = knownStderrClassOf(line);
    return knownClass === undefined ? line : `${line} [${knownClass}]`;
  });
  expect(
    offenders,
    `${spec.label} ${spec.area}: stderr carries ${offenders.length} line(s) the ` +
      `empty-capture gate rejects (measured baseline dd4f3d3b, 2026-07-29: 0 ` +
      `bytes of stderr on all ten H9a spawns): ${JSON.stringify(annotated)}`,
  ).toEqual([]);
}

/**
 * Extract the first JSON object the run emitted on stdout (the observable the
 * feature theta is authored to `respond`/print). Returns `undefined` when no
 * balanced JSON object is present.
 */
export function parseEmittedJson(output: string): unknown {
  const start = output.indexOf("{");
  if (start < 0) {
    return undefined;
  }
  let depth = 0;
  for (let i = start; i < output.length; i += 1) {
    const ch = output[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(output.slice(start, i + 1));
        } catch (err) {
          if (err instanceof SyntaxError) {
            return undefined;
          }
          throw err;
        }
      }
    }
  }
  return undefined;
}

/** A structural JSON-schema validator (no-op emitter; canonical-bytes slug). */
function makeValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: () => undefined,
    slugOf: (schema) => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

export interface SchemaCheck {
  readonly ok: boolean;
  readonly errors: readonly unknown[];
}

/** Validate a value against a lowered schema (structural validity, never exact content). */
export function validatesAgainstSchema(
  value: unknown,
  schema: LoweredSchema,
): SchemaCheck {
  const outcome = makeValidator().compile(schema).validate(value);
  return { ok: outcome.ok, errors: outcome.ok ? [] : outcome.errors };
}

/** Validate a binder-pass output against the per-theta binder envelope schema. */
export function validatesAgainstBinderEnvelope(
  value: unknown,
  input: BuildBinderEnvelopeSchemaInput,
): SchemaCheck {
  return validatesAgainstSchema(value, buildBinderEnvelopeSchema(input) as LoweredSchema);
}
