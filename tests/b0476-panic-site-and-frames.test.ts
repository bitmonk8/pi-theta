// Bug 0476 — a runtime panic's diagnostic carries a synthesized zero range
// instead of the panic site, and the aborted note shows no location or call
// chain (docs/bugs/0476-runtime-panic-site-zero-range-no-frames.md).
//
// The eight witnesses named in the bug doc's §Fix, in order:
//   (1) an index panic at top level — diagnostic `range` = the `IndexExpr`
//       range, `file` = the theta path, `hint` = one `at` line, `content` =
//       framing + `\n  at …`.
//   (2) the same panic inside a local `fn` — hint/content carry
//       `in fn second (<call site>)`.
//   (3) inside an imported `.thetalib` fn — `file` = the thetalib path (leaf
//       rule), the frame's call site = the importer.
//   (4) member / match panics attach their own node's range (the index arm's
//       site-attachment is already proven by (1)-(3); `evaluateIndexAccess`'s
//       `NullIndexAccessPanic` shares that exact same try/catch, so it is not
//       re-exercised with a separate fixture — see the report).
//   (5) `invoke-depth-exceeded` attaches the call expression.
//   (6) a `par for` lane panic carries the lane frame.
//   (7) the message string is byte-identical pre/post (the `<message>` slice
//       of the content equals the registry template rendering).
//   (8) tripwire: a `ThetaPanic` reaching `surfaceDispatchDefect` without a
//       site is asserted as a defect (the fallback exists, but no shipped
//       panic path may take it).
//   (9) an interpolation panic — `@`-query text rendering (`renderQueryText`
//       → `stringifyInterpolation`) raises through the PURE host evaluator
//       (BLOCKER A), which knows only the interpolation-local node range, not
//       the top-level file. Bug 0476 FOLLOW-UP: that local range is
//       misleading (it names the wrong LINE inside the interpolation, not the
//       enclosing query), so `retargetInterpolationPanic` (the one boundary
//       that knows both the local coordinate and the query's real range,
//       `renderQueryText`'s wrap around `stringifyInterpolation`) discards it
//       and installs the enclosing `@`-query's own range instead, naming the
//       hole in a new `in interpolation ${…}` frame.
//   (10) the same, inside a local `fn` called from an interpolation — the
//       pure fn-call boundary pushes an `in fn <name> (…)` frame whose range
//       is ALSO interpolation-local (the call written inside the `${…}`);
//       `retargetInterpolationPanic` retargets that outermost frame to the
//       query's real range and appends the `in interpolation ${…}` frame
//       after it. The fn body's OWN site (inside the callee, document AST)
//       is untouched — it was already file-relative.
//
// HARNESS. The `tests/b0303-imported-fn-body-declaring-scope.test.ts` /
// `tests/b0354-crossfile-fn-depth-uncounted.test.ts` shape: parse a real
// `.theta` (and, for (3)/(5), a real `.thetalib` over an in-memory
// `fakeThetaLibFs`) through the shipped `parseThetaDocument` /
// `checkThetaImports`, then drive the WHOLE shipped slash-dispatch entry
// (`composeThetaFixture(...).run(...)`) over `createProductionProducerDeps`
// with a capturing `pi` double — so every diagnostic / framing string
// asserted below is the real production emission, not a hand-built fixture.
// Offline, provider-free: every fixture theta has no `params:` (no binder
// model call) and issues no `@`-query (no provider turn); `pi.sendUserMessage`
// is absent from the double, so a turn slipping in fails loudly.
//
// Expected ranges are read off the SAME parser the production composition
// root uses (`lastExprOf`, walking the real parsed AST), never hand-counted —
// so a range assertion is comparing the shipped panic-site plumbing against
// the shipped parser's own node, not against a guess.

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import {
  composeThetaFixture,
  type ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseExpressionSource,
  parseThetaDocument,
  type Block,
  type CallExpr,
  type Expr,
  type ExprStmt,
  type FnDecl,
  type LetStmt,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  attachPanicSite,
  IndexOutOfBoundsPanic,
  pushPanicFrame,
  renderPanicSuffixLines,
  retargetInterpolationPanic,
  ThetaPanic,
  type PanicFrame,
} from "../src/runtime/runtime-panics";
import { INTERPOLATED_RESULT_CODE } from "../src/render/query-render";
import type { LetStmt as LetStmtType, ParForExpr } from "../src/parser/theta-document";
import { rootDouble } from "./helpers/call-with-clause-harness";
import { fakeThetaLibFs } from "./helpers/thetalib-load-harness";
import { parseDeps } from "./helpers/e2e-s1";

