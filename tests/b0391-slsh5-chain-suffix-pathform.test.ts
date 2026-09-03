// Bug 0391 — the SLSH-5 chain-suffix placeholders render raw native `realpath`
// output, so on Windows the delivered err note interpolates `C:\…` backslash
// paths where the spec pins the `realpath`-THEN-forward-slash containment form
// (`docs/bugs/0391-slsh5-chain-suffix-native-backslash-paths.md`).
//
// WHAT IS ASSERTED. SLSH-5 (`docs/spec_topics/slash-invocation.md:54`) pins the
// two chain-suffix placeholders `<callee_path>` / `<parent_path>` to "the same
// `realpath`-normalised absolute paths used for discovery-root containment",
// and that containment form is defined at `invocation.md:12` (§Resolution) as
// `realpath` output "compared byte-for-byte after forward-slash normalisation
// (per the 'Path literals' rule in Lexical Structure)". The corpus mints that
// exact form through one helper, `canonicalizePath`
// (`src/runtime/invocation.ts:142`, `normalizePath(await fs.realpath(path))`).
// These cells assert the two provenance mint sites and the rendered note carry
// the `canonicalizePath` form byte-for-byte — the SLSH-4 exact-string norm
// (`slash-invocation.md:33`: "Conformance tests MAY assert on the exact
// rendered string").
//
// WHY THIS TIER — offline, provider-free, deterministic. The defect only leaks
// under the PRODUCTION `realpath`, which is `realpath.native`
// (`src/seams/pi-file-system.ts:30`) and returns host-native separators
// (backslash on Windows). A `FakeFileSystem` would have to choose a separator
// convention and thereby hide the very seam under test, so this cell drives the
// real `PiFileSystem` over a real temp directory — the one place native
// `realpath` separators leak into the recorded `ChainHop`. No provider is
// touched: the leaf `QueryError` is a hand-built value; no query is issued.
//
// RED DIRECTION. At the unfixed tree `recordInvocationProvenance`
// (`invoke-provenance.ts:116`) and `InvocationProvenanceLedger.attach`
// (`invoke-provenance-ledger.ts:116`) store bare `fs.realpath(...)` output, so
// on Windows `record.parentPath` / `chain[0].calleePath` carry backslashes and
// disagree with the `canonicalizePath` form; the rendered note interpolates the
// backslash strings verbatim (`renderTopLevelErrNote`, `err-note-render.ts`). On POSIX the two
// forms coincide and every assertion is a byte-identical no-op green.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { canonicalizePath } from "../src/runtime/invocation";
import type { InvokeCallSite } from "../src/runtime/invoke-provenance";
import { recordInvocationProvenance } from "../src/runtime/invoke-provenance";
import { createInvocationProvenanceLedger } from "../src/runtime/invoke-provenance-ledger";
import { renderTopLevelErrNote } from "../src/runtime/err-note-render";
import type { InvokeCalleeError, QueryError, ValidationError } from "../src/runtime/query-error";

/** The em-dash U+2014 the SLSH-4 templates carry verbatim (`slash-invocation.md:33`). */
const DASH = "\u2014";

/**
 * The 1-indexed line of the `invoke(` call-site token SLSH-5 records into
 * `<line>` (`slash-invocation.md:54`). A fixed literal — no source is parsed
 * here; the provenance producer reads it straight off the call-site descriptor.
 */
const INVOKE_TOKEN_LINE = 3;

/** The production filesystem seam whose `realpath` is `realpath.native`. */
const fs = new PiFileSystem();

let root: string;
let parentPath: string;
let calleeAbsPath: string;

beforeAll(() => {
  // `realpathSync` the temp root ONCE up-front so a symlinked OS temp root (the
  // macOS `/var`→`/private/var` case) cannot make the fix's `realpath` seam
  // disagree with these expectations for an unrelated reason — the precaution
  // `tests/slsh5-invoke-cascade-chain-suffix.test.ts` beforeAll takes.
  root = realpathSync(mkdtempSync(join(tmpdir(), "b0391-slsh5-")));
  mkdirSync(root, { recursive: true });
  parentPath = join(root, "parent.theta");
  calleeAbsPath = join(root, "child.theta");
  writeFileSync(parentPath, ["---", "mode: prompt", 'invoke("./child.theta")?'].join("\n") + "\n", "utf8");
  writeFileSync(calleeAbsPath, ["---", "mode: prompt", "---", 'let s = ""', "@`${s}`?"].join("\n") + "\n", "utf8");
});

