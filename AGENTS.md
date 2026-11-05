# Resync Game Framework development guide

## Repository

Resync Game Framework is a Bun and TypeScript monorepo. Towers of Coreborn
(`towers-of-coreborn`) is the cards game that ships in it.

- `packages/frontend` — Next.js 16 and React 19 game client
- `packages/backend` — NestJS API, WebSockets, and asset generation
- `packages/api` — shared service and WebSocket contracts
- `packages/database` — Prisma schema and generated client
- `toc-cli` — local development commands

Use Bun for package management and scripts. Do not use npm, pnpm, yarn, or
npx.

## Common commands

```bash
bun run dev
bun run build
bun run check
bun run test
bun run lint

bun run toc database db:migrate
bun run toc database db:seed
bun run toc database db:studio
```

Tests use `bun:test`. Type-check individual packages with `bun run check` from
that package directory.

## Architecture

### Backend

- Entry point: `packages/backend/src/runtimes/main.ts`
- Root module: `packages/backend/src/app.module.ts`
- Configuration: `packages/backend/src/configuration/`
- Redis: `packages/backend/src/infra/redis/`
- WebSockets: `packages/backend/src/websockets/`
- Asset classes: `packages/backend/src/asset-classes/`
- AI providers and orchestration: `packages/backend/src/model/` and
  `packages/backend/src/mastra/`
- Shared Mastra tools: declare them on the `AgentTool` enum in
  `packages/api/src/agents/tools.ts` and register them in
  `packages/backend/src/mastra/shared/resyncGameFrameworkAgentToolRegistry.ts`.
  An agent opts in with its own enum whose values are `AgentTool` members
  and passes that enum to the agent runner, which loads the tools.
- Agents: `packages/backend/src/mastra/agents/<name>/`. Each agent is a Nest
  service with a `query` method. Asset classes call `query`; they do not
  construct Mastra agents themselves. `battle-background` paints battle rooms,
  `card-character` paints four-level portraits, `enemy` paints one
  creature facing the player and stores a repeating attack and defend cycle,
  `sprite-sheet` paints a pixel-art identity anchor and then one 4×6 sheet
  from it (idle, attack, defend, hurt rows on pure white), which the backend
  keys out and splits into one normalized PNG strip per animation,
  `static-image` paints one reusable icon, cutout, texture, illustration, or
  backdrop, and `card-generator` writes one
  lore-backed playable card. `audio` renders one effect, ambience loop, or
  instrumental bed through ElevenLabs. `dungeon-coordinator` accepts one broad setup
  prompt and writes a dungeon package: two room prompts, three character
  prompts with four card prompts and one sprite prompt each, and two enemy
  prompts with one sprite prompt each. A sprite slot's `ownerSlotId` names
  the character or enemy it animates; party sprites face right and enemy
  sprites face left. It does not paint those assets. A package read with a
  character or enemy that has no sprite slot gains one, and a package gains
  audio slots for each room's ambience, each enemy's attack, and the climb's
  camp, battle, and boss beds plus victory, defeat, and reward stingers.
  The package is a
  JSON file under the public dungeon assets. In the Blueprint Workshop, each
  prompt can start that asset's agent, and an existing asset can be attached
  to a slot. Generating a character or an enemy also starts its sprite slot,
  and generating a room or an enemy also starts its sound.
  A later
  card keeps the previous level's aether cost and effect kinds. Running slot
  generations are stored in Redis so a refresh keeps them on the dungeon tab
  and on the asset's own tab. `DungeonBlueprintStore` owns package files,
  locking, and API hydration; `DungeonSlotGenerator` owns slot-to-agent
  dispatch. Agent queries run through `GenerationAbortCoordinator.run` so
  distributed cancellation and cleanup have one lifecycle. Painting goes
  through the shared
  `generate-image` tool. The agent's instructions carry the art direction, and the agent passes
  that direction in the tool call. Asset classes do not call image providers
  themselves. `consult-productnow` is a registry tool that runs a research
  subagent. That subagent loads ProductNow's read tools for the browser's
  OAuth session itself, so those MCP tools are not in the shared registry.
  `record-productnow-lore` appends one entry to a named document in a game's
  ProductNow folder and creates the document when it is missing. An agent
  opts into a tool by listing it on its own tool enum.
  Battle-background, card-character, and card-generator agents opt into
  `consult-productnow` and must read the Lore document before they paint. A
  tool that needs per-request context, such as a Lore search for the browser's
  ProductNow session, is built for that query and passed to the runner with
  the registry tools. Each query takes a `generationId` and keeps an
  `AbortController` for that run. `abort` writes the stop to Redis and
  publishes it, so a cancel request can stop a run on another process.

