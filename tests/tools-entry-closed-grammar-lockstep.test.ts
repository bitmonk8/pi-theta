import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetResult,
  type ToolsField,
} from "../src/parser/callable-set";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";

// Bug 0069 §Fix constraint 5, hardened per bug 0107 (§Fix routes (c) + (b)) —
// the `tools:` entry grammar must have ONE implementation. `presentedCallableNames`
// (`src/extension/production-theta-producer.ts`, module-private) reads the presented
// callable names off the frozen resolution snapshot when a theta has one, and falls
// back to deriving them from `frontmatter.tools` when it does not (an in-memory
// harness fixture). The pinned contract: that fallback owns NO token grammar — it
// calls the exported `parseToolsEntry` (`src/parser/callable-set.ts`), the same
// closed grammar `resolveCallableSet` enforces, so the two readers cannot disagree
// about which entries exist.
//
// WHAT EACH GROUP ASSERTS
//
//   (D1) — source shape over the shipped `presentedCallableNames` slice. Two
//         legacy ABSENCE cells (no `split(`, no quoted `as`: the two spellings
//         the pre-fix body used) plus the bug-0107 §Fix (c) PRESENCE cell: the
//         scanned body must call `parseToolsEntry`. The absence pair is a
//         blacklist and any unlisted re-tokenisation evades it (bug 0107
//         §Reproduction measured two: `match(/\S+/g)` + `includes(" as ")`, and
//         `indexOf(" as ")` + `search(/\s/)`, both passing both cells). The
//         presence cell closes that class: dropping the shared call is the one
//         thing every re-tokenisation must do.
//   (D2) — the resolver's derivations for the three well-formed entry shapes:
//         the Pi-tool name unchanged, the `.theta` basename with hyphens mapped
//         to underscores, the `as` target in place of either default.
//   (D3) — bug 0107 §Fix (b): DERIVATION AGREEMENT between the two readers,
//         behavioural. A real `.theta` source is driven through
//         `parseThetaDocument` → `createProductionProducerDeps().bindPromptConversation`
//         → `executeBody` with a `ThetaCompositionInput` carrying NO
//         `callableSet`, which selects the fallback arm
//         (`ParsedTheta.callableSet?` in `src/extension/reload-wiring.ts`:
//         absent → the producer-wide fallback). The observable is the bug-0016
//         dispatch belt: `LexicalEnvironment.localShadowsCallable`
//         (`src/runtime/lexical-environment.ts`) tests `root.callables.has(name)`
//         first, and a shadowed call of a registered name throws
//         `ShadowedCalleeDispatchDefectError` (`src/runtime/tool-call.ts`).
//         Belt fires ⇒ the name IS in the arm-4 registry the fallback populated;
//         the drive completing ⇒ it is not. Each cell states what the resolver
//         answers for the same entry, so a red names the disagreement.
//         Two cells read a second observable instead of the belt: the ROUTE a
//         call of a presented name takes. A snapshot-absent fixture whose entry
//         names a `.theta` file the fixture directory does not hold fails with
//         `invoke_infra` / `load_failure` when `thetaCalleePath`
//         (`src/extension/production-theta-producer.ts`) resolves the entry to a
//         callee path, and returns the ambient Pi-tool sentinel when it resolves
//         none. That is the second consequence of the same derivation, and bug
//         0253 §Fix step 4 requires a witness for it.
//
// WHAT IS GREEN AT HEAD: every cell in (D1), (D2) and (D3). The fallback
// delegates the grammar, so malformed entries (`read bash`, `read as`,
// `read as file_read junk`) contribute no presented name on either side, and the
// well-formed shapes agree.
//
// HYPHENATED STEMS AGREE TOO (bug 0253): a HYPHENATED `.theta` entry has ONE
// default name on both readers, because the fallback's default-name derivation
// calls the resolver's `thetaDefaultName` (`src/parser/callable-set.ts`) instead
// of holding a second implementation of the rule.
// `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §default name ("hyphens
// replaced by underscores", `./code-review.theta` → `code_review`) is that rule,
// the parse gate's `toolCallableName` (`src/parser/theta-document.ts`) derives it
// too, and both of the fallback's consumers of the name — the presented-name list
// and `thetaCalleePath`'s entry match — read the single implementation. The two
// (D3) cells over `- ./b0107-code-review.theta` and `- ./b0253-code-review.theta`
// hold that agreement: a second derivation reintroduced in the producer reds them
// while leaving every hyphen-free cell green.
//
// TIER: unit, offline, provider-free, deterministic. (D1) scans shipped source on
// the footing `tests/di-seam-skeleton.test.ts` uses for its ambient-primitive scan
// of the real `src/**` tree, because `presentedCallableNames` appears in no
// `export`. (D3) reaches the same function behaviourally through the producer
// drive — the harness shape of `runSource` in
// `tests/conformance/production-conformance.test.ts` (snapshot-absent
// `ThetaCompositionInput`) plus the producer-level belt harness of
// `tests/shadowed-callable-call.test.ts`. No live model, no provider.
//
// NO SILENT SKIPPING: (D1) throws by name if the function it scans cannot be
// located in the shipped source, so a rename can never read as a pass. (D3)
// fails loudly on any unexpected error-severity parse diagnostic, and on a drive
// that ends in neither of the two routes it discriminates, so a red is always a
// dispatch verdict and never a fixture typo.

