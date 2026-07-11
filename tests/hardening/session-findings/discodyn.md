# Hardening findings — lens: DISCOVERY DYNAMICS (settings / packages / binderModel / hot-reload)

Live probes: `tests/hardening/session-discodyn.test.ts` (8 zero-token
registration+diagnostic probes; no live model turns). Run:

```
npx vitest run --config vitest.hardening.config.ts tests/hardening/session-discodyn.test.ts
```

Observation caveat (inherited from `findings/discovery-cli.md`): the shipped
composition root routes **only error-severity** diagnostics to `ctx.ui.notify`
(`production-composition.ts` `emitDiagnostic`: `if (severity !== "error") return`).
Warning-severity codes (`manifest-escapes-package`, `discovery-slow`,
`package-read-timeout`, `settings-invalid-json`, `settings-unreadable`,
`cross-source-shadow`, `binder-model-strict-capability-unknown`) never reach the
harness `diagnostics` channel. Behavioural outcomes (registration / non-registration)
are still observable. This is the known deferred routing gap, not re-reported here.

Bug-verdict count: **2** (DISCO-1 live-repro; DISCO-2 source-inspection).

---

## DISCO-1 (FIXED) — binder-model resolution is entirely unwired: `loom/load/binder-model-unresolved` never fires, and `bind_model:` / `looms.binderModel` are ignored at bind time

**Verdict: BUG (both facets) — FIXED** (Phase 1 production-conformance).

> **STATUS: FIXED.** Load-time binder-model resolution is now wired into the
> shipped composition root (`production-composition.ts`): each non-bypass loom
> runs `resolveBinderModel` over the shared `modelMatcher` + merged
> `looms.binderModel`; a loom whose chain resolves to no model fails to load with
> `loom/load/binder-model-unresolved` and is not registered. The resolved
> reference is carried onto the runnable loom, and `runBinder` resolves it to a
> concrete `Model<Api>` and drives the binder OFF-session against it (runtime
> facet) — not the ambient session model.
>
> **Before (buggy, live probe `session-discodyn.test.ts`):** `needsbind` (no
> `bind_model`, no `looms.binderModel`) registered with `diagnostics === []`;
> `viasettings` and `viafm` (unresolvable references) both registered,
> `diagnostics === []`. Runtime facet: the binder ran against `ctx.model`,
> ignoring `bind_model:` / `looms.binderModel`.
>
> **After (fixed, live probe):** `needsbind` fails to load — `registeredNames`
> excludes it and `diagnostics` contains the `binder model unresolved` error;
> `viasettings` + `viafm` likewise fail to load. With `looms.binderModel` set to
> a resolvable model (`DISCO-B`), the loom registers. Runtime facet
> (`session-binder.test.ts`): the binder is dispatched off-session against the
> resolved `anthropic/claude-haiku-4-5` binder model while the session/prompt
> model is opus — the two are now distinct, proving `bind_model:` /
> `looms.binderModel` is honoured.

Original verdict: **BUG** (live-repro at load time; runtime facet was
source-inspection).

### Repro
Three planted non-bypass looms (typed `params:` with two fields → not the
no-params / single-string bypass), each driven through the shipped discovery →
compose pipeline via `runProbe` (empty `drives`, zero tokens):

1. `needsbind.loom` — no `bind_model:`, no `looms.binderModel` setting:
   ```
   ---
   mode: prompt
   params:
     count: integer
     topic: string
   ---
   @`topic=${topic} count=${count} reply OK`
   ```
2. `viasettings.loom` — same body, with `.pi/settings.json`
   `{ "looms": { "binderModel": "no-such-model-xyz-does-not-exist" } }`.
3. `viafm.loom` — same body, but `bind_model: no-such-model-xyz-does-not-exist`
   in frontmatter (references no available model).

### Expected (with citation)
`docs/spec_topics/discovery/package-and-settings.md` §"Settings file reads",
`looms.binderModel` bullet:
> `looms.binderModel` … **Required when any non-bypass loom is in scope** — a
> non-bypass loom whose `bind_model:` is also absent fails to load with
> `loom/load/binder-model-unresolved`.

