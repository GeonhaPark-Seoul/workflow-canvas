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

## Reference implementation sequence

### Phase A - Secure Workflow Canvas reference twin

- harden the local connector
- model local/cloud/SaaS trust zones and gateways
- show exactly which metadata crosses each gateway
- preserve source bodies and credential values on-device
- distinguish heartbeat, fetch, sync, and deployment events

### Phase B - Parts and edges as the common interaction grammar

- local repository parts: code structure, Git status, Git sync
- GitHub parts: remote branch, commit history, webhook events
- Vercel parts: deployment status, deploy, rollback
- Supabase parts: schema, aggregate operations, RLS validation
- edge-centered preview controls for relation operations

### Phase C - Extract the engine core

- move Workflow Canvas-specific knowledge behind the first adapter
- create versioned canonical records and migrations
- add golden fixture repositories and expected twin snapshots
- prove manual layout and review decisions survive rescans

### Phase D - Onboard a second software stack

Use a materially different stack, such as Python/FastAPI + PostgreSQL + container deployment. The second adapter is the test that the engine is genuinely general rather than merely renamed Workflow Canvas code.

### Phase E - AI-assisted onboarding

The user states intent in natural language. AI selects adapters, proposes scopes, explains permissions, and interprets deterministic findings. It does not receive broader source access than the user explicitly grants and cannot skip review gates.

## Visualization rules

- Nodes are entities, not buttons or pages.
- Parts are typed capabilities, ports, status surfaces, and contextual views.
- Edges are contracts or flows between compatible parts.
- Zone boundaries are visible and crossings require gateways.
- Normal flows and potential attack paths use different overlays.
- Continuous animation requires observed recurring events.
- Manual operations animate only while queued/running, show a short completion/failure result, then stop.
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
