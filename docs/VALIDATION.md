# Validation evidence

Validated locally on October 23, 2026 (America/Los_Angeles), using Node and the running app at port 3200. Machine-readable results live in `tests/*-results.json`.

| Check | Result | Scope |
|---|---|---|
| `npm run typecheck` | Passed | Active TypeScript sources |
| `npm test` | Passed | 120 capacity/dependency/priority scenarios; lot lineage, pack units, incident ordering, timing and fingerprints |
| `npm run test:api` | Passed | D1-backed proposals, shortage acknowledgment, stale hashes, idempotent approvals, conflicting decisions and origin checks |
| `npm run test:bedrock` | Passed | Real Nova Pro baseline and Oakland-outage tool workflows; see timestamp in results |
| `npm run test:cases` | Passed | New report persistence → live Bedrock extraction → exact lot/store link → live recovery; missing lot cannot start recovery |
| Browser interaction | Passed | Submitted a new case, completed five Bedrock tool stages, saw the plan; incident action opens regulator evidence; Oakland outage updates the priority card and recovery estimate |

The catalog baseline allocates 1,220 kg, including 1,138 kg within illustrative deadlines; 82 kg arrives late. Last planned delivery is 185 minutes after approval and modeled full supply recovery is 215 minutes, including a 30-minute receiving assumption. Oakland closure increases need to 1,591 kg and leaves 980 kg unfilled after 611 kg allocated; full recovery has no estimate.

These checks validate the implemented synthetic model. They do not validate outbreak causality, actual inventory, physical dispatch, real fleet schedules, regulatory clearance or production multi-tenant security. Credential configuration is not treated as proof of model access. Runtime AWS session credentials may expire after validation.
