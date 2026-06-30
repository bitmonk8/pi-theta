import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS closing-gate module, no type declarations.
import { loadCorpus, runClosingGate, extractReqIds, parsePrefixTable, parseRetiredReqIds, parseCoverageMatrix, parseRegistryCodes, extractAssertedCodes, extractCitingReqIds, parseCkaTokens, extractBroadCatchEntries, expandLeafTokens, parseH5bDeps, parseClosingLeafCells, parsePrefixTablePages, parseCkaAreaRows, parsePlanLeaves, pageHasUnanchoredMust, classifyClosingCell } from "../tools/closing-gate/index.js";

// H5a — REQ-ID / diagnostic-code closing-gate automation. These assertions ARE
// the closing gate "wired into npm test": they run the gate against the seeded
// fixtures under the dedicated test-fixtures root (test-fixtures/closing-gate/,
// outside docs/spec_topics/** and outside this live vitest corpus), green
// against the no-violation fixture and non-empty (red) against each seeded
// violation fixture this leaf owns. Each block cites the conventions.md
// convention it operationalises.

const FIXTURES = fileURLToPath(
  new URL("../test-fixtures/closing-gate", import.meta.url),
);

interface Finding {
  kind: string;
  subject: string;
  detail: string;
}

function gate(scenario: string): Finding[] {
  return runClosingGate(loadCorpus(path.join(FIXTURES, scenario))) as Finding[];
}

function kinds(findings: Finding[]): string[] {
  return findings.map((f) => f.kind);
}

describe("H5a — closing gate against the seeded no-violation fixture", () => {
  it("runs green: every spec REQ-ID mapped, every mapped REQ-ID cited, every registry code asserted", () => {
    expect(gate("no-violation")).toEqual([]);
  });

  it("(Convention: REQ-ID discipline) excludes the loom/typecheck/* brand from registry reconciliation — the no-violation fixture's typecheck brand has no asserting test yet stays green", () => {
    const findings = gate("no-violation");
    expect(
      findings.filter(
        (f) =>
          f.subject.startsWith("loom/typecheck/") ||
          f.kind === "registry-code-no-asserting-test",
      ),
    ).toHaveLength(0);
  });
});

describe("H5a — closing gate against each seeded violation fixture", () => {
  it("(Convention: REQ-ID discipline) fails when a fixture spec REQ-ID has no coverage-matrix row", () => {
    const findings = gate("unmapped-req-id");
    expect(kinds(findings)).toContain("unmapped-executable-req-id");
    expect(findings.find((f) => f.kind === "unmapped-executable-req-id")?.subject).toBe(
      "FOO-3",
    );
    // The unmapped REQ-ID carries no citing-test obligation: this fixture fires
    // exactly the unmapped arm and nothing else.
    expect(kinds(findings)).toEqual(["unmapped-executable-req-id"]);
  });

  it("(Convention: REQ-ID discipline — citing tests) fails when a mapped numbered REQ-ID has no citing test in the seeded test corpus", () => {
    const findings = gate("missing-citing-test");
    expect(kinds(findings)).toEqual(["mapped-req-id-no-citing-test"]);
    expect(findings[0]?.subject).toBe("FOO-2");
  });

  it("(Convention: Diagnostic message anchors) fails when a registry code has no asserting test", () => {
    const findings = gate("registry-code-no-test");
    expect(kinds(findings)).toEqual(["registry-code-no-asserting-test"]);
    expect(findings[0]?.subject).toBe("loom/runtime/orphan");
  });

  it("(Convention: Diagnostic message anchors) fails when a test asserts a diagnostic code absent from the registry", () => {
    const findings = gate("asserted-code-not-in-registry");
    expect(kinds(findings)).toEqual(["asserted-code-not-in-registry"]);
    expect(findings[0]?.subject).toBe("loom/runtime/ghost");
  });
});

// H5c — `no-broad-catch` allow-list closing-gate reconciliation arm, running as
// part of the unified closing-gate machinery against seeded fixtures under the
// same dedicated test-fixtures root. The arm scans the `// allow-broad-catch:`
// comments across the (seeded) `src/**` as its allow-list entries and reds out
// when an entry's cited token resolves to none of the four admitted arms.
describe("H5c — broad-catch allow-list reconciliation against seeded fixtures", () => {
  it("(Convention: Specific exception types only — broad-catch allow-list) runs green when every entry cites an admitted token (REQ-ID, cka-<n>, concrete loom/... code, pi-sdk-boundary)", () => {
    expect(gate("broad-catch-no-violation")).toEqual([]);
  });

  it("(Convention: Specific exception types only — broad-catch allow-list) fails when an entry cites a loom/... glob/wildcard family that the concrete-registry-code resolver never matches", () => {
    const findings = gate("broad-catch-unresolved");
    expect(kinds(findings)).toEqual(["broad-catch-allow-list-unresolved"]);
    expect(findings[0]?.subject).toBe("loom/host/session-shutdown-*");
  });
});

