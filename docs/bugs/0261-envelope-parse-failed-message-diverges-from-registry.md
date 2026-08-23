# Bug 0261 — the shipped message prefix of `theta/runtime/subagent-envelope-parse-failed` diverges from its registry *Message* template: `mapEnvelopeParseFailure` renders `subagent return envelope failed the pinned schema: <summary>` where the registry row and its reference mirror template `subagent return envelope parse failed: <line summary>`, so DIAG-4's byte-identical-prefix rule is violated and a registry-derived prefix oracle (`messagePrefixOf`, 0086's pattern) cannot witness this row without going red against the shipped bytes

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because the only operator-visible effect is
  one reworded prefix on a fail-closed triage message; no result, code, or
  severity differs, and no shipped test asserts either spelling. D1 because the
  remedy is one string literal in one file *or* two table cells in two docs, and
  the flip set is empty either way.
- **Kind:** defect — implementation/spec divergence. DIAG-4 makes the *Message*
  column normative and requires renderers to emit it character-for-character
  with placeholders interpolated
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`). Category 8 narrows
  that for host-derived tails: "every byte of the *Message* template before the
  §8 placeholder, and every byte after, is byte-identical across
  implementations"
  (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:89`), and `:93`
  names this row as one of the five whose byte-identical surround is a prefix
  only. The shipped prefix is not that prefix.
