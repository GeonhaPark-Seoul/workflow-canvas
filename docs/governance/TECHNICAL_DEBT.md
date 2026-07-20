# Workflow Canvas Technical Debt Ledger

This is the durable ledger for security, reliability, commercialization, and architecture work that must not be lost between AI coding sessions. Historical product ideas are preserved in the legacy path `docs/twin/archive/TWIN_ENGINE_ROADMAP.md`; this file records obligations, release blockers, and known limitations.

## Ledger rules

- Never delete an item because work started. Change its status and add verification evidence.
- A completed item needs code or operational evidence and a regression test where possible.
- New connectors, operations, trust-boundary crossings, or sensitive data classes must add or update a ledger item before release.
- `release-blocker` means the public product must not make the stronger promise until the exit criteria are met.
- Status values: `open`, `in-progress`, `implemented-pending-deploy`, `blocked`, `complete`.

## Current release position

- Internal MVP: allowed with the documented limits and owner supervision.
- Public `source-twin` wire/local-connector release: blocked until the local helper distribution and consent items below are complete.
- Operator-blind canvas storage claim: blocked. `npm run privacy:check` currently reports `blocked-pending-operator-blind-storage` by design.
- Public, tamper-evident transparency claim: blocked. The current audit log is an internal application record, not external proof.

## Highest-priority product debt

### UX-004 - System-map capability authorship and portability

- Priority: **P0 — highest item in this ledger** (product owner decision, 2026-07-20)
- Severity: high
- Gate: product-v1 system-map authoring
- Status: open
- Context: an ordinary canvas can reproduce visible nodes, parts, relations, evidence text and layout, but it cannot create the registered identity, source bindings, server observations or local/external execution contracts that make the current Workflow Canvas system map operational. A copied `syncs_with` line is descriptive; the working Git synchronization control depends on a registered operation, server plan, queue, Local Connector grant and device-side approval. The same gap applies to Asset review, Source Lens attachment, verified LIVE state, source edit/rollback and several generated security/layer projections. Copy/paste remaps identity and strips protected bindings, while a blank ordinary canvas currently has no visible path to create its first custom layer.
- Risk: users can draw something that looks identical to an operational system map while having no way to understand, reproduce or safely attach its capabilities. Appearance can therefore be mistaken for identity, evidence or execution authority, and system-map functionality remains tied to a special self-map template rather than a documented product boundary.
- Required work: publish and implement a user-facing capability matrix that separates (1) freely authored map content, (2) deterministic generated Asset/evidence bindings, (3) server-verified observation, and (4) Connector/Operation-backed execution. For every non-authorable capability, choose either a safe generic registration/authoring workflow or an explicit supported-template restriction with a clear explanation. Define stable import/copy/clone behavior, binding transfer and re-verification rules, system-map template registration, owner/member permissions, and a first-layer bootstrap path for ordinary canvases. Names and visual similarity must never grant identity, LIVE or execution authority.
- Exit criteria: a non-developer can tell which elements are descriptive and which are registered/verified/executable; two supported non-self system maps can be created through the documented workflow without hard-coded self-map IDs; copy/import never silently creates or drops authority; an ordinary blank canvas can create its first layer; and regression tests cover ordinary canvas, generated map, copy/import, redacted member and stale-binding cases.

## Local connector and device boundary

### LOC-001 - Repository path containment

- Severity: critical
- Gate: release-blocker
- Status: implemented-pending-deploy
- Context: Git-listed symbolic links could otherwise make a scanner touch a file outside the selected repository.
- Current mitigation: reject symbolic links, non-regular files, resolved paths outside the repository, files over 2 MiB, and scan sets over 24 MiB.
- Exit criteria: regression tests pass on macOS, Windows, and Linux; the UI explains rejected files without exposing their content.

### LOC-002 - Read-only default and device-side mutation consent

- Severity: critical
- Gate: release-blocker
- Status: implemented-pending-deploy
- Context: a cloud-only approval is not sufficient if the cloud control plane is compromised.
- Current mitigation: connector startup is read-only by default. Git sync requires `--allow-git-sync`; registered UI source editing requires the separate `--allow-source-write` flag. Every write still requires a per-operation phrase in the local terminal, and source editing shows the exact target-file diff there before commit.
- Exit criteria: replace terminal confirmation with a signed local consent UI that identifies repository, remote, operation, commit range, risk, and recovery path.

### LOC-003 - Revocation must stop the agent

- Severity: high
- Gate: release-blocker
- Status: implemented-pending-deploy
- Context: a revoked token previously caused endless retries and repeated local scans.
- Current mitigation: HTTP 401/403 or the connector-auth error stops the process after the rejected request.
- Exit criteria: the signed helper receives revocation, stops scanning immediately, clears credentials, and reports a local audit event.

### LOC-004 - Repository and remote identity pinning

- Severity: high
- Gate: release-blocker
- Status: implemented-pending-deploy
- Context: an operation must not continue if its repository root or Git remote changes after startup.
- Current mitigation: canonical repository root and an exact credential-free GitHub origin are pinned; the origin fingerprint is included in operation state. Git synchronization verifies branch, origin, clean worktree, zero ahead/behind, and matching HEAD/upstream. Registered source editing additionally requires an unchanged HEAD, clean worktree, pinned origin, exact AST property anchor and a separate source-write grant; it works in an isolated worktree and fast-forwards only its verified provenance commit. The server refuses success without the bounded postcondition record.
- Exit criteria: use a stable device-local repository identity and support approved Git providers through provider adapters without weakening the pin.

### LOC-005 - Trusted helper distribution

- Severity: critical
- Gate: release-blocker
- Status: open
- Context: a compromised web deployment can display an arbitrary shell command, and repository code can be changed through the software supply chain.
- Required work: ship a separately signed desktop/helper application; use signed updates; never ask public users to execute a command generated by webpage JavaScript.
- Exit criteria: installer signature and update signature are verified, downgrade is prevented, and pairing uses a short-lived code rather than a raw shell command.

### LOC-006 - Operating-system sandbox and selected-folder grant

- Severity: critical
- Gate: release-blocker
- Status: open
- Required work: run the helper in an OS sandbox; access only folders selected through the native picker; default to read-only; separate the scanner from the Git executor.
- Exit criteria: a compromised helper cannot read outside granted folders or access Git credentials unless an approved operation needs them.

### LOC-007 - Device-bound credentials

- Severity: high
- Gate: release-blocker
- Status: open
- Required work: store connector secrets in Keychain/credential storage, bind pairing to a device key pair, rotate and revoke keys, and avoid long-lived tokens in command history or process environment.
- Exit criteria: stolen cloud data or copied database rows cannot impersonate the paired device.

### LOC-008 - Outbound data contract and user-visible privacy preview

- Severity: high
- Gate: release-blocker
- Status: open
- Context: source bodies are excluded today, but paths, names, line ranges, hashes, repository URL, Git state, and security metadata leave the device.
- Current mitigation: explanation evidence uses only relative repository paths and line ranges plus allowlisted symbol, API, DB, environment-variable-name, dependency, deployment, script, and security-signal references. The server sanitizer rejects absolute paths, parent traversal, URLs, malformed identifiers, source bodies, and credential values before storing a local manifest.
- Required work: publish a versioned payload schema, show exactly what leaves the device, support metadata-minimal mode, enforce size/rate limits, and add local outbound audit logs.
- Exit criteria: payload contract tests prove that source bodies, credential values, absolute paths, commit messages, and unrelated filenames cannot leave the device.

### LOC-009 - Stable device identity and helper lifecycle

