# Bug 0385 — The shipped category-5 `<key>` renderer JSON-escapes where the spec pins plain double-quoting: `obj["a\"b"]` on a missing key panics `missing object key: "a\"b"` while §5's rule (as §8 itself glosses it, "unlike `<key>`'s plain double-quoting") prescribes `"a"b"` — and the spec's plain-wrap side is itself unsatisfiable for a break-carrying key against `diagnostic-shape.md:34`, the exact two-sentence contradiction bug 0300 resolved for the parsed-scalar rows and no one resolved for `<key>`

- **Status:** fixed (0.375.0).
- **Sev/Diff estimate:** S4/D1 — S4 because the reachable byte divergence is
  confined to panic messages naming keys that carry `"` or `\` (the shipped
  bytes are arguably the *better* ones: single-line-safe, forge-safe), so no
  input observes a hazardous value — the damage is a normative rendering rule
  (DIAG-4 entitles byte-exact assertions) that the implementation does not
  satisfy and that cannot be satisfied consistently with `:34` as written.
  D1 because the remedy is the 0300 fix shape verbatim: one spec paragraph
  amendment (pin `<key>`'s non-identifier arm to `JSON.stringify`, correcting
  the §8 gloss in the same edit) with the implementation already conformant to
  the amended text; no code moves.
- **Kind:** spec defect with an implementation divergence face. The
  implementation diverges from the stated §5 rule (a DIAG-4 defect as filed);
  the stated rule contradicts `diagnostic-shape.md:34` on break-carrying keys
  (a 0300-class two-sentence self-contradiction); the implementation silently
  ships the resolution the spec never adopted.
- **Related:**
  - [0300](./0300-out-of-range-observed-string-embeds-raw-newline.md)
    (fixed 0.334.0) — the template: `<observed>`'s string arm was
    plain-wrapped in code and spec, contradicting `:34`; its §Fix moved both
    to `JSON.stringify` and authored the §8 carve-out whose contrast clause
    ("unlike `<key>`'s plain double-quoting — rendered via `JSON.stringify`")
    is what now mischaracterises the shipped `<key>` arm. Its §Residuals
    (1)–(2) name the settings-side string arm and the frontmatter-key
    carriers (→ 0348, fixed) — never `<key>` itself.
  - [0036](./0036-missing-object-key-bare-key-rendering.md) (fixed 0.41.0) —
    routed the missing-object-key panic through `renderSourceDerived`'s key
    arm; its §Affected (`:39–40`) calls the `JSON.stringify` key arm
    "byte-exactly the §5 rule" — a conflation, not an escape-depth
    adjudication: every vector and probe it used (`my-key`, `kind`, `25`) is
    escape-free, on which the two readings are byte-identical. At that
    baseline no spec sentence glossed `<key>`'s quoting depth; the 0300 spec
    edit created the contradiction retroactively.
  - Candidate notes-render-2/05 — the same §5
    drafted-over-identifier-shaped-names omission family, distinct defect
    face: 05's carriers emit raw breaks into `message` (wrong bytes shipped);
    06's carrier already escapes (the spec text is behind the shipped
    bytes).
  - 0365 (open, wave 1) — the *array* index-message half of the same panic
    family; different row, different mechanism (bounds predicate + numeric
    `<i>`), not touched here.
- **Affected** (verified at `9474dfa8`, v0.347.0):
  - `src/diagnostics/placeholder.ts:191–197` — `renderSourceDerived`'s `key`
    arm: `isIdentifierShaped(text) ? text : JSON.stringify(text)`.
  - `src/runtime/runtime-panics.ts:222–226` — `assertKeyPresent`, the one
    construction site of `missing object key: <key>` (shared by indexed and
    member access), routing through the arm above. The panic message flows
    unchanged to the `Diagnostic.message` and the
    `"theta /<name> aborted: <message>"` note framing
    (errors-and-results/error-model.md §Runtime panics).
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:11` — the §5
    `<key>` rule: "quoted with double quotes only when the key string is *not*
    identifier-shaped …; otherwise rendered bare" — no escape step stated.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:98` — the §8
    parsed-scalar carve-out's contrast clause: "otherwise — **unlike
    `<key>`'s plain double-quoting** — rendered via `JSON.stringify`:
    double-quoted AND with every break, interior `"`, `\`, and other control
    character escaped … so the rendering stays a single line … resolving the
    tension between that single-line rule and this row's byte-identical-
    rendering claim". The corpus's own normative gloss reads §5 `<key>` as
    plain wrap; the tension it resolves for two rows is left standing for
    `<key>`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:34` — `message` is a
    single-line summary (violated by the plain-wrap reading for `o["a\nb"]`).
- **Observed at:** v0.347.0 (`9474dfa8`). Offline, deterministic: scratch
  vitest over `renderSourceDerived` and `evaluateIndexAccess` /
  `evaluateMemberAccess`. Probe run and deleted.

## Reproduction

Offline at `9474dfa8`:

