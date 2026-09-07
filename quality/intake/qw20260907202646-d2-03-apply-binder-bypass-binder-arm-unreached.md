---
id: pending
title: applyBinderBypass's `binder` switch arm and the `bypassed` flag it exists to signal are unreached — every call site pre-branches on the decision kind
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/binder-envelope.ts:253-285
  - src/extension/production-theta-producer.ts:918-931
  - tests/binder-bypass-envelope.test.ts:244-262
  - tests/proto-named-record-write-sites.test.ts:247-254
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# applyBinderBypass's `binder` switch arm and the `bypassed` flag it exists to signal are unreached — every call site pre-branches on the decision kind

## Observation

`applyBinderBypass` accepts a `BinderBypassDecision` of any of its three kinds
and returns a `BinderBypassArgs` carrying a `bypassed: boolean` whose only
purpose is to distinguish the `binder` decision (`bypassed: false`) from the two
bypass decisions (`bypassed: true`). All four call sites in the repository —
one in production, three in tests — establish that the decision is not `binder`
before calling: the production caller is inside an `if (decision.kind !==
"binder")` block, one test harness throws unless the decision is
`single-string-bypass`, and the two direct unit calls pass decision literals of
the two bypass kinds. The `case "binder"` arm therefore never executes, and
`bypassed` is `true` at every read that exists.

## Evidence

src/binder/binder-envelope.ts:253-285 — the flag, its doc, and the arm:

```ts
/** The result of applying a bypass decision — no binder/LLM call is made. */
export interface BinderBypassArgs {
  /** Whether the invocation was bypassed (true for both bypass kinds). */
  readonly bypassed: boolean;
```

```ts
export function applyBinderBypass(input: ApplyBinderBypassInput): BinderBypassArgs {
  const { decision } = input;
  switch (decision.kind) {
    case "no-params-bypass":
      return { bypassed: true, args: {} };
    case "single-string-bypass":
      return {
        bypassed: true,
        args: { [decision.wireName]: trimSlashArgumentWhitespace(input.slashArguments) },
      };
    case "binder":
      return { bypassed: false, args: {} };
  }
}
```

Call site 1 — src/extension/production-theta-producer.ts:918-931 (the only
production call site; the guard at :919 excludes the `binder` kind, and the
result's `bypassed` field is not read):

```ts
    const decision = classifyBinderBypass(params.fields);
    if (decision.kind !== "binder") {
```

```ts
      const bypass = applyBinderBypass({ decision, slashArguments: binderInput.args });
      return { bound: true, args: bypass.args };
    }
```

Call site 2 — tests/binder-bypass-envelope.test.ts:244-252 (decision literal is
`single-string-bypass`; asserts `bypassed` is `true`):

```ts
    const result = applyBinderBypass({
      decision: { kind: "single-string-bypass", wireName: "prompt" },
      slashArguments: "  hello world \n",
    });
```

```ts
    expect(result.bypassed).toBe(true);
```

Call site 3 — tests/binder-bypass-envelope.test.ts:255-262 (decision literal is
`no-params-bypass`; asserts `bypassed` is `true`):

```ts
    const result = applyBinderBypass({
      decision: { kind: "no-params-bypass" },
      slashArguments: "ignored",
    });
    expect(result.bypassed).toBe(true);
```

Call site 4 — tests/proto-named-record-write-sites.test.ts:247-254 (the harness
throws unless the decision is `single-string-bypass`, then calls):

```ts
  if (decision.kind !== "single-string-bypass") {
    throw new Error(
```

```ts
  const applied = applyBinderBypass({ decision, slashArguments: SLASH_ARGUMENTS });
```

Site count: `grep -rnE "applyBinderBypass\(" src extensions tools tests
--include=*.ts` returns exactly these four call sites plus the declaration at
src/binder/binder-envelope.ts:272. `grep -rn "bypassed" src extensions tools
tests --include=*.ts` returns the two reads quoted above
(tests/binder-bypass-envelope.test.ts:251, :260), both asserting `true`; no
site anywhere reads `bypassed` expecting `false`.

## Why this is a problem

Dead branch, proven dead: the `case "binder"` arm has no reachable caller — the
production caller structurally excludes it and no test constructs it — so the
`bypassed` field it exists to distinguish is a constant at every read. A
boolean whose two-valuedness no caller can observe is a vestigial flag: it
advertises a distinction (`bypassed: false` meaning "the caller must run the
binder") that the calling convention has already decided one level up, and it
makes `applyBinderBypass`'s signature claim it is total over
`BinderBypassDecision` when the only decisions it is ever handed are the two
bypass kinds. Its doc-comment at :269-270 ("Returns `bypassed: false` for a
`binder` decision (the caller runs the binder)") documents a contract no caller
uses.

## Suggested direction (non-binding, optional)

Consider narrowing the parameter to the two bypass kinds so the arm and the
flag both fall away, or leave the arm and drop the flag — the arm is what the
switch's exhaustive-return typing needs, the flag is what nothing needs.

## False-positive check

- Call-site enumeration: `grep -rnE "applyBinderBypass\(" src extensions tools
  tests --include=*.ts` — 5 hits, one being the declaration; the four call
  sites are all quoted above and each was read in context to establish the
  decision kind reaching it.
- Field-read search: `grep -rn "bypassed" src extensions tools tests
  --include=*.ts` — the only property reads are
  tests/binder-bypass-envelope.test.ts:251 and :260 (both `.toBe(true)`); every
  other hit is unrelated prose using the English word ("binder bypassed",
  "inference is bypassed").
- Re-export / dynamic-access check: `grep -rn "export \*" src extensions tools
  --include=*.ts` returns nothing (no export-star barrels), and no
  `["bypassed"]` or computed-key access to the field appears in the tree.
- Test-only-caller check: performed. This is not a "tests are the only callers"
  case — production does call `applyBinderBypass` (:929); the claim is that no
  caller, production or test, reaches the `binder` arm or observes
  `bypassed === false`.
- Spec fail-closed check: docs/spec_topics/binder/binder-bypass-and-envelope.md
  §Binder bypass specifies the classification and the two bypass behaviours; it
  does not require an apply function that accepts a `binder` decision, so this
  arm is not a spec-mandated fail-closed path.
- Not a behaviour claim: nothing here asserts the code is wrong. The production
  guard at :919 and this arm agree; the arm simply has no reachable input.

## Triage