describe("H5c — broad-catch allow-list token resolution (unit)", () => {
  const corpus = (srcText: string) => ({
    prefixTableText: "## REQ-ID prefix table\n| Page | Prefix |\n|---|---|\n| foo.md | FOO |",
    specSources: [{ path: "foo.md", text: "**FOO-1.** x" }],
    coverageMatrixText: [
      "| REQ-ID | Closing leaf(s) |",
      "|---|---|",
      "| FOO-1 | `V1a` |",
      "",
      "## Code-keyed obligation areas (no numbered REQ-IDs)",
      "| Token | Spec area | Closing leaf(s) |",
      "|---|---|---|",
      "| `cka-7` | `foo.md` (FOO) | `V1a` |",
    ].join("\n"),
    registryText: "| `loom/parse/foo-bad` | E | msg |",
    testSources: [{ path: "t.test.ts", text: "// FOO-1 cited\n loom/parse/foo-bad" }],
    srcSources: [{ path: "s.ts", text: srcText }],
  });

  const arm = (srcText: string): Finding[] =>
    (runClosingGate(corpus(srcText)) as Finding[]).filter(
      (f) => f.kind === "broad-catch-allow-list-unresolved",
    );

  it("resolves a coverage-matrix REQ-ID, a cka-<n> Token cell, a concrete loom code, and pi-sdk-boundary", () => {
    expect(arm("// allow-broad-catch: FOO-1 — p")).toEqual([]);
    expect(arm("// allow-broad-catch: cka-7 — p")).toEqual([]);
    expect(arm("// allow-broad-catch: loom/parse/foo-bad — p")).toEqual([]);
    expect(arm("// allow-broad-catch: pi-sdk-boundary — p")).toEqual([]);
  });

  it("rejects an unmapped REQ-ID, an unknown cka token, a non-registry loom code, a glob/wildcard, and a bare token", () => {
    expect(arm("// allow-broad-catch: FOO-9 — p")[0]?.subject).toBe("FOO-9");
    expect(arm("// allow-broad-catch: cka-99 — p")[0]?.subject).toBe("cka-99");
    expect(arm("// allow-broad-catch: loom/parse/ghost — p")[0]?.subject).toBe("loom/parse/ghost");
    expect(arm("// allow-broad-catch: loom/host/session-shutdown-* — p")[0]?.subject).toBe("loom/host/session-shutdown-*");
    expect(arm("// allow-broad-catch: bogus — p")[0]?.subject).toBe("bogus");
  });

  it("parseCkaTokens counts each Token cell; resolution requires exactly one match", () => {
    const counts = parseCkaTokens("| `cka-1` | a | b |\n| `cka-2` | c | d |");
    expect(counts.get("cka-1")).toBe(1);
    expect(counts.get("cka-2")).toBe(1);
    expect(counts.has("cka-3")).toBe(false);
  });

  it("extractBroadCatchEntries reads the cited token (first span after the colon) from each comment", () => {
    const entries = extractBroadCatchEntries([
      { path: "s.ts", text: "x; // allow-broad-catch: pi-sdk-boundary — page\ny; // allow-broad-catch: cka-1 — page" },
    ]);
    expect(entries.map((e: { token: string }) => e.token)).toEqual(["pi-sdk-boundary", "cka-1"]);
  });
});

// H5d — transitive-completeness plan-structural arm, running as part of the
// unified closing-gate machinery against seeded fixtures under the same
// dedicated test-fixtures root. The arm reconciles every coverage-matrix
// closing-leaf cell (tokenised by its backtick spans, ranges expanded) against
// H5b's expanded `Deps.` membership and reddens for a cell none of whose listed
// leaves is reachable. Each block cites the conventions.md convention it backs.
describe("H5d — transitive-completeness arm against seeded fixtures", () => {
  it("(Convention: REQ-ID discipline — transitive-completeness) runs green when every closing-leaf cell has at least one listed leaf in the seeded H5b-Deps fixture, including a multi-leaf primary+co-witness cell with exactly one leaf present, a cell carrying parenthetical annotation prose alongside its backtick IDs, and a retired `*(numbered above)*` cell the arm excludes", () => {
    expect(gate("transitive-no-violation")).toEqual([]);
  });

  it("(Convention: REQ-ID discipline — transitive-completeness) fails when a closing-leaf cell names no leaf present in the seeded H5b-Deps fixture", () => {
    const findings = gate("transitive-unreachable");
    expect(kinds(findings)).toEqual(["transitive-completeness-unreachable"]);
    expect(findings[0]?.subject).toBe("`V7z`");
  });
});

