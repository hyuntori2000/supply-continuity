# Independent incident workspace (v2)

Open **New incident workspace** in the deployed FoodTraceAI dashboard. It handles new reports without requiring an E01 match. The original recovery demo remains available for its richer regional-delay, direct-lane and same-chain-transfer scenarios.

## End-to-end demo

1. Select **DEMO Raw Chicken 1 kg** or **DEMO Tomatoes 1 kg** and click **Fill example report** (or enter a report with a registered lot and receiving store).
2. **Submit & analyze new incident** saves a new independent UUID before calling Amazon Bedrock. Bedrock extracts the literal product/lot; the server verifies the identifier and its store record. A report alone is never a contamination finding.
3. Record a **precautionary hold** with a synthetic evidence reference, or explicitly attest a synthetic positive lot test. This writes a demo hold for the lot and its downstream descendants. Upstream farms are traceability candidates, not automatically blamed. No physical stop is sent.
4. **Run recovery agent** loads current DB records, invokes Bedrock to interpret supported operational conditions, validates exact-product lot provenance and safety, computes shared-capacity min-cost allocations, and saves a proposal.
5. Review coverage, quantities, unmet demand, cost, modeled ETA, affected-store map, source lots and tool evidence. Approve/reject the demo proposal; acknowledgement is required for unmet demand.
6. Refresh/reopen `#incidents/<id>` to retrieve the same report, evidence, plan, decision and timeline from DynamoDB.

## Registering a previously unknown lot

A report with an unregistered identifier stays `needs_records`. Expand **Update operational records → Register a missing lot** and enter the product, farm, receiving store, quantity, expiry and provenance reference. This saves an operator-attested **unverified** lot and on-hand inventory. It does not give safety clearance or make the lot eligible as replacement stock. Retry report analysis, review evidence, then plan recovery from independently released product lots.

New products must already exist in the catalog (romaine, raw chicken and tomatoes in this release). A completely unknown product or missing external evidence cannot be autonomously invented.

## What is actually live

The v2 catalog, inventory availability, lot graph, shipments and safety records are stored in DynamoDB under a versioned `CATALOG` item initialized once from the supplied synthetic dataset. The browser reads the DB response; it does not render a static fallback. Reports and their evidence/plans/timelines are separate persisted `INCIDENT` items. Stock updates require an operator reference and the expected catalog version.

This is **database-backed synthetic operations**, not a live retailer ERP, laboratory, FDA or carrier integration. Store coordinates are public locations; supplier coordinates, inventory, incidents, approvals and operating assumptions are synthetic. Existing E01 screens still use their original demo catalog; the v2 workspace labels its own DB revision explicitly.

## Planning scope

- Exact-product replacements with known lot provenance, released lot/ancestors, unexpired stock, mock supplier approval and mock cold-chain verification.
- Replacement demand is affected on-hand packs plus separate planned/scheduled/in-transit store shipments. Delivered shipments are not counted twice.
- Supplier available units are uncommitted packs. Bedrock may lower their planning ceiling, but cannot manufacture stock or increase the DB's stock record.
- Supported AI updates: supplier availability, per-supplier spare-stock ceilings, time/cost objective, global driving multiplier. Unsupported regional routing, highway avoidance, same-chain transfers, arbitrary deadlines or product substitution are explicitly reported as unapplied in this workspace. Those supported in the original recovery demo remain there.
- Stored road estimates plus supplier processing lead time produce delivery estimates. Map lines are allocation flows, not actual road paths. There is no live traffic service.
- Each incident plan is independent and makes **no stock reservation**. Multiple proposed or approved demo plans must not be interpreted as simultaneous executable orders. Fleet scheduling and cross-incident reservations are out of scope.

## Consistency and approval

Catalog writes use optimistic concurrency. Evidence review updates the incident and lot-safety catalog in one transaction. Planning and approval atomically check the same catalog revision and incident version using conditional writes. The same permissions as existing Get/Put/Query operations are used; no new cloud access was granted. Replanning is required after catalog changes, and approval recomputes allocation eligibility (including expiry). An already-decided proposal cannot be decided again.

The existing authenticated `/api/cases` route handles v2 actions: `workspace`, `new_report`, `analyze_incident`, `record_evidence`, `plan_incident`, `decide_incident`, `update_stock`, `register_lot`. Inference actions use durable async Lambda jobs and the existing polling API. No new API Gateway route or public endpoint was introduced.

## Validation

- `npm run build --prefix aws && npm test --prefix aws`: multi-product allocation, held ancestors, missing provenance, expiry, capacity conservation, independent persistence, unknown-lot registration, stale approvals and shortage acknowledgement.
- `node aws/scripts/test-incidents-live.mjs`: real Bedrock extraction/planning, independent chicken report, temporary stock update/restoration, stale-approval rejection, saved decision, unknown tomato lot followed by registration and independent planning.
- Sanitized live evidence: `docs/verification/independent-incidents.json`.
- Browser acceptance on the deployed Amplify app: submitted a new chicken report, recorded a synthetic precautionary hold, generated a 1,022 / 1,022 pack proposal, approved it, then refreshed and confirmed the same incident, allocations and approved timeline were restored from DynamoDB.
- The first live planning test exposed a missing permission for a DynamoDB ConditionCheck operation. It was replaced by an equivalent compare-and-write transaction using the existing permission scope, then the live suite passed. No IAM policy was broadened.
