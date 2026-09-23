---
id: PTQ-1344
title: respondFixture/qry15Body/RespondFixture redeclared byte-for-byte in typed-repair-two-phase.test.ts and typed-two-phase-live.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/typed-repair-two-phase.test.ts:172-216
  - tests/typed-two-phase-live.test.ts:292-338
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# respondFixture/qry15Body/RespondFixture redeclared byte-for-byte in typed-repair-two-phase.test.ts and typed-two-phase-live.test.ts

## Observation
Both files declare, module-scope, the same `RespondFixture` interface, the same
`cachedRespondFixture` memo variable, a `respondFixture()` function with an
identical body (differing only in which module-local theta-source constant is
parsed — `REPAIR1_THETA` vs `TYPED_LIVE_THETA` — and one added comment line in
the live file), and a byte-for-byte identical `qry15Body()` function. Both
files already import the shared "drive a typed-query theta through the live
production harness" pieces (`twoPhaseHarness`, `drive`, `messageText`,
`contextMessagesOf`, `expectErrOfKind`, `expectValue`, `runGovernorRoundProbe`)
from `tests/helpers/scripted-live-session-harness.ts` — the earlier, larger
harness-fork between these same two files was migrated there — but the
`RespondFixture`/`respondFixture`/`qry15Body` trio was left behind, still
declared independently in each file.

## Evidence

`tests/typed-repair-two-phase.test.ts:172-216`:
```ts
interface RespondFixture {
  readonly lowered: LoweredSchema;
  readonly slug: string;
  readonly toolName: string;
}

let cachedRespondFixture: RespondFixture | undefined;

function respondFixture(): RespondFixture {
  if (cachedRespondFixture !== undefined) {
    return cachedRespondFixture;
  }
  const doc = parse(REPAIR1_THETA);
  const decls = doc.body.statements.filter(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema",
  );
  const lowered = lowerQueryResponseSchema("Verdict", decls);
  if (lowered === undefined) {
    throw new Error("fixture defect: the Verdict schema annotation must lower");
  }
  const slug = respondSchemaSlug(lowered);
  cachedRespondFixture = {
    lowered,
    slug,
    toolName: `__theta_respond_${slug}`,
  };
  return cachedRespondFixture;
}
...
function qry15Body(lowered: LoweredSchema, toolName: string): string {
  return (
    "Return your final answer using the `" +
    toolName +
    "` tool, conforming to this schema:\n" +
    JSON.stringify(lowered, null, 2) +
    "\n"
  );
}
```

`tests/typed-two-phase-live.test.ts:292-338` — the counterpart, identical bodies
apart from parsing `TYPED_LIVE_THETA` instead of `REPAIR1_THETA` and one added
comment on the `slug` line:
```ts
interface RespondFixture {
  readonly lowered: LoweredSchema;
  readonly slug: string;
  readonly toolName: string;
}

let cachedRespondFixture: RespondFixture | undefined;

function respondFixture(): RespondFixture {
  if (cachedRespondFixture !== undefined) {
    return cachedRespondFixture;
  }
  const doc = parse(TYPED_LIVE_THETA);
  const decls = doc.body.statements.filter(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema",
  );
  const lowered = lowerQueryResponseSchema("Verdict", decls);
  if (lowered === undefined) {
    throw new Error("fixture defect: the Verdict schema annotation must lower");
  }
  // The slug recipe (bug 0010 design; bug 0099 route A): the canonical-form
  // slug (schema-subset.md §Canonical schema hash) — shared by registration,
  // QRY-15, and QRY-12 so tool name ↔ template references stay byte-equal.
  const slug = respondSchemaSlug(lowered);
  cachedRespondFixture = {
    lowered,
    slug,
    toolName: `__theta_respond_${slug}`,
  };
  return cachedRespondFixture;
}
...
function qry15Body(lowered: LoweredSchema, toolName: string): string {
  return (
    "Return your final answer using the `" +
    toolName +
    "` tool, conforming to this schema:\n" +
    JSON.stringify(lowered, null, 2) +
    "\n"
  );
}
```

Search performed: `grep -n "interface RespondFixture\|let cachedRespondFixture\|^function respondFixture\|^function qry15Body"` against both files — 4 matching declaration names, one-to-one, in both files.

## Why this is a problem
Both files already migrated the larger, previously-forked live-session harness
(`LiveSessionDouble`, `RecordingPi`, `parseDeps`, `parse`, `ajv`, `rootDouble`,
`registryDouble`, `ctxDouble`, `drive`, `respondToolNameOf`, `messageText`,
`contextMessagesOf`, `expectErrOfKind`, `expectValue`, `runGovernorRoundProbe`)
into `tests/helpers/scripted-live-session-harness.ts` and now import it in
both files — the resolved fork this repository already treated as a shared-
helper problem. The `RespondFixture` type, its memoised builder, and the
`qry15Body` renderer are the same shape of "the fixture model / schema-lowering
/ QRY-15 template plumbing that carries no cell-specific variation between the
files" that the helper's own stated purpose already targets, yet this
particular trio was not folded in alongside the rest.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` is the existing, purpose-built
home for exactly this shape (it already carries the sibling pieces both files
import); parameterising `respondFixture` by the theta source string each file
supplies is the natural next step, but the fix stage owns the actual design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (`typed-repair-two-phase.test.ts`, `typed-two-phase-live.test.ts`); the cited
  lines are scaffolding declarations, not a pinned count/inventory assertion.