describe("H5d — transitive-completeness parsing (unit)", () => {
  it("expandLeafTokens expands a contiguous within-group range by letter suffix and keeps singletons (incl. the no-letter `M`)", () => {
    const set = expandLeafTokens("`M`, `V2a`–`V2d`, `H7a`");
    expect([...set].sort()).toEqual(["H7a", "M", "V2a", "V2b", "V2c", "V2d"]);
  });

  it("expandLeafTokens reads only backtick spans, ignoring surrounding prose (co-witness / facet annotations)", () => {
    const set = expandLeafTokens("`V16a`, `H7a` (co-witness — cross-site never-interleaves integration witness)");
    expect([...set].sort()).toEqual(["H7a", "V16a"]);
  });

  it("parseH5bDeps reads only the `**Deps.**` paragraph, expands its ranges, and ignores leaf IDs cited in surrounding prose", () => {
    const text = [
      "Some prose mentioning `V99z` and `H7a` that must NOT be admitted.",
      "",
      "**Deps.** `H1a`, `H5a`, `M`, `V1a`, `V2a`–`V2e`, `V3b`, `V8d`, `V9m`",
      "",
      "Trailing prose mentioning `V42z` that must NOT be admitted.",
    ].join("\n");
    const deps = parseH5bDeps(text);
    expect(deps.has("V2c")).toBe(true); // from the V2a–V2e range
    expect(deps.has("V9m")).toBe(true);
    expect(deps.has("M")).toBe(true);
    expect(deps.has("V99z")).toBe(false); // prose before the field
    expect(deps.has("V42z")).toBe(false); // prose after the field
    expect(deps.has("H7a")).toBe(false);
  });

  it("parseClosingLeafCells reads the last cell of each row in the two named tables, skips headers, and ignores other sections", () => {
    const text = [
      "## Numbered REQ-IDs (runtime obligations)",
      "| REQ-ID | Closing leaf(s) |",
      "|---|---|",
      "| FOO-1 | `V1a` |",
      "| FOO-2 | `V2c`, `H7a` (co-witness — x) |",
      "",
      "## Code-keyed obligation areas (no numbered REQ-IDs)",
      "| Token | Spec area (prefix) | Closing leaf(s) |",
      "|---|---|---|",
      "| `cka-1` | `foo.md` (FOO) | `V8d` |",
      "| `cka-2` | `bar.md` (BAR) — retired | *(numbered above)* |",
      "",
      "## Governance REQ-IDs (GOV-*) — not runtime obligations",
      "| GOV-1 | `someplace` |",
    ].join("\n");
    expect(parseClosingLeafCells(text)).toEqual([
      "`V1a`",
      "`V2c`, `H7a` (co-witness — x)",
      "`V8d`",
      "*(numbered above)*",
    ]);
  });
});

// H5e — un-anchored normative-MUST text-scan arm, running as part of the
// unified closing-gate machinery against seeded fixtures under the same
// dedicated test-fixtures root (outside docs/spec_topics/** and outside this
// live vitest corpus). The arm spans three sub-recognisers — the un-enumerated-
// MUST, the `<new>`-placeholder-MUST, and the un-rowed-page recogniser — facets
// of one MUST/MUST-NOT token scan over the non-narrative spec pages. Each block
// cites the conventions.md *REQ-ID discipline* convention it operationalises.
describe("H5e — un-anchored-MUST text-scan arm against the seeded no-violation fixture", () => {
  it("(Convention: REQ-ID discipline — un-anchored obligations) runs green: an un-anchored MUST enumerated with a real closing leaf, a hub-stub page excluded from the un-rowed-page defect, and a narrative page out of scope", () => {
    expect(gate("un-anchored-no-violation")).toEqual([]);
  });
});

describe("H5e — un-anchored-MUST text-scan arm against each seeded violation fixture", () => {
  it("(Convention: REQ-ID discipline — un-anchored obligations) fails when an un-anchored MUST is absent from the Code-keyed obligation-areas table", () => {
    const findings = gate("un-enumerated-must");
    expect(kinds(findings)).toEqual(["un-anchored-must-unenumerated"]);
    expect(findings[0]?.subject).toBe("orphan.md");
  });

  it("(Convention: REQ-ID discipline — un-anchored obligations, `<new>` placeholder) fails when an un-anchored MUST maps only to a `<new>` placeholder row naming no real closing leaf", () => {
    const findings = gate("new-placeholder-must");
    expect(kinds(findings)).toEqual(["un-anchored-must-new-placeholder"]);
    expect(findings[0]?.subject).toBe("placeholder.md");
  });

  it("(Convention: REQ-ID discipline — un-rowed page) reddens when a non-hub-stub spec page is absent from the prefix table altogether", () => {
    const findings = gate("un-rowed-page");
    expect(kinds(findings)).toEqual(["un-rowed-page-residue"]);
    expect(findings[0]?.subject).toBe("stray.md");
  });
});