- Severity: high
- Gate: public local-connector release
- Status: in progress
- Context: each press of the pairing button creates a separate revocable registration. The current token-only MVP cannot prove whether two offline registrations are accidental duplicates, two Macs, or two grants for the same repository, so automatic deletion would be unsafe.
- Current mitigation: the UI distinguishes every registration by connection state, last response time, and short registration ID; currently online registrations sort first; unused records can be explicitly revoked; new records are named as connections rather than project copies.
- Required work: the signed helper needs a device-bound installation ID, a stable selected-folder grant ID, user-editable device/project names, duplicate-pairing detection, native connection management, login auto-start, signed background updates, health reporting, and clean uninstall/revocation. Re-pairing the same device and folder should rotate credentials instead of accumulating indistinguishable rows.
- Exit criteria: a user can distinguish device, repository, permission, and health without terminal knowledge; restarting or upgrading does not create a duplicate registration; loss, transfer, reinstall, and revocation have tested lifecycle paths.

## Privacy, identity, and transparency

### SEC-001 - Browser source visibility and repository exposure

- Severity: high
- Gate: release-blocker for any "users cannot inspect the technology" claim
- Status: open
- Current limitation: code delivered to a browser can be inspected with developer tools. Minification and disabled production source maps reduce convenience but do not make frontend code secret. Repository visibility is a separate GitHub setting and was not independently verified in this session.
- Current mitigation: no service-role secret is referenced by browser code; privileged operations remain behind authenticated server or database boundaries; production security headers limit several browser attack classes.
- Required work: verify that the production GitHub repository has the intended visibility and branch protections, add secret and source-map checks to release CI, and document which client code is intentionally public. Keep all secrets, authorization decisions, and sensitive business logic server-side.
- Exit criteria: CI proves that browser bundles contain no server credentials or source maps, repository visibility is verified for every release, and product claims never imply that developer tools can be disabled as a security boundary.

### SEC-002 - MCP URL token transport and rotation

- Severity: high
- Gate: public MCP release
- Status: open
- Current limitation: connector compatibility currently places the MCP bearer token in the query string. `no-referrer` and `no-store` reduce propagation, but the URL can still appear in browser history, provider telemetry, reverse-proxy access logs, screenshots, or copied text.
- Required work: prefer an authorization header, OAuth/device authorization, or short-lived exchange token when connector support allows it; redact query strings in every log; provide rotation, expiry, device/session binding, and a visible last-used audit trail.
- Exit criteria: long-lived credentials never appear in URLs and a leaked short-lived token cannot be replayed outside its intended connector session.

### SEC-003 - Distributed abuse controls and security monitoring

- Severity: high
- Gate: release-blocker
- Status: in-progress
- Current evidence: invitation creation validates bounded identifiers and email shape, rejects oversized canvas payloads, and applies per-inviter minute/day limits. Shared-canvas errors no longer expose raw database failures.
- Required work: move rate counters to a shared durable limiter; cover authentication, invitations, friendship actions, links, MCP, local connector, runtime probes, and write endpoints; add IP/account/device anomaly signals, alerting, safe lockout recovery, and incident runbooks. Application limits must be backed by Vercel/firewall controls where appropriate.
- Exit criteria: concurrent instances cannot bypass limits, security events produce actionable alerts without leaking private content, and abuse/load tests verify both fail-closed behavior and legitimate recovery.

### SEC-004 - Shared identity and delegated invitation integrity

- Severity: critical
- Gate: release-blocker
- Status: implemented-pending-deploy
- Current evidence: profile email is sourced from `auth.users`, profile writes use auth-bound RPCs, browser roles receive read-only access to profile/share control tables, and shared participant visibility is computed from accepted canvas grants. Multiple group/node grants compose without dropping scope, while owner-managed `can_invite` only delegates invitations inside the participant's accepted scope.
- Required work: deploy `supabase-profiles.sql`, `supabase-shares.sql`, and `supabase-security-hardening.sql` together; exercise owner, delegated inviter, read-only participant, removed participant, and unrelated-user cases against staging data; add browser end-to-end coverage for every control.
- Exit criteria: direct REST/table mutation cannot forge identity, membership, or invitation authority, and staging tests prove that unrelated users cannot enumerate profiles, shares, or canvas content.

### PRIV-001 - Operator-blind canvas content

- Severity: critical
- Gate: release-blocker for any "operator cannot read" claim
- Status: open
- Current limitation: Supabase/Vercel operators with privileged access can read stored canvas JSON.
- Required work: client-side or end-to-end encryption, participant key wrapping, recovery design, encrypted search/merge strategy, attachment encryption, and explicit MCP/AI key delegation.
- Exit criteria: server storage and logs contain ciphertext only, authorized collaboration still works, and independent review verifies the threat model.

### PRIV-003 - Friendship discovery privacy

- Severity: medium
- Gate: product-v1
- Status: implemented-pending-deploy
- Current evidence: a friend request can target only an account that already shares an accepted canvas with the requester, and address resolution uses the authenticated identity table rather than user-editable profile email.
- Required work: add block/report controls, request throttling, notification preferences, friendship export/deletion coverage, and a privacy review of whether email should remain visible after a shared relationship ends.
- Exit criteria: friendship cannot be used for global account discovery or repeated harassment, and both participants can revoke the relationship and its notifications predictably.

### PRIV-002 - Data lifecycle and user rights

- Severity: high
- Gate: release-blocker
- Status: open
- Required work: retention policy, full export, account deletion, connector-history deletion rules, backup retention, privacy policy, consent records, and regional/legal review.
- Exit criteria: automated tests and an operational runbook prove export and deletion behavior.

### TRUST-001 - Tamper-evident public system map

- Severity: high
- Gate: release-blocker for public-proof claims
- Status: open
- Current limitation: application audit tables can support internal accountability but cannot prove that a project administrator did not bypass them.
- Required work: signed build provenance, reproducible manifests, append-only external anchoring or transparency log, independent verifier, and a read-only public evidence view.
- Exit criteria: a third party can verify deployed code, declared architecture, observation evidence, and map revision without trusting the canvas owner.

### TRUST-002 - Trust zones, gateways, and attack-path overlay

- Severity: high
- Gate: engine-v1
- Status: in-progress
- Current mitigation: `shared/trustTopology.js` defines normalized zone and gateway records, strips unknown fields and secret-like literals at persistence boundaries, and fails cross-zone analysis as `unknown-gap` when no matching gateway exists. `shared/securityOverlay.js` projects only the viewer's redaction-safe map into an opt-in overlay. The Workflow Canvas reference system map declares its currently evidenced local, Vercel, Supabase and GitHub boundaries through approval-only Proposals.
- Required work: extend the same adapter-neutral contract to local network, intranet and private datacenter reference systems; add server-owned observed gateway status and keep normal flows separate from a later attack-path model. Continue auditing every new cross-zone relation for direction, protocol, data class, authentication, authorization and exposure.
- Exit criteria: the Workflow Canvas reference system map shows normal flows and potential threat paths separately and never equates `local` with `safe`.

## Operation safety and reliability

### OPS-001 - Universal operation contract

- Severity: critical
- Gate: engine-v1 mutations
- Status: in progress
- Current evidence: `shared/operationLifecycle.js` now validates executable operation definitions and provides one append-only state machine for direct UI, deterministic automation, and future AI initiators. It covers plan identity, human approval, queue/start, execution result, postcondition or independent verification, cancellation, idempotent retry, recovery, terminal states, and fingerprint-linked audit events. Local Git synchronization and the `source-twin` wire snapshot operation bind signed plans to canonical definition fingerprints; Git success additionally requires a post-execution state record. Existing product operations outside these two paths and generic durable persistence remain.
- Required work: every operation implements plan, preview, authorization, local/cloud consent as applicable, execute, verify, audit, timeout, idempotency, recovery, and rollback declaration.
- Exit criteria: adapters cannot expose an executable action without satisfying the operation contract and risk policy.

