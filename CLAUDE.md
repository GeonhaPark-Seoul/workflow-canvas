# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. Master Document, Roles, And Reading Protocol

**`docs/MASTER.md` is the human-owned product source of direction. `docs/AI_MASTER.md` is the shared AI routing entry point.**

- Before any task, read this file plus `docs/AI_MASTER.md`, then follow its routing table to MASTER.md §2 (terminology), §4 (principles), and only the sections relevant to the task.
- Do NOT read other docs by default. `docs/AI_MASTER.md` and MASTER.md §11 define the tiered reading protocol: contracts, ledgers, and appendix docs are read only when the task touches them. Saving tokens is a rule, not an optimization.
- If direction or terminology in any other document conflicts with MASTER.md, MASTER.md wins; report the conflict instead of silently picking one.
- Do not copy the current role split into this file. Read MASTER.md §12 and the user's current instruction before committing, pushing, deploying, or performing production writes.

## 0.5. Graphify Knowledge Map (Local Tool)

**Before grepping or opening many files to understand structure, query the local knowledge map first.**

- `graphify-out/graph.json` holds the extracted code+docs+SQL map (git-ignored, local only; the filename is a legacy wire name).
- Explore with: `graphify query "<question>"`, `graphify explain "<node>"`, `graphify path "A" "B"`, `graphify affected "<node>"` (impact of a change).
- After code changes, refresh with `graphify update .` (local AST, no API cost). If `graphify-out/` is missing or stale, ask the user before a full re-extract (doc semantic pass uses the claude CLI).
- The map is a navigation aid, not a source of truth: MASTER.md still wins for direction; code wins for behavior. Do not cite INFERRED edges as fact.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Canvas Spatial UX

**Keep actions attached to the system Asset they operate on.**

- Open repository code from repository nodes, deployment state from deployment nodes, and database operations from database nodes or their connected parts.
- Do not add an Asset-specific feature to a global rail, toolbar, or right-side tab unless the user explicitly approves that placement.
- Do not move or replace an existing menu, toggle, or icon without asking first.
- A side pane may present details after a contextual node action opens it; the global pane launcher is the part to avoid.

## 6. Durable Architecture And Debt

**Do not let security or commercialization obligations disappear between AI sessions.**

- Read `docs/governance/TECHNICAL_DEBT.md` before changing authentication, sharing, encryption, local connectors, external integrations, operations, deployment, telemetry, or public trust claims.
- Read `docs/protocols/SYSTEM_ONBOARDING_PROTOCOL.md` and the relevant contract before adding a system node, part, relation, adapter, trust zone, gateway, operation capability, or AI explanation feature. The archived legacy roadmap is background only.
- Record newly discovered release debt in the ledger with a stable ID, severity, status, context, and verifiable exit criteria.
- Do not mark debt complete because code exists locally. Require tests and deployment or operational evidence appropriate to the item.
- Keep Workflow Canvas-specific discovery and operations inside its adapter. The map, review, security-boundary, and operation contracts must remain reusable for other systems.
- A cross-zone relation must identify its gateway and data contract. Never equate `local`, `intranet`, or `private` with automatically safe.

## 7. Product Engines And Versions

**Treat engines as versioned product capabilities, not accidental file groups.**

- Read `docs/product/PRODUCT_CATALOG.md`, `docs/product/ENGINE_AGENT_REGISTRY.md`, and `shared/engineRegistry.js` before adding, renaming, or changing an engine or its internal component.
- Keep user-facing names short (`Asset Core`, `Draw Map`). Use the manifest's internal kind to distinguish Engine, Contract, Resolver, Builder, Pipeline, Agent Skill, Agent Policy, Hard Guardrail, Connector, and Manifest.
- `kind: engine` is top-level only. Never nest an Engine under another Engine; use another component kind or create a separately versioned top-level Engine and connect it through a Workflow.
- Update the affected engine version, compatibility declaration, code and test evidence, and `docs/product/ENGINE_CHANGELOG.md` together. Product version, engine version, schema version, and contract version are separate.
- A logical engine component is not an independent server or runtime process. It must display `논리 구성`, never `LIVE`, even if runtime-looking fields are present.
- Do not assign a Maintainer Agent by name alone. Its manifest must define scope, allowed tools, required tests, escalation conditions, and human-approval boundaries, and the engine registry must reference that validated manifest ID.
- Prefer an explicit entry point and compatibility contract before moving code into a new folder. Do not perform a broad folder-first refactor merely to make an engine look independent.

## 8. Open Source And Dependency Decisions

**Evaluate existing standards and proven libraries before inventing foundational infrastructure.**

- Read `docs/architecture/decisions/OPEN_SOURCE_POLICY.md` and `docs/architecture/decisions/DEPENDENCY_DECISIONS.md` before adding a direct dependency or implementing a new parser, layout engine, authorization engine, workflow runtime, map store, or agent protocol.
- Record every direct dependency in `docs/architecture/dependency-registry.json` and keep `THIRD_PARTY_NOTICES.md` current.
- Run `npm run governance:check` before tests and production builds.
- Do not add a large library or external authorization/service dependency such as elkjs, OpenFGA, or SpiceDB without explaining the concrete benefit, bundle or operations cost, migration path, and license, then obtaining explicit user approval.
- A candidate listed in the decision log is not an approved dependency and must not appear in runtime code until its decision status changes.
