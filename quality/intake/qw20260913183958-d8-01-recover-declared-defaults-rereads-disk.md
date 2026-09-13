---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "#recoverDeclaredDefaults re-reads the source file and re-parses its frontmatter YAML to recover a default literal already sitting on the parsed field"
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-theta-producer.ts:1601-1696
  - src/extension/production-theta-producer.ts:7522-7535
  - src/extension/production-theta-producer.ts:7547-7577
  - src/extension/production-theta-producer.ts:4258-4273
  - src/extension/production-theta-producer.ts:797-806
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#recoverDeclaredDefaults
wave: qw20260913183958
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-13
---

# #recoverDeclaredDefaults re-reads the source file and re-parses its frontmatter YAML to recover a default literal already sitting on the parsed field

## Observation
`ProductionThetaProducer#recoverDeclaredDefaults` recovers the evaluated value
of a declared `params:` default (e.g. `count: integer = 3`) for a wire name a
caller's `invoke(...)` / `.theta`-callable call omitted. For every such wire
name it: async-reads the theta's entire source file off disk again
(`fileSystem.readBytes`), hand-scans the decoded text line-by-line for the
frontmatter `---` fences (`extractFrontmatterYaml`), re-parses the extracted
block with the `yaml` package's `parseDocument`, and hand-splits the raw field
scalar at the top-level `=` with a custom quote/bracket-depth-tracking scanner
(`splitParamDefaultSource`) to recover the default's literal RHS text — before
parsing and evaluating that text. The literal text this whole pipeline exists
to reproduce, `field.defaultSource`, is already a property on the very
`theta`/`callee` object the function receives as its own argument: the same
file reads `field.defaultSource` directly off `params.fields` a few hundred
lines away (`binderPromptParamField`), and `#driveCallee` reads
`field.wireName` off the identical array nine lines before calling this
function.

## Evidence

`src/extension/production-theta-producer.ts:1601-1608` — the function's own
doc admits the literal is already retained, and states the re-read anyway:

```
/**
 * Recover the declared default's evaluated VALUE for each defaulted wire name
 * from the theta's source file. The parsed `ParsedParams` retains each default's
 * literal source (`fields[].defaultSource`, feeding the binder system prompt's
 * `default=<literal>` line) but not its evaluated value, so this re-reads the
 * `.theta`, extracts the frontmatter YAML, reads each `params:` field's
 * scalar, splits its `= <literal>`
 * default RHS, and parses + evaluates the literal with the body's pure evaluator
```

`src/extension/production-theta-producer.ts:1622-1636` — the disk read and
fence extraction that follow, inside `#recoverDeclaredDefaults` (1618-1696):

```
    const sourcePath = theta.sourcePath;
    if (sourcePath === undefined) {
      return [];
    }
    const bytes = await this.#input.root.fileSystem.readBytes(sourcePath).then(
      (value) => value,
      () => undefined,
    );
    if (bytes === undefined) {
      return [];
    }
    const yamlText = extractFrontmatterYaml(new TextDecoder().decode(bytes));
    if (yamlText === undefined) {
      return [];
    }
```

`src/extension/production-theta-producer.ts:1637-1651` — the YAML re-parse and
the per-field re-split, immediately after:

```
    const doc = parseDocument(yamlText);
    const env = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
    const defaults: DefaultedField[] = [];
    for (const wireName of defaultedFields) {
      const raw = doc.getIn(["params", wireName]);
      if (typeof raw !== "string") {
        continue;
      }
      const defaultSource = splitParamDefaultSource(raw);
```

`src/extension/production-theta-producer.ts:7522-7535` — `extractFrontmatterYaml`
in full, whose own doc says it "Mirrors the parser's own block isolation":

```
function extractFrontmatterYaml(source: string): string | undefined {
  const lines = source.split("\n");
  const isFence = (line: string | undefined): boolean =>
    line !== undefined && line.replace(/\r$/, "") === "---";
  if (!isFence(lines[0])) {
    return undefined;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (isFence(lines[i])) {
      return lines.slice(1, i).join("\n");
    }
  }
  return undefined;
}
```

