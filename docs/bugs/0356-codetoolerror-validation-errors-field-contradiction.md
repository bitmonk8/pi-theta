# Bug 0356 — Ceiling #4's code-driven row and PIC-1 (c)(ii) describe a `CodeToolError.validation_errors[]` field that `queryerror-variants.md`'s schema does not declare and the implementation does not carry: two normative tables show `Err(CodeToolError { …, validation_errors: [{ schema_keyword: "maxDepth", … }] })` while the variant is `{ kind, message, tool_name, cause }`, and PIC-1's co-fire eligibility predicate for the `code_tool` event reads the non-existent field

- **Status:** fixed (0.371.0).
- **Sev/Diff estimate:** S4/D1 — S4 because the reachable-observable surface is
  documentation truth: the implementation consistently ships the four-field
  variant (matching the owning schema page), so no wrong bytes are emitted;
  the damage is (i) two normative spec tables asserting a breach shape theta
  code cannot `match` (an author following the hard-ceilings table writes
  `CodeToolError { validation_errors, … }` and matches nothing), and (ii)
  PIC-1 (c)(ii)'s eligibility clause for the `code_tool` co-fire surface being
  unevaluable as written (it conditions on `validation_errors[].schema_keyword
  === "maxDepth"`, a field the event's underlying error does not have) — moot
  in V1 only because that site's reachable mask domain is empty. D1: a wording
  fix on three pages (or a variant widening, which would be a GOV-scale
  change; the wording fix matches shipped behaviour).
- **Kind:** spec inconsistency (cross-page). The owning schema page and the
  implementation agree; the hard-ceilings per-boundary table, the
  schema-subset mirror table, and PIC-1 (c)(ii) disagree with them.
- **Related:**
  - 0323 — fixed (0.342.0). Same class: two spec pages stating one closed set
    differently (registry vs canonical probe page).
  - 0350 — fixed (0.344.0). Same class letter: advisory/spec surface teaching
    a shape the implementation does not have.
  - [0202](./0202-parent-depth-walk-counts-carrier-not-wire-depth.md) — fixed
    (0.119.0). Its residual item 5 states "all three sites discard
    `breach.issue` and neither `InvokeInfraError` nor `CodeToolError` carries
    a `path` field" — corroborates the implementation half of this report
    (the variant carries no structured issue); it does not subsume the
    spec-table contradiction.
- **Affected** (verified at `af476df2`, v0.347.0):
  - `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:25` — code-driven row:
    "`Err(CodeToolError { cause: "validation", validation_errors: [{
    schema_keyword: "maxDepth", … }], … })` per [Tool Calls — Failures] and
    [Errors and Results — `CodeToolError`]" — citing as authority the very
    page that declares no such field.
  - `docs/spec_topics/schema-subset.md:55` — mirror row "#3 Tool-call args,
    code-driven": "`Err(CodeToolError { cause: "validation",
    validation_errors: [...], ... })`".
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:102` —
    PIC-1 (c)(ii): "the `code_tool` event when its underlying
    `CodeToolError.cause` is `"validation"` **and the
    `validation_errors[].schema_keyword` is `"maxDepth"`**". The same
    sentence also carries a stale ordinal: it calls the code-driven boundary
    "the fifth row of ceiling #4's per-boundary table" — it is row 3 of 5
    (`ceilings-3-and-4.md:25`; row 5 is the `invoke<T>` return row).
  - `docs/spec_topics/errors-and-results/queryerror-variants.md:160–166` — the
    owning schema: `schema CodeToolError { kind: "code_tool", message: string,
    tool_name: string, cause: "validation" | "execution" | "cancelled" |
    "unknown_tool" }`. No `validation_errors`.
  - `src/runtime/query-error.ts:113–119` — the implementation type: `{ kind,
    message, tool_name, cause }`; `src/runtime/tool-call.ts:610–640`
    (`enforceCodeToolArgDepth`) and `:670–700` (the AJV-rejection builder)
    construct the carrier without issues; the depth `issue` rides the breach
    struct for the emitting site only, never the theta-visible `Err`.
