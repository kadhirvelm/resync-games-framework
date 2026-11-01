# Towers of Coreborn development guide

## Repository

Towers of Coreborn is a Bun and TypeScript monorepo:

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
  `packages/backend/src/mastra/shared/towersOfCorebornAgentToolRegistry.ts`.
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
  and `card-generator` writes one
  lore-backed playable card. `dungeon-coordinator` accepts one broad setup
  prompt and writes a dungeon package: two room prompts, three character
  prompts with four card prompts and one sprite prompt each, and two enemy
  prompts with one sprite prompt each. A sprite slot's `ownerSlotId` names
  the character or enemy it animates; party sprites face right and enemy
  sprites face left. It does not paint those assets. A package read with a
  character or enemy that has no sprite slot gains one. The package is a
  JSON file under the public dungeon assets. In the Blueprint Workshop, each
  prompt can start that asset's agent, and an existing asset can be attached
  to a slot. Generating a character or an enemy also starts its sprite slot.
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
  Battle-background, card-character, and card-generator agents opt into
  `consult-productnow` and must read the Lore document before they paint. A
  tool that needs per-request context, such as a Lore search for the browser's
  ProductNow session, is built for that query and passed to the runner with
  the registry tools. Each query takes a `generationId` and keeps an
  `AbortController` for that run. `abort` writes the stop to Redis and
  publishes it, so a cancel request can stop a run on another process.

Use Nest dependency injection. Read environment values through
`ConfigurationService` outside startup/configuration code. Use the shared
`PrismaService` and transactions for multi-step writes.

### Frontend

The frontend uses the App Router. Routes live in `packages/frontend/src/app/`.
Components call the backend through `packages/frontend/src/services/`; do not
fetch service endpoints directly from components. Prefer Server Components and
add `"use client"` only for hooks, event handlers, or browser APIs.

The game on the home route lives in `packages/frontend/src/components/tower/`.
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

`TowerGame` owns the shell: the title menu, tower select, cultivation, and
chronicle live in `tower/shell/`, and a paper curtain (`useCurtain`) covers
scene changes. `useGameData` keeps three local-storage records in step with
the climb: saved climbs (`logic/saveGame`, one slot per tower, each with a
content snapshot), the player profile (`logic/progression`: Jade Essence,
permanent upgrades, per-tower ascension unlocks, codex, history), and
settings (`logic/settings`). Upgrades reach a climb only through
`RunOptions` passed to `startRun`; `run` never reads the profile. Sounds are
synthesized in `tower/audio/sound.ts`, and the battle reads pace and reduced
motion from `BattleSceneInput`.

### Shared contracts

Anything shared between frontend and backend belongs in `packages/api/src/`
and is imported from `@towers-of-coreborn/api`.

### External MCP OAuth

ProductNow MCP access lives in `packages/backend/src/product-now-mcp/`. The
backend serves its OAuth Client ID Metadata Document at
`/.well-known/oauth-client-metadata/towers-of-coreborn.json` and stores
per-browser OAuth state encrypted in Postgres. Keep MCP tokens server-side.

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
3. Register its module in `asset-classes.module.ts`.
4. Add a frontend `AssetClassDefinition` and register it in
   `assetClassRegistry.ts`.

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