`docs/reference/discovery-cli.md` §"Settings file reads": same, and
`binder-model-and-context.md#binder-model-parse-rule` — a `bind_model:` /
`looms.binderModel` reference that matches no available model resolves to no
model, i.e. `loom/load/binder-model-unresolved` (error).

So probe 1 must **fail to load** with a `binder-model-unresolved` error, and
probes 2/3 (an unresolvable reference) must **also** fail load with the same code.

### Observed (probe channels `registeredNames` + `diagnostics`)
- `needsbind` registers; `diagnostics === []` (no `binder-model-unresolved`).
- `viasettings` **and** `viafm` both register; `diagnostics === []` — a misspelled
  `bind_model:` referencing a non-existent model is silently accepted.

### Root cause (source-inspection)
`resolveBinderModel` / `BINDER_MODEL_UNRESOLVED_CODE` (`src/binder/binder-model.ts`)
are unit-tested (`tests/binder-model-resolution.test.ts`) but **imported by no
production module** — a repo-wide search finds callers only inside
`binder-model.ts` itself and the test:
```
$ grep -rn "resolveBinderModel" src/ | grep -v "binder-model.ts"   # (empty)
```
`production-composition.ts` runs the discovery/parse/tools/invoke/imports load
passes but never a binder-model resolution pass, so `binder-model-unresolved`
never enters the diagnostic stream. This is the campaign's dominant
"implemented-and-unit-tested but never wired into the shipped composition"
defect class (`SUMMARY.md` §"Dominant defect class").

**Runtime facet (source-inspection).** The shipped binder
(`production-loom-producer.ts` `runBinder`) drives the binding turn via
`driveStreamedUserTurn({ pi, ctx, … })`, which takes **no model parameter** — it
runs against the *ambient session model* (`ctx.model`). `runBinder` references
neither `bind_model:` nor `looms.binderModel`. So even for a loom that does bind,
the configured binder model is ignored; the binder always uses the session model.
Under `pi -p --model X` this coincides with X, masking the gap; a distinct
(e.g. cheaper) `looms.binderModel` is silently non-functional.

### Relation to prior findings
Distinct from `cli-findings/SUMMARY.md` BND-1/BND-3 (binder envelope leak / the
binder running as a *user-visible* turn) — those describe the same
`driveStreamedUserTurn` mechanism but do **not** cover the unwired **load-time**
`binder-model-unresolved` check or that the model reference is never consulted.
Not covered by any DISC-*/BND-*/QTL-* entry in the two SUMMARY files.

---

## DISCO-2 — the hot-reload / watcher subsystem is unwired: no live re-scan of `.loom` / settings / package changes within a session

**Verdict: BUG (source-inspection, not live-repro).** The `runProbe` harness
boots discovery once and cannot fire the chokidar watcher within one boot, so
this is substantiated statically per the briefing's hot-reload instruction.

### Expected (with citation)
`docs/spec_topics/discovery/package-and-settings.md` §"Caching and reload":
> Both files are read once at extension load and cached. A file-watcher on each
> of the two paths invalidates the cache on change; reads following invalidation
> re-apply the merge. Watcher events are debounced over a `250 ms` window … via
> `Clock.setTimeout` / `Clock.clearTimeout` …

§"Watcher-time reload failures": the settings-file watcher **and** the
discovery-root chokidar watcher registered in
`pi-integration-contract/registration-steps.md#watcher-hot-reload-registration`
(step 5) surface rebuild failures as **ERR-7** on `loom-system-note`.
`discovery-sources.md` §"Discovery roots": "hot-reload re-runs the computation."

So the shipped extension must register a settings-file watcher and a
discovery-root watcher, debounce events (250 ms), re-run discovery, emit the
structural-change note (`loom watcher: <N> file(s) added or removed …`), and
surface watcher-time failures as ERR-7.