### OPS-002 - Backup, restore, and disaster recovery

- Severity: high
- Gate: release-blocker
- Status: open
- Required work: encrypted backups, point-in-time recovery, attachment restore, restore drills, RPO/RTO targets, and user-visible incident handling.
- Exit criteria: a documented restore drill succeeds from production-shaped data.

### OPS-003 - Database and schema migration discipline

- Severity: high
- Gate: release-blocker
- Status: open
- Required work: ordered migrations, applied-version table, idempotent deployment checks, rollback/forward-fix rules, staging validation, and removal of manual SQL copy/paste for public users.
- Exit criteria: a clean install and upgrades from supported versions pass automatically.

### OPS-004 - Supply-chain and incident response

- Severity: high
- Gate: release-blocker
- Status: open
- Required work: dependency scanning, lockfile policy, secret scanning, protected branches, least-privilege GitHub App, signed release artifacts, credential rotation, security contact, incident runbook, and breach notification process.
- Exit criteria: release CI enforces the controls and a tabletop incident exercise is completed.

### OPS-005 - Durable universal operation runs and verifier isolation

- Severity: critical
- Gate: engine-v2 mutations
- Status: open
- Current limitation: the universal lifecycle is a validated shared contract, while durable storage still uses operation-specific tables. Git postcondition verification runs in the paired local connector process, so it is honest `postcondition` evidence rather than an independently isolated verifier.
- Required work: tenant-scoped common operation-plan, run, approval, event, artifact, cancellation, retry, and recovery tables; append-only DB guards; cryptographic event signing or external anchoring; leases and timeouts; dead-letter handling; independent verifier workers for high-risk operations; retention and redaction policy.
- Exit criteria: interrupted, duplicated, stale, forged, or partially completed jobs cannot skip a state or duplicate a mutation, and a separate verifier can independently promote supported results to `succeeded`.

### OPS-006 - Open-source, dependency, SBOM, and license governance

- Severity: high
- Gate: public-release
- Status: in-progress
- Current evidence: `docs/architecture/decisions/OPEN_SOURCE_POLICY.md` requires standards and proven-library review before foundational custom code, `docs/architecture/dependency-registry.json` records every current direct dependency and locked license, `THIRD_PARTY_NOTICES.md` exposes the direct inventory, and `npm run governance:check` blocks tests and builds when package metadata drifts. No new large dependency was adopted. SBOM generation is available through npm, but retention as a CI release artifact and automated vulnerability review are not yet configured.
- Required work: retain a CycloneDX SBOM for each release, scan direct and transitive dependencies plus licenses in protected CI, define vulnerability severity and update SLAs, capture copyright notices where licenses require them, review bundled/browser-distributed licenses, and make dependency decisions reviewable before merge.
- Exit criteria: every release has a retained SBOM and license report tied to its commit, an undeclared direct dependency or disallowed license cannot merge, and critical dependency findings block release under a documented exception process.

### OPS-007 - Online vulnerability and deployment verification

- Severity: high
- Gate: release-blocker
- Status: open
- Current evidence: the production dependency tree passes the locally cached `npm audit --omit=dev --offline` database and no service-role credential was found by the repository boundary test. Offline success is not proof against advisories published after the cache was last updated.
- Required work: run online dependency, secret, SAST, and production-bundle scans in protected CI; retain reports with the commit and deployment; verify Vercel security headers and database migration versions after production deployment.
- Exit criteria: a release cannot become production-ready when a blocking advisory, exposed secret, missing hardening migration, or required header is detected.

## Scale, performance, and domain correctness

### PERF-001 - Summary-first canvas loading

- Severity: high
- Gate: product-v1
- Status: implemented-pending-deploy
- Current evidence: login and navigation fetch paginated canvas summaries, hydrate only the active canvas body, guard stale asynchronous loads, and invalidate inactive cache entries without downloading every canvas JSON document. MCP and shared-canvas listings use a service-role-only database summary projection and batch shared-owner reads.
- Required work: verify the migration and browser flow on production-shaped accounts; add a bounded LRU cache, cancellation, loading/error states, and cursor-based UI pagination for accounts with thousands of canvases.
- Exit criteria: startup payload and query count stay bounded as inactive canvas count grows, and stale requests cannot replace or overwrite the active canvas.

### PERF-002 - Large-canvas persistence and incremental synchronization

- Severity: high
- Gate: large-workspace release
- Status: open
- Current limitation: the active canvas is still stored and written as large JSON arrays in one row. Summary projection avoids listing costs but editing a very large canvas can still transfer, reconcile, and rewrite the full document.
- Required work: define measured thresholds; add compressed/delta transport or normalized node/edge tables with versioned migrations; preserve atomic revisions, offline recovery, collaboration permissions, manual layout, and rollback. Do not change storage solely to reduce line counts.
- Exit criteria: load, save, realtime update, and conflict behavior meet explicit latency/memory targets at the supported maximum node and edge counts.

### PERF-003 - UI and source-module decomposition

- Severity: medium
- Gate: product-v1 maintenance
- Status: open
- Current limitation: `src/App.jsx`, `mcp/store.js`, and several `source-twin` wire compatibility modules contain many unrelated responsibilities, increasing regression risk even when runtime performance is acceptable.
- Required work: split by tested domain boundaries such as canvas navigation, sharing, grouping, review, runtime observation, and persistence; establish bundle and complexity budgets; preserve behavior through contract and browser tests. File length alone is not a valid refactor goal.
- Exit criteria: core workflows can be changed and tested independently without duplicating state or increasing initial bundle cost.

### PERF-004 - `source-twin` wire bundle and PWA cache budget

- Severity: medium
- Gate: product-v1
- Status: in-progress
- Current evidence: the `source-twin` wire compatibility adapter is emitted as a separate lazy chunk and excluded from the PWA precache. The 2026-07-18 production build measured 2,551.42 kB minified / 494.87 kB gzip for that lazy chunk; the ordinary precache was 1,136.77 KiB. Code-part and flow catalogs are server-only and fetched per selected module, so the browser entry chunk cannot import them; regression tests enforce that boundary. Their generated server files currently measure about 3.12 MB and 5.10 MB respectively, so server cold-start and generation memory remain a scaling concern even though they do not enter the browser bundle.
- Required work: measure real route usage and server cold starts; split generated review, code-part, and flow catalogs into independently addressable artifacts; cap per-module indexes; load them only when the relevant system-map/code module opens; fail CI when agreed gzip, startup, payload, or memory budgets regress.
- Exit criteria: ordinary canvas startup does not download or precache `source-twin` wire compatibility data that the user never opens, and system-map loading remains responsive on supported devices.

### PERF-005 - Shared-list pagination and request consolidation

- Severity: medium
- Gate: product-v1
- Status: in-progress
- Current evidence: server and client share queries page and batch records, participant lookup uses maps instead of repeated full-list filters, and service-role access begins from the authenticated user's membership rows rather than scanning all shares.
- Required work: expose cursor-based pagination in the participant/share UI, consolidate duplicate share/member fetches, add request cancellation, and test accounts with thousands of accepted and revoked grants.
- Exit criteria: participant and invite panels have bounded memory/query counts and do not freeze or return partial authority decisions at supported scale.

