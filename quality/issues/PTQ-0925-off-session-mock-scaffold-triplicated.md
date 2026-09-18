---
id: PTQ-0925
title: The scripted off-session complete() vi.hoisted/vi.mock scaffold and its beforeEach/afterEach reset pair are byte-identical across three in-scope files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s5-binder-echo-emission.test.ts:36-50
  - tests/e2e-s5-binder-echo-emission.test.ts:93-99
  - tests/echo-array-per-element-descriptor.test.ts:123-137
  - tests/echo-array-per-element-descriptor.test.ts:276-282
  - tests/echo-value-rule1-sanitisation.test.ts:98-112
  - tests/echo-value-rule1-sanitisation.test.ts:485-491
sites: 3
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The scripted off-session complete() vi.hoisted/vi.mock scaffold and its beforeEach/afterEach reset pair are byte-identical across three in-scope files

## Observation
`tests/e2e-s5-binder-echo-emission.test.ts`, `tests/echo-array-per-element-descriptor.test.ts` and `tests/echo-value-rule1-sanitisation.test.ts` each independently declare, module-scope: a `scripted` holder built with `vi.hoisted(() => ({ replyFor: undefined as undefined | ((context: unknown) => unknown) }))`, immediately followed by `vi.mock("@earendil-works/pi-ai/compat", ...)` whose factory spreads the real module and replaces only `complete` with `vi.fn(async (_model, context) => scripted.replyFor?.(context))`. Each file also carries the identical two-hook reset pair — `beforeEach(() => { scripted.replyFor = undefined; })` and `afterEach(() => { vi.clearAllMocks(); })` — immediately after its imports. Both blocks, including their comments, are byte-identical in all three files.

## Evidence

`tests/e2e-s5-binder-echo-emission.test.ts:36-50`:
```ts
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});
```

`tests/echo-array-per-element-descriptor.test.ts:123-137` — byte-identical:
```ts
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});
```

`tests/echo-value-rule1-sanitisation.test.ts:98-112` — byte-identical:
```ts
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});
```

The reset pair, byte-identical in all three files:

`tests/e2e-s5-binder-echo-emission.test.ts:93-99`:
```ts
beforeEach(() => {
  scripted.replyFor = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});
```

`tests/echo-array-per-element-descriptor.test.ts:276-282` and `tests/echo-value-rule1-sanitisation.test.ts:485-491` reproduce the same six lines verbatim.

Exact search and hit count: `grep -n "replyFor: undefined as undefined" tests/*.test.ts` returns 14 files repository-wide, of which the three above are the in-scope files reviewed here; `grep -n "scripted.replyFor = undefined;$" tests/*.test.ts` confirms the same three in-scope files each carry the reset line at the cited location.

## Why this is a problem
Three files under review each type the same 15-line mock-wiring block and the same 6-line reset pair rather than importing them once. `tests/helpers/scripted-live-session-harness.ts` already exports `scriptEnvelope(scripted, envelope)`, which takes the caller's `scripted` holder as a parameter — the holder-construction and the `vi.mock` factory that feeds it are the one piece of this rig that stays locally declared in every file that wants to drive the off-session binder path, so the three copies exist purely because nothing packages the declaration + reset pair once.

## Suggested direction (non-binding, optional)
Noting that `tests/helpers/scripted-live-session-harness.ts` already exports `scriptEnvelope` for the holder these three files build locally is an observation that the holder/mock/reset block has no paired export yet, not a design for adding one.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; the cited code is mock/harness wiring, not a pinned count or inventory.
- Recording-double check: `scripted.replyFor` is a positive scripted-reply seam (what the mocked `complete()` returns), not a "never called" negative witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "vi.hoisted\|vi.mock(\"@earendil-works/pi-ai/compat\")" docs/bugs/*.md` finds no doc marking this exact scaffold as a documented correct-reason red; docs/bugs/0087 and 0092 name the two echo files by cell range only, not by this mock block.
- coverage-matrix/bug-doc citation search: `grep -n "e2e-s5-binder-echo-emission\|echo-array-per-element-descriptor\|echo-value-rule1-sanitisation" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the mock-wiring/reset declaration be imported rather than retyped.
- Coverage check: the claim is about a repeated harness-wiring DEFINITION; each file's own tests already exercise their own copy, so this is not a coverage-gap claim.
- Prior-finding check: `grep -rl "replyFor: undefined as undefined" quality/issues/*.md quality/resolved/*.md quality/intake/*.md` → 0 hits; PTQ-0736 tracks a different, `queue`/`calls`-based mock scaffold across eight other files (absent from its location list are all three files cited here); PTQ-0454 and PTQ-0463 (both `status: fixed`) tracked the `CapturedNote`/`parseDeps`/`rootDouble`/`producerWithCapture`/`ctxDouble`/`noteChannelEntries`/`scriptEnvelope` septet across this same three-file lineage and have since landed — the three files now import all seven of those pieces from `tests/helpers/scripted-live-session-harness.ts` and `tests/helpers/tool-call-dispatch-harness.ts`, confirmed by re-reading each file's import block; the `vi.hoisted`/`vi.mock` scaffold and the reset pair are the residue those fixes left untouched.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified D7 boilerplate/copy-paste double: mktemp `diff` of the 15-line `vi.hoisted`/`vi.mock("@earendil-works/pi-ai/compat")` block at e2e-s5:36-50 vs echo-array:123-137 vs echo-value:98-112 and of the 7-line `beforeEach`/`afterEach` reset pair at :93-99 / :276-282 / :485-491 both exit 0 (byte-identical, comments included); all three copies are live (each file's `scriptEnvelope(scripted, …)` calls write the holder the mock reads); no `tests/helpers/` module calls `vi.mock`/`vi.hoisted` (0 hits) so nothing packages the scaffold, and vitest 2.x's `hoistMocksPlugin` runs with `filter → true` on every module (cli-api chunk :8728-8737), so a helper-hosted scaffold is a supported, mechanical dedupe with only an import-order caveat (helper before `../src` imports) — the same shape already ruled confirmed for the sibling `queue`/`calls` scaffold in PTQ-0736; not a duplicate: PTQ-0736's mock body (queue, calls, empty-queue throw, `Math.min` sticky-last) is materially different and lists none of these files, PTQ-0795's triage note already treats the `replyFor` holder as distinct from it, and resolved PTQ-0454/0463 inventoried the CapturedNote/parseDeps/rootDouble/producerWithCapture/ctxDouble/noteChannelEntries/scriptEnvelope septet only (their location ranges start at e2e-s5:76/:89, below the :36-50 scaffold, and neither names the reset hooks) — the helper's own `scriptEnvelope` doc (:230 "the mutable holder stays in the caller's vi.hoisted mock scope") confirms this block is the residue their fix left local; none of the three files is a gate, `scripted.replyFor` is a positive reply seam not a negative recording witness, docs/bugs greps hit only 0007/0012/0182 describing the mocking technique generically, coverage-matrix → 0; two notes for the fixer: the exact holder string greps to 13 files not the stated 14 (b0481 and binder-forced-tool-dispatch carry a diverged call-ordinal `replyFor` variant, not this block), and `tests/b0381-echo-object-first-field-declaration-order.test.ts:57` and `tests/b0397-binder-failure-note-runtime-event.test.ts:48` carry the byte-identical 15-line block plus the reset line (:247 / :409) and should be folded into the same helper at fix time (triage: claude-fable-5-1)
