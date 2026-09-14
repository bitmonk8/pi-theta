---
id: PTQ-0318
title: emitSourceFailure and resolveEntry each carry a parameter whose value is fully determined by a sibling parameter at every call site
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:390-410
  - src/discovery/discovery-walk.ts:200-203
  - src/discovery/discovery-walk.ts:357-365
  - src/discovery/discovery-walk.ts:543-547
  - src/discovery/discovery-walk.ts:738-747
  - src/discovery/discovery-walk.ts:319-355
  - src/discovery/discovery-walk.ts:820-838
  - src/discovery/discovery-walk.ts:908-926
  - src/discovery/discovery-walk.ts:959-987
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/discovery/discovery-walk.ts
wave: qw20260914060226
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# emitSourceFailure and resolveEntry each carry a parameter whose value is fully determined by a sibling parameter at every call site

## Observation
discovery-walk.ts has two module-private functions that each accept a pair
of parameters where, at every real call site, one parameter's value is
completely determined by the other: `emitSourceFailure`'s `code` is always
the fixed diagnostic-code constant that corresponds 1:1 to its own `kind`
argument (9 call sites, 9-for-9), and `resolveEntry`'s (and its sole caller
`collectFromEntries`'s) `descriptor` is present if and only if `explicitFile`
is `true` (2 call-site groups, 2-for-2) — a correlation `resolveEntry`'s own
comment states in support of a non-null assertion on `descriptor`. The job
in both cases (render one of a small fixed set of diagnostics; resolve one
source entry) needs only the one discriminant already being passed; the
second, always-redundant parameter is an extra concept with no independent
degree of freedom in the code as written.

## Evidence

**Concept 1 — `code`/`kind` in `emitSourceFailure`, discovery-walk.ts:390-410:**
```ts
function emitSourceFailure(
  severity: Severity | null,
  code: string,
  source: DiscoverySource,
  descriptorValue: string,
  path: string,
  diagnostics: Diagnostic[],
  kind: "missing" | "unreadable" | "wrong-type",
): void {
  if (severity === null) {
    return; // conventional silent-on-missing
  }
  const descriptor = renderSourceDescriptor(source, descriptorValue);
  const message =
    kind === "missing"
      ? `discovery source path does not exist: ${descriptor}`
      ...
```
The function already branches on `kind` alone to pick the message; `code`
is only ever passed straight through to `diagnostics.push({ severity, code,
… })` with no branching of its own. Every one of its 9 call sites pairs
`code` and `kind` identically (grep for `emitSourceFailure(` across the
file, all 9 non-definition hits):
- :200 `MISSING_SOURCE, …, "missing"`
- :202 `UNREADABLE_SOURCE, …, "unreadable"`
- :358 `MISSING_SOURCE, …, "missing"`
- :361 `UNREADABLE_SOURCE, …, "unreadable"`
- :364 `WRONG_TYPE_SOURCE, …, "wrong-type"`
- :546 `UNREADABLE_SOURCE, …, "unreadable"`
- :740 `MISSING_SOURCE, …, "missing"`
- :743 `UNREADABLE_SOURCE, …, "unreadable"`
- :746 `WRONG_TYPE_SOURCE, …, "wrong-type"`
`MISSING_SOURCE` pairs only with `"missing"`, `UNREADABLE_SOURCE` only with
`"unreadable"`, `WRONG_TYPE_SOURCE` only with `"wrong-type"` — 9 of 9, no
exception.

**Concept 2 — `descriptor`/`explicitFile` in `resolveEntry` (319-330) and
its caller `collectFromEntries` (959-987), discovery-walk.ts:342-355:**
```ts
    case "invalid-extension":
      // An explicit file reference (CLI `--theta` / settings `thetaPaths`) that
      // resolves to a non-`.theta` regular file is an `invalid-extension` error
      // per Lexical §"Extension matching" — the settings/CLI extension check —
      // not `wrong-type-source`. The file does not register. Only an explicit
      // entry reaches this arm (`classifyForSource` gates the kind on
      // `explicitFile`) and every explicit entry names itself, so `descriptor`
      // is present here.
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: normalizePath(path),
        message: `'${descriptor!}' resolves to '${normalizePath(path)}' which does not end in .theta`,
      });
```
The comment states the invariant outright — "every explicit entry names
itself, so `descriptor` is present here" — and the code relies on it via the
non-null assertion `descriptor!`. `resolveEntry` has exactly one call site
(discovery-walk.ts:979, inside `collectFromEntries`'s loop, forwarding both
`entry.descriptor` and the shared `explicitFile` unchanged), and
`collectFromEntries` itself has exactly two call sites, both confirming the
pairing:
- CLI (discovery-walk.ts:821-838): every mapped entry sets
  `descriptor: \`--theta flag #${index + 1}\`` (line 825), and the
  `explicitFile` argument passed at line 836 is `true`.