Asset generation runs through the BullMQ boundary in
`packages/backend/src/generation-queue/`. API processes enqueue and may wait
for the existing synchronous service response; worker processes execute the
registered handler. Run a headless worker with `bun run worker`. Set
`ASSET_GENERATION_WORKER_ENABLED=false` on API-only replicas, and tune local
and fleet limits with `ASSET_GENERATION_WORKER_CONCURRENCY` and
`ASSET_GENERATION_GLOBAL_CONCURRENCY`. Every replica in an environment must use
the same `ASSET_GENERATION_QUEUE_NAME`, Redis, and persistent asset volume
through `PUBLIC_ASSETS_ROOT`. Use a different queue name per environment.

Queue jobs use the client `generationId` as both the BullMQ job id and generated
asset id. A handler must be idempotent: read an already-complete asset before
calling a provider, publish files with `writeAssetDirectoryAtomically`, and
never replace the id with a random one. Serialize the ProductNow session id in
jobs that need Lore and rebind it inside the worker. Register terminal cleanup
with `GenerationQueueService.register(..., { onFailed })`; do not start
fire-and-forget work in a controller or treat a Redis progress record as a
queue. Cancellation must remove waiting jobs and call the agent's distributed
abort path for active work.

The `player` module (`packages/backend/src/player/`) stores the browser's
cultivators and saved climbs in Postgres under an anonymous `resync_player`
cookie; every query is scoped by that player id. Painting a cultivator runs
the `card-character` agent (four realm portraits) and the `sprite-sheet`
agent (right-facing) in the background through `CultivatorPainter`, which
writes each result back only while the row still names that run. The game
reads progress by polling `state`.

Use Nest dependency injection. Read environment values through
`ConfigurationService` outside startup/configuration code. Use the shared
`PrismaService` and transactions for multi-step writes.

### Frontend

The frontend uses the App Router. Routes live in `packages/frontend/src/app/`.
Components call the backend through `packages/frontend/src/services/`; do not
fetch service endpoints directly from components. Prefer Server Components and
add `"use client"` only for hooks, event handlers, or browser APIs.

The home route is the game library. Each game is mounted at its own path
(`/towers-of-coreborn`, `/descent`, `/three-d-sandbox`) so a refresh stays in
that game. Towers of Coreborn lives in `packages/frontend/src/components/tower/`.
`logic/` holds the pure, seeded rules: `buildTowerContent` turns a dungeon
package (or the loose gallery, or built-in content) into a tower and fills
missing assets with stand-ins; `generateTower` lays out the linear floors,
scales enemies to `FLOOR_PLANS`, and assigns room rewards; `combat` runs
turn-based battles and returns steps for animation; `run` owns recruiting,
party order, merging, rewards, and death. React screens handle everything
between battles. `components/phaserGame/` draws only the battle, from a
`BattleSceneInput`, and reports back through `onFinish`. The scene keeps
long-lived views in `phaserGame/views/` (units, cards, HUD, stage) and
updates them in place. Rules resolve at once; each `CombatStep` is replayed
in order on a `stepTimeline` schedule, so the player can keep playing while
earlier blows animate. Cards are dragged or clicked out of a fanned hand
(`handFan`); aimed cards show a curved arrow and play on release over a
legal target (`cardAim`). A Coreborn or enemy whose dungeon sprite slot is
filled fights as that animated sprite instead of its portrait;
`battleSprites.ts` maps combat events to its idle, attack, defend, and hurt
strips. Keep game rules out of the Phaser scene and the screens.