// --- The shipped source under scan -----------------------------------------

const PRODUCER_SOURCE = readFileSync(
  fileURLToPath(
    new URL("../src/extension/production-theta-producer.ts", import.meta.url),
  ),
  "utf8",
);

/**
 * The body text of the named top-level function in `source`, from its
 * declaration line to the closing brace in column 0. Throws when the
 * declaration is absent: the scan's subject must exist for its verdict to mean
 * anything.
 */
function topLevelFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`\nfunction ${name}(`);
  if (start < 0) {
    throw new Error(
      `no top-level \`function ${name}(\` in src/extension/production-theta-producer.ts: ` +
        "the lock-step scan has no subject",
    );
  }
  const end = source.indexOf("\n}\n", start);
  if (end < 0) {
    throw new Error(
      `no column-0 closing brace for \`function ${name}\`: the lock-step scan ` +
        "cannot delimit its subject",
    );
  }
  return source.slice(start, end + 3);
}

// ===========================================================================
// Group (D1) — one grammar, one implementation.
// ===========================================================================

describe("Bug 0069 (D1) — the snapshot-absent fallback carries no entry grammar of its own", () => {
  const body = topLevelFunctionBody(PRODUCER_SOURCE, "presentedCallableNames");

  it("does not split an entry into tokens itself", () => {
    expect(
      body,
      "`presentedCallableNames` still tokenises a `tools:` entry, so the tree " +
        "holds a second answer to which entries exist — and this one admits " +
        "the residue the resolver rejects:\n" + body,
    ).not.toMatch(/\bsplit\(/);
  });

  it("does not re-test the `as` keyword itself", () => {
    expect(
      body,
      "`presentedCallableNames` still decides the `as` clause locally instead " +
        "of asking the shared grammar:\n" + body,
    ).not.toMatch(/["']as["']/);
  });

  // Bug 0107 §Fix (c) — the WHITELIST cell. The two absence cells above name
  // spellings of the deleted body; this one names the property constraint 5
  // states. A body that answers "which entries exist" with any tokeniser of its
  // own — measured evasions: `match(/\S+/g)` + `includes(" as ")`, and
  // `indexOf(" as ")` + `search(/\s/)` — must drop the shared call to do so, and
  // fails here regardless of how it spells the split. 
  it("delegates: the scanned body calls the shared exported grammar — ", () => {
    expect(
      body,
      "`presentedCallableNames` no longer calls `parseToolsEntry` " +
        "(exported from src/parser/callable-set.ts precisely so this fallback " +
        "answers 'which entries exist' from the SAME closed grammar " +
        "`resolveCallableSet` enforces — bug 0069 §Fix constraint 5). Whatever " +
        "it derives names from now is a SECOND answer, and the two readers can " +
        "disagree about a malformed entry again:\n" + body,
    ).toMatch(/\bparseToolsEntry\(/);
  });
});

// ===========================================================================
// Group (D2) — the derivation both sides must agree on.
// ===========================================================================

/** A `CallableSetDeps` over an explicit Pi-tool registry and `.theta` table. */
function deps(
  piTools: readonly string[],
  thetaPaths: readonly string[],
): CallableSetDeps {
  const available = new Set(piTools);
  const callees = new Set(thetaPaths);
  return {
    resolvePiTool: (name) =>
      available.has(name)
        ? { kind: "pi-tool", toolDefinition: { name } as never }
        : undefined,
    resolveThetaCallee: (thetaPath) =>
      callees.has(thetaPath)
        ? { kind: "theta", mode: "subagent", callee: undefined, calleePath: thetaPath }
        : undefined,
    reservedNames: new Set<string>(),
  };
}

function resolveList(
  items: readonly string[],
  piTools: readonly string[],
  thetaPaths: readonly string[] = [],
): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({
    file: "test.theta",
    tools,
    deps: deps(piTools, thetaPaths),
  });
}

describe("Bug 0069 (D2) — the presented names of the well-formed entry shapes", () => {
  it("a bare Pi-tool name, a hyphenated `.theta` basename, and an `as` rename", () => {
    // The three derivations a delegating fallback has to reproduce verbatim:
    // the Pi-tool name unchanged, the basename with hyphens mapped to
    // underscores, and the `as` target in place of either default.
    const r = resolveList(
      ["read", "./code-review.theta", "grep as searcher"],
      ["read", "grep"],
      ["./code-review.theta"],
    );
    expect(r.registered, `resolution diagnostics: ${JSON.stringify(r.diagnostics)}`).toBe(
      true,
    );
    expect([...(r.callableSet?.entries.keys() ?? [])].sort()).toEqual([
      "code_review",
      "read",
      "searcher",
    ]);
  });
});

// ===========================================================================
// Group (D3) — the behavioural half (bug 0107 §Fix (b)): what the
// SNAPSHOT-ABSENT FALLBACK presents, read through the bug-0016 dispatch belt.
// ===========================================================================

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: { wallNow: () => 0 },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/**
 * A `resolvePiTool` double that resolves ANY name to a sentinel-returning
 * dispatch, so a drive that is NOT stopped by the belt runs to completion
 * instead of dying on an unresolved callee. It makes "the belt did not fire"
 * an observable outcome rather than an ambiguous error.
 */
const AMBIENT_SENTINEL = "AMBIENT-EXECUTED";

function producerDeps() {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.resolve({ content: [{ type: "text", text: AMBIENT_SENTINEL }] }),
    }),
  });
}

