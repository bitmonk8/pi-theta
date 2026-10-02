# Bug 0507 — the SLSH-5 chain suffix for an `invoke(...)` written in an imported `.thetalib` fn body pairs the CALLING theta's path with the line of the `invoke` token in the LIBRARY file: `invoked at <caller>.theta:<n>` names line `<n>` of the caller, which is not the call site; the spec does not say which file a lib-body hop's `<parent_path>` names

- **Status:** open — filed 2026-10-02 as residual 3 of the bug-0504 fix
  ([0504](./0504-thetalib-invoke-resolves-caller-relative.md), `## Fix
  (0.495.0)` → Residuals 3; bug-0504 review round 1, R3). Pre-existing:
  `#recordInvokeHop` has passed the calling theta as `parentPath` since bug
  0088; the 0504 fix corrected `<callee_path>` only.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D3 — S2: a wrong failure text. The top-level
  `Err` note's chain suffix cites a `file:line` pair that is no call site in
  either file. The `Err` value, its `kind`, the leaf row and `<callee_path>`
  are correct. D3: the fix needs a spec ruling first. SLSH-5 does not say
  which file a hop's `<parent_path>` names when the `invoke` sits in a
  `.thetalib` fn body, and the three candidate renderings need different
  carriers (one of them changes the SLSH-5 suffix grammar). Once the ruling
  exists, the code change is confined to the hop-recording path
  (`effectful-statement-host.ts` → `production-theta-producer.ts` →
  `invoke-provenance-ledger.ts`) plus one witness.
- **Where (pi-theta, main 12f1ccfd, 0.495.0):**
  - `src/extension/production-theta-producer.ts:323-341` — `#recordInvokeHop`
    reads `const sourcePath = theta.sourcePath` (`:329`) and hands the ledger
    `parentPath: sourcePath` (`:337`). `theta` is the calling theta's bind
    input, captured once per host at the wiring site (`:769-770`). Nothing on
    this path names the file that contains the `invoke` expression.
  - `src/runtime/effectful-statement-host.ts:565-568` — the literal-`invoke`
    arm builds the call site as `{ style: "literal_invoke", invokeToken:
    expr.range.start }`. `expr` is the `InvokeExpr` node from the AST of the
    file that contains it, so for a lib-body invoke the position is a
    `.thetalib` position. `:631-635` forwards that `callSite` to
    `deps.recordInvokeHop` unchanged. The dep signature (`:184-188`,
    `recordInvokeHop(wrapper, calleePath, callSite)`) has no parent-file
    parameter.
  - `src/runtime/invoke-provenance-ledger.ts:51-62` — `InvokeHopInput`
    documents `parentPath` as "The parent theta's path as resolved at the
    call site" and `callSite` as "The call-site token descriptor whose
    1-indexed line is recorded". The two fields come from different sources
    (bind input vs AST node), and nothing ties them to one file.
  - `src/runtime/invoke-provenance.ts:116-121` — `recordInvocationProvenance`
    canonicalises `input.parentPath` and takes `callSiteLine` from
    `invokeToken.line` / `calleeNameToken.line`. It pairs the two values as
    given.
  - `src/runtime/err-note-render.ts:206` — renders each hop as
    `` ` from ${h.calleePath} invoked at ${h.record.parentPath}:${h.record.callSiteLine}` ``.
  - The executing body's declaring file is known at the invoke boundary:
    `src/extension/invoke-machinery.ts:169` computes `resolutionBase =
    env.currentResidence() ?? theta.sourcePath` (bug 0504) and uses it for
    the callee path only. It is not carried on `InvokeChild`
    (`src/runtime/invoke-cancellation.ts:94` carries `resolvedCalleePath`,
    not the base).
- **Spec:** `docs/spec_topics/slash-invocation.md:64` (SLSH-5) defines the
  hop in terms of "the invocation site" and "the call-site token in
  `<parent_path>`", and its worked examples cover only `invoke` written in
  a `.theta` body. It does not address an `invoke` in a `.thetalib` fn body.

## Symptom

A prompt-mode `caller.theta` imports `via_lib` from `workers/lib.thetalib`.
`via_lib`'s body holds `invoke("./child.theta")`, and the lib-side
`workers/child.theta` fails. The top-level `Err` note's chain suffix reads
`… from <abs>/workers/child.theta invoked at <abs>/caller.theta:<n>`. `<n>`
is the line of the `invoke` token inside `lib.thetalib`, so it moves when
lines are added above the `invoke` in the library and does not move when the
caller's own call site moves. Line `<n>` of `caller.theta` is unrelated
content (a frontmatter line or the `import` line in the probes below), not
the `via_lib()` call.

