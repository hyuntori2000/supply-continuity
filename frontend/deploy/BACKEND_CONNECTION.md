# Backend connection handoff

## Working isolated AWS version

- Frontend: https://main.dgblsgkgfm7j6.amplifyapp.com
- API root: https://5ythut6kx6.execute-api.us-east-1.amazonaws.com
- Runtime: Lambda, DynamoDB, Amazon Bedrock Nova Pro.
- Authentication: runtime team demo access code, supplied separately. Never put it in `VITE_` settings.
- Source and deployment/connection controls: [`aws/README.md`](../../aws/README.md).

Build settings for that frontend:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=https://5ythut6kx6.execute-api.us-east-1.amazonaws.com
VITE_REQUIRE_LOGIN=true
```

The browser submits the code as a Bearer credential. AWS inference endpoints return `202` with a job ID; the frontend polls `/api/jobs/{id}` and displays the actual tool events. It also remains compatible with the original backend's synchronous JSON/NDJSON responses.

## Team-owned AWS25 API remains independent

The originally supplied `AWS25` API is `vceh0xmua8`, at https://vceh0xmua8.execute-api.us-east-1.amazonaws.com . Supply Continuity's temporary integration was removed at the owner's request. At release it had zero routes, zero integrations, an empty auto-deploy `$default` stage and no app-specific CORS configuration. A `404` then meant no backend was connected. The team may subsequently change it; this is not a live status monitor.

Teammates can use AWS25 for their backend without replacing the isolated demo. Connect their deployed backend, define its methods/paths, configure authentication and CORS for their frontend, then test the full flow. Merely creating an API URL does not deploy application code.

If combining a different backend with this UI, implement the contract in [`frontend/README.md`](../README.md), or adapt `src/api/runtime.ts` for its schema/authentication. Keep individual-user authorization separate from the UI's Retailer/Regulator presentation switch. The shared demo access code is not a production identity system.