### Observed (source-inspection)
The factory installs exactly three `pi.on` subscriptions
(`src/extension/factory.ts`): `resources_discover`, `session_start`,
`session_shutdown`. The `resources_discover` and `session_shutdown` handlers are
**no-ops** (`() => undefined`); discovery runs one-shot inside `session_start`
(`discoverAndComposeFixtures`). There is **no** step-5 watcher / hot-reload
registration. Repo-wide:
- `ReloadDebouncer` (`src/extension/reload-debounce.ts`) — **no production caller**
  (`grep -rn ReloadDebouncer src/ | grep -v reload-debounce.ts` is empty).
- `armWatcherWithTerminalRecovery` (`src/extension/watcher-recovery.ts`) — **no
  production caller**; its `deps.watcher.watch(...)` is the only `.watch(` call in
  the extension and it is never reached.
- `PiFileWatcher` is constructed and stored on the runtime-root seam
  (`production-composition.ts:137`) but its `.watch(...)` is never invoked from
  `factory.ts` / `production-composition.ts`.
- `rebuildAndSwap` / `structuralChangeNote` / the settings-file per-path watcher
  are implemented (`reload-wiring.ts`) and unit-tested but not wired.

Net: editing a `.loom`, editing `.pi/settings.json` (incl. a `loomPaths` or
`looms.binderModel` change), or adding/removing a loom **during a live session**
produces no re-scan, no debounced reload, no structural-change note, and no
ERR-7 watcher-time failure surface. The user must restart the session (or invoke
the host's `/reload`) to pick up changes.

### Verdict reasoning
Same "implemented-but-unwired" class as DISCO-1. The reload/watcher modules are
full implementations (not `V*-T` stubs), and the spec treats hot-reload as
normative (`package-and-settings.md`, `registration-steps.md` step 5), so this is
a genuine divergence rather than an intentional 1.0 cut. Marked source-inspection
because the harness cannot drive the chokidar watcher within one boot; a fixer
should confirm with a watcher-level integration test. If the campaign decides
hot-reload is out of scope for loom 1.0, downgrade to documented-gap — but the
shipped code carries the full machinery, which argues it was meant to ship wired.

---

## Verified-conformant (no defect — bounds the search)

All live-reachable, zero-token, confirmed against the shipped pipeline:

- **Package `pi.looms` manifest (DISC-5).** A package under `node_modules/<pkg>/`
  with `package.json` `{ "pi": { "looms": ["mypkgloom.loom"] } }` registers
  `/mypkgloom`. Package discovery IS wired (`discoverPackageLooms` at the
  composition root) and scans project-local `node_modules/`.
- **`looms/` fallback.** A package with no `pi.looms` and a
  `looms/barloom.loom` registers `/barloom` (non-recursive).
- **Non-`string[]` `pi.looms` → `manifest-invalid` (error).** `"pi.looms":
  "not-an-array"` emits `package '<pkg>' has invalid 'pi.looms': expected
  string[], got string`; no loom loads from that package.
- **Escape entry → blocked.** `"pi.looms": ["../sneaky.loom"]` does not register
  `/sneaky` (`manifest-escapes-package`, warning — suppressed by the error-only
  route, so no diagnostic surfaces, but the entry is correctly dropped).
- **`looms.scanPackages: false`** disables the whole package walk (the package
  loom does not register).
- **`loomPaths` dir entry** (relative to `.pi/`) registers its `*.loom` children
  (`/extra`); a **non-`.loom` file** entry → `invalid-extension` error
  ("… does not end in .loom"); a **missing** entry → `missing-source` error
  ("discovery source path does not exist: settings entry index N") — confirms the
  fixed DISC-1 now fires correctly for a relative missing path on Windows.
- **Scalar out-of-range (DISC-7).** `scanPackages: "true"` (string),
  `scanPackagesMaxFiles: null`, `scanPackagesTimeoutMs: -5` each emit one
  `settings-value-out-of-range` error (per key, non-fatal); the sibling loom
  still registers. (Extends the DISC-1 confirmed-correct set with the string /
  null / negative forms.)
- **Invalid-JSON settings** (`{ this is : not json`) is treated as `{}`; the
  project loom still registers and nothing crashes (the `settings-invalid-json`
  warning is suppressed — known routing gap, not re-reported).