### QA-001 - Domain workflow and rendered-content correctness

- Severity: high
- Gate: release-blocker for each shipped business template
- Status: open
- Context: a fast interface is still defective if a leave form cannot select leave dates, HTML appears in a list, or ledger totals and states are semantically wrong.
- Required work: define typed schemas and business invariants per template; validate at input, API, and database boundaries; render rich text only through the shared allowlist sanitizer; create golden fixtures and end-to-end journeys with domain reviewers; test empty, malformed, concurrent, timezone, permission, and rollback cases.
- Exit criteria: every marketed workflow has executable acceptance criteria and representative domain review, and raw markup or invalid state cannot leak into list/table views.

### QA-002 - Production-shaped performance and correctness gates

- Severity: high
- Gate: product-v1
- Status: open
- Required work: create anonymized fixture generators for many canvases, dense maps, many participants, large notes, and long operation histories; measure browser memory, interaction latency, database query plans, API payloads, and error behavior; add browser regression screenshots for critical controls.
- Exit criteria: releases meet documented budgets on desktop and mobile, and performance fixes cannot silently change permissions, ordering, forms, or canvas behavior.

## Asset architecture and product

### ENG-009 - Asset Base v4 wire and identifier migration

- Severity: high
- Gate: Asset Base schema v4
- Status: open
- Context: this terminology pass changes only concepts and display names. The Asset 원장의 current wire schema code name is `TwinBuild` v3, and deployed data, scripts and MCP clients still depend on legacy identifiers. Renaming them independently would split identity and break compatibility.
- Deferred compatibility set: keep `shared/twinBuild.js` and its exports; `shared/twinAdapterContract.js`; stored JSON wire key `entity`; node field `digitalTwinBinding`; server-only field `twinRuntime`; Draw Map의 wire 이름은 `create_graph`이며 이를 유지; the `docs/twin/` path; Engine Registry `kind` wire values; and Registry IDs such as `engine-twin-core`, `engine-create-graph` and their component IDs unchanged during the display-name pass.
- Required work: migrate this set together in the future wire schema code release `TwinBuild` v4. Define old-read/new-write and rollback windows, deterministic v0→v4 fixtures, persisted-canvas and proposal migration, MCP alias/deprecation policy, Registry ID mapping, import/export behavior, server-runtime isolation, documentation redirects and compatibility telemetry. Preserve manual layout, notes, review decisions, evidence and operation bindings, and do not invent a replacement name for the legacy `Twin Adapter Contract` before its responsibilities are actually decomposed.
- Exit criteria: supported v0–v3 records and existing clients upgrade without data or authority loss; old and new identifiers cannot create duplicate Asset identities; stale plans/bindings fail safely; compatibility and rollback tests cover browser, MCP, server, local connector and generated map paths; and only then may the legacy wire/file/path names be retired.

### ENG-001 - Versioned Asset Base schema and migrations

- Severity: high
- Gate: engine-v1
- Status: in-progress
- Current evidence: the Asset 원장의 current wire schema code name `TwinBuild v3` normalizes `entities`, `parts`, `relations`, trust zones, gateways, evidence, data classes, policies, observations, events, operations, controls, threats, and optional logical-component metadata with stable IDs, deterministic fingerprints, cross-record reference integrity, secret-reference rejection, and a tested v0-to-v1-to-v2-to-v3 forward migration. v1 operations retain identity and evidence but remain non-executable declarations until their safety contract is completed. v2 `entities` records gain a null logical-component field rather than being guessed into engine nodes. Compatibility support windows, large-build migration performance, and UI materialization for the remaining overlays remain.
- Required work: stable IDs and schemas for Assets (wire collection name `entities`), capabilities,
  relations, trust zones, gateways, evidence, observations, operations, policies, events, and
  threats; provide forward migrations and compatibility windows.
- Exit criteria: an older Asset 원장 record upgrades without losing manual layout, annotations, decisions, or evidence links.

### ENG-002 - Adapter SDK and system onboarding

- Severity: high
- Gate: engine-v1
- Status: in-progress
- Current evidence: `shared/twinAdapterContract.js` validates version compatibility, declared interfaces, data classes, permissions, operation capability IDs, lazy module identity, and review output. Workflow Canvas implements `normalize` and `reconcile`; a second order-service adapter creates actionable Asset, part, and gateway-aware relation proposals through the same registry and common reconciliation engine without changing core code. A real second-language repository adapter and packaged SDK remain.
- Required work: a versioned adapter contract for discovery, identity resolution, evidence, operation capabilities, and verification. Workflow Canvas remains the reference adapter, not a hard-coded special case in the engine core.
- Exit criteria: a second software stack can be onboarded without changing the core map/review/execution engine.

### ENG-003 - Multi-language semantic and runtime evidence

- Severity: medium
- Gate: post-engine-v1
- Status: open
- Current evidence: Source Profile Contract v1 records each language as `parsed`, `structure-only`, or `unsupported`. A FastAPI order-service reference profile proves file-level product grouping without modifying the common scanner, while Python remains explicitly `structure-only`; no Python function, import, call map, runtime, or security claim is produced.
- Required work: parser/LSP support beyond JavaScript, schema and infrastructure introspection, code/data-flow analysis, runtime traces/metrics/logs, confidence scoring, and explicit unknown states.
- Exit criteria: static declarations and runtime-verified behavior are visibly distinct and testable.

### ENG-004 - Explanation modes with evidence

- Severity: medium
- Gate: product-v1
- Status: in progress
- Current evidence: the JavaScript source scanner separates plain-language role, user impact, product area, subsystem, and technical counts. Local and GitHub repository views share an explicit `쉬운 설명`/`개발자 정보` switch. Every generated Asset records its explanation method and bounded references to the relative source range and relevant symbol, API, DB, environment-variable name, dependency, deployment, script, security signal, and selected Source Profile version. Code Part Translator adds deterministic Korean templates for eight AST-backed part kinds. An owner-only, disabled-by-default AI comparison adapter can send only part kind, symbol, relative path, line range, AST type, and deterministic summary; it returns a visibly AI-generated artifact beside deterministic evidence and cannot create topology, permissions, or Reality claims. No provider, model, key, or cost has been approved or activated yet.
- Required work: attach separate evidence sets to each individual summary and user-impact sentence where they differ; validate parsed explanations against a real second-language repository after a parser decision; measure unclear/fallback explanations; persist the preferred audience mode per user; later allow AI to draft improved wording from explicitly granted source context while keeping every claim tied to deterministic evidence. AI may not invent topology, permissions, or runtime truth.
- Exit criteria: every explanation links to evidence and can reveal the technical source without changing the underlying Asset record.

### ENG-005 - Review queue usability and proposal lifecycle

- Severity: medium
- Gate: product-v1
- Status: open
- Required work: distinguish `apply to map`, `acknowledge`, `ignore this evidence`, `obsolete proposal`, and `security review`; expire proposals on engine/schema changes and support safe batch review.
- Exit criteria: a non-developer can decide each item without external guidance and no stale proposal can be applied.

### ENG-006 - Round-trip visual code editing

