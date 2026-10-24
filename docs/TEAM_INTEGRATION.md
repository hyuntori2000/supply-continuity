# Integrating with the team's AWS-25 backend

The reference backend separates Bedrock product compatibility from Python supplier ranking and has a PostgreSQL schema. This app implements the same separation and extends the decision to multi-supplier allocation and shared facility outages. The Python backend and its RDS database are not connected automatically.

## Stable frontend contracts

| Endpoint | Input / output |
|---|---|
| GET `/api/continuity` | Stores, evidence, offers, initial catalog plan and provider status |
| POST `/api/cases` | `{action:"submit",storeId,report}` saves first; `{action:"analyze",id}` invokes Bedrock |
| GET `/api/cases` | Recent persisted reports with `received`, `linked`, or `needs_records` status |
| POST `/api/agent` | `{message,scenario,source,caseId?}`; NDJSON tool events and saved final proposal |
| POST `/api/continuity` | `{scenario}`; computes/persists explicitly catalog-based proposal |
| GET `/api/workflow` | Recent decisions and audit events |
| POST `/api/workflow` | Decide with `{action:"decide",id,hash,decision,note,acknowledgeShortage}` |

Scenario fields: `closedFacilityIds`, `blockedSupplierIds`, `objective` (`continuity`, `time`, `cost`), `trafficMultiplier`. Returned allocations contain `offerId`, `storeId`, `kg`, `physicalPacks`, `etaMinutes`, `distanceKm`, `cost`, `onTime`. The plan reports `required`, `allocated`, `unfilled`, `onTimeKg`, `lateKg`, `timing` and supplier/store ledgers.

## Map real data before swapping adapters

1. Match stable product, lot, store, supplier and facility IDs. Do not infer identities from a display name alone.
2. Add lot-level supplier stock. Product-level `quantity_available` cannot identify a recalled or expired lot.
3. Normalize the package mass and demand units. Capacity and allocations are in kg; physical pack counts must remain whole for supported pack sizes.
4. Add explicit offer→facility dependencies and facility availability with evidence and timestamps. Distinguish a lot hold from a facility shutdown.
5. Account for existing commitments and transactionally reserve stock if implementing real ordering. A UI approval alone cannot prevent competing requests from spending the same stock.
6. Persist report, assessment, plan, decision and responsible actor. Apply retailer/regulator authorization on the server before exposing a real multi-tenant system.
7. Replace the single-supplier `quantity_available >= total_need` filter with a split allocator. Preserve hard safety eligibility independently of AI similarity.

`db/postgres-workflow.sql` is an additive workflow schema template for an RDS implementation. It is not run by this application. Keep the frontend API contracts while implementing a PostgreSQL workflow adapter in the Python service. Configure that service behind appropriate authentication; do not expose DB credentials to the browser.

## Data expansion

Floods or wildfire scenarios require verified route/facility closures and emergency demand. Existing operational dependency edges can represent those closures; direct-road baseline ETAs do not currently route around closed roads. Add route feasibility checks before claiming disaster rerouting.
