# Unified incident dashboard (v3)

The application root is now the incident dashboard. There is no separate E01 calculator behind the first page: reporting, product selection, traceback, planning, review, approval and export all use the same `INCIDENT` record, versioned DynamoDB catalog and `aws/src/incident-engine.ts` allocator through `/api/cases`.

Choose **Romaine**, **Raw Chicken** or **Tomatoes** to filter the incident inbox and open that product’s newest case. Choose a specific case in the inbox to update all metrics, maps, allocation rows and timeline together. Products without incidents show recorded supply locations, not a fabricated recovery plan. **All incidents** includes unmatched reports. **New incident** opens intake within this same dashboard; submitting automatically selects the newly saved case. The selected ID survives refresh through the URL and session selection.

The older E01-specific frontend calculator and controls are no longer mounted by `frontend/src/App.tsx`. Legacy endpoints and source are retained for compatibility and regression tests, but their numbers are not merged into new incidents. Same-chain transfers now use this authoritative multi-product engine. Historical regional-delay and direct-dispatch controls remain unavailable.

## End-to-end demo

1. Click **New incident**, select **DEMO Raw Chicken 1 kg** or **DEMO Tomatoes 1 kg** and click **Fill example report** (or enter a report with a registered lot and receiving store).
2. **Submit & analyze new incident** saves a new independent UUID before calling Amazon Bedrock. Bedrock extracts the literal product/lot; the server verifies the identifier and its store record. A report alone is never a contamination finding.
3. Record a **precautionary hold** with a synthetic evidence reference, or explicitly attest a synthetic positive lot test. This writes a demo hold for the lot and its downstream descendants. Upstream farms are traceability candidates, not automatically blamed. No physical stop is sent.
4. **Run recovery agent** loads current DB records, invokes Bedrock to interpret supported operational conditions, validates exact-product lot provenance and safety, computes shared-capacity min-cost allocations, and saves a proposal.
5. Bedrock runs a second review against the operator instruction. A supported interpretation correction can trigger one recalculation through the same engine; an ambiguous request stops without replacing the prior saved plan. Review coverage, quantities, unmet demand, cost, modeled ETA, affected-store map, source lots and tool evidence. Approve/reject the demo proposal; acknowledgement is required for unmet demand.
6. Refresh/reopen `#incidents/<id>` to retrieve the same report, evidence, plan, decision and timeline from DynamoDB.

## Registering a previously unknown lot

A report with an unregistered identifier stays `needs_records`. Expand **Update operational records → Register a missing lot** and enter the product, farm, receiving store, quantity, expiry and provenance reference. This saves an operator-attested **unverified** lot and on-hand inventory. It does not give safety clearance or make the lot eligible as replacement stock. Retry report analysis, review evidence, then plan recovery from independently released product lots.

New products must already exist in the catalog (romaine, raw chicken and tomatoes in this release). A completely unknown product or missing external evidence cannot be autonomously invented.

## What is actually live

The v2 catalog, inventory availability, lot graph, shipments and safety records are stored in DynamoDB under a versioned `CATALOG` item initialized once from the supplied synthetic dataset. The browser reads the DB response; it does not render a static fallback. Reports and their evidence/plans/timelines are separate persisted `INCIDENT` items. Stock updates require an operator reference and the expected catalog version.

This is **database-backed synthetic operations**, not a live retailer ERP, laboratory, FDA or carrier integration. Store coordinates are public locations; supplier coordinates, inventory, incidents, approvals and operating assumptions are synthetic. The unified dashboard labels the DB revision explicitly and does not call the legacy E01 calculation endpoints.

## Planning scope

- Exact-product replacements with known lot provenance, released lot/ancestors, unexpired stock, mock supplier approval and mock cold-chain verification.
- Replacement demand is affected on-hand packs plus separate planned/scheduled/in-transit store shipments. Delivered shipments are not counted twice.
- Supplier available units are uncommitted packs. Bedrock may lower their planning ceiling, but cannot manufacture stock or increase the DB's stock record.
- Supported AI updates: supplier availability, per-supplier spare-stock ceilings, time/cost objective, global driving multiplier, opt-in same-chain transfers and their driving-time limit. Unsupported regional routing, highway avoidance, cross-chain transfers, arbitrary deadlines or product substitution are explicitly reported as unapplied in this workspace. Historical E01-only controls are not part of the unified dashboard.
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

## Bounded agent review

Every new proposal uses two actual Bedrock calls: condition extraction, then `review_recovery_plan`. The reviewer sees the latest instruction, interpreted constraints, computed shortage and eligible offer capacity. It returns a concise assessment, findings, and optionally corrected conditions grounded in an exact quote from the request. One correction is allowed; no recursive retry loop is used. Server schemas, known-supplier checks and the same deterministic planner enforce safety, capacity and conservation. The final catalog/incident transaction and human approval remain mandatory.

