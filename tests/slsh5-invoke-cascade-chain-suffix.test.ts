// Bug 0088 — the SLSH-5 chain-attribution suffix is never emitted at the
// slash-dispatch boundary: a failure that cascaded out of an `invoke`d child
// renders byte-identically to the same failure raised in the entry theta
// (`docs/bugs/0088-slsh5-chain-suffix-never-emitted.md`).
//
// WHAT IS ASSERTED. `docs/spec_topics/slash-invocation.md:54` (SLSH-5) makes the
// suffix a MUST on the per-`kind` row: for each `invoke_callee` hop the boundary
// renderer appends ` from <callee_path> invoked at <parent_path>:<line>`,
// leaf-first (innermost hop first), each hop separated from the next by a single
// space. `<callee_path>` / `<parent_path>` are the post-`realpath` absolute
// paths recorded at the invocation site; `<line>` is the 1-indexed line of the
// `invoke(` token. The cells assert those SPEC strings byte-for-byte. The red
// direction is the fix's own wiring: reverting the invoke-hop provenance ledger
// (`createInvocationProvenanceLedger`, `src/runtime/invoke-provenance-ledger.ts`)
// out of either its recording site or its reading site leaves the boundary
// rendering the suffix-free leaf row, and each hop cell reds on that string.
//
// WHY THIS TIER — an offline in-process end-to-end drive of the REAL production
// path, not a renderer-seam call. The renderer `renderTopLevelErrNote`
// (`src/runtime/err-note-render.ts`) is already conformant and is pinned green by
// hand-built `ChainHop[]` inputs in `tests/err-note-render.test.ts` and
// `tests/e2e-s5-slsh-chain-suffix.test.ts`; another seam-level cell cannot
// witness this defect at all, because what is at stake is what the production
// call sites pass. `emitTopLevelErrNote`
// (`src/extension/production-theta-producer.ts`) builds `chain` from the
// producer instance's ledger, and is reached from the SLSH-3 branch of the
// `run` closure `composeThetaFixture` returns
// (`src/extension/theta-composition-producer.ts`); the record producer
// `recordInvocationProvenance` (`src/runtime/invoke-provenance.ts`) reaches that
// ledger only through an executed `invoke` hop. So these cells drive the SHIPPED
// composition root
// (`discoverAndComposeFixtures`) over a real planted `.pi/theta/` workspace and
// dispatch the composed fixtures, executing real `invoke` hops through
// `#driveCallee`'s prompt→prompt attach cell, and read the note off the
// `theta-system-note` channel `pi.sendMessage` carries.
//
// PROVIDER-FREE. The leaf failure is `Err(ValidationError { cause:
// "empty_template" })`, which QRY-6/QRY-8 short-circuits with `attempts: 0`
// before a turn is issued (`renderEmptyShortCircuit`,
// `src/render/query-render.ts`, consulted by the `resolveQuery` host dep
// `bindPromptConversation` builds in
// `src/extension/production-theta-producer.ts`), so the whole cascade runs with
// zero provider turns. `pi.sendUserMessage`
// throws in this harness, so a turn slipping in fails loudly rather than
// silently reaching for credentials.
//
// WHY A CASCADE IS WHAT IS MEASURED. The rendered row is the LEAF's (SNK-b),
// which `renderTopLevelErrNote` reaches only after `isInvokeCalleeError`
// (`src/runtime/err-note-render.ts`) unwraps the wrapper `runInvokeEffect` built
// (`invoke of ${child.calleePath} callee returned Err(...)`,
// `src/runtime/effectful-statement-host.ts`). An unwrapped error would have
// taken the SNK-k catch-all row instead, so an SNK-b row on a hop cell IS the
// witness that a real `invoke_callee` wrapper crossed the boundary — the suffix
// is the only thing missing from it.
//
// THE PATHS ARE ASSERTED POST-`realpath` ABSOLUTE, per SLSH-5 and the report's
// §Expected behaviour. `<parent_path>` is what `recordInvocationProvenance`
// normalises through the `FileSystem.realpath` seam. `<callee_path>` is NOT the
// wrapper's own `callee_path` field, which is the author's relative literal
// (`InvokeChild.calleePath` is built from `InvokeExpr.path`, and the wrapper is
// constructed from it in `runInvokeEffect`): the recorded hop normalises the
// resolved callee path through that same seam, and these cells assert the
// normalised form.
//
// THE NO-HOP CONTROL is the fence: an error raised in the entry theta cascaded
// out of no child, so its note stays suffix-free, and a chain fabricated for a
// non-cascaded error reds it.
//
// SNK-k IS NOT REACHABLE HERE. The catch-all row needs a `kind` outside the
// theta 1.0 `QueryError` union, which no executed theta can produce, so `:50`'s
// extension of the suffix to the catch-all stays with the renderer's own unit
// coverage.
//
// Spec: `docs/spec_topics/slash-invocation.md:31` (SLSH-3 — for a subagent-mode
// callee this note is the only user-facing surface for the failure), `:33`
// (SLSH-4, the normative templates), `:50`, `:54` (SLSH-5 and its worked
// examples).

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