`src/extension/production-theta-producer.ts:7547-7561` — the opening of
`splitParamDefaultSource` (full function 7547-7577, 31 LOC), whose own doc says
it is "Kept in step with the parser's own `splitParamValue`":

```
function splitParamDefaultSource(raw: string): string | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < raw.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
```

`src/extension/production-theta-producer.ts:4258-4273` — the `#driveCallee`
call site: `paramNames` reads `.wireName` off `callee.frontmatter.params.fields`
nine lines before `#recoverDeclaredDefaults(callee, ...)` is dispatched over
the SAME array, with no caching between calls:

```
    const paramNames = callee.frontmatter.params?.fields.map((field) => field.wireName) ?? [];
    // An omitted slot (`argValues[index] === undefined`, the presence check —
    // ...
    const defaultedFields = callee.frontmatter.params?.defaultedFields ?? [];
    const omittedDefaulted = defaultedFields.filter(
      (wireName) => argValues[paramNames.indexOf(wireName)] === undefined,
    );
    const recovered =
      omittedDefaulted.length > 0 ? await this.#recoverDeclaredDefaults(callee, omittedDefaulted) : [];
    const recoveredByName = new Map(recovered.map((field) => [field.wireName, field.defaultValue as ThetaValue]));
```

`src/extension/production-theta-producer.ts:797-806` — `binderPromptParamField`,
in the SAME file, reading `field.defaultSource` directly off the identical
`ParsedParams.fields` array with no file access at all:

```
function binderPromptParamField(field: BypassParamsField): SystemPromptParamField {
  return {
    wireName: field.wireName,
    type: projectRenderedParamType(field.type),
    requirement:
      field.hasDefault && field.defaultSource !== undefined
        ? { kind: "default", literal: field.defaultSource }
        : { kind: "required" },
  };
}
```

Confirming `field.defaultSource` is populated once at load time (outside this
shard, cited only to verify the "already available" claim):
`src/parser/frontmatter.ts:1447` defines `splitParamValue`, called once at
`:1543`, whose result is stored at `:1653`/`:1663` onto each
`BypassParamsField` (`src/binder/binder-envelope.ts:158-172`, `readonly
defaultSource?: string`) — the exact same field shape `ParsedParams.fields`
(`frontmatter.ts:119-125`) carries and `#driveCallee` (4258 above) already
reads `.wireName` from.