// --- mockable `executeBody` (witness 8 only; every other witness runs the ---
// --- REAL executor). Defaults to the actual implementation. -----------------
const executorHook = vi.hoisted(() => ({
  impl: undefined as ((...args: readonly unknown[]) => Promise<unknown>) | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> =>
      executorHook.impl === undefined
        ? (actual.executeBody as (...a: readonly unknown[]) => Promise<unknown>)(...args)
        : executorHook.impl(...args),
  };
});

// --- passthrough spy on `pushPanicFrame` (witness 6 only): a REAL `par for`
// --- lane panic must push exactly one `{ kind: "par-for" }` frame carrying
// --- the `ParForExpr`'s own range. Every call still forwards to the actual
// --- implementation, so every OTHER witness's behaviour is unaffected; this
// --- reds if `runParForIteration`'s `pushPanicFrame` call is ever deleted
// --- (proven once by hand: temporarily commenting that call turns this red).
const pushPanicFrameHook = vi.hoisted(() => ({
  calls: [] as PanicFrame[],
}));
vi.mock("../src/runtime/runtime-panics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/runtime/runtime-panics")>();
  return {
    ...actual,
    pushPanicFrame: (panic: ThetaPanic, frame: PanicFrame): void => {
      pushPanicFrameHook.calls.push(frame);
      actual.pushPanicFrame(panic, frame);
    },
  };
});

const APP_FRONTMATTER = ["---", "mode: prompt", "---"].join("\n");
// The on-disk path the harness gives the theta: a panic site in the TOP-LEVEL
// body names THIS (bug 0476 — `ExecuteBodyDeps.sourcePath`), never the slash
// name the checkpoint/diagnostic stamps use.
const APP_PATH = "/proj/app.theta";

