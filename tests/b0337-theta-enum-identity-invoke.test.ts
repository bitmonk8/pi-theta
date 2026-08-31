// Bug 0337 — a `.theta`-declared enum tags its runtime values on the bare
// declared name, so two different `.theta` files each declaring `enum Sev` mint
// the identical tag `"Sev"`; a callee's `Sev.Low` returned across an in-process
// `invoke<Sev>` compares `==` true against the caller's unrelated same-named
// `Sev.Low`, silently, where the byte-identical two declarations in `.thetalib`
// files carry file-qualified declaring keys (bug 0305) and compare unequal
// (`docs/bugs/0337-theta-enum-identity-collides-across-in-process-invoke.md`).
//
// THE SEMANTICS UNDER TEST (0337 §Expected, parent-ratified). Two enum
// declarations in DIFFERENT source files are distinct nominal types; their
// variants compare `==` false, matching the `.thetalib` outcome and the general
// rule `a tag identifying the declaring enum` (`runtime-value-model.md:13`,
// `:29`). A value of a declaration the caller did not write does NOT satisfy the
// caller's own enum in `==`. Two same-named enums in the SAME file keep one
// declaring key and compare EQUAL. The property is mode-invariant: the callee's
// mode selects conversation isolation, not enum identity, so the prompt→prompt
// ATTACH leg and the subagent SPAWN leg must observe the same cross-file
// inequality and the same preserved wire.
//
// THE FIX IS ALREADY IN THE TREE (uncommitted, §Fix): the `.theta` enum
// registration mints its tag via `enumDeclaringKey(<theta resolvedPath>, name)`
// (`lexical-environment.ts:132`, threaded at
// `production-theta-producer.ts:4309`), the body's inbound retag sidecars mint
// the same key (`wire-translation.ts:331`, `:458`; `inbound-boundary.ts`
// `enumDeclaringPath`), and the invoke-return decode threads the CALLEE's
// resolved path so the subagent-envelope leg retags to the callee's
// file-qualified key rather than the bare name
// (`production-theta-producer.ts:3963-3964`, the "Option 1" subagent-leg /
// tools:-leg threading). `valuesEqual` compares tag then wire
// (`value.ts:503`). So every cell below runs GREEN as written — that is
// expected. This file does NOT touch src/ and does NOT neutralise the fix; the
// orchestrator proves the red separately by reverting the src fix.
//
// WHICH ASSERTIONS ARE RED AT THE FORK (pre-fix) STATE, AND WHY:
//   - Cell 1 (CORE, offline attach): `v == Sev.Low` (caller's own) must be
//     FALSE. At fork both variants carry the bare tag `"Sev"` and equal wire
//     `"low"`, so `valuesEqual` returns true — the FALSE assertion reds.
//   - Cell 4 (MODE-INVARIANCE, integration spawn): `vp1==vp2`, `vs1==vs2`, and
//     each `vX == Sev.Low` must be FALSE. At fork every one is true (bare-tag
//     collision on both legs), so the FALSE assertions red. `legInvariant`
//     (attach-inequality === spawn-inequality) additionally reds under a
//     PARTIAL fix that repaired only the prompt leg and left the subagent leg on
//     the bare name: then `vp1==vp2` is false but `vs1==vs2` is true, so the two
//     legs disagree — this is the field that specifically witnesses the
//     completed Option-1 subagent-leg threading.
//   - Cell 2 (SAME-FILE equality control) and Cell 3 (`.thetalib` D3 control)
//     are GREEN on both sides — the over-reach fence pinning that the fix keys
//     on declaration identity, not on the bare name, and does not break
//     same-file identity.
//
// TIERS AND WHY THE TIER ABOVE IS INSUFFICIENT:
//   - Cells 1-3 are UNIT (offline, provider-free): the collision settles inside
//     one `parseThetaDocument` + `bindPromptConversation` + `executeBody` (the
//     `invoke-return-enum-carrier-projection.test.ts` harness), and the
//     `.thetalib` control inside one `checkThetaImports` + `executeBody` (the
//     `b0305-enum-alias-identity.test.ts` harness). No process boundary is
//     needed to reach the attach cell.
//   - Cell 4 is INTEGRATION (real spawned children, provider-free): the
//     subagent SPAWN leg's normalisation is a process boundary
//     (`serializeOkEnvelope`/`parseEnvelopeLine`), so the prompt-vs-subagent
//     mode invariance — the field distinguishing the Option-1 threading — is
//     only observable in one real process tree, exactly as bug 0174's
//     integration witness (`invoke-prompt-cell-enum-return.test.ts`). A unit
//     tier cannot exhibit it.
//
// TOKENS: none. Every theta body here is a pure tail expression or a `let` chain
// ending in one; no callee issues a query, so no provider is contacted. The
// marshalled `--provider`/`--model` reference (PIC-62) only satisfies the launch
// argv shape.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three in cell 4:
// `process.argv[1]` replaced by the repo's own pi CLI entry through the
// `ExecutableHost`, `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's
// `extensions/`, and `parentPid` written beside it so the AUTHENTICATED control
// plane does not strip the pin. Without them the observation would name whatever
// ambient theta install the machine carries.
//
// FIXTURE-SHAPE CONSTRAINTS (from invoke-prompt-cell-enum-return.test.ts):
// no callee declares `params:`, and no body feeds `.keys()` into an `array<T>`
// sink — both make a spawned child exit 0 with no `theta_result` envelope
// (bugs 0178/0179, open). Every declaration a fixture needs is in its own body,
// and the value is returned directly. The caller uses the explicit
// `invoke<Sev>` annotation form, which `#resolveReturnSite` resolves against the
// caller's own body.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import { type ThetaValue } from "../src/runtime/value";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { MaterializedImport } from "../src/runtime/lexical-environment";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { FileSystem } from "../src/seams/file-system";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
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
import { parseDeps } from "./helpers/e2e-s1";

