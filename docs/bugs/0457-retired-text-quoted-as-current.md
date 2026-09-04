# Bug 0457 — Six committed surfaces quote retired normative text as current: `b0394`'s "BELT MESSAGE SHAPE" header still carries the message tail bug 0439 retired ("did not reject this laundered-receiver site"), and five surfaces — three test headers, a parser comment, and the `fn-param-not-identifier` registry Trigger — still quote `FnParam ::= Ident ":" Type` after bug 0150's route-2 relaxation made the annotation optional (`FnParam ::= Ident (":" Type)?`)

- **Status:** open.
- **Sev/Diff estimate:** S5/D1 — S5: comment/prose drift, but unlike a
  shifted line number each instance QUOTES retired text as the current
  contract ("the assertions align to it; the implementer matches it";
  "THE RULE. `FnParam ::= Ident ":" Type`"), so a reader trusts a
  production or message template the tree no longer ships — the semantic
  half of the 0405/0421 sweep class, precedented as fix-worthy by 0419
  (b0366 header) and by 0421's `fn-param-list-unclosed:14–15` clause
  rewrite. D1: one-clause quote refreshes; no matcher, verdict, or
  registry *Message* cell moves (the registry instance is *Trigger*
  prose, outside DIAG-4's freeze — DIAG-4 binds *Message* only,
  `diagnostic-shape.md:74`). Instance 6 (the registry Trigger) is the
  strongest instance, argued in-body — not a Sev lift: nothing is
  emitted, and S4 in this corpus is reserved for a diagnostic that lies
  to a user at runtime (0439's own class).
- **Kind:** test-infrastructure / doc drift — no assertion is
  load-bearing on any quoted text (verified per instance below), but
  each header is the explanation a debugging session reads first.
- **Related:**
  - 0439 (fixed 0.418.0) — retired the belt-message tail; its §Fix
    Residual 1 names instance 1 verbatim: "R1 [prose]:
    `tests/b0394-stdlib-wrong-kind-args-belt.test.ts:56` — the 'BELT
    MESSAGE SHAPE' header comment still quotes the retired tail (`did
    not reject this laundered-receiver site`). Non-blocking: that file's
    assertion (`:286`) is head-only and green. Not edited (sibling
    closed-bug witness, comment-only) — follow-up-sweep material."
  - 0421 (fixed 0.427.0) — §Fix Residual 2 and §Non-goals name the
    `FnParam` quote set: "Quote-shape drift (`FnParam ::= Ident ":"
    Type` vs current `Ident (":" Type)?`; the reduced `FnDecl` quote at
    fn-param-list-unclosed:13) — different commit/class, deferred to a
    quote-drift sweep per §Non-goals." This report is that sweep.
  - 0405 (fixed 0.415.0) — §Non-goals names the registry instance: "the
    registry row `code-registry-parse.md:26`'s quoted pre-0150 shape
    `FnParam ::= Ident ":" Type` — … the row compensates in prose; noted
    for the sweeping fixer, not claimed here."
  - 0150 (fixed 0.177.0) — the retiring commit for the `FnParam` quote:
    adjudicated route 2 relaxed both normative mirrors to
    `FnParam ::= Ident (":" Type)?` (spec truth today:
    `docs/spec_topics/grammar.md:145`).
  - 0419 (fixed) — the semantic-quote-drift filing precedent (b0366
    header quoting a reversed design brief), "same follow-on lane" per
    0421 §Related.
  - 0394/0402 (fixed) — authored/widened the belt whose message 0439
    reworded; the header's quote was true at 0394's scope.
- **Affected** (every quote verified byte-exact at `401a425b`, v0.437.0):
  - Truth lines:
    - `src/runtime/runtime-panics.ts:509` — the current template:
      `` `internal defect: stdlib method '${method}' argument ${argIndex} expects ${expectedKind}, got ${summariseNonResultOperand(actual)}; the parse-time stdlib-arg-type-mismatch gate covers only statically-resolvable mismatches, so this site's argument reached the runtime belt unjudged (bugs 0394/0402)` ``.
    - `docs/spec_topics/grammar.md:145` —
      `` FnParam      ::= Ident (":" Type)? ``.
  - 1. `tests/b0394-stdlib-wrong-kind-args-belt.test.ts:54–57` — "BELT
    MESSAGE SHAPE (the assertions align to it; the implementer matches
    it): / the kind defect body is `internal defect: stdlib method
    '<method>' argument / <i> expects a <kind>, got <actual>; …did not
    reject this laundered-receiver / site (bug 0394)` with <kind> ∈
    {string, integer, array}, and". The quoted tail was retired by
    0439; "the implementer matches it" is false of the tail. The file's
    matcher (`:286`, `/stdlib method '\w+' argument \d+ expects an?
    (string|integer|array)/`) is head-only, so the file is green — the
    lie is narration-only. (`tests/b0439-kind-belt-message-honesty.test.ts`'s
    mentions of the retired tail at `:3`/`:16`/`:264` are intentional —
    fork narration and absent-token assertions — NOT instances.)
  - 2. `tests/fn-param-list-unclosed.test.ts:18` — "`FnParam ::= Ident
    ":" Type` (grammar.md:145), derives no `{`, no" — quotes the
    pre-0150 production against a line cite (`:145`, current) that holds
    the optional form. The derivation claim itself survives the
    relaxation; only the quote is retired.
  - 3. `tests/fn-param-name-reserved-keyword.test.ts:26–27` — "`FnParam
    ::= Ident ":" Type` (docs/reference/grammar.md:254, /
    docs/spec_topics/grammar.md:145), the same `Ident` terminal…" —
    same retired quote; the spec-side cite (`:145`) is current, the
    reference-side cite (`:254` — now unrelated prose; the mirror sits
    at `docs/reference/grammar.md:318` — the `:301` number
    `fn-param-not-identifier.test.ts:17` carries is itself drifted,
    `:301` holds `ParForBody` prose) is reference-side drift, noted not
    claimed (0405/0421 §Non-goals).
  - 4. `tests/fn-param-not-identifier.test.ts:15` — "THE RULE. `FnParam
    ::= Ident ":" Type` — symbol `FnParam`, the third line of" — asserts
    the retired quote as THE RULE (its `:16` cite `grammar.md:145` is
    current — this file's line cites were 0405-swept; the quote was
    outside that sweep's scope).
  - 5. `src/parser/theta-document.ts:3178` — "// `FnParam ::= Ident ":"
    Type` (grammar.md) derives an `Ident` at this" — parser source
    comment at the `fn-param-not-identifier` emission site; the
    `Ident`-at-name-position claim survives, the quote is retired.
  - 6. `docs/spec_topics/diagnostics/code-registry-parse.md:26` — the
    `theta/parse/fn-param-not-identifier` row's *Trigger*: "a shape
    `FnParam ::= Ident ":" Type` derives from no reading" — normative
    registry prose quoting the retired production. The row compensates
    later in the same cell ("An `Ident` at the same position with no
    `":" Type` annotation is not judged by this row.") — compensation,
    not correction: the quoted production text misstates
    `grammar.md:145`.
  - Adjacent (fenced, fixer's option): `tests/fn-param-list-unclosed.test.ts:13`
    quotes the reduced `FnDecl ::= "fn" Ident "(" FnParams? ")" (":"
    ReturnType)? FnBody`, but 0421's fix appended the in-sentence caveat
    "— the spec production now carries `SubagentMod?` and `WithClause?`
    too, theta-1.2 slots the fn-unclosed rule does not exercise", so the
    sentence as a whole is true; normalising the quote is optional.
  - Verified NON-instances: `tests/fn-param-annotation-optional.test.ts:10`
    ("Bug 0150 — both normative grammar mirrors write `FnParam ::= Ident
    ":" Type`, yet…" — era narration of the pre-fix state, with the
    adjudicated route stated below it);
    `tests/live/fn-param-annotation-optional-live-cell.test.ts:84` ("any
    fix that enforces `FnParam ::= Ident ":" Type` (route 1) reds it
    twice" — counterfactual naming the rejected route); era-pinned
    `docs/bugs/**`.
- **Observed at:** v0.437.0 (`401a425b`), documentary — corpus grep for
  the retired belt tail (`did not reject this laundered-receiver site`)
  and the retired production (`FnParam ::= Ident ":" Type`, excluding the
  optional-form spelling) over `tests/`, `src/`, `docs/spec_topics/`,
  `docs/reference/`; every hit adjudicated at the pin; truth lines read
  at the pin.

## Summary

Two identified fixes retired normative text — bug 0150 (0.177.0) relaxed
`FnParam` to an optional annotation in both grammar mirrors, and bug 0439
(0.418.0) reworded the wrong-kind belt's false laundering diagnosis — and
six surfaces still quote the pre-fix text as the current contract. The
belt instance affirmatively claims "the implementer matches it" about a
template the implementer no longer ships; the `FnParam` instances state
"THE RULE" with a production neither mirror has carried for ~260
versions, one of them inside the diagnostic registry's own *Trigger*
prose. Each owning fix record named its instances as follow-up-sweep
material (0439 R1; 0421 R2/§Non-goals; 0405 §Non-goals); no sweep was
filed.

## Reproduction

```
grep -rn "laundered-receiver" tests/b0394-stdlib-wrong-kind-args-belt.test.ts tests/b0439-kind-belt-message-honesty.test.ts
# b0394:56 (the lying header — the retired tail is LINE-WRAPPED across :56–57,
# so a full-phrase grep misses it) + b0394:151 (a 0315-scenario reference, not
# the tail) + b0439:3/:16/:264 (intentional fork narration / absent-assertions)
sed -n '509p' src/runtime/runtime-panics.ts   # current tail: "…reached the runtime belt unjudged (bugs 0394/0402)"
grep -rn 'FnParam ::= Ident ":" Type' tests/ src/ docs/spec_topics/ docs/reference/ | grep -v '(":" Type)?'
# the six instances + the two era-framed non-instances
sed -n '145p' docs/spec_topics/grammar.md     # FnParam      ::= Ident (":" Type)?
```

## Expected behaviour

A header that quotes a message template or grammar production and asserts
alignment ("the assertions align to it; the implementer matches it",
"THE RULE") quotes the current text — the standard 0421's
`fn-param-list-unclosed:14–15` rewrite and 0419's b0366-header fix
applied to the identical situation. Registry *Trigger* prose states the
production the grammar page carries (`docs/STYLE.md` §Claims: every claim
is testable; a quote is a claim about the quoted source).

## Actual behaviour / root cause

0439's lane declined to edit a sibling closed-bug witness for a
comment-only fix (recorded as R1); 0421's lane was scoped to citation
NUMBERS and explicitly deferred quote TEXT to "a quote-drift sweep";
0405 likewise noted the registry row and did not claim it. No gate reads
quoted text against its source (the citation-symbol-form gate checks
symbols, not quotes), so the class has no failure signal.

## Why it matters

- Impact class 4-adjacent (a narration that lies about a diagnostic): a
  developer matching the b0394 header's template against an observed
  abort finds the tails disagree and concludes the belt regressed — the
  header sends them diffing the wrong thing.
- The registry instance is normative-surface: `code-registry-parse.md`
  is where a reader verifies a production claim, and its *Trigger*
  quotes a shape the grammar page contradicts eleven lines of prose
  later.
- Retired-text quotes compound: each future reword adds instances unless
  the sweep lands and the convention (quote-or-cite, not both stale) is
  visible in the record.

## Non-goals

- The belt's behaviour, message bytes, and the b0394/b0402/b0439
  witnesses' assertions (all green, all head-only or
  current-tail-locked; nothing behavioural moves).
- The registry row's *Message* cell (DIAG-4-frozen; the instance is
  *Trigger* prose only).
- Line-number drift ([bug 0456](./0456-imports-and-lpa-stale-line-cites.md)'s class) — instance 3's
  stale `docs/reference/grammar.md:254` cite half is noted there-adjacent
  but is reference-side (0405/0421 §Non-goals, separate audit).
- Era-framed narrations of pre-fix states (the two
  `fn-param-annotation-optional` files; era-pinned `docs/bugs/**`).

## Fix

One comment/prose sweep, six one-clause edits:

1. `b0394-…:54–57`: truncate the header's quote at the head (the part
   the `:286` head-only matcher actually reads) with "tail per bug
   0439" — preferred over re-quoting the current shipped tail
   (runtime-panics.ts:509), which duplicates a long template that will
   drift again. Witness constraints, binding: the header must NOT
   re-quote the retired tail anywhere — the tail-ABSENCE assertion is
   `tests/b0439-kind-belt-message-honesty.test.ts:264–273`
   (`assertLaunderingLieGone`, `.not.toContain("laundered-receiver")`)
   and it reads runtime messages, not this comment, but re-quoting the
   retired text re-plants the lie the sweep removes; do not touch
   `b0394-…:286` or any b0439 assertion. Closed-bug-witness
   authorization: comment text alone, matcher untouched.
2. Instances 2–5: `FnParam ::= Ident ":" Type` → `FnParam ::= Ident
   (":" Type)?` (four sites; each surrounding claim already survives the
   optional form, verified above).
3. Instance 6 (`code-registry-parse.md:26` *Trigger*): same one-token
   quote refresh inside the Trigger prose — "a shape `FnParam ::= Ident
   (":" Type)?` derives from no reading" (the claim is about the name
   slot and is unaffected); *Message*/severity/code untouched; DIAG-2
   corpus gate expected tolerant (prose-only, no code/template change) —
   verify against `tests/registry-closed-set-corpus-gate.test.ts` and
   the b0405/b0421 content-anchored cells before landing.
   Alternative — leave the row and rely on its compensating sentence —
   rejected: the compensation states the consequence, not the
   production, and the quote remains a false claim about
   `grammar.md:145`.
   Optionally normalise the fenced `FnDecl` quote
   (`fn-param-list-unclosed:13`) in the same pass.

Witness: a small content gate asserting (a) the retired belt tail
appears in no `tests/**`/`src/**` comment outside `b0439-…` (whose uses
assert absence), and (b) every non-era-framed `FnParam ::=` quote in the
enforced scope matches `grammar.md:145`'s current text — red today at
the six sites.

## Provenance

Seed 5 of the doc-truthing-6 brief (0439 §Fix Residual 1, fixer-named,
unfiled) widened to the class by 0421 §Fix Residual 2 / §Non-goals and
0405 §Non-goals (both name the `FnParam` quote set for "the sweeping
fixer" / "a quote-drift sweep"; none filed). Corpus greps quoted in
§Reproduction, run at `401a425b`; truth lines read at the pin
(`runtime-panics.ts:500–510`, `grammar.md:138/:144/:145`); non-instances
read in context (`fn-param-annotation-optional.test.ts:8–16`,
`…-live-cell.test.ts:84`, `b0439-…:260–268`). Dup check: README index —
0419 (the b0366 header) is the fixed sibling, its instance disjoint; no
open or candidate report covers any instance here. Siblings: candidate
doc-truthing-6/01 (count-word staleness), doc-truthing-6/02 (line-cite
drift) — disjoint classes over disjoint sites.
