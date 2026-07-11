// H9a-T — non-interactive `pi -p` real-host acceptance harness (test-support).
//
// This module SPAWNS the real `pi` binary in non-interactive print mode
// (`pi -p --loom <dir> "/<name>"`, process-and-exit) and captures its stdout,
// stderr, and exit code, so the acceptance suite drives loom the way an operator
// actually runs it — through real extension auto-load, flag/arg parsing, and
// discovery — rather than through the H8a programmatic `createAgentSession`
// harness. It exists only to give the opt-in `npm run test:acceptance` suite a
// live, black-box `pi -p` driver; it is excluded from the default `npm test`
// and from the H8a `npm run test:live` suite (see `vitest.acceptance.config.ts`).
//
// INTENDED-REASON RED (current H9a-T state): the fuller feature-loom fixtures
// this suite drives — one `.loom` per functionality area (a)–(i) — are NOT yet
// authored (the paired `H9a` implementation authors them and wires the runner's
// per-area observability). `resolveFeatureLoomPath` therefore returns
// `undefined` for every area, and each test reds on its own primary
// fixture-presence assertion BEFORE any live host, credential, or spawned `pi`
// process is required — so the red is deterministic, token-free, and for the
// intended reason (runner/looms absent), not a credential/network/setup throw.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assert } from "vitest";
import {
  AjvSchemaValidator,
  type LoweredSchema,
} from "../../src/seams/schema-validator";
import {
  buildBinderEnvelopeSchema,
  type BuildBinderEnvelopeSchemaInput,
} from "../../src/binder/binder-envelope";
import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

/** The real `pi` CLI entry the acceptance runner spawns (the shipped `pi -p` binary). */
export const PI_CLI_ENTRY = fileURLToPath(
  new URL(
    "../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    import.meta.url,
  ),
);

/**
 * The working-copy Pi extension entry (`<repo>/extensions`). The acceptance
 * runner loads THIS checkout's extension explicitly (`-ne -e <entry>`) rather
 * than relying on ambient extension discovery from the spawned process's `cwd`
 * (a throwaway scratch dir that contains no `package.json#pi.extensions`), so
 * the suite exercises the code under test in this working tree — never a
 * globally-installed loom build from an unrelated checkout.
 */
export const EXTENSION_ENTRY = fileURLToPath(
  new URL("../../extensions", import.meta.url),
);

/**
 * The live provider/model the spawned `pi -p` session drives its turns against.
 * Overridable through the environment so a different live host can be pinned
 * without editing the suite; the defaults name a broadly-available structured-
 * output-capable model. `pi -p` inherits `process.env`, so a missing credential
 * surfaces as the live-host precondition failure (never a silent skip).
 */
export const ACCEPTANCE_PROVIDER = process.env["PI_LOOM_ACC_PROVIDER"] ?? "unity-messages";
export const ACCEPTANCE_MODEL = process.env["PI_LOOM_ACC_MODEL"] ?? "claude-haiku-4-5";

/** Directory holding the committed feature-loom fixtures (authored by the paired `H9a`). */
export const FEATURE_LOOM_DIR = fileURLToPath(
  new URL("./fixtures", import.meta.url),
);

/**
 * The committed permitted-code list criterion (e) scores against — reused from
 * the single committed, reviewed reference set checked in alongside `H7a`'s
 * fixture `.loom` (`real-host-smoke-gate.md`), so the acceptance suite and the
 * manual smoke never diverge into separate permitted-code sets.
 */
export const PERMITTED_CODES_PATH = fileURLToPath(
  new URL("../fixtures/h7a/permitted-codes.json", import.meta.url),
);

