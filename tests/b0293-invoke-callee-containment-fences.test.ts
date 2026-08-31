// Bug 0293 — the INV-1 containment fences around the `invoke(...)` callee-intake
// cause partition, driven deterministically through the real `#driveCallee`
// boundary with an injected `FakeFileSystem`
// (`docs/bugs/0293-invoke-callee-load-parse-causes-shifted.md`).
//
// WHY A FAKE FILESYSTEM, NOT A REAL SYMLINK. This host is Windows, where a
// broken symlink cannot be created without elevation (EPERM), so the (E1)/(D)
// fences cannot use an on-disk link. `FakeFileSystem` (`tests/helpers/
// fake-file-system.ts`) reports the exact `realpath` / `lstat` split the fix
// keys on, cross-platform: a BROKEN symlink has `realpath` throw ENOENT while
// `lstat` SUCCEEDS (reports a symbolic link); a truly ABSENT path has BOTH throw
// ENOENT. That split is the only thing separating a missing callee (→ the fix's
// `load_failure`) from a broken symlink inside a root (→ unchanged
// `internal_error`), so it must be exercised through the injected seam.
//
// WHY ABSOLUTE, FORWARD-SLASH CALLEE PATHS. The production re-check resolves a
// RELATIVE callee literal through `node:path` (`#recheckCalleeContainment`'s
// `resolvedPath` computation, `production-theta-producer.ts`), which is
// `path.win32` on this host and rewrites `./x.theta` to a
// back-slashed, drive-lettered `C:\…\x.theta`. `FakeFileSystem` follows symlinks
// only at forward-slash absolute components, so a relative literal would never
// reach its symlink map and (E1) would mis-classify as a plain missing path.
// An ABSOLUTE forward-slash literal is `isAbsolute` on both win32 and posix, so
// the re-check feeds it to `realpath` UNCHANGED and the fake's symlink map is
// consulted identically on every host. The relative-literal SLSH-3 note
// (`invoke of ./missing.theta failed (load_failure)`) is witnessed by the real
// temp-dir sibling `tests/b0293-invoke-callee-cause-partition.test.ts`; this file
// pins the containment MECHANICS the fake makes deterministic.
//
// WHAT EACH CELL PINS. A bare untyped `invoke(...)` routes through the real
// `runInvokeChild` boundary (`invoke-cancellation.ts`), so a thrown re-check
// surfaces as a `ThetaValue` `Err` whose `error.cause` defaults to
// `internal_error` (invoke-cancellation.ts's non-panic default); the cell reads
// `execution.result.value` → `{ ok:false, error:{ cause, message, callee_path } }`.
//   (E2) MISSING callee — the re-check's `realpath` throws ENOENT AHEAD of the
//        load arm (`#recheckCalleeContainment`'s call site inside `#driveCallee`
//        precedes its `parseCallee` call, `production-theta-producer.ts`), so
//        pre-fix the parent observed `internal_error` with the raw Node ENOENT
//        text and `parseCallee` was NEVER reached. The fix falls through to the
//        load arm: `cause: "load_failure"` with the arm's minted message,
//        `parseCallee` called.
//   (E1) BROKEN SYMLINK inside a root — `realpath` throws ENOENT but `lstat`
//        succeeds, so this is NOT the missing class; its disposition
//        (`internal_error`, `parseCallee` not reached) is UNCHANGED by the fix.
//        Green now and after — the both-branches partner of (E2): (E2) absent →
//        `load_failure`, (E1) present-symlink → `internal_error`, both run
//        deterministically (no silent skip).
//   (D)  ROOT-ESCAPING callee — `realpath` succeeds to a path outside every
//        active root, so INV-1's escape arm mints `load_failure`
//        (`invocation.ts:262`) BEFORE the load; `parseCallee` is not reached.
//        Green now and after — an INV-1 non-goal, unchanged by this fix.
//
// Spec: `docs/spec_topics/errors-and-results/queryerror-variants.md:182-183`
// (`load_failure` / `parse_failure` glosses), `error-model.md` §Runtime-panics
// (`internal_error` is the runtime-defect surface, not an authoring outcome),
// `docs/spec_topics/invocation.md` §Resolution (INV-1). Bug 0293 §Non-goals: the
// containment-escape verdict and the broken-symlink disposition are NOT touched.
//
// NO SILENT SKIP. Every cell probes the injected FS and asserts a concrete
// verdict; an unmet precondition (a value that never reached `Err`) fails loudly
// via `readInvokeErr`, never an early return.