The UI shows review outcome and draft/final allocated quantities. A correction is not necessarily a coverage increase: honoring a missed capacity limit can reduce allocation. A consistent plan reports that no additional improvement is claimed. Review failure or clarification leaves the previous proposal unchanged. This is bounded self-review, not model retraining or guaranteed global optimality.

### Version history and restored supply network

The dashboard retains Original supply / Interrupted / Recovery tabs, a map/relationships switch, chain filtering, permanent supplier quantity labels, and per-supplier allocation cards. All of them project the selected incident's saved plan. Original/interrupted dashed lines show ancestry relationships, not known per-source quantities; source shares were not recorded. Recovery lines show exact proposed pack allocations and saved road distance/ETA. Current seed products use 1 kg packs. The same-chain transfer toggle invokes Bedrock and saves a new proposal through this same engine; turquoise arrows identify donor stores.

Each successful agent calculation is saved in a separate DynamoDB item under `INCIDENTPLAN#<incidentId>`, with plan ID, sequential version, parent plan ID, impact, conditions, allocations, comparison baseline and Bedrock audit. Existing latest plans are preserved as V0 when the next version is created. This cannot recover versions overwritten before version storage existed. The current incident holds the current-plan pointer/content. Calculation snapshots are immutable; current approval status remains on the incident and event timeline. Historical snapshots retain their status at calculation time.

History previews never change current dashboard values. Selecting “Use V… as starting point” supplies that incident's plan ID to the next agent request. Conditions are inherited but recalculated against current operational records. A conditional transaction saves both the snapshot and new current plan, rejecting concurrent conflicting updates. Another incident's plan cannot be used as a base. The UI lists up to 100 recent versions; records remain stored separately.

Unrelated catalog revision changes no longer hide a still-valid plan. The server recomputes the selected incident using its saved conditions, and compares all product, demand, supply eligibility, allocation, cost and ETA fields. Relevant changes still invalidate it and prevent approval. This fixes the 95-pack single-store tomato case disappearing after a different product changed. The Romaine case with 1,587 packs across 18 stores is still investigating; no recovery allocations are fabricated before evidence review and planning.

Shared supplier inventory is not reserved across incidents. Separate case plans are alternatives/simulations and must not be summed into simultaneous executable orders. Versioning prevents calculation overwrites, not physical inventory overbooking.

Map tiles use OpenStreetMap with a CSS dark treatment; the CARTO endpoint returned an API-key-required placeholder during visual testing and was removed. Bounded review requires a verbatim operator quote for changes to objective, driving multiplier, supplier exclusions or capacity ceilings. Descriptive assumption/unsupported-request metadata can be cleaned without changing those operational fields. Unsupported-request text is rebuilt from the latest instruction rather than carried indefinitely from old plans.

### Normal distribution → incident → reallocation

Original supply now reconstructs the **whole selected product network** from current inventory and pending/in-transit shipments, including stores outside the selected incident. It follows lot ancestry per store instead of drawing every supplier to every store. Interrupted narrows the emphasized scope to affected descendants and replacement demand, while unaffected stores remain muted. Recovery shows the saved replacement allocation with unaffected stores still visible. Switching cases begins at Original supply; a newly generated plan automatically advances to Recovery. Product-wide original stock totals and incident replacement needs are deliberately labeled separately.

This baseline is reconstructed from recorded distribution, not a timestamped historical inventory snapshot or proof that every original lot was safe. Mixed-lot source proportions are unknown. No quantities are invented for those traced source relationships. True historical replay and simultaneous stock reservation remain future work.

Legacy narrative assumptions are not inherited into a new AI request: numeric operational conditions are inherited and descriptions regenerated. Review summary/finding text is bounded for display before validation; verdict, numeric conditions and amendment evidence retain validation. This avoids a verbose model explanation failing an otherwise valid plan.

### Readable interruption and redistribution map

Supplier IDs map consistently to A–F and store markers use stable store IDs 1–27, also shown in the allocation table. A disruption card identifies restricted ancestor lots, the affected output lot, store count and pack total. It only names source farms attached to actually held/recalled ancestor lots; a clean co-source is not marked as a failed supplier. With no recorded restriction, the card says reported exposure rather than a confirmed interruption. Recovery keeps the affected source visible alongside replacement sources, uses red dashed restriction paths and solid colored allocation arrows, and displays source pack totals permanently. Clicking a numbered store shows its allocations, road km and ETA. All arrows are logical flow directions, not actual road geometry.

## Additive network migration

Authenticated `POST /api/cases` with `{ "action": "expand_network", "expectedVersion": <current catalog version> }` expands a legacy seeded catalog once. It preserves all existing lots, safety states, supplier stock edits and incident histories, adds seven product offers and nine synthetic donor inventories, and increments the catalog version. Saved plans are revalidated against the new supply set; replan before approval. The migration is idempotent (`networkVersion: 1`). This explicit migration is required after a fresh legacy seed as well.

