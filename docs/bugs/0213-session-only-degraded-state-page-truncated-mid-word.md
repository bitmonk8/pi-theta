# Bug 0213 — `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` ends mid-word at HEAD: its last line stops at `required by the [*Runtime-construc`, so the page's only normative statement about what a sub-step-2 stamp throw does to `details.event.theta` has no predicate, no link target and no closing clause — and the two further bullets the same paragraph carried before the truncating commit (the `reload-teardown-timeout` / `cancelled-by-session-shutdown` co-emission exception that `code-registry-runtime.md`'s widened never-both clause still cites this anchor for, and the stated reason the gap is *accepted*) are gone with it

- **Status:** open. §Fix is constraint-pinned: two routes are named below —
  restore the truncated text from history under the current vocabulary, or
  re-derive it from the governing prose that cites this anchor. The run
  adjudicates. Measured below: the pre-truncation text exists verbatim in git
  history and the inbound citations at HEAD state what the missing content must
  cover, so both routes are available and they differ in scope, not in outcome
  for the first bullet.
- **Sev/Diff estimate:** S4/D1 — a spec page whose last sentence is cut mid-word
  where the runtime behaviour it describes is correct and unaffected; D1 because
  the edit is confined to one paragraph in one file, adds no registry row and no
  anchor, and the pre-truncation bytes are recoverable from a single `git show`.
- **Kind:** spec-prose defect (truncated write). No `theta/*` code, registry row
  or REQ-ID changes, and no implementation behaviour is engaged. Every anchor
  other pages link into this file (`#session-swap-fail-fast-tripwire`,
  `#session-only-reason-degraded-state`, `#substep-2-stamp-throw-residual-gap`)
  is present, so the truncation breaks no inbound link — it removes prose.