/**
 * The two parse codes a shadow fixture legitimately carries: the bug-0016 parse
 * gate's own rejection of the shadowed call site, and the bare-object argument
 * form the call uses. Any OTHER error-severity code is a fixture defect and
 * fails loudly rather than being read as a dispatch verdict.
 */
const EXPECTED_FIXTURE_PARSE_CODES: ReadonlySet<string> = new Set([
  "theta/parse/shadowed-callable-call",
  "theta/parse/bare-object-literal",
]);

type BeltVerdict = "belt-fired" | "drive-completed";

/**
 * One `tools:` ENTRY, one local shadowing `shadowed`, one call of it — driven
 * through the real parse + the production producer with NO `callableSet`, which
 * is what selects the snapshot-absent fallback arm of `presentedCallableNames`.
 *
 * Returns `belt-fired` when the drive rejects with
 * `ShadowedCalleeDispatchDefectError` (⇒ `shadowed` IS a presented name in the
 * arm-4 callable registry the fallback populated) and `drive-completed` when it
 * does not (⇒ the fallback presented no such name).
 */
async function beltVerdictFor(entry: string, shadowed: string): Promise<BeltVerdict> {
  const src =
    ["---", "mode: prompt", "tools:", `  - ${entry}`, "---", `let ${shadowed} = "x"`, `${shadowed}({ path: "p" })?`].join(
      "\n",
    ) + "\n";
  const source: ThetaSource = {
    path: "b0107lockstep.theta",
    bytes: new TextEncoder().encode(src),
  };
  const document = parseThetaDocument(source, parseDeps());
  const unexpected = document.diagnostics
    .filter((d) => d.severity === "error" && !EXPECTED_FIXTURE_PARSE_CODES.has(d.code))
    .map((d) => d.code);
  expect(
    unexpected,
    `the agreement fixture for \`- ${entry}\` must parse clean apart from the two ` +
      "expected bug-0016 codes, so a red below is a dispatch verdict and never a " +
      "fixture defect; unexpected error codes: " + JSON.stringify(unexpected),
  ).toEqual([]);
  expect(
    document.frontmatter,
    `the agreement fixture for \`- ${entry}\` must carry parseable frontmatter`,
  ).not.toBeNull();
  const theta: ThetaCompositionInput = {
    // NO `callableSet` — this is the whole point of the group: absent snapshot
    // selects the producer-wide fallback (src/extension/reload-wiring.ts,
    // `ParsedTheta.callableSet?`).
    slashName: "b0107lockstep",
    sourcePath: "/fixtures/b0107lockstep.theta",
    frontmatter: document.frontmatter!,
    body: document.body,
  };
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = producerDeps().bindPromptConversation(bindInput);
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    // `drive-completed` is the PASS verdict for the malformed cells, so it is
    // only evidence if the drive actually REACHED the shadowed call site: the
    // tail `shadowed({ … })?` unwraps the ambient dispatch's `Ok(text)`, so the
    // sentinel in final-value position is the deterministic observable that the
    // ambient tool ran. Without it any earlier abort would read as a pass.
    expect(
      execution.result.value,
      `the drive for \`- ${entry}\` did not reach the call site (terminal outcome ` +
        `${execution.outcome}, final value ${JSON.stringify(execution.result.value)}), ` +
        "so `drive-completed` is not evidence that the fallback presented no name " +
        `for \`- ${entry}\``,
    ).toBe(AMBIENT_SENTINEL);
  } catch (err) {
    if (err instanceof Error && err.name === "ShadowedCalleeDispatchDefectError") {
      return "belt-fired";
    }
    throw err;
  }
  return "drive-completed";
}

