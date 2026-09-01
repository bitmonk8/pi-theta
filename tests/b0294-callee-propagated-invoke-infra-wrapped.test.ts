// Bug 0294 — a callee-returned `Err` whose `kind` is `invoke_infra` passes the
// parent's XMODE-1 wrap UNWRAPPED, so a grandchild's infra failure the callee
// `?`-propagated reaches the grandparent as the callee's OWN infra failure
// (`docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md`).
//
// WHAT IS ASSERTED. The wrap rule is provenance-shaped, not kind-shaped:
// `invocation.md:75` — "`InvokeCalleeError` wraps an `Err` the callee itself
// returned; `inner: QueryError` is the callee's original failure" — names no
// kind exemption, and the wrap's own invariant
// (`src/runtime/effectful-statement-host.ts`) is "each invoke hop adds exactly
// one wrapper (the SLSH-5 chain)". A callee whose body ran
// `invoke("./missing.theta")?` RETURNED that `Err`; when the parent invokes
// THAT callee, the callee's returned `invoke_infra` must be wrapped in an
// `invoke_callee` hop so SLSH-5 (`slash-invocation.md:54`) appends
// ` from <callee_path> invoked at <parent_path>:<line>`. These cells drive the
// SHIPPED composition root over planted `.pi/theta/` workspaces and read the
// SLSH-3 note the invoke boundary mints, per the SETTLED design
// (`.pi/tmp/fixes/0294-design.md`, mechanism (a): provenance discrimination):
//   (A) TWO-HOP /infratop → infraleaf → ./missing.theta — the note carries the
//       leaf SNK-i row PLUS one hop suffix naming infraleaf as the callee and
//       infratop:4 as the call site. RED at this HEAD: the fork renders the leaf
//       row bare with the GRANDCHILD path and NO suffix.
//   (B) KIND-DISCRIMINATION as a relation — the two-hop note must be
//       DISTINGUISHABLE from the one-hop note; the fork renders them
//       byte-identical modulo the theta name.
//   (C) TRAMPOLINE-MINTED PANIC FENCE (control, GREEN both sides) — a panic the
//       trampoline minted for THIS hop stays bare (error-model.md per-cause
//       table, Panic row): no wrapper, no suffix.
//   (D) ONE-HOP CONTROL (GREEN both sides) — /infraleaf → ./missing.theta: the
//       failure IS this hop's, boundary-minted, so its note stays bare.
//   (E) THREE-HOP /infratopper → infratop → infraleaf → ./missing.theta — the
//       note carries the leaf row plus TWO hop suffixes, leaf-first (innermost
//       hop first, outermost last), witnessing "each invoke hop adds exactly one
//       wrapper". RED at fork: bare, no suffix.
//
// WHY (B) IS WITNESSED STRUCTURALLY, NOT WITH A THETA `match`. The report's
// author-visible defect is that a parent `match`ing
// `Err(InvokeCalleeError { inner, .. })` — the documented "my callee failed"
// arm — misses because the propagated case surfaces as a bare `invoke_infra`.
// Reading `inner` / `kind` off an `Err` value inside a theta body offline is not
// something this suite can drive without fabricating language surface the theta
// runtime does not evaluate here, so (B) witnesses the WRAPPED VARIANT
// structurally through the SLSH-5 suffix the wrapper's ledger hop produces: the
// presence of ` invoked at ` in a top-level note IS the witness that a real
// `invoke_callee` wrapper crossed the boundary (the renderer reaches the hop
// suffix only from a recorded `invoke_callee` hop —
// `src/runtime/err-note-render.ts`, `src/runtime/invoke-provenance-ledger.ts`),
// and its absence on the one-hop control IS the witness that a boundary-minted
// `invoke_infra` was NOT wrapped. The two directions are the fix's two provenance
// arms.
//
// WHY THIS TIER — end-to-end through the shipped composition root is the only
// place the merged-provenance seam manifests. `runInvokeEffect`
// (`src/runtime/effectful-statement-host.ts`) receives one merged `ResultValue`
// from `child.drive()` carrying BOTH the trampoline's own boundary errors and
// the callee's returned `Err`s, and the discrimination the fix threads
// (`DrivenInvokeResult.source`) is populated by the production
// `#driveCallee` / `#buildInvokeChild` closures
// (`src/extension/production-theta-producer.ts`) the composition root wires —
// a seam-level `runInvokeEffect` call cannot witness which provenance the
// production wiring feeds it. The subagent leg of the same seam (INV-5) and the
// cancelled-exemption fence are witnessed offline at their own seams in the
// sibling `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`.
//
// PROVIDER-FREE. No callee runs an `@`-query, so no provider turn is issued;
// `pi.sendUserMessage` THROWS in this harness, so a turn slipping in fails
// loudly rather than reaching for credentials.
//
// NO TEST REDS ON A COMPILE ERROR, A MISSING FIXTURE, OR A HARNESS THROW. Every
// top-level dispatch is composed through the real root and `errNote` fails
// loudly (naming the whole channel) if a dispatch produced anything other than
// exactly one top-level `Err` note — so a missing note can never read as a
// missing suffix.
//
// Spec: `docs/spec_topics/invocation.md:75` (the wrap rule), `:36` (INV-5 wrap
// parity across legs); `docs/spec_topics/slash-invocation.md` SLSH-5 (the
// per-hop chain suffix); `docs/spec_topics/errors-and-results/error-model.md:33`
// (the per-cause table's Panic row — the trampoline-minted case that stays bare);
// `docs/spec_topics/errors-and-results/queryerror-variants.md` §Invoke variants
// (`InvokeCalleeError.inner` is recursive over the whole union). The SLSH-3 note
// is rendered by `renderLeafKindNote`'s `invoke_infra` arm
// (`err-note-render.ts`) and the SLSH-5 suffix by `renderTopLevelErrNote`.

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

