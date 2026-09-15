---
id: PTQ-0362
title: b0364 duplicates its broken-directory-link creation and precondition-check block verbatim between cells (6) and (7)
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:309-337
  - tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:376-401
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# b0364 duplicates its broken-directory-link creation and precondition-check block verbatim between cells (6) and (7)

## Observation
tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts's cell (6) and cell (7) each independently create a broken directory junction — `mkdirSync` a target directory, `createDirectoryLink` a link to it, then `rmSync` the target — and then assert the same loud precondition pair: `lstatSync(brokenLinkNative).isSymbolicLink()` must be `true`, and `realpathAsync(brokenLinkNative)` must reject with `ENOENT`, before either cell drives `runWalk`. The two blocks are byte-identical apart from one clause dropped from cell (7)'s `isSymbolicLink` assertion message. Cell (7)'s own comment states "Same loud broken-link precondition as cell 6," naming its own copy source in place of a shared helper.

## Evidence

tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:309-323 — cell (6) (re-read immediately before filing):
```ts
    const goneTargetNative = join(scratchDir, "gone-target");
    const brokenLinkNative = join(scratchDir, "broken");
    mkdirSync(goneTargetNative, { recursive: true });
    createDirectoryLink(goneTargetNative, brokenLinkNative);
    rmSync(goneTargetNative, { recursive: true, force: true });

    // Loud precondition: the link must still `lstat` as a symlink (its target's
    // removal does not touch the link entry itself) AND `realpath` must REJECT
    // (proving the link is genuinely broken, not merely unusual). Asserted via
    // a .then(ok, err) rejection arm, matching this file's no-catch(...) style;
    // an unmet precondition fails loudly by name, never a skip.
    const brokenLinkStat = lstatSync(brokenLinkNative);
    expect(
      brokenLinkStat.isSymbolicLink(),
      "precondition: <scratch>/broken must remain a symlink/junction after its target is removed — else this cell is not exercising a broken link",
```

tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:331-337 — cell (6)'s closing rejection-arm check:
```ts
      (err: NodeJS.ErrnoException) => {
        expect(
          err.code,
          `precondition: <scratch>/broken's realpath must reject ENOENT-class — got code=${json(err.code)}`,
        ).toBe("ENOENT");
      },
    );
```

tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:376-390 — cell (7), confirmed byte-identical to the 309-323 excerpt above apart from the dropped clause in the `isSymbolicLink` message ("— else this cell is not exercising a broken link" is present in cell (6), absent in cell (7)), and its own comment crediting cell (6) directly:
```ts
    const goneTargetNative = join(scratchDir, "gone-target");
    const brokenLinkNative = join(scratchDir, "broken");
    mkdirSync(goneTargetNative, { recursive: true });
    createDirectoryLink(goneTargetNative, brokenLinkNative);
    rmSync(goneTargetNative, { recursive: true, force: true });

    // Same loud broken-link precondition as cell 6: the link `lstat`s as a
    // symlink but `realpath` rejects. An unmet precondition fails loudly.
    const brokenLinkStat = lstatSync(brokenLinkNative);
    expect(
      brokenLinkStat.isSymbolicLink(),
      "precondition: <scratch>/broken must remain a symlink/junction after its target is removed",
    ).toBe(true);
    await realpathAsync(brokenLinkNative).then(
      (resolved) => {
```

tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:395-401 — cell (7)'s closing rejection-arm check, byte-identical to the 331-337 excerpt above:
```ts
      (err: NodeJS.ErrnoException) => {
        expect(
          err.code,
          `precondition: <scratch>/broken's realpath must reject ENOENT-class — got code=${json(err.code)}`,
        ).toBe("ENOENT");
      },
    );
```

Exact search: `grep -n 'goneTargetNative = join(scratchDir' tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts` → exactly 2 hits (lines 309, 376). `grep -n "must have a rejecting realpath" tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts` → exactly 2 hits (lines 328, 392), one per cell, both inside the byte-identical rejection-arm throw. No other cell in this file (1–5) creates a broken link; only (6) and (7) do.

## Why this is a problem
Cell (7)'s own comment ("Same loud broken-link precondition as cell 6") names cell (6) as the source it copied rather than factored out, and the two ~25-line blocks — junction creation, target removal, and the `lstat`/`realpath` precondition pair — reproduce each other line-for-line, down to the identical backtick-quoted error messages and the identical `ENOENT`-class check. The file's own header explains cells (6) and (7) exist to pin two DIFFERENT discriminators (cell 6's leaf sits under a deeper segment that could mask the ancestor verdict; cell 7's leaf sits directly under the broken link so the ancestor verdict alone decides), so the two `it()` bodies are deliberately distinct downstream of the shared block — but the broken-link fixture construction and its precondition check above that point is reproduced rather than shared.

## Suggested direction (non-binding, optional)
A local module-scope helper in this same file — for example `plantBrokenLink(): Promise<string>` returning the verified-broken link path, wrapping the `mkdirSync`/`createDirectoryLink`/`rmSync`/`lstatSync`/`realpathAsync` sequence once — is the home cell (7)'s own "same as cell 6" comment already points to; nothing about the pattern is specific enough to either cell to require two copies.

## False-positive check
- Gate-pin check: tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are fixture-construction and precondition plumbing, not a pinned count or inventory assertion.
- Recording-double check: `lstatSync`/`realpathAsync` are real filesystem calls, not a call-recording double, and their assertions are loud PRECONDITIONS (fail if the scratch fixture is not genuinely broken) rather than a "was X ever called" MUST-NOT witness on a fake; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0364-healthy-junction-ancestor-misclassifies-missing-as-unreadable.md Status "fixed (0.377.0)". `npx vitest run tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts` → 7 passed (7) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0364-healthy-junction-ancestor-misclassifies-missing" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0364-healthy-junction-ancestor-misclassifies-missing" docs/bugs/*.md` → its own bug document plus docs/bugs/0461-source-failure-descriptor-category-text.md, which lists this file among ten pinning the `<kind>:"<value>"` descriptor message format. This finding proposes no merge, rename, or deletion of the file or either `it()`, and touches neither cell's message-format assertions — only the fixture-construction/precondition block preceding them — so neither citation is disturbed.
- Coverage check: this finding does not claim a missing test path; both cells are exercised by the file's own 7/7 passing tests (confirmed above). The claim is confined to a block repeated verbatim within one file, not to test behaviour or coverage.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-read tests/b0364…test.ts lines 309-337/376-401: fixture+precondition block is byte-identical (only a shortened comment and one dropped message clause differ), cell (7)'s own comment names cell (6) as its copy source, all cited searches/line numbers and the docs/bugs "fixed"/coverage-matrix/0461-citation checks reproduce exactly; in-scope D7 copy-paste fixture/double, no false-positive carve-out applies (triage: claude-opus-5)
