# Real-CLI hardening findings — Binder / slash argument binding

Lens: LLM binder that maps free-form slash arguments onto typed `params:`.
Driven through the real `pi` binary; observed via `--mode json` (the
`customType:"loom-system-note"` channel and the per-agent assistant `text_end`
envelope) and plain `-p` stdout. Model pinned `claude-haiku-4-5`.

Environment note (not a finding): under Git Bash the harness's
`MSYS_NO_PATHCONV=1` disables *all* MSYS path conversion, so a `--loom /abs/unix`
path is passed to the Windows `pi.exe` verbatim and silently matches nothing
(the loom never registers; the raw `/stem` text is sent to the model). All repros
below use a **repo-relative** `--loom ./dir` path, which works.

> **STATUS: BND-1 and BND-3 FIXED** (Phase 1 production-conformance). The
> genuine binder pass in `src/extension/production-loom-producer.ts` `runBinder`
> now runs OFF-session and INVISIBLE via pi-ai `complete()` against the RESOLVED
> binder model (`bind_model:` → `looms.binderModel`), not a user-visible streamed
> turn against `ctx.model`. On a successful bind it emits the `renderArgumentEcho`
> success echo note (BND-1) unless `bind_echo: false`; on a non-binding
> (`needs_info` / `ambiguous` / malformed) reply it emits the mapped
> `renderBinderSystemNote` failure note (BND-3) and the body does not run. The
> envelope JSON never reaches the user session. BND-2 was already fixed. See the
> per-finding before/after below and `session-findings/binder.md`.

Shared root cause. All three findings traced to the production binder path
(`src/extension/production-loom-producer.ts` `runBinder` →
`parseOkEnvelopeArgs`): on a non-bypass loom the runtime rendered a binder prompt,
dispatched it as an ordinary **on-session** agent turn, then returned
`{ bound: true, args: <the reply's `args` object, extracted verbatim> }`. The
entire spec-mandated post-binder pipeline — the success echo note, the
default-merge, the post-merge AJV validation, and the `needs_info`/`ambiguous`
→ system-note rendering with envelope suppression — was absent from the shipped
composition. (The single-string and no-params bypasses, and the SLSH-1 overflow
note, *are* correctly wired — verified below.) The Phase 1 fix wires the whole
pipeline; BND-1/BND-3 are now FIXED.

---

## FINDING BND-1 (FIXED): `bind_echo` success echo note is never emitted

> **FIXED.** `runBinder` now calls `renderArgumentEcho` on the OK arm (unless
> `bind_echo: false`) and delivers it on the `loom-system-note` channel.
> **Before:** the BND-1 two-string-param loom bound `{path, audience}`, the body
> ran, and the run emitted zero `loom-system-note` messages (no `Running /`
> echo). **After (live probe, `session-binder.test.ts`):** the same loom (with
> `looms.binderModel` set) emits `Running /forecast: city=Paris, days=3` /
> `Running /greet: topic=cats, tone=neutral (default), verbose=false (default)`
> on `systemNotes`, with `(default)` tagging on default-filled fields; a
> `bind_echo: false` loom (`/geo`) emits no echo note.

- repro:
  ```loom
  ---
  description: two string params
  mode: prompt
  bind_echo: true
  params:
    path: string
    audience: string
  ---
  @`ack`
  ```
  `MSYS_NO_PATHCONV=1 pi -ne -e ./extensions --loom ./hl --model claude-haiku-4-5 --mode json -p "/two README.md for new hires"`