/**
 * The two routes a call of a name can leave the snapshot-absent fallback by.
 * `theta-callee` means `thetaCalleePath`
 * (`src/extension/production-theta-producer.ts`) matched the `tools:` entry and
 * the call went out over the invoke path; `pi-tool` means it matched nothing and
 * the call fell through to Pi-tool dispatch.
 */
type CalleeRoute = "theta-callee" | "pi-tool";

/**
 * The one parse code the route fixture legitimately carries: the bare-object
 * argument form its call uses. It has no shadow, so the bug-0016 parse rejection
 * of `beltVerdictFor`'s fixtures must NOT appear here either.
 */
const EXPECTED_ROUTE_PARSE_CODES: ReadonlySet<string> = new Set([
  "theta/parse/bare-object-literal",
]);

/**
 * One `tools:` ENTRY and one call of `called` with NO local shadowing it, driven
 * through the real parse + the production producer with NO `callableSet`, which
 * selects the same snapshot-absent fallback arm `beltVerdictFor` reads — here
 * through `thetaCalleePath` rather than through the dispatch belt.
 *
 * Returns `theta-callee` when the drive fails with the `invoke_infra`
 * `load_failure` whose `callee_path` is the entry AS WRITTEN: the fixture
 * directory holds no such file, so reaching the load attempt at all is what
 * witnesses that the entry resolved to a `.theta` callee, and pinning the path
 * is what makes it the ENTRY's callee rather than some other absent file.
 * Returns `pi-tool` when the call instead dispatches through the ambient Pi-tool
 * double and yields its sentinel. Any other ending — including a `load_failure`
 * for a path that is not the entry — throws by name rather than being read as
 * either route.
 */
