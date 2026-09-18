---
id: PTQ-0847
title: "conveyance \"is NOT the bare type name\" assertion is entailed by the preceding toEqual(LOWERED) and cannot independently fail"
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typed-query-schema-integration.test.ts:216-229
  - tests/typed-query-schema-integration.test.ts:104-112
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# conveyance "is NOT the bare type name" assertion is entailed by the preceding toEqual(LOWERED) and cannot independently fail

## Observation
In the "QRY-22 lowered-shape conveyance" test, the assertion
`expect(validation.conveyed, "…the conveyance is NOT the bare type name").not.toBe("Report")`
runs immediately after `expect(validation.conveyed, …).toEqual(LOWERED)` has
already passed on the same value. `LOWERED` is a fixed, module-level object
literal (never the string `"Report"`), so once the `toEqual(LOWERED)` check
passes, `validation.conveyed` is already known to structurally equal that
object and the subsequent `.not.toBe("Report")` check is mechanically
guaranteed to pass too — there is no code path in which the first assertion
passes and the second fails.

## Evidence

`tests/typed-query-schema-integration.test.ts:216-229`:
```ts
    expect(
      validation.lowerCalls,
      "QRY-22: the execution path lowers the declared shape (V5d/SUBS-1)",
    ).toBeGreaterThan(0);
    // The forced-respond conveyance carries the LOWERED shape, not the bare
    // type name `"Report"`.
    expect(
      validation.conveyed,
      "QRY-22: the forced-respond conveyance carries the lowered shape",
    ).toEqual(LOWERED);
    expect(
      validation.conveyed,
      "QRY-22: the conveyance is NOT the bare type name",
    ).not.toBe("Report");
```

`tests/typed-query-schema-integration.test.ts:104-112` — `LOWERED` is a fixed
object literal, never the string `"Report"`:
```ts
const LOWERED: LoweredSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    summary: { type: "string" },
  },
  required: ["status", "summary"],
  additionalProperties: false,
};
```

## Why this is a problem
`expect(x).toEqual(LOWERED)` at lines 222-225 requires `x` to be structurally
equal to the object literal shown above. `expect(x).not.toBe("Report")` at
lines 226-229 requires `x` not to be reference-equal (`Object.is`) to the
string `"Report"`. Given `LOWERED` is a fixed object and never the string
`"Report"`, any value that satisfies the first assertion (structural equality
to `LOWERED`) automatically satisfies the second (it cannot simultaneously be
`Object.is`-equal to the unrelated string `"Report"`). The second assertion
therefore adds no independent observational power beyond what the first
assertion already proved in the same test run — it cannot fail without the
preceding assertion having already failed first, mechanically per the
`toEqual`/`toBe` semantics of the two fixed comparison values involved, not
because of any behaviour under test.

## Suggested direction (non-binding, optional)
Since the preceding `toEqual(LOWERED)` assertion already establishes the
conveyance is the lowered object and not the bare type name, the `.not.toBe("Report")`
line adds no coverage the fix stage would need to preserve when addressing this.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin; the
  cited lines are ordinary drive-and-assert `it()` body lines, not a pinned
  count/inventory assertion whose pin is the load-bearing mechanism.
- Recording-double check: `validation.conveyed` is a spy-recorded field
  (`SpyValidation.convey` assigns it) used for a positive "carries this value"
  assertion, not a "never called" MUST-NOT witness; the negative-witness
  carve-out (recording doubles asserting something was never called) does not
  apply — this is a value-content assertion, not a call-count witness.
- docs/bugs/ signature search: `grep -rl "typed-query-schema-integration"
  docs/bugs/` → docs/bugs/0010 (lines 438, 527) and docs/bugs/0055 (lines 495,
  712, 892), both citing the file only as a surviving witness suite / the
  hand-written `LOWERED` edit site; neither discusses or pins the
  `not.toBe("Report")` assertion or a documented correct-reason red covering
  it. `grep -n "bare type name" docs/bugs/*.md docs/reference/coverage-matrix.md`
  → 0 hits.
- coverage-matrix/bug-doc citation search: `grep -n
  "typed-query-schema-integration" docs/reference/coverage-matrix.md` → 0
  hits; no document cites this specific assertion or line range. No merge,
  rename, or deletion of any `it()`/`describe()` is proposed — only that this
  one assertion line is entailed by the assertion immediately preceding it.
- Coverage check: this is not a claim that "the conveyance is not the bare
  type name" is untested — the immediately preceding `toEqual(LOWERED)`
  assertion in the SAME test already establishes exactly that; this is a
  claim about one specific assertion line adding no independent
  observational power, not a missing test path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/typed-query-schema-integration.test.ts:216-229 and :104-112; `validation.conveyed` is declared `LoweredSchema | null` (:146, `Readonly<Record<string, unknown>>` per src/seams/schema-validator.ts:14) and is only ever assigned the `lowered` object at :167, and the `.not.toBe("Report")` at :226-229 immediately follows `.toEqual(LOWERED)` at :222-225 on the same value, so any run reaching it already holds an object structurally equal to the fixed `LOWERED` literal and `Object.is(obj, "Report")` is false by construction — a D7 assertion-that-cannot-fail entailed by its predecessor, not a behaviour probe; stated searches reproduce (docs/bugs cite the file only at 0010:438/527 and 0055:495/712/892 as a witness suite / LOWERED edit site, 0 hits for "bare type name" in docs/bugs or coverage-matrix, 0 coverage-matrix file cites), not a gate file, a positive value assertion rather than a never-called negative witness, no it()/describe() merge/rename/delete proposed; the only other store mention of `conveyed` is same-wave d7-01 (a name-mismatch filing, different root cause) and no PTQ tracks this line — the fix is a mechanical removal of one entailed assertion (triage: claude-fable-5-1)