- Severity: high
- Gate: visual-code-editing
- Status: in-progress
- Context: a future user should be able to change an exposed value such as `노드 크기 240` or directly resize an element in a Figma-like editor and have the corresponding source code change safely. This is a bidirectional, code-backed editor, not arbitrary text replacement and not a reason to expose the whole repository to the browser or AI.
- Required work: define an explicit editable-property schema with stable AST/CST source anchors, types, units, ranges, responsive variants, ownership, evidence, and dependency impact; support deterministic code-to-control and control-to-code round trips; create changes in an isolated branch or worktree; show visual preview plus exact source diff; reject stale anchors and concurrent edits; run formatter, type checks, tests, security checks, and production build; require risk-based approval; commit with provenance; support undo, rollback, and recovery. Direct manipulation must preserve layout constraints rather than writing accidental pixel values. AI may propose values or grouped edits but uses the same contract and cannot bypass validation or consent.
- Current evidence: the internal owner-only MVP registers four low-risk literals in `shared/uiConstants.js` (system-node width/height, module color, empty-state wording). Each has a typed schema, unit/range, owner, impact scope, stable file/export/AST/range anchor, deterministic literal serializer, and required checks. The browser can only request a signed plan; the local connector needs a distinct `--allow-source-write` grant, pins repository/remote/HEAD, creates an isolated worktree, rejects unexpected changed paths, runs the property contract test, production build and `git diff --check`, shows the exact target-file diff in the Mac terminal, requires a second phrase, commits provenance, and fast-forwards only if the original state is unchanged. Rollback is a separately signed and locally confirmed revert commit. Source bodies and diffs are not stored on the server; only path, values, commit IDs, check state, and diff fingerprint leave the device.
- Remaining before this item can close: responsive/layout-aware properties, visual preview, repository formatter/type-check integration beyond deterministic literal formatting, conflict recovery after later commits, signed local helper, commercial consent boundary, grouped edits, non-UI properties, and end-to-end browser coverage.
- Exit criteria: supported properties round-trip without unrelated formatting churn, an invalid or stale edit cannot touch source, every applied edit has a reviewable diff and verified build, and the previous commit can be restored from the canvas without hidden side effects.

### ENG-007 - Versioned product-engine capability map

- Severity: medium
- Gate: product-v1
- Status: in-progress
- Current evidence: Engine Registry v1 defines ten top-level product engines and forty-four internal components with independent technical versions, maturity, inputs, outputs, compatibility, and code/test evidence. Capability Mapper materializes them as a logical system-map layer, and the `TwinBuild v3` wire schema preserves the metadata. Existing maps receive bounded capability proposals instead of individual manual reconstruction. Asset Core 0.2 separately displays logical/declared identity, CODE snapshot binding, and server-verified LIVE observation. Its fingerprint-guarded `bind_node` operation migrates up to 24 legacy nodes per review without changing layout, descriptions, notes, parts, or edges. Asset Core 0.3 detects stale Registry contracts and proposes bounded metadata synchronization. Source Lens 0.9 owns one Source Analysis Workflow behind a Node-only public entrypoint and registers the deterministic G10-0 Functional Context Contract, Resolver, Pack Builder and Guardrail. Source editing belongs to Safe Operations 0.2, while local/external-provider communication belongs to Connector Bridge 0.2. Registry validation rejects nested `kind: engine`. Work Core 0.1 and Intent Engine 0.2 expose the Work contract, version-pinned Intent assembly, evidence-bound clause drafting and explicit approval boundary without claiming a live executor or AI harness. AI Context Gate 0.1 adds the first registered Agent Policy and a deterministic Project Master Enrollment/Handoff boundary without claiming that prompt delivery alone forces a target AI.
- Required work: validate the Source Lens 0.9 and Asset Core contract-sync proposals in production, add per-engine release ownership, and prove parsed evidence plus a real adapter on a materially different second software stack. Keep the explicit Source Lens entrypoint and nested-Engine invariant; move owned pure modules only when that improves an actual compatibility boundary.
- Exit criteria: a non-developer can identify every shipped engine, its purpose, maturity, version, evidence, inputs, outputs, owner, and compatibility from the map; a second adapter adds its engine-facing components without changing the mapper or canvas UI.

### ENG-008 - Connector Bridge ownership and Adapter/Connector boundary

- Severity: high
- Gate: engine-v1
- Status: in-progress
- Current evidence: Local Connector already uses a separate grant, read-only defaults, repository pinning, redaction, state fingerprints and local re-approval. GitHub webhook handling validates payload size, HMAC, event type, delivery identity and repository. External AI explanation is owner-only, disabled by default and sends a bounded metadata envelope without source bodies.
- Current limitation: Connector Bridge 0.2 has no common Exchange Contract or Pipeline. Local corpus reads, Git transport, Source Edit execution, GitHub webhook ingestion and external AI transport use separate flows. Registry classifies the in-process `Workflow Twin Adapter` as a Connector even though it performs no external or local transport, while the implemented GitHub webhook Connector is absent from Connector Bridge's registered components and evidence. The Local Connector process physically combines Bridge transport with Safe Operations planning/execution concerns, and external AI prompt meaning is mixed with provider HTTP transport.
- Required work: implement the planned `connector-bridge.exchange@1.0.0` boundary from [`CONNECTOR_BRIDGE_MASTER.md`](../engines/CONNECTOR_BRIDGE_MASTER.md): validated request and Provider Manifest, capability/provider/direction resolution, target and revocable Grant binding, outbound preview and redaction or inbound bounded-receive preflight, Grant coverage with explicit re-consent for changed outbound scope, bounded transport, response/sender/signature/replay validation, provider-neutral result, provenance, findings and receipt. Move product meaning, identity and mutation lifecycle to their owning Engines. Split local read, Git dispatch and source-edit dispatch into independent Manifest capabilities and grants even if one helper process hosts them. Reclassify `Workflow Twin Adapter` and register the GitHub Connector only with matching code, Contract fixtures, Registry evidence and changelog. Existing commercial security blockers remain in `LOC-005` through `LOC-008`, `AI-002` and the relevant `OPS` items rather than being duplicated here.
- Exit criteria: every registered Connector identifies the crossed boundary, target, grant, data classes, redaction, transport and request/result envelope; pure in-process transformations are Adapters rather than Connectors; no Connector owns product meaning, Asset identity, Operation approval or success; every cross-Engine Stage has one owning Engine and a separately named Adapter/Connector; current and target classifications are backed by tests and recorded version changes.

## Source Lens map analysis

### SL-001 - Structural Community product use and projection

- Severity: medium
- Gate: `source-lens-graph-v1` (wire ID)
- Status: open
- Current decision: map-analysis providers such as Graphify may produce `StructuralCommunitySet` from map connectivity. Source Lens must preserve its original community IDs, membership, cohesion, provider/version provenance and source-map fingerprint without overwriting it during the required `G10 Functional Community Resolution` Stage. G10 creates a separate, overlapping `FunctionalCommunitySet` for same-function grouping.
- Open question: it is not yet decided whether users should see Structural Communities directly, whether they remain an internal diagnostic/reclustering input, whether they appear as an optional structural overlay beside Functional Communities, or how differences across provider versions and incremental runs should be explained. Showing provider labels as product functions would mislead users, while discarding the original assignments would remove valuable topology and reproducibility evidence.
- Required work: evaluate internal-only, optional-overlay and dual-view projections with representative repositories; define stable crosswalk records between Structural and Functional Communities; define provider upgrade, recluster, split/merge and incremental comparison behavior; specify redaction-safe summary payloads and user language that does not confuse structural coupling with product function; set storage and retention budgets for original provider assignments.
- Exit criteria: Structural Community data is preserved and reproducible across G10, its user visibility and downstream analysis responsibilities are explicitly chosen and tested, provider labels cannot be mistaken for Functional Community labels, and a provider or clustering change cannot silently rewrite either the functional grouping or the user's saved view.

### SL-002 - Functional Context Bootstrap quality and downstream use