async function calleeRouteFor(entry: string, called: string): Promise<CalleeRoute> {
  const src =
    ["---", "mode: prompt", "tools:", `  - ${entry}`, "---", `${called}({ path: "p" })?`].join(
      "\n",
    ) + "\n";
  const source: ThetaSource = {
    path: "b0253lockstep.theta",
    bytes: new TextEncoder().encode(src),
  };
  const document = parseThetaDocument(source, parseDeps());
  const unexpected = document.diagnostics
    .filter((d) => d.severity === "error" && !EXPECTED_ROUTE_PARSE_CODES.has(d.code))
    .map((d) => d.code);
  expect(
    unexpected,
    `the route fixture for \`- ${entry}\` must parse clean apart from the expected ` +
      "bare-object code, so a red below is a routing verdict and never a fixture " +
      "defect; unexpected error codes: " + JSON.stringify(unexpected),
  ).toEqual([]);
  expect(
    document.frontmatter,
    `the route fixture for \`- ${entry}\` must carry parseable frontmatter`,
  ).not.toBeNull();
  const theta: ThetaCompositionInput = {
    // NO `callableSet`, as in `beltVerdictFor`: absent snapshot selects the
    // producer-wide fallback (src/extension/reload-wiring.ts,
    // `ParsedTheta.callableSet?`).
    slashName: "b0253lockstep",
    sourcePath: "/fixtures/b0253lockstep.theta",
    frontmatter: document.frontmatter!,
    body: document.body,
  };
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = producerDeps().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  const ending =
    `terminal outcome ${execution.outcome}, error ${JSON.stringify(execution.error)}, ` +
    `final value ${JSON.stringify(execution.result.value)}`;
  if (execution.outcome === "fail") {
    const error = execution.error as {
      readonly kind?: unknown;
      readonly cause?: unknown;
      readonly callee_path?: unknown;
    } | null;
    if (error?.kind === "invoke_infra" && error.cause === "load_failure") {
      // A `load_failure` alone only says SOME callee load was attempted. The
      // route verdict is about THIS entry, so the failing path must be the entry
      // as written; anything else means the match resolved a different callee and
      // must red rather than pass as the entry's route.
      if (error.callee_path !== entry) {
        throw new Error(
          `the route fixture for \`- ${entry}\` failed to load a DIFFERENT callee than the ` +
            `entry: \`callee_path\` is ${JSON.stringify(error.callee_path)}, expected ` +
            `${JSON.stringify(entry)} (${ending}), so the \`.theta\` route this witnesses is ` +
            "not the entry's",
        );
      }
      return "theta-callee";
    }
    throw new Error(
      `the route fixture for \`- ${entry}\` failed for something other than the absent ` +
        `callee file (${ending}), so neither route is witnessed`,
    );
  }
  if (execution.result.value === AMBIENT_SENTINEL) return "pi-tool";
  throw new Error(
    `the route fixture for \`- ${entry}\` reached neither route (${ending}): the drive did ` +
      "not reach the call site, so its ending is evidence of nothing",
  );
}

/** The resolver's presented names for a single-entry `tools:` list. */
function resolverNames(
  entry: string,
  piTools: readonly string[],
  thetaPaths: readonly string[] = [],
): string[] {
  const r = resolveList([entry], piTools, thetaPaths);
  return [...(r.callableSet?.entries.keys() ?? [])].sort();
}

