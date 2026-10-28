---
id: PTQ-1712
title: composeOneTheta binds pi without reading it.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-composition.ts:1997-2008
  - src/extension/production-composition.ts:1235-1245
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# composeOneTheta binds pi without reading it.

## Observation
`composeOneTheta` destructures `pi` from its dependency object but never reads the resulting local binding. Its sole call supplies a dependency object shared with the preparation phase. The finding concerns only the finalizer's unused local binding, not the shared dependency field or the live host API.

## Evidence
`src/extension/production-composition.ts:1997-2008`:
```ts
async function composeOneTheta(
  prepared: PreparedTheta,
  deps: ComposeOneThetaDeps,
): Promise<ParsedTheta | undefined> {
  const { input, toolResult, importCheck } = prepared;
  const {
    pi, ctx, fileSystem, sink, parseDeps, activeRoots, invokeGraph,
    modelMatcher, settingsBinderModel, probeStrictCapable, subagentRootRegime,
    controlPlane, producerDeps,
  } = deps;
  sink.emitGroup(parseDeps.passParseCache?.claimUndelivered(importCheck.diagnostics) ?? importCheck.diagnostics);
  if (importCheck.diagnostics.some(d => d.severity === "error")) return undefined;
```

A TypeScript AST traversal of the `composeOneTheta` declaration, counting identifier nodes whose text is `pi`, returns one node: the binding at line 2003, with no reference nodes. Creating a TypeScript program from `tsconfig.json` with `noUnusedLocals: true` and `noUnusedParameters: true` reports `'pi' is declared but its value is never read` at that same location.

The sole call site constructs the shared dependency object and calls the finalizer directly.

`src/extension/production-composition.ts:1235-1245`:
```ts
  const composeDeps: ComposeOneThetaDeps = {
    ...preparationDeps,
    invokeGraph,
    claimLibraryInvokeDiagnostics: createLibraryInvokeDiagnosticClaim(),
  };
  for (const result of prepared.values()) {
    const composed = await composeOneTheta(result, composeDeps);
    if (composed !== undefined) {
      thetas.push(composed);
    }
  }
```

## Why this is a problem
The local declaration is dead: it creates a binding with no reads, as confirmed by both syntax traversal and TypeScript's unused-local diagnostic. Keeping the shared dependency contract is a separate concern; no change to that contract is needed to recognize the unread local.

## Suggested direction (non-binding, optional)
Drop the unused local binding without narrowing the shared preparation/finalization dependency contract.

## False-positive check
The following searches covered all required source, extension, tool, and test trees:

- `rg --hidden --no-ignore -n 'composeOneTheta' src/ extensions/ tools/ tests/` — three matching lines: the call, a dependency-interface comment, and the function declaration. There are no external or test-only calls.
- `rg --hidden --no-ignore -n '\bpi\b' src/ extensions/ tools/ tests/` — 5,088 matching lines. This repository-wide spelling is shared by other scopes, so it was not used as a deadness test by itself. A TypeScript AST traversal restricted to this function returned exactly one `pi` identifier, the binding, and no reads.
- `rg --hidden --no-ignore -n "['\"](resolvePassInputs|composeOneTheta|markedRoot)['\"]" src/ extensions/ tools/ tests/` — no matches for string-keyed access to this helper.
- `rg --hidden --no-ignore -n 'export.*(resolvePassInputs|composeOneTheta)' src/ extensions/ tools/ tests/` — no matches. The local binding is not a property that computed-key access or a re-export could expose.
- `sed -n '1997,2230p' src/extension/production-composition.ts | grep -n '\bpi\b'` — two matching lines: the binding and a comment mentioning factory registration. The latter is not an identifier reference.

The compiler check used `ts.readConfigFile`, `ts.parseJsonConfigFileContent`, and `ts.createProgram` with the repository configuration plus `noUnusedLocals: true` and `noUnusedParameters: true`; semantic diagnostics for the two reviewed source files returned only the unused `pi` binding. The history check `git blame -L 1997,2009 src/extension/production-composition.ts` and `git show a04348da -- src/extension/production-composition.ts` shows the binding was introduced when preparation and finalization were split for bug 0508. No comment attributes a seam or a witness obligation to this local binding; the shared dependency field is explicitly outside this finding.

## Triage
verdict: confirmed — Both excerpts and all stated searches reproduce; independent AST traversal finds only the pi binding at line 2003, and TypeScript reports it unread. The sole caller passes a plain shared dependency object, history confirms the bug 0508 split introduced the binding, and no duplicate or intentional-use rationale was found; removing this local does not narrow the live shared contract. (triage: claude-opus-5-5)
