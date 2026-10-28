---
id: PTQ-1778
title: Three batch test harnesses repeat verified-source preparation.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/bugfix-batch-hooks.test.ts:56-71
  - tests/bugfix-batch.test.ts:55-68
  - tests/bugfix-batch-recovery.test.ts:33-35
sites: 3
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Three batch test harnesses repeat verified-source preparation.

## Observation
Three in-scope batch test files locally implement the same source-verification preparation sequence: write a witness manifest expecting value 2, capture the value-1 red, change the source to value 2, run a gate, snapshot, write matching clean review text/JSON, and record the review. The hooks suite divides the sequence between `green` and `review`, then combines them in `verified`; the batch suite places it in `verified`; the recovery suite performs it directly in `fixture`. These are near-identical harness sequences, not byte-identical fixtures: the witness uses JS text matching in two files and a CJS value check in the third, and the batch fixture can also close its bug report. `tests/helpers/` is the repository's existing shared test-harness home; this observation concerns the repeated preparation protocol, not the distinct tests that consume it.

## Evidence
The inventory is limited to the three complete source-preparation sequences below, not every occurrence of an individual gate or review command.

`tests/bugfix-batch-hooks.test.ts:56-64`

```ts
  const green = (run: string, final = true) => {
    putJSON(join(run, "witnesses.json"), {
      e2e: [{ argv: [process.execPath, "-e", "if(!require('fs').readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: expected two');process.exit(1)}"], failure_pattern: "AssertionError: expected two" }],
      unit: [], unit_omission_reason: "No smaller boundary", live_required: false, live: [],
    });
    ok("red", run);
    putAt(state(run).root, "src/value.js", "export const value = 2;\n");
    ok("gate", run, final ? "final" : "initial");
  };
```

`tests/bugfix-batch-hooks.test.ts:65-71`

```ts
  const review = (run: string) => {
    ok("snapshot", run);
    putAt(run, "final-review.md", "CLEAN — independent fixture review");
    putJSON(join(run, "final-review-result.json"), { ok: true, findings: "CLEAN — independent fixture review" });
    ok("final-review-record", run);
  };
  const verified = () => { const run = start(); green(run); review(run); return run; };
```

`tests/bugfix-batch.test.ts:55-68`

```ts
  const verified = (id: string, close = true) => {
    const source = startSource(id); const number = Number(id);
    put(join(source.run, 'witnesses.json'), {
      e2e: [{ argv: [process.execPath, '-e', `if(!require('fs').readFileSync('src/value-${number}.js','utf8').includes('value = 2')) { console.error('AssertionError BUG_${id} expected 2');process.exit(1) }`], failure_pattern: `AssertionError BUG_${id} expected 2` }],
      unit: [], unit_omission_reason: 'This fixture tests the complete controller', live_required: false, live: [],
    });
    one('red', source.run); put(join(source.root, `src/value-${number}.js`), 'export const value = 2;\n');
    if (close) put(join(source.root, `docs/bugs/${id}-example.md`), `# Bug ${id}\n- **Status:** fixed\n`);
    one('gate', source.run, 'final'); one('snapshot', source.run);
    put(join(source.run, 'final-review.md'), 'CLEAN — independent fixture review');
    put(join(source.run, 'final-review-result.json'), { ok: true, findings: 'CLEAN — independent fixture review' });
    one('final-review-record', source.run); one('pause', source.run);
    return source;
  };
```

`tests/bugfix-batch-recovery.test.ts:33-35`

```ts
  put(join(source, 'witnesses.json'), { e2e: [{ argv: [process.execPath, '-e', "if(require('./src/value.cjs')!==2){console.error('AssertionError expected fixed value');process.exit(1)}"], failure_pattern: 'AssertionError expected fixed value' }], unit: [], unit_omission_reason: 'Complete inline witness', live_required: false, live: [] });
  one('red', source); put(join(sourceRoot, 'src/value.cjs'), 'module.exports=2;\n'); one('gate', source, 'final'); one('snapshot', source);
  put(join(source, 'final-review.md'), 'CLEAN'); put(join(source, 'final-review-result.json'), { ok: true, findings: 'CLEAN' }); one('final-review-record', source); one('pause', source);
```

## Why this is a problem
This is **boilerplate duplication** across three test files. Each copy expresses the same manifest/red/source-edit/gate/snapshot/review-record harness protocol, including the paired review artifacts whose findings text must agree. A reader or maintainer must distinguish three local spellings of that same preparation from the assertions that actually differ between hooks, collection/integration, and recovery. The repeated protocol is setup for existing tests, not three different behavioral expectations; no claim is made about test count, runtime, isolation, or missing witnesses.

## False-positive check
- **Gate-pin:** none of the cited blocks is a corpus census or pinned inventory assertion. Gate invocations here prepare an accepted source before the enclosing tests exercise their own operations; no count pin is challenged.
- **Recording-double:** these blocks prepare disposable source evidence with CLI commands and files. They are not negative witnesses based on deliberately uncalled recording doubles.
- **docs/bugs/ signature search:** `rg -n 'gate-command|linux-inherited-execution-token|PARTIAL_GATE_OUTPUT|Original worker declined incomplete gates' docs/bugs` returned no matches. The filename search for `bugfix-batch-hooks`, `bugfix-batch-recovery`, and `bugfix-batch.test` in bug documents and the coverage matrix also returned no matches. No documented correct-reason red is being weakened: each copy captures and retains an intentional fixture red as part of its setup.
- **Coverage-matrix/bug-doc citation search:** a literal direct-`it` title search against `docs/bugs/**/*.md` and `docs/reference/coverage-matrix.md` returned zero citations for 14 hooks titles, 9 recovery titles, and 27 batch titles. This observation proposes no merge, rename, or deletion of a named test, including parameterized tests.
- **Canonical-helper check:** `rg -n 'witnesses\.json|final-review-record|bugfix/(run|batch)\.mjs' tests/helpers` returned no matches. This is a repeated-harness observation, not a claim that a canonical bugfix verification helper already exists.
- **History intent:** `git log --oneline -- tests/bugfix-batch.test.ts tests/bugfix-batch-hooks.test.ts tests/bugfix-batch-recovery.test.ts` lists the orchestration, recovery/isolation, crash-recovery, and atomic-publication commits (`61d4faec`, `d4db86af`, `61eb4ab4`, `85041e2b`). The current copies' differing fixture payloads and optional operations are acknowledged rather than treated as identical tests.
- **Existing finding search:** searched `quality/issues`, `quality/resolved`, and `quality/intake` for these test filenames and `verified-source preparation` / `batch.*source.*harness`; no matches were returned before filing.
- **Coverage boundary:** all three sites are existing test setup. No absent test, suite composition, production implementation, behavior change, or runtime-risk harm is asserted.

## Triage
verdict: confirmed — All three cited setups reproduce the manifest/red/source-edit/gate/snapshot/paired-review/record protocol; fixture-specific payloads and optional operations do not remove the duplicated harness boilerplate. Stated searches and history reproduce, with no applicable D7 carve-out, duplicate, or resolved prescribed shape found. (triage: claude-opus-5-5)