describe("Bug 0107 (D3) — the fallback and the resolver agree on which entries exist", () => {
  // POSITIVE CONTROL. Proves the observable can fire at all: without this cell a
  // green "belt did not fire" elsewhere would be indistinguishable from a broken
  // harness. 
  it("positive control: a bare Pi-tool entry is presented, so a shadowed call trips the belt — ", async () => {
    const resolver = resolverNames("read", ["read"]);
    expect(await beltVerdictFor("read", "read"),
      "the snapshot-absent FALLBACK presented no `read` for `- read` (the bug-0016 " +
      "dispatch belt did not fire for a shadowed call of it), while the RESOLVER " +
      `presents ${JSON.stringify(resolver)} for the same entry. Either the two ` +
      "readers disagree, or the belt observable this group reads through is inert.",
    ).toBe("belt-fired");
  });

  // The `as` rename: both readers must present the rename target. 
  it("rename: `- grep as searcher` presents `searcher` on both readers — ", async () => {
    const resolver = resolverNames("grep as searcher", ["grep"]);
    expect(await beltVerdictFor("grep as searcher", "searcher"),
      "the FALLBACK presented no `searcher` for `- grep as searcher` (belt silent for a " +
      `shadowed call of it), while the RESOLVER presents ${JSON.stringify(resolver)}. ` +
      "The rename target is one of the three derivations a delegating fallback must " +
      "reproduce verbatim (see (D2)).",
    ).toBe("belt-fired");
  });

  // Well-formed `.theta` entry with a hyphen-free stem: both readers derive the
  // stem verbatim, so the belt must fire. 
  it("well-formed `.theta`: `- ./b0107plain.theta` presents `b0107plain` on both readers — ", async () => {
    const entry = "./b0107plain.theta";
    const resolver = resolverNames(entry, [], [entry]);
    expect(await beltVerdictFor(entry, "b0107plain"),
      `the FALLBACK presented no \`b0107plain\` for \`- ${entry}\` (belt silent for a ` +
      `shadowed call of it), while the RESOLVER presents ${JSON.stringify(resolver)}. ` +
      "For a hyphen-free stem the two derivations are textually identical, so a red " +
      "here means the fallback stopped deriving a `.theta` default name at all.",
    ).toBe("belt-fired");
  });

  // Bug 0253 — a HYPHENATED `.theta` entry, the last measured disagreement
  // between the two readers, now an agreement cell. The resolver's
  // `thetaDefaultName` (`src/parser/callable-set.ts`) maps hyphens to underscores
  // per `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §default name ("the
  // default name is the file's basename without the `.theta` extension, with
  // hyphens replaced by underscores", `./code-review.theta` → `code_review`,
  // mirrored at docs/reference/frontmatter.md), and the parse gate's
  // `toolCallableName` (`src/parser/theta-document.ts`) derives it too. The
  // fallback must present the same name, which it does by calling that one
  // implementation rather than deriving the stem again: a hyphen-bearing presented
  // name is spellable by no call site, so a second derivation puts an unreachable
  // row in the arm-4 registry and omits the row the source names. The entry stem
  // stays in bug 0107's fixture namespace — it is the cell 0107 pinned, flipped
  // by bug 0253 §Fix step 3.
  it("hyphenated `.theta`: `- ./b0107-code-review.theta` presents `b0107_code_review` on both readers — ", async () => {
    const entry = "./b0107-code-review.theta";
    const resolver = resolverNames(entry, [], [entry]);
    expect(
      resolver,
      "the RESOLVER's side of the agreement moved: " +
        "docs/spec_topics/frontmatter/frontmatter-fields-a.md §default name maps " +
        "hyphens to underscores, so `thetaDefaultName` must still answer " +
        "`b0107_code_review` here",
    ).toEqual(["b0107_code_review"]);
    expect(await beltVerdictFor(entry, "b0107_code_review"),
      `the FALLBACK presented no \`b0107_code_review\` for \`- ${entry}\` (the bug-0016 ` +
      "dispatch belt stayed silent for a shadowed call of it), while the RESOLVER " +
      `presents ${JSON.stringify(resolver)}. The producer is deriving the default name ` +
      "a second time instead of calling `thetaDefaultName`, so it presents the " +
      "hyphenated stem — a name no theta expression can spell — and the name the " +
      "source does call is absent from the arm-4 registry (bug 0253).",
    ).toBe("belt-fired");
  });

  // Bug 0253 §Fix step 4 — the SECOND consumer of the same derivation:
  // `thetaCalleePath`'s snapshot-absent match against `frontmatter.tools`. The
  // observable is the route, not the belt (see the group note above): a call whose
  // name the match recognises leaves over the invoke path and dies on the
  // fixture's absent file; a call it does not recognise falls through to Pi-tool
  // dispatch and silently succeeds against whatever `resolvePiTool` supplies. The
  // hyphen-free control comes first, so a green hyphenated cell can never be a
  // route observable that is inert.
  it("positive control: a call of `b0253plain` for `- ./b0253plain.theta` routes to the `.theta` callee — ", async () => {
    const entry = "./b0253plain.theta";
    expect(await calleeRouteFor(entry, "b0253plain"),
      `a call of \`b0253plain\` under \`- ${entry}\` dispatched through the Pi-tool route ` +
      "instead of the `.theta` callee, so `thetaCalleePath` resolved no path for an entry " +
      "whose stem needs no remap at all. Either the fallback stopped matching " +
      "`frontmatter.tools`, or the route observable this pair reads through is inert.",
    ).toBe("theta-callee");
  });

  it("hyphenated `.theta`: a call of `b0253_code_review` for `- ./b0253-code-review.theta` routes to the `.theta` callee — ", async () => {
    const entry = "./b0253-code-review.theta";
    const resolver = resolverNames(entry, [], [entry]);
    expect(
      resolver,
      "the RESOLVER's side of the agreement moved: `thetaDefaultName` must still " +
        "answer `b0253_code_review` for this entry",
    ).toEqual(["b0253_code_review"]);
    expect(await calleeRouteFor(entry, "b0253_code_review"),
      `a call of \`b0253_code_review\` under \`- ${entry}\` dispatched through the Pi-tool ` +
      "route and returned the ambient sentinel, so `thetaCalleePath`'s fallback match " +
      `resolved no callee path for the entry the RESOLVER presents as ${JSON.stringify(resolver)}. ` +
      "The match is deriving the entry's default name itself instead of calling " +
      "`thetaDefaultName`, so the same entry routes one way with a snapshot and the " +
      "other way without one, and nothing reports the substitution (bug 0253).",
    ).toBe("theta-callee");
  });

  // The three MALFORMED shapes. The resolver rejects each outright
  // (`theta/load/malformed-tool-entry`) and un-registers the theta, presenting
  // NOTHING; a lock-stepped fallback presents nothing either, so no belt fires.
  // Each cell probes EVERY identifier-shaped token of the entry, not one chosen
  // spelling of the truncation: a re-tokenising body presents `read` for
  // `- read bash` and `junk` for `- read as file_read junk` (bug 0107
  // §Reproduction, body V2), and probing all tokens reds on whichever
  // truncation a future body happens to pick. 
  const MALFORMED: readonly string[] = [
    "read bash",
    "read as",
    "read as file_read junk",
  ];
  for (const entry of MALFORMED) {
    it(`malformed \`- ${entry}\` presents no token at all on either reader — `, async () => {
      const resolver = resolveList([entry], ["read", "bash"]);
      const resolverKeys = [...(resolver.callableSet?.entries.keys() ?? [])].sort();
      const candidates = entry
        .trim()
        .split(/\s+/)
        .filter((t) => t !== "as" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(t));
      expect(
        candidates.length,
        `the malformed fixture \`- ${entry}\` must offer at least one probeable token`,
      ).toBeGreaterThan(0);
      for (const shadowed of candidates) {
        expect(await beltVerdictFor(entry, shadowed),
          `the FALLBACK presented \`${shadowed}\` for the malformed entry \`- ${entry}\` ` +
          "(the bug-0016 dispatch belt fired for a shadowed call of it), while the " +
          `RESOLVER registered=${String(resolver.registered)} and presents ` +
          `${JSON.stringify(resolverKeys)} — it rejects the entry outright with ` +
          "`theta/load/malformed-tool-entry` and un-registers the theta. That is the " +
          "exact disagreement bug 0069 §Fix constraint 5 forbids: the fallback is " +
          "tokenising the entry itself instead of delegating to `parseToolsEntry`.",
        ).toBe("drive-completed");
      }
    });
  }
});
