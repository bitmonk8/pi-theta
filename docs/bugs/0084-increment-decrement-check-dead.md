# Bug 0084 — `theta/parse/increment-decrement`'s sole emitter `checkIncrementDecrement` (`bindings.ts:179`) has no `src/` caller, so `--` is silently absorbed by the trailing-operator newline continuation: `while c > 0 { c-- }` loads with zero diagnostics and an empty loop body, and `c--` at statement level evaluates to `2 * c`

- **Status:** fixed (0.71.0). Disposition 1 shipped — the byte-adjacent
  `++` / `--` pair is lexed as one token ahead of the trailing-operator
  continuation test, and the previously callerless `checkIncrementDecrement`
  is called at the prefix and postfix expression-walk hooks, so all four
  measured positions draw `theta/parse/increment-decrement`. See §Fix
  (0.71.0) below.
- **Kind:** defect — a registered `E`-severity parse rule is implemented,
  unit-tested and never wired, and the input it was written to reject is not
  merely accepted but **re-read as a different program**. Two arms differ:
  - `--` produces **no diagnostic at all** at every probed position, because
    the trailing `-` is a newline-continuation trigger
    (`docs/spec_topics/expressions.md:147`) and the second `-` becomes a unary
    minus on the next line's expression.
  - `++` produces the **wrong code** — `theta/parse/unsupported-feature`
    (`stray '+' in statement position`, `theta-document.ts:1757`) instead of
    the registered `theta/parse/increment-decrement`, with the registered
    *Hint* ("Use `count += 1` / `count -= 1`.") never shown.
- **Related:**
  - 0050 (open) — the pattern template: a registered parse code whose sole
    emitter has no `src/` caller and whose position is unchecked at runtime
    too. Same mechanism, different emitter and different position. There the
    consequence is silent acceptance; here the consequence is silent
    *reinterpretation*, so this is an adjacent input class, not a duplicate.
  - 0072 (open) — the grouped form of the same class (one dead function, three
    dead codes, plus a misdiagnosis under a neighbouring rule). The `++` arm
    here is that report's "rejected with the right severity, the wrong code,
    and a Hint that describes a repair which does not apply" shape.
  - 0063 (open) — covers the *registry-table omission* of the
    `stray '<t>' in statement position` `<construct>` value emitted at
    `theta-document.ts:1757`. That report is about the construct table's
    contents; this report is about `theta/parse/increment-decrement` never
    firing. The two meet at the same emission site and neither subsumes the
    other: filling 0063's construct row would legitimise the wrong code here,
    and wiring this check would remove `++` from that row's population.
  - 0062 (open) — the trailing-trigger table's completeness. It records that
    `trailingTriggers()` implements a bare `=` the spec table omits. The `-`
    continuation this report depends on is spec'd
    (`expressions.md:147`) and correct; the defect is the absent
    increment/decrement rejection ahead of it, not the continuation rule.
