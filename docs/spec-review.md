# Triaged Spec Review - spec

_Generated: 2026-06-02T08:55:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T11) is addressed first; the first finding (T10) is addressed last._

_Triage tally: 1 high retained (T10); 9 medium findings (T01-T09) removed by request._

---

# T10 - CLAUDE.md Exception Handling rule is written in C++ syntax

**Kind:** doc-alignment-broad
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`CLAUDE.md`'s Code Style → Exception Handling bullet forbids `catch(...)` and `catch(std::exception&)` — both C++ syntax, neither legal TypeScript — even though pi-loom mandates a TypeScript runtime and `docs/plan_topics/conventions.md` already carries the authoritative TypeScript form of the same rule (the `Specific exception types only` bullet). CLAUDE.md is the top-of-context onboarding instruction loaded by every AI coding agent operating in the repo. An agent reading the rule literally either emits C++ syntax the TypeScript compiler rejects, or infers its own translation that may diverge from conventions.md's enumerated forbidden set and the `no-broad-catch` enforcer.

## Solution approach

Rewrite the CLAUDE.md Code Style → Exception Handling bullet to use TypeScript syntax mirroring conventions.md's `Specific exception types only` rule: forbid `catch (e)`, `catch (e: unknown)`, `catch (e: any)`, and `catch (e: Error)` plus the rethrow-on-mismatch pattern, directing the reader to bind to a specific subtype or let the exception propagate. Retain a forward-reference to `docs/plan_topics/conventions.md`.

## Solution constraints

- CLAUDE.md MUST keep a forward-reference to `docs/plan_topics/conventions.md` as the single source of truth and MUST NOT duplicate the `no-broad-catch` ESLint rule name or the coverage-matrix gate inline.

## Relationships

None