function parseApp(body: string): ThetaDocument {
  return parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${body}`) },
    parseDeps(),
  );
}

/** Parse a `.thetalib` body (fence-less) at the given resolved path. */
function parseLib(path: string, body: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(body) }, parseDeps());
}

/**
 * The last expression a block ends on — its bare tail, or (when the parser
 * folded it into a trailing statement instead) that statement's own
 * expression. Robust to either parse shape, so a fixture's expected range is
 * read off whichever AST form the shipped parser actually produced.
 */
function lastExprOf(block: Block): Expr {
  if (block.tail !== null) {
    return block.tail;
  }
  const last = block.statements[block.statements.length - 1];
  if (last === undefined) {
    throw new Error("harness: empty block, expected a trailing expression");
  }
  if (last.kind === "expr") {
    return (last as ExprStmt).expr;
  }
  if (last.kind === "let" && (last as LetStmt).init !== null) {
    return (last as LetStmt).init as Expr;
  }
  throw new Error(`harness: unexpected trailing statement kind ${last.kind}`);
}

/** The sole top-level `fn` declaration named `name`. */
function fnDecl(doc: ThetaDocument, name: string): FnDecl {
  const found = doc.body.statements.find(
    (s): s is FnDecl => s.kind === "fn" && (s as FnDecl).name === name,
  );
  if (found === undefined) {
    throw new Error(`harness: no top-level fn ${name} in the parsed body`);
  }
  return found;
}

interface CapturedNote {
  readonly content: string;
  readonly diagnostic: Diagnostic | undefined;
}

function capturingPi(notes: CapturedNote[]): ExtensionAPI {
  return {
    sendMessage: (message: {
      readonly customType?: string;
      readonly content?: string;
      readonly details?: { readonly diagnostics?: readonly Diagnostic[] };
    }): void => {
      if (message.customType === "theta-system-note") {
        notes.push({
          content: String(message.content ?? ""),
          diagnostic: message.details?.diagnostics?.[0],
        });
      }
    },
    sendUserMessage: (): void => {
      throw new Error(
        "a provider turn was issued: every fixture in this file is offline (no params:, no @-query)",
      );
    },
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}

/** Drive one theta body through the REAL shipped slash-dispatch entry. */
async function drive(
  body: string,
  opts?: {
    readonly libs?: Record<string, string>;
    readonly subagentInboundInvokeDepth?: number;
  },
): Promise<{ readonly notes: CapturedNote[]; readonly doc: ThetaDocument }> {
  const app = parseApp(body);
  expect(
    app.frontmatter,
    `harness: fixture failed to parse: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const check = await checkThetaImports(
    { slashName: "app", sourcePath: APP_PATH, frontmatter, body: app.body },
    { fs: fakeThetaLibFs(opts?.libs ?? {}), parseDeps: parseDeps() },
  );
  expect(
    check.diagnostics,
    `harness: the import load pass reported diagnostics: ${JSON.stringify(check.diagnostics)}`,
  ).toEqual([]);
  const notes: CapturedNote[] = [];
  const deps = createProductionProducerDeps({
    pi: capturingPi(notes),
    root: rootDouble(),
    modelRegistry: { getAvailable: (): unknown[] => [] } as unknown as ModelRegistry,
    ...(opts?.subagentInboundInvokeDepth !== undefined
      ? { subagentInboundInvokeDepth: opts.subagentInboundInvokeDepth }
      : {}),
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: APP_PATH,
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(check.imports.length > 0 ? { imports: check.imports } : {}),
  } as ThetaCompositionInput;
  const fixture = composeThetaFixture(theta, deps);
  await fixture.run("", dispatchCtx());
  return { notes, doc: app };
}

/** A dispatch context every fixture drive shares — `sessionManager` is a
 *  stub (no fixture here issues an `@`-query, so `readMessages` never reads
 *  it beyond PIC-53's empty-transcript trailing-turn extraction). */
function dispatchCtx(): ExtensionCommandContext {
  return {
    cwd: "/proj",
    signal: undefined,
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** The one panic note a drive produced, or a loud throw naming the channel. */
function solePanicNote(notes: readonly CapturedNote[]): CapturedNote {
  if (notes.length !== 1) {
    throw new Error(
      `harness: expected exactly ONE theta-system-note, got ${notes.length}: ${JSON.stringify(notes)}`,
    );
  }
  return notes[0] as CapturedNote;
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
) as readonly { readonly code: string; readonly message: string }[];

function registryTemplate(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (message === undefined) {
    throw new Error(`harness: no registry row for ${code}`);
  }
  return message;
}

const ZERO_RANGE = { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };

// ===========================================================================
// (1) top-level index panic — site = the IndexExpr's own range, file = the
//     theta's own file, one `at` line, content = framing + suffix.
// ===========================================================================

describe("bug 0476 witness 1 — a top-level index panic carries its own site", () => {
  const src = ['let cols = ["only-one-column"]', "let _ = cols[1]"].join("\n") + "\n";

  it("diagnostic.file/range = the IndexExpr's own site; hint/content carry one `at` line", async () => {
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);
    const expectedRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.code).toBe("theta/runtime/index-out-of-bounds");
    expect(note.diagnostic?.file).toBe(APP_PATH);
    expect(note.diagnostic?.range).toEqual(expectedRange);
    expect(note.diagnostic?.range).not.toEqual(ZERO_RANGE);
    expect(note.diagnostic?.hint).toBe(`at ${APP_PATH}:${expectedRange.start.line}:${expectedRange.start.column}`);
    expect(note.content).toBe(
      `theta /app aborted: index out of bounds: 1 not in 0..1\n  at ${APP_PATH}:${expectedRange.start.line}:${expectedRange.start.column}`,
    );
  });
});

// ===========================================================================
// (2) the same panic inside a local `fn` — site stays the leaf IndexExpr
//     (same file); the fn-call boundary pushes a `fn` frame at the CALL SITE.
// ===========================================================================

describe("bug 0476 witness 2 — a local `fn` call boundary pushes an `in fn <name> (<call site>)` frame", () => {
  const src = [
    "fn second(cols: array<string>): string {",
    "  cols[1]",
    "}",
    'let rows = ["only-one-column"]',
    "let _ = second(rows)",
  ].join("\n") + "\n";

  it("hint/content carry the leaf site then `in fn second (<call site>)`, same file throughout", async () => {
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);
    const fn = fnDecl(doc, "second");
    const siteRange = lastExprOf(fn.body).range;
    const callRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.file).toBe(APP_PATH);
    expect(note.diagnostic?.range).toEqual(siteRange);
    expect(note.diagnostic?.hint).toBe(
      `at ${APP_PATH}:${siteRange.start.line}:${siteRange.start.column}\n` +
        `in fn second (${APP_PATH}:${callRange.start.line}:${callRange.start.column})`,
    );
    expect(note.content).toBe(
      "theta /app aborted: index out of bounds: 1 not in 0..1\n" +
        `  at ${APP_PATH}:${siteRange.start.line}:${siteRange.start.column}\n` +
        `  in fn second (${APP_PATH}:${callRange.start.line}:${callRange.start.column})`,
    );
  });
});