/** A prompt-mode theta whose sole body statement invokes `./<stem>.theta` and
 *  `?`-propagates the callee's top-level `Result`. The `invoke(` token sits on
 *  line 4 — SLSH-5's `<line>` is the call-site token's line, never a receiving
 *  binding's. */
function invoker(calleeStem: string): string {
  return ["---", "mode: prompt", "---", `invoke("./${calleeStem}.theta")?`].join("\n") + "\n";
}

/** The 1-indexed line the `invoke(` token occupies in every `invoker(...)` body. */
const INVOKE_TOKEN_LINE = 4;

/** A prompt-mode callee that panics with an index-out-of-bounds read on a
 *  1-element array. The panic unwinds as a thrown `ThetaPanic` through the invoke
 *  boundary, which the trampoline catches and MINTS as
 *  `InvokeInfraError{cause:"panic"}` for THIS hop — the boundary-minted case
 *  (error-model.md per-cause table, Panic row) that must stay bare. */
const PANIC_CHILD = ["---", "mode: prompt", "---", "let a = [1]", "a[5]"].join("\n") + "\n";

/** One SLSH-5 hop suffix, verbatim per `slash-invocation.md:54`
 *  (`renderTopLevelErrNote`, `err-note-render.ts`). `calleePath` / `parentPath`
 *  are post-`realpath` absolute. */
function hopSuffix(calleePath: string, parentPath: string, line: number): string {
  return ` from ${calleePath} invoked at ${parentPath}:${line}`;
}

/** The SNK-i leaf row for a boundary-minted `invoke_infra` over `calleePath`
 *  with `cause` (`renderLeafKindNote`'s `invoke_infra` arm, `err-note-render.ts`). */
function snkiRow(thetaName: string, calleePath: string, cause: string): string {
  return `theta /${thetaName} returned Err: invoke of ${calleePath} failed (${cause})`;
}

/** Every top-level stem dispatched. `panicchild` / the missing `./missing.theta`
 *  are callees (or absent), never dispatched. */
const TOP_LEVEL_STEMS = ["infraleaf", "infratop", "infratopper", "panictop"] as const;

interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
}

let workspaceDir: string;
let thetaDir: string;
/** Every note the load pass and the dispatches emitted, in emission order. The
 *  fixtures share one host `pi`, so each row names its own theta
 *  (`theta /<name> …`), which keeps a read attributable to its dispatch. */
