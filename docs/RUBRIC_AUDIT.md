# FoodTraceAI — AWS challenge readiness audit

Audit date: October 24, 2026 (America/Los_Angeles). This assessment uses the challenge/rubric supplied by the team, repository inspection and tests against the live isolated AWS deployment. It is not an organizer ruling or a predicted score. The final video has not been recorded or assessed here.

## Overall finding

**The application meets the demonstrated AWS AI gate and has a working end-to-end decision-support demo. Submission readiness remains conditional on the five-minute video, team contact and a truthful explanation of the team's Kiro work.** The team confirmed Kiro usage during this audit; specific work and independent evidence were not supplied.

## Rubric assessment

| Criterion | Weight | Evidence and assessment | What the video must make clear |
| --- | --- | --- | --- |
| Real persona and need | 20 | A named Bay Area replenishment/continuity manager faces held food stock, interrupted replenishment and shared warehouse failures. Clear use case; no real user interviews or operational outcome study verified. | Introduce Maya, her responsibility and consequences of stockouts. Explain regional coordination across multiple chains; do not imply one retailer owns another's stock. |
| Working application | 25 | Live AWS report persistence → real Bedrock extraction → exact lot/store linkage → tool-driven plan → approval → independent history read passed. Missing evidence blocks recovery. Supplier outages and same-chain transfers change quantities. | Show a freshly submitted case and saved decision. This is a working demo for known incident E01, not a general outbreak-detection system or a real dispatch integration. |
| AWS AI use | 20 + gate | Real Amazon Bedrock Nova Pro inference, five gated tools, natural-language scenario changes and product assessment were verified. Lambda uses its execution role. This passes the technical AWS AI gate on the observed implementation. | Record actual live tool activity and a changed plan. A configured badge, static map or manual toggle is not inference evidence. This uses a custom tool loop with Bedrock Converse, not the managed Agents for Amazon Bedrock service. |
| Understanding | 15 | Clear separation between AI interpretation, deterministic safety/quantity checks and human approval. Current AWS architecture is documented; outdated Cloudflare submission wording was corrected. | Explain Amplify, API Gateway, asynchronous Lambda, Bedrock, DynamoDB, and why the LLM does not invent quantities or approve dispatch. |
| Polish and presentation | 10 | Accessible live login, incident-first UI, triage queue, quantity labels, source focus, case inbox and regulator evidence view inspected. Browser-driven AI and approval reviewed below. The finished video/audio has not been evaluated. | Use one coherent story, zoom/focus the relevant source and show the shortage explicitly. Avoid explaining every collapsed section. |
| Above and beyond | 10 | Shared dependency failure, multi-supplier allocation, same-chain stock transfers with protected donor cover, unit normalization, explicit shortages, scenario stress checks and auditable decisions are substantive additions. | Demonstrate Oakland closure, then partial recovery via same-chain stores. Use actual displayed results; do not claim measured illness prevention or universal disaster recovery. |

## Tests and evidence

- **240 distinct allocation scenarios**: 120 supplier-only and 120 transfer-enabled combinations of outages, objectives and traffic factors. Conservation, eligibility, capacity, per-store need and donor reserve invariants passed.
- **10 transfer safety mutations**: recalled descendants, held/expired lots, unverifiable cold chain, stale inventory, reservations, missing roads/agreements, shared multi-lot donor capacity and forged same-chain flags.
- **12 frontend test groups**, including a repeated 120-scenario engine check (not counted again above), transport, job polling and failure propagation.
- **18 AWS backend test groups** with mocked AWS/Bedrock transport: authentication, origin restrictions, malformed JSON, atomic decisions, duplicate approval, shortages, durable jobs and adversarial evidence matching. These mock tests do not prove model-wide robustness.
- **12 live HTTP checks**: public health, unauthenticated/foreign-origin rejection, malformed/oversized input, invalid scenario types, unknown jobs and polling validation.
- **Real AWS E2E acceptance**: new fictional case saved, Bedrock extracts exact lot, stored evidence drives a five-tool recovery plan, approval persists, repeated approval is idempotent, Oakland outage blocks shared suppliers, absent and lookalike lots remain `needs_records`.
- **Real Bedrock transfer test**: natural-language enablement of same-chain transfers produced a stored plan and preserved donor reserves. Both supplier-only and transfer-enabled API scenarios were independently checked.
- **Browser approval check**: the combined Oakland outage and store-transfer plan showed all five completed Bedrock tools, 727 kg allocated and 864 kg unfilled. Approval was disabled until the shortage was acknowledged; the demo decision then saved and appeared in the timeline.
- Root/frontend type checks, production builds and the Lambda bundle passed.

