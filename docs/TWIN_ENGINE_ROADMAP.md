# Universal Twin Engine Roadmap

## Product language

- **System onboarding / 시스템 가져오기**: the user-facing act of connecting software or another operating system to Workflow Canvas.
- **Twin adapter / 트윈 어댑터**: a provider-specific module that knows how to discover and operate one stack, such as GitHub + Vercel + Supabase.
- **Twin build / 트윈 빌드**: deterministic discovery and normalization that produces a proposed digital twin.
- **Materialization / 지도 실체화**: applying an approved twin proposal to visible nodes, parts, edges, boundaries, and overlays.
- **Reconciliation / 상태 대조**: comparing observed reality with the current canvas and creating review items.
- **Operation capability / 조작 능력**: a bounded action that can be planned, approved, executed, verified, and audited.

The recommended user-facing phrase is **시스템 가져오기**. Internally, adapters perform a **twin build** and then **materialize** the result.

## Core principle

The engine must not ask an AI to draw a plausible architecture from scratch. It first collects deterministic evidence, builds a canonical fact graph, marks unknowns, and then lets AI explain or organize those facts. A canvas element is never `live` merely because code declares it.

Workflow Canvas is the first reference system. Engine code must remain reusable so a second application can be onboarded by adding an adapter rather than rewriting the canvas, review, security, or operation engines.

## Canonical ontology

### Entity

A thing with identity: application, service, process, database, table, queue, repository, deployment, user, device, warehouse, account, document, or physical asset. It is rendered primarily as a node.

### Capability

Something an entity exposes or can do: data output, input, API endpoint, event source, status, control, credential requirement, or operation. It is rendered as a typed part/port attached to an entity.

### Relation

A typed contract between two entities or capabilities: contains, calls, reads, writes, triggers, synchronizes, authenticates, authorizes, deploys, depends on, or flows to. It is rendered as an edge with direction and contract metadata.

### Trust zone

A security area with a different owner or access assumption. Initial kinds:

- local device
- local network
- intranet
- private data center
- private cloud
- public cloud
- public internet
- external SaaS
- physical site

A zone is not inherently safe. It states who controls the area and what assumptions apply. Visual groups or layers render zones and their boundaries.

### Gateway

The only modeled place where a relation crosses a trust-zone boundary: browser/API edge, reverse proxy, VPN, firewall rule, webhook, local connector, API gateway, database gateway, message broker, or human copy/paste step.

Each crossing records direction, protocol, port/route, data classes, authentication, authorization, encryption, exposure (`closed`, `restricted`, `public`), initiator, rate limit, last observation, and evidence. A direct cross-zone edge without a gateway is invalid or explicitly marked `unknown gap`.

### Evidence and observation

Evidence says why the graph believes a fact: source path, schema declaration, provider API response, signed event, runtime trace, or human declaration. Observation records time-bound state. Reality levels remain distinct:

- declared
- discovered
- observed
- runtime-verified
- stale
- contradicted
- unknown

### Policy and permission

Rules that decide who or what may read, write, execute, share, or administer an entity/capability. Policies attach to gateways, capabilities, operations, and data classes.

### Operation

A bounded action with input schema, target, authority, risk, side effects, preview, approval requirements, execution adapter, verification, timeout, audit event, idempotency rule, and recovery declaration.

### Event

A time-stamped occurrence such as heartbeat, fetch, build, deployment, request, failure, approval, sync, or rollback. Events drive activity animation; configured relations alone do not animate.

### Threat and control

A threat is a potential misuse route, not a normal operational edge. A control blocks, detects, limits, or recovers from a threat. Threat overlays can answer “how could data leave this zone?” without mixing hypothetical paths with observed traffic.

## Engine pipeline

1. **Connect**: pair an adapter using the minimum permissions and select its scope.
2. **Discover**: read code structure, schemas, infrastructure, provider metadata, and optional runtime telemetry without changing the target.
3. **Normalize**: convert provider-specific findings into the canonical ontology.
4. **Resolve identity**: preserve stable identities across renames, moves, deployments, and rescans.
5. **Build topology**: derive entities, parts, relations, zones, gateways, policies, evidence, and unknown gaps.
6. **Explain**: generate evidence-bound labels for easy and developer modes.
7. **Reconcile**: compare the twin build with the current canvas and preserve manual layout and annotations.
8. **Review**: show additions, changes, removals, contradictions, risks, and operation capability changes.
9. **Materialize**: apply only approved proposals and record engine/schema versions.
10. **Observe**: ingest events, health, traces, metrics, and deployment state to verify declared behavior.
11. **Operate**: run approved capabilities through plan, consent, execute, verify, audit, and recovery stages.

