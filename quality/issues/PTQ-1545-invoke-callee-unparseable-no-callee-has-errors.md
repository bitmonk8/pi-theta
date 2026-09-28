---
id: PTQ-1545
title: checkInvokeExprCallSurface emits theta/load/callee-has-errors for an invoke(...) callee whose realpath rejects, but emits nothing for a readable callee that fails to parse or fails its load gate (resolveCalleeArity → undefined)
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/invoke-expr-call-surface.ts:266-300
  - src/extension/callee-load-parse.ts:10-27
  - src/extension/invoke-expr-call-surface.ts:209-228
  - src/extension/production-composition.ts:3314-3330
sites: 4
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/invocation.md:22 — \"A callee whose file is unreadable, fails to parse, or fails its own structural checks is *not statically resolvable* and the parent emits `theta/load/callee-has-errors` at the referencing site, naming the callee and listing the underlying error sites via `related`. [...] a literal `invoke(\"./path.theta\", ...)` whose callee is unparseable is **warning**\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# checkInvokeExprCallSurface emits theta/load/callee-has-errors for an invoke(...) callee whose realpath rejects, but emits nothing for a readable callee that fails to parse or fails its load gate (resolveCalleeArity → undefined)

## Observation
`checkInvokeExprCallSurface` has two exits for a literal `invoke("./x.theta", …)` callee the load pass cannot statically resolve. (a) The containment check's `realpath` rejects, which happens for a callee absent on disk. That exit pushes `theta/load/callee-has-errors` (surface `"invoke"`, a warning) and `continue`s. (b) Containment passes because the file exists, and then `resolveCalleeArity` returns `undefined`. It does this when `readCalleeDocument` fails to read the bytes, or when the parsed document fails `passesLoadParseGate` (null frontmatter, or an error-severity load/parse diagnostic). That exit pushes no diagnostic. It skips the arity/type block with `if (arity !== undefined)`, and the with-clause gate gets `mode: undefined`. So an absent callee draws the warning. A callee that exists but does not parse, or cannot be read after `realpath` succeeds, is skipped with no report at the referencing site. The `tools:` surface's sibling loop in production-composition.ts does emit `callee-has-errors` for the "exists but has errors" case.

## Evidence
**Divergent side (silent skip): readable-but-unresolvable callee.** src/extension/invoke-expr-call-surface.ts:266-300
```ts
    // INV-3 (invocation.md §Argument arity): arity is checked against the
    // statically-resolved callee's `params:` counts. The provided count
    // excludes the leading path-literal argument.
    const providedCount = Math.max(0, invoke.args.length - 1);
    const arity = await deps.resolveCalleeArity(resolvedPath);
    ...
    diagnostics.push(
      ...checkWithClause({
        ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
        mode: arity?.mode,
        ...
      }),
    );
    if (arity !== undefined) {
```
No `else` arm follows the `if (arity !== undefined)` block (it runs to :356 and the loop ends at :357). The production `resolveCalleeArity` (src/extension/production-composition.ts:2887-2902) documents its `undefined` as "when the callee is unreadable / unparseable (not statically resolvable)". It gets that verdict from src/extension/callee-load-parse.ts:10-27:
```ts
export async function readCalleeDocument(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<{ readonly frontmatter: ParsedFrontmatter; readonly body: ThetaBody } | undefined> {
  const bytes = await readThetaBytes(fs, absolutePath);
  if (bytes === undefined) {
    return undefined;
  }
  ...
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
  if (!passesLoadParseGate(document)) {
    return undefined;
  }
  return { frontmatter: document.frontmatter, body: document.body };
}
```

**Sibling side (reports): absent callee, same surface, same function.** src/extension/invoke-expr-call-surface.ts:209-228
```ts
    const containment = await checkInvokePathAtLoad({
      deps: { fs: deps.fs },
      resolvedPath,
      literalPath: invoke.path,
      activeRoots: deps.activeRoots,
    }).then(
      (value) => value,
      () => undefined,
    );
    if (containment === undefined) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: invoke.path,
          surface: "invoke",
          relatedSites: [],
          site,
        }),
      );
      continue;
    }
```

