# Supply Continuity — independent AWS frontend

This is a standalone React + Vite application extracted from the working prototype. It builds static HTML/CSS/JS and does **not** require Sites, Vinext, Cloudflare Workers or D1 to run. Copy this entire `frontend/` directory to use it independently. The original full-stack prototype remains at the repository root.

## Start and build

Use Node 22.13+ (current Node 22 patch recommended).

```sh
cd frontend
npm ci
cp .env.example .env.local
npm run dev
# http://127.0.0.1:3201
npm test
npm run build
npm run preview
```

Deploy the **contents of `frontend/dist/`**, with `index.html` at the hosting root. No Node server is needed for these files.

## Choose the data mode

| Mode | Behavior |
|---|---|
| `VITE_DATA_MODE=demo` (default) | Synthetic local catalog allocations, incident priorities, map, disruptions and timing. No Bedrock calls, case submission, database writes or approvals. |
| `VITE_DATA_MODE=api` | Calls the team's backend for evidence, plans, cases, decisions and live Bedrock tool events. Errors stay visible and never switch to demo results. |

For a working backend:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=https://your-api.example.com/prod
VITE_API_CREDENTIALS=omit
```

The API root is the prefix **before `/api`**: the above sends requests to `https://your-api.example.com/prod/api/continuity`. Include an API Gateway stage only if your backend uses it. A blank API base in `api` mode uses same-origin `/api/*` and requires a configured backend reverse proxy. Merely hosting static files does not create those routes.

Vite values are compiled into public JavaScript; rebuild after changing them. Do **not** put AWS access keys, Bedrock tokens, DB credentials or service API keys in `VITE_*`. The build rejects secret-looking VITE variable names. AWS credentials belong on the backend, preferably through its IAM execution role.

The frontend does not implement Cognito sign-in. For a backend using cookies, `VITE_API_CREDENTIALS=include` enables credentialed requests; the backend must support that session mechanism and the exact frontend origin. If your backend requires Cognito/OIDC bearer authentication, wire its sign-in and token acquisition into `src/api/runtime.ts` before enabling protected API access. Do not use a static bearer token in build settings.

## AWS Amplify deployment

1. Connect `hyuntori2000/supply-continuity` to Amplify Hosting and choose the branch to deploy.
2. Select a monorepo and set the app root to **`frontend`**. `AMPLIFY_MONOREPO_APP_ROOT` must also be `frontend`. Select React/Vite static hosting, not the repository-root Next.js app.
3. The root `amplify.yml` runs `npm ci` and `npm run build` inside that app root, publishing `dist`.
4. Set the three public variables above under Hosting → Environment variables. Use `demo` for an interface-only preview, or `api` plus the actual backend URL for a live demonstration.
5. Deploy and allow the resulting Amplify origin in the backend's CORS and authentication configuration.

This UI currently has one route (`/`) and does not require SPA path rewrites. If you add client-side routes, use AWS's SPA rewrite guidance. Never rewrite `/api/*` to `index.html`; an HTML API response is surfaced as a configuration error.

For Amplify manual ZIP deployment, zip the **contents** of `dist`, not its enclosing directory. S3 with CloudFront can serve the same static files. This repository does not create AWS resources or automatically migrate the backend/database.