## Adapter contract

Every twin adapter eventually implements these bounded interfaces:

- `describe`: provider, version, supported evidence, data classes, permissions, and operation capabilities
- `discover`: read-only observations and evidence
- `normalize`: provider findings to canonical graph records
- `reconcile`: stable identity hints and change proposals
- `planOperation`: exact target, input, writes, exclusions, risk, expiry, and recovery
- `executeOperation`: capability allowlist only; no arbitrary shell or URL from the cloud
- `verifyOperation`: independent postcondition evidence
- `rollbackOperation`: supported recovery or an explicit declaration that rollback is unavailable
- `redact`: outbound payload and credential rules
- `migrate`: adapter-state upgrades across engine versions

The engine validates adapter output. Adapters cannot directly mutate canvas JSON or bypass the review and operation contracts.

## Explanation modes

One canonical fact graph supports two presentation modes selected by the user, not guessed by AI.

### Easy mode

- what this is
- what it does
- what starts it
- what information enters and leaves
- who can access it
- what happens if it fails
- what the user can safely do

### Developer mode

- file/function/schema identifiers
- endpoint, method, protocol, provider, region, and version
- source and target ports
- authentication and authorization contracts
- data classes and persistence
- evidence references, fingerprints, commits, and runtime observations
- operation inputs, side effects, risk, and recovery

AI may translate canonical facts and suggest groupings. It may not create verified edges, security claims, or permissions without evidence. Hypotheses remain visibly marked as hypotheses.

### Current source-code explanation baseline

The source-code twin now uses deterministic explanations before active AI integration:

- the main sentence states what a file does in the product rather than reporting function or import counts
- a separate user-impact sentence explains what changes for the person using the product
- technical counts, paths, API routes, DB references, and security signals remain available as secondary facts
- product-area classification groups functionality into canvas UI, canvas model, notes/content, collaboration, identity, digital-twin engine, source-code twin, AI/MCP, storage/sync, media, security/privacy, deployment/operations, testing, and project foundation
- the Workflow Canvas semantic profile contains product-specific roles while the scanner keeps a generic evidence-based fallback for a different repository
- local connector payloads preserve explanations and classifications but continue to exclude source bodies and credential values

This is the deterministic easy-mode baseline, not the completed semantic engine. A later version must attach sentence-level evidence, validate a second software stack, support additional languages, measure fallback quality, and expose an explicit easy/developer mode. AI can improve wording only after the user grants the necessary source scope; its output remains an explanation artifact rather than verified system truth.

## Operation initiators

Direct interface control is a first-class product path, not a temporary substitute for AI. A person clicks a node part or an edge control, reviews the plan, approves it, and sees the verified result in the canvas. Deterministic automation and a future AI agent are additional initiators of the same operation; neither receives a separate bypass.

Every operation records whether it was initiated by a human interface, deterministic automation, or an AI agent. The initiator may change how intent is collected, but authorization, preview, consent, execution, verification, audit, and recovery use one universal contract.

## Operation maturity by engine version

### Engine 0.x - Read and reconcile

- source/schema/infrastructure discovery
- trust zones and gateways
- evidence and confidence
- review proposals
- no general target mutation

### Engine 1.x - Core safe operations

- refresh and health check
- test and validation
- non-force Git synchronization
- retry of an idempotent job
- explicit approval and verification
- operation/event audit trail

### Engine 2.x - Reversible service operations

- deploy approved revision
- restart or pause service
- enable or disable a feature flag
- rollback deployment
- restore a known snapshot
- scheduled automation with bounded policy

### Engine 3.x - Privileged data and security operations

- schema migration
- credential rotation
- permission and network-policy changes
- bulk data mutation
- multi-party approval and break-glass recovery

### Engine 4.x - Sandboxed extensibility