/** The em-dash U+2014 the SLSH-4 templates carry verbatim. */
const DASH = "\u2014";

/** The SNK-b leaf row (the `empty_template` arm of `renderLeafKindNote`). */
function snkbRow(thetaName: string): string {
  return `theta /${thetaName} returned Err: rendered query template was empty ${DASH} no provider turn was issued`;
}

/** One SLSH-5 hop suffix, verbatim per `slash-invocation.md:54`. */
function hopSuffix(calleePath: string, parentPath: string, line: number): string {
  return ` from ${calleePath} invoked at ${parentPath}:${line}`;
}

// Bug 0391 — SLSH-5's `<callee_path>`/`<parent_path>` are the realpath-THEN-
// forward-slash containment form (`invocation.md:12`), not host-native: wrap the
// `join`-built native expectations here so these cells assert that spec form
// (byte-identical no-op on POSIX; drops the native compensation on Windows).
const fwd = (p: string): string => p.replace(/\\/g, "/");

/**
 * The leaf theta whose `@`-query renders empty: the short-circuit yields
 * `Err(ValidationError { cause: "empty_template", attempts: 0 })` with no
 * provider turn, which is what keeps this file offline.
 */
const LEAF_BODY = ["---", "mode: prompt", "---", 'let s = ""', "@`${s}`?"].join("\n") + "\n";

/**
 * A one-hop invoker. The `invoke(` token sits on line 4, which is the `<line>`
 * SLSH-5 records — the call-site token's line, never a receiving binding's.
 */
function invoker(calleeStem: string): string {
  return ["---", "mode: prompt", "---", `invoke("./${calleeStem}.theta")?`].join("\n") + "\n";
}

/** The 1-indexed line the `invoke(` token occupies in every `invoker(...)` body. */
const INVOKE_TOKEN_LINE = 4;

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  // The leaf failure, and its byte copy registered under its own name as the
  // no-hop control.
  { stem: "chainchild", text: LEAF_BODY },
  { stem: "chaindirect", text: LEAF_BODY },
  // One hop: /chainparent → chainchild.
  { stem: "chainparent", text: invoker("chainchild") },
  // Two hops: /chaintop → chainparent → chainchild.
  { stem: "chaintop", text: invoker("chainparent") },
];

/** One recorded `pi.sendMessage` payload. */
interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
}

let workspaceDir: string;
let thetaDir: string;
/**
 * Every `theta-system-note` the load pass and the four dispatches produced, in
 * emission order. The fixtures are composed against one host `pi`, so the
 * channel is shared; each row names its own theta (`theta /<name> …`), which is
 * what keeps a cell's read attributable to its own dispatch.
 */
const notes: RecordedMessage[] = [];

/**
 * The host `pi` surface the composition root and the prompt-mode bind touch.
 * `sendMessage` is the `theta-system-note` channel — the observable of this
 * file. `sendUserMessage` is the provider-turn surface and must never be
 * reached.
 */
function hostPi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    registerMessageRenderer: (): void => {},
    sendUserMessage: (): void => {
      throw new Error(
        "a provider turn was issued: the leaf `@`-query must short-circuit on its empty " +
          "rendered template, which is what keeps this witness offline",
      );
    },
    sendMessage: (message: RecordedMessage): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
}