/** Fail loudly (never a silent skip — *No silent test skipping*), narrowing to `never`. */
export function failLoudly(message: string): never {
  assert.fail(message);
  // `assert.fail` throws; the explicit throw guarantees the `never` return.
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Feature-loom manifest — one committed `.loom` per functionality area (a)–(i).
// ---------------------------------------------------------------------------

/** The nine functionality areas the fuller feature-loom suite covers, per `H9a-T`. */
export type FeatureArea =
  | "prompt-sentinel" // (a) prompt-mode sentinel turn
  | "typed-query-named-schema" // (b) typed query with a named `schema` decl
  | "typed-query-inline" // (c) typed query with an inline object type
  | "params-binder" // (d) a params loom that forces a real binder pass
  | "subagent-success" // (e) subagent-mode spawn drives to a success terminal
  | "code-tool-loop" // (f) a code-tool loop
  | "imports-invoke" // (g) imports / invoke across looms
  | "match-queryerror" // (h) error/result `match` surfacing a QueryError
  | "multi-source-discovery"; // (i) multi-source discovery (project + --loom CLI)

/** The invariant set a single feature loom's `pi -p` run is scored against. */
export interface FeatureInvariants {
  /** (all) The run completes without error — exit code 0, no thrown/aborted pipeline. */
  readonly noErrorExit: true;
  /** (all) Emitted `loom-system-note` codes ⊆ the committed permitted-code list. */
  readonly permittedCodesSubset: true;
  /**
   * (b)/(c) The typed-query response must validate against its declared schema
   * (`QRY-22`). Present iff the loom binds a typed query; carries the lowered
   * shape the response is checked against.
   */
  readonly typedQuerySchema?: LoweredSchema;
  /**
   * (d) DECISION (production conformance): the binder now runs OFF-session and
   * INVISIBLE — its `ok | needs_info | ambiguous` envelope MUST NOT reach the
   * user session / `pi -p` stdout (BND-3). On a successful bind the observable
   * proof is instead the `bind_echo` success note (`Running /<stem>: …`).
   * Present iff a binder pass fires; carries the per-loom envelope schema inputs
   * used to detect a leak (any emitted envelope validating against it is a
   * regression).
   */
  readonly binderEnvelope?: BuildBinderEnvelopeSchemaInput;
  /**
   * (e) A subagent-mode loom spawns an isolated `AgentSession` and drives it to
   * a SUCCESS terminal outcome (no error exit). The production subagent driver
   * no longer self-cancels; genuine mid-stream cancellation (a real `loomAbort`
   * fire) is deterministically locked by the in-process regression test
   * `tests/production-subagent-query-model.test.ts`, not by this black-box
   * `pi -p` run (SIGTERM discards the buffer, so stdout cannot be scored).
   */
  readonly subagentSuccess?: true;
  /**
   * (i) The loom must also register when discovered from the `--loom` CLI source
   * (not only the project walk), proving discovery is source-general.
   */
  readonly multiSourceDiscovery?: true;
}

/** One committed feature loom: its slash name, fixture filename, and invariant set. */
export interface FeatureLoomSpec {
  readonly area: FeatureArea;
  /** The `(a)`–`(i)` label from `H9a-T`. */
  readonly label: string;
  /** The filename stem — the slash command `pi -p` invokes (`/<stem>`). */
  readonly stem: string;
  /** The fixture filename under `FEATURE_LOOM_DIR`. */
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
 * The committed feature-loom suite — one loom per functionality area (a)–(i).
 * The `.loom` files themselves are authored by the paired `H9a`; in the current
 * `H9a-T` state they are absent, which is the suite's intended-reason red.
 */
export const FEATURE_LOOMS: readonly FeatureLoomSpec[] = [
  {
    area: "prompt-sentinel",
    label: "(a)",
    stem: "acc-prompt-sentinel",
    fixtureFile: "acc-prompt-sentinel.loom",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "typed-query-named-schema",
    label: "(b)",
    stem: "acc-typed-named",
    fixtureFile: "acc-typed-named.loom",
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
    fixtureFile: "acc-typed-inline.loom",
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
    fixtureFile: "acc-params-binder.loom",
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
    fixtureFile: "acc-subagent-success.loom",
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
    fixtureFile: "acc-code-tool-loop.loom",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "imports-invoke",
    label: "(g)",
    stem: "acc-imports-invoke",
    fixtureFile: "acc-imports-invoke.loom",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "match-queryerror",
    label: "(h)",
    stem: "acc-match-queryerror",
    fixtureFile: "acc-match-queryerror.loom",
    invariants: { noErrorExit: true, permittedCodesSubset: true },
  },
  {
    area: "multi-source-discovery",
    label: "(i)",
    stem: "acc-multi-source",
    fixtureFile: "acc-multi-source.loom",
    invariants: {
      noErrorExit: true,
      permittedCodesSubset: true,
      multiSourceDiscovery: true,
    },
  },
];

/** Look up a feature loom by area (throws loudly on an unknown area — never silent). */
export function featureLoom(area: FeatureArea): FeatureLoomSpec {
  const spec = FEATURE_LOOMS.find((s) => s.area === area);
  if (spec === undefined) {
    failLoudly(`no feature-loom spec registered for area '${area}'`);
  }
  return spec;
}

/**
 * Resolve the committed feature-loom `.loom` file for a spec, or `undefined`
 * when it has not been authored yet. In the current `H9a-T` state every fixture
 * is absent, so this returns `undefined` — the suite's intended-reason red.
 */
export function resolveFeatureLoomPath(spec: FeatureLoomSpec): string | undefined {
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
// Live-host precondition (asserted only AFTER the intended-reason red).
// ---------------------------------------------------------------------------

/**
 * Require a configured, credentialed live provider/model. Fails loudly naming
 * the missing precondition (never a silent skip). Called only AFTER the
 * feature-loom presence assertion, so in the current red state the suite never
 * reaches here — the intended-reason red (fixture absent) fires first.
 */
export function requireLiveHost(): { readonly modelId: string } {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const available = modelRegistry.getAvailable();
  if (available.length === 0) {
    failLoudly(
      "live-host precondition unmet: no live provider/model configured " +
        "(ModelRegistry.getAvailable() is empty). Configure a provider and " +
        "credentials before running `npm run test:acceptance`; this suite " +
        "never silently skips.",
    );
  }
  const idOf = (m: unknown): string => (m as { id?: string }).id ?? "";
  const model =
    available.find((m) => idOf(m) === "claude-opus-4-8") ??
    available.find((m) => idOf(m).includes("opus")) ??
    available[0];
  return { modelId: idOf(model) };
}

// ---------------------------------------------------------------------------
// The `pi -p`-spawning runner and its observable-result parsers.
// ---------------------------------------------------------------------------

/** The captured result of one `pi -p --loom <dir> "/<name>"` process-and-exit run. */
export interface PiPrintResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SpawnPiPrintOptions {
  /** The primary `--loom <dir>` discovery source (the feature-loom fixtures dir). */
  readonly loomDir: string;
  /** Additional `--loom <dir>` CLI sources (for multi-source discovery, area (i)). */
  readonly extraLoomDirs?: readonly string[];
  /** The slash command to invoke (`/<stem>`), plus any argument text. */
  readonly slashInvocation: string;
  /** Working directory for the spawned `pi` process. */
  readonly cwd: string;
  /** An optional deadline (ms) after which the run is aborted (cancellation, area (e)). */
  readonly abortAfterMs?: number;
}

/**
 * Spawn the real `pi` binary in non-interactive print mode
 * (`pi -p --loom <dir> "/<name>"`, process-and-exit) and capture stdout, stderr,
 * and the exit code. The paired `H9a` owns making each loom's observables
 * (binder envelope, typed-query response, cancellation) surface on stdout so
 * these captures can be scored; this harness only drives the process.
 */
export function spawnPiPrint(options: SpawnPiPrintOptions): Promise<PiPrintResult> {
  const loomDirs = [options.loomDir, ...(options.extraLoomDirs ?? [])];
  const args = [
    PI_CLI_ENTRY,
    "-p",
    // Load THIS working tree's extension (disable ambient discovery so the
    // scratch cwd cannot pull an unrelated globally-installed loom build).
    "-ne",
    "-e",
    EXTENSION_ENTRY,
    // Pin the live provider/model the driven turns run against.
    "--provider",
    ACCEPTANCE_PROVIDER,
    "--model",
    ACCEPTANCE_MODEL,
    ...loomDirs.flatMap((dir) => ["--loom", dir]),
    options.slashInvocation,
  ];
  return new Promise<PiPrintResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: process.env,
      // Close the child's stdin: `pi -p` in non-interactive print mode reads its
      // prompt from argv, but an OPEN inherited stdin pipe leaves it waiting for
      // EOF and the process-and-exit run never terminates. `"ignore"` gives the
      // child an already-closed stdin so it exits after emitting its output.
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

/** Extract the `loom/{load,parse,runtime}/*` codes a `pi -p` run surfaced on stdout. */
export function parseSystemNoteCodes(output: string): readonly string[] {
  const codes = output.match(/loom\/(?:load|parse|runtime)\/[a-z0-9-]+/g) ?? [];
  return Array.from(new Set(codes));
}

/**
 * Extract the first JSON object the run emitted on stdout (the observable the
 * feature loom is authored to `respond`/print). Returns `undefined` when no
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

/** Validate a binder-pass output against the per-loom binder envelope schema. */
export function validatesAgainstBinderEnvelope(
  value: unknown,
  input: BuildBinderEnvelopeSchemaInput,
): SchemaCheck {
  return validatesAgainstSchema(value, buildBinderEnvelopeSchema(input) as LoweredSchema);
}