- **Affected** (every citation verified at HEAD `5fdac660`, 0.240.0):
  - `src/runtime/subagent-envelope.ts:392–408` — `mapEnvelopeParseFailure`.
    `:394` builds the message; the same string is used for both
    `error.message` (`:398`) and `diagnostic.message` (`:405`), so one literal
    governs both surfaces.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:28` — the registry
    row for `theta/runtime/subagent-envelope-parse-failed`; its *Message* cell
    is the normative template.
  - `docs/reference/diagnostics.md:277` — the reference mirror of that row's
    *Message* cell.
  - `tests/subagent-wire-parse-failed-emitter.test.ts:132–147` —
    `messagePrefixOf`, the registry-derived prefix oracle (reads
    `registryMessage` from `tools/code-registry/index.js:88`, cuts at the
    `<line summary>` placeholder). Applied to this row today it yields
    `subagent return envelope parse failed: `, which no shipped byte matches.
- **Observed at:** HEAD `5fdac660`, 0.240.0, `main`, by source inspection of
  the three sites plus an `rg` census of both spellings over the whole tree.

## Summary

The registry templates this row's message as `subagent return envelope parse
failed: <line summary>`; the runtime renders `subagent return envelope failed
the pinned schema: <summary>`. The divergence is in the byte-identical prefix
segment, which DIAG-4 and category 8 both pin, so exactly one of the two
artifacts is wrong and nothing in the tree says which. No test pins either
spelling, so the property is unconstrained in both directions: it can be
reworded on either side without a red.

The concrete consequence is that the registry-derived oracle 0086 established
for the sibling row cannot be reused here. `messagePrefixOf` reads the *Message*
cell and asserts `message.startsWith(prefix)`; against the shipped bytes that
assertion reds for the wording, not for the property under test — which is why
bug 0258's §Fix constraint 4 forbids a prefix anchor in its own witness until
this divergence is dispositioned.

## Reproduction

At HEAD `5fdac660`, 0.240.0. Three quotes and one census; no build required.

1. The shipped prefix (re-locate by symbol `mapEnvelopeParseFailure` if the line
   drifts):

   ```
   $ rg -n "mapEnvelopeParseFailure" src/runtime/subagent-envelope.ts
   387: * Map a reserved-key envelope line that failed the pinned schema to
   392:export function mapEnvelopeParseFailure(line: string, calleePath: string): EnvelopeFailureMapping {
   $ sed -n '392,394p' src/runtime/subagent-envelope.ts
   export function mapEnvelopeParseFailure(line: string, calleePath: string): EnvelopeFailureMapping {
     const summary = summarizeLine(line);
     const message = `subagent return envelope failed the pinned schema: ${summary}`;
   ```

2. The normative template and its mirror:

   ```
   $ rg -n "subagent return envelope parse failed" docs/spec_topics/diagnostics/code-registry-runtime.md docs/reference/diagnostics.md
   docs/spec_topics/diagnostics/code-registry-runtime.md:28:… | `subagent return envelope parse failed: <line summary>`. |
   docs/reference/diagnostics.md:277:| `theta/runtime/subagent-envelope-parse-failed` | E | runtime | `subagent return envelope parse failed: <line summary>`. |
   ```

3. The byte divergence, aligned from the common prefix
   `subagent return envelope `:

   ```
   registry  subagent return envelope parse failed: <line summary>
   shipped   subagent return envelope failed the pinned schema: <summary>
                                      ^ diverges here
   ```

   The common prefix is the 25 bytes `subagent return envelope `. The registry
   continues `parse failed: ` (14 bytes); the code continues `failed the pinned
   schema: ` (25 bytes). Both end in `: ` immediately before the host-derived
   tail, so the divergence is confined to one interior segment and the tail
   binding is unaffected.

4. Neither spelling is pinned by a test:

   ```
   $ rg -n "failed the pinned schema|return envelope parse failed" tests/
   $ echo $?
   1
   ```

   The three cells that touch this row read the code and the structural fields
   only, never the text: `tests/subagent-envelope.test.ts:321–331` (asserts
   `error.kind`, `cause`, `callee_path`, `diagnostic.code`,
   `diagnostic.severity`), `tests/subagent-json-wire.test.ts:132–144` (asserts
   `result.ok === false` and that the emitted codes contain the constant), and
   `tests/subagent-wire-parse-failed-emitter.test.ts:248–260` (asserts the
   class separation against the sibling row by code). The flip set of a
   wording change on either side is therefore **empty** — no assertion moves.
   The prose mention at
   `tests/registry-closed-set-corpus-gate.test.ts:138–145` cites `:404` as this
   code's emission line and reads no message text.

## Expected behaviour

The rendered message's prefix is byte-identical to the *Message* template's
bytes ahead of `<line summary>`, so `messagePrefixOf` derived from
`code-registry-runtime.md:28` is a usable oracle for this row, as it already is
for the sibling `theta/runtime/subagent-wire-parse-failed`
(`src/runtime/subagent-envelope.ts:438` renders `subagent event-stream line
parse failed: ${summary}`, matching its row at `code-registry-runtime.md:27`
byte for byte).

## Actual behaviour / root cause

`src/runtime/subagent-envelope.ts:394` carries a hand-written literal that
paraphrases the row's trigger prose ("does not parse against the pinned
return-envelope schema") instead of quoting the row's *Message* cell. The
sibling builder forty-four lines down (`:438`) quotes its cell exactly, so the two
adjacent builders disagree on whether the *Message* column is the source. No
gate compares a rendered message against its template — the closing gate reads
asserted **codes** (`tools/closing-gate/index.js`), not messages — so the
divergence survives every suite.

## Why it matters

- **DIAG-4 is a conformance rule with a stated disposition.** Wording changes
  to the *Message* column are spec-versioned breaking changes deferred to
  theta 2.0 and explicitly outside the GOV-15 diagnostic-registry carve-out
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`). While the two
  artifacts disagree, a reader cannot tell whether the shipped bytes are a
  defect or an unrecorded amendment, and both remedies carry different
  governance weight.
- **The oracle is blocked for this row, and the block propagates.** 0086's
  registry-derived prefix pattern is the established way to witness a category-8
  row (`tests/subagent-wire-parse-failed-emitter.test.ts:132–147`). Bug 0258
  has to witness this row's tail rendering and cannot use that anchor:
  [`0258-envelope-parse-failed-summary-embeds-trailing-cr.md`](./0258-envelope-parse-failed-summary-embeds-trailing-cr.md)
  §Fix constraint 4 requires `toContain`-style assertions "without a
  registry-derived prefix anchor, unless the prefix divergence is dispositioned
  first". Every future witness over this row inherits that exception.
- **The message is operator-facing on a fail-closed path.** The invocation is
  settled by this mapping (`src/runtime/subagent-json-driver.ts:158–160`), and
  the same string rides `InvokeInfraError.message` to an `invoke` parent, so
  whichever spelling is correct is the one an operator triages a failed
  subagent invocation by.
- **The divergence class is measurable and unswept.** `:93` of
  `placeholder-rendering-b.md` names five category-8 subagent rows whose
  surround is a prefix only. This report measures one of them; the other four
  are not measured here.

## Non-goals

- **`summarizeLine`'s tail rendering.** That the summary embeds a trailing CR
  is bug 0258's subject and is untouched here. This report does not change what
  binds `<line summary>`, only the bytes ahead of it.
- **The remaining four category-8 subagent rows.**
  `theta/runtime/subagent-child-crashed`,
  `theta/runtime/subagent-exit-without-envelope`,
  `theta/runtime/subagent-params-validation-failed` and
  `theta/runtime/subagent-wire-parse-failed` are not audited here; the sibling
  wire row is quoted only as the matching-prefix control.
- **The code identifier.** `SUBAGENT_ENVELOPE_PARSE_FAILED_CODE`
  (`src/runtime/subagent-envelope.ts:97`) is correct and stable under DIAG-3;
  nothing here renames a code.
- **A message-template conformance gate.** That no gate compares rendered
  messages to their *Message* cells is stated above as root-cause context. A
  corpus-wide gate is a separate subject.

## Fix

Bring the two artifacts into byte agreement for this row. Exactly one of the
two branches below lands; the choice is adjudicable in-run and is recorded in
the fix record either way.

- **Branch A — align the code to the registry.** Replace the literal at
  `src/runtime/subagent-envelope.ts:394` with the row's template prefix,
  `subagent return envelope parse failed: ${summary}`. Cost: an
  operator-visible message reword on a shipped fail-closed path. No test
  assertion moves (§Reproduction step 4: the flip set is empty), and no spec
  text changes, so DIAG-2's same-commit registry rule and DIAG-4's
  wording-change deferral have no subject. This branch also unblocks the
  registry-derived prefix oracle for the row, which is what 0258 constraint 4
  is waiting on.
- **Branch B — amend the registry and its mirror to the shipped bytes.** Rewrite
  the *Message* cell at
  `docs/spec_topics/diagnostics/code-registry-runtime.md:28` and its mirror at
  `docs/reference/diagnostics.md:277` to `subagent return envelope failed the
  pinned schema: <line summary>`. Cost: a DIAG-4 *Message* wording change,
  which `diagnostic-shape.md:74` classes as a spec-versioned breaking change
  deferred to theta 2.0 and outside the GOV-15 carve-out; taking it inside
  theta 1.x requires that deferral to be dispositioned explicitly in the fix
  record. It is also a two-file spec edit that must keep the shard and the
  mirror identical.

Whichever branch lands:

1. **Both mirrors move together, or neither.** The registry cell
   (`code-registry-runtime.md:28`) and the reference mirror
   (`reference/diagnostics.md:277`) are byte-identical *Message* cells today;
   any edit to one is an edit to the other. Under branch A neither moves.
2. **The witness is registry-derived, not copy-pasted.** Add a cell asserting
   `mapEnvelopeParseFailure(...).diagnostic.message` and
   `.error.message` both start with `messagePrefixOf(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE)`
   — the oracle at `tests/subagent-wire-parse-failed-emitter.test.ts:132–147`,
   sourced from the live registry per DIAG-4, never a literal copy. The cell
   must red against the pre-fix bytes on the prefix assertion, never on a
   compile error, and it must be a prefix anchor only: `<line summary>` is a
   category-8 host-derived tail and strict equality is prohibited for it
   (`placeholder-rendering-b.md:89`).
3. **The sibling control stays in the same cell.** Assert the wire row's prefix
   in the same file so the two adjacent builders are pinned against one shared
   oracle and cannot drift apart again.
4. **The three existing cells stay green untouched.**
   `tests/subagent-envelope.test.ts:321–331`,
   `tests/subagent-json-wire.test.ts:132–144` and
   `tests/subagent-wire-parse-failed-emitter.test.ts:248–260` read no message
   text; confirm by re-run, not by inspection.
5. **Re-derive the seam citations.** This report and
   [`0258`](./0258-envelope-parse-failed-summary-embeds-trailing-cr.md) both
   edit `mapEnvelopeParseFailure` and both cite the other's sites. Whichever
   lands second re-derives the other's citations at the seam before writing:
   0258's §Non-goals paragraph naming this divergence, its §Fix constraint 4
   (the prefix-anchor exception — under branch A the exception is discharged and
   its wording must be updated rather than left standing), and the
   `src/runtime/subagent-envelope.ts` line numbers in both reports. 0258
   constraint 2 requires zero net line shift in that file; branch A preserves
   it (one literal, one line), branch B touches no source line at all.
6. **No code, severity, phase, or trigger moves.** DIAG-2 and DIAG-3 have no
   subject in either branch: the change is confined to the *Message* bytes on
   one row.

## Provenance

- Filed at HEAD `5fdac660`, 0.240.0, `main`.
- Evidence: source inspection at HEAD of `mapEnvelopeParseFailure`, the sibling
  `mapWireParseFailure`, the registry row and its reference mirror, the
  `messagePrefixOf` oracle, and the three existing cells over this row; plus an
  `rg` census of both spellings over the whole tree and over `tests/`
  (§Reproduction step 4). No file in the tree was modified and no scratch probe
  was needed.
- Ownership check: no open report owns this divergence.
  [`0258`](./0258-envelope-parse-failed-summary-embeds-trailing-cr.md) (open)
  measures it in §Non-goals and defers it — "This is a DIAG-4 question … it is
  not this report's subject. No open report owns it" — and its §Fix constraint 4
  routes around it rather than fixing it. A 0258 fixer therefore must not
  reword either side. `0086` (fixed, 0.230.0) established the oracle; its
  §Residuals item 1
  (`0086-subagent-wire-parse-failed-no-emitter.md:547–551`) files this row's
  *tail* non-conformance forward — the CR that became 0258 — and names no
  wording divergence. `0189` (fixed, 0.129.0) quotes the
  registry template at its `:252` table without asserting the shipped bytes.
- Filing origin: found and verified independently while filing 0258.
