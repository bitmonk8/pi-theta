# Closing-gate seeded fixtures (H5a)

A dedicated test-fixtures root for the [`H5a`](../../docs/plan_topics/H5a-closing-gate-automation.md)
REQ-ID / diagnostic-code closing gate. It sits **outside** `docs/spec_topics/**`
and **outside** the live vitest corpus (`tests/**/*.test.ts`, `src/**/*.test.ts`)
by design: these fixtures exist to drive the gate's pass/fail evaluation, and
several of them exist permanently to *fail* their gate arm. The gate's live-mode
path selection (owned by `H6a`) reconciles the live spec/test corpus exclusive of
this root, so no seeded fixture is ever scanned as live coverage.

Each scenario directory uses the conventional closing-gate corpus layout the
`loadCorpus` loader reads:

- `governance.md` — REQ-ID prefix table + `## Retired REQ-IDs` section.
- `spec/**/*.md` — spec pages carrying `**PREFIX-N.**` anchors.
- `coverage-matrix.md` — the `| REQ-ID | Closing leaf(s) |` mapping table, plus
  (for the H5c arm) the `## Code-keyed obligation areas (no numbered REQ-IDs)`
  table whose leading *Token* column carries `cka-<n>` tokens.
- `registry.md` — the diagnostics registry table(s).
- `tests/**/*.test.ts` — the seeded test corpus (citing REQ-IDs / asserting codes).
  These are fixture data, not live tests, and are never collected by vitest.
- `src/**/*.ts` — (for the H5c arm) seeded production-shaped sources carrying
  `// allow-broad-catch: <token> — <spec-page>` comments. These are fixture data
  outside the gated `src/**` tree, so their broad `catch` clauses are never linted.
- `h5b-deps.md` — (for the H5d arm) a snapshot of H5b's `Deps.` field. The
  transitive-completeness arm parses only the `**Deps.**` paragraph (the same
  `parseH5bDeps` reader it runs against the live H5b page) and expands its
  contiguous within-group `<group><letter>` ranges. Absent in the H5a/H5c
  scenarios, which leaves the transitive-completeness arm dormant for them.
- `plan-leaves.md` — (for the H5e arm) a snapshot of the real plan leaf-ID
  universe (the fixture stand-in for the live `docs/plan_topics/` leaf-ID set).
  The un-anchored-MUST arm resolves each Code-keyed closing-leaf token against
  the backtick-delimited leaf IDs listed here. Absent in the H5a/H5c/H5d
  scenarios, which leaves the un-anchored-MUST arm dormant for them.
- `h5f-enabled.md` — (for the H5f arm) a marker file whose mere presence flips
  `loadCorpus`'s `perFacetCitingTests` flag on, enabling the per-facet citing-
  test arm for that scenario. Absent in every other scenario, which leaves the
  per-facet arm dormant for them.

Scenarios:

- `no-violation/` — every arm green. Includes a mapped numbered REQ-ID whose
  citing test is present, and a `loom/typecheck/*` brand whose absence of an
  asserting test must NOT fire (the registry-reconciliation carve-out).
- `unmapped-req-id/` — a spec REQ-ID with no coverage-matrix row.
- `terminology-req-id-excluded/` — a page whose `FRNT` prefix anchors BOTH a
  runtime REQ-ID (`FRNT-1`, mapped + cited) and a terminology REQ-ID (`FRNT-2`,
  unmapped). The per-ID `NON_EXECUTABLE_REQ_IDS` carve-out drops only `FRNT-2`
  from the executable set, so the scenario is green; a per-PREFIX exclusion would
  wrongly drop runtime `FRNT-1` too. Exercises the terminology-REQ-ID exclusion.
- `missing-citing-test/` — a coverage-matrix-mapped REQ-ID with no citing test.
- `registry-code-no-test/` — a registry code with no asserting test.
- `asserted-code-not-in-registry/` — a test asserts a code absent from registry.
- `broad-catch-no-violation/` — (H5c) every `// allow-broad-catch:` entry cites
  an admitted token: a coverage-matrix REQ-ID, an exactly-one `cka-<n>` Token
  cell, a concrete `loom/...` registry code, and `pi-sdk-boundary`.
- `broad-catch-unresolved/` — (H5c) an entry cites a `loom/...` glob/wildcard
  family the concrete-registry-code resolver never matches.
- `transitive-no-violation/` — (H5d) every coverage-matrix closing-leaf cell has
  at least one listed leaf in the seeded `h5b-deps.md`, including a multi-leaf
  primary + co-witness cell with exactly one leaf present (the co-witness `H7a`
  intentionally absent from `Deps.`), a cell carrying parenthetical facet
  annotation prose alongside its backtick IDs, a `<new>` placeholder cell, and a
  retired `*(numbered above)*` cell — both excluded from the at-least-one check.
- `transitive-unreachable/` — (H5d) one closing-leaf cell names a leaf (`V7z`)
  absent from the seeded `h5b-deps.md` `Deps.` membership; the row stays mapped
  and cited, so only the transitive-completeness arm reds out.
- `un-anchored-no-violation/` — (H5e) every un-anchored-MUST recogniser green:
  a non-narrative page (`seam.md`) whose un-anchored MUST is enumerated in the
  *Code-keyed obligation areas* table with a real closing leaf, a GOV-24
  hub-stub page (`binder.md`) absent from the prefix table yet excluded from the
  un-rowed-page defect because its stem matches the `binder/` subtree row, and a
  narrative page (`narr.md`) out of scope by its byte-exact narrative cell.
- `un-enumerated-must/` — (H5e) a non-narrative page (`orphan.md`) carries an
  un-anchored MUST that no *Code-keyed obligation areas* row enumerates.
- `new-placeholder-must/` — (H5e) a non-narrative page (`placeholder.md`) whose
  un-anchored MUST maps only to a `<new>` placeholder row naming no real leaf.
- `un-rowed-page/` — (H5e) a non-hub-stub spec-shaped page (`stray.md`) absent
  from the prefix table altogether (no `stray/` subtree row), an un-rowed-page
  residue defect. (The non-resolving-token case — a closing-leaf token like
  `V99z` resolving to no real plan leaf — is exercised by an inline unit corpus
  in `tests/closing-gate.test.ts` rather than a fixture directory.)
- `per-facet-no-violation/` — (H5f) every facet leaf of every multi-leaf row
  carries its own facet-naming citing test: a *Numbered REQ-IDs* row (`FOO-1`)
  whose co-witness-annotated `H7a` leaf is correctly excluded from the facet
  partition (leaving the single facet `V1a`), a two-facet numbered row (`FOO-2` →
  `V2c`, `V3b`), a two-facet *Code-keyed obligation areas* row (`cka-1` → `V5a`,
  `V5b`), and a single-leaf row (`BAR-1`) out of per-facet scope.
- `per-facet-violation/` — (H5f) the same corpus with one facet's citing test
  removed: the `cka-1` row's facet `V5b` carries no test citing both `cka-1` and
  `V5b` inline, so only the per-facet arm reds out (subject `V5b`).