### Verified multi-source demonstration (2026-10-24)

The synthetic integration chicken case `4843c636-e455-44ec-8fe3-62781b58bc57` needs 1,022 packs across 18 stores. With the expanded catalog, actual Bedrock inference produced a supplier-only plan using multiple safe sources. An operator instruction limiting A, B and D to 200 packs each resulted in 600 allocated / 422 unfilled (58.7%). Clicking **Enable transfers** invoked Bedrock, preserved those ceilings, and produced 600 supplier packs + 388 safe store packs = 988 / 1,022 (96.7%); 34 packs remained unfilled. Donors were stores #1, #4, #10, #16, #19 and #25. These are computed synthetic proposals, not fulfilled deliveries or a promise that every incident improves by the same amount.

To repeat the visible change, select that case and click **Disable transfers**, wait for the saved plan, then click **Enable transfers**. The 200-pack ceilings must still be present. The 1/2/3 map phases show the recorded product network, restricted-lot paths and the proposed recovery respectively. Expand **Supplier capabilities** for the product-to-supplier matrix and **Store transfer allocation** for donor quantities. Scripts in `aws/scripts/test-expanded-network.mjs` provide the explicit migration and baseline acceptance steps; they intentionally modify only the named synthetic QA case.


## Proactive AI Special Suggestion

After a successful recovery plan run, the frontend starts a separate Bedrock job to explore alternatives. Exploration failure leaves the saved plan intact and offers a retry. Existing plans expose **Explore with AI**.

1. Bedrock proposes up to three bounded alternatives (same-chain transfer permission, 15–180 minute transfer window, time/cost objective) using current conditions and verified donor surplus.
2. The same allocation engine computes every alternative against the same catalog. Supplier stock ceilings, exclusions, traffic, safety, product, expiry and donor reserves cannot be changed by this proposal schema.
3. Bedrock compares the calculated metrics and selects an alternative or none. The server accepts a recommendation only if supplied packs do not decrease and at least one of allocated packs, total modeled cost or last delivery improves. Higher cost or later delivery can accompany higher coverage; all metrics are shown.
4. The suggestion is persisted separately by incident and tied to the exact base plan and catalog version. It does not change dashboard allocations.
5. **Accept changes & create new version** explicitly authorizes the listed policy changes. The server rejects stale, reused or cross-incident suggestions, recomputes and saves a separate proposed plan with its original baseline and AI decision audit. The map and allocation table consume this same plan. Final demo approval is separate.

This is bounded AI proposal and decision support, not unrestricted action discovery, a mathematical proof of optimality, predictive illness ML, physical dispatch, or shared-stock reservation across incidents.

API actions: `suggest_incident` (async; id + planId) and `adopt_suggestion` (id + suggestionId + candidateId). Conditional DynamoDB writes protect the current catalog and incident during both saves.

Live acceptance scenario: chicken demand 1,022 packs; suppliers A/B/D capped at 200 each; transfers off gives 600 packs (58.7%). Bedrock proposed enabling safe same-chain transfers and recommended the computed alternative: 988 packs (96.7%), 34 still unfilled, modeled cost $4,943 → $7,812, last delivery 547 → 569 minutes. These are synthetic planning results, not fulfilled deliveries. Other scenarios may yield no improving alternative.

## Regional traffic and priority-store context

Operational instructions now support `regionalTraffic` (named region + multiplier 1–3) and `priorityStoreIds` (affected stores only). Named regions use explicit city groups in `incident-engine.ts`. A region factor applies to trips with an origin or destination in that group; the largest applicable regional/global factor is used. This is operator-reported scenario data, not live or historical traffic, a road closure, or highway avoidance. Delayed driving also counts against the same-chain transfer travel limit.

When priorities are present, the flow objective first maximizes total supplied packs, then supplied packs for designated stores, then minimizes the chosen time/cost metric. It does not schedule vehicle departure or promise priority arrival. The dashboard shows priority stores' previous and current quantities, which may change while total coverage stays constant. AI Special Suggestion preserves these conditions and cannot recommend a candidate with fewer supplied priority-store packs.

New fields default to empty for older plan snapshots. A narrow deterministic check also enforces explicit instructions of the form “Suppliers A, B and D can each supply at most 200 packs”, preventing an AI supplier-letter/list-index error from dropping a stated ceiling. These checks are recorded in the planning audit; they are not independent AI discoveries.

A Google Routes integration is not yet active. `aws/.local/maps.env` is a Git-ignored, mode-600 placeholder for a server-only `GOOGLE_ROUTES_API_KEY`; it must not be exposed in frontend environment variables. Time-dependent real traffic remains pending API setup and validation.