- Conventional roots (discovery-walk.ts:909-926, run for both `project` and
  `global`): the entry object has no `descriptor` key at all (line
  911-919), and the `explicitFile` argument passed at line 924 is `false`.
2 of 2 call-site groups: `descriptor` present ⟺ `explicitFile === true`.

## Why this is a problem
Neither correlation is enforced by the type system — `code: string` and
`descriptor: string | undefined` carry no compile-time link to `kind` or
`explicitFile` — so a future call site could pass a mismatched pair (e.g.
`kind: "wrong-type"` with `code: UNREADABLE_SOURCE`, or `explicitFile: true`
with no `descriptor`) and nothing would catch it: the first would mint a
wrongly-coded diagnostic silently, and the second would make the
`descriptor!` assertion at line 354 unsound, interpolating the literal
string `"undefined"` into a user-facing message. This file already treats
exactly this class of risk — two independently-threaded values that must
stay in sync but aren't derived from one — as a real, cited defect: its own
`renderSourceDescriptor`/`emitSourceFailure` doc comment (386-389) explains
that descriptor rendering was unified into one function specifically "so one
source rejected by two different observers … never renders under two
grammars for the same pass (bug 0461)." The `code`/`kind` and
`descriptor`/`explicitFile` pairs are the same shape of risk, left
unreconciled a few lines away from where that exact lesson is stated.

## Suggested direction (non-binding, optional)
Derive `code` from `kind` inside `emitSourceFailure` via the same three-way
mapping the function already uses for `message` (removing the `code`
parameter), and fold `descriptor`/`explicitFile` into one value — e.g. keep
only `descriptor: string | undefined` and let `resolveEntry` test
`descriptor !== undefined` where it currently reads `explicitFile`. Named as
a hypothesis only; a human confirms no other call site (inside or outside
this file) relies on passing a mismatched pair on purpose.

## False-positive check
Grepped every `emitSourceFailure(` call in discovery-walk.ts (9 non-definition
hits) and every `collectFromEntries(`/`resolveEntry(` call (2 and 1
respectively) and read each one in full context; the code/kind and
descriptor/explicitFile pairings hold at 100% of the live call sites, with
no exception found. Confirmed both functions are module-private (0 importers
outside this file per the structural map), so no external caller — production
or test — could be relying on an independent combination this review did not
see. Checked for a stated rationale for the redundancy (the D2 "knob whose
rationale is stated in code… is a design decision" carve-out): the only
comment addressing either parameter (350-353) states the CORRELATION, not a
reason for keeping the two threaded independently, so this is not a
documented design decision being second-guessed — no such decision is
recorded. No `docs/spec_topics/` clause names the `code`/`kind` or
`descriptor`/`explicitFile` shape (both are internal call plumbing, not a
spec-enumerated form), so no `challenges_spec` applies. This is distinct from
the D9 breakdown filings already on this file (`resolveSettingsSource`,
`discoverThetas`, `resolveSlashNames`) and from the D2 filings already in
this wave (the DISC-7 mislabel and the `walkTree` header claim) — none of
those name this redundant-parameter shape.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting independently re-verified: emitSourceFailure's code/kind pairing holds 9-for-9 at every call site (200,202,358,361,364,546,740,743,746, each of MISSING_SOURCE/UNREADABLE_SOURCE/WRONG_TYPE_SOURCE pairing only with its own kind), and code-registry-load.md pins that same kind↔code mapping permanently, so deriving code from kind drops no spec-required behaviour; resolveEntry's descriptor/explicitFile holds 2-for-2 (CLI :825/:836 sets descriptor+true, conventional roots :919/:924 omit descriptor+false), both functions confirmed module-private (0 importers outside this file), and the only comment on either parameter states the correlation rather than a rationale for keeping them independent (no rationale-stated-knob carve-out applies, no docs/spec_topics clause is dropped); per the D8 protocol an accurate accounting caps at questionable — never confirmed — since adopting either simpler shape is a human design call (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): both simplifications. In src/discovery/discovery-walk.ts emitSourceFailure derives code from kind through the same three-way mapping it already uses for message (MISSING_SOURCE / UNREADABLE_SOURCE / WRONG_TYPE_SOURCE, as code-registry-load.md pins) and loses its code parameter at all nine call sites; resolveEntry loses explicitFile and tests `descriptor !== undefined` where it read explicitFile (both call-site pairs are correlated 2-for-2). Both functions are module-private; behaviour identical; no spec change. This D8 lane runs only when no D9 lane owns discovery-walk.ts that wave (host-lane rule).