**Sibling side (reports): exists-but-has-errors callee, `tools:` surface.** src/extension/production-composition.ts:3314-3330
```ts
  // callee-has-errors (V15f): a readable, parseable `.theta` callee that carries
  // its own error-severity load/parse diagnostics rejects the parent at load
  // time (`tools:` surface → error severity). ...
  for (const [spec, callee] of calleeCache) {
    if (callee.escape === undefined && callee.fileExists && callee.hasErrors) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: spec,
          surface: "tools",
          relatedSites: [],
          site: { file: sourcePath, range: TOOLS_DIAGNOSTIC_RANGE },
        }),
      );
    }
  }
```

**Sibling-class argument.** All three exits handle one failure class: "a referenced `.theta` callee is not statically resolvable in this load pass". The anchor names that class and its three members: unreadable, fails to parse, fails its own structural checks. Mechanically, exits (a) and (b) are in the same per-site loop over the same `invoke` node and the same `resolvedPath`. Both end with the site's static checks skipped: (a) with `continue`, (b) by the `arity !== undefined` guard. Only (a) calls `checkCalleeHasErrors`. The `tools:` loop is the same predicate (`fileExists && hasErrors`) on the sibling surface, and it calls `checkCalleeHasErrors`. The only difference the anchor allows between the two surfaces is severity (E vs W), not whether the diagnostic is emitted.

**Anchor (quoted verbatim, docs/spec_topics/invocation.md:22):** "A callee whose file is unreadable, fails to parse, or fails its own structural checks is *not statically resolvable* and the parent emits `theta/load/callee-has-errors` at the referencing site, naming the callee and listing the underlying error sites via `related`. The severity is per surface: a `tools:` `.theta` entry pointing at an unparseable callee is **error** — the callable cannot be created, and the parent theta does not register; a literal `invoke("./path.theta", ...)` whose callee is unparseable is **warning** — the parent registers, static checks against that callee are skipped, and the runtime AJV check is the safety net for the skipped checks." The registry row docs/spec_topics/diagnostics/code-registry-load.md:49 says the same: "A `.theta` callee referenced by an `invoke(...)` literal or a `tools:` `.theta` entry failed to parse, lower, or pass its own structural checks …; `invoke(...)` literals are `W`".

**Searches (run this session):**
- `grep -rn 'surface: "invoke"' src` → 2 hits: invoke-expr-call-surface.ts:222 (the absent-callee push above) and invoke-static-checks.ts:652 (a doc comment). No other `invoke`-surface emission exists.
- `grep -rn "checkCalleeHasErrors(" src` → 4 hits: invoke-expr-call-surface.ts:220, production-composition.ts:3322 (`tools:`), subagent-fn-static-checks.ts:153 (inline `subagent fn`), and the definition at parser/invoke-diagnostics.ts:697.
- `grep -rn "resolveCalleeArity" src --include=*.ts | grep -v "readonly resolveCalleeArity"` → the invoke-surface call at invoke-expr-call-surface.ts:271 and the `.theta`-callable call at invoke-static-checks.ts:407. Neither call site emits a diagnostic on `undefined`.

## Why this is a problem
The anchor makes `callee-has-errors` at the referencing site the report for every member of the not-statically-resolvable class. It spells out the unparseable case for the `invoke(...)` surface in particular. The code emits it for one member (absent file), and the `tools:` surface emits it for the "exists but has errors" member. The `invoke(...)` surface skips the unparseable member with no report. The author gets no warning that the parent's static checks against that callee were skipped. This is the silence the absent-file arm was added to remove (commit 8f3fccf3, "Per discovery-cli.md Static resolution an unreadable literal-invoke callee is loom/load/callee-has-errors (severity WARNING)"). The unit test tests/invoke-diagnostics.test.ts:314 ("a literal invoke(...) callee that is broken is severity WARNING") drives `checkCalleeHasErrors` directly with parse-error `related` sites. The composed surface never emits that shape for a broken-but-present callee.