`TowerGame` owns the shell: the title menu, cultivators, tower select,
cultivation, and chronicle live in `tower/shell/`, and a paper curtain
(`useCurtain`) covers scene changes. Every climb is made by one of the
player's cultivators: `logic/cultivators` puts a cultivator's name, four
realm portraits, and battle sprite on the tower's built-in cultivator, and
`logic/cultivatorRealm` raises the portrait a realm per quarter of the
climb. `usePlayer` reads cultivators and saved climbs from the `player`
service and queues climb saves (`logic/climbSyncQueue`); saved climbs
(`logic/saveGame`) are keyed by climb id, so a tower can have many, and each
carries a content snapshot. `useGameData` keeps them in step with the climb,
along with two local-storage records: the player profile
(`logic/progression`: Jade Essence, permanent upgrades, per-tower ascension
unlocks, codex, history) and settings (`logic/settings`). Upgrades reach a climb only through
`RunOptions` passed to `startRun`; `run` never reads the profile. Interface
sounds stay synthesized in `tower/audio/sound.ts`. A climb with generated
audio plays that package's room tone, enemy attacks, stingers, and
camp, battle, or boss bed, and falls back to the synthesized score when a
cue is missing. The battle reads pace and reduced
motion from `BattleSceneInput`.

The Descent game experience lives in `components/descent/`. Its generic sim
has no default modules; `createAshenGateSim` explicitly composes economy,
waves, and the Ashen Gate integration bridge. Views read snapshots and enqueue
commands only. Ashen Gate-owned map/content stays under
`data/layers/ashen_gate/`, while its end-to-end contract stays in
`logic/__tests__/ashenGateSlice.test.ts`. Each run's Ashen Gate layout is
generated from the run seed by `generateAshenGateMap` (reusable algorithms
live in `logic/mapgen/`); node ids are stable, positions are not, so tests
locate the Camp and nodes from the snapshot. Generated vents are saved in
`world.meta.layerTerrain`; read them through `worldVentVolumes`, never the
layer table directly. Fog of war (`logic/fog/`) is saved in
`world.meta.fogOfWar` and refreshed by the slice from Hold unit and building
sight; `buildShellModel` applies it, so views never show horde bodies out of
sight or deposits, veins, and vents on unexplored ground. Rim and abyss scenery stands
above the flat fog sheet, so `views/sceneryFog.ts` hides each piece until the
map edge beside it is explored. The mounted slice ends after
Cinderjaw; later layers, heroes, Calamities, and Tribulation are not live
runtime content. Browser autosave runs at layer start, every five sim-seconds,
and at the terminal outcome. Each building covers an odd square of cells
(`footprint` in `data/buildings.json`); placement, villager pathing,
adjacency bonuses, and combat reach all go through `logic/economy/footprint`,
and the battlefield draws each building to fill its square. Camps and
Barracks publish their three-slot training queues and saved rally points;
completed batches receive movement orders toward that building's rally point.
Renewable economy buildings declare timed `production` rows in
`data/buildings.json`; a cycle pays its inputs when it starts and grants its
outputs after `everyTicks` progress. A row with `workers` (Well 3, Farm and
Managed Forest 1) runs only while villagers with a `work` task stand beside
it, each adding one progress per step; rows without it run on their own.
A `harvest` row (Spirit Herb Garden) grows on its own, then waits ripe until
one villager with a `harvest` task picks it and carries it to a drop-off
(`logic/economy/harvest.ts`); the HUD tracker shows each crop's growth.
The battlefield is a Babylon.js
presentation adapter with a DOM/WebGL fallback; it never owns rules. A loading
screen covers the shell until the viewport has loaded the asset manifests,
every generated model and painting, and compiled shaders (or 30 seconds
pass); the sim clock starts only then. New scene loads take a `TrackLoad`
from `views/loadingProgress.ts` so the screen counts them. Generated
Ashen Gate models are resolved by canonical names from the existing 3D asset
services and fall back to procedural meshes. Combat units resolve by faction
and class so Warden, Hunter, Rider, Raider, Breaker, and Adept keep distinct
silhouettes. From Stronghold tier the Camp draws the larger `stronghold`
model, keeping the Camp model until that one has been generated.
Surface nodes reuse four
harvestable prop families (grove, tree, outcrop, and well) with resource-color
cues, while ember vents use one generated hazard prop with a procedural glow.
The battlefield sits on a basalt plateau a little larger than the map, with
cliffs dropping to a lava sea (`views/ashenBackdrop.ts`). Its ground, cliff,
and lava paintings come from the `static-image` agent and are found again by
the prompt tags in `data/layers/ashen_gate/environmentArt.ts`. Generated
scenery (Horde Gate, abyss spires, rim ruins, spirit crystals, boulders) is
placed by `views/ashenTerrainLayout.ts` and never lands inside the playable
map. Every surface and scenery role has a procedural stand-in.
Rebuild the local zero-credit roster and missing textures with
`bun run assets:descent`; use `--meshy --roles=<comma-separated roles>` for a
scoped detailed pass and `--concurrency=<n>` to run model jobs in parallel. Do
not commit runtime-generated GLBs or images.
Generate Descent's tagged music, ambience, and effects through the audio queue
with `bun run assets:descent:audio`; it requires ElevenLabs and skips clips whose
exact manifest prompt already exists. Do not commit the runtime-generated MP3s.

