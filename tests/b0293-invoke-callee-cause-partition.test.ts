// Bug 0293 — the `InvokeInfraError` load/parse cause partition for `invoke(...)`
// callee intake is shifted by one across the whole input space
// (`docs/bugs/0293-invoke-callee-load-parse-causes-shifted.md`).
//
// WHAT IS ASSERTED. `queryerror-variants.md:182-183` gives callee intake a
// three-way partition: `load_failure` ("callee file unreadable"),
// `parse_failure` ("callee file failed to parse"), and — disjointly —
// `internal_error`, which `error-model.md:26` / §Runtime-panics reserves for the
// runtime-defect surface ("an unexpected interpreter exception", "no theta
// expression 'causes' one"). `invocation.md` §Resolution routes a typo'd invoke
// path as an authoring mistake, not a runtime defect. Before bug 0293's fix,
// every input landed one arm to the right; these cells drive the SHIPPED
// composition root over three planted callees and read the SLSH-3 note the
// invoke boundary mints, pinning the corrected partition:
//   (A) a MISSING callee must render cause `load_failure` (rendered
//       `internal_error` pre-fix — the containment re-check's `fs.realpath`
//       threw ENOENT ahead of the load arm, `#driveCallee`'s containment-re-check
//       call (`production-theta-producer.ts`) before its `parseCallee` call, and
//       the boundary catch defaulted a non-panic throw to `internal_error`
//       (`invoke-cancellation.ts`'s non-panic default));
//   (B) an EXISTING-but-unparseable callee must render `parse_failure` (rendered
//       `load_failure` pre-fix — `parseCalleeTheta` collapsed unreadable and
//       unparseable into one `undefined`, which `#driveCallee` mapped to the
//       single `load_failure` arm, `production-theta-producer.ts`);
//   (C) a CONTROL callee that takes none of the load/parse/internal arms;
//   (G) folds (A) and (B) together: their rendered causes must DIFFER and each
//       equal its own class, so a `match(cause)` author takes the right arm per
//       input.
//
// WHY THIS TIER — end-to-end through the shipped composition root is the ONLY
// place the missing-callee mechanism manifests. `#recheckCalleeContainment`
// (`production-theta-producer.ts`) skips its runtime re-check entirely when
// `input.fileSystem` / `input.activeRoots` are absent (its own early-return
// guard), which is the
// unit-harness condition that keeps the committed `load_failure` pins
// (`tests/production-core-exec.test.ts`) green — they never reach the throwing
// re-check. The re-check runs only when the production `fileSystem` / `activeRoots`
// seams are wired, i.e. through `discoverAndComposeFixtures`. A seam-level cell
// cannot witness the shift because the shift is in what the production wiring
// feeds the re-check. The FakeFileSystem containment fences live in the sibling
// `tests/b0293-invoke-callee-containment-fences.test.ts`.
//
// PROVIDER-FREE. Neither callee runs an `@`-query, so no provider turn is issued;
// `pi.sendUserMessage` THROWS in this harness, so a turn slipping in fails loudly
// rather than reaching for credentials.
//
// NO TEST REDS ON A COMPILE ERROR, A MISSING FIXTURE, OR A HARNESS THROW. Every
// top-level dispatch is composed through the real root and `errNote` fails loudly
// (naming the whole channel) if a dispatch produced anything other than exactly
// one top-level `Err` note — so a missing note can never read as the wrong cause.
//
// Spec: `docs/spec_topics/errors-and-results/queryerror-variants.md:182-183`
// (the `load_failure` / `parse_failure` glosses), `error-model.md:26` (a callee
// that fails to load observes `InvokeInfraError{cause:"load_failure"}`) and
// §Runtime-panics (`internal_error` is the runtime-defect surface),
// `docs/spec_topics/invocation.md` §Resolution / §Failures. The SLSH-3 note is
// rendered by `renderLeafKindNote`'s `invoke_infra` arm (`err-note-render.ts`)
// (`${prefix} returned Err: invoke of ${callee_path} failed (${cause})`).

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

/** A prompt-mode theta whose sole body statement invokes `./<stem>.theta`. The
 *  `?` propagates the callee's top-level `Result`; a load/parse/internal failure
 *  surfaces as the SLSH-3 note this file reads. */
function invoker(calleeStem: string): string {
  return ["---", "mode: prompt", "---", `invoke("./${calleeStem}.theta")?`].join("\n") + "\n";
}

/** A prompt-mode callee whose pure body value is `42` — readable and parseable,
 *  so its invoke takes NONE of the load / parse / internal_error arms. */
const OK_CALLEE = ["---", "mode: prompt", "---", "42"].join("\n") + "\n";

/** An existing but garbled callee: no frontmatter fence, unparseable as a theta.
 *  Its file is READABLE (so the `load_failure`="unreadable" class does not apply)
 *  but fails to PARSE (the `parse_failure` class). */
const GARBLED_CALLEE = "}}}} not a theta {{{{\n";

/** Planted top-level thetas (the callees `garbled` / `okcallee` are read by
 *  `parseCallee`, not dispatched; `missing` is deliberately NOT planted). */
