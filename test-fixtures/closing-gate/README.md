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

Scenarios:

- `no-violation/` — every arm green. Includes a mapped numbered REQ-ID whose
  citing test is present, and a `loom/typecheck/*` brand whose absence of an
  asserting test must NOT fire (the registry-reconciliation carve-out).
- `unmapped-req-id/` — a spec REQ-ID with no coverage-matrix row.
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
