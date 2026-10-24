# FoodTraceAI

**Keep food moving when a supplier, lot, or shared facility fails.**

A working food-continuity demo for a **Bay Area regional grocery replenishment manager**. Start with a new customer report, use Amazon Bedrock to extract product/lot facts and assess replacements, trace the incident, allocate available supply, and record a human decision. A second regulator view shows the evidence and containment status.

> Real public store locations and modeled road distances. Synthetic suppliers, cases, lots, demand, capacities, dependencies, deadlines and approvals. No real outbreak is alleged. A report is not a diagnosis or proof of contamination.

## Working AWS deployment

The complete AWS version uses **Amplify → dedicated API Gateway → Lambda → Bedrock + DynamoDB**. [Open the protected demo](https://main.dgblsgkgfm7j6.amplifyapp.com) and obtain the team access code privately from the owner. See [`aws/README.md`](aws/README.md) for deployment, verified results, and pause/resume controls. The team’s original `AWS25` API is separate and is not modified by these controls.

## Deploy the independent frontend on AWS

Use [`frontend/`](frontend/) for the standalone React/Vite app. It has its own lockfile, API configuration, tests and static build. [`amplify.yml`](amplify.yml) deploys that subdirectory through AWS Amplify; the original root app below still targets Sites/Cloudflare. See the [frontend deployment and API guide](frontend/README.md).

```sh
cd frontend
npm ci
npm run build
# Deploy the contents of frontend/dist (relative to repository root).
```

The default frontend build is an explicitly labeled local simulation. Set `VITE_DATA_MODE=api` and `VITE_API_BASE_URL` to a compatible backend and rebuild for real Bedrock/report/approval features. For the deployed AWS backend, enable `VITE_REQUIRE_LOGIN=true`. The backend implementation and live verification are documented in [`aws/`](aws/).

## Run the original full-stack prototype locally

Requires Node.js 22.13+ and npm. Use the latest Node 22 patch release.

```sh
npm ci
cp .env.example .env.local
# Enter your own server-side AWS credentials in .env.local.
npm run build
npm run db:local
npm run dev -- --host 127.0.0.1 --port 3200
```

Open http://127.0.0.1:3200 . Build once before the first local migration. Repeat `npm run db:local` after pulling new migrations; the script tracks applied files. Local state lives in ignored `.wrangler/state/` and survives server restarts. Hosted decisions use a separate D1 database.

Catalog-rule scenarios work without AWS credentials and are clearly labeled. The report assessment and recovery agent require a real Bedrock call; no prerecorded response or other provider fallback is substituted. Submission persists before AI analysis, so failed analysis can be retried without losing a report.

Configure **either** `AWS_BEARER_TOKEN_BEDROCK` **or** AWS access key / secret / session token in `.env.local`. Set `AWS_DEFAULT_REGION=us-east-1` and an accessible `BEDROCK_MODEL_ID` (this build was developed with `amazon.nova-pro-v1:0`). Temporary workshop sessions expire. The runtime needs permission to invoke that model. Never commit credentials, `.env.local`, or database state.

## A five-minute demonstration

The main workspace keeps only the active incident, key totals, map/agent, supplier split and store deliveries visible. Expand the incident queue, supplier eligibility, scenario controls or evidence when needed. Use the [five-minute video script](docs/DEMO_VIDEO_SCRIPT.md) for architecture, reasoning and data-provenance narration.


1. Expand **Start with a customer report**. Select Target · San Francisco and submit the editable fictional report with lot `DEMO-P1-BLEND-A`.
2. Watch the case be saved and Bedrock extract the product and lot. Code verifies the literal lot and its shipment to the selected store. The new report is linked to existing synthetic lab/recall evidence; it does not create an official recall.
3. Click **Trace & find replacements**. Watch actual tool activity: verify recall → inspect dependencies → assess products → set scenario → optimize recovery. The generated proposal is stored on the server.
4. Inspect the map, supplier quantities and store ledger. Petaluma's 500 g packs are normalized to kg. Existing commitments remain accounted for. The default catalog scenario allocates all 1,220 kg; actual AI results depend on its validated product assessment.
5. Ask **What if Oakland closes?** Napa and Gilroy share this warehouse. Their fulfillment becomes unavailable; only independent Petaluma remains. With all romaine offers accepted, 611 of 1,591 kg can be allocated and 980 kg remains unfilled.
6. Compare completion estimates, inspect the shortage, and review or reject the proposal. Approval with a shortage requires acknowledgment. An approval is a persisted demo decision, not a real order, reservation or dispatch.
7. Switch to **Regulator** to inspect evidence distinctions. Export the decision brief. Reload and see the server-persisted timeline and case inbox.

See [the recording script](docs/DEMO_SCRIPT.md) and [architecture](docs/ARCHITECTURE.md).

## What makes the decision useful

- **Incident-first triage:** the regional queue orders active recall / positive lot evidence (P0), investigation pending (P1), then closed records. Each card explains its evidence and next action; the active recall also shows scenario-specific unmet supply. This is an explicit demo policy, separate from store deadlines. Only DEMO-E01 has a recovery model.
- **New report intake:** Bedrock extracts facts from free text. Missing or unmatched lot/store evidence goes to `needs_records`, not an invented recovery.
- **Lot lineage:** raw lot A and its downstream blend are traced. Sibling input B is related evidence, not automatically a recalled or causal source. B's replacement offer is a separate synthetic released lot.
- **Shared failures:** Napa and Gilroy depend on Oakland. A facility closure excludes both; a lot recall alone does not close an entire facility.
- **Split allocation:** minimum-cost flow allocates across suppliers and stores, respects available capacity, normalizes pack sizes, and preserves existing commitments.
- **Priorities and trade-offs:** illustrative P0 deadlines have stronger shortage penalties. Continuity mode penalizes late arrival before transport cost; time/cost modes expose different choices. This is not clinical triage or a globally optimal vehicle schedule.
- **Resilience:** each additional supplier outage is recalculated, including interrupted original orders. The UI reports residual shortages.
- **Completion estimates:** last planned delivery is prep plus modeled travel, starting after approval. Estimated full supply recovery adds an explicit 30-minute receiving assumption and is unavailable if demand remains unfilled. Official incident closure is never inferred from delivery.
- **Auditable human review:** proposals, AI tool results, cases and decisions persist. Approval checks the proposal fingerprint and re-runs the calculation. Duplicate decisions are idempotent; conflicting decisions are rejected.

## Actual architecture and scope

React/Vinext + Leaflet → server endpoints → Amazon Bedrock Converse → deterministic dependency/allocation engine → human review → D1 workflow database. Bedrock is the only inference provider in the active application. Tool output quantities, not model arithmetic, produce the final numerical summary.

The hosted preview uses Sites/Cloudflare Workers and D1, **not an AWS-hosted web server or live RDS integration**. The team's PostgreSQL/RDS project can reuse the API and schema mapping in [the integration guide](docs/TEAM_INTEGRATION.md). No new AWS infrastructure is required by this demo. Workshop/team Kiro usage must be described truthfully in the submission; this repository does not establish that requirement by itself.

The Retailer/Regulator toggle is a presentation view, not tenant authorization. The original hosted site is private; the GitHub repository is public. Site access is separate from repository access. UI notices are internal; no email, SMS, purchase or physical shipment integrations are connected.

Supplier-facility edges are operational dependencies, not routed waypoints. OSRM routes are direct-road baselines from synthetic supplier coordinates to real stores. There is no live traffic or vehicle routing. ETA may be optimistic if real fulfillment requires intermediate stops. Costs and deadlines are illustrative. Replenishment demand is modeled replacement for held stock, not a measured stockout. Initial maps use catalog rules until an actual Bedrock investigation runs.

## Code map

| File | Purpose |
|---|---|
| `lib/continuity.ts` | Evidence, offers, dependency constraints, normalized allocation, stress tests and timing |
| `lib/bedrock-continuity.ts` | Bedrock tool loop, schema validation and gated tool access |
| `lib/cases.ts` | Persisted case intake, Bedrock extraction, exact lot/store matching |
| `lib/workflow.ts` | Proposal storage, audit events and guarded decisions |
| `app/api/` | Server contracts for cases, planning, agent and workflow |
| `components/case-intake.tsx` | Customer report → case inbox → investigation |
| `components/continuity-map.tsx` | Supplier-to-store map and quantities |
| `components/dependency-graph.tsx` | Shared fulfillment failure explanation |
| `db/schema.ts`, `drizzle/` | Active D1 schema and immutable migration history |
| `lib/data/` | Data snapshot and route provenance |

## Checks

```sh
npm run typecheck
npm test
# With the app running and local migrations applied:
npm run test:api
# Requires real AWS access; invokes the model and creates demo proposals:
npm run test:bedrock
npm run test:cases
```

See [validation evidence](docs/VALIDATION.md). Test fixtures and all demonstrations are synthetic. Do not claim a live AI test passed merely because credential fields are populated.

## Team sharing

Repository: https://github.com/hyuntori2000/supply-continuity (public).
Anyone can read or clone; the owner adds teammates under **Settings → Collaborators** for write access. Each teammate supplies their own AWS environment locally. Credentials and runtime cases are excluded from Git. The `.openai/hosting.json` identifies the existing private demo; do not publish another team member's changes to that Site without coordination.

## Provenance

Built by extending the existing Recall Radar prototype in this workspace, with the user's Retailer/Regulator designs and AWS challenge rubric. The team backend at [Purvab07/AWS-25](https://github.com/Purvab07/AWS-25/tree/8fb398c7ff8cdc99d15a6e10328bb4a77046eb54) informed the product-compatibility and PostgreSQL integration design. Its RDS service and Python matcher are not silently treated as connected services. Route sources and synthetic assumptions are retained under `lib/data/`.