/** The load-pass host context: a model-less registry, no UI toasts. */
function loadCtx(cwd: string): ExtensionContext {
  return {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
}

/**
 * The dispatch ctx: `signal: undefined` is the documented idle entry, and the
 * session manager is read only when a query issues a turn — none does here.
 */
function dispatchCtx(cwd: string): ExtensionCommandContext {
  return {
    cwd,
    signal: undefined,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    waitForIdle: (): Promise<void> => Promise.resolve(),
    isIdle: (): boolean => true,
    abort: (): void => {},
  } as unknown as ExtensionCommandContext;
}

/** Every `theta-system-note` content, in emission order. */
function noteContents(): readonly string[] {
  return notes
    .filter((note) => note.customType === "theta-system-note")
    .map((note) => String(note.content));
}

/**
 * The single top-level `Err` note one dispatch produced. A dispatch that emitted
 * none — or more than one — fails loudly naming what the channel carried: these
 * cells assert the CONTENT of that one note, so a missing note must never read
 * as an absent suffix.
 */
function errNote(slashName: string): string {
  const rows = noteContents().filter((content) =>
    content.startsWith(`theta /${slashName} returned Err:`),
  );
  if (rows.length !== 1) {
    throw new Error(
      `harness precondition unmet: /${slashName} produced ${String(rows.length)} top-level ` +
        `Err notes, expected exactly 1 — channel: ${JSON.stringify(noteContents())}`,
    );
  }
  return rows[0] as string;
}

beforeAll(async () => {
  // `realpathSync` on the workspace root so the planted paths are already in the
  // post-`realpath` form SLSH-5 pins (the OS temp dir is a symlink on some
  // hosts, and a fix routing through the `FileSystem.realpath` seam would
  // otherwise disagree with these expectations for an unrelated reason).
  workspaceDir = realpathSync(mkdtempSync(join(tmpdir(), "theta-bug0088-")));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(thetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  // A present, minimal settings file pins the fixture's settings read.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    hostPi(),
    loadCtx(workspaceDir),
  );

  for (const planted of THETAS) {
    const fixture = fixtures.find((f) => f.slashName === planted.stem);
    if (fixture === undefined) {
      throw new Error(
        `harness precondition unmet: /${planted.stem} did not register through the ` +
          "production composition root, so no dispatch reaches the slash boundary. " +
          `Registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
      );
    }
    await fixture.run("", dispatchCtx(workspaceDir));
  }
}, 60_000);

afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

describe("bug 0088 — the SLSH-5 chain suffix on a cascaded top-level Err note", () => {
  it("a one-hop invoke cascade appends the hop's ` from <callee> invoked at <parent>:<line>` suffix — ", () => {
    const child = join(thetaDir, "chainchild.theta");
    const parent = join(thetaDir, "chainparent.theta");
    const note = errNote("chainparent");

    // The SNK-b leaf row is the witness that a real `invoke_callee` wrapper
    // crossed the boundary: the renderer only reaches that row by unwrapping one.
    expect(
      note.startsWith(snkbRow("chainparent")),
      "the /chainparent note is not the SNK-b leaf row, so the cascade did not reach the " +
        `slash boundary as an invoke_callee wrapper: ${JSON.stringify(note)}`,
    ).toBe(true);

    // Both placeholders are post-`realpath` absolute: `<callee_path>` is the
    // invoked child, `<parent_path>:<line>` the call site that carried it.
    expect(
      note,
      "SLSH-5 (slash-invocation.md:54) makes the chain suffix a MUST on the per-kind row " +
        "whenever the failure cascaded out of an invoked child; without it the operator is " +
        "told the failure belongs to the entry theta, with nothing saying another file ran",
    ).toBe(snkbRow("chainparent") + hopSuffix(fwd(child), fwd(parent), INVOKE_TOKEN_LINE));
  });

  it("a two-hop invoke cascade appends both hops leaf-first, single-space separated, outermost last — ", () => {
    const child = join(thetaDir, "chainchild.theta");
    const parent = join(thetaDir, "chainparent.theta");
    const top = join(thetaDir, "chaintop.theta");
    const note = errNote("chaintop");

    expect(
      note.startsWith(snkbRow("chaintop")),
      "the /chaintop note is not the SNK-b leaf row, so the two-hop cascade did not reach " +
        `the slash boundary as nested invoke_callee wrappers: ${JSON.stringify(note)}`,
    ).toBe(true);

    // SLSH-5's multi-hop worked example: innermost hop first, each hop separated
    // from the next by a single space (each suffix's own leading space),
    // outermost hop last.
    expect(
      note,
      "SLSH-5 (slash-invocation.md:54) orders the hops leaf-first; a failure two files deep " +
        "must name the file it was raised in and the call site of every hop that carried it",
    ).toBe(
      snkbRow("chaintop") +
        hopSuffix(fwd(child), fwd(parent), INVOKE_TOKEN_LINE) +
        hopSuffix(fwd(parent), fwd(top), INVOKE_TOKEN_LINE),
    );
  });

  it("CONTROL: a non-cascaded error keeps an EMPTY chain, so its note carries no suffix — ", () => {
    // The fence (§Fix: `chain` stays empty for a non-cascaded error). A chain
    // fabricated for an entry-theta failure reds here.
    const note = errNote("chaindirect");

    expect(note).toBe(snkbRow("chaindirect"));
    expect(
      note,
      "an error raised in the entry theta cascaded out of no child, so SLSH-5 emits no hop",
    ).not.toContain("invoked at");
  });

  it("the cascaded notes must EXTEND the leaf row the no-hop control renders, not equal it — ", () => {
    // The report's headline symptom stated as a relation: the defect renders all
    // three notes as the same row modulo the theta name. Each cascaded note is
    // strictly longer than its own leaf row, and this cell cannot be satisfied by
    // a renderer that drops the leaf row instead of extending it.
    for (const name of ["chainparent", "chaintop"]) {
      const note = errNote(name);
      const leafRow = snkbRow(name);
      expect(
        note.startsWith(leafRow),
        `the /${name} note no longer opens with the SNK-b leaf row: ${JSON.stringify(note)}`,
      ).toBe(true);
      expect(
        note.length,
        `the /${name} note is exactly its own leaf row, so the cascade added no attribution ` +
          `at all: ${JSON.stringify(note)}`,
      ).toBeGreaterThan(leafRow.length);
    }
  });
});