## Expected (spec citations)

- `slash-invocation.md:64` (SLSH-5): each hop renders ` from <callee_path>
  invoked at <parent_path>:<line>`, where `<line>` is "the 1-indexed source
  line (no column) of the call-site token in `<parent_path>` that produced
  the `invoke_callee` hop — the `invoke(` token of a literal `invoke(...)`
  expression". So `<line>` is a line of the file that `<parent_path>` names.
  The current output breaks this under any reading of the spec: the line
  belongs to the library and the path names the caller.
- The spec does not say which file `<parent_path>` names for a lib-body hop.
  SLSH-5 says `<parent_path>` is "the post-`realpath` absolute path recorded
  at the invocation site (per Invocation, 'Resolution' — the same
  `realpath`-normalised absolute paths used for discovery-root containment)".
  The worked examples (single-hop, `.theta`-callable, three-level) all place
  the call-site token in a `.theta` file. No example or rule covers an
  `invoke` token in a `.thetalib` fn body.
- Neighbouring rules point in different directions and do not settle the
  question:
  - `docs/spec_topics/imports.md:17`: a lib-body invoke path "resolves
    relative to the `.thetalib` file's location". The invocation runs
    against the CALLING theta's conversation.
  - `docs/spec_topics/invocation.md:10`: "resolved at parse time relative to
    the calling theta's directory". Written for a `.theta` body (bug 0504
    residual 5 records the missing cross-reference).
  - `docs/spec_topics/errors-and-results/error-model.md:87` (panic sites):
    "For panics inside a `.thetalib`-imported frame, the panic site is the
    leaf source location, not the importer". `:93` puts the leaf `.thetalib`
    file in `at <file>:<line>:<col>` and adds per-fn call-boundary sites as
    separate `in fn <name> (<file>:<line>:<col>)` lines. This rule governs
    panics, not SLSH-5 hops.

## Actual (implementation citations)

`<parent_path>` is always `theta.sourcePath` of the calling theta
(`production-theta-producer.ts:329`, `:337`). `<line>` is always
`expr.range.start.line` of the `InvokeExpr`, taken from the file that
contains it (`effectful-statement-host.ts:565-568`). For an `invoke` in a
`.theta` body the two agree. For an `invoke` in a `.thetalib` fn body they
come from different files.

Probe (0.495.0 at 12f1ccfd, 2026-10-02): a scratch copy of the bug-0504
witness's `driveProvenance` helper
(`tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts`, cell (E1)).
The probe printed the top-level `Err` note and was then deleted. Layout under
`.pi/theta/`:

```
caller.theta           line 1-3  frontmatter (---, mode: prompt, ---)
                       line 4    import { via_lib } from "./workers/lib.thetalib"
                       line 5    via_lib()?
workers/lib.thetalib   fn via_lib() { invoke("./child.theta") }   (invoke on line L)
workers/child.theta    invoke("./missing.theta")?                 (fails load_failure)
```

| arm | `invoke` line `L` in `lib.thetalib` | rendered hop | line `L` of `caller.theta` |
|---|---|---|---|
| 1 | 2 | `… from <abs>/.pi/theta/workers/child.theta invoked at <abs>/.pi/theta/caller.theta:2` | `mode: prompt` |
| 2 | 4 (two comment lines prepended) | `… invoked at <abs>/.pi/theta/caller.theta:4` | the `import` line |

The rendered line follows the library and ignores the caller, whose call site
is line 5 in both arms. The bug-0504 round-1 reviewer's scratch reported the
same shape (`… invoked at <caller>.theta:2` for an `invoke(` token on line 2
of `lib.thetalib`). The shipped witness does not assert `<parent_path>`; its
(E1) cell says so in a comment at
`tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts:521-522`.

## Root cause

The two halves of the hop record come from different places. `parentPath`
comes from the bind input captured when the host is built
(`production-theta-producer.ts:769-770` closes over `theta`). The line comes
from the AST node being executed. The hop-recording path has no input for
the file that contains the executing body. The value already exists one seam
earlier as `env.currentResidence()` (`invoke-machinery.ts:169`;
`src/runtime/lexical-environment.ts:514`). Bug 0504 used it to choose the
callee-resolution base and did not pass it on to the ledger. The type
comments state the single-theta assumption: `InvokeHopInput.parentPath` is
"The parent theta's path", and `InvocationRecord.parentPath`
(`invoke-provenance.ts:73`) is "The parent theta's **post-`realpath`**
absolute path".