```ts
renderSourceDerived({ kind: "key", text: 'a"b' })   // → "a\"b"   (7 chars)
renderSourceDerived({ kind: "key", text: "a\\b" })  // → "a\\b"
renderSourceDerived({ kind: "key", text: "a\nb" })  // → "a\nb"   (escaped, single line)
renderSourceDerived({ kind: "key", text: "my-key" })// → "my-key" (both readings agree)
evaluateIndexAccess({ x: 1 }, 'a"b')  // throws MissingObjectKeyPanic
//   message === 'missing object key: "a\\"b"'
evaluateMemberAccess({ x: 1 }, "a\nb")
//   message === 'missing object key: "a\\nb"'  (one physical line)
```

Spec-side rendering for the same inputs under `:11`/`:98`'s plain-wrap
reading: `missing object key: "a"b"` and `missing object key: "a<LF>b"` (two
physical lines). The reachable divergence set is exactly: interior `"`,
interior `\`, C0/C1 control characters including breaks, and lone surrogates
(`JSON.stringify` escapes a lone surrogate) — NOT astral characters
(`JSON.stringify("\u{1F600}")` leaves the emoji literal, so astral keys render
identically under both readings), and not ordinary "exotic" keys (`my-key`,
dots, spaces, unicode letters), which also agree. Reachability from theta
source: `o["a\"b"]` / `o["a\nb"]` —
the index string's escapes cook; the receiver lacks the key; the panic fires
(`theta/runtime/missing-object-key`).

## Expected behaviour

One of the two sentences must move; they cannot both hold:

- DIAG-4 (`diagnostic-shape.md`): the *Message* column is normative
  "character-for-character with placeholders interpolated", and §5's category
  rules fix the interpolation — under the current text the shipped bytes for a
  `"`-carrying key are non-conformant.
- `diagnostic-shape.md:34`: `message` is one line — under the current §5 text
  a break-carrying key renders two, the 0105-class violation, and §8:98 states
  in terms that `JSON.stringify` is what "resolv[es] the tension" — for two
  other rows.

0300 adjudicated the identical tension for `<observed>`: escape, and say so in
the spec. The shipped `<key>` arm already escapes; only the spec text is
behind.

## Actual behaviour / root cause