- Severity: medium
- Gate: source-lens-functional-community-v1
- Status: in-progress
- Current evidence: Source Lens 0.9 / Workflow 1.1 deterministically inventories bounded README and planning Markdown, compares document and source fingerprints with the previous `FunctionalContextPack`, excludes unchanged possibly-stale documents after source changes, and falls back to UI text, screen paths, API routes, DB declarations, tests and static Flows. Contract tests cover document, fallback, reuse, invalidation, bounded serialization and AI-instruction-document exclusion.
- Current limitation: an initial `baseline` run has no historical fingerprint with which to prove document freshness; Markdown phrase extraction is intentionally simple; source evidence support is strongest for the current JavaScript/React and limited SQL scanners; the Pack is not yet consumed by Graphify or G10 F1~F7; there is no user-facing correction loop or quality benchmark across unfamiliar applications.
- Required work: evaluate representative documented and undocumented applications; measure useful functional-vocabulary precision and evidence coverage; add stack-specific evidence adapters through Source Profile capability declarations; define how user corrections in Project Master become a separately bounded Planning Context Pack; connect the current Pack to F1~F7 without treating document text as code truth; expose stale, document-only and unknown terms clearly.
- Exit criteria: two materially different application stacks produce bounded, evidence-linked functional vocabulary with measured quality; initial-baseline uncertainty remains visible; stale documentation cannot silently dominate; user corrections affect the next authorized analysis without sending unrelated context; F1~F7 can consume the Pack through a versioned contract.

## Starting protocol

### START-001 - Starting Protocol runner, entry adapter, and Project Master handoff

- Severity: high
- Gate: product-v1 starting
- Status: open
- Current decision: Starting Protocol precedes System Onboarding and owns the first-contact-to-readiness sequence. Workflow Canvas uses the user-owned logical `Project Master` as its human-editable planning authority. AI Context Gate 0.1 supplies the deterministic Project Master template, bounded Planning Context Pack, target-AI instruction, honest enforcement state and Enrollment/Handoff receipts. The current portable projection is `PROJECT_MASTER.md`, but the product's first activation point, final web/local/IDE/other form, canonical storage adapter and default entry experience are deliberately undecided.
- Current limitation: there is no `starting@1.0.0` Workflow Definition, Entry Adapter Contract, Starting Run ledger, Project Master editor/import/export/version store, human confirmation ledger, Starting Bundle, or System Onboarding handoff. The AI Context Gate core can generate artifacts but cannot choose or observe the product's first contact, deliver to a provider, bind a real completion host, write a file, or prove that a user approved the initial Project Master.
- Required work: define an entry-neutral Starting Request and versioned Entry Adapter interface before choosing a product form; implement deterministic Stage state for Entry Record→project preflight→Project Master proposal→human correction/confirmation→target-AI Enrollment→Starting Bundle; keep the Project Master logically singular across storage projections; separate user-confirmed sections, AI proposals and unknown/conflicts; bind every approved Project Master version and Enrollment to immutable fingerprints; implement token-bounded Planning Context Pack selection without auto-sending the full master; support advisory, delivery-verified and completion-gated states without overstating control; route real external transfer through Connector Bridge and real repository writes through Safe Operations or an already approved development change; hand the Starting Bundle to System Onboarding without treating planning intent as runtime truth. Do not choose a web button, installer, root file, commit, push or deploy event as the universal activation point until the product form is decided.
- Exit criteria: at least two different entry adapters produce the same versioned Starting Bundle contract without changing AI Context Gate core; a user can create/import, read, correct and approve one Project Master while AI proposals remain visibly unconfirmed; no undeclared full-master transmission occurs; the UI or local surface accurately distinguishes generated, delivered and completion-gated states; a changed baseline invalidates stale approval; System Onboarding consumes the exact approved fingerprint and records plan-versus-evidence conflict as documentation debt.

## System onboarding protocol

### ONB-001 - Versioned System Onboarding Protocol runner and run ledger

- Severity: high
- Gate: product-v1 onboarding
- Status: open
- Current evidence: Starting Protocol now defines the planned Starting Bundle handoff. Local Connector registration and bounded scan, Source Lens 0.9 analysis with G10-0 `FunctionalContextPack`, Workflow Canvas-specific Asset 원장/reconciliation, Trust overlay, proposal review/materialization, limited runtime checks and Safe Operations exist as separate paths. [`SYSTEM_ONBOARDING_PROTOCOL.md`](../protocols/SYSTEM_ONBOARDING_PROTOCOL.md) defines their post-Starting target order, single-owner Stage boundaries, AI/human gates, outputs and completion rules.
- Current limitation: there is no executable `system-onboarding@1.0.0` Workflow Definition, `SystemOnboardingRun`, Work Item ledger, shared progress/resume state, pinned Protocol/Engine/Adapter/Profile/Manifest versions, general onboarding UI, final System Onboarding Bundle or Receipt. The closest end-to-end path is an owner-only Workflow Canvas self-map. Local analysis sends a reduced manifest rather than the complete Source Analysis Bundle; generic source results do not automatically become an Asset 원장 record; GitHub webhook records a change signal but does not retrieve or reanalyze source; web proposal materialization does not use the same Draw Map/Safe Operations boundary described by the target protocol. Structure understanding is partial, while efficiency, security and documentation-debt signals are not yet consistently converted into owned Findings and safe remediation paths.
- Required work: implement the Protocol/Workflow/Run/Stage/Artifact/Receipt contracts and deterministic runner; store terminal and recoverable Stage states with immutable input fingerprints and pinned component versions; validate and pin the incoming Starting Bundle and user-approved Project Master; add consent, pause, retry, cancel and resume handling; connect Connector consent→bounded evidence→complete Source Analysis Bundle→canonical Asset 원장→Trust→Project Master/reality reconciliation→approved Draw Map→Connector-mediated first Observation; aggregate Engine-owned Structure, Efficiency, Security and Documentation Debt Findings without inventing new facts; show Unknown and unsupported coverage; attach but do not execute Safe Operations during baseline onboarding; provide a non-developer progress, review and final-report UI. Keep Work Core optional and do not represent it as an implemented executor. Source Lens G10 must use an allowed AI candidate path or an approved equivalent semantic Resolver and otherwise stop before `canvas_ready`. AI Context Gate delivery and ongoing Handoff enforcement remain the preceding Starting or later development Workflow's responsibility, not an onboarding Stage.
- Exit criteria: two materially different supported application fixtures complete the same versioned Workflow without core Engine changes; every Stage has one owner and an Artifact or explicit skip/partial/block reason; AI-off runs preserve deterministic analysis Artifacts, Findings, Unknowns and Receipt but cannot produce a `canvas_ready` System Map without an approved equivalent semantic Resolver; every external exchange, Proposal application and later Operation is bound to an exact Grant/fingerprint and required human gate; interruption preserves the last valid Artifact and resumes idempotently; completion cannot imply that the app is secure or that open Findings are resolved.

## Documentation consistency

### DOC-001 - Engine documentation and Registry parity