## Fix direction

Blocked on a spec ruling that amends SLSH-5 (`slash-invocation.md:64`) to
say what a hop renders when its call-site token is in a `.thetalib` fn body.
This report does not choose the ruling. It lists the candidates and the
constraints that apply to whichever one is adopted.

Candidate renderings:

- **(a) Caller file + caller call-site line.** `<parent_path>` stays the
  calling theta. `<line>` becomes the line in the calling theta of the call
  that reached the `invoke` (`via_lib()` on line 5 in the probe). This needs
  a carrier for the caller-side call site of the open cross-file fn frame,
  which the hop path does not have today. The panic-site suffix's per-fn
  call-boundary sites (`error-model.md:93` item 2) are the closest existing
  concept. Whether the effect host can read them at `wrapInvokeCalleeFailure`
  has not been checked. The ruling must also name the frame for lib-to-lib
  chains (the root theta's outermost call, or the nearest `.theta`-resident
  call).
- **(b) Library file + library line.** `<parent_path>` becomes the
  realpath-normalised `env.currentResidence()` at the invoke, and `<line>`
  stays as it is. This matches the `<callee_path>` base (the lib-relative
  resolution and containment base from bug 0504) and the panic leaf-location
  rule (`error-model.md:87`). It needs the residence carried from
  `resolveInvoke` to `recordInvokeHop`, for example as an `InvokeChild` field
  next to `resolvedCalleePath`. SLSH-5's "parent" wording and the
  `parentPath` type comments would then name a file that is not a theta.
- **(c) Two-segment hop.** Render both the library site and the caller's
  call site in one hop. This changes the SLSH-5 suffix grammar, its worked
  examples and `err-note-render.ts:206`, and it needs the carriers of both
  (a) and (b).

Constraints for any ruling:

1. `<line>` is a line of the file that `<parent_path>` names. This rule is
   already in SLSH-5, and the fix must hold it for every hop.
2. Hops whose call-site token is in a `.theta` body keep their current bytes:
   literal `invoke(...)`, `.theta`-callable bare-identifier calls, and every
   SLSH-5 worked example.
3. `<callee_path>` is unchanged. It stays the bug-0504 resolved path
   (`child.resolvedCalleePath ?? child.calleePath`,
   `effectful-statement-host.ts:633`).
4. Every path in the suffix goes through the existing `canonicalizePath`
   identity (realpath, forward slashes), as `<callee_path>` does.
5. The spec amendment, the `InvokeHopInput` / `InvocationRecord` comments
   and `#recordInvokeHop`'s doc comment land in the same commit as the code.
   The amendment adds a worked example for a lib-body hop.
6. The `theta_callable_bare` arm (`effectful-statement-host.ts:483-485`)
   shares the `parentPath: sourcePath` record path. The ruling covers it if a
   bare-identifier `.theta`-callable call can execute from a `.thetalib` fn
   body. That reachability has not been probed.
7. Witness: a layout where line `L` of the `invoke` token in the library and
   the caller's call-site line differ, and where `caller.theta` also has a
   line `L`. The witness asserts the whole `invoked at <file>:<line>` pair,
   which the (E1) cell's `<parent_path>` exclusion
   (`tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts:521-522`)
   leaves unasserted today. Add a lib-to-lib cell if the ruling picks (a)
   or (c).

## Provenance

- Filed 2026-10-02 from the bug-0504 fix: round-1 `bug-fix-reviewer` finding
  R3, recorded as residual 3 in
  [0504](./0504-thetalib-invoke-resolves-caller-relative.md) `## Fix
  (0.495.0)`.
- Citations checked at main 12f1ccfd (0.495.0). The scratch probe above was
  run and deleted at the same HEAD.
- Related: [0504](./0504-thetalib-invoke-resolves-caller-relative.md)
  residual 5, filed as
  [0509](./0509-spec-invoke-caller-relative-no-thetalib-exception.md)
  (invocation.md:10 and discovery-cli.md:305-306 state
  caller-relative resolution with no `.thetalib` cross-reference). A spec
  pass for this report touches the same `.thetalib`-invoke wording.