- user-authored adapters
- user-selected AI agents
- custom operation blocks
- domain packs for logistics, CRM, finance, health, home, and personal workflows
- marketplace, signing, permission review, and isolation

Freedom grows by adding typed capabilities, not by exposing arbitrary code execution. High-risk operations always remain more constrained than observation and explanation.

## AI-ready orchestration model

Active AI integration is intentionally deferred until deterministic twin reconciliation, trust boundaries, and the operation contract are reliable. The engine must still reserve the following execution model now so a future AI layer does not force a rewrite of the graph or security model.

### Execution modes

- **Interactive**: a person and AI work in one visible session; every material action remains previewable.
- **One-shot**: an AI wakes for one bounded request, produces a result, verifies it, and stops.
- **Scheduled**: a durable scheduler starts a bounded run at an approved time or interval.
- **Event-driven**: a webhook, queue event, data change, threshold, or device signal starts a bounded run. This is the default form of practical real-time automation; the AI does not remain continuously active while idle.
- **Continuous**: an explicitly approved long-running agent holds a renewable lease and heartbeat. It is reserved for work that truly needs ongoing observation or coordination.
- **Human/manual**: a person performs or confirms the step. Human transfer is modeled as a real gateway rather than an invisible exception.

These are execution policies over the same entity, capability, event, and operation graph. They must not become unrelated node types with incompatible safety rules.

### Canonical AI orchestration records

The future schema must support stable, provider-neutral records for:

- `AgentDefinition`: purpose, owner, model requirements, allowed capabilities, and version
- `Trigger`: manual, schedule, event, threshold, webhook, or upstream operation
- `ExecutionPolicy`: mode, concurrency, timeout, approval policy, retry, and recovery
- `CapabilityGrant`: short-lived, least-privilege permissions issued for one run
- `ContextSnapshot`: exact twin revision, evidence, and redacted data supplied to the AI
- `AgentRun`: immutable run identity, state transitions, inputs, outputs, and verification
- `Lease` and `Heartbeat`: exclusive ownership and liveness for continuous workers
- `Budget`: token, money, time, API-call, and mutation limits with a kill switch
- `Artifact`: plans, reports, code patches, decisions, and other durable run outputs
- `MemoryReference`: scoped, retained knowledge with provenance, expiry, and deletion rules
- `Handoff`: a typed transfer between AI, automation, and people

Prompts and model output are proposals or run artifacts, not system truth. Only deterministic evidence and independently verified operation results may promote a twin fact to runtime-verified status.

### AI run lifecycle

1. Accept an approved trigger and bind it to a tenant, system, and twin revision.
2. Capture a minimum, redacted context snapshot.
3. Issue short-lived capability grants; never expose arbitrary shell, database, or URL access.
4. Ask the AI for a typed plan or bounded result.
5. Apply risk policy and request human or multi-party approval where required.
6. Execute through the same universal operation contract used by the direct interface and non-AI automation.
7. Verify postconditions independently of the AI's own claim.
8. Append events, cost, evidence, and audit results.
9. Release the lease and credentials, then stop or sleep according to policy.
10. Retain or delete artifacts and memory according to the data lifecycle policy.

### Runtime architecture for scheduled, real-time, and 24-hour work

The browser and an ordinary serverless request are not the long-running agent runtime. Later AI phases require a separate control plane and worker plane:

- durable queue and scheduler
- event bus and webhook ingestion
- isolated workers with tenant and capability boundaries
- leases, heartbeats, retries, idempotency, and dead-letter handling
- per-run secrets, budgets, rate limits, and emergency stop
- append-only run and operation audit
- provider adapters for user-selected AI services

Deterministic automation should remain available without AI. AI is used where interpretation, planning, synthesis, or exception handling adds value; ordinary timers, filters, routing, and fixed API calls should use cheaper deterministic workers.

An external AI provider is an `external-saas` trust zone. Every context transfer to it requires an explicit gateway that records which data classes leave the product, the user's consent, retention assumptions, encryption, and the provider/model used.

### AI activation gates

Do not begin active AI execution until the engine has versioned twin identities, trustworthy reconciliation, gateway-aware data boundaries, the universal operation contract, event/run audit, tenant isolation, and budget enforcement. Then open capability in this order:

1. one-shot read and explanation
2. one-shot proposal generation
3. one-shot approved operations
4. scheduled bounded runs
5. event-driven bounded runs
6. continuous leased agents