describe("H5e — un-anchored-MUST recogniser parsing (unit)", () => {
  it("parsePrefixTablePages classifies each page by its byte-exact narrative cell and records trailing-slash subtree bindings", () => {
    const { pages, subtrees } = parsePrefixTablePages(
      [
        "## REQ-ID prefix table",
        "| Page | Prefix |",
        "|---|---|",
        "| seam.md | SEAM |",
        "| narr.md | (no IDs — narrative) |",
        "| binder/ | BNDR |",
      ].join("\n"),
    );
    expect(pages.get("seam.md")?.narrative).toBe(false);
    expect(pages.get("narr.md")?.narrative).toBe(true);
    expect(pages.has("binder/")).toBe(false);
    expect(subtrees.has("binder")).toBe(true);
  });

  it("parseCkaAreaRows reads each Code-keyed row's referenced .md pages and its closing-leaf cell, scoped to the named section", () => {
    const rows = parseCkaAreaRows(
      [
        "| REQ-ID | Closing leaf(s) |",
        "|---|---|",
        "| FOO-1 | `V1a` |",
        "",
        "## Code-keyed obligation areas (no numbered REQ-IDs)",
        "| Token | Spec area (prefix) | Closing leaf(s) |",
        "|---|---|---|",
        "| `cka-1` | `lexical.md` (LEX), `grammar.md` (GRAM) | `V1a`, `V1b` |",
        "| `cka-2` | `seam.md` (SEAM) | <new> |",
      ].join("\n"),
    );
    expect(rows).toHaveLength(2);
    expect([...rows[0].pages].sort()).toEqual(["grammar.md", "lexical.md"]);
    expect(rows[0].closing).toBe("`V1a`, `V1b`");
    expect([...rows[1].pages]).toEqual(["seam.md"]);
    expect(rows[1].closing).toBe("<new>");
  });

  it("pageHasUnanchoredMust flags a MUST paragraph with no PREFIX-N / loom code, and clears one anchored by either", () => {
    expect(pageHasUnanchoredMust("The loader MUST reject it.")).toBe(true);
    expect(pageHasUnanchoredMust("**FOO-1.** The loader MUST reject it.")).toBe(false);
    expect(pageHasUnanchoredMust("The loader MUST emit `loom/load/bad`.")).toBe(false);
    expect(pageHasUnanchoredMust("No obligation here, only prose.")).toBe(false);
    // A MUST inside a fenced code block is invisible to the scan.
    expect(pageHasUnanchoredMust("```\nMUST in a fence\n```")).toBe(false);
    // A loom/typecheck/* brand is NOT a registry-code anchor.
    expect(pageHasUnanchoredMust("The build MUST brand `loom/typecheck/x`.")).toBe(true);
  });

  it("classifyClosingCell distinguishes a real plan leaf, the `<new>` placeholder, and a non-resolving token (V99z)", () => {
    const planLeaves = parsePlanLeaves("- `V8a`\n- `H7a`");
    expect(classifyClosingCell("`V8a`", planLeaves)).toBe("resolved");
    expect(classifyClosingCell("`V8a`, `H7a`", planLeaves)).toBe("resolved");
    expect(classifyClosingCell("<new>", planLeaves)).toBe("new-placeholder");
    expect(classifyClosingCell("`V99z`", planLeaves)).toBe("unresolved");
  });

  it("(Convention: REQ-ID discipline — un-anchored obligations, `<new>` placeholder) reddens a non-resolving closing-leaf token (V99z) as a defect rather than a benign placeholder", () => {
    const corpus = {
      prefixTableText: "## REQ-ID prefix table\n| Page | Prefix |\n|---|---|\n| typo.md | TYPO |",
      specSources: [{ path: "spec/typo.md", text: "The loader MUST reject it." }],
      coverageMatrixText: [
        "## Code-keyed obligation areas (no numbered REQ-IDs)",
        "| Token | Spec area (prefix) | Closing leaf(s) |",
        "|---|---|---|",
        "| `cka-1` | `typo.md` (TYPO) | `V99z` |",
      ].join("\n"),
      registryText: "",
      testSources: [],
      planLeavesText: "- `V8a`",
    };
    const findings = runClosingGate(corpus) as Finding[];
    expect(kinds(findings)).toEqual(["un-anchored-must-unresolved-leaf"]);
    expect(findings[0]?.subject).toBe("typo.md");
  });
});