### Shared contracts

The separate 3D experience lives in `components/babylonGame/`; pure gameplay and
save rules stay in its `logic/` folder. The Blueprint Workshop's 3D studio plans
prototype packages, generates/imports GLBs, previews models, and assigns slots.
Shared contracts are in `api/src/services/assetClasses/threeD.ts`. Backend
`asset-classes/three-d/` owns validation, atomic storage, package hydration and
the refresh-safe job journal; `mastra/agents/three-d/` owns model-design and prototype
queries. `generate-3d-model` compiles safe structured low-poly designs or calls
the optional server-side Meshy adapter. Low-poly characters use the built-in
six-joint rig and five named clips. Meshy characters run as one journaled
preview, refine, auto-rig, and multi-animation pipeline; normalize its output to
the required idle, walk, attack, hit, and death clips before validation. Keep 3D
packages and saves independent of 2D dungeon files and climb data.

Anything shared between frontend and backend belongs in `packages/api/src/`
and is imported from `@resync-game-framework/api`.

### Multiplayer games

Use the shared game-room framework instead of creating a Socket.IO connection
inside a game. The wire contract and authoritative `GameRoomState` live in
`packages/api/src/websockets/game.ts`; `GameRoomGateway` and `GameRoomStore`
own room codes, membership, capacity, host transfer, disconnect cleanup,
Redis persistence, and revision-checked state updates. The frontend entry point
is `useMultiplayerRoom` in `packages/frontend/src/services/multiplayer/`.
An explicit final leave deletes the room; an unexpected final-player disconnect
keeps it for 60 seconds so Socket.IO reconnection can rejoin it.

To add simple multiplayer to a game:

1. Define a small JSON-safe game state and a stable `gameId`. Keep the snapshot
   below 64 KiB and keep animation/rendering state out of it.
2. In a client component, call `useMultiplayerRoom({ gameId, player,
   initialState, maxPlayers })`. Give each player a stable browser or account
   id, not a new id on every render.
3. Build create/join UI from `createRoom`, `joinRoom`, `leaveRoom`, `room.id`,
   `room.players`, and `isHost`. Render gameplay from `room.gameState`.
4. Compute a complete next snapshot in the game's pure logic, then await
   `updateGameState(nextState)`. A revision conflict returns the newest room;
   reapply the player's intent to that state instead of blindly retrying an
   old snapshot.