## Suggested direction (non-binding, optional)
Give the `arity === undefined` exit of the invoke surface (after containment passes) the same `checkCalleeHasErrors({ surface: "invoke", … })` report the absent-file exit uses. Consider carrying the callee's error sites through as `related`, which the anchor asks for on both exits.

## False-positive check
- **EXST-9 / PIC-73 class check:** neither applies. This is a load-time diagnostic emission in the compose pass. It is not an execution-status sink/producer hook and not an optional degrade-silent capability.
- **allow-broad-catch token check:** no catch is cited. The absent-file exit uses the `.then(ok, () => undefined)` rejection idiom (no annotation token), and the divergent exit has no catch.
- **Stated-rationale check:** invoke-expr-call-surface.ts:194-208 justifies the absent-file arm only (the INVCEIL-1 throw). It gives no reason to leave the unparseable case unreported. The docstring at invoke-static-checks.ts:651-654 and the `buildInvokeGraph` comment at :325-330 describe the emission as scoped to "unreadable or absent on disk" / "a callee whose realpath-based containment check rejected it". Both describe current behaviour and state no reason for excluding unparseable callees, and the anchor contradicts that scoping. The `resolveCalleeArity` doc (production-composition.ts:2887-2892) justifies skipping the arity check ("the runtime AJV net applies"), not omitting the diagnostic. The anchor requires both: checks skipped and the warning emitted. `git show 8f3fccf3` (the commit that introduced the invoke-surface emission) targeted only the missing-callee throw. Searching docs/bugs for callee-has-errors + invoke + unparseable (`grep -rln "callee-has-errors" docs/bugs | xargs grep -il "invoke(" | xargs grep -il "unparseable\|fails to parse\|parse error"`) returned 10 docs. The one on this surface, 0137:204, restates the anchor's warning rule and does not rule the unparseable case silent. No doc states an intended silence.
- **Sibling-reality check:** both invoke exits are in the same loop body of the same function (checkInvokeExprCallSurface, :185-357) and run on every literal `invoke(...)` site that passes the `.theta` extension guard. The `tools:` loop is live production code in the compose pass (production-composition.ts:3319-3330). The divergent exit is reachable: a file that exists under an active root passes `checkInvokePathAtLoad` and then fails `passesLoadParseGate` on any error-severity parse diagnostic. Tests: 31 test files mention callee-has-errors (`grep -rln "callee-has-errors" tests | wc -l`). tests/invoke-arg-type-mismatch-wired.test.ts cell d1 witnesses only the absent-file (`./nosuch.theta`) arm. No test found asserts silence for an unparseable invoke callee.
- **Already-filed check:** no PTQ or intake entry covers callee-has-errors on the invoke surface. PTQ-1532 is a D9 breakdown of the same function, not this posture.

## Triage
verdict: confirmed — re-verified: in checkInvokeExprCallSurface (invoke-expr-call-surface.ts:209-228) a realpath rejection pushes checkCalleeHasErrors({surface:"invoke"}), but when containment passes and resolveCalleeArity→readCalleeDocument returns undefined (unreadable bytes or a failed passesLoadParseGate, callee-load-parse.ts:15-25), the code only skips via `if (arity !== undefined)` (:300) and emits nothing. The tools: sibling (production-composition.ts:3319-3330) does emit for fileExists&&hasErrors. All three stated greps reproduce (2/4/2 hits), no other emitter exists, and the docs/bugs search returns 10 files. The anchor invocation.md:22 ("a literal invoke(...) whose callee is unparseable is **warning**" + callee-has-errors at the referencing site) and registry row code-registry-load.md:49 pin the emitting side. No stated rationale excludes it: the invoke-static-checks.ts:651-654 and :324-327 comments only describe current scope, and bug 0137 d1 restates the warning rule (triage: claude-opus-5-5)