- Severity: medium
- Gate: engine-cleanup
- Status: open
- Current evidence: `shared/engineRegistry.js`, `docs/MASTER.md`, the current product catalog and Engine registry document now agree on ten top-level Engines and forty-four internal Components, including AI Context Gate 0.1 and Source Lens 0.9 G10-0 components. `protocols/STARTING_PROTOCOL.md` owns the first-contact→Project Master→Starting Bundle sequence and `protocols/SYSTEM_ONBOARDING_PROTOCOL.md` owns the following evidence-analysis sequence. `twin/archive/TWIN_ENGINE_ROADMAP.md` still names seven current Engines and presents its 11-step Engine pipeline as the full flow, omitting both Protocol boundary and Work Core, Intent Engine and AI Context Gate. `twin/contracts/TWIN_ADAPTER_CONTRACT.md` v1 still groups discovery, normalization, reconciliation, operation and redaction interfaces under one compatibility descriptor, and `docs/product/ENGINE_AGENT_REGISTRY.md` mirrors the current but disputed in-process Workflow Twin Adapter Connector classification while omitting the implemented GitHub webhook under Connector Bridge. `architecture/evaluations/source-lens/SOURCE_LENS_AI_PROVIDER_PILOT.md` still describes Source Lens 0.7 and does not make Connector Bridge's provider-transport ownership explicit. `MASTER.md` now defines Adapter as a replaceable Stage implementation and Connector as crossed-boundary communication, so these older compatibility/current-state records must not be read as the target ownership model.
- Required work: resolve each mismatch during the relevant Engine cleanup instead of silently treating one stale document as truth. Distinguish current Registry facts, historical/compatibility wire names and planned target classifications. Generate names, counts and versions from Registry where practical or add a CI parity check; update or explicitly supersede the roadmap and pilot; explain or split the broad Twin Adapter Contract only with compatible code and fixtures. Connector ownership behavior and Registry reclassification follow `ENG-008` and require code, Contract and tests rather than a documentation-only rename.
- Exit criteria: MASTER, current product catalog, roadmap status and Registry agree on Engine names, versions and Component counts; Adapter and Connector have one unambiguous standard definition; current and planned classifications are visibly separate; adding, removing, renaming or versioning a Registry item fails validation when current-state documentation becomes stale.

## Intent assets and planning

### INT-001 - Conversation and document to Intent extraction engine

- Severity: medium
- Gate: intent-intelligence
- Status: in-progress
- Current evidence: Intent Engine 0.2 stores up to ten bounded meeting, AI-conversation, document, summary, or manual sources; a deterministic extractor creates evidence-linked clause candidates for purpose, direction, requirement, prohibition, success, priority, exception, decision, assumption, and open question. It never auto-approves a candidate, and only explicitly approved clauses enter a recorded Intent version. This is a transparent drafting aid, not a claim that AI understood or adopted organizational intent.
- Required work: add a versioned provider-neutral semantic extraction path using ontology, authorized evidence retrieval and first-principles decomposition; distinguish quoted facts, interpretation, assumptions, alternatives, conflicts, supersession and final decisions; add evaluation fixtures, precision/recall targets, model/prompt provenance, outbound AI consent and human confirmation before any extracted draft becomes active.
- Exit criteria: the same source set produces traceable draft intents, every statement points to authorized evidence, contradictory sources remain visible, and AI cannot silently create or activate organizational intent.

### INT-002 - Intent application to Work and Workflow

- Severity: high
- Gate: intent-governance
- Status: in-progress
- Current evidence: Work Core 0.1 introduces a distinct Work part with required input, process, and output fields. A Work can attach up to sixteen recorded Intent assets through typed references that pin the chosen version, preserve the old version when the Intent changes, and expose missing or newer-version state. General parts cannot retain Work or Intent payloads. This binding remains descriptive and does not itself grant mutation or execution authority.
- Required work: extend typed application to Workflow and groups; define scope, precedence, conflict resolution, supersession, stale and deleted Intent behavior, agent interpretation rules, result validation, approval boundaries, audit records and explicit adoption or update actions. Distinguish guidance, constraint, objective, requirement and executable policy without turning a visual connection into authority.
- Exit criteria: every Work or Workflow can identify exactly which Intent version applies and why, conflicting intents cannot be resolved invisibly, and no agent or interface treats a visual edge as mutation authority.

### WORK-001 - Executable Work lifecycle and efficiency evidence

- Severity: high
- Gate: work-execution
- Status: open
- Current limitation: Work Core 0.1 defines and validates Work plus its Intent bindings, but it does not run the work, bind real input/output artifacts, measure resource use, or prove that a person, AI, service, or automation followed the attached clauses.
- Required work: define versioned trigger, executor, input artifact, process step, output artifact, success metric, time/cost/resource measurement, clause evaluation, approval, cancellation, retry, recovery and audit contracts. Reuse Safe Operations for mutations and the future provider-neutral Agent Run schema for AI execution. Keep manual human Work representable without pretending it is automatically observed.
- Exit criteria: supported Work types produce attributable input-to-output run records, efficiency can be calculated from declared and observed evidence, Intent violations are surfaced without invisible resolution, and failed or interrupted mutations follow the universal operation lifecycle.

### INT-003 - Durable append-only Intent version ledger

- Severity: medium
- Gate: multi-user intent governance
- Status: deferred
- Current limitation: the MVP keeps at most 25 explicit snapshots inside the canvas node JSON. This gives useful local version history but is not an immutable organizational ledger and does not record the actor independently from the canvas document.
- Required work: move versions to tenant-scoped append-only records with actor identity, optimistic concurrency, signatures or tamper evidence, access control, supersession links, export, retention, restoration, and canvas-node projections. Preserve the current explicit-recording interaction and migrate embedded snapshots without loss.
- Exit criteria: concurrent editors cannot overwrite intent history, every version has attributable provenance, retained versions cannot be silently rewritten by normal canvas saves, and a node can be reconstructed from the ledger.

## AI orchestration and automation

### AI-001 - Provider-neutral agent and run schema

- Severity: high
- Gate: AI phase 1
- Status: open
- Required work: version `AgentDefinition`, `Trigger`, `ExecutionPolicy`, `CapabilityGrant`, `ContextSnapshot`, `AgentRun`, `Budget`, `Artifact`, `MemoryReference`, and `Handoff` without coupling the engine to one AI vendor.
- Exit criteria: the same bounded one-shot task runs through two provider adapters without changing Asset, review, permission, or operation records.

### AI-002 - External AI data gateway and consent

- Severity: critical
- Gate: release-blocker for AI features
- Status: open
- Context: prompts and context sent to an AI provider cross into an external SaaS trust zone and may contain personal, business, source, or credential-adjacent data.
- Required work: per-data-class consent, redaction, provider/model disclosure, retention controls, regional handling, outbound preview, and an auditable gateway record.
- Exit criteria: contract tests prove that a run cannot send undeclared data classes or credential values and the user can see what left the product.

### AI-003 - Durable bounded job control plane

- Severity: critical
- Gate: scheduled or event-driven AI
- Status: open
- Required work: durable queue, scheduler, event ingestion, isolated workers, idempotency, retries, dead-letter handling, timeouts, per-run credentials, independent verification, and append-only run audit.
- Exit criteria: interrupted and duplicate deliveries cannot duplicate a mutation, and every run reaches a terminal or explicitly recoverable state.

### AI-004 - Continuous agent leases and emergency stop

- Severity: critical
- Gate: 24-hour agents
- Status: open
- Required work: renewable leases, heartbeats, single-run ownership, stale-worker fencing, budget exhaustion, rate limits, maintenance mode, user kill switch, and operator incident controls.
- Exit criteria: a disconnected, duplicated, compromised, over-budget, or revoked worker loses authority before it can continue operating.

### AI-005 - Agent memory and data lifecycle

- Severity: critical
- Gate: persistent AI memory
- Status: open
- Required work: tenant-scoped memory, provenance, purpose limitation, expiry, export, deletion, poisoning defenses, encryption strategy, and explicit rules separating user records from model/provider retention.
- Exit criteria: memory can be traced to source evidence, selectively revoked, fully exported, and deleted without leaving an active retrieval path.

