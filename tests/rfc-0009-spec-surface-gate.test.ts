// RFC 0009 Phase 3 spec-surface gate — the call-site `with { cwd }` clause.
//
// The RFC 0009 plan lands spec before code (Phase 3 = normative amendments;
// Phases 4-5 = tests + implementation). This gate guards the Phase 3 landing
// against drift in the window before the behavioral witnesses exist, and it is
// the citing test the closing gate's `mapped-req-id-no-citing-test` arm
// requires for the four REQ-IDs the landing coined per GOV-22:
//
//   INV-6  (invocation.md  — options-surface value semantics)
//   INV-7  (invocation.md  — existence is not pre-checked)
//   INV-8  (invocation.md  — mode gating)
//   TOOL-1 (tool-calls.md  — Argument shape, Pi-tool clause rejection)
//
// Scope discipline: every assertion here pins NORMATIVE TEXT (anchors in
// GOV-1 dual form, registry rows + reference mirror agreement, the grammar
// appendix's ownership sentences, the launch contract's identity/location
// enumeration, the coverage-matrix mapping). None of it asserts runtime
// behaviour — the behavioral witnesses land with the implementation phases
// and MUST supersede nothing here (this file stays as the spec-drift gate).
//
// Each cell fails loudly naming the missing surface; no cell can pass
// vacuously (readCorpus throws on unreadable/empty files).

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable — RFC 0009's spec surface lives there, so a missing file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to gate`);
  }
  return text;
}

const INVOCATION = "docs/spec_topics/invocation.md";
const TOOL_CALLS = "docs/spec_topics/tool-calls.md";
const GRAMMAR = "docs/spec_topics/grammar.md";
const SUBAGENT = "docs/spec_topics/pi-integration-contract/subagent.md";
const REGISTRY = "docs/spec_topics/diagnostics/code-registry-parse.md";
const MIRROR = "docs/reference/diagnostics.md";
const MATRIX = "docs/plan_topics/coverage-matrix.md";

/** The four parse codes RFC 0009 mints (errata A/A′ included), with their registry-pinned Message templates. */
const CODES: ReadonlyArray<readonly [code: string, message: string]> = [
  ["theta/parse/with-clause-unknown-key", "unknown key '<key>' in call-site with clause"],
  [
    "theta/parse/with-clause-prompt-mode-callee",
    "with clause requires a subagent-mode callee; '<callee>' is prompt-mode",
  ],
  ["theta/parse/with-clause-pi-tool", "with clause is not applicable to Pi tool '<name>'"],
  // Errata A/A′ (2026-09-09): default-reject — the clause is legal only on the
  // two child-spawning surfaces; every other callee (subagent fn, plain or
  // imported fn, .thetalib-body call) rejects with this code.
  [
    "theta/parse/with-clause-in-process-callee",
    "with clause is not applicable to '<callee>': the callee runs in-process and spawns no child process",
  ],
];

describe("RFC 0009 spec surface — call-site with clause (theta 1.3)", () => {
  it("INV-6 — options-surface value-semantics obligation is live in GOV-1 dual form on invocation.md", () => {
    const text = readCorpus(INVOCATION);
    expect(text).toContain('<a id="inv-6"></a> **INV-6.**');
    // The obligations INV-6 owns: empty-string validation arm, relative
    // resolution against the parent's effective cwd, parent-side path.resolve
    // + Windows-spelling normalisation.
    expect(text).toMatch(/INV-6\.\*\*[^\n]*empty string\*\* MUST surface at runtime/);
    expect(text).toMatch(/INV-6\.\*\*[^\n]*MUST resolve against the current process's working directory/);
    expect(text).toMatch(/INV-6\.\*\*[^\n]*MUST normalise the resolved value with `path\.resolve`/);
  });

  it("INV-7 — the no-existence-pre-check obligation is live in GOV-1 dual form on invocation.md", () => {
    const text = readCorpus(INVOCATION);
    expect(text).toContain('<a id="inv-7"></a> **INV-7.**');
    expect(text).toMatch(/INV-7\.\*\*[^\n]*MUST NOT pre-check the target directory's existence/);
    // Zero new runtime codes: the spawn-failure surface is reused.
    expect(text).toMatch(/INV-7\.\*\*[^\n]*theta\/runtime\/subagent-spawn-failed/);
  });

  it("INV-8 — the mode-gating obligation is live in GOV-1 dual form on invocation.md", () => {
    const text = readCorpus(INVOCATION);
    expect(text).toContain('<a id="inv-8"></a> **INV-8.**');
    expect(text).toMatch(/INV-8\.\*\*[^\n]*MUST be rejected at parse time with `theta\/parse\/with-clause-prompt-mode-callee`/);
    expect(text).toMatch(/INV-8\.\*\*[^\n]*Err\(InvokeInfraError \{ cause: "validation", … \}\)/);
    // Errata A/A′: the default-reject arm is INV-8's too.
    expect(text).toMatch(/INV-8\.\*\*[^\n]*`theta\/parse\/with-clause-in-process-callee`/);
  });

  it("TOOL-1 — the Argument-shape site carries the Pi-tool clause rejection in GOV-1 dual form on tool-calls.md", () => {
    const text = readCorpus(TOOL_CALLS);
    expect(text).toContain('<a id="tool-1"></a> **TOOL-1.**');
    expect(text).toMatch(/TOOL-1\.\*\*[^\n]*MUST be rejected at parse time with `theta\/parse\/with-clause-pi-tool`/);
  });

  it("the four with-clause parse codes are registered and mirrored with identical Message templates", () => {
    const registry = readCorpus(REGISTRY);
    const mirror = readCorpus(MIRROR);
    for (const [code, message] of CODES) {
      expect(registry, `${code} missing from the parse-code registry`).toContain(`\`${code}\``);
      expect(registry, `${code} registry Message template drifted`).toContain(`\`${message}\``);
      expect(mirror, `${code} missing from the reference mirror`).toContain(`\`${code}\``);
      expect(mirror, `${code} mirror Message template drifted`).toContain(`\`${message}\``);
    }
  });

  it("the grammar appendix owns the productions and the clause-binds-before-? ordering", () => {
    const text = readCorpus(GRAMMAR);
    expect(text).toContain('<a id="call-site-with-clause"></a>');
    expect(text).toContain("CallWithClause");
    expect(text).toContain("CallWithField");
    // The postfix-ordering rule the RFC pinned: the clause attaches before any
    // other postfix operator (grammar.md's own wording).
    expect(text).toMatch(/before any other postfix operator/);
    expect(text).toMatch(/the clause binds to the call and `\?` then applies to the call's `Result`/);
  });

  it("the launch contract pins the identity/location enumeration for the per-call cwd", () => {
    const text = readCorpus(SUBAGENT);
    expect(text).toContain('<a id="subagent-cwd-identity-location"></a>');
    // The two spelled-out consequences of the identity/location principle.
    expect(text).toMatch(/child runs the parent tree's worker code/i);
    expect(text).toMatch(/trust does not follow cwd/i);
  });

  it("the coverage matrix maps INV-6…INV-8 and TOOL-1 to RFC 0009", () => {
    const text = readCorpus(MATRIX);
    expect(text).toMatch(/\| INV-6 … INV-8 \| RFC 0009/);
    expect(text).toMatch(/\| TOOL-1 \| RFC 0009/);
  });
});
