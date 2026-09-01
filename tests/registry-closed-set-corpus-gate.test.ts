import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS live-corpus module, no type declarations.
import { assembleLiveCorpus } from "../tools/closing-gate/live-corpus.js";
// @ts-expect-error — JS closing-gate module, no type declarations.
import { runClosingGate } from "../tools/closing-gate/index.js";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../tools/code-registry/index.js";

// DIAG-2 corpus-wide closed-set reconciliation (bug 0230).
//
// DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) closes the
// diagnostic registry: a code's row and its site land together, and the four
// sharded tables "together enumerate every diagnostic the V1 spec defines"
// (docs/spec_topics/diagnostics/code-registry-parse.md:5). Three artifacts carry
// that closure — the sharded spec tables, the `docs/reference/diagnostics.md`
// mirror that transcribes their stable-contract columns
// (docs/reference/diagnostics.md:3-9), and the asserting test corpus — and this
// file is where any pair of them is reconciled over the LIVE tree.
//
// `tests/code-registry.test.ts:86` drives `reconcileClosedSet` over a two-row
// literal, so it gates the reconciler and not the corpus; the corpus-level
// reconciliation runs in `runClosingGate` (arms (3) and (4),
// tools/closing-gate/index.js:701 and :712) and is filtered out of the canary's
// returned collection by `CANARY_GAP_KINDS` (tools/closing-gate/live-corpus.js:51-59,
// :184) before the release gate's only assertion reads it.
//
// This file therefore runs the SHIPPED machinery — `assembleLiveCorpus` +
// `runClosingGate` — over the real repository root and asserts on the two
// closed-set kinds directly, rather than defining a second notion of "asserted"
// (tools/closing-gate/live-corpus.js:5-11 states the no-second-copy principle).
//
// One reader is local to this file: the mirror's four-column tables are
// invisible to `parseRegistry`, whose five-cell floor
// (tools/code-registry/index.js:36) exists to skip non-registry tables, so the
// mirror side of the parity cells is read here instead of widening a function
// 150 test files import.

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

interface Finding {
  kind: string;
  subject: string;
  detail: string;
}

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

// The four sharded spec registry pages: the registry TABLES this file parses
// for the mirror-parity cells. The arms' registry set is wider — arm (3)/(4)
// read `parseRegistryCodes` (tools/closing-gate/index.js:665) over
// `registryText`, which concatenates every `.md` under
// docs/spec_topics/diagnostics/ plus docs/spec_topics/diagnostics.md
// (tools/closing-gate/live-corpus.js:148-150) — so a code backtick-mentioned in
// the prose pages counts as registered for those arms even with its table row
// deleted, and the parity cells must not be read as covering that wider set.
const REGISTRY_PAGES = ["parse", "load", "runtime", "host"].map((family) =>
  path.join(
    REPO_ROOT,
    "docs",
    "spec_topics",
    "diagnostics",
    `code-registry-${family}.md`,
  ),
);

const MIRROR_PAGE = path.join(REPO_ROOT, "docs", "reference", "diagnostics.md");

const BASELINE_FIXTURE = path.join(
  REPO_ROOT,
  "tests",
  "fixtures",
  "diag2",
  "asserted-code-not-in-registry-baseline.json",
);

// A missing artifact is a gate failure, not a reason to pass: read loudly and
// name the absent path.
function readRequired(file: string): string {
  if (!existsSync(file)) {
    throw new Error(
      `DIAG-2 corpus gate precondition missing: ${path.relative(REPO_ROOT, file)} is absent`,
    );
  }
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

// The live corpus is assembled and reconciled once: the gate reads the whole
// `tests/**` tree, and re-running it per cell would multiply that read by the
// cell count for an identical answer.
const LIVE_FINDINGS = runClosingGate(
  assembleLiveCorpus(REPO_ROOT),
) as Finding[];

function subjectsOfKind(kind: string): string[] {
  return LIVE_FINDINGS.filter((f) => f.kind === kind)
    .map((f) => f.subject)
    .sort();
}

// The namespace prefix every registry code carries, composed rather than
// written as one span: `extractAssertedCodes` (tools/closing-gate/index.js:589)
// treats any code-shaped literal in a `tests/**` source as an assertion, so a
// carve-out table spelling its codes out in full would make THIS file their
// asserting test and empty the very arm the table is pinned against.
const CODE_PREFIX = "theta" + "/";

/**
 * Registry codes that arm (3) reports over the live corpus, each with the
 * reason it is not a witness gap the shipped extractor can see. An entry added
 * here without a reason, or a reason that stops being true, is caught by the
 * cells below: the table is asserted set-equal to the live arm in both
 * directions.
 */
const CARVE_OUT: Record<string, string> = {
  "load/cross-source-shadow":
    "Emitted in `resolveSlashNames` (src/discovery/discovery-walk.ts) on the " +
    "different-priority shadow branch of the discovery walk; no test asserts the code or exercises " +
    "that emission, and this carve-out table is the code's only occurrence under " +
    "tests/, so no witness exists at HEAD and this entry records the absence " +
    "rather than hiding it.",
  "runtime/subagent-wire-parse-failed":
    "Emitted at src/runtime/subagent-json-driver.ts:146 and genuinely witnessed at " +
    "tests/subagent-wire-parse-failed-emitter.test.ts:182-207 through a " +
    "registry-derived code composed from parts (no literal span, per DIAG-4's " +
    "parseRegistry / registryMessage) and at tests/subagent-json-wire.test.ts:82 " +
    "through the exported SUBAGENT_WIRE_PARSE_FAILED_CODE constant, which is why the " +
    "shipped extractor still cannot see the assertion (bug 0086, fixed).",
  "runtime/subagent-envelope-parse-failed":
    "Emitted at src/runtime/subagent-envelope.ts:404 and genuinely witnessed at " +
    "tests/subagent-envelope.test.ts:330 and tests/subagent-json-wire.test.ts:144 — " +
    "both assert through the exported SUBAGENT_ENVELOPE_PARSE_FAILED_CODE constant, " +
    "and the file's prose (tests/subagent-envelope.test.ts:7, " +
    "tests/subagent-json-wire.test.ts:132) cites the code without its namespace " +
    "prefix, so the literal span the extractor matches never appears in the test text.",
  "runtime/subagent-envelope-schema-skew":
    "Emitted at src/runtime/subagent-envelope.ts:462 and genuinely witnessed at " +
    "tests/subagent-envelope.test.ts:346, which asserts through the exported " +
    "SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE constant; as above, the code's only prose " +
    "mention (tests/subagent-envelope.test.ts:7) drops the namespace prefix, so the " +
    "extractor sees no asserted literal.",
};

const CARVE_OUT_CODES = Object.keys(CARVE_OUT)
  .map((suffix) => CODE_PREFIX + suffix)
  .sort();

// The registry code set, parsed from the live sharded pages by the shipped
// parser — the same rows arm (3) iterates.
const REGISTRY_ROWS = parseRegistry(
  REGISTRY_PAGES.map(readRequired).join("\n"),
) as RegistryRow[];
const REGISTRY_CODES = REGISTRY_ROWS.map((r) => r.code).sort();

// Mirror-local table reader: a mirror row is a four-cell table row whose first
// cell is a backticked code. Cell splitting matches the registry parser's
// escaped-pipe handling because mirror *Message* cells carry `\|` inside union
// renderings, which a naive split would shred into extra cells.
function mirrorCodes(text: string): string[] {
  const codes: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?\s*$/.test(trimmed)) continue; // separator row
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
    if (cells.length !== 4) continue;
    const match = cells[0]!.match(/^`(theta\/[a-z0-9/_-]+)`$/);
    if (match != null) codes.push(match[1]!);
  }
  return codes.sort();
}