const PROMPT_FM = "---\nmode: prompt\n---\n";
const SUBAGENT_FM = "---\nmode: subagent\n---\n";

/** The two-variant declaration every fixture reuses. Explicit wire values so the collision is on the tag alone, not on inferred wire. */
const SEV_DECL = 'enum Sev { Low = "low", High = "high" }\n';

// ===========================================================================
// OFFLINE HARNESS (cells 1 & 2) — the real production prompt-mode binding over a
// real parse, reaching the prompt→prompt ATTACH cell in-process. This mirrors
// `invoke-return-enum-carrier-projection.test.ts`'s `driveTypedInvoke`, but
// returns the caller's OWN tail value (a boolean or branded object) rather than
// the invoke boundary Result, because 0337's observable is the caller-side
// `==` decision, not the Result envelope.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function parseDepsLocal(): Parameters<typeof parseThetaDocument>[1] {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse a fixture and fail LOUDLY on any error-severity diagnostic (*No silent test skipping*). */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDepsLocal());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: fixture ${path} failed to parse — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

/** The production AJV validator with the shipped `JSON.stringify` content-addressing, for the `invoke<T>` return gate. */
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator: realAjvValidator(),
  } as unknown as RuntimeRoot;
}

/**
 * Drive a prompt-mode caller in-process. When `callee` is supplied it is served
 * by `parseCallee`, so the caller's `invoke<Sev>("./b.theta")` reaches the
 * prompt→prompt attach cell (`production-theta-producer.ts:3718`) and the
 * callee's own body runs in-process — the boxed enum carrier is delivered to the
 * caller UNCHANGED, retaining the callee's file-qualified declaring key
 * (bug 0337 §Fix: the invoke-return decode leaves an already-boxed carrier
 * alone). The distinct `callerPath`/callee `sourcePath` are what make the two
 * `enum Sev` declarations resolve to different declaring keys.
 *
 * Returns the JSON projection of the caller's tail value — the `==` boolean or
 * branded report the caller computed.
 */