afterAll(() => {
  if (root !== undefined) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** The literal-`invoke` call-site descriptor (`slash-invocation.md:54`, SLSH-5). */
const callSite: InvokeCallSite = {
  style: "literal_invoke",
  invokeToken: { line: INVOKE_TOKEN_LINE, column: 1 },
};

/**
 * A leaf `empty_template` validation error — a hand-built value, so no provider
 * turn is issued. It is the innermost non-`invoke_callee` variant the note's
 * per-kind row is computed from (SLSH-5).
 */
function leafError(): QueryError {
  const leaf: ValidationError = {
    kind: "validation",
    cause: "empty_template",
    message: "rendered query template was empty",
    attempts: 0,
    validation_errors: [],
    raw_response: null,
  };
  return leaf as QueryError;
}

/** The `invoke_callee` wrapper carrying the literal callee-path text (never `realpath`'d). */
function wrapperError(): InvokeCalleeError {
  return {
    kind: "invoke_callee",
    message: "invoke of ./child.theta callee returned Err(...)",
    callee_path: "./child.theta",
    inner: leafError(),
  };
}

describe("bug 0391 — the SLSH-5 chain suffix must render the realpath-then-forward-slash form", () => {
  it("recordInvocationProvenance mints the parent path in the canonicalizePath form — ", async () => {
    // invocation.md:12 (§Resolution): the recorded path is `realpath` output
    // forward-slash-normalised. RED now: `invoke-provenance.ts:116` stores bare
    // `realpath.native` output (backslash on Windows) vs the canonical form.
    const canonicalParent = await canonicalizePath(fs, parentPath);
    const record = await recordInvocationProvenance({ fs }, { parentPath, callSite });
    expect(record.parentPath).toBe(canonicalParent);
  });

  it("the ledger mints the callee path in the canonicalizePath form — ", async () => {
    // slash-invocation.md:54 (SLSH-5): `<callee_path>` is the same
    // `realpath`-normalised path used for containment. RED now:
    // `invoke-provenance-ledger.ts:116` stores bare `realpath.native` output.
    const canonicalCallee = await canonicalizePath(fs, calleeAbsPath);
    const ledger = createInvocationProvenanceLedger({ fs });
    const wrapper = wrapperError();
    await ledger.attach(wrapper, { parentPath, calleePath: calleeAbsPath, callSite });
    const chain = ledger.chainFor(wrapper);
    expect(chain).toHaveLength(1);
    expect(chain[0]?.calleePath).toBe(canonicalCallee);
  });

  it("the rendered top-level err note interpolates both placeholders forward-slashed — ", async () => {
    // slash-invocation.md:33 (SLSH-4): the note templates are normative and a
    // conformance test MAY assert the exact rendered string. This is the spec
    // form: the SNK-b leaf row + the SLSH-5 suffix in the canonical path form.
    const canonicalParent = await canonicalizePath(fs, parentPath);
    const canonicalCallee = await canonicalizePath(fs, calleeAbsPath);
    const ledger = createInvocationProvenanceLedger({ fs });
    const wrapper = wrapperError();
    await ledger.attach(wrapper, { parentPath, calleePath: calleeAbsPath, callSite });
    const chain = ledger.chainFor(wrapper);
    const note = renderTopLevelErrNote({ thetaName: "parent", error: wrapper, chain });

    const leafRow = `theta /parent returned Err: rendered query template was empty ${DASH} no provider turn was issued`;
    const suffix = ` from ${canonicalCallee} invoked at ${canonicalParent}:${INVOKE_TOKEN_LINE}`;
    expect(note).toBe(leafRow + suffix);
  });

  it("CONTROL: the canonicalizePath form never carries a backslash on any host — ", async () => {
    // Proves the cells above discriminate the two forms without redding on
    // POSIX: the spec (forward-slash) form contains no backslash on any host,
    // whereas the bare-`realpath.native` form the mint sites currently store
    // does on Windows. Asserting the RAW realpath contains a backslash would
    // itself red on POSIX, so the discrimination is stated on the spec form.
    const canonicalParent = await canonicalizePath(fs, parentPath);
    const canonicalCallee = await canonicalizePath(fs, calleeAbsPath);
    expect(canonicalParent.includes("\\")).toBe(false);
    expect(canonicalCallee.includes("\\")).toBe(false);
  });
});
