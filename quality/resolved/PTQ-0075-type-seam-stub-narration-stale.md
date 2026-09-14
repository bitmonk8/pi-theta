---
id: PTQ-0075
title: type-compat.ts and type-grammar.ts still narrate their V2b-T/V2a-T tests-task stub state as current ("V2b-T stubs this inert", "the paired V2b engine never returns this", "stubs the two checks as inert no-ops") although every named function is implemented
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-compat.ts:190-193
  - src/parser/type-compat.ts:207-208
  - src/parser/type-compat.ts:542
  - src/parser/type-compat.ts:591
  - src/parser/type-compat.ts:693-694
  - src/parser/type-grammar.ts:98-101
sites: 6
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# type-compat.ts and type-grammar.ts still narrate their V2b-T/V2a-T tests-task stub state as current ("V2b-T stubs this inert", "the paired V2b engine never returns this", "stubs the two checks as inert no-ops") although every named function is implemented

## Observation
Both files were delivered as a tests-task commit (V2b-T 4b71af08 for
type-compat.ts, V2a-T e3ce7c73 for type-grammar.ts) followed by the paired
implementation leaf (V2b b4b8f42b; V2a). Five doc comments in type-compat.ts
and the module-header paragraph of type-grammar.ts still assert the stub
state in present tense: `checkCompatible` "stubs ... as an inert sentinel
returning `"unknown"`", three per-site checkers are "inert (no diagnostics)",
the `"unknown"` variant is a sentinel "the paired V2b engine never returns",
and type-grammar.ts "stubs the two checks as inert no-ops (no diagnostic
produced)". Every one of those claims is contradicted by the function bodies
in the same files.

## Evidence
src/parser/type-compat.ts:190-193 — the `Compatibility` doc's `"unknown"` arm:
```
 *   - `"unknown"`           — the V2b-T stub sentinel. The paired V2b engine
 *                             never returns this; it exists only so every
 *                             relation test reds on its own primary assertion
 *                             (no expected outcome equals `"unknown"`).
```
Counter-evidence: the engine returns `"unknown"` at eight sites —
type-compat.ts:263, :278, :291, :318, :343, :352, :356, :365 (e.g. :365
`return resolveNamedRef(env, sub) === undefined ? "unknown" : "incompatible";`)
— and the module header itself states at :27-28 that an unresolvable operand
"yields `"unknown"`".

src/parser/type-compat.ts:207-208 — `checkCompatible` doc:
```
 * V2b-T stubs this as an inert sentinel returning `"unknown"`; the paired V2b
 * implementation leaf computes the relation.
```
The body at :215 is `return decide(unfoldAlias(sub, env), unfoldAlias(sup, env), env);`.

src/parser/type-compat.ts:542, :591, :693-694 — three checkers carry the same
line:
```
 * V2b-T stubs this inert (no diagnostics); the paired V2b leaf fills it in.
```
Counter-evidence: `checkLetRhsCompat` emits `theta/parse/integer-narrowing`
at :558-568 and `theta/parse/let-rhs-type-mismatch` at :571-583;
`checkFnArgCompat` emits `theta/parse/fn-arg-type-mismatch` at :610-621;
`checkCommonType` emits `theta/parse/array-element-type-mismatch` at :715-725
and `theta/parse/array-no-common-type` at :737-748.

src/parser/type-grammar.ts:98-101 — module header:
```
// V2a-T (tests-task) declares these seam shapes and stubs the two checks as
// inert no-ops (no diagnostic produced) so the failing tests compile and red on
// their own primary assertions (the type-expression parser and sink-resolution
// engine are absent). The paired V2a implementation leaf fills them in.
```
Counter-evidence: the parser and walk in the same file push ten registered
codes (type-grammar.ts:1176, :1501, :1516, :1525, :1591, :1603, :1656, :1674,
:1711, :1734) plus `emptySchemaBodyDiagnostic` at :1548, and `TypeParser`
implements the full tolerant grammar (:590-1290).

