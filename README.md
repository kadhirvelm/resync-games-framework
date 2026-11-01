# Towers of Coreborn

An experiment in building games from a living creative workspace.

The idea is to write the world's lore, environments, characters, tone, and
other creative direction as living documents, then load that world into a
playable game. This repository is the first game built around that workflow:
a deck-building roguelike.

Rather than treating the game's setting as a pile of static files, those
documents act as the source of truth for the world. The game can then turn
that material into encounters, cards, characters, art, and other playable
content.

## Status

This is an early work in progress. The content pipeline, asset generation, and
game itself are still being explored.

## Project structure

This is a Bun and TypeScript monorepo:

- `packages/frontend` — Next.js frontend and game client
- `packages/backend` — NestJS API and generation services
- `packages/api` — shared API types and service contracts
- `packages/database` — Prisma schema and database package
- `toc-cli` — local development tooling

## Game experiences

The home route is an experience selector rather than a single game entry
point. Each registered experience is loaded only after it is selected:

- **Towers of Coreborn** keeps the existing two-dimensional climb, local saves,
  and Phaser battle renderer unchanged.
- **3D Sandbox** is an isolated, client-only Babylon.js prototype with its own
  disposable engine and scene. It currently renders a bundled low-poly shrine;
  the glTF loader is present for the validated GLB asset pipeline planned next.

Experience metadata and lazy entry components live in
`packages/frontend/src/components/game-experiences/`. Babylon-only code lives in
`packages/frontend/src/components/babylonGame/`, so selecting or returning from
one runtime never mounts Phaser and Babylon in the same scene.

## Local development

Prerequisites:

- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/)
- [mkcert](https://github.com/FiloSottile/mkcert)

Run the initial setup:

```bash
./scripts/bootstrap.sh
```

Then start the development environment:

```bash
bun run dev
```

Useful commands:

```bash
bun run build
bun run test
bun run lint
```

## Local tools

`bun run dev` starts these alongside Postgres and Redis. To start only the
containers:

```bash
docker compose -f docker-compose.yml up -d
```

| Tool | URL | Use it to |
| --- | --- | --- |
| Gatus | http://localhost:8088 | See which services are up |
| OpenObserve | http://localhost:5080 | Search container logs |
| Redis Insight | http://localhost:5540 | Browse Redis and run commands |
| pgweb | http://localhost:2000 | Browse Postgres |
| Redis Commander | http://localhost:8081 | Lightweight Redis browser |

### Gatus

A health dashboard that checks every service every 15 seconds. The **data**
and **observability** groups should be green as soon as Docker is up. The
**application** group (backend and frontend) turns green once
`bun run dev` has finished starting. The buttons at the top link to the other
tools. Checks are defined in `gatus/config.yaml`.

### OpenObserve

Stores and searches logs from the Compose containers. Sign in with the
`OPENOBSERVE_ROOT_USER_EMAIL` and `OPENOBSERVE_ROOT_USER_PASSWORD` values in
`.env` (defaults: `root@example.com` / `LocalOpenObserve1!`).

Open **Logs**, choose the `docker` stream, and filter by container:

```sql
SELECT _timestamp, container_name, message
FROM docker
WHERE container_name = 'postgres'
ORDER BY _timestamp DESC
```

Container names include `postgres`, `pgweb`, `redis`, `redis_commander`,
`redis_insight`, and `gatus`. A `vector` container ships the logs (configured
in `vector/vector.yaml`); to include a new Compose service, give it the
`dev.towersofcoreborn.logs: "true"` label. The backend and frontend run on the
host, so their logs stay in the `bun run dev` terminal.

### Redis Insight

Open the database named **local**, which is preconfigured to point at the
Compose Redis. Use **Browser** to inspect keys and **Workbench** to run Redis
commands.

### pgweb

Open [http://localhost:2000](http://localhost:2000). pgweb connects directly to
the Compose PostgreSQL database; no separate sign-in or connection setup is
required.

## License

Released under the [Unlicense](LICENSE). Do whatever you want with it.