### AI-006 - Cost, capability, and autonomy budgets

- Severity: high
- Gate: AI phase 1
- Status: open
- Required work: enforce token, currency, time, API-call, mutation, concurrency, and data-volume limits per run, agent, tenant, and billing plan; define escalation and safe-stop behavior.
- Exit criteria: tests show that no AI or worker can exceed a hard budget through retries, parallel runs, provider failover, or stale leases.

### AI-007 - Engine-bundle Maintainer Agents

- Severity: high
- Gate: AI phase 2
- Status: planned
- Current evidence: Maintainer Agent manifest v1 defines the required scope, allowed tools, required tests, escalation conditions, and human-approval boundaries for a future `Core Engine Maintainer`, while every current Engine Registry assignment remains deliberately `미배정`.
- Required work: implement provider-neutral agent identity and signed manifest validation, start with one related-engine bundle rather than one agent per small component, grant read/test/proposal tools before mutation tools, and route compatibility, DB, permission, encryption, dependency, commit, push, and deployment changes to explicit human approval.
- Exit criteria: an assigned agent cannot read or change anything outside manifest scope, cannot skip required tests or escalation, and cannot apply code, schema, dependency, security, Git, or deployment changes without the declared human approval.

### AI-008 - AI Context Gate provider delivery and completion enforcement

- Severity: high
- Gate: automated target-AI context enforcement
- Status: in-progress
- Current evidence: `shared/aiContextGate.js` and `scripts/ai-context-gate-engine.mjs` deterministically create a token-bounded target-AI instruction, user-owned Project Master portable template, fingerprint-bound Enrollment Manifest and Handoff Receipt. They distinguish `advisory`, `delivery-verified`, and `completion-gated`; only a trusted completion host bound to the exact prompt fingerprint may claim enforcement. Contract tests reject unsafe paths and budgets, mismatched receipts, stale project-state/Project Master baselines, `planning` changes without a matching master update, Host signal or evidence, and false `none` declarations.
- Current limitation: no provider adapter actually delivers the prompt, no IDE or managed-development completion host invokes the verifier, no repository required check enforces the result, and no Safe Operations flow writes a chosen Markdown projection. Existing Project Master Markdown and Source Lens Functional Community results are not yet parsed into a minimal Planning Context Pack. The current code proves the Engine boundary, not end-to-end control over an external AI or user approval of the Project Master. The product's first entry point and final web/local/IDE storage surface remain deliberately undecided under `START-001`.
- Required work: add provider-neutral delivery and completion-host contracts; execute external delivery through Connector Bridge with consent, redaction, provider/model disclosure and a prompt-bound Receipt; connect at least one managed AI development surface so its completion transition fails closed on invalid Handoff; add optional pre-commit/PR/deployment defense checks without making any one Git event the sole trigger; implement a bounded Project Master parser and deterministic Planning Context Pack selector; write through Safe Operations or an already approved development change; add user correction and confirmation with user-confirmed/AI-proposed/unknown separation; connect selected facts to Source Lens without auto-sending the whole master. Entry Adapter, Starting Run and final storage decisions remain `START-001` rather than being hidden inside this Engine.
- Exit criteria: a user can enroll two different AI providers without changing the Engine core; the UI or local surface accurately distinguishes generated, delivered and completion-gated states; a managed target AI cannot complete a `planning` change without a matching Project Master update and verified evidence; bypass through local work, commit, push or deploy is detected by at least one controlled completion or required-check boundary; no full Project Master or secret leaves the project without declaration and consent; the user can correct misunderstood planning context and the next Source Lens run consumes only selected bounded facts.

### UX-001 - Parts as capabilities and edge-centered operations

- Severity: medium
- Gate: engine-v1 UI
- Status: in progress
- Current evidence: the local repository and GitHub now expose one code port each, GitHub keeps commit changes as a separate contextual part, and the directional Git operation lives on their connecting edge. A fingerprint-guarded atomic migration retires the two legacy sync parts without an order-dependent broken edge. Vercel mutation, Supabase operations, and a reusable adapter-level operation descriptor remain.
- Required work: move Asset-specific top buttons into typed parts; connect compatible parts; place relationship operations on the edge; require preview rather than direct execution.
- Exit criteria: local repository, GitHub, Vercel, database, and future adapters use the same interaction grammar.

### UX-002 - Truthful activity visualization

- Severity: medium
- Gate: product-v1
- Status: in progress
- Current evidence: the edge control shows the currently observed push, fast-forward pull, already-synced, blocked, or unknown direction. Queued work pulses at the control; the edge itself flows only for server-observed `running`, briefly reports `succeeded` or `failed`, and honors reduced-motion. No automatic flow is animated because the current adapter has no observed recurring transfer event.
- Required work: animate only observed events; distinguish configured, idle, polling, queued, running, succeeded, failed, stale, and unknown; support reduced-motion and dense canvases.
- Exit criteria: animation cannot imply continuous synchronization when only heartbeat or periodic fetch is occurring.

### UX-003 - Typed part ports and dense node layout

- Severity: medium
- Gate: engine-v1 UI
- Status: in progress
- Current evidence: system parts render as full-width node bands, their sockets sit on the node boundary, connected sockets are visually distinct, and React Flow handle geometry is refreshed when the part list changes.
- Required work: define adapter-neutral input/output compatibility and direction rules, reject invalid part-to-part contracts before save, distinguish available ports from proven live bindings, and design overflow behavior for nodes with many parts without hiding sockets or moving persisted layout unexpectedly.
- Exit criteria: incompatible ports cannot be connected, every linked socket resolves to a persisted evidence-backed relation, and 1-20 parts remain usable at supported zoom and viewport sizes.

## Code quality and replacement candidates

Quality items follow the same ledger rules. Most carry `Gate: none` (not a
release blocker). They exist so an audit day (see `docs/governance/AUDIT_PLAYBOOK.md`)
starts from a real list instead of archaeology. Record shortcuts, duplication,
oversized files, untested behavior, and replace-with-standard candidates at
the moment they are created or discovered.

### QUAL-001 - App.jsx monolith

- Severity: medium
- Gate: none
- Status: open
- Context: `src/App.jsx` exceeds 5,000 lines and owns canvas state, sharing,
  sync, layers, Asset review wiring, and toolbar composition. Every batch
  touches it, raising merge risk and review cost.
- Exit criteria: extract at least layer projection state, share/session state,
  and Asset review wiring into modules with their current behavior pinned by
  tests first; App.jsx under ~2,500 lines without behavior change.

### QUAL-002 - Feature-activation conditions must be tested

- Severity: medium
- Gate: none
- Status: open
- Context: the batch A layer switcher shipped with an activation predicate
  (`canvasSupportsSystemLayers`) that no test covered, and it failed on the
  real production canvas (metadata field newer than the canvas). The failure
  mode generalizes: any "is this feature on for this data?" gate can silently
  never fire.
- Exit criteria: every user-visible feature gate has a regression test using
  realistic production-shaped data (not only template-shaped data); audit
  checklist includes a sweep for untested gates.

## Deferred product horizons

- AI-assisted system onboarding and orchestration after deterministic Asset reconciliation is reliable.
- Sandboxed user-authored adapters and agents after the operation capability model is enforced.
- Cross-domain life/business OS templates after at least two non-software adapters validate the ontology.
- 3D/layer visualization after filtering, aggregation, and two-dimensional layer semantics work at scale.
- AR/VR/robot control only after device identity, safety policies, and reversible operation contracts exist.