The copy-ready client example is in
`packages/frontend/src/services/multiplayer/README.md`.

For game-specific commands or server-authoritative competitive rules, add the
event and acknowledgement to the shared API definition, handle it on a Nest
gateway with `@getSocketDecorator`, mutate state through a Redis-locked store,
and broadcast with `getServerEmitter(roomId)`. Keep rules outside Phaser and
React screens. Do not trust a client-supplied full snapshot for hidden-info,
ranked, economy, or anti-cheat-sensitive games.

### External MCP OAuth

ProductNow MCP access lives in `packages/backend/src/product-now-mcp/`. The
backend serves its OAuth Client ID Metadata Document at
`/.well-known/oauth-client-metadata/resync-game-framework.json` and stores
per-browser OAuth state encrypted in Postgres. Keep MCP tokens server-side.

Game lore lives in `packages/backend/src/product-now-lore/` and the shared
`productNowLore` service. Every call names a `gameId`. Towers of Coreborn
uses the existing Card game thing folder and Lore document; any other game
gets a subfolder there on first use. Reads and writes stay inside that
folder. Writes return before ProductNow finishes them, so callers poll
`getEditStatus`. On the client, `useProductNowLore(gameId)` is the one entry
point, and `ProductNowProvider` in the root layout holds the connection.
Socket handlers resolve the same browser session with
`ProductNowLoreService.requireSession` and the handshake cookie.

### Database

The schema is `packages/database/prisma/schema.prisma`. Never hand-edit an
existing migration. Generate migrations through the `toc database` command.

## Asset classes

Each generated game-asset type has a shared API definition, a backend module,
and a frontend gallery definition.

To add an asset class named `foo`:

1. Add `packages/api/src/services/assetClasses/foo.ts`, export it from the
   asset-class index, and register it in `AVAILABLE_SERVICES`.
2. Add `packages/backend/src/asset-classes/foo/`, following `card-character`.
   Use `createAssetClassStorage`; do not hand-build public asset paths.
3. Register a stable queue handler in the service's `onModuleInit`, route
   `generate` through `GenerationQueueService.enqueueAndWait`, and route
   `cancel` through both the queue and the agent abort path. Persist under the
   supplied `generationId` with atomic publication.
4. Register its module in `asset-classes.module.ts`.
5. Add a frontend `AssetClassDefinition` and register it in
   `assetClassRegistry.ts`. Set `medium` to `2d`, `3d`, or `both` so the
   workshop sidebar keeps flat art, models, and shared generators apart.

Service callers return `ServiceError` values rather than throwing. Check
`isServiceError(result)` before using the response.

## Code standards

- Use clear, descriptive names.
- Avoid nested `if` statements. Prefer guard clauses and early returns.
- Never use nested ternaries.
- Extract reusable or non-trivial logic into small, tested utilities.
- Document every function, method, and React component added with concise
  JSDoc, including parameters and return behavior.
- Keep React components focused; separate business logic from presentation.
- Put tests in a sibling `__tests__` directory. Use `.test.ts` for utilities
  and `.spec.ts` for Nest services.
- Do not commit generated output (`dist`, `.next`, `.turbo`, generated Prisma
  clients), credentials, or runtime-generated assets.

## GitHub Actions

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It
reports three checks: lint (`bun run lint`), type (`bun run check`), and
tests (`bun run test`). The test job starts Postgres with the credentials in
`toc-cli/src/constants/database.ts`.

- Bind free-text expressions to environment variables before using them in
  shell scripts; never interpolate them directly into `run`.
- Start multi-command shell blocks with `set -euo pipefail`.
- Quote variables and validate external inputs early.
- Require full 40-character commit SHAs for image/deployment lookup.
- Give workflows only the permissions they need.
- Use `continue-on-error: true` for notification steps.

## Keeping this file accurate

Update this guide when package structure, commands, or durable conventions
change. Keep it concise and remove stale guidance rather than preserving
historical architecture.
