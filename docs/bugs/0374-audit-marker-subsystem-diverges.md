# Bug 0374 — The published audit's exemption-marker subsystem diverges from the pinned rules on three axes: the multi-line originating-line rules (ii)/(iii) are not honoured (a spec-placed marker draws a violation; the spec-malformed placement is what actually authorises), stale sub-kinds (s1)/(s2) never fire, and malformed clauses (a)–(g) collapse onto one `malformed-grammar` symptom token

- **Status:** fixed (0.382.0).
- **Sev/Diff estimate:** S3/D2 — S3: build-time gate only. Today's tree
  carries three `// allow-pi-surface:` markers
  (`src/extension/production-composition.ts:38`,
  `src/extension/production-subagent-host.ts:32`,
  `src/seams/pi-file-system.ts:21`); none of their symbols is in
  `SDK_SURFACE_INVENTORY`, and all three sit on shapes the current
  attribution handles (single-line import ×2, rule-(iv) per-symbol multi-line
  ×1), so no live red/green is currently wrong. But the divergence is
  bidirectional the moment a marker is authored: a contributor following the
  spec's pinned placement for a multi-line `ctx` chain or named import gets an
  unclearable violation, while the placement the spec declares malformed
  (clause (e)) silently authorises; and stale markers can outlive their
  surface forever, which is the outcome the (s1)/(s2) discriminators exist to
  prevent. D2: line-attribution changes in pass 3 plus a real clause-keyed
  classifier and two stale passes.
- **Kind:** defect — test infrastructure; published-audit obligations
  (audit-resolution.md, audit-failures.md) not met by the shipped subsystem.
  The pass-2 comment acknowledges deferring (s1) and stale sub-kinds — a
  documented divergence in code is still a divergence against a page whose
  obligations bind on publication.