describe("H5a — each returned finding is a structured entry tagged with its gap kind", () => {
  it("every finding carries kind / subject / detail fields", () => {
    for (const scenario of [
      "unmapped-req-id",
      "missing-citing-test",
      "registry-code-no-test",
      "asserted-code-not-in-registry",
    ]) {
      for (const f of gate(scenario)) {
        expect(typeof f.kind).toBe("string");
        expect(f.kind.length).toBeGreaterThan(0);
        expect(typeof f.subject).toBe("string");
        expect(typeof f.detail).toBe("string");
      }
    }
  });
});

// Unit coverage of the gate's reconciliation surfaces and extractors, so each
// arm reds out in isolation rather than only through the assembled fixtures.
describe("H5a — gate reconciliation arms (unit)", () => {
  const prefixTable = [
    "## REQ-ID prefix table",
    "| Page | Prefix |",
    "|---|---|",
    "| foo.md | FOO |",
    "",
    "## Retired REQ-IDs",
    "- FOO-2 (retired)",
  ].join("\n");

  it("parsePrefixTable reads the second column tokens; parseRetiredReqIds reads the retirement section", () => {
    expect(parsePrefixTable(prefixTable)).toEqual(["FOO"]);
    expect(parseRetiredReqIds(prefixTable)).toEqual(["FOO-2"]);
  });

  it("extractReqIds excludes the non-executable GOV family and ignores REQ-IDs inside code spans / fences", () => {
    const sources = [
      {
        path: "p.md",
        text: [
          "**FOO-1.** rule.",
          "**GOV-9.** corpus rule — excluded.",
          "`FOO-9` is in an inline code span and must not extract.",
          "```",
          "FOO-8 inside a fence — excluded.",
          "```",
        ].join("\n"),
      },
    ];
    expect(extractReqIds(sources, ["FOO", "GOV"]).sort()).toEqual(["FOO-1"]);
  });

  it("parseCoverageMatrix expands `X-n … X-m` inclusive ranges and comma lists", () => {
    const text = [
      "| REQ-ID | Closing leaf(s) |",
      "|---|---|",
      "| FOO-1 … FOO-3 | `V1a` |",
      "| BAR-1, BAR-4 | `V1b` |",
    ].join("\n");
    expect(parseCoverageMatrix(text).sort()).toEqual([
      "BAR-1",
      "BAR-4",
      "FOO-1",
      "FOO-2",
      "FOO-3",
    ]);
  });

  it("parseRegistryCodes drops the loom/typecheck/* brand; extractAssertedCodes drops it too", () => {
    expect(
      parseRegistryCodes("| `loom/parse/x` | | `loom/typecheck/brand` |"),
    ).toEqual(["loom/parse/x"]);
    expect(
      extractAssertedCodes([
        { path: "t.test.ts", text: 'a("loom/parse/x"); b("loom/typecheck/brand");' },
      ]),
    ).toEqual(["loom/parse/x"]);
  });

  it("extractCitingReqIds collects inline PREFIX-N citations from test sources", () => {
    expect(
      extractCitingReqIds([{ path: "t.test.ts", text: "// FOO-1 and BAR-2 cited" }]).sort(),
    ).toEqual(["BAR-2", "FOO-1"]);
  });

  it("flags a retired/live ID clash and a per-prefix numbering hole", () => {
    const corpus = {
      prefixTableText: [
        "## REQ-ID prefix table",
        "| Page | Prefix |",
        "|---|---|",
        "| foo.md | FOO |",
        "",
        "## Retired REQ-IDs",
        "- FOO-1",
      ].join("\n"),
      // FOO-1 is retired yet appears live (clash); FOO-2 absent → hole below max 3.
      specSources: [{ path: "foo.md", text: "**FOO-1.** x **FOO-3.** y" }],
      coverageMatrixText: "| REQ-ID | Closing leaf(s) |\n|---|---|\n| FOO-1, FOO-3 | `V1a` |",
      registryText: "",
      testSources: [{ path: "t.test.ts", text: "// FOO-1 FOO-3" }],
    };
    const findings = runClosingGate(corpus) as Finding[];
    expect(kinds(findings)).toContain("retired-live-id-clash");
    expect(findings.find((f) => f.kind === "per-prefix-numbering-hole")?.subject).toBe(
      "FOO-2",
    );
  });
});
