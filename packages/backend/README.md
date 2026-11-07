# Backend

NestJS API for Resync Game Framework.

Run the full development environment from the repository root:

```bash
bun run dev
```

The backend listens on `https://localhost:8080`.

## Agent asset generation API

Coding agents can queue any asset class without holding a request open:

```bash
curl --cacert ../../.certs/localhost.pem \
  -H 'Content-Type: application/json' \
  -d '{"assetClass":"three-d-prop","prompt":"A low-poly crystal beacon","provider":"design","useLore":false}' \
  https://localhost:8080/agent/assets/generations
```

The HTTP 202 response contains a `jobId` and relative `statusUrl`. Poll that
URL with GET until its `status` is `completed` or `failed`. A completed status
contains the generated asset in `result`; a failure contains `error`. See the
root `AGENTS.md` for every asset class, optional payload field, and the workflow
for generating a game's roster from its source manifests.

## Logging

The backend writes structured logs with Pino. Development logs are
pretty-printed; production emits JSON to stdout. Compose container logs are
available in the local OpenObserve instance documented in the root README.

## ProductNow MCP OAuth

Resync Game Framework connects to ProductNow's MCP server as a public OAuth client
identified by a Client ID Metadata Document (CIMD):

```text
${BACKEND_API_URL}/.well-known/oauth-client-metadata/resync-game-framework.json
```

That URL is the OAuth `client_id`, so ProductNow's authorization server must be
able to fetch it over public HTTPS. For local testing, expose the backend
through an HTTPS tunnel and set `BACKEND_API_URL` to the tunnel URL. The CIMD's
`logo_uri` points at `${FRONTEND_URL}/logo.png`.

Environment:

- `MCP_OAUTH_ENCRYPTION_KEY`: 32 random bytes encoded as base64
  (`openssl rand -base64 32`). Local development uses a built-in default when
  this is unset, so ProductNow sessions survive backend restarts. Production
  must set its own key.
- `PRODUCTNOW_MCP_URL`: defaults to `https://api.productnow-prod.com/mcp`.
- `PRODUCTNOW_GAMES_FOLDER_ID`: the ProductNow folder that holds game lore.
  Lore storage refuses to run until it is set.
- `PRODUCTNOW_LORE_DOCUMENT_ID`: optional canon document for Towers of
  Coreborn. Without it, agents look for a document named "Lore".

OAuth tokens, PKCE verifiers, and state are stored per browser in Redis,
encrypted with AES-256-GCM. The browser only holds an opaque HttpOnly session
cookie. Agents that need the Spire, the Reach, or other lore call
`consult-productnow`. That tool runs a research subagent, which uses this
session and calls ProductNow's read tools.

## Checks

```bash
bun run check
bun run lint
bun run test
```