// ===========================================================================
// (3) inside an imported `.thetalib` fn — the leaf-location rule: `file` =
//     the thetalib path, not the importer; the frame's call site = the
//     importer.
// ===========================================================================

describe("bug 0476 witness 3 — an imported `.thetalib` fn's panic site is the LEAF file, not the importer", () => {
  const libPath = "/proj/lib.thetalib";
  const libSrc = ["fn second(cols: array<string>): string {", "  cols[1]", "}"].join("\n") + "\n";
  const appSrc = [
    'import { second } from "./lib.thetalib"',
    'let rows = ["only-one-column"]',
    "let _ = second(rows)",
  ].join("\n") + "\n";

  it("diagnostic.file = the thetalib path (leaf rule); the fn frame's file = the importer", async () => {
    const { notes, doc } = await drive(appSrc, { libs: { [libPath]: libSrc } });
    const note = solePanicNote(notes);
    const libDoc = parseLib(libPath, libSrc);
    const fn = fnDecl(libDoc, "second");
    const siteRange = lastExprOf(fn.body).range;
    const callRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.file).toBe(libPath);
    expect(note.diagnostic?.range).toEqual(siteRange);
    expect(note.diagnostic?.hint).toBe(
      `at ${libPath}:${siteRange.start.line}:${siteRange.start.column}\n` +
        `in fn second (${APP_PATH}:${callRange.start.line}:${callRange.start.column})`,
    );
  });
});

// ===========================================================================
// (4) member / match panics attach their own node's range. (The index arm's
// site attachment is already proven three ways above; `NullIndexAccessPanic`
// shares the exact same try/catch as `IndexOutOfBoundsPanic` — same code path,
// not re-exercised with a fourth fixture.)
// ===========================================================================

describe("bug 0476 witness 4 — member and match panics attach their own node's range", () => {
  it("(member) `MissingObjectKeyPanic` from `o.definitely_absent` attaches the MemberExpr's own range", async () => {
    const src = [
      "schema F {",
      "  x: integer",
      "}",
      "let o = F { x: 1 }",
      "let _ = o.definitely_absent",
    ].join("\n") + "\n";
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);
    const expectedRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.code).toBe("theta/runtime/missing-object-key");
    expect(note.diagnostic?.range).toEqual(expectedRange);
    expect(note.diagnostic?.range).not.toEqual(ZERO_RANGE);
    expect(note.diagnostic?.hint).toBe(
      `at ${APP_PATH}:${expectedRange.start.line}:${expectedRange.start.column}`,
    );
  });

  it("(match) `MatchError` from a non-exhaustive `match` attaches the MatchExpr's own range", async () => {
    const src = ["let x = 5", 'let _ = match x { 1 => "one" }'].join("\n") + "\n";
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);
    const expectedRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.code).toBe("theta/runtime/match-error");
    expect(note.diagnostic?.range).toEqual(expectedRange);
    expect(note.diagnostic?.range).not.toEqual(ZERO_RANGE);
    expect(note.diagnostic?.hint).toBe(
      `at ${APP_PATH}:${expectedRange.start.line}:${expectedRange.start.column}`,
    );
  });
});

// ===========================================================================
// (5) `theta/runtime/invoke-depth-exceeded` attaches the CALL EXPRESSION as
// its site (the depth cap is breached BEFORE the frame opens, so this is a
// site, not a frame — no `fn` frame is pushed, because no body ever ran).
// ===========================================================================