const TOP_LEVEL_STEMS = ["infraleaf", "parsetop", "oktop"] as const;

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
        "a provider turn was issued: neither callee runs an `@`-query, so this witness must " +
          "stay fully offline",
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
 *  fault can never masquerade as the wrong cause. */
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

/** Count of top-level `Err` notes a dispatch produced (0 for the CONTROL). */
function errNoteCount(slashName: string): number {
  return noteContents().filter((content) =>
    content.startsWith(`theta /${slashName} returned Err:`),
  ).length;
}

beforeAll(async () => {
  // `realpathSync` the workspace root: the OS temp dir is a symlink on some
  // hosts, and the production containment re-check routes through the
  // `FileSystem.realpath` seam — planting under the already-canonical root keeps
  // the callee resolution agreeing with the wired `activeRoots`.
  workspaceDir = realpathSync(mkdtempSync(join(tmpdir(), "theta-bug0293-")));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });

  // (A) invokes a callee that is never planted → the missing/unreadable class.
  writeFileSync(join(thetaDir, "infraleaf.theta"), invoker("missing"), "utf8");
  // (B) invokes an existing but garbled callee → the parse class.
  writeFileSync(join(thetaDir, "garbled.theta"), GARBLED_CALLEE, "utf8");
  writeFileSync(join(thetaDir, "parsetop.theta"), invoker("garbled"), "utf8");
  // (C) invokes a readable + parseable callee → none of the three arms.
  writeFileSync(join(thetaDir, "okcallee.theta"), OK_CALLEE, "utf8");
  writeFileSync(join(thetaDir, "oktop.theta"), invoker("okcallee"), "utf8");
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

describe("bug 0293 — the invoke callee intake cause partition through the shipped composition root", () => {
  it("(A) a MISSING callee renders cause load_failure, not the runtime-defect surface — ", () => {
    // error-model.md §Runtime-panics reserves `internal_error` for interpreter
    // defects; a typo'd invoke path is authored input, whose unreadable callee
    // belongs to `load_failure` (queryerror-variants.md:182). Red at this HEAD
    // with `(internal_error)` — the re-check's `realpath` ENOENT preempts the
    // load arm and the boundary defaults the throw to `internal_error`.
    expect(errNote("infraleaf")).toBe(
      "theta /infraleaf returned Err: invoke of ./missing.theta failed (load_failure)",
    );
  });

  it("(B) an EXISTING but unparseable callee renders cause parse_failure, not load_failure — ", () => {
    // queryerror-variants.md:183: `parse_failure` = "callee file failed to
    // parse". The garbled file is readable, so it is NOT the unreadable class.
    // Red at this HEAD with `(load_failure)` — `parseCalleeTheta` collapses the
    // unparseable case into the same `undefined` as the unreadable case.
    expect(errNote("parsetop")).toBe(
      "theta /parsetop returned Err: invoke of ./garbled.theta failed (parse_failure)",
    );
  });

  it("(C) CONTROL: a readable + parseable callee takes none of the load/parse/internal arms — ", () => {
    // Green now and after the fix — the fence that proves the (A)/(B) flips are
    // driven by the FAILURE class, not by the harness reclassifying every invoke.
    // Observed offline: `okcallee`'s body value flows back and the untyped invoke
    // yields `Ok(null)`, so `oktop` succeeds and emits ZERO top-level Err notes.
    const count = errNoteCount("oktop");
    if (count === 0) {
      expect(count, "the readable+parseable callee's invoke did not fail").toBe(0);
    } else {
      // Defensive both-branch: were a note emitted, it must not carry any of the
      // three intake-failure causes — a readable/parseable callee is none of them.
      const note = errNote("oktop");
      for (const cause of ["load_failure", "parse_failure", "internal_error"]) {
        expect(
          note,
          `a readable+parseable callee must not render intake cause ${cause}`,
        ).not.toContain(`failed (${cause})`);
      }
    }
  });

  it("(G) the (A) and (B) causes DIFFER and each equals its own class — ", () => {
    // The headline as a relation: a `match(cause)` author must take a DIFFERENT
    // arm for a missing callee than for a garbled one. At this HEAD both render
    // shifted-but-equal-to-the-wrong-class; the fix separates them.
    const missingNote = errNote("infraleaf");
    const garbledNote = errNote("parsetop");
    const cause = (note: string): string => {
      const match = /failed \(([a-z_]+)\)$/.exec(note);
      if (match === null) {
        throw new Error(`harness precondition unmet: no cause suffix in ${JSON.stringify(note)}`);
      }
      return match[1] as string;
    };
    const missingCause = cause(missingNote);
    const garbledCause = cause(garbledNote);
    expect(missingCause, "a missing callee is the unreadable class").toBe("load_failure");
    expect(garbledCause, "a garbled callee is the parse class").toBe("parse_failure");
    expect(
      missingCause === garbledCause,
      "the two intake failures must be distinguishable by `cause` alone",
    ).toBe(false);
  });
});