- Recording-double check: `RespondFixture`/`respondFixture`/`qry15Body` are not
  recording doubles (no call counting, no MUST-NOT witness); the carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rl "typed-repair-two-phase\|typed-two-phase-live" docs/bugs/` finds docs/bugs/0010 (both files listed in its "Regression surface" list as sibling regression suites for the fix, not as a documented correct-reason red covering this duplication) plus 0012/0013/0014/0028/0099/0288/0291/0480 naming `typed-two-phase-live.test.ts` for their own defects; both files pass at HEAD on the cells that use `respondFixture`/`qry15Body`.
- coverage-matrix/bug-doc citation search: `grep -n "typed-repair-two-phase\|typed-two-phase-live" docs/reference/coverage-matrix.md` finds no citation of specific line ranges inside either file's fixture scaffolding; no merge, rename, or deletion of any `it()`/`describe()` is proposed.
- Coverage check: the claim is entirely about a duplicated fixture-builder DECLARATION; each file's own `it()` cells exercise their own copy and continue to pass, so this is not a coverage-gap claim.
- Prior-finding check: `quality/resolved/PTQ-0519-typed-repair-two-phase-harness-duplicated-from-live.md` (fixed) names the larger fifteen-piece harness fork between these same two files but its own list of duplicated pieces (`LiveSessionDouble`, `RecordingPi`, `parseDeps`, `parse`, `ajv`, `rootDouble`, `registryDouble`, `ctxDouble`, `drive`, `respondToolNameOf`, `messageText`, `contextMessagesOf`, `expectErrOfKind`, `expectValue`, `runGovernorRoundProbe`) does not include `RespondFixture`/`respondFixture`/`qry15Body`, and that fix has since landed (both files now import the fifteen pieces from the helper) while this trio remains un-migrated; `quality/resolved/PTQ-0729-02-typed-query-provider-gate-harness-duplicated-from-live.md` (fixed) names this same trio only in its "Suggested direction" prose for a different file pair (`typed-query-provider-gate.test.ts` ↔ `typed-two-phase-live.test.ts`) and does not cite `typed-repair-two-phase.test.ts` as a location — this finding names a distinct file pair and root-cause location, not a re-file.

## Triage
verdict: confirmed — independently re-verified by extract+diff (repair :172-216 ↔ live :292-338): the only differences are `REPAIR1_THETA` vs `TYPED_LIVE_THETA` in `parse(...)` and two comment blocks, and both thetas carry the identical `schema Verdict { score: number }` so the memoised fixture is the same; `tests/helpers/scripted-live-session-harness.ts` exports none of `RespondFixture`/`respondFixture`/`qry15Body` (grep → 0 hits), both copies are live (17 call sites across the two files), neither file is a census/pin gate, and no coverage-matrix/bug-doc citation names these declarations; dedupe: PTQ-0519 (fixed) lists the fifteen-piece harness without this trio, PTQ-0729 (fixed) named it only in its Suggested-direction prose for the gate↔live pair, PTQ-0736 (fixed) covers the vi.hoisted/`assistantReply` scaffold at repair :77-109 / live :65-97 — and TRIAGE_LOG.md:142 explicitly reserved a standalone `respondFixture`/`qry15Body` filing as a separate candidate; correction for the fixer: `sites: 2` undercounts — tests/typed-query-provider-gate.test.ts:199-229 declares a third `RespondFixture`/`cachedRespondFixture`/`respondFixture` (no `qry15Body`) that has DRIFTED to a hand-rolled `createHash("sha256").update(JSON.stringify(lowered)).digest("hex").slice(0,16)` slug instead of `respondSchemaSlug`, so the shared-helper fold should carry that copy along — D7 copy-paste fixture (triage: claude-fable-5-1)