- **Related:**
  - Sibling report 03 (this campaign) — family-(4) shape detection gaps in
    the same module; independent mechanism.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/extension/inventory-closure-audit.ts:435/443/451` — pass-3 reference
    line attribution: category-(1) and category-(3) member accesses AND
    typebox `Type.<member>` accesses all use `n.name.getStart(sf)` (the
    property identifier), and category-(2) import specifiers use
    `el.getStart(sf)` (the symbol line). Correct for spec rules (i)/(iv);
    wrong for (iii) (ctx chains key on the `ctx` identifier line) and missing
    for (ii) (an import-keyword-line marker authorises the declaration).
  - `src/extension/inventory-closure-audit.ts:161-185` (`classifyMarker`) —
    binary well-formed/malformed verdict; clauses (a)–(g) all route to the
    single symptom `malformed-grammar` at `:487-495`; clause (h) has its own
    token (correct).
  - `src/extension/inventory-closure-audit.ts:466-501` (pass 2) — markers are
    scanned only on lines already carrying a reference or family-(4) shape,
    so (s1) no-surface-on-line markers are never classified, and a
    well-formed marker on an all-resolved line is added to `authorisedLines`
    with no (s2) record.

## Summary

Three pinned rule clusters, one subsystem:

1. **Originating line (audit-resolution.md §Multi-line surface placement).**
   Rule (iii): for a `ctx`-rooted chain split across lines "the originating
   line is the line of the `ctx` identifier itself, not the line of any
   property identifier in the chain — the asymmetry with (i) is deliberate
   and … a contributor authorising a runtime-passed `ctx`-rooted chain MUST
   place the marker on the `ctx` line". Rule (ii): a marker trailing the
   `import`-keyword line authorises every imported symbol; (iv) per-symbol
   placement "is an alternative the audit MUST accept alongside the (ii)
   import-keyword placement". audit-failures.md:12 (§Failure-surface
   contract) additionally pins a per-multi-line-placement-shape fixture floor
   — "at least one negative-test fixture per multi-line surface-placement
   shape … exercising the originating-line rule for each shape" — and the
   gate suite carries no such fixture for the (ii)/(iii) placements.
2. **Stale sub-kinds (audit-failures.md §Stale sub-kinds).** "The audit MUST
   surface every stale marker under family (5) with a stable `<symptom>`
   token per sub-kind": (s1) no-surface-on-line, (s2) all-in-inventory.
3. **Per-clause malformed tokens (audit-failures.md §Malformed-marker
   discriminator — family-(5) routing).** "routing **each** violating clause
   (a)–(h) to its **own** stable `<symptom>` token … with no collapsing of
   clauses onto a shared token", plus one negative-test fixture per token
   (ten family-(5) tokens total).

## Reproduction

Scratch probe (deleted; vitest, offline) through the exported
`runInventoryClosureAudit` with the production inventory:

- `void ctx // allow-pi-surface: PIC#audit-exemption-mechanism — probe justification`
  `\n    .definitelyNotInInventory;` (marker on the `ctx` line, rule (iii))
  → observed `audit/violation/ctx-member/off-inventory src/x.ts:4
  definitelyNotInInventory` — the spec-pinned placement does not authorise.
  (Conversely a marker trailing the property line — clause-(e)-malformed per
  spec — lands on the ref's attributed line and authorises.)
- `import { // allow-pi-surface: … — probe justification`
  `\n  SomethingNotInInventory,\n} from "@earendil-works/pi-coding-agent";`
  (rule (ii)) → observed `audit/violation/peer-import/off-inventory
  src/x.ts:2 …#SomethingNotInInventory` — the import-keyword placement does
  not authorise.
- Markers violating clause (a) (missing colon), clause (c) (en-dash
  separator), clause (d) (justification `ok`) on off-inventory `pi.<member>`
  lines → all three emit
  `audit/violation/stale-or-malformed-marker/malformed-grammar` — one shared
  token (dual emission of the underlying ref does work).
- Well-formed marker on `pi.getFlag("theta")` (resolves via inventory) →
  zero records (spec: (s2) all-in-inventory must fire).
- Well-formed marker on a standalone comment line → zero records (spec: (s1)
  no-surface-on-line must fire).

## Expected behaviour

Rules quoted above: (iii)/(ii) placements authorise; property-line placement
on a ctx chain is clause-(e) malformed; (s1)/(s2) each fire under their own
stable token; clauses (a)–(h) each carry a distinct token with a fixture per
token.

## Actual behaviour / root cause

Line attribution is uniformly "the identifier that names the member/symbol",
with no per-shape originating-line map; `classifyMarker` returns a binary
verdict so per-clause routing is structurally impossible; pass 2's scan set
(`referenceLines ∪ familyFourLines`) makes orphan-marker detection
unreachable, and the resolved-ref short-circuit discards the evidence (s2)
needs. The inventory-first resolution order itself is honoured — the
precedence exists precisely to make (s2) mechanically detectable, but the
detection step was never written.

## Why it matters

The marker is the audit's only escape hatch, and its lifecycle rules are what
keep an exemption from outliving or mislocating its justification. As shipped:
spec-conformant marker placement produces false reds a contributor cannot
clear without violating clause (e); stale markers persist silently (the exact
soft surface the spec refuses to accept beyond the two enumerated
limitations); and a CI parser keying per-clause tokens (the contract the spec
pins them for) cannot distinguish any of (a)–(g).

## Non-goals

- Separator tolerance (em-dash vs hyphen-minus) — implemented correctly.
- The malformed-marker dual-emission of the underlying surface — works.
- Clause (h) (marker on a family-(4) line) — has its own token; not
  contested.

## Fix

(1) Attribute each ref a marker-scope line per the four-shape map: cat-(1)
property line (as now), cat-(3) the carrier `ctx` identifier line
(`n.expression.getStart`), cat-(2) both the specifier line and the
declaration's `import`-keyword line (either authorises). (2) Return the
violated clause from `classifyMarker` and mint one token per clause with a
fixture each. (3) Add the two stale passes: scan ALL lines for well-formed
markers; emit (s1) for markers on lines with zero recognised refs, (s2) for
markers whose line's every ref resolved upstream. All three changes are
core-local; the gate test needs the new fixtures only.

## Provenance

Rules extracted from audit-resolution.md / audit-failures.md; every claimed
divergence witnessed mechanically through the exported core (probe deleted).

## Fix (0.382.0)
- What shipped (all in `src/extension/inventory-closure-audit.ts`, gate fixtures in `tests/inventory-closure-audit-gate.test.ts`):
  - Per-shape originating-line map: cat-(1) `pi.<member>` keeps the property line; cat-(3) `ctx.<member>` now attributes to the `ctx` identifier line (`n.expression.getStart`, rule (iii)); cat-(2) named imports attribute to BOTH the specifier line and the declaration's `import`-keyword line (`authLines`, rules (ii)/(iv) — either authorises).
  - `classifyMarker` returns the violated clause; the six grammar clauses (a)-(g minus contextual e) each mint their own family-(5) `<symptom>` token (`missing-colon`, `bad-citation`, `bad-separator`, `bad-justification`, `non-lowercase-keyword`, `block-comment-form`); the placement clause (e) → `off-originating-line`; the family-(4)-line clause (h) → `marker-on-non-exemptible-family-4-line` (already present).
  - Two stale passes over ALL real comment trivia (collected via `getLeadingCommentRanges`/`getTrailingCommentRanges` over `getChildren`, so a `//` quoted inside prose or a block comment is never a candidate): well-formed marker on a line with zero recognised refs → `no-surface-on-line` (s1); marker whose line's every ref resolved upstream → `all-in-inventory` (s2). Ten family-(5) tokens total.
  - Gate test gains one fixture per family-(5) token and one per multi-line surface-placement shape (cat-1/cat-2/cat-3 split + per-symbol placement, exercising the originating-line rule for each).
- Premeasure (the parent's STOP condition): the three real in-tree markers — `production-composition.ts:39` (`VERSION`, rule-(iv) per-symbol line in a multi-line import), `production-subagent-host.ts:32` (`CONFIG_DIR_NAME`), `seams/pi-file-system.ts:21` (`CONFIG_DIR_NAME`, `getAgentDir`) — all sit on UNRESOLVED (non-inventoried) symbols, so under the new attribution + stale passes all three still AUTHORISE (none flips to s1/s2/e). Verified empirically: zero violations over the real walked tree (162 files). No STOP.
- Gates: full default suite `npx vitest run` = 550 files / 10261 tests pass; `tsc --noEmit` exit 0; `eslint` clean; live obligation covered by the same run as 0373 — 0374 is build-time-only (no runtime code path, no registration/drive outcome changes for any input class), so the b0351 typed-query live cell green under lock confirms the shared module did not break runtime plumbing. WHY build-time-only suffices: the audit is a `npm test`-side gate over an in-memory file map; it has no live/registration surface of its own.
- Review: 2 rounds. Round 1 (bug-fix-reviewer): F2 valid-citation-prefix misroute [spec] — fixed (citation regex bounded to the whitespace-delimited slot via `(?=\s|$)`). Round 2 (bug-fix-reviewer-fast): CLEAN.
- Verification: SOLID. cat-3 line-attribution revert reds the `cat-3-ctx-line` placement fixture with the doc's pinned signature (spec-placed marker no longer authorises), restores green; full suite green; typecheck+lint exit 0.
- Residuals:
  1. A marker on a comma-only/brace-only interior line of a multi-line import, or the tail line of a multi-hop chain, routes to (s1) `no-surface-on-line` rather than clause (e) — accepted per this doc's own §Fix routing ("well-formed marker with zero recognised refs → (s1)") and the spec's (s1) placement-error sub-case; both are family-(5) branch-(4) reds, nothing silently authorises. The deliberate (i)/(iii) asymmetry lines (the confusable ones) ARE correctly clause (e).
  2. The clause-(c) separator match tightened from any-whitespace (`\s+`) to literal ASCII space (` +`), aligning code with the pinned grammar ("an ASCII space on each side"); no real marker uses a tab separator (green-on-main holds).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: honoured — separator tolerance (em-dash vs hyphen-minus) unchanged; malformed-marker dual-emission of the underlying surface preserved (a malformed/off-line marker does not add its line to `authorisedLines`, so the underlying family-(1)/(2)/(3) record still fires); clause (h) token unchanged. Note appended for `tests/inventory-closure-audit.test.ts` (a sibling core unit test, not this doc's named surface): two fixtures carried a redundant `// allow-pi-surface:` marker on the inventoried `ExtensionAPI`/`ExtensionContext` carrier import, which the new (s2) rule correctly flags stale; the redundant markers were removed (fixture-input only, assertions untouched) — a DISCLOSED deviation.