## Why this is a problem
`#recoverDeclaredDefaults` is reached from two call sites: `#mergeDeclaredDefaults`
(the top-level slash-dispatch binder path, once per user-issued slash command)
and `#driveCallee` (every nested `invoke(...)` / `.theta`-callable dispatch
whose target declares a default the call omitted — line 4271-4272). Because a
default exists precisely so a caller CAN omit it, the `#driveCallee` path pays
the full disk-read + line-scan + YAML-document-parse + character-level split
pipeline on the common case, not an edge case, and pays it again on every
repeated dispatch of the same callee (a `for`-loop invoking the same `.theta`
callee N times re-reads and re-parses that one static file N times for an
answer invariant across all N calls within the process's lifetime).
`ProductionThetaProducer` carries no cache keyed by `sourcePath` or callee for
this recovery, and grepping `parseDocument` in this file turns up exactly two
hits — the import and this one call site — so the file's whole `yaml`
dependency exists to serve a re-derivation of data the object already carries.
The project's own bug docs independently name this same behaviour:
`docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md:553-556` calls
it "`#recoverDeclaredDefaults` re-reading the theta off disk to recover a value
the parser already saw... a separate design smell with its own failure modes
... unfiled", and `docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md:781-784`
repeats "`#recoverDeclaredDefaults` re-reads the file from disk at invocation,
so it can still be handed a break-carrying default by a file edited after
load" while declining to touch it — two independent, later bug passes over
this exact code both recorded the smell and left it unaddressed.

## Suggested direction (non-binding, optional)
Unproven hypothesis: since `theta.frontmatter.params.fields` (and
`callee.frontmatter.params.fields`) already carry each field's `defaultSource`
from load-time parsing, `#recoverDeclaredDefaults` could look each wire name up
directly on that in-memory array and skip the disk read / `extractFrontmatterYaml`
/ `parseDocument` / `splitParamDefaultSource` chain entirely, keeping only the
`parseExpressionSource` → `evaluatePureExpression` → `projectForValidation`
steps that genuinely need the body-scoped environment this function already
builds. Whether that changes the observed behaviour for a file edited between
load and dispatch (the failure mode both bug docs flag) is exactly the kind of
question a fix stage, not this filing, would need to settle.

## False-positive check
- Reference search: grepped `defaultSource` across
  `src/extension/production-theta-producer.ts`, `src/parser/params.ts`,
  `src/parser/frontmatter.ts`, `src/binder/binder-envelope.ts` — confirms
  `BypassParamsField.defaultSource?: string` is populated once at load time
  (`frontmatter.ts:1447` `splitParamValue`, called at `:1543`, stored at
  `:1653`/`:1663`) and is already read directly off that same object elsewhere
  in this exact file (`binderPromptParamField`, 797-806).
- Grepped `parseDocument` across `production-theta-producer.ts`: exactly two
  hits (the import at line 31 and the call at line 1637) — no other use of the
  `yaml` package in this file.
- Checked for caching: `ProductionThetaProducer`'s declared members
  (`#input`, `#promptToolLoopGovernor`, `#respondRegistrationCache`,
  `#activeRespondCapture`, `#ledger`) hold nothing keyed by `sourcePath` or
  callee for recovered defaults — every call re-runs the full pipeline.
- D2-precedent / rationale check: the function's own doc (1601-1608) gives a
  rationale for RE-EVALUATING (the evaluated value needs the body's
  environment, which load time does not have) but that rationale does not
  cover the antecedent disk read — the same sentence admits the literal
  source is "retained" on the object already in hand. Two independent bug
  docs (0066, 0102) call the disk re-read a recognized, still-"unfiled"
  smell rather than a settled design rationale, which is the basis for filing
  rather than treating this as a stated, undisputed design decision.
- Already-filed / resolved check: `quality/resolved/PTQ-0092-projectforvalidation-disposable-claim-stale.md`
  also cites `#recoverDeclaredDefaults`, but for an unrelated claim (a stale
  doc-comment on `projectForValidation`'s disposability contract) — distinct
  from the disk-re-read/re-parse cost claimed here. No entry in the supplied
  already-filed list or the rejected-candidates list names
  `extractFrontmatterYaml`, `splitParamDefaultSource`, or this re-read
  behaviour.

## Triage
verdict: questionable — accounting verified: all 5 excerpts reproduce at the cited lines; `field.defaultSource` is confirmed reachable in-memory on the same `theta`/`callee` argument (`ConversationBindInput["theta"]` → `ThetaCompositionInput` → `ParsedTheta.frontmatter.params.fields[].defaultSource`, `BypassParamsField` at binder-envelope.ts:172); `splitParamDefaultSource`/`extractFrontmatterYaml` duplicate `frontmatter.ts`'s own `splitParamValue`/fence-scan logic; `ProductionThetaProducer` has no cache keyed by sourcePath (all 5 private fields checked, none match) and `readBytes` is a raw `fs.readFile` with no caching; docs/bugs 0066:553-556 and 0102:781-784 independently confirm the re-read as a known, still-unfiled smell — per the D8 protocol an accurate heavier-than-scale accounting rests at questionable, never confirmed, since adopting the simpler in-memory-lookup shape is a human design call (it drops the re-read's incidental pickup of a same-session file edit, a behaviour no spec clause mandates but that the fix stage would need to rule on) (triage: claude-opus-5)