describe("bug 0476 witness 5 — `invoke-depth-exceeded` attaches the call expression", () => {
  const libPath = "/proj/lib.thetalib";
  const libSrc = ["fn identity(x: integer): integer {", "  x", "}"].join("\n") + "\n";
  const appSrc = [
    'import { identity } from "./lib.thetalib"',
    "let _ = identity(1)",
  ].join("\n") + "\n";

  it("diagnostic.range = the CallExpr's own range, file = the caller's file, hint is ONE line (no fn frame)", async () => {
    const { notes, doc } = await drive(appSrc, {
      libs: { [libPath]: libSrc },
      subagentInboundInvokeDepth: 32,
    });
    const note = solePanicNote(notes);
    const callRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.code).toBe("theta/runtime/invoke-depth-exceeded");
    expect(note.diagnostic?.message).toBe("invoke chain depth exceeded: 33 > 32");
    expect(note.diagnostic?.file).toBe(APP_PATH);
    expect(note.diagnostic?.range).toEqual(callRange);
    expect(note.diagnostic?.range).not.toEqual(ZERO_RANGE);
    expect(note.diagnostic?.hint).toBe(`at ${APP_PATH}:${callRange.start.line}:${callRange.start.column}`);
    expect(note.content).toBe(
      `theta /app aborted: invoke chain depth exceeded: 33 > 32\n  at ${APP_PATH}:${callRange.start.line}:${callRange.start.column}`,
    );
  });
});

// ===========================================================================
// (6) a `par for` lane panic carries the lane frame. Per ERR-20
// (docs/reference/errors-and-results.md §ERR-20), a lane panic is ALWAYS
// downgraded to that element's `Err` inside the SAME catch that would push
// the frame — no shipped route re-surfaces the pushed frame as a top-level
// note. So this witness has two parts: (a) the mechanism itself, asserted
// directly against `pushPanicFrame`/`renderPanicSuffixLines`; (b) a real
// `par for` drive proving the added push does not disturb the ERR-20
// downgrade (no panic escapes to the top-level note).
// ===========================================================================

describe("bug 0476 witness 6 — a `par for` lane panic carries the lane frame", () => {
  afterEach(() => {
    pushPanicFrameHook.calls = [];
  });

  it("(a, mechanism) pushPanicFrame + renderPanicSuffixLines render a `par-for` lane frame", () => {
    const panic = new IndexOutOfBoundsPanic("index out of bounds: 5 not in 0..1");
    const siteRange = { start: { line: 3, column: 3 }, end: { line: 3, column: 9 } };
    const laneRange = { start: { line: 2, column: 10 }, end: { line: 4, column: 2 } };
    attachPanicSite(panic, { file: "app", range: siteRange });
    pushPanicFrame(panic, { kind: "par-for", file: "app", range: laneRange });

    expect(renderPanicSuffixLines(panic)).toEqual([
      `at app:${siteRange.start.line}:${siteRange.start.column}`,
      `in par for lane (app:${laneRange.start.line}:${laneRange.start.column})`,
    ]);
  });

  it("(b, no regression + real push proof) a real lane panic pushes exactly one par-for frame at the ParForExpr's range, and still downgrades per ERR-20 — no top-level note escapes", async () => {
    const src = ["let ns = [1]", "let rs = par for n in ns {", "  ns[5]", "}", "rs"].join("\n") + "\n";
    const { notes, doc } = await drive(src);
    expect(
      notes,
      "ERR-20: a `par for` lane panic is downgraded to its element's Err, not surfaced as a top-level panic note — adding the frame push must not change that",
    ).toEqual([]);

    const rsStmt = doc.body.statements.find(
      (s): s is LetStmtType => s.kind === "let" && (s as LetStmtType).name === "rs",
    );
    if (rsStmt === undefined) {
      throw new Error("harness: no top-level `let rs = par for …` in the parsed body");
    }
    const parForExpr = rsStmt.init as ParForExpr;

    // This is the real witness: `runParForIteration`'s `pushPanicFrame` call
    // (statement-executor.ts) actually ran, once, for this exact lane panic —
    // asserted against the SPY, independent of the ERR-20 downgrade above (a
    // deleted `pushPanicFrame` call would still downgrade correctly and leave
    // `notes` empty, so the `notes` assertion alone cannot catch its removal).
    expect(pushPanicFrameHook.calls).toHaveLength(1);
    expect(pushPanicFrameHook.calls[0]).toMatchObject({
      kind: "par-for",
      range: parForExpr.range,
    });
  });
});