import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput, ConversationBindInput } from "../src/extension/theta-composition-producer";
import type { CalleeParseOutcome } from "../src/extension/production-theta-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ThetaValue } from "../src/runtime/value";
import type { InvokeExpr, ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import { FakeFileSystem } from "./helpers/fake-file-system";

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A bare untyped `invoke("<calleePath>")` expression (no positional args, no
 *  `<Schema>` annotation). `#resolveInvoke` reads `path` for the callee and
 *  `args.slice(1)` for the positional args — empty here. */
function invokeExpr(calleePath: string): InvokeExpr {
  return { kind: "invoke", path: calleePath, returnSchema: null, args: [], range: span() };
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
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  /** The INV-1 open-time containment re-check seam (`realpath`, and — post-fix —
   *  `lstat`); the full `FakeFileSystem` satisfies any current/future `Pick`. */
  readonly fileSystem: FileSystem;
  /** The currently-active discovery-root union the re-check canonicalises. */
  readonly activeRoots: readonly string[];
  /** The callee-load seam. Records every call so a cell can assert whether the
   *  re-check fell THROUGH to the load arm (E2 post-fix) or short-circuited
   *  ahead of it (E2 now / E1 / D). */
  readonly parseCallee: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<CalleeParseOutcome | undefined>;
}

/** The production producer deps, wired with the injected `fileSystem` /
 *  `activeRoots` seams (absent in `production-core-exec.test.ts`, which is why
 *  its harness never reaches the re-check). */
function producer(opts: ProducerOpts): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    pi: { sendMessage: () => {} } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    fileSystem: opts.fileSystem,
    activeRoots: opts.activeRoots,
    parseCallee: opts.parseCallee,
  });
}

/** The caller theta whose sole body value is `invoke("<calleePath>")`. Its
 *  `sourcePath` sets the callee base dir; an ABSOLUTE callee literal is used, so
 *  the re-check feeds it to `realpath` unchanged (see the header). */
function callerTheta(calleePath: string): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  const body: ThetaBody = { statements: [], tail: invokeExpr(calleePath) };
  return { slashName: "caller", sourcePath: "/proj/.pi/theta/caller.theta", frontmatter, body };
}

/** Drive the caller body through the real prompt-mode binding and return the
 *  FN-5 final value (the invoke's top-level `Result`). */
async function runInvoke(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
): Promise<ThetaValue | undefined> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return execution.result.value;
}

/** The `InvokeInfraError` fields off the invoke's terminal `Result`. Fails loudly
 *  if the value never reached an `Err` — an unmet precondition is never a silent
 *  pass. */
function readInvokeErr(value: ThetaValue | undefined): {
  readonly cause: string;
  readonly message: string;
  readonly callee_path: string;
} {
  const result = value as { ok?: boolean; error?: Record<string, unknown> } | undefined;
  if (result === undefined || result.ok !== false || result.error === undefined) {
    throw new Error(
      `precondition unmet: the invoke did not surface an Err — value: ${JSON.stringify(value)}`,
    );
  }
  return {
    cause: String(result.error.cause),
    message: String(result.error.message),
    callee_path: String(result.error.callee_path),
  };
}

const ROOT = "/proj/.pi/theta";
const ACTIVE_ROOTS = [ROOT] as const;
/** Root planted so the re-check's per-root `realpath` canonicalisation resolves
 *  (a dir entry — the theta root), independent of the callee's own fate. */
const ROOT_DIRS = { [ROOT]: [] as readonly string[] } as const;

/** A `parseCallee` that records its calls and reports the callee unloadable
 *  (`undefined`) — the pre-verdict seam, which the fix's default maps to
 *  `load_failure`. Whether it is CALLED discriminates fall-through from
 *  short-circuit. */