- **Affected** (every citation verified at HEAD `07ef0271`, 0.53.0):
  - **The sole emitter** — `checkIncrementDecrement`,
    `src/parser/bindings.ts:179–191`: the `IncrementDecrementOp` input type
    (`:168–171`), the doc comment naming the rule and the registry Hint
    (`:173–178`), the emitted code (`:185`), the registered message
    (`:187`), the registered hint (`:188`).
    `rg -n "checkIncrementDecrement" src/` returns exactly one line — `:179`,
    the definition. Outside `docs/`, the only other references are
    `tests/bindings.test.ts:4` (import), `:26` (comment), `:153` and `:161`
    (two direct calls).
  - **The only other `src/` occurrence of the code string** is the same
    function's own doc comments (`bindings.ts:22`, `:175`).
    `rg -n "increment-decrement" src/` returns three lines, all in
    `bindings.ts`.
  - **The arm that fires instead for `++`** — the stray-punctuation recovery
    in the statement loop, `src/parser/theta-document.ts:1750–1763`: the
    `theta/parse/unsupported-feature` code at `:1757`, the message template at
    `:1760`, and the unconditional `this.advance()` at `:1763` that drops the
    token.
  - **The arm that absorbs `--`** — the trailing-operator newline
    continuation. `-` at end of line continues the statement
    (`expressions.md:147`), so `c--\n<next>` lexes as `c - - <next>` and the
    parser builds a `binary "-"` whose right operand is a second `binary "-"`
    with a `{kind:"null"}` left operand (the unary-minus encoding). Measured
    in §Reproduction.
  - **No runtime backstop.** Nothing downstream re-examines the shape: the
    statement executor (`src/runtime/statement-executor.ts:1690`
    `executeBody`) walks the AST it is given, and the expression evaluator
    folds `c - -c` arithmetically (§Reproduction d1).
  - **The registry row** — `docs/spec_topics/diagnostics/code-registry-parse.md:33`.
    Severity `E`, phase `parse`, *Trigger* "`++` or `--` operator used.",
    *Hint* "Use `count += 1` / `count -= 1`.", *Message*
    `'<op>' operator is not supported`.
  - **The mirrors** — `docs/reference/diagnostics.md:79` (Code/Sev/Phase/Message
    transcription) and `docs/reference/grammar.md:328`, which lists
    ``++``/``--`` among the rejected constructs and names this code.
  - **The spec rules that promise the check** —
    `docs/spec_topics/bindings.md:36` ("`++` and `--` are
    `theta/parse/increment-decrement`. Use `count += 1` / `count -= 1`.") and
    `docs/spec_topics/expressions.md:37`, which lists "Increment / decrement
    (`++`, `--`)" among the unsupported forms.
- **Observed at:** `0.53.0` (`07ef0271`), Windows. Offline and deterministic —
  `parseThetaDocument` and `evaluateSource` through `tests/helpers/e2e-s1.ts`;
  no model, no live provider, no file written.

## Fix (0.71.0)

Disposition 1 of the constraint-pinned §Fix below — "lex the pair, then wire
the emitter" — implemented as written; disposition 2 ("retire the row")
rejected, per the §Fix recommendation, because the behaviour is promised in four
normative places, the emitter is unit-tested green, the repair its Hint names
(`+= 1`) is accepted today (c1), and retirement leaves r7's non-termination
unaddressed. Citations are by symbol.

- **What shipped:**
  - `src/lexer/lexer.ts` — `twoCharOperators()` gains `"++"` and `"--"`.
    **Mechanism chosen: a two-character operator token, not a lexer-level
    lookahead.** That set is consumed by the greedy pair branch of the scan
    loop, so the byte-adjacent pair becomes one `punct` token *during
    scanning* — by construction ahead of `collapseContinuations()`'s
    trailing-trigger test, which is the ordering constraint §Fix names as
    load-bearing for r3, r5 and r7. A lookahead bolted onto the continuation
    test would have had to run at or after that decision. `trailingTriggers()`
    and `leadingTriggers()` are deliberately byte-unchanged: leaving the pair
    out of both is exactly what stops `c--` from swallowing the following
    newline, and it keeps the closed continuation-trigger table
    (`grammar.md` §Newline continuation) untouched.
  - `src/parser/theta-document.ts` — `checkIncrementDecrement` joins the
    existing `./bindings` import (no new module edge, so no new cycle across
    the reviewed `type-layer-checks.ts` → `theta-document.ts` edge) and is
    called from two expression-walk hooks: a new prefix arm in `parseUnary()`
    and a new arm in `parsePostfix()`'s suffix loop, both through the new
    `incrementDecrementOp()` helper, which narrows the token's `string` text to
    `IncrementDecrementOp.op`'s literal union by comparison rather than by a
    cast. Each hook emits, consumes the operator token, and yields the operand
    unlowered — the rejected operator carries no AST node. Consuming it is what
    keeps the pair out of `parseForms`' stray-punctuation recovery, so no
    `theta/parse/unsupported-feature` cascade appears.
  - **Positions covered — all four §Fix names, including r9.** Every
    expression-accepting position funnels through `parseUnary`/`parsePostfix`,
    so statement position (r1–r6), expression position (r10, `let d = c++`),
    loop body (r7 `while`, r8 `for`) and `fn` body (r9) all draw the code. §Fix
    states that "a fix covering only statement position leaves r9 silent"; r9
    is a witness cell in its own right. Review round 1 traced
    `parseHeaderExpression`, `parseBracketedExpression`, `parseArgs`,
    `parseArray`, `parseObjectLiteral` field values, match scrutinee and arm
    bodies, `parseParFor`, `parseInvoke`, `parseWithClause`, `parseReturn`,
    `parseLet` and the reassignment RHS to the same two hooks and probed each.
  - **Adjacency, and one contradiction in §Fix resolved.** §Fix's governing
    rule — "only the byte-adjacent pair with no separating whitespace is the
    operator" — contradicts its own Witness bullet, which lists `a-- b` among
    spellings that must stay accepted, since `a--` *is* byte-adjacent. Resolved
    in favour of the stated rule: `c-- c` and `c --c` emit (cells s3, s4),
    while the whitespace-separated `c - - c` and `c - -c` stay silent
    (cells s1, s2) and remain the accepted spelling for subtraction of a
    negation. This is C-family maximal munch, and it is the only reading that
    does not require recognition to inspect the whitespace *after* the pair —
    which would place recognition at or after the continuation decision, the
    ordering §Fix forbids.
  - **No spec, registry or reference edit — DIAG-2 not engaged.** The
    `theta/parse/increment-decrement` row's *Trigger* ("`++` or `--` operator
    used."), *Message* and *Hint* are accurate and byte-unchanged, as are
    `bindings.md`, `expressions.md`, `docs/reference/diagnostics.md`,
    `docs/reference/grammar.md` and `placeholder-rendering-b.md`'s `<op>`
    extension. The implementation was moved to match the four documents that
    already promised the check.
  - **GOV-15 discharged under the diagnostic-registry carve-out
    (`source-language-stability.md` §*Diagnostic-registry carve-out*), the
    disposition 0031 recorded for the same class.** r3–r9 satisfy the
    loads-cleanly predicate today and gain an `E`, changing observable (b); the
    carve-out dispositions "a DIAG-2 *trigger* change … as an addition for
    inputs newly brought into the code's emission set", and its covered effect
    is exactly the appearance of an emission on inputs that did not previously
    emit the code. 0031 applied the same clause to a code addition; here it is
    a trigger change with no registry edit at all, which is strictly narrower.
    Corpus sweep **re-verified at the fix baseline** (`bb5206a6`, 0.70.0): no
    `++` occurs anywhere in `docs/examples/`, `tests/fixtures/` or
    `extensions/`; across every committed `.theta` / `.thetalib` the only
    non-frontmatter `--` is inside a `//` comment in
    `tests/live/acceptance/fixtures/acc-multi-source.theta` (the `--theta` CLI
    flag), which cell s6 pins as silent. §Provenance's claim that
    `rg -n '\+\+|--' docs/examples/ tests/fixtures/` "returns nothing" is wrong
    as literally stated — it matches `---` frontmatter fences and markdown table
    separators — but right in substance: the committed corpus contains no
    increment/decrement operator, so no committed input is affected. The three
    lexical contexts where the pair is data rather than code — `//` comments,
    string literals and `@`-template prose — are pinned silent by cells s5–s7,
    and frontmatter fences never reach `lexTheta` (only `split.bodyText` is
    lexed).
  - **H9a permitted-codes: NOT reachable, `tests/fixtures/h7a/permitted-codes.json`
    byte-unchanged** — decided by the real run, mirroring 0079's method. The
    live H9a acceptance suite was run (`tests/live/acceptance/`, 11/11 green)
    and its captured stdout+stderr carries neither
    `theta/parse/increment-decrement` nor `theta/parse/unsupported-feature`; a
    scratch probe extending `tests/committed-fixture-parse-gate.test.ts`'s walk
    to `.thetalib` parsed both committed libraries free of the code and was
    deleted. H9a's stderr gate is empty-capture, so a fault-injection-only code
    must not be listed.
- **Gates:** witness `npx vitest run tests/increment-decrement-wiring.test.ts`
  → `Tests  25 passed (25)` (RED before the fix: `14 failed | 11 passed (25)`).
  Full default suite `npx vitest run` → `Test Files  263 passed (263)`,
  `Tests  3821 passed (3821)` (baseline 262 / 3796 plus the new file's 25).
  `npx tsc -p tsconfig.json --noEmit` → clean, exit 0. `npm run lint` → clean,
  exit 0. Live: H8a `tests/live/live-production-acceptance.test.ts` →
  `Tests  15 passed (15)` including the new additive cell; H9a
  `tests/live/acceptance/` → `Tests  11 passed (11)`.
- **Review:** 2 rounds. Round 1 (full depth) — FINDINGS: one `prose` item, the
  new witness file was born citing pre-diff `path:NNN` coordinates into the two
  files this diff moved; fixed by citing symbols only. Four non-blocking
  residuals recorded (i–iv below). Round 2 (fast, confirmation) — CLEAN, no
  escalation, one non-blocking note that the replaced `loopBody` precondition
  is still unfalsifiable under the current parser and not worth further churn.
- **Verification:** SOLID. (1) The witness reds in **two independent halves**,
  each a targeted byte edit restored byte-exact and blob-hash-verified
  (`git stash` never used): neutralising the lexer limb alone reproduces the
  recorded baseline signatures exactly (14/11; `stray '+' in statement
  position` for r1/r2/r10, `unknown identifier 'c'` for r4, zero diagnostics
  for r3/r5/r6/r7/r8/r9/s3/s4), and neutralising the parser limb alone reds the
  same 14 cells with every signature becoming
  `stray '++'`/`stray '--' in statement position` — direct evidence that the
  parser limb is what keeps the pair out of the stray-punctuation recovery.
  Both restored, 25/25 green. (2) Full default suite 263 files / 3821 tests
  green. (3) One additive H8a cell (`+155/−0`) plants r7's own
  `while c > 0 { c-- }` shape, boots the shipped extension for real, and
  asserts the control theta registers, the `--`-bearing theta does not, and the
  `theta-system-note` channel carries the registry-sourced rejection; proven
  red with both fix limbs reverted to HEAD's blobs and green again after a
  byte-exact restore. H9a decided the permitted-codes question, above.
  (4) Typecheck and lint clean.
- **Offline lock.** `tests/increment-decrement-wiring.test.ts` (25 cells):
  (a) r1–r10, each exactly one diagnostic — the registered code at severity
  `error`, the *Message* read from the live registry via
  `parseRegistry`/`registryMessage` with `<op>` rendered as the source token
  verbatim, and the *Hint* read from the live row's cell by a local oracle that
  throws loudly on a missing row or column (never a skip), plus explicit
  absence of both pre-fix wrong codes; (b) c1–c3 byte-unchanged controls;
  (c) s1/s2 whitespace spellings and s5–s7 lexical contexts pinned as total
  silence — the GOV-15 blast-radius guards; (d) s3/s4 adjacency emissions;
  (e) r7/r8 severity plus a deliberate body-shape pin; (f) a DIAG-4 drift guard
  reconciling Sev, phase, *Trigger*, *Message* and *Hint* against the live row.
- **Residuals.** (i) §Fix's Witness bullet asks for "r7's AST asserted to carry
  the rejection rather than an empty body", which is not achievable as
  literally stated: r7's and r8's post-fix `while` / `for` body is
  byte-identical to the baseline (`{statements: [], tail: {ident c}}`) because
  `parseForms` promotes a block's single line-start expression form to the tail
  either way. The rejection is carried by the `error` severity, which denies
  registration and is what actually closes the non-terminating loop; the body
  shape is pinned deliberately so a future AST change is a deliberate edit.
  (ii) `${c--}` inside a `@`-template interpolation stays silent — the hook
  fires, but `parseExpressionSource` discards diagnostics by pre-existing
  design and the load-time interpolation walk reports only `match` / `@`.
  Control `${c - -}` is equally silent and the pre-fix render degraded to `c`
  just as silently, so the observable is byte-unchanged by this fix and outside
  §Fix's four measured positions. (iii) `--` in `match` pattern position
  (`match x { --y => 1, _ => 2 }`) draws `theta/parse/statement-in-arm-body`
  and `theta/parse/match-arm-type-mismatch` — rejected loudly at `E` under the
  wrong codes with no hint, the 0072 shape; `parsePattern`'s one-token wildcard
  recovery predates this fix and behaved equivalently on the pre-fix `-`,`-`
  pair. (iv) `--` in type position is swallowed silently (`fn f(n: integer--)`,
  the return-type and schema-field forms) — but so are `integer%` and
  `integer-`: generic pre-existing `parseType` leniency toward trailing punct
  in the captured annotation string, not specific to this pair. All four are
  surfaced for filing by the operator; none is created or worsened here.
- **Discharge notes appended:** 0063 (the `<construct>` population loses `++`,
  which no longer reaches that emission site), 0062 (the continuation-trigger
  table is byte-unchanged by this fix), 0050 and 0072 (the dead-enforcement
  family's first member is discharged, and by what mechanism), 0031 (whose
  GOV-15 diagnostic-registry-carve-out disposition this fix reused).
- **Pinned dispositions / non-goals.** §Non-goals held: the
  newline-continuation rule is untouched and its trigger sets are
  byte-unchanged (0062 owns the table's completeness); the `<construct>`
  population of `theta/parse/unsupported-feature` is not settled here, only
  reported as losing `++` (0063 owns it); the *Message* draws no
  prefix-versus-postfix distinction — `--c` and `c--` both render `'--'`;
  other trailing-trigger absorptions remain unmeasured; `+=` / `-=` are
  untouched and still accepted (c1). The adjacency resolution above is pinned,
  not open: `c-- c` and `c --c` emit by design.

## Summary

`theta/parse/increment-decrement` is a registered `E`-severity row whose
*Trigger* is a two-character token sequence in author source. Its only emitter,
`checkIncrementDecrement` (`src/parser/bindings.ts:179`), is exported,
unit-tested against both `++` and `--`, and never called by shipped code.

The consequence is asymmetric between the two operators, and neither half is
the "loads clean, does nothing" shape of 0050:

- **`--` is silently reinterpreted.** `-` is a trailing newline-continuation
  trigger, so `c--` glues to whatever follows. `while c > 0 { c-- }` parses to
  a loop whose body is `{ statements: [], tail: c }` — the decrement is gone,
  the condition never changes, and the loop does not terminate. At statement
  level `c--\nc` parses to `c - (-c)` and evaluates to `2 * c`; with a
  following `let`, the `--` vanishes entirely and the statement degrades to a
  bare `c`. **Zero diagnostics in every case.**
- **`++` is rejected under the wrong rule.** It draws
  `theta/parse/unsupported-feature: unsupported syntactic feature: stray '+' in
  statement position` — a message that names a token the author did not think
  they wrote, at severity `E` but with no hint, and never the registered
  `Use `count += 1` / `count -= 1`.` repair.

`++`/`--` are the canonical C-family loop-counter idiom, so the input class is
one every author arriving from JavaScript, Rust, C# or Python-adjacent
languages will produce. The registry, `bindings.md`, `expressions.md`,
`docs/reference/diagnostics.md` and `docs/reference/grammar.md` all state that
theta reports it.

## Reproduction

Offline, deterministic, at HEAD `07ef0271`. Two shipped entry points:
`parseThetaDocument` (via `parseDoc`, `tests/helpers/e2e-s1.ts:39`) and
`evaluateSource` (`src/runtime/expression-evaluator.ts`). Every fixture is
`mode: prompt`. No file written.

```console
$ cat > scratch-incdec.ts <<'EOF'
import {parseDoc} from './tests/helpers/e2e-s1.ts';
import {evaluateSource, type EvalHost} from './src/runtime/expression-evaluator';
const FM='---\nmode: prompt\n---\n';
const rows: [string,string][] = [
 ['r1-postfix-stmt','let mut c = 0\nc++\nc\n'],
 ['r2-prefix-stmt','let mut c = 0\n++c\nc\n'],
 ['r3-postfix-dec','let mut c = 5\nc--\nc\n'],
 ['r4-prefix-dec','let mut c = 0\n--c\nc\n'],
 ['r5-dec-eof','let mut c = 5\nc--\n'],
 ['r6-dec-then-let','let mut c = 5\nc--\nlet z = 1\nz\n'],
 ['r7-while-dec','let mut c = 3\nwhile c > 0 {\n  c--\n}\nc\n'],
 ['r8-for-dec','let mut c = 0\nfor x in [1,2] {\n  c--\n}\nc\n'],
 ['r9-fn-dec','fn f(): integer {\n  let mut c = 5\n  c--\n  c\n}\nf()\n'],
 ['c1-plusequals','let mut c = 0\nc += 1\nc\n'],
 ['c2-assign-expr','let mut c = 0\nlet d = (c = 1)\nd\n'],
 ['c3-blockcomment','let a = 1\n/* hi */\na\n'],
];
for (const [id,body] of rows) {
  const doc:any = parseDoc(FM+body,'b.theta');
  const d = doc.diagnostics;
  console.log(id.padEnd(18), d.length===0?'NO DIAGNOSTIC':d.map((x:any)=>x.code+': '+x.message).join(' | '));
}
const host: EvalHost = { resolveIdentifier: (n)=> n==='c'?5:(()=>{throw new Error(n)})(),
                         callFunction: (n)=>{throw new Error(n)} };
console.log('d1', 'c--\\nc  with c=5  =>', evaluateSource('c--\nc', host));
EOF
$ npx tsx scratch-incdec.ts
r1-postfix-stmt    theta/parse/unsupported-feature: unsupported syntactic feature: stray '+' in statement position
r2-prefix-stmt     theta/parse/unsupported-feature: unsupported syntactic feature: stray '+' in statement position
r3-postfix-dec     NO DIAGNOSTIC
r4-prefix-dec      theta/parse/unknown-identifier: unknown identifier 'c'
r5-dec-eof         NO DIAGNOSTIC
r6-dec-then-let    NO DIAGNOSTIC
r7-while-dec       NO DIAGNOSTIC
r8-for-dec         NO DIAGNOSTIC
r9-fn-dec          NO DIAGNOSTIC
c1-plusequals      NO DIAGNOSTIC
c2-assign-expr     theta/parse/assignment-as-expression: assignment is not an expression
c3-blockcomment    theta/parse/block-comment: block comments are not supported
d1 c--\nc  with c=5  => 10
```

| # | fixture | observed |
|---|---|---|
| r1 | `c++` as a statement | `theta/parse/unsupported-feature` — wrong code, no hint |
| r2 | `++c` as a statement | `theta/parse/unsupported-feature` — wrong code, no hint |
| r3 | `c--` between `let` and a tail expression | **none — loads** |
| r4 | `--c` after a `let` initialiser | `theta/parse/unknown-identifier: unknown identifier 'c'` — the leading `-` continues the *previous* line, so `let mut c = 0 - -c` reads `c` inside its own initialiser |
| r5 | `c--` at end of file | **none — loads**, the `--` is dropped |
| r6 | `c--` followed by `let z = 1` | **none — loads**, statement degrades to bare `c` |
| r7 | `while c > 0 { c-- }` | **none — loads**, loop body empties → non-terminating |
| r8 | `for x in [1,2] { c-- }` | **none — loads**, loop body empties |
| r9 | `c--` inside a `fn` body | **none — loads** |
| c1 | `c += 1` (the documented repair) | none — loads. Control: the repair the Hint names is accepted |
| c2 | assignment in expression position | `theta/parse/assignment-as-expression` — a wired sibling rejection from the same `bindings.md` section |
| c3 | `/* … */` | `theta/parse/block-comment` — a wired sibling rejection from the same "unsupported form" family |
| d1 | `c--\nc` evaluated with `c = 5` | `10` — an author's decrement produces `2 × c` |

The parsed ASTs pin the reinterpretation (same run, `doc.body` dumped with
`range`/`file` elided):

```
r3  tail: {"kind":"binary","op":"-","left":{"kind":"ident","name":"c"},
           "right":{"kind":"binary","op":"-","left":{"kind":"null"},
                    "right":{"kind":"ident","name":"c"}}}
r5  statements: [ let c ]                       tail: {"kind":"ident","name":"c"}
r6  statements: [ let c, {"kind":"expr","expr":{"kind":"ident","name":"c"}}, let z ]
r7  while.body: {"statements":[],"tail":{"kind":"ident","name":"c"}}
r8  for.body:   {"statements":[],"tail":{"kind":"ident","name":"c"}}
r9  fn f body:  statements:[ let c,
                  {"kind":"expr","expr":{"kind":"binary","op":"-",
                     "left":{"kind":"ident","name":"c"},
                     "right":{"kind":"binary","op":"-","left":{"kind":"null"},
                              "right":{"kind":"ident","name":"c"}}}} ]
```

r7 and r8 are the load-bearing rows: the loop body contains **no statements at
all**. r7's `while` is therefore a non-terminating loop written by an author
whose source reads as a bounded countdown, produced with zero diagnostics.

The emitter answers correctly when called directly —
`tests/bindings.test.ts:153` (`++`) and `:161` (`--`) assert the registered
code, message and hint. The gap is the wiring.

**Reachability, bounded by grep.** `rg -n "checkIncrementDecrement" src/`
returns one line (`bindings.ts:179`, the definition) and
`rg -n "increment-decrement" src/` returns three, all doc comments or the
emission inside that same function. No other production site can produce the
code.

## Expected behaviour

**The registry row states the promise.**
`docs/spec_topics/diagnostics/code-registry-parse.md:33`, verbatim:

> \| `theta/parse/increment-decrement` \| E \| parse \| `++` or `--` operator
> used. \| [Bindings — Increment / decrement](../bindings.md) \| Use
> `count += 1` / `count -= 1`. \| `'<op>' operator is not supported` \|

r1–r9 each contain a `++` or `--` operator; none draws the code.

**`bindings.md` states it as the rule.** `docs/spec_topics/bindings.md:36`:

> **Increment / decrement.** `++` and `--` are
> `theta/parse/increment-decrement`. Use `count += 1` / `count -= 1`. Same Rust
> rationale: one obvious way, no prefix-vs-postfix confusion.

**`expressions.md` lists the form as unsupported.** `:37` — "Increment /
decrement (`++`, `--`)" — under the enumeration of forms the language does not
provide.

**`docs/reference/grammar.md:328` names the code** among the rejected
constructs, so the reference states the same promise a third time.

**DIAG-1 presupposes the site exists.**
`docs/spec_topics/diagnostics/diagnostic-shape.md:71` entitles tests to "assert
on the specific code at every documented diagnostic site". This site is
documented in four places and cannot be asserted from source text.

**The wired siblings from the same family do fire.** c2
(`theta/parse/assignment-as-expression`, the neighbouring `bindings.md`
rejection) and c3 (`theta/parse/block-comment`, a sibling
unsupported-form rejection) are the control: the diagnostic machinery, the
statement walk, and the severity plumbing are shared with the silent rows.

## Actual behaviour / root cause

1. **One emitter, zero callers.** `checkIncrementDecrement`
   (`src/parser/bindings.ts:179–191`) takes an `IncrementDecrementOp`
   (`:168–171`) and unconditionally returns the registered diagnostic. It is
   exported and imported by exactly one file, `tests/bindings.test.ts`. The
   shipped tree never calls it, and nothing in the lexer or parser ever
   constructs an `IncrementDecrementOp`.

2. **No token for `++` / `--` exists.** `rg -n '"\+\+"|"--"' src/lexer/lexer.ts`
   returns nothing: the lexer has no compound increment/decrement token. Both
   operators reach the parser as two separate `punct` tokens, so there is no
   node any check could hang off even if a call were added at the statement
   walk. Wiring the emitter requires lexing the pair first.

3. **`--` is consumed by the trailing-operator continuation.**
   `expressions.md:147` makes a binary operator at end of line a statement
   continuation. `c--` therefore ends in a continuation trigger; the following
   line is joined and the second `-` is read as a unary minus on it. The
   parser's unary-minus encoding is a `binary "-"` with a `{kind:"null"}` left
   operand (r3, r9), so the expression is well-formed and no arm objects. When
   the joined continuation is itself a statement keyword (r6's `let`) or EOF
   (r5), the trailing `-`s are dropped and the statement collapses to the bare
   receiver.

4. **A loop body reduces to nothing.** In r7 and r8 the block's single
   statement `c--` is consumed as a continuation of nothing and the closing
   `}` terminates it, leaving `{ statements: [], tail: c }`. The loop
   condition is re-evaluated over an unchanged `c`.

5. **`++` falls into the stray-punctuation recovery.** `+` at end of line is
   also a continuation trigger, but the pair `++` leaves a `punct` token the
   statement loop cannot start a statement with, so
   `theta-document.ts:1750–1763` reports
   `theta/parse/unsupported-feature: unsupported syntactic feature: stray '+'
   in statement position` and advances past it. The code, the message and the
   absent hint are all wrong for the author's mistake, and the position
   reported is the second `+`, not the operator.

6. **No runtime net.** The AST that survives is a valid program. `executeBody`
   (`src/runtime/statement-executor.ts:1690`) executes it; `evaluateSource`
   folds `c - -c` to `2c` (d1). No `E`, no `W`, no panic.

## Why it matters

- **A loop counter written the C way produces a non-terminating loop with no
  diagnostic.** r7 is the paradigm: `while c > 0 { c-- }` is the single most
  common shape the operator appears in, and theta accepts it as an infinite
  loop. Cancellation is the only exit, and the interpreter's per-iteration
  checkpoint (`cancellation.md` §Granularity) means the operator has to press
  Esc to end a run whose source looks bounded.
- **Silent wrong values.** r3/d1 turn a decrement into `2 × c`. The value
  propagates into queries, tool arguments and return values with nothing
  marking it.
- **The author's mistake is undiscoverable from the diagnostics.** For `--`
  there is no diagnostic; for `++` the reported token (`'+'`) is not the token
  the author typed (`'++'`), the code names an unrelated rule, and the
  registered repair hint never appears.
- **Four documents state the check exists.** The registry, `bindings.md`,
  `expressions.md` and `docs/reference/grammar.md` all name the code; the
  registry is closed under DIAG-2 and read as the inventory of what the
  implementation reports.
- **The reference examples cannot warn anyone off.** `rg -n '\+\+|--'
  docs/examples/` returns nothing, so no shipped example demonstrates the
  rejection or the `+= 1` repair.

## Non-goals

- **The newline-continuation rule itself.** `-`/`+` as trailing continuation
  triggers is specified (`expressions.md:147`) and is not the defect; the
  defect is that no rule rejects `--`/`++` before the continuation absorbs
  them. 0062 owns the continuation table's completeness.
- **The `<construct>` population of `theta/parse/unsupported-feature`.** 0063
  owns whether `stray '<t>' in statement position` belongs in the construct
  table. This report does not settle what that row should say; it reports that
  `++` should not be reaching it.
- **Prefix vs postfix distinction in the message.** The registry Message is
  `'<op>' operator is not supported` with `<op>` the source token verbatim, and
  the emitter already implements it. Whether `--c` and `c--` should be
  distinguished is not raised here.
- **Other trailing-trigger absorptions.** Whether operators other than `+`/`-`
  produce comparable silent reinterpretations of author-intended constructs is
  unmeasured and out of scope.
- **`+=` / `-=`.** Wired and accepted (c1); untouched.

## Fix

Not yet decided. Unlike 0050, the emitter cannot simply be called — there is no
token to call it on (§Actual behaviour item 2), so every disposition begins in
the lexer.

**Disposition 1 — lex the pair, then wire the emitter (recommended).** Add a
`++`/`--` token (or a lexer-level lookahead that recognises the adjacent pair
before the continuation-trigger test runs) and call `checkIncrementDecrement`
at the statement/expression walk.

- *Ordering constraint.* The recognition MUST run **before** the trailing-
  operator continuation test (`expressions.md:147`), or `--` will continue to
  be absorbed at end of line — r3, r5, r7 all depend on this ordering.
  `trailingTriggers()` (`src/lexer/lexer.ts`, cited from
  `theta-document.ts:1480`, `:1535`, `:2385`) is the site.
- *Positions to cover.* The measured reachable set is statement position (r1,
  r3), expression position (`let d = c++`), loop body (r7, r8) and `fn` body
  (r9). A fix that covers only statement position leaves r9 silent.
- *Adjacency, not whitespace.* `c - - c` and `c - -c` are legal expressions
  today (both fold to `2c`) and must stay legal; only the byte-adjacent pair
  with no separating whitespace is the operator. The rejection therefore keys
  on token adjacency, which the lexer has and the parser does not.
- *`<op>` verbatim.* The registry Message interpolates the source token, so the
  lexed token text must be carried to the emitter; `checkIncrementDecrement`
  already accepts it (`bindings.ts:180`).
- *DIAG-2.* Not engaged if the Trigger prose stays accurate — no code is added,
  removed, renamed or re-triggered, and the Message and Hint are unchanged
  (DIAG-4, `diagnostic-shape.md:74`).
- *GOV-15.* Engaged. r3–r9 load cleanly today
  (`source-language-stability.md:9`) and would gain an `E`, changing
  observable (b); an `E` denies registration. This is the
  diagnostic-registry carve-out (`source-language-stability.md:25`) applied as
  an addition, the disposition 0031 recorded for the same class. `rg -n
  '\+\+|--' docs/examples/ tests/fixtures/` returns nothing, so the committed
  corpus has no affected input.
- *Witness.* Offline at the `parseThetaDocument` boundary: r1–r9 as
  expected-emission rows with code, message and hint sourced from the registry;
  c1–c3 as byte-unchanged controls; explicit non-emission rows for `c - - c`,
  `c - -c` and `a-- b` spacings that must stay accepted; and the r7 AST asserted
  to carry the rejection rather than an empty body.

**Disposition 2 — retire the row.** Remove `theta/parse/increment-decrement`
from the registry and the corpus and delete the emitter with its two unit
tests. This is a DIAG-2 removal touching `code-registry-parse.md:33`,
`docs/reference/diagnostics.md:79`, `docs/reference/grammar.md:328`,
`bindings.md:36` and the `expressions.md:37` bullet. It does not close the
defect: r7 remains a silently non-terminating loop and r3 remains `2c`, so
retirement would have to be paired with a separate rule covering the adjacent
`--` pair, which is disposition 1 under a different code.

**Recommendation: disposition 1.** The behaviour is promised in four normative
places, the emitter exists and is unit-tested green, the repair it names (`+=
1`) is accepted today (c1), and retirement leaves the r7 non-termination
unaddressed. The work is lexer-side recognition ahead of the continuation
trigger plus one call — not design.

## Provenance

- **Origin:** systematic dead-enforcement sweep — cross-reference of every
  code in `docs/spec_topics/diagnostics/code-registry-*.md` (193 codes)
  against `src/`, intersected with the set of exported
  `check*`/`enforce*`/`validate*`/`verify*` functions having no `src/` caller.
  `theta/parse/increment-decrement` is the only code in the registry whose
  *sole* `src/` occurrence is an emission inside a function with zero
  production callers and whose position has no sibling emitter.
- **Evidence:** the §Reproduction script, run at HEAD `07ef0271`, output quoted
  verbatim; the AST dumps from the same script with `range`/`file` elided;
  `rg -n "checkIncrementDecrement" src/` (one line),
  `rg -n "increment-decrement" src/` (three lines, all `bindings.ts`),
  `rg -n '"\+\+"|"--"' src/lexer/lexer.ts` (no hits),
  `rg -n '\+\+|--' docs/examples/ tests/fixtures/` (no hits). Scratch files
  written, run and deleted.
- **Implementation:** `src/parser/bindings.ts` (`:168–171`
  `IncrementDecrementOp`, `:173–178` doc comment, `:179–191`
  `checkIncrementDecrement`, `:185` code, `:187` message, `:188` hint),
  `src/parser/theta-document.ts` (`:1750–1763` stray-punct recovery, `:1757`
  code, `:1480`/`:1535`/`:2385` `trailingTriggers` citations),
  `src/runtime/statement-executor.ts:1690` (`executeBody`),
  `src/runtime/expression-evaluator.ts` (`evaluateSource`), all at `07ef0271`.
- **Spec measured against:**
  [code-registry-parse.md:33](../spec_topics/diagnostics/code-registry-parse.md);
  [bindings.md:36](../spec_topics/bindings.md);
  [expressions.md:37](../spec_topics/expressions.md), `:147` (newline
  continuation);
  [diagnostic-shape.md:71](../spec_topics/diagnostics/diagnostic-shape.md)
  (DIAG-1), `:72` (DIAG-2), `:74` (DIAG-4);
  [source-language-stability.md](../spec_topics/governance/source-language-stability.md)
  (`:5` GOV-15, `:9` loads-cleanly predicate, `:25` carve-out);
  [cancellation.md](../spec_topics/cancellation.md) §Granularity.
- **Mirrors:** `docs/reference/diagnostics.md:79`,
  `docs/reference/grammar.md:328`.
- **Tests read, none changed:** `tests/bindings.test.ts:4`, `:26`, `:153`,
  `:161`; `tests/helpers/e2e-s1.ts:39`.