- **Observed at:** `0.347.0` (`af476df2`). Offline; by reading (spec vs spec
  vs implementation type), plus the code-driven builders.

## Summary

Three pages describe ceiling #4's code-driven breach as carrying structured
`validation_errors` (with the canonical `maxDepth` issue) on `CodeToolError`.
The variant's owning page and the shipped type carry no such field: a
code-driven depth breach surfaces as `Err(CodeToolError { kind: "code_tool",
message: "JSON document depth exceeds 5", tool_name, cause: "validation" })`,
distinguishable from any other argument-validation failure only by
string-matching `message`. PIC-1 (c)(ii)'s co-fire eligibility condition for
the `code_tool` event is stated over the missing field, so the clause cannot
be evaluated as written (harmless in V1 solely because the code-driven site's
reachable mask domain is empty — every conforming implementation omits
`masked` there regardless).

## Reproduction

Reading, both directions:

- `rg -n "validation_errors" docs/spec_topics/errors-and-results/queryerror-variants.md`
  — present on `ValidationError` and `InvokeInfraError`'s prose, absent from
  the `CodeToolError` schema block (`:160–166`).
- `rg -n "validation_errors" docs/spec_topics/hard-ceilings/ceilings-3-and-4.md
  docs/spec_topics/schema-subset.md docs/spec_topics/pi-integration-contract/runtime-event-channel.md`
  — the three sites above, each attributing the field to `CodeToolError`.
- `src/runtime/query-error.ts:113–119` and the two builders in
  `src/runtime/tool-call.ts` — no field, no population.

## Expected behaviour