// ===========================================================================
// BLOCKER B (spec/code contradiction, option (a)): a site-less panic carries
// no suffix at all — frames render only UNDER a site
// (errors-and-results/error-model.md §"Panic site suffix (normative)",
// pi-integration-contract/runtime-event-channel.md's per-variant row).
// ===========================================================================

describe("bug 0476 BLOCKER B — a site-less panic renders no suffix, even carrying frames", () => {
  it("renderPanicSuffixLines([]) for a hand-built panic with frames but no site", () => {
    const panic = new IndexOutOfBoundsPanic("index out of bounds: 5 not in 0..1");
    const laneRange = { start: { line: 2, column: 10 }, end: { line: 4, column: 2 } };
    // No `attachPanicSite` call — `panic.site` stays `undefined` throughout.
    pushPanicFrame(panic, { kind: "par-for", file: "app", range: laneRange });

    expect(panic.site).toBeUndefined();
    expect(renderPanicSuffixLines(panic)).toEqual([]);
  });
});

// ===========================================================================
// (7) the message string is byte-identical pre/post: the `<message>` slice of
// `content` equals the registry template rendering (DIAG-4, read not copied).
// ===========================================================================

describe("bug 0476 witness 7 — the panic message stays byte-identical; only the framing grows a suffix", () => {
  it("witness 1's content's `<message>` slice equals the registered template rendering", async () => {
    const src = ['let cols = ["only-one-column"]', "let _ = cols[1]"].join("\n") + "\n";
    const { notes } = await drive(src);
    const note = solePanicNote(notes);
    const expectedMessage = registryTemplate("theta/runtime/index-out-of-bounds")
      .replace("<i>", "1")
      .replace("<length>", "1");

    expect(note.diagnostic?.message).toBe(expectedMessage);
    const firstLine = note.content.split("\n")[0] as string;
    expect(firstLine).toBe(`theta /app aborted: ${expectedMessage}`);
  });
});

// ===========================================================================
// (8) tripwire: a `ThetaPanic` reaching `surfaceDispatchDefect` with NO site
// falls back to the (defensive) zero body range and no `hint` — the fallback
// exists, but witnesses 1/2/3/5 above prove no shipped construction seam ever
// takes it (every one of their diagnostics carries a real, non-zero range).
// ===========================================================================

describe("bug 0476 witness 8 — tripwire: the zero-range fallback is a defect path, never taken by a shipped seam", () => {
  afterEach(() => {
    executorHook.impl = undefined;
  });

  it("a ThetaPanic with no site falls back to the zero body range and omits `hint`", async () => {
    class UnsitedTestPanic extends ThetaPanic {
      readonly code = "theta/runtime/index-out-of-bounds";
      constructor(message: string) {
        super(message);
        this.name = "UnsitedTestPanic";
      }
    }
    executorHook.impl = (): Promise<unknown> =>
      Promise.reject(new UnsitedTestPanic("index out of bounds: 9 not in 0..1"));

    const { notes } = await drive("let _ = 1\n");
    const note = solePanicNote(notes);

    expect(note.diagnostic?.range).toEqual(ZERO_RANGE);
    expect(note.diagnostic?.hint).toBeUndefined();
    expect(note.content).toBe("theta /app aborted: index out of bounds: 9 not in 0..1");
  });
});

// ===========================================================================
// (9) an interpolation panic — the PURE host evaluator's member/index arms
// (BLOCKER A) reached from `renderQueryText` → `stringifyInterpolation`. The
// panic fires while RENDERING the `@`-query text, before any model dispatch,
// so no model/provider turn is needed: `capturingPi.sendUserMessage` throws
// if a turn is ever issued, and this fixture never reaches it.
// ===========================================================================