const MIRROR_CODES = mirrorCodes(readRequired(MIRROR_PAGE));

describe("DIAG-2 — the closed set, reconciled over the live corpus (bug 0230)", () => {
  it("DIAG-2: every registry code with no asserting test is a pinned carve-out, and every carve-out is still reported", () => {
    expect(REGISTRY_CODES.length).toBeGreaterThan(0);

    const reported = subjectsOfKind("registry-code-no-asserting-test");

    // Both directions: an unwitnessed row landing without a stated reason reds,
    // and a carve-out whose gap has closed reds so the table cannot go stale.
    expect(reported).toEqual(CARVE_OUT_CODES);
  });

  it("DIAG-2: each carved-out code is a live registry code carrying a stated reason", () => {
    for (const [suffix, reason] of Object.entries(CARVE_OUT)) {
      const code = CODE_PREFIX + suffix;
      expect(REGISTRY_CODES, `carved-out code ${code} is absent from the registry`).toContain(code);
      expect(reason.trim().length, `carved-out code ${code} states no reason`).toBeGreaterThan(0);
    }
  });

  // The corpus→registry arm is baselined rather than gated to empty because
  // `extractAssertedCodes` (tools/closing-gate/index.js:589) matches any
  // code-shaped span in test text: the population is dominated by prose
  // truncations, `.theta` document names, and the registry test's deliberate
  // ghost codes rather than by real registry gaps — see bug 0230 §Reproduction
  // (d) and §Fix (b). The baseline therefore pins that artefact population as
  // data (the fixture is JSON and cannot carry this comment) so an ADDITION
  // still reds while the extractor's fidelity is a separate subject.
  it("DIAG-2: no test asserts a code outside the registry beyond the pinned baseline", () => {
    const baseline = new Set(
      JSON.parse(readRequired(BASELINE_FIXTURE)) as string[],
    );
    const added = subjectsOfKind("asserted-code-not-in-registry").filter(
      (code) => !baseline.has(code),
    );
    expect(added).toEqual([]);
  });

  it("DIAG-2: every pinned baseline entry is still produced by the live corpus", () => {
    const baseline = JSON.parse(readRequired(BASELINE_FIXTURE)) as string[];
    expect(baseline.length).toBeGreaterThan(0);
    const reported = new Set(subjectsOfKind("asserted-code-not-in-registry"));
    const stale = baseline.filter((code) => !reported.has(code));
    expect(stale).toEqual([]);
  });
});

describe("DIAG-2 — the registry and its reference mirror enumerate the same codes (bug 0230)", () => {
  it("DIAG-2: every registry code has a mirror row", () => {
    expect(MIRROR_CODES.length).toBeGreaterThan(0);
    const unmirrored = REGISTRY_CODES.filter(
      (code) => !MIRROR_CODES.includes(code),
    );
    expect(
      unmirrored,
      "registry codes absent from docs/reference/diagnostics.md",
    ).toEqual([]);
  });

  it("DIAG-2: every mirror row names a registry code", () => {
    expect(REGISTRY_CODES.length).toBeGreaterThan(0);
    const unregistered = MIRROR_CODES.filter(
      (code) => !REGISTRY_CODES.includes(code),
    );
    expect(
      unregistered,
      "docs/reference/diagnostics.md rows naming no registry code",
    ).toEqual([]);
  });
});