- expected: on successful binding the runtime appends one system note before the
  loom runs, e.g. `Running /two: path=README.md, audience="new hires"`.
  `docs/spec_topics/binder/defaulting-system-note-echo.md#echo-policy` ("When echo
  is on (and the bypass did not apply), the runtime appends a one-line system
  note to the user's session immediately before the loom starts");
  `docs/reference/frontmatter.md` (`bind_echo` default `true`);
  `docs/spec_topics/slash-invocation.md` ("On successful binding the runtime
  appends a one-line echo system note ... The echo is on by default").
- observed: binder returns `{"kind":"ok","args":{"path":"README.md","audience":"new hires"}}`,
  the body runs, and the run emits **no** `customType:"loom-system-note"` message
  at all (`grep '"customType"'` → empty; `grep -i 'Running /'` → empty). The
  loom-system-note channel itself works — the SLSH-1 overflow note (BND control
  below) renders on the same channel in the same `--mode json` run — so the echo
  is simply not wired, not merely a mode artifact.
- verdict: bug — a spec-normative, default-on surface (`bind_echo: true`) produces
  no output through the shipped CLI; the whole `Running /<name>: …` echo formatter
  (`src/render/argument-echo.ts`) is never called by the extension.

---

## FINDING BND-2: declared `params:` defaults are not filled after binding (body sees `null`)

- repro:
  ```loom
  ---
  description: defaulted param
  mode: prompt
  bind_echo: true
  params:
    topic: string
    count: integer = 3
  ---
  @`Output exactly this one line verbatim and nothing else: RESULT topic=${topic} count=${count}`
  ```
  `MSYS_NO_PATHCONV=1 pi -ne -e ./extensions --loom ./hl3 --model claude-haiku-4-5 --mode json -p "/d puppies"`
- expected: the user omits `count`; the binder correctly omits it from `args`
  (its prompt tells it defaulted fields may be omitted); the runtime then fills
  the declared default `3` before the body runs, so `${count}` renders `3`.
  `docs/reference/frontmatter.md` §`params:` Defaults ("When a slash-command
  invocation omits the positional argument, the default fills in before AJV
  validation"); `docs/spec_topics/binder/defaulting-system-note-echo.md#defaulting`
  (fill-if-absent: "when the wire name is absent, the field takes its declared
  default"); `docs/spec_topics/binder/binder-bypass-and-envelope.md#binder-envelope`
  ("The runtime fills any defaulted fields not present in `args`, then
  AJV-validates the merged result").
- observed: the binder reply is `{"kind":"ok","args":{"topic":"puppies"}}`
  (`count` correctly omitted). The rendered body query is
  `... RESULT topic=puppies count=null` and the assistant echoes
  `RESULT topic=puppies count=null`. The default `3` was never merged; the
  omitted defaulted field reaches the body as `null`.
- verdict: bug — the `runBinder` result is passed to the body with no
  default-merge step, so every omitted-but-defaulted param is silently `null`
  instead of its declared default. (Same missing step also means the spec's
  post-default-merge AJV safety-net never runs in production.)

---

## FINDING BND-3 (FIXED): on `needs_info`/`ambiguous`, the raw binder envelope JSON leaks to the user and no failure note is emitted

> **FIXED.** The binder runs off-session, so its envelope never reaches the user
> session; a non-binding reply now emits the mapped failure-mode note via
> `renderBinderSystemNote` and the body does not run. **Before:** `/register`
> (no bindable args) left the raw `{"kind":"needs_info","message":…}` as the
> assistant reply on stdout and emitted zero `loom-system-note` messages.
> **After (live probe):** `/register` yields `assistantText === ""` (no envelope
> leak) and `systemNotes` carries
> `loom /register: argument binding needs more info — Missing required
> parameters: name (string), age (integer)`; the body does not run.

- repro: the BND-1 two-param loom, invoked with arguments that cannot fill the
  required params:
  `MSYS_NO_PATHCONV=1 pi -ne -e ./extensions --loom ./hl --model claude-haiku-4-5 -p "/two"`
  (plain `-p`, no `--mode json`).
- expected: unsuccessful binding does not run the loom and surfaces a formatted
  one-line system note; the binder envelope stays runtime-internal.
  `docs/spec_topics/binder/determinism-cancellation-failure.md#failure-mode-templates-normative`
  (`needs_info` → `loom /<name>: argument binding needs more info — <model's message>`);
  `docs/spec_topics/binder.md` ("the loom code never sees the binder's
  intermediate envelope"); `docs/spec_topics/binder/binder-bypass-and-envelope.md#binder-envelope`
  ("The envelope is runtime-internal; it is never a Loom-visible type and never
  appears ... Authors only see the *consequences* of binding");
  `docs/spec_topics/slash-invocation.md` ("unsuccessful binding surfaces a
  one-line system note in the user's session and the loom does not run").
- observed: plain `-p` stdout is the raw internal envelope verbatim:
  `{"kind":"needs_info","message":"Missing required parameters: path and audience"}`.
  In `--mode json` the run has exactly one agent (the body correctly does not
  run) and **zero** `customType:"loom-system-note"` messages. Because the binder
  is dispatched as an on-session agent turn and its non-`ok` reply is the last
  (only) turn, its raw JSON is what the user sees; the spec's
  `loom /two: argument binding needs more info — Missing required parameters…`
  note is never produced.
- verdict: bug — the binder's runtime-internal envelope is leaked to the user on
  every binding failure, and the mandated `needs_info`/`ambiguous` failure-mode
  system note is missing. (On the success path the body turn supersedes the
  binder turn in plain `-p`, so the `{"kind":"ok",…}` envelope is not printed
  there; the leak is specific to the no-body failure arms.)

---

## Controls verified working (not bugs, recorded to bound the findings)

- **Single-string bypass** (`params:` = one defaultless `string`) skips the binder
  entirely: the run has a single agent, no `argument binder for the loom` prompt
  turn, and the whole argument string is bound to the param verbatim. Matches
  `binder-bypass-and-envelope.md#bypass-cases` case 2.
- **No-params bypass + SLSH-1 overflow note**: a `params:`-less loom invoked with
  trailing text emits exactly
  `loom /nop: ignoring extra arguments — this loom takes no parameters` on the
  `customType:"loom-system-note"` channel and still runs the body (1 agent, no
  binder). Matches `slash-invocation.md#slsh-1`. (This confirms the note channel
  is live in `--mode json`, which is what makes BND-1/BND-3's *absence* of notes
  a real defect rather than a mode limitation.)