One shape for one surface. Either the owning schema page is right (four
fields) and the two tables + PIC-1 (c)(ii) must be reworded to match — the
tables dropping `validation_errors` from the row (the canonical message +
`cause: "validation"` remain the discriminators), PIC-1 (c)(ii) restating its
eligibility over what the event actually carries — or the variant genuinely
owes the structured issue (giving theta code a `match`-able discriminator for
depth breaches, symmetric with `ValidationError` and with row #1), which is a
variant widening the owning page and implementation would both take under the
GOV rules. `queryerror-variants.md` self-presents as the schema owner
("The full schema for both variants lives in [Errors and Results — QueryError
variants]"), so at minimum the two tables mis-cite their own authority.

## Actual behaviour / root cause

The per-boundary table appears to have been drafted from row #1's
`ValidationError` shape (which does carry `validation_errors`) and carried the
field over to the code-driven row's different carrier; schema-subset.md
mirrors the table (its own text says it "mirrors it with the depth-walk-
specific carrier details"), and PIC-1 (c)(ii) then keyed the `code_tool`
co-fire eligibility on the same phantom field.

## Why it matters

1. The hard-ceilings per-boundary table is the normative routing surface for
   ceiling #4; an author or test writer implementing a `match` from it writes
   an arm that can never bind the field it destructures.
2. PIC-1 is the falsifiability anchor for the whole `masked` contract; one of
   its four co-fire-eligible surface definitions is stated over a field that
   does not exist, so a conformance suite transcribing PIC-1 literally cannot
   implement clause (c)(ii)'s check.
3. Cheap to fix now; expensive later — any future widening of the code-driven
   site's mask domain would force the ambiguity to be resolved under time
   pressure.

## Non-goals

- **The code-driven depth walk's behaviour** — conformant
  (`enforceCodeToolArgDepth`, wire-form walk, canonical message, `Err` to
  theta code).
- **Whether `CodeToolError` SHOULD carry structured issues** — an adjudication
  for the fix, not assumed here.
- **The `masked` domain at the code-driven site** — empty per PIC-1's table;
  unchanged by either resolution.

## Fix

Options:

1. **Reword the three citing sites to the owning schema** (recommended —
   matches shipped behaviour, D1): drop `validation_errors` from the two table
   rows (the surfaces remain fully specified by `cause: "validation"` + the
   canonical message), and restate PIC-1 (c)(ii)'s eligibility as "the
   `code_tool` event when its underlying `CodeToolError.cause` is
   `"validation"` and the failure is the depth walk's (canonical depth
   message)" — or key it off the emitting site, which PIC-1's own per-site
   table already does. In the same (c)(ii) edit, correct the stale ordinal:
   the code-driven boundary is row 3 of 5 in ceiling #4's per-boundary table
   (`ceilings-3-and-4.md:25`), not "the fifth row".
2. **Widen the variant** with an optional `validation_errors` populated at the
   depth/AJV builders — gives authors a structured discriminator, but is a
   `QueryError`-surface change governed by the errors-and-results pages and
   needs its own adjudication.

## Provenance

- Hunt area: hard-ceilings (per-boundary table; PIC-1 masked-set obligations).
- Spec read: `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:25`;
  `docs/spec_topics/schema-subset.md:55`;
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:102`;
  `docs/spec_topics/errors-and-results/queryerror-variants.md:158–170`;
  `docs/spec_topics/tool-calls.md:27–29` (cause enum, no issues field).
- Implementation read at `af476df2`: `src/runtime/query-error.ts:111–119`;
  `src/runtime/tool-call.ts:560–700`.
- No probe needed beyond reading; the divergence is textual and the
  implementation side was verified at the two builder sites.

## Fix (0.371.0)
- What shipped: `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — code-driven row (row 3 of 5) drops the phantom `validation_errors` from its `Err(CodeToolError { … })` shape (§Fix opt 1); `docs/spec_topics/schema-subset.md` — mirror row #3 drops the same field; `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — PIC-1 (c)(ii) restated over what the `code_tool` event actually carries (`CodeToolError.cause` is `"validation"` and the failure is the depth walk's, carrying the canonical message `"JSON document depth exceeds 5"`) and the stale ordinal corrected from "the fifth row" to "the third row". No implementation change (parent adjudication: `queryerror-variants.md`'s four-field variant is right and the code matches it; Option 2 variant-widening rejected).
- Gates: witness (docs-only) — RED at fork = the three sites quoting `Err(CodeToolError { cause: "validation", validation_errors: […], … })` / `validation_errors[].schema_keyword === "maxDepth"` (rg at fork); GREEN = reworded rows agreeing with the owning schema + shipped type. Full suite `npx vitest run` = 550 files / 10232 tests passed (baseline match, zero flips). `npm run typecheck` = exit 0. `npm run lint` = exit 0. Doc-consistency gates (citation-symbol-form, cross-cutting-gates, b0357 doc-comment-anchors, registry-closed-set-corpus) = 49/49 passed.
- Review: docs-only reword under a settled parent adjudication; no reviewer/fixer rounds dispatched (no executable line, no assertion, no fixture touched — proportionate to a three-row prose reword). Self-verified by direct string-flip search (no test asserts the changed strings) + full-suite backstop.
- Verification: witness both directions established (contradictory text at fork vs. schema-agreeing text after). Full default suite green. Live witness: `tests/live/fn-call-arity-live-cell.test.ts` (adjacent code-driven `<name>(args)` boundary — the surface the reworded rows describe) driven under the shared live lock = 1/1 passed. Lint + typecheck green.
- Residuals: (1) DISCHARGED AT MERGE by parent-scope widening: `docs/reference/hard-ceilings.md` and `docs/reference/schema-subset.md` each carried the IDENTICAL phantom `validation_errors` on their code-driven `CodeToolError` row; the parent applied the same one-line drop to both mirror rows in this commit (the QueryError/ValidationError rows on those pages legitimately keep the field). Original lane disposition: the mirrors were — NOT named in this bug's §Affected or the parent adjudication (which enumerates exactly three `spec_topics/` sites). Left unedited for parent adjudication rather than silently widening scope into the hand-maintained reference-doc layer under parallel-lane contention (evidence: `rg "validation_errors" docs/reference/{hard-ceilings,schema-subset}.md`; owning schema `queryerror-variants.md:160–166`; impl `src/runtime/query-error.ts:113–119`). Same class, same fix (drop the field) if the parent widens scope.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: no implementation change; no variant widening (Option 2 rejected by parent); `masked` domain at the code-driven site remains empty (unchanged).