## Why this is a problem
Historical narration: each excerpt makes a present-tense claim — the checkers
produce no diagnostics, the relation returns only a sentinel, "the
type-expression parser and sink-resolution engine are absent" — that is false
against the code directly beneath it, and in the `"unknown"` case actively
misdescribes a live semantic (the deferral outcome every per-site checker
branches on at `r === "compatible" || r === "unknown"`). Git shows the paired
leaves landed (V2b-T 4b71af08 → V2b b4b8f42b, which added `decide`; V2a-T
e3ce7c73 → V2a). type-compat.ts's own header was partially retensed ("V2b
implements the decision procedure", :24), so the surviving stub lines are the
exception, not the convention. The sibling findings for this decay
(qw20260907183353-d2-03-seam-stub-narration-stale-lexer-parser,
qw20260907183353-d2-07-parser-seam-stub-narration-stale, and the three
qw20260907130901 stale-tests-task findings) cite neither of these two files —
the d2-03 finding's scope check explicitly names parser/type-grammar.ts:99 as
outside its brief.

## Suggested direction (non-binding, optional)
Retense or drop the stub-era sentences the way the same file's header
sentence at :24 and bindings.ts's header already do — state what the module
owns now (including `"unknown"`'s real unresolvable-operand meaning) and
leave the tests-task/leaf split to git history.

## False-positive check
- Verified each narrated absence is present in current code: `checkCompatible`
  delegates to `decide` (:215); `decide` returns all four `Compatibility`
  values (:263-:365); the three checkers emit their registered codes
  (:558-583, :610-621, :715-748); type-grammar.ts emits eleven distinct
  `theta/parse/*` codes (:1176-:1734).
- `"unknown"` reachability: `decide` returns it at :263, :278, :291, :318,
  :343, :352, :356, :365; consumers read it as the deferral arm
  (type-compat.ts:553, :604, :652, :711, :945, :1001) — so the "never returns
  this" sentence is false, not merely dated.
- Git intent check: `git log --all -S "V2b-T stubs this inert" --
  src/parser/type-compat.ts` → only 4b71af08 (the tests task);
  `git log --all -S "function decide" -- src/parser/type-compat.ts` →
  b4b8f42b (V2b) implemented the engine without retensing the stub lines.
  V2a-T header landed in e3ce7c73.
- Duplicate check: the already-filed stale-stub-narration findings
  (qw20260907130901-d2-01/-05/-08/-09, qw20260907183353-d2-03/-07) list
  locations in src/binder/, src/extension/, src/discovery/, src/diagnostics/,
  src/seams/, src/runtime/, src/mvp/, src/lexer/, and seven OTHER src/parser
  files; none cites type-compat.ts or type-grammar.ts, and d2-03's scope
  check names type-grammar.ts:99 as deliberately unfiled there.
- Not a deadness claim: every function narrated as a stub has production
  callers (type-layer-checks.ts, theta-document.ts, params.ts,
  static-type-inference.ts and others, verified by repo-wide grep).

## Triage
verdict: confirmed — all 6 excerpts byte-match at the cited lines (grep reproduces :190, :207, :542, :591, :693, type-grammar.ts:98) and every narrated absence is refuted inside the same file: `decide` returns `"unknown"` at exactly :263/:278/:291/:318/:343/:352/:356/:365 while :190-193 calls it a sentinel "the paired V2b engine never returns" — contradicting the file's own header at :27-28 — `checkCompatible` delegates to `decide` at :215, the three "inert (no diagnostics)" checkers emit at :564/:575, :613 and :718/:740, and type-grammar.ts:98-101's "the type-expression parser and sink-resolution engine are absent" sits above `class TypeParser` (:571) with ten `theta/parse/*` pushes (:1176-:1734) plus `emptySchemaBodyDiagnostic` (:1548); git confirms 4b71af08→b4b8f42b and e3ce7c73, bindings.ts:25-26 shows the past-tense landed-pair convention so this is leftover scaffolding not house style, every function has production callers (type-layer-checks.ts, invoke-static-checks.ts, params.ts, schema-subset-gate.ts) so it is not a deadness claim, and the six locations are disjoint from d2-03/d2-07 and the three qw20260907130901 stub-narration filings (d2-03 explicitly defers type-grammar.ts:99) and from the type-compat/type-grammar citation-drift filings (triage: claude-opus-5)