This ordering preserves the commercial goal that users can eventually connect their own AI while avoiding an early architecture that assumes one vendor, one model, or unlimited authority.

## Reference implementation sequence

### Phase A - Secure Workflow Canvas reference twin

- harden the local connector
- model local/cloud/SaaS trust zones and gateways
- show exactly which metadata crosses each gateway
- preserve source bodies and credential values on-device
- distinguish heartbeat, fetch, sync, and deployment events

### Phase B - Parts and edges as the common interaction grammar

- local repository: one code port that opens the local structure and Git state
- GitHub: one code port plus separate commit-change and webhook views
- local/GitHub synchronization: a directional operation on the code-port edge, not duplicate sync parts
- Vercel parts: deployment status, deploy, rollback
- Supabase parts: schema, aggregate operations, RLS validation
- edge-centered preview controls for relation operations

### Phase C - Extract the engine core

Current progress: C1 establishes adapter contract v1 and a provider-neutral registry. C2 adds deterministic normalization, reference and trust-boundary validation, and a common reconciliation engine. C3 upgrades the canonical model to `TwinBuild v2`, adds sequential v0-to-v1-to-v2 migration, and separates data classes, policies, observations, events, threats, and controls. It also establishes the universal operation lifecycle for direct UI, deterministic automation, and future AI initiators. Workflow Canvas is normalized as 28 entities, 9 parts, 38 relations, 3 data classes, 3 policies, 2 executable operations, 2 observations, 3 controls, and one threat. Git synchronization and append-only system snapshots bind their signed plans to canonical operation-definition fingerprints. A second order-service fixture still reaches zero findings through staged common proposals while manual layout, notes, extra parts, and review decisions survive rescans.

The future orchestration map's human approval, execution connector, test/review gate, runtime status/log, audit, stop/retry, and recovery concepts now share this operation contract. Conversation/context/planning and agent assignment remain deferred; when added, they cannot bypass the contract.

- move Workflow Canvas-specific knowledge behind the first adapter
- create versioned canonical records and migrations
- add golden fixture repositories and expected twin snapshots
- prove manual layout and review decisions survive rescans

### Phase D - Onboard a second software stack

Use a materially different stack, such as Python/FastAPI + PostgreSQL + container deployment. The second adapter is the test that the engine is genuinely general rather than merely renamed Workflow Canvas code.

### Phase E - AI-assisted onboarding

The user states intent in natural language. AI selects adapters, proposes scopes, explains permissions, and interprets deterministic findings. It does not receive broader source access than the user explicitly grants and cannot skip review gates.

### Phase F - Bounded AI operations

Add provider-neutral one-shot runs first, followed by scheduled and event-driven runs. Every AI request uses a context snapshot, short-lived capability grant, budget, typed output, independent verification, and the universal operation contract.

### Phase G - Continuous agent control plane

Add durable queues, isolated workers, leases, heartbeats, dead-letter handling, emergency stop, and scoped memory before allowing 24-hour agents. Continuous execution is an explicit high-cost policy, not the default meaning of automation or real time.

## Visualization rules

- Nodes are entities, not buttons or pages.
- Parts are typed capabilities, ports, status surfaces, and contextual views.
- Edges are contracts or flows between compatible parts.
- Zone boundaries are visible and crossings require gateways.
- Normal flows and potential attack paths use different overlays.
- Continuous animation requires observed recurring events.
- Manual operations animate only while queued, running, verifying, or recovering; they show a short completion/failure/recovery result, then stop.
- Every status has a timestamp and becomes stale rather than remaining falsely live.
- 3D is a later renderer over this model; it must not become the data model itself.

## Engine quality bar

- deterministic output for the same evidence
- stable identity across rescans
- explicit unknown and contradiction states
- no source-body or credential leakage by default
- least-privilege adapter scopes
- versioned schemas and migrations
- proposal fingerprinting and stale-plan rejection
- idempotent, auditable operations
- independent post-operation verification
- golden tests for topology, security boundaries, explanations, and upgrade behavior

The product moat is the combination of evidence-backed system onboarding, understandable explanations, truthful runtime state, and controlled bidirectional operation. Canvas rendering and AI summaries alone are not sufficient.