- **Affected** (every citation verified at HEAD `689fc630`, v0.137.0):
  - `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` —
    29 lines, 9526 bytes, LF, terminal newline present. Line 29 is the file's
    last line and ends `…so the slash-name discriminator required by the
    [*Runtime-construc`. The token is cut inside the word *Runtime-constructed*
    and inside an unclosed Markdown link, so the sentence has no predicate and
    the link has no target.
  - The same file, `:27` — the `<a id="substep-2-stamp-throw-residual-gap"></a>`
    paragraph the truncated bullet belongs to. It is titled "**Accepted theta
    1.0 residual gap — sub-step-2 stamp-throw case**" and states the composite
    evidence for the gap. It is the only paragraph on the page carrying a bullet
    list, and that list now has one incomplete item.
  - The same file, `:20–25` — `### Still-true operational notes (tripwire
    path)`, the section the residual-gap paragraph closes. Complete.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:52` — the link target the
    truncated reference was reaching: `<a
    id="session-shutdown-details-conventions"></a>` and, inside it, the
    *Runtime-constructed sibling carve-out* clause, which makes
    `details.event.theta` on `theta/runtime/cancelled-by-session-shutdown` "a
    **runtime-constructed sibling** under the `details.event.` prefix — not an
    SDK-derived `SessionShutdownEvent` field", exempt from the `{reason}`
    closed-shape strictness pin, and which requires operator tooling to
    whitelist it. Present and complete; the anchor resolves.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:39` — the
    `theta/runtime/cancelled-by-session-shutdown` row (one 11,719-character
    line). It cites `session-only-degraded-state.md#substep-2-stamp-throw-residual-gap`
    three times as the owner of the stamp-throw path, and its
    `<a id="cancelled-by-session-shutdown-mutual-exclusion"></a>` never-both
    EXCEPT clause — widened by bug 0208 — states that the dual appearance is
    "enumerated in PIC's `session-only-reason-degraded-state` bullet, `abort()`
    was skipped". The bullet it names as the enumeration is one of the two the
    truncating commit dropped.
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:19`
    — the **Per-invocation operator visibility (clean-cancel path)** rule the
    truncated bullet's subject depends on (the `finally` that reads
    `entry.shutdownReason`). Complete.
  - **History.** `git log --oneline --` on the file returns six commits. The
    truncation is introduced by `cbbe8c94` ("spec: resolve host-prereq clause (a)
    governed-by-rebind; retire session-only degraded branch for fail-fast
    tripwire"), whose diffstat for this file is `18 insertions(+), 101
    deletions(-)` and whose LAST added line is the incomplete bullet. Its parent
    `bfc622a5` had the file at 112 lines. Line counts at each later revision:
    `cbbe8c94` 29 / 8110 bytes, `a49a595b` 29 / 8074, `2bc69157` (the Loom →
    Theta rename) 29 / 8097, `689fc630` (HEAD) 29 / 9526. So every revision
    after the truncating commit inherits the cut, and no later commit restored
    it.
  - **The pre-truncation text**, at `4189c6c1` (pre-rename vocabulary, same
    file, `:88`): the bullet ends `…required by the [*Runtime-constructed
    sibling carve-out*](../diagnostics/diagnostic-shape.md#session-shutdown-details-conventions)
    on every \`loom/runtime/cancelled-by-session-shutdown\` emission survives in
    canonical form.` The same revision carries two further bullets in the same
    list, quoted in §Reproduction.
  - **No mirror, and no gate that can see it.** `docs/reference/` holds no page
    mirroring this one (`docs/reference/diagnostics.md` mirrors registry rows
    only). Two default-suite gates do read the spec corpus:
    `tests/code-registry.test.ts:51` reads `docs/spec_topics/diagnostics/`
    pages only, and the closing-gate live-corpus canary
    (`tools/closing-gate/live-corpus.js:123`, driven by
    `tests/warn-only-canary.test.ts` and
    `tests/live-corpus-release-gate.test.ts`) walks all of
    `docs/spec_topics/**`. The canary's gap kinds
    (`live-corpus.js:51–58`) are REQ-ID mapping, per-facet citing tests, and
    normative-MUST anchoring / page-rowing; the truncated bullet contains no
    `MUST` and no REQ-ID, so no gap kind has a subject. Nothing in the default
    suite can red on a truncated sentence.
- **Related:**
  - [0208](./0208-post-deadline-dual-surface-clean-cancel-and-teardown-timeout.md)
    — fixed (0.137.0). Its fix edited exactly one line of this file (`:27`, the
    residual-gap paragraph) and widened the `code-registry-runtime.md`
    never-both EXCEPT clause that cites this anchor and names the dropped
    co-emission bullet as its enumeration. The truncation pre-exists that fix:
    `git show 689fc630 -- <file>` is a one-line replacement at `:27`, and
    `cbbe8c94` is where line 29 was first written incomplete.
  - [0216](./0216-shutdown-reason-classification-unwired.md) — open. Same
    subsystem, disjoint subject: 0216 is about two host rows having no
    production caller, this report is about a truncated page. The two host rows
    0216 covers are named in this page's `:27` composite-evidence sentence, so
    whichever lands second re-reads that sentence; neither blocks the other.
- **Observed at:** v0.137.0 (`689fc630`, `package.json:3`). Offline,
  deterministic, provider-free: file reads, `wc`, and `git log` / `git show`
  against committed revisions. No test was run and no probe was written.

## Summary

The page ends mid-word.

`docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` is 29
lines and 9526 bytes at HEAD, and its last line — the sole bullet under the
`#substep-2-stamp-throw-residual-gap` paragraph — stops at `required by the
[*Runtime-construc`. The word *Runtime-constructed* is cut, the Markdown link is
unclosed, and the sentence has no predicate. What the bullet was stating is
recoverable: that on a stamp throw, `details.event.reason` degrades to the
`"<unreadable>"` sentinel while `details.event.theta` is unaffected, "so the
slash-name discriminator required by the *Runtime-constructed sibling carve-out*
(`diagnostic-shape.md:52`) on every `theta/runtime/cancelled-by-session-shutdown`
emission survives in canonical form" — the closing clause is what is missing, so
the page asserts the two-field split and then never says what it buys.

The truncation was introduced by `cbbe8c94`, the commit that retired the
degraded-state branch in favour of the fail-fast tripwire. That commit rewrote
the page (18 insertions, 101 deletions, from 112 lines to 29) and its last
inserted line is the incomplete bullet. Two further bullets that stood in the
same list in its parent revision are gone with it:

- the co-emission bullet, stating that the pairing of a `reload-teardown-timeout`
  `<list>` entry with a later `cancelled-by-session-shutdown` from the same
  invocation's own `finally` is the residual-gap exception to the never-both
  invariant; and
- the acceptance rationale, stating why the gap is accepted rather than routed
  to a new diagnostic with an extended `details.step` enumeration.

Both are still load-bearing at HEAD. `code-registry-runtime.md:39`'s never-both
EXCEPT clause — the clause bug 0208 widened — cites this anchor and says the
skipped-`abort()` case is "enumerated in PIC's
`session-only-reason-degraded-state` bullet". The enumeration it points at is the
dropped bullet. And the paragraph at `:27` is titled "**Accepted** theta 1.0
residual gap" while the page no longer states on what ground it is accepted.

Nothing gates this. No `docs/reference/` page mirrors this file; the two
spec-reading gates in the default suite key on diagnostics-registry pages
(`tests/code-registry.test.ts:51`) and on normative-MUST / REQ-ID coverage
(`tools/closing-gate/live-corpus.js`), and the truncated bullet carries neither
a `MUST` nor a REQ-ID; and all three anchors other pages link into this file are
present — so the cut removes prose without breaking a link, and four successive
commits (`cbbe8c94`, `a49a595b`, `2bc69157`, `689fc630`) carried it forward, the
last of them editing the paragraph immediately above it.

## Reproduction

Offline, at `689fc630`. Verbatim:

```
$ wc -l -c docs/spec_topics/pi-integration-contract/session-only-degraded-state.md
  29 9526 docs/spec_topics/pi-integration-contract/session-only-degraded-state.md

$ tail -c 120 docs/spec_topics/pi-integration-contract/session-only-degraded-state.md
on, before the sub-step-2 stamp, and never mutated), so the slash-name discriminator required by the [*Runtime-construc
```

The file's last byte is `0a`, so the cut is inside the line's content, not a
missing terminal newline.

```
$ git log --oneline -- docs/spec_topics/pi-integration-contract/session-only-degraded-state.md
689fc630 fix(bugs-0207,0208): docs batch — witness-comment attributions + the post-deadline dual-surface carve-out — v0.137.0
2bc69157 Rename Loom -> Theta across the corpus
a49a595b Remove build-to-release process cruft; declutter repo
cbbe8c94 spec: resolve host-prereq clause (a) governed-by-rebind; retire session-only degraded branch for fail-fast tripwire
4189c6c1 pi-loom spec-plan: fix 14 blocker/high findings (3 blocker + 11 high); prune from store
e97f7003 pi-loom spec-plan: fix F-2231 — bring sub-step 3 Clock calls under teardown throw-isolation (details.step:3)
```

Line count and byte count per revision (`git show <rev>:<path> | wc -l -c`):
`4189c6c1` 112 lines / 35199 bytes; `cbbe8c94` 29 / 8110; `a49a595b` 29 / 8074;
`2bc69157` 29 / 8097; `689fc630` 29 / 9526.

`git show --stat cbbe8c94 -- <path>` reports `1 file changed, 18 insertions(+),
101 deletions(-)`, and the last `+` line of that diff is the incomplete bullet
(pre-rename vocabulary):

```
+- If the affected invocation's `finally` later reaches the **Per-invocation operator visibility (clean-cancel path)** rule (e.g. a downstream cancellation eventually settles its `disposeBarrier`), th…
```

The complete pre-truncation bullet, `git show
4189c6c1:docs/spec_topics/pi-integration-contract/session-only-degraded-state.md`
line 88, tail verbatim:

```
…so the slash-name discriminator required by the [*Runtime-constructed sibling carve-out*](../diagnostics/diagnostic-shape.md#session-shutdown-details-conventions) on every `loom/runtime/cancelled-by-session-shutdown` emission survives in canonical form.
```

The two bullets that followed it at that revision, verbatim (lines 89–90):

```
   - This co-emission (the entry in sub-step 3's `reload-teardown-timeout` `<list>` **and** a later `cancelled-by-session-shutdown` from its own `finally`) is the sole residual-gap exception the [`cancelled-by-session-shutdown` mutual-exclusion clause](../diagnostics/code-registry-runtime.md#cancelled-by-session-shutdown-mutual-exclusion) calls out to its "never both" invariant; consumers may treat the dual appearance as a residual-gap signal, not a contract violation.
   - Accepted (rather than routing the per-entry `catch` arm to a new diagnostic with an extended `details.step` enumeration) because a stamp throw on a `Set` entry the runtime itself allocates as a plain mutable object (its `shutdownReason` is `undefined` at insertion and is never frozen/proxied/write-rejecting by the runtime) is low-probability.
```

What still cites the missing content at HEAD:

```
$ rg -o "session-only-degraded-state\.md#[a-z0-9-]*" docs/ | sort -u
session-only-degraded-state.md#session-only-reason-degraded-state
session-only-degraded-state.md#session-swap-fail-fast-tripwire
session-only-degraded-state.md#substep-2-stamp-throw-residual-gap
```

All three anchors exist in the file (`:5`, `:6`, `:27`).
`docs/spec_topics/diagnostics/code-registry-runtime.md:39` cites the third one
three times, and its never-both EXCEPT clause reads, in part: "…enumerated in
PIC's `session-only-reason-degraded-state` bullet, `abort()` was skipped) AND
later emit `cancelled-by-session-shutdown` (if the per-invocation `finally`
eventually settles via a downstream cancellation that reaches the
**Per-invocation operator visibility (clean-cancel path)** rule pinned in PIC)".
The link target of the truncated reference,
`docs/spec_topics/diagnostics/diagnostic-shape.md:52`, is present and states the
carve-out the bullet was invoking.

## Expected behaviour

The page's last paragraph is complete prose. The residual-gap bullet states the
`"<unreadable>"` substitution on `details.event.reason`, the non-substitution on
`details.event.theta`, and the consequence — that the slash-name discriminator
the *Runtime-constructed sibling carve-out*
(`diagnostic-shape.md#session-shutdown-details-conventions`) requires on every
`theta/runtime/cancelled-by-session-shutdown` emission survives in canonical
form. A paragraph titled "Accepted … residual gap" states the ground of
acceptance. Where another page cites this anchor as the enumeration of a case
(`code-registry-runtime.md:39`), the enumeration is on the page.

## Actual behaviour / root cause

The file's final line is cut mid-token: `required by the [*Runtime-construc`.
The sentence has no predicate, the Markdown link is unclosed and resolves to
nothing, and the two bullets that completed the list are absent.

Root cause is a truncated write in `cbbe8c94`, not a deliberate retirement. The
commit's purpose was to replace the degraded-state branch with the fail-fast
tripwire, and it deliberately dropped whole sections (`## Idempotent re-entry and
the all-three-throw corner case`, `## Acceptance criteria`, `## Emergent
fast-path`, and two of the three residual-gap items in `## Accepted loom 1.0
residual gaps`). A deliberate drop ends at a boundary; this one ends inside a
word, on the diff's last inserted line, which is the signature of a truncated
write rather than an edit. The three commits after it (`a49a595b`, `2bc69157`,
`689fc630`) touched the file without reading past that line — the last of them,
bug 0208's fix, replaced line 27 immediately above it.

Nothing detects the state: no `docs/reference/` mirror; the closing-gate
live-corpus canary walks the page but recognises only un-anchored MUSTs,
un-rowed pages and REQ-ID coverage gaps, none of which the truncated bullet
presents; and the three anchors that other pages link into the file are all
above the cut, so anchor resolution cannot see it either.

## Why it matters

- **A cited enumeration is not on the page.** `code-registry-runtime.md:39`'s
  widened never-both EXCEPT clause, shipped by bug 0208, sends a reader to this
  anchor for the enumeration of the skipped-`abort()` case and for the
  distinction between the residual-gap dual appearance and the ordinary
  post-deadline one. What survives here is the composite-evidence sentence at
  `:27`; the bullet the clause names is gone.
- **An accepted gap with no stated ground.** The paragraph asserts acceptance.
  The rationale that made it assessable — that the throw requires a `Set` entry
  the runtime allocates as a plain mutable object to be frozen, proxied or
  write-rejecting — is not on the page, so a future edit that changes the cost
  of closing the gap has no recorded baseline to be assessed against, which is
  exactly what the residual-gap convention exists to provide.
- **The `details.event.theta` invariant is asserted and left unexplained.** The
  surviving half says the field is unaffected; the missing half says what that
  buys (the slash-name discriminator the carve-out requires). An operator-tooling
  author reading the page finds a field-level claim with no contract attached.
- **A mid-word ending signals loss, and readers cannot tell how much.** Nothing
  in the file marks how much text is missing, so any reader of the page must
  reconstruct scope from history — which four commits did not do.

## Fix

**Complete the paragraph.** The truncated bullet gets its closing clause, and the
paragraph's list is restored to a state where every claim `code-registry-runtime.md`
cites is on the page. Two routes are named; the run adjudicates. They agree on
the first bullet and differ on the other two.

*Route A — restore from history.* Take the pre-truncation bytes from
`4189c6c1:docs/spec_topics/pi-integration-contract/session-only-degraded-state.md`
lines 88–90 and re-apply the corpus vocabulary in force at HEAD: `loom` →
`theta` (the `2bc69157` rename), `loom/runtime/cancelled-by-session-shutdown` →
`theta/runtime/cancelled-by-session-shutdown`, and `loomAbort` → `thetaAbort` if
present. Reconcile the restored bullet 2 with bug 0208's widening: at `4189c6c1`
the co-emission was "the sole residual-gap exception … to its 'never both'
invariant", whereas HEAD's clause (`code-registry-runtime.md:39`) makes the dual
appearance the ordinary post-deadline case and requires an additional composite
to classify the stamp-throw gap — so the restored sentence must be re-derived
against the widened clause rather than pasted, and the surviving `:27` sentence
already states that composite. Bullet 3 (the acceptance rationale) restores
verbatim under the rename.

*Route B — re-derive from the governing prose.* Write the missing text from the
pages that cite this anchor, without consulting history:
`diagnostic-shape.md:52` (the *Runtime-constructed sibling carve-out* and the
`details.event.theta` whitelist obligation) fixes the closing clause of bullet 1;
`code-registry-runtime.md:39`'s never-both EXCEPT clause and its stamp-throw
classification requirements fix what bullet 2 must say under 0208's widened
contract; and the acceptance ground for bullet 3 is re-derived from sub-step 2's
per-entry `catch` arm in `session-shutdown-semantics.md:10` and from
`active-invocation-registry.md`'s statement of what an entry is.

Constraints on either route:

1. **The first bullet's closing clause is not optional.** Its subject
   (`details.event.theta` unaffected) is already on the page; the fix states the
   consequence and closes the link to
   `../diagnostics/diagnostic-shape.md#session-shutdown-details-conventions`,
   which resolves at HEAD.
2. **No anchor is added, renamed or removed.** All three existing anchors
   (`:5`, `:6`, `:27`) stay byte-identical; `#substep-2-stamp-throw-residual-gap`
   is cited three times from `code-registry-runtime.md:39` and once from this
   page.
3. **No registry row, *Trigger* or *Message* changes**, so DIAG-2
   (`diagnostic-shape.md:72`) and its mirror obligation are not engaged and
   `docs/reference/` needs no same-commit edit. `git diff -- docs/reference/`
   stays empty.
4. **The restored text is consistent with bug 0208's shipped clause**, not with
   the pre-0208 one. Any sentence claiming the dual appearance is by itself a
   residual-gap signal contradicts `code-registry-runtime.md:39` and must not be
   restored in that form.
5. **The page ends at a sentence boundary**, LF, terminal newline, and a
   post-fix `tail -c 120` shows a complete clause.

*Ordering.* No dependency. The paragraph edited by bug 0208 (`:27`) is directly
above and stays untouched; report 0216 names the same two `theta/host/*` rows
that `:27`'s composite-evidence sentence keys on, so if 0216 retires those rows
this paragraph is re-read then — that is 0216's edit, not this one's.

## Provenance

- Origin: observed by the bug 0208 fix's orchestrator while editing this file's
  `:27` at its gate, and left unmeasured. This report measures it: the exact cut
  point, the introducing commit and its diffstat, the per-revision line and byte
  counts showing four commits carried the cut forward, the pre-truncation text
  and the two dropped bullets verbatim, the inbound citations that still depend
  on the missing content, and the absence of any mirror or gate that could
  detect it.
- Spec: `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md:5`,
  `:6` (the two anchors), `:7` (the tripwire section), `:20–25` (the still-true
  operational notes), `:27` (the residual-gap paragraph, edited by bug 0208),
  `:29` (the truncated bullet);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:52` (the
  `#session-shutdown-details-conventions` clause and the *Runtime-constructed
  sibling carve-out*), `:72` (DIAG-2, not engaged);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:39` (the
  `cancelled-by-session-shutdown` row, its three citations of
  `#substep-2-stamp-throw-residual-gap`, and the
  `#cancelled-by-session-shutdown-mutual-exclusion` never-both EXCEPT clause bug
  0208 widened);
  `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:10`
  (sub-step 2's per-entry `catch` arm and the no-diagnostic-on-stamp-throw rule),
  `:19` (the **Per-invocation operator visibility (clean-cancel path)** rule).
- History evidence: `git log --oneline --` on the file (six commits);
  `git show --stat cbbe8c94 -- <path>` (`18 insertions(+), 101 deletions(-)`,
  parent `bfc622a5`, 112 lines before);
  `git show <rev>:<path> | wc -l -c` at `4189c6c1`, `cbbe8c94`, `a49a595b`,
  `2bc69157`, `689fc630`; `git show 4189c6c1:<path>` lines 88–90 (the complete
  bullet and the two dropped ones); `git show 689fc630 -- <path>` (bug 0208's
  one-line replacement at `:27`, which does not touch `:29`).
- Reproduction: `wc`, `tail`, `rg` and read-only `git log` / `git show`
  invocations, quoted verbatim in §Reproduction. No test was run, no probe
  written, no file created, no working-tree state changed.