async function driveCaller(input: {
  readonly callerPath: string;
  readonly callerSrc: string;
  readonly callee?: { readonly path: string; readonly src: string };
}): Promise<unknown> {
  // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict, so
  // the resolved callee is wrapped `{ kind: "ok", input }`.
  const parseCallee = (): Promise<CalleeParseOutcome> => {
    if (input.callee === undefined) {
      // A cell with no invoke must never reach here; a call is a harness bug,
      // surfaced loudly rather than served a silent default.
      return Promise.reject(new Error("precondition unmet: parseCallee invoked by a no-callee cell"));
    }
    const doc = parseTheta(input.callee.path, input.callee.src);
    return Promise.resolve({
      kind: "ok",
      input: {
        slashName: "callee",
        sourcePath: input.callee.path,
        frontmatter: doc.frontmatter as ParsedFrontmatter,
        body: doc.body,
      },
    });
  };

  const deps = createProductionProducerDeps({
    // `getActiveTools`/`setActiveTools` satisfy the PIC-17 prompt→prompt suspend
    // window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee,
  });

  const callerDoc = parseTheta(input.callerPath, input.callerSrc);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: input.callerPath,
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail — ${JSON.stringify(execution.error)}`,
    );
  }
  const value = execution.result.value;
  if (value === undefined) {
    throw new Error("precondition unmet: the caller body produced no tail value");
  }
  // A boolean tail is a plain value; an object tail is a branded schema value —
  // both JSON-project by the same rule the wire/envelope uses.
  return JSON.parse(JSON.stringify(value)) as unknown;
}

// ---------------------------------------------------------------------------
// Cell 1 — CORE cross-file collision, prompt→prompt ATTACH leg, OFFLINE.
// ---------------------------------------------------------------------------

describe("bug 0337 (1) CORE — invoke<Sev> of a DIFFERENT-file callee returning Sev.Low", () => {
  it("RED-at-fork: the returned variant does NOT satisfy the caller's own Sev.Low, though its wire is still \"low\"", async () => {
    // a.theta declares its own `enum Sev` and invokes b.theta, a DIFFERENT file
    // that declares its own `enum Sev` and tails `Sev.Low`. §Reproduction.
    const callerSrc =
      PROMPT_FM +
      SEV_DECL +
      "schema Rep { ok: boolean, eq: boolean, wire: Sev }\n" +
      'let r = invoke<Sev>("./b.theta")\n' +
      "let ok = match r { Ok(v) => true, Err(e) => false }\n" +
      "let eq = match r { Ok(v) => v == Sev.Low, Err(e) => false }\n" +
      "let wire = match r { Ok(v) => v, Err(e) => Sev.High }\n" +
      "Rep { ok: ok, eq: eq, wire: wire }\n";

    const report = (await driveCaller({
      callerPath: "/theta/a.theta",
      callerSrc,
      callee: { path: "/theta/b.theta", src: PROMPT_FM + SEV_DECL + "Sev.Low\n" },
    })) as { ok: boolean; eq: boolean; wire: unknown };

    // The invoke must actually have returned Ok — otherwise `eq` would be false
    // via the Err arm and the FALSE assertion below would pass for the wrong
    // reason. The prompt→prompt enum-return path is bug 0174, fixed.
    expect(report.ok, "precondition: invoke<Sev> of the prompt-mode callee returns Ok").toBe(true);

    // PRIMARY (0337 §Expected). runtime-value-model.md:13,:29 — the returned
    // variant is a value of b.theta's declaration, which a.theta never wrote, so
    // it must NOT compare `==` equal to a.theta's own Sev.Low. At the fork both
    // carry the bare tag "Sev" and wire "low", so valuesEqual (value.ts:503)
    // returns true — this is where the witness reds pre-fix.
    expect(
      report.eq,
      "a value of a declaration the caller did not write must not satisfy the caller's own enum in `==`",
    ).toBe(false);

    // The confusion is invisible on the wire: the returned variant still
    // serialises to the bare wire string "low" (runtime-value-model.md:13). The
    // inequality is on IDENTITY, not wire — this pins that the fix distinguishes
    // by declaring key while preserving the value.
    expect(report.wire, "the returned variant's wire value is preserved across the attach leg").toBe(
      "low",
    );
  });
});

// ---------------------------------------------------------------------------
// Cell 2 — SAME-FILE equality CONTROL, OFFLINE. Green now and after: one file's
// `Sev.Low` compares equal to itself, so the file-qualified keying does not
// break same-file identity.
// ---------------------------------------------------------------------------

describe("bug 0337 (2) SAME-FILE CONTROL — one file's Sev.Low compares equal to itself", () => {
  it("green now and after: two body-constructed variants of ONE declaration compare `==` true", async () => {
    const wire = await driveCaller({
      callerPath: "/theta/same.theta",
      callerSrc: PROMPT_FM + SEV_DECL + "Sev.Low == Sev.Low\n",
    });

    // runtime-value-model.md:29 — one declaration, so both operands carry the
    // SAME file-qualified key and the same wire; the fix must leave this true.
    expect(
      wire,
      "same-file `Sev.Low == Sev.Low` is true under the file-qualified scheme (one declaring key)",
    ).toBe(true);
  });

  it("green now and after: distinct variants of one declaration compare `==` false", async () => {
    const wire = await driveCaller({
      callerPath: "/theta/same.theta",
      callerSrc: PROMPT_FM + SEV_DECL + "Sev.Low == Sev.High\n",
    });

    // Same declaring key, different wire — pins that same-file equality is by
    // wire, not universally true, so cell (2)'s green is a real relation.
    expect(wire, "same-file `Sev.Low == Sev.High` is false (same key, different wire)").toBe(false);
  });
});

// ===========================================================================
// OFFLINE `.thetalib` HARNESS (cell 3) — the b0305 D3 control shape: two
// DIFFERENT `.thetalib` `enum Sev` declarations compare `==` false. This pins
// that the fix keys on DECLARATION identity (declaring path + name), the same
// scheme 0337 generalises from `.thetalib` to `.theta`; a "compare wire only"
// regression would wrongly flip it to true. Replicated from
// `b0305-enum-alias-identity.test.ts`.
// ===========================================================================

function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

const THETALIB_FM = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/** Parse `/proj/app.theta`, run the real `checkThetaImports` over `libs`, then `executeBody`; return the JSON projection of the tail. */
async function runThetalib(appBody: string, libs: Record<string, string>): Promise<unknown> {
  const app = parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${THETALIB_FM}\n${appBody}`) },
    parseDeps(),
  );
  expect(
    app.frontmatter,
    `frontmatter must parse; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  const errors = check.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: a well-formed enum import must load clean — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    } as unknown as RuntimeRoot,
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
    }),
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  });
  const execution = await executeBody(app.body, binding.executeDeps);
  const value = execution.result.value as ThetaValue | undefined;
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown);
}

describe("bug 0337 (3) `.thetalib` D3 CONTROL — two DIFFERENT declarations stay `==` false", () => {
  it("green now and after — MUST stay false: two separate `.thetalib` `enum Sev` declarations compare `==` false", async () => {
    const wire = await runThetalib(
      'import { Sev as SA } from "./liba.thetalib"\nimport { Sev as SB } from "./libb.thetalib"\nlet x = SA.Low == SB.Low\nx',
      {
        "/proj/liba.thetalib": "enum Sev { Low, High }",
        "/proj/libb.thetalib": "enum Sev { Low, High }",
      },
    );
    // runtime-value-model.md:13,:29 — two distinct declaring enums (file-qualified
    // keys, bug 0305), so `SA.Low == SB.Low` is false; the `.theta` fix must
    // reproduce this identity discipline rather than compare wire alone.
    expect(wire, "two distinct `.thetalib` declarations keep comparing `==` false").toBe(false);
  });
});

// ===========================================================================
// Cell 4 — MODE-INVARIANCE, INTEGRATION (real spawned children, provider-free).
// A subagent-root caller invokes TWO prompt-mode callees (ATTACH, in-process
// inside the spawned root) and TWO subagent-mode callees (SPAWN, grandchildren),
// each in its OWN file, each declaring its own `enum Sev` tailing `Sev.Low`. The
// observable must be identical across legs: cross-file variants compare unequal,
// and the wire is preserved, on the prompt leg and the subagent leg alike.
// Modelled on `invoke-prompt-cell-enum-return.test.ts`.
// ===========================================================================

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/** The marshalled model reference riding the child argv (PIC-62). NEVER CONTACTED: no fixture issues a query. */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0337 mode-invariance ` +
        `witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}

/** The callee body every leg shares below its frontmatter: a self-declared `enum Sev` tailing `Sev.Low`. */
const CALLEE_BODY = SEV_DECL + "Sev.Low\n";

const CELL4_FIXTURES: Readonly<Record<string, string>> = {
  // Two DIFFERENT prompt-mode files, byte-identical below the frontmatter.
  "bp1.theta": PROMPT_FM + CALLEE_BODY,
  "bp2.theta": PROMPT_FM + CALLEE_BODY,
  // Two DIFFERENT subagent-mode files, byte-identical below the frontmatter.
  "bs1.theta": SUBAGENT_FM + CALLEE_BODY,
  "bs2.theta": SUBAGENT_FM + CALLEE_BODY,
};

/**
 * The subagent-root caller. It threads `callerMode: "prompt"` (subagent-root
 * regime, PIC-58), so a prompt-mode callee is reached via the ATTACH cell
 * in-process and a subagent-mode callee via the SPAWN cell as a grandchild —
 * both legs observed under one root. Every `invoke` is reduced through `match`
 * into report fields (soft assertions), so a refused row is DATA rather than an
 * unwind. `vpN`/`vsN` fall back to `Sev.High` on Err so a spurious Err surfaces
 * as a wrong wire/equality rather than masking.
 */
const CELL4_ROOT = [
  "---",
  "mode: subagent",
  "---",
  'enum Sev { Low = "low", High = "high" }',
  "schema R {",
  "  p1ok: boolean, p2ok: boolean, s1ok: boolean, s2ok: boolean,",
  "  vp1EqVp2: boolean, vs1EqVs2: boolean,",
  "  vp1EqOwn: boolean, vp2EqOwn: boolean, vs1EqOwn: boolean, vs2EqOwn: boolean,",
  "  vp1Wire: Sev, vp2Wire: Sev, vs1Wire: Sev, vs2Wire: Sev,",
  "  legInvariant: boolean",
  "}",
  'let rp1 = invoke<Sev>("./bp1.theta")',
  'let rp2 = invoke<Sev>("./bp2.theta")',
  'let rs1 = invoke<Sev>("./bs1.theta")',
  'let rs2 = invoke<Sev>("./bs2.theta")',
  "let p1ok = match rp1 { Ok(v) => true, Err(e) => false }",
  "let p2ok = match rp2 { Ok(v) => true, Err(e) => false }",
  "let s1ok = match rs1 { Ok(v) => true, Err(e) => false }",
  "let s2ok = match rs2 { Ok(v) => true, Err(e) => false }",
  "let vp1 = match rp1 { Ok(v) => v, Err(e) => Sev.High }",
  "let vp2 = match rp2 { Ok(v) => v, Err(e) => Sev.High }",
  "let vs1 = match rs1 { Ok(v) => v, Err(e) => Sev.High }",
  "let vs2 = match rs2 { Ok(v) => v, Err(e) => Sev.High }",
  "let vp1EqVp2 = vp1 == vp2",
  "let vs1EqVs2 = vs1 == vs2",
  "let legInvariant = vp1EqVp2 == vs1EqVs2",
  "R {",
  "  p1ok: p1ok, p2ok: p2ok, s1ok: s1ok, s2ok: s2ok,",
  "  vp1EqVp2: vp1EqVp2, vs1EqVs2: vs1EqVs2,",
  "  vp1EqOwn: vp1 == Sev.Low, vp2EqOwn: vp2 == Sev.Low,",
  "  vs1EqOwn: vs1 == Sev.Low, vs2EqOwn: vs2 == Sev.Low,",
  "  vp1Wire: vp1, vp2Wire: vp2, vs1Wire: vs1, vs2Wire: vs2,",
  "  legInvariant: legInvariant",
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

describe("bug 0337 (4) MODE-INVARIANCE — cross-file enum inequality is identical on the attach and spawn legs", () => {
  it(
    "a same-named enum from a different callee file collides with neither the caller's own nor the other callee's, on both legs",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0337-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(CELL4_FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top.theta"), CELL4_ROOT);

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

      // The REAL production spawn path with ALL THREE child pins: the executable
      // (host.argv1 → PI_CLI_ENTRY), the extension identity
      // (SUBAGENT_EXTENSION_PIN_ENV → this tree's extensions/, which inherits down
      // to grandchildren the subagent-mode invokes spawn), and parentPid (which
      // AUTHENTICATES the pin at each level — omitting it strips the pin silently).
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top",
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

      const exitPromise = new Promise<ChildExitInfo>((resolve) => child.onExit(resolve));

      try {
        // In-test watchdog BELOW the vitest timeout: on a stall kill the tree so
        // the drive settles fail-closed and the assertions report loudly, rather
        // than hanging to the outer timeout.
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
          "the driven root made no progress within 90s — the invoke set did not settle",
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

        // Preconditions: every leg's invoke returned Ok. A false here would make
        // the equality/wire fields read from the `Sev.High` fallback, so the
        // FALSE assertions below could pass for the wrong reason. Soft so one run
        // names every failing leg.
        expect.soft(report.p1ok, "(p1ok) attach leg bp1 returns Ok").toBe(true);
        expect.soft(report.p2ok, "(p2ok) attach leg bp2 returns Ok").toBe(true);
        expect.soft(report.s1ok, "(s1ok) spawn leg bs1 returns Ok").toBe(true);
        expect.soft(report.s2ok, "(s2ok) spawn leg bs2 returns Ok").toBe(true);

        // ATTACH leg: two DIFFERENT prompt-mode files' Sev must be unequal.
        // RED at fork: bare tag "Sev" on both → true.
        expect.soft(
          report.vp1EqVp2,
          "(vp1EqVp2) two different `.theta` files' Sev collide on the attach leg → must be unequal (0337 §Expected)",
        ).toBe(false);

        // SPAWN leg: the SAME defect reaching across the subagent envelope. This
        // is the field distinguishing the completed Option-1 subagent-leg
        // threading — at fork AND under a subagent-leg-bare-tag partial fix it is
        // true. RED at fork: true.
        expect.soft(
          report.vs1EqVs2,
          "(vs1EqVs2) two different `.theta` files' Sev collide ACROSS the subagent envelope → must be unequal (Option-1 threading)",
        ).toBe(false);

        // Each returned variant is a value of a callee declaration the caller
        // never wrote, so none satisfies the caller's own Sev.Low.
        // RED at fork: all true.
        expect.soft(report.vp1EqOwn, "(vp1EqOwn) bp1's Sev.Low is not the caller's own").toBe(false);
        expect.soft(report.vp2EqOwn, "(vp2EqOwn) bp2's Sev.Low is not the caller's own").toBe(false);
        expect.soft(report.vs1EqOwn, "(vs1EqOwn) bs1's Sev.Low is not the caller's own").toBe(false);
        expect.soft(report.vs2EqOwn, "(vs2EqOwn) bs2's Sev.Low is not the caller's own").toBe(false);

        // Wire preserved on every leg: the identity differs but the value does
        // not — JSON.stringify prints the bare "low" for each returned variant.
        expect.soft(report.vp1Wire, "(vp1Wire) attach leg wire preserved").toBe("low");
        expect.soft(report.vp2Wire, "(vp2Wire) attach leg wire preserved").toBe("low");
        expect.soft(report.vs1Wire, "(vs1Wire) spawn leg wire preserved").toBe("low");
        expect.soft(report.vs2Wire, "(vs2Wire) spawn leg wire preserved").toBe("low");

        // MODE INVARIANCE: the leg does not change the observable — the
        // attach-leg inequality result equals the spawn-leg inequality result
        // (both false). Green post-fix and green at the fork (both true there),
        // but RED under a PARTIAL fix that repaired only the prompt leg
        // (attach=false, spawn=true) — the field that pins the subagent leg was
        // threaded too.
        expect.soft(
          report.legInvariant,
          "(legInvariant) the attach and subagent legs agree on cross-file inequality (mode invariance)",
        ).toBe(true);

        // The collision is silent on the diagnostic channel: an empty drain is
        // part of the signature; a non-empty one means the run failed for a
        // different reason.
        expect.soft(
          diagnostics,
          `the drive emitted diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toEqual([]);

        // PIC-59: one invocation per process — after the envelope the child self-exits 0.
        const exit = await exitPromise;
        expect(exit.code).toBe(0);
        expect(exit.signal).toBeNull();
      } finally {
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
