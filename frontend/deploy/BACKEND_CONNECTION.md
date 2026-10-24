# AWS backend connection handoff

The supplied HTTP API is `AWS25`, ID `vceh0xmua8`, region `us-east-1`.
Base URL: `https://vceh0xmua8.execute-api.us-east-1.amazonaws.com`.

## Verified state, October 23, 2026

Read-only API Gateway queries returned:

- Routes: **0**.
- Integrations (backend targets): **0**.
- Stage: `$default`, auto-deploy enabled.
- Last deployment message: “Deployment attempt failed: Unable to deploy API because no valid routes exist in this API”.
- No CORS configuration.

The URL is correct but no server handles any request. Changing the frontend URL or appending `/prod` cannot create the missing backend. No AWS resources were changed during this inspection.

## What must be connected

1. Deploy a backend that implements the contract in `frontend/README.md`. The existing full-stack prototype has working route logic in root `app/api/` and pure allocation logic in root `lib/continuity.ts`. Its D1 storage and Cloudflare runtime imports must be adapted before running on Lambda or another AWS server.
2. Supply storage for cases, plans and audit events. The repository's `db/postgres-workflow.sql` is a schema template for the team's RDS integration, not an already connected service.
3. Configure the backend's Bedrock access through its IAM role and supported model. Do not give AWS credentials to the browser.
4. In the existing HTTP API, add the backend integration and routes. Required paths are GET/POST `/api/continuity`, GET/POST `/api/agent`, GET/POST `/api/cases` and GET/POST `/api/workflow`. A Lambda proxy handler must route these methods/paths and implement their payloads; adding route names alone is insufficient.
5. Configure backend authentication/authorization and CORS for the frontend's actual Amplify origin. The frontend does not currently implement Cognito sign-in; add the matching auth adapter if the backend requires bearer tokens. Do not expose paid inference endpoints anonymously just to make a demo button work.
6. Redeploy/verify `$default`, then run `npm run check:api -- https://vceh0xmua8.execute-api.us-east-1.amazonaws.com` from `frontend/`. Test browser access, report submission, an actual Bedrock response and approval persistence as separate checks.
7. Build the frontend with `VITE_DATA_MODE=api` and `VITE_API_BASE_URL=https://vceh0xmua8.execute-api.us-east-1.amazonaws.com`. Deploy through Amplify using app root `frontend`.

If the team has already deployed a different backend, use that service's real URL instead of this empty API and map any differing response schemas in `src/api/runtime.ts`.

The static demo can be deployed immediately in `demo` mode for UI review. It is explicitly not a live AWS AI application until a backend is connected.