describe("bug 0476 witness 9 — an interpolation panic is retargeted to the enclosing query's real range, naming the hole", () => {
  it("diagnostic.range = the QueryExpr's OWN range (not the interpolation-local IndexExpr), hint/content name the hole", async () => {
    const src = ['let cols = ["only-one-column"]', "let s = @`value ${cols[1]}`"].join("\n") + "\n";
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);

    // The interpolation source is re-parsed standalone (`parseExpressionSource`,
    // src/parser/theta-document.ts) and yields a range LOCAL to that substring
    // (line 1, column within the `${…}` body) — that is what the pure
    // evaluator's index arm attaches BEFORE retargeting; it must NOT be what
    // the diagnostic ends up carrying (that is exactly the misleading
    // coordinate this follow-up fixes).
    const interpolationExpr = parseExpressionSource("cols[1]");
    if (interpolationExpr === null) {
      throw new Error("harness: interpolation source failed to parse");
    }
    const localRange = interpolationExpr.range;
    // The `let s = @`…`` statement's RHS — the QueryExpr's own real range.
    const queryRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.code).toBe("theta/runtime/index-out-of-bounds");
    expect(note.diagnostic?.file).toBe(APP_PATH);
    expect(note.diagnostic?.range).toEqual(queryRange);
    // The OLD (misleading) local coordinate must not appear anywhere.
    expect(note.diagnostic?.range).not.toEqual(localRange);
    expect(note.diagnostic?.hint).toBe(
      `at ${APP_PATH}:${queryRange.start.line}:${queryRange.start.column}\n` +
        `in interpolation \${cols[1]} (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})`,
    );
    expect(note.content).toBe(
      "theta /app aborted: index out of bounds: 1 not in 0..1\n" +
        `  at ${APP_PATH}:${queryRange.start.line}:${queryRange.start.column}\n` +
        `  in interpolation \${cols[1]} (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})`,
    );
    expect(note.content).not.toContain(`:${localRange.start.line}:${localRange.start.column}`);
  });
});

// ===========================================================================
// (10) the same, inside a local `fn` called from an interpolation — the pure
// fn-call boundary (`evaluatePureFnCall`) pushes an `in fn <name> (…)` frame
// whose file starts PENDING (the caller is the top-level pure host, which
// knows no file) and is completed to APP_PATH by `completePanicSite`,
// alongside the site.
// ===========================================================================

describe("bug 0476 witness 10 — a local `fn` called from an interpolation: the CALL frame is retargeted, the fn body's own site is not", () => {
  const src = [
    "fn second(cols: array<string>): string {",
    "  cols[1]",
    "}",
    'let rows = ["only-one-column"]',
    "let s = @`value ${second(rows)}`",
  ].join("\n") + "\n";

  it("site = the fn body's own IndexExpr (file-relative, UNCHANGED); the `in fn` frame is retargeted to the query's range; an `in interpolation` frame follows it", async () => {
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);
    const fn = fnDecl(doc, "second");
    const siteRange = lastExprOf(fn.body).range;
    const queryRange = lastExprOf(doc.body).range;

    // The CALL is inside the interpolation, re-parsed standalone — ITS range
    // (interpolation-local) is what `evaluatePureFnCall`'s fn-call boundary
    // frame push originally attaches; `retargetInterpolationPanic` then
    // overwrites that outermost frame's range with the query's own range, so
    // this local coordinate must NOT appear in the rendered suffix.
    const interpolationCall = parseExpressionSource("second(rows)");
    if (interpolationCall === null) {
      throw new Error("harness: interpolation call source failed to parse");
    }
    const localCallRange = (interpolationCall as CallExpr).range;

    expect(note.diagnostic?.file).toBe(APP_PATH);
    // The fn body's own site is document AST, already file-relative —
    // retargeting does not touch it.
    expect(note.diagnostic?.range).toEqual(siteRange);
    expect(note.diagnostic?.range).not.toEqual(localCallRange);
    expect(note.diagnostic?.hint).toBe(
      `at ${APP_PATH}:${siteRange.start.line}:${siteRange.start.column}\n` +
        `in fn second (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})\n` +
        `in interpolation \${second(rows)} (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})`,
    );
    expect(note.content).toBe(
      "theta /app aborted: index out of bounds: 1 not in 0..1\n" +
        `  at ${APP_PATH}:${siteRange.start.line}:${siteRange.start.column}\n` +
        `  in fn second (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})\n` +
        `  in interpolation \${second(rows)} (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})`,
    );
    expect(note.content).not.toContain(
      `:${localCallRange.start.line}:${localCallRange.start.column})`,
    );
  });
});

