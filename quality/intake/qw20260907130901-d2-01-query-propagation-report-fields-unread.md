---
id: pending
title: QueryPropagation carries annotationSource and queryRange fields that no consumer reads
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/query-schema-resolve.ts:95-101
  - src/parser/query-schema-resolve.ts:116-119
  - src/parser/query-schema-resolve.ts:594-598
  - src/parser/query-schema-resolve.ts:612-618
  - src/parser/theta-document.ts:8436-8445
sites: 5
fix_scope: module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# QueryPropagation carries annotationSource and queryRange fields that no consumer reads

## Observation
`resolveQuerySchemas` returns a propagation report (`QueryPropagation[]`) whose
entries carry three fields: `capture`, `annotationSource`, and `queryRange`.
The report has exactly one consumer in the repository — theta-document.ts's
`indexQueryPropagations`, which builds a `Record<string, true>` keyed by
`propagationKey(propagation.capture)` — and that consumer reads only
`.capture`. `annotationSource` and `queryRange` are populated at both push
sites and read nowhere, in src/, extensions/, tools/, or tests/. The
`FrameOrigin.annotationSource` plumbing exists solely to fill the unread
report field.

## Evidence
src/parser/query-schema-resolve.ts:95-101 — the report shape:

```ts
export interface QueryPropagation {
  readonly capture: PropagationCapture;
  /** The capture's verbatim written annotation text. */
  readonly annotationSource: string;
  /** The range of the query the text reached. */
  readonly queryRange: SourceRange;
}
```

src/parser/query-schema-resolve.ts:594-598 — producer one
(`recordDirectLetPropagation`):

```ts
    this.propagations.push({
      capture: { kind: "let", range: stmt.range },
      annotationSource: stmt.annotation,
      queryRange: query.range,
    });
```

src/parser/query-schema-resolve.ts:612-618 — producer two (`resolveQuery`);
`origin.annotationSource` is `FrameOrigin.annotationSource` (:116-119), whose
only read is this copy into the report:

```ts
    const origin = (sink.frame as OriginFrame | undefined)?.origin;
    if (origin !== undefined) {
      this.propagations.push({
        capture: origin.capture,
        annotationSource: origin.annotationSource,
        queryRange: expr.range,
      });
    }
```

src/parser/theta-document.ts:8436-8445 — the sole consumer of
`.propagations` in the repository (fed at theta-document.ts:1228), reading
only `propagation.capture`:

```ts
function indexQueryPropagations(
  propagations: readonly QueryPropagation[],
): PropagationIndex {
  const index: Record<string, true> = Object.create(null) as Record<string, true>;
  for (const propagation of propagations) {
    index[propagationKey(propagation.capture)] = true;
  }
  return index;
}
```

Search evidence: `\.propagations` across src/, tests/, extensions/, tools/
matches only src/parser/theta-document.ts:1228 (besides the defining module).
`\.annotationSource|\.queryRange|annotationSource:|queryRange:` across tests/
matches nothing; the same grep over extensions/ and tools/ matches nothing.

## Why this is a problem
Dead data channel, proven: two of the three fields of a produced report record
are write-only. Every value flows producer → `indexQueryPropagations`, which
projects the record down to a capture-identity key and discards the rest. The
`QueryPropagation` doc-comment (:84-93) presents the report as answering which
annotation text reached which query, but the only question ever asked of it is
the boolean "did the annotation written at this capture reach a query?" —
answered from `capture` alone. The `annotationSource` half of `FrameOrigin` and
both `queryRange` writes are maintenance surface with no behavior behind them.

## Suggested direction (non-binding, optional)
Narrow the report to what its one consumer reads (the capture identity), or —
if attribution reporting is an intended future surface — leave the shape and
say so where the fields are declared. The fix stage owns the choice.

## False-positive check
Reference searches: grep `resolveQuerySchemas|QueryPropagation|PropagationCapture|ResolveQuerySchemasResult`
over all *.ts (src/, tests/, extensions/, tools/) — consumers are
theta-document.ts (import + index + `propagatedToQuery`) and test files whose
matches are comments only; grep `\.propagations` over src/ tests/ extensions/
tools/ — one hit, theta-document.ts:1228; grep
`\.annotationSource|\.queryRange|annotationSource:|queryRange:` over tests/,
extensions/, tools/ — zero hits (the src hits are the producers themselves and
the unrelated `annotationSourceIsNotTypeExpression` identifier). Re-export
check: grep `export.*QueryPropagation|export.*PropagationCapture` outside the
defining file — none; no barrel index exists under src/ or src/parser/.
Witness-test check: no test reads the propagation report at all, so this is
not test-witnessed code. Git intent: the report landed in 76489c61 (bug 0262
withhold); `git show 76489c61` shows `indexQueryPropagations` reading only
`propagation.capture` from the day the fields were introduced — the two extra
fields never had a reader.

## Triage
