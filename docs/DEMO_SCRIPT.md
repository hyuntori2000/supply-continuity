# Five-minute recording script

## 0:00–0:30 — Persona and need

“I am the regional grocery replenishment manager. When a recall interrupts a supplier, I must contain affected stock while keeping food available across our stores. Choosing a nearby supplier is not enough if it shares the same failed warehouse.”

## 0:30–1:00 — Architecture

Show the architecture diagram. Identify Amazon Bedrock, the deterministic allocation engine and the server-persisted workflow. State that the web preview runs on Workers/D1; AWS powers inference. Only describe Kiro work that the team actually performed.

## 1:00–2:30 — A new incoming case

Briefly show the incident queue: active recall first, pending evidence next, closed record last. Explain that containment confirmation stays urgent even when a replacement plan is available.

Open Start with a customer report. Edit the example sentence while preserving the demo lot and choose Target San Francisco. Submit. Show a new case ID, actual Bedrock extraction and the evidence-linked alert. Explain that an illness report is not proof; the lot/store link joins existing synthetic recall evidence.

Click Trace & find replacements. Show the Bedrock tools running. Expand the product assessment: romaine accepted, iceberg excluded, 500 g packs normalized. Focus a supplier on the map and show a store's assigned quantity.

## 2:30–3:30 — The shared failure

Ask “Oakland warehouse is closed. Replan using independent suppliers.” Show B and D excluded together. The expected catalog-compatible result is 611 kg allocated from F and 980 kg unfilled from 1,591 kg need. The extra demand includes B's interrupted existing orders. If a real model assessment differs, report its actual validated output; do not narrate fixed numbers over a different screen.

## 3:30–4:15 — Timing and human judgment

Show last planned delivery and why full supply recovery cannot yet be estimated with a shortage. Show priority recipients, physical pack counts and modeled costs. Acknowledge the gap to approve a demo proposal, or reject and request revision. Confirm the server timeline updates. Do not claim an actual purchase or shipment.

## 4:15–5:00 — Impact and boundaries

“Different suppliers may share the same failure. Our system exposes that dependency and recalculates what can actually be supplied.” Show the regulator evidence view and decision brief export. Mention real public store locations, synthetic operations, modeled road travel and missing live integrations. End with the team's organizer-approved event contact.

## Recording preparation

- Refresh AWS workshop credentials and run the live Bedrock check before recording.
- Check the actual provider/model label; a configured badge alone is not inference proof.
- Record the uncut case-to-recovery segment if possible. Do not present prerecorded fixture answers as live AI.
- Keep API keys, shell environments and account credentials out of the video.
- Verify the organizer's submission time and contact channel. The supplied rubric says Saturday 10:30 AM; confirm the event's timezone.
- Invite teammates to the private GitHub repo. A private hosted Site has separate access controls.

## Rubric evidence

| Criterion | Video evidence |
|---|---|
| Persona / need (20) | Named regional manager, held stock, replenishment deadlines |
| Working app (25) | New report, stored case, live extraction, plan, persisted decision |
| AWS AI (20 + gate) | Bedrock product assessment and tool activity alter the actual plan |
| Understanding (15) | Correct architecture and clear AI/code/human boundaries |
| Polish (10) | Readable map, quantity ledgers, timeline, honest error states |
| Above and beyond (10) | Shared failure, split allocation, units, shortage deadlines, stress test |

This is a demonstration plan, not a score prediction or award guarantee.
