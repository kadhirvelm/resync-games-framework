## ProductNow lore

`ProductNowProvider` in the root layout holds the browser's ProductNow
connection. From any client component, call `useProductNowLore(gameId)` to
search, read, create, edit, or append lore for that game. Writes finish in
the background; call `waitForEdit` before reading the result. Render
`ProductNowConnection` where a game wants a connect button. Do not call the
ProductNow endpoints from a component directly.

## Generating game assets

Do not create per-game asset-generation scripts. Read the game's data
manifests for canonical asset names, prompt tags, roles, and audio cues, then
use the running backend's `POST /agent/assets/generations` endpoint and poll
the returned `statusUrl`. The full payload contract and curl examples are in
the root `AGENTS.md`. Generated GLBs, images, and audio are runtime data and
must not be committed.

## Multiplayer game clients

Games use `useMultiplayerRoom` from `src/services/multiplayer`; do not call
`socket.io-client` directly from components. The hook connects, reconnects,
rejoins, exposes create/join/leave room management, and keeps the latest typed
room snapshot. Define only the JSON-safe game-owned state locally; player list,
host, room code, capacity, timestamps, and revision belong to the framework.

Use one stable `gameId` per game experience and a stable player id persisted in
the browser or supplied by authentication. Render from `room.gameState`, derive
lobby UI from `room.players` and `isHost`, and await `updateGameState` before
submitting another transition. Keep optimistic visual effects local until the
authoritative snapshot confirms them. On `REVISION_CONFLICT`, reapply the user
intent to the returned latest room rather than retrying the stale snapshot.

The shared implementation is intended for small public-state games. Hidden
information, anti-cheat decisions, economy writes, and competitive validation
must be implemented as game-specific backend commands rather than client-owned
snapshot replacement.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