Official references: [Vite on Amplify](https://docs.amplify.aws/gen1/javascript/deploy-and-host/frameworks/deploy-vite-site/), [monorepo settings](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html), [environment variables](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html), [SPA rewrites](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html).

## Supplied AWS endpoint status

The supplied root is `https://vceh0xmua8.execute-api.us-east-1.amazonaws.com`. A read-only AWS control-plane check on October 23, 2026 confirmed **zero routes and zero integrations**, with a `$default` stage whose deployment failed because no valid routes exist. There is no CORS configuration. This is an empty HTTP API, not a working backend. `/` and `/api/continuity` both return 404. Adding a stage prefix will not fix it. See [the backend connection checklist](deploy/BACKEND_CONNECTION.md). Do not describe this frontend as integrated with that endpoint yet.

Probe the expected read-only contracts with:

```sh
npm run check:api -- https://your-backend-root
```

## Backend integration contract

Use the contracts in [`../docs/TEAM_INTEGRATION.md`](../docs/TEAM_INTEGRATION.md). A URL alone is insufficient if the team's endpoints or payload shapes differ. Implement an adapter in `src/api/runtime.ts` or matching backend routes. `src/api/client.ts` handles the configurable root, cookies, timeout, clear API errors and fragmented NDJSON streams.

| Route | Frontend expectation |
|---|---|
| GET `/api/continuity` | `{stores, facilities, offers, impact, incidents, initial, stress, ai}`; `initial` is a full `RecoveryPlan`, including `timing` |
| POST `/api/continuity` | Request `{scenario}`; response `{id, hash, status, source, plan, stress}` |
| GET `/api/agent` | `{configured:boolean, model:string}`; configured is not proof of successful inference |
| POST `/api/agent` | `{message, scenario, source, caseId?}`; `application/x-ndjson` tool and final events |
| GET `/api/cases` | `{cases:IntakeCase[]}` |
| POST `/api/cases` | `{action:"submit", storeId, report}` or `{action:"analyze", id}`; response `IntakeCase` |
| GET `/api/workflow` | `{events, plans}`; events include `id, kind, created_at, plan_id` |
| POST `/api/workflow` | Hold acknowledgment or approve/reject; see root integration guide |

Types and data shapes are in `src/lib/continuity.ts` and `src/lib/cases.ts`. The browser never imports server Bedrock/D1 modules. The demo engine is loaded only in demo mode.

Agent NDJSON events:

```json
{"type":"tool_start","name":"verify_recall"}
{"type":"tool_result","name":"verify_recall","output":{"verified":true}}
```

A final event must include `type:"final", id, hash, status, source, plan, scenario, summary, model, stress`; `source` should be `amazon-bedrock` only after actual inference. Errors use `{type:"error", message}`. The frontend accepts streaming chunks or a buffered NDJSON response, including the final line without a newline. Check the hosting/backend request timeout if your agent takes longer than an API gateway permits; use a job/status adapter if necessary.

Cross-origin APIs must respond to OPTIONS and allow the exact deployed frontend origin, GET/POST/OPTIONS and `Content-Type`. If cookies are used, also send `Access-Control-Allow-Credentials: true`; do not use wildcard origins for credentialed requests. Enforce authentication/authorization server-side. The Retailer/Regulator toggle is a UI view, not a security boundary.

The original Sites backend checks same-origin writes and has a private login gate. It is **not** a drop-in cross-origin AWS backend URL. Adapt CORS/auth and storage in the AWS service; never place a Sites service token in this frontend.

### Local integration with the original prototype

Start the repository-root prototype using its README. In `frontend/.env.local`, set:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=
DEV_API_PROXY=http://127.0.0.1:3200
```

Run `npm run dev`. This development-only proxy adapts the request Origin for the original same-origin server. It is not included in static builds. Actual AWS deployment needs the team's API and its production CORS/auth configuration.

## Scope and verification

The map, incident triage, quantity ledgers, outage scenarios, timing, role views and decision interface preserve the prototype's behavior. Synthetic operations and direct-road ETA limitations remain disclosed. E01 is the active recovery model; E02/E03 are evidence-only incident cards.

Browser verification covered the static demo (Oakland outage → 611 kg allocated / 980 kg gap) and API mode through a local proxy to the existing prototype. The separated frontend completed a real Bedrock investigation with five tool stages, displayed the 1,220 kg plan, and persisted a synthetic approval. This proves the existing API contract works; it is not a test of the empty AWS API.

`npm test` checks HTTP URL construction, error handling, secret-variable rejection, streamed UTF-8/event boundaries and the 120 local allocation scenarios. `npm run build` type-checks and produces static assets. CI uploads a demo-mode build artifact. That artifact is an interface simulation, **not a live Bedrock deployment**.