function recordingParseCallee(): {
  readonly fn: ProducerOpts["parseCallee"];
  readonly calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    // `undefined` is the seam-absent / not-`ok` default (→ load_failure); every
    // cell in this file drives the containment re-check itself, never a
    // successful parse.
    fn: (_caller, calleePath): Promise<undefined> => {
      calls.push(calleePath);
      return Promise.resolve(undefined);
    },
  };
}

describe("bug 0293 — invoke callee containment fences (injected FakeFileSystem)", () => {
  it("(E2) a MISSING callee falls through to load_failure with the minted message, not internal_error/ENOENT — ", async () => {
    const parse = recordingParseCallee();
    const missing = `${ROOT}/missing.theta`;
    // No entry for `missing` → realpath AND lstat both throw ENOENT (the truly
    // absent class), which the fix routes to the load arm.
    const fs = new FakeFileSystem({ homedir: "/home/u", cwd: "/proj", dirs: ROOT_DIRS });
    const value = await runInvoke(
      producer({ fileSystem: fs, activeRoots: ACTIVE_ROOTS, parseCallee: parse.fn }),
      callerTheta(missing),
    );
    const err = readInvokeErr(value);

    // queryerror-variants.md:182 — a missing/unreadable callee is `load_failure`,
    // not the runtime-defect surface. RED now: `internal_error` (the re-check's
    // `realpath` ENOENT reaches the boundary default, invoke-cancellation.ts:138).
    expect(err.cause, "a missing callee is the load/unreadable class").toBe("load_failure");
    // The arm's minted sentence, not the raw Node ENOENT text (RED now).
    expect(err.message).toBe(`invoke callee '${missing}' could not be loaded`);
    expect(err.message, "the runtime-defect ENOENT stack hint must not leak").not.toContain("ENOENT");
    // The re-check fell THROUGH to the load arm (RED now: `parseCallee` never
    // reached because the re-check re-threw first).
    expect(parse.calls, "the callee load arm ran").toContain(missing);
  });

  it("(E1) a BROKEN symlink inside a root keeps internal_error and never reaches the load arm — ", async () => {
    const parse = recordingParseCallee();
    const brokenLink = `${ROOT}/brokenlink.theta`;
    // realpath(brokenLink) throws ENOENT (target absent) while lstat(brokenLink)
    // SUCCEEDS (a symbolic link) — NOT the truly-absent class, so the fix leaves
    // its disposition untouched.
    const fs = new FakeFileSystem({
      homedir: "/home/u",
      cwd: "/proj",
      dirs: ROOT_DIRS,
      symlinks: { [brokenLink]: `${ROOT}/nonexistent-target.theta` },
    });
    const value = await runInvoke(
      producer({ fileSystem: fs, activeRoots: ACTIVE_ROOTS, parseCallee: parse.fn }),
      callerTheta(brokenLink),
    );
    const err = readInvokeErr(value);

    // Green now and after — bug 0293 §Non-goals: a broken symlink inside a root
    // keeps its current disposition; only the truly-absent case flips.
    expect(err.cause, "a broken symlink inside a root is not the missing class").toBe("internal_error");
    expect(parse.calls, "the re-check re-threw ahead of the load arm").not.toContain(brokenLink);
  });

  it("(D) a ROOT-ESCAPING callee keeps load_failure (INV-1 escape arm) and never reaches the load arm — ", async () => {
    const parse = recordingParseCallee();
    const inside = `${ROOT}/inside.theta`;
    // The link resolves to a real file OUTSIDE every active root: realpath
    // succeeds, containment is false → the INV-1 escape arm (invocation.ts:262).
    const fs = new FakeFileSystem({
      homedir: "/home/u",
      cwd: "/proj",
      files: { "/elsewhere/evil.theta": "theta", [ROOT]: "" },
      symlinks: { [inside]: "/elsewhere/evil.theta" },
    });
    const value = await runInvoke(
      producer({ fileSystem: fs, activeRoots: ACTIVE_ROOTS, parseCallee: parse.fn }),
      callerTheta(inside),
    );
    const err = readInvokeErr(value);

    // Green now and after — the escape verdict is spec'd by INV-1 and untouched.
    expect(err.cause, "a root-escaping callee is the INV-1 escape → load_failure").toBe("load_failure");
    expect(parse.calls, "the escape short-circuits ahead of the load arm").not.toContain(inside);
  });
});