`renderSourceDerived`'s key arm has used `JSON.stringify` since its
introduction; §5's `<key>` bullet never stated an escape step; the 0300 fix
added the "plain double-quoting" gloss at §8:98, committing the spec to the
reading the implementation does not (and, per `:34`, should not) satisfy. No
vector can decide between the two readings — every §5/§8 vector uses keys
with no `"`, `\`, or break (`my-key`, `kind`, `"25"`), on which the readings
are byte-identical — and the plain-wrap reading violates
`diagnostic-shape.md:34` for break-carrying keys, so the spec side is the
wrong one. No test can catch the divergence either: no cell in `tests/` pins
the plain-wrap bytes.

## Why it matters

- DIAG-4 entitles conformance tests to byte-exact assertions sourced from the
  registry + category rules; a test written today for `obj["a\"b"]` from the
  spec fails against the implementation, and one written from the
  implementation contradicts the spec — the exact both-directions trap the
  placeholder categories exist to prevent.
- The §8:98 clause is normative text making a false statement about a sibling
  category's behaviour; the next 0348-style fixer choosing "collapse vs
  escape" reads it as precedent (0348's fix record already cites `<key>`'s
  "plain double-quoting" as a deciding contrast).
- Crisp and cheap to close now; expensive later if a consumer pins the
  plain-wrap bytes.

## Non-goals

- The missing-object-key presence-gate semantics (0032/0036, fixed).
- `theta/runtime/non-object-receiver`'s deliberately bare index rendering
  (its row pins its own rule; 0027).
- 0365's non-integral-index and bounds-message rows.
- The settings/frontmatter `<observed>` rows (0300, fixed and conformant).

## Fix

Amend `placeholder-rendering-b.md:11` to state `<key>`'s non-identifier arm as
`JSON.stringify` (double-quoted with every break, interior `"`, `\`, and
control character escaped — the wording `:98` already uses), delete or invert
the "unlike `<key>`'s plain double-quoting" contrast at `:98` (the two
renderings become the same rule), and add one vector with an escapable
character (`obj["a\"b"]` → `missing object key: "a\"b"`). Implementation
unchanged; add the vector as a unit cell over `renderSourceDerived` and the
panic site. GOV-8: the edit changes no shipped byte for any input the current
vectors cover; the `"`-/`\`-carrying inputs it newly pins render today's
bytes, so this is codifying shipped behaviour, the posture
`placeholder-rendering-a.md` §Closure already blesses for describing what the
registry already renders — the spec-amendment fix shape 0300 used, with the
implementation already conformant to the amended text. The alternative — make the implementation
plain-wrap — re-opens the `:34` violation for break keys and un-fixes the
forge-safety `JSON.stringify` provides; not recommended.

## Provenance

Spec read: `placeholder-rendering-b.md:11` (§5 `<key>`), `:98` (§8 carve-out +
gloss), §5 test vectors; `diagnostic-shape.md:34` (single-line), DIAG-4;
`code-registry-runtime.md:17` (missing-object-key row).
Implementation read: `src/diagnostics/placeholder.ts:170–216`;
`src/runtime/runtime-panics.ts:200–230`. Prior bugs read in full: 0036, 0300,
0032 (scope), 0027 (scope), 0365 (header, avoided). Probe: one scratch vitest
(renderer + both panic spellings), run at `9474dfa8`, deleted.

## Fix (0.375.0)

- What shipped:
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` §5 `<key>` bullet
    — non-identifier arm restated as `JSON.stringify` (double-quoted with every
    break, interior `"`, `\`, and control character escaped; single-line-safe),
    reusing §8's existing wording, with a byte-identity note for escape-free
    keys (§Fix item 1).
  - same file §8 `<observed>` carve-out — the false contrast "unlike `<key>`'s
    plain double-quoting" inverted to "exactly as `<key>`'s non-identifier arm
    (§5)"; the tension-resolution clause kept and now true (§Fix item 2).
  - same file §5 test vectors — added `obj["a\"b"]` →
    `missing object key: "a\"b"` (§Fix item 3).
  - `tests/b0385-key-placeholder-json-stringify.test.ts` (new) — codifying unit
    cell over `renderSourceDerived`'s key arm AND the panic site
    (`assertKeyPresent` via `evaluateIndexAccess`/`evaluateMemberAccess`) for
    `'a"b'`, `"a\\b"`, `"a\nb"` (single-line), plus escape-free/identifier
    controls (§Fix item 4). No src change — the shipped `renderSourceDerived`
    key arm was already conformant (GOV-8 codification, zero shipped-byte change
    for any input the current vectors cover).
- Gates: witness `tests/b0385-key-placeholder-json-stringify.test.ts` 16/16
  green; full default suite 551 files / 10248 tests green (3 later hook-timeout
  reds were parallel-load noise — green isolated, off-surface); typecheck
  `tsc --noEmit` exit 0; lint (`eslint src/**/*.ts`) exit 0.
- Review: 1 round — `bug-fix-reviewer` FINDINGS: one house-rule finding (F1,
  stale `<key>` contrast comment in `src/parser/frontmatter.ts` `renderObserved`)
  + three residuals; F1 lies on this bug's declared §Non-goal surface (the
  frontmatter `<observed>` row) and on a src file §Fix does not name, so it was
  recorded as a follow-up rather than fixed (no in-scope defect → no fixer
  round).
- Verification: `bug-fix-verifier` SOLID. Obligation 1 (discrimination):
  neutralising the key arm to a plain-wrap reds exactly the 9 escapable cells
  (`"a"b"` vs `"a\"b"`; raw two-line break vs escaped `\n`) while the controls
  stay green; `src/diagnostics/placeholder.ts` restored byte-exact to HEAD
  (`git hash-object` == `git rev-parse HEAD:…`). Obligation 2: default suite
  green (load-noise reds green isolated). Obligation 3: spec/registry coherent
  (§5 = JSON.stringify, §8 free of "plain double-quoting",
  `code-registry-runtime.md` row and `diagnostic-shape.md:34` single-line rule
  intact). Obligation 4: typecheck + lint clean. Live: adjacent cell
  `tests/live/hardening/question-operand-defect-abort.test.ts` (runtime-defect →
  `theta /<name> aborted` system-note framing, the pipeline the panic message
  traverses) run green under the live lock — no drive/registration outcome
  changed, so an adjacent witness discharges the live obligation.
- Residuals:
  1. F1 (follow-up candidate) — `src/parser/frontmatter.ts` `renderObserved`
     doc comment still reads "unlike `<key>`'s plain double-quoting"; now
     doubly-stale (spec §8 inverted, code never plain-wrapped). On the
     frontmatter `<observed>` row, this bug's declared §Non-goal; comment-only
     fix belongs to a separate bug.
  2. R1 — `src/diagnostics/placeholder.ts` key-arm comment restates the
     pre-amendment §5 sentence (accurate, omits the escape step now pinned);
     align when next touched. Src file §Fix does not name.
  3. R3 — the reused §5/§8 escape gloss ("every … control character escaped to
     its two-character JSON form") is imprecise: `JSON.stringify` leaves U+007F
     and C1 controls raw and uses `\u00NN` six-char form for short-form-less C0
     controls. Reused verbatim per §Fix (item 1 mandated §8's wording); no
     conformance divergence (operative rule is "via `JSON.stringify`").
     Follow-up candidate covering §5, §8, and the bug's own C0/C1 divergence-set
     phrasing.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the rejected alternative (make the
  implementation plain-wrap) stays rejected — it re-opens the
  `diagnostic-shape.md:34` single-line violation for break keys and drops
  `JSON.stringify`'s forge-safety. The settings/frontmatter `<observed>` rows
  (0300) remain a §Non-goal (see F1).
