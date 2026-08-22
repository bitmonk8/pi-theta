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
//   (D4) — the ONE pinned divergence between the readers at HEAD (see below).
//
// WHAT IS GREEN AT HEAD: every cell in (D1), (D2), (D3) and (D4). The fallback
// delegates the grammar, so malformed entries (`read bash`, `read as`,
// `read as file_read junk`) contribute no presented name on either side, and the
// well-formed shapes agree.
//
// THE PINNED DIVERGENCE (D4): for a HYPHENATED `.theta` entry the two readers
// still disagree. The resolver's `thetaDefaultName` (`src/parser/callable-set.ts`)
// maps hyphens to underscores; the fallback's default-name derivation calls
// `thetaCallableName` (`src/extension/production-theta-producer.ts`), which does
// not. `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §default name
// ("hyphens replaced by underscores", `./code-review.theta` → `code_review`) makes
// the resolver's answer the specified one, and the parse gate's `toolCallableName`
// (`src/parser/theta-document.ts`) agrees with the resolver. (D4) PINS the current
// divergent state — it is NOT an endorsement of it: the divergence is recorded as
// filed-separately in bug 0107 §Fix constraint 4 (residual disposition "records it
// as filed-separately"), and closing it (one line: reuse the resolver's derivation
// in the fallback) MUST red (D4) so that this record is updated in the same change.
//
// TIER: unit, offline, provider-free, deterministic. (D1) scans shipped source on
// the footing `tests/di-seam-skeleton.test.ts` uses for its ambient-primitive scan
// of the real `src/**` tree, because `presentedCallableNames` appears in no
// `export`. (D3)/(D4) reach the same function behaviourally through the producer
// drive — the harness shape of `runSource` in
// `tests/conformance/production-conformance.test.ts` (snapshot-absent
// `ThetaCompositionInput`) plus the producer-level belt harness of
// `tests/shadowed-callable-call.test.ts`. No live model, no provider.
//
// NO SILENT SKIPPING: (D1) throws by name if the function it scans cannot be
// located in the shipped source, so a rename can never read as a pass. (D3)/(D4)
// fail loudly on any unexpected error-severity parse diagnostic, so a red is
// always a dispatch verdict and never a fixture typo.

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
// Groups (D3)/(D4) — the behavioural half (bug 0107 §Fix (b)): what the
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

describe("Bug 0107 (D4) — the ONE pinned divergence: a hyphenated `.theta` default name", () => {
  // KNOWN, DOCUMENTED DIVERGENCE — PINNED, NOT ENDORSED. 
  //
  // For `- ./b0107-code-review.theta` the two readers derive DIFFERENT presented
  // names at HEAD:
  //   resolver  → `b0107_code_review`  (`thetaDefaultName`, src/parser/callable-set.ts:
  //               `stem.replace(/-/g, "_")`) — and the parse gate's
  //               `toolCallableName` (src/parser/theta-document.ts) agrees with it;
  //   fallback  → `b0107-code-review`  (`thetaCallableName`,
  //               src/extension/production-theta-producer.ts — no hyphen mapping).
  // The SPECIFIED answer is the resolver's:
  // docs/spec_topics/frontmatter/frontmatter-fields-a.md §default name — "the
  // default name is the file's basename without the `.theta` extension, with
  // hyphens replaced by underscores (`./code-review.theta` → `code_review`)",
  // mirrored at docs/reference/frontmatter.md. So the state this cell pins is
  // WRONG BY THE SPEC and is recorded as filed-separately per bug 0107 §Fix
  // constraint 4 (route "record it as filed-separately"); the fallback's own doc
  // comment even claims the mapping ("post-`as` / post-hyphen→underscore").
  //
  // The pin is deliberate: closing the divergence (one line — reuse the
  // resolver's derivation in the fallback) MUST red this cell, which forces the
  // record above to be corrected in the same change instead of leaving a stale
  // "known divergence" note behind. Do NOT weaken it to `.toBeDefined()` or to a
  // both-ways assertion; flip it to `belt-fired` when the divergence closes and
  // move the cell into (D3).
  it("pins the fallback presenting the hyphenated stem where the resolver presents the underscored one — ", async () => {
    const entry = "./b0107-code-review.theta";
    const resolver = resolverNames(entry, [], [entry]);
    expect(
      resolver,
      "the RESOLVER's side of the pinned divergence moved: " +
        "docs/spec_topics/frontmatter/frontmatter-fields-a.md §default name maps " +
        "hyphens to underscores, so `thetaDefaultName` must still answer " +
        "`b0107_code_review` here",
    ).toEqual(["b0107_code_review"]);
    expect(await beltVerdictFor(entry, "b0107_code_review"),
      "the bug-0016 dispatch belt FIRED for a shadowed call of `b0107_code_review`, " +
      `so the snapshot-absent fallback now presents the SPEC'd name for \`- ${entry}\` ` +
      "and agrees with the resolver. That is the divergence bug 0107 §Fix " +
      "constraint 4 left filed-separately being CLOSED. This cell pins the old " +
      "state: flip it to `belt-fired`, move it into (D3), and update " +
      "the file header's PINNED DIVERGENCE paragraph.",
    ).toBe("drive-completed");
  });
});