const notes: RecordedMessage[] = [];

/** The host `pi`: `sendMessage` is the `theta-system-note` channel (this file's
 *  observable); `sendUserMessage` is the provider-turn surface and must never be
 *  reached — a throw there is a loud offline-violation, never a silent skip. */
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
        "a provider turn was issued: no callee runs an `@`-query, so this witness must stay " +
          "fully offline",
      );
    },
    sendMessage: (message: RecordedMessage): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
}

function loadCtx(cwd: string): ExtensionContext {
  return {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
}

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

/** The single top-level `Err` note one dispatch produced. Zero — or more than
 *  one — fails loudly naming the whole channel, so a compile/fixture/harness
 *  fault can never masquerade as a missing suffix. */
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

/** The note remainder after its own `theta /<name>` prefix — the byte range the
 *  report calls "byte-identical" across a one-hop and a two-hop failure. */
function remainderAfterName(slashName: string): string {
  return errNote(slashName).slice(`theta /${slashName}`.length);
}

beforeAll(async () => {
  // `realpathSync` the workspace root: the OS temp dir is a symlink on some
  // hosts, and the production containment re-check / hop-provenance ledger route
  // through the `FileSystem.realpath` seam — planting under the already-canonical
  // root keeps the recorded hop paths agreeing with these expectations.
  workspaceDir = realpathSync(mkdtempSync(join(tmpdir(), "theta-bug0294-")));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });

  // The leaf invoker: its callee `./missing.theta` is deliberately NOT planted,
  // so infraleaf's own invoke fails boundary-minted `load_failure` (the one-hop
  // control (D)) and — propagated by `?` — is the grandchild the two-hop (A) /
  // three-hop (E) cascades misattribute at HEAD.
  writeFileSync(join(thetaDir, "infraleaf.theta"), invoker("missing"), "utf8");
  // Two hops: /infratop → infraleaf.
  writeFileSync(join(thetaDir, "infratop.theta"), invoker("infraleaf"), "utf8");
  // Three hops: /infratopper → infratop → infraleaf.
  writeFileSync(join(thetaDir, "infratopper.theta"), invoker("infratop"), "utf8");
  // The panic fence (C): panictop invokes a callee that panics; the trampoline
  // mints the `invoke_infra{cause:"panic"}` for THIS hop, boundary-minted.
  writeFileSync(join(thetaDir, "panicchild.theta"), PANIC_CHILD, "utf8");
  writeFileSync(join(thetaDir, "panictop.theta"), invoker("panicchild"), "utf8");
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    hostPi(),
    loadCtx(workspaceDir),
  );

  for (const stem of TOP_LEVEL_STEMS) {
    const fixture = fixtures.find((f) => f.slashName === stem);
    if (fixture === undefined) {
      throw new Error(
        `harness precondition unmet: /${stem} did not register through the production ` +
          `composition root — registered: ${JSON.stringify(fixtures.map((f) => f.slashName))}`,
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

describe("bug 0294 — a callee-propagated invoke_infra Err is wrapped with an invoke_callee hop", () => {
  it("(A) TWO-HOP: /infratop's note wraps infraleaf's propagated failure in one SLSH-5 hop — ", () => {
    // The failure infraleaf `?`-propagated (its missing-callee `load_failure`)
    // is an `Err` infraleaf RETURNED, so infratop's invoke of infraleaf MUST
    // wrap it: the leaf SNK-i row (still naming the grandchild `./missing.theta`
    // as the boundary-minted leaf) plus one hop suffix naming infraleaf as the
    // callee and infratop:4 as the call site (invocation.md:75 + SLSH-5).
    // RED at this HEAD: the `invoke_infra` kind-exemption passes the propagated
    // Err bare — no wrapper, no ledger hop, no suffix — so the note is the leaf
    // row alone, attributing a two-hop-away file to infratop's own invoke.
    const infraleafAbs = join(thetaDir, "infraleaf.theta");
    const infratopAbs = join(thetaDir, "infratop.theta");
    expect(errNote("infratop")).toBe(
      snkiRow("infratop", "./missing.theta", "load_failure") +
        hopSuffix(infraleafAbs, infratopAbs, INVOKE_TOKEN_LINE),
    );
  });

  it("(B) KIND-DISCRIMINATION: the two-hop note is distinguishable from the one-hop note by its wrapper — ", () => {
    // The report's headline symptom as a relation: at HEAD the two-hop and the
    // one-hop notes are byte-identical modulo the theta name, so nothing in the
    // surfaced value tells the operator (or a parent `match`) which theta's
    // invoke failed. Post-fix infratop carries the `invoke_callee` wrapper's hop
    // suffix while the boundary-minted one-hop leaf does not.
    expect(
      remainderAfterName("infratop"),
      "a two-hop cascade must be distinguishable from the one-hop failure it propagated; at " +
        "HEAD the note remainders are byte-identical",
    ).not.toBe(remainderAfterName("infraleaf"));
    // The wrapped variant witnessed structurally: ` invoked at ` is present only
    // when a real `invoke_callee` wrapper recorded a ledger hop.
    expect(
      errNote("infratop"),
      "infratop's invoke of infraleaf wrapped a callee-returned Err, so the note must carry " +
        "the SLSH-5 hop attribution",
    ).toContain(" invoked at ");
    // The leaf CAUSE is unchanged — the wrap ADDS a hop, it does not reclassify
    // the leaf; the inner variant stays the propagated `invoke_infra`.
    expect(errNote("infratop")).toContain("invoke of ./missing.theta failed (load_failure)");
  });

  it("(C) CONTROL: a trampoline-minted panic stays bare — no wrapper, no suffix — ", () => {
    // GREEN now and after the fix. panicchild's panic is not an `Err` the callee
    // RETURNED; the trampoline MINTED the `invoke_infra{cause:"panic"}` for THIS
    // hop (error-model.md per-cause table, Panic row), so it is boundary-minted
    // and stays bare — the provenance arm the fix must preserve byte-for-byte.
    expect(errNote("panictop")).toBe(snkiRow("panictop", "./panicchild.theta", "panic"));
    expect(errNote("panictop"), "a boundary-minted infra error carries no SLSH-5 hop").not.toContain(
      " invoked at ",
    );
  });

  it("(D) CONTROL: a one-hop boundary-minted load_failure stays bare — ", () => {
    // GREEN now and after the fix. infraleaf's own invoke of the missing callee
    // failed THIS hop's infrastructure (boundary-minted `load_failure`), so its
    // note is the bare leaf row with no hop suffix — the failure IS infraleaf's.
    expect(errNote("infraleaf")).toBe(snkiRow("infraleaf", "./missing.theta", "load_failure"));
    expect(
      errNote("infraleaf"),
      "the failure is this hop's own, so SLSH-5 emits no hop",
    ).not.toContain(" invoked at ");
  });

  it("(E) THREE-HOP: /infratopper's note carries both hops leaf-first, outermost last — ", () => {
    // Each invoke hop adds EXACTLY one wrapper. The leaf is still the
    // boundary-minted `load_failure` over `./missing.theta`; two `invoke_callee`
    // wrappers ride above it (infratop→infraleaf, then infratopper→infratop),
    // and SLSH-5 renders the hops leaf-first: the innermost (infraleaf from
    // infratop) first, the outermost (infratop from infratopper) last.
    // RED at this HEAD: the fork passes every propagated `invoke_infra` bare, so
    // the note is the leaf row alone — no hop, from a file three invokes away.
    const infraleafAbs = join(thetaDir, "infraleaf.theta");
    const infratopAbs = join(thetaDir, "infratop.theta");
    const infratopperAbs = join(thetaDir, "infratopper.theta");
    expect(errNote("infratopper")).toBe(
      snkiRow("infratopper", "./missing.theta", "load_failure") +
        hopSuffix(infraleafAbs, infratopAbs, INVOKE_TOKEN_LINE) +
        hopSuffix(infratopAbs, infratopperAbs, INVOKE_TOKEN_LINE),
    );
  });
});