Live scripts: `aws/scripts/test-live.mjs`, `aws/scripts/test-transfers-live.mjs`, `aws/scripts/audit-http.mjs`. Secret-free results for this audit are in `docs/verification/`. Credentials and the team access code are excluded.

## Verified synthetic comparisons

| Scenario | Supplier kg | Store-transfer kg | Unfilled kg | Modeled cost | Full supply recovery |
| --- | ---: | ---: | ---: | ---: | --- |
| Recall; supplier-only | 1,220 | 0 | 0 | $6,940 | 215 min |
| Recall; same-chain transfers enabled | 884 | 336 | 0 | $6,214 | 186 min |
| Oakland closure; supplier-only | 611 | 0 | 980 | See actual plan | Unresolved |
| Oakland closure; same-chain transfers enabled | 611 | 116 | 864 | $4,720 | Unresolved |

These are fixed-snapshot modeled comparisons, not live inventory, measured cash savings or guaranteed delivery times. Full regional demand grows to 1,591 kg under the Oakland outage because existing orders are interrupted too. Allocation is not the same as on-time coverage: the recall baseline still has 82 kg arriving after the illustrative deadline.

## Defects found and repaired

1. **Lot-prefix false match:** a model could return a known lot that was only a prefix of a different reported identifier. The server now requires complete identifier tokens for both intake evidence and recall verification. Forced wrong model output, suffix/prefix variants and unlinked-case bypass attempts are regression-tested.
2. **Malformed JSON returned HTTP 500:** invalid inference JSON now returns 400 before AWS work; oversized bodies still return 413. Verified on the live API after deployment.
3. **Valid descendant-lot ambiguity:** one repeat live case-to-plan run stopped with `UNMATCHED_SOURCE`. Its rejected tool arguments were not captured, so the exact cause is unconfirmed. Inspection found that verification accepted only the raw lot even though intake reports refer to its affected blended descendant. The tool now explicitly accepts either exact, traced affected lot when present in the source. A regression test and a subsequent full live E2E run passed; this is not a guarantee of universal model reliability.
4. **Conflicting submission documentation:** old Cloudflare/D1 and private-repository instructions were mixed with the deployed AWS architecture. The README, architecture and script entry point now identify the current AWS submission and distinguish the legacy prototype.

## Material limits to state honestly

- A customer report is linked to existing synthetic recall evidence. It does **not** create a new verified recall, diagnose food poisoning or independently prove a supplier caused illness.
- Recovery is implemented for **DEMO-E01 only**. E02/E03 are triage/evidence records; arbitrary new incidents and product categories are not dynamically solved.
- Bedrock interprets supported constraints and assesses product fit. Quantities, hard safety exclusions and priorities come from code. The store P0/P1 deadlines are illustrative fixture values, not validated clinical or vulnerability scores.
- The stock model is a fixed snapshot. Approval does not atomically reserve real inventory across multiple plans, dispatch trucks, purchase goods, send external notifications, or clear an official recall.
- Retailer and Regulator are presentation views, not role-based tenant authorization. The shared demo access code is not a production identity system.
- Supplier coordinates and operational data are synthetic. Store locations and stored road-network routes are real-world derived; there is no live traffic, fleet/driver capacity or multi-stop vehicle optimization. Map edges are illustrative flows, not road geometry.
- The openFDA endpoint is a reference feed. Its records are not mapped into the demo inventory or used as real-time outbreak triggers.
- An application refresh resets the displayed plan to the catalog baseline; the inbox, proposals and decision timeline persist. Do not imply that refresh reopens the last approved plan automatically.

## Submission items still required

1. Record a **five-minute working-app video** with named persona, architecture and actual Bedrock use; use `DEMO_VIDEO_SCRIPT.md`.
2. Add the precise, truthful Kiro task the team performed. Team usage is self-reported, not independently verified in this audit.
3. Add the team's organizer-approved contact channel and check that the video/submission link is accessible to judges. Send the demo code privately if requested; never show AWS credentials.
4. Verify the event's deadline/timezone and upload instructions with the organizers. The supplied challenge text says Saturday 10:30 AM; this audit did not access the event portal or submit anything.
5. Rehearse one complete run before recording. Focus on a verified case, shared failure, additional store supply and a visibly unresolved shortage. Do not make unsupported claims about automated containment or prevented illnesses.