// ===========================================================================
// UNIT — `retargetInterpolationPanic`'s frames-present branch (b), on a
// hand-built panic: the OUTERMOST (last-pushed) frame is retargeted in
// place, a frame beneath it is left untouched, and the new `interpolation`
// frame is appended last.
// ===========================================================================

describe("bug 0476 follow-up unit — retargetInterpolationPanic's frames-present branch (b)", () => {
  it("retargets only the OUTERMOST frame's range/file, leaves an inner frame untouched, and appends the interpolation frame", () => {
    const panic = new IndexOutOfBoundsPanic("index out of bounds: 1 not in 0..1");
    const siteRange = { start: { line: 20, column: 1 }, end: { line: 20, column: 8 } };
    attachPanicSite(panic, { file: "/lib.thetalib", range: siteRange });
    // An INNER frame (e.g. a call inside the callee's own body) — already
    // file-relative, must be left exactly as pushed.
    const innerRange = { start: { line: 21, column: 2 }, end: { line: 21, column: 10 } };
    pushPanicFrame(panic, { kind: "fn", name: "inner", file: "/lib.thetalib", range: innerRange });
    // The OUTERMOST frame — the call written inside the interpolation, still
    // carrying its interpolation-LOCAL range.
    const localOuterRange = { start: { line: 1, column: 3 }, end: { line: 1, column: 16 } };
    pushPanicFrame(panic, { kind: "fn", name: "second", file: undefined, range: localOuterRange });

    const queryRange = { start: { line: 9, column: 12 }, end: { line: 9, column: 30 } };
    retargetInterpolationPanic(panic, { source: "second(rows)", file: "/proj/app.theta", range: queryRange });

    expect(panic.frames).toHaveLength(3);
    // The inner frame is untouched.
    expect(panic.frames[0]).toEqual({
      kind: "fn",
      name: "inner",
      file: "/lib.thetalib",
      range: innerRange,
    });
    // The outermost frame is retargeted: range replaced, file back-filled.
    expect(panic.frames[1]).toEqual({
      kind: "fn",
      name: "second",
      file: "/proj/app.theta",
      range: queryRange,
    });
    expect(panic.frames[1]).not.toEqual(
      expect.objectContaining({ range: localOuterRange }),
    );
    // The interpolation frame is appended last, naming the hole.
    expect(panic.frames[2]).toEqual({
      kind: "interpolation",
      source: "second(rows)",
      file: "/proj/app.theta",
      range: queryRange,
    });
    // The site (inside the callee's own body) is untouched by the retarget —
    // frames.length !== 0 when `retargetInterpolationPanic` ran, so branch (a)
    // never fires.
    expect(panic.site).toEqual({ file: "/lib.thetalib", range: siteRange });
  });
});

// ===========================================================================
// bug 0476 §Related / reviewer MINOR (i) — the bug 0422
// `theta/parse/interpolated-result` panic route (a `Result` interpolation the
// static gate could not resolve, `stringifyInterpolation`'s own
// `raiseInterpolatedResult` raise) goes through the SAME `renderQueryText`
// wrap as every other interpolation panic, so it gains a site/suffix too —
// verified here (cheap to drive offline: the panic fires while composing the
// query TEXT, before any provider turn).
// ===========================================================================

describe("bug 0476 follow-up — the bug 0422 interpolated-result panic is retargeted the same way", () => {
  it("a laundered Result interpolation's panic carries the query's own range and an `in interpolation ${r}` frame", async () => {
    const src = ["fn mk() {", "  Ok(1)", "}", "let r = mk()", "let s = @`x${r}`"].join("\n") + "\n";
    const { notes, doc } = await drive(src);
    const note = solePanicNote(notes);
    const queryRange = lastExprOf(doc.body).range;

    expect(note.diagnostic?.code).toBe(INTERPOLATED_RESULT_CODE);
    expect(note.diagnostic?.file).toBe(APP_PATH);
    expect(note.diagnostic?.range).toEqual(queryRange);
    expect(note.diagnostic?.hint).toBe(
      `at ${APP_PATH}:${queryRange.start.line}:${queryRange.start.column}\n` +
        `in interpolation \${r} (${APP_PATH}:${queryRange.start.line}:${queryRange.start.column})`,
    );
  });
});
