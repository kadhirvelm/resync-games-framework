# Resync Game Framework

A framework for exploring game concepts. Start by writing down what you want, then let coding agents lose to bring it to life.

I've been building random web games for a decade or something. Wanted to bring all those lessons and techniques I've learned over the years into one repo so I can try lots of game concepts out in the most token efficient way possible. Open sourcing it in case anyone else finds it fun!

The framework gives agents the tools they need to put web games together. It supports 2D games and 3D games, complete with all the asset generation pipelines. It also includes all the tools needed to support persistent backends, database storage, websockets for multiplayer, and registration to hook up MCP to any external system.

**Disclosure: this is a prototyping framework, not a way to publish games.** Use it to try out game concepts quickly, play them, and share them with friends. This is designed exclusively for local development. There are no accounts, no access control, and no production hosting setup, and the example games are rough prototypes rather than finished products. If a concept works, take what you learned and build the real game elsewhere.

## My development flow

1. **Write the world.** My game concept specs live in [ProductNow](https://app.productnow.ai). You can always use markdown here in the repo instead, I just prefer a proper doc editor, especially if I'm trying to collaborate with someone else.
2. **Pull the specs down** Then I hook up my coding harness to it via MCP and let it lose to implement. Theoretically you could hook a game up to it at runtime, though still exploring what's possible with that. Maybe fun for a living lore repository that you can contribute to easily?
2. **Generate assets.** The **Blueprint Workshop** (`/assets`) lists every asset type: battle rooms, character portraits, enemies, sprite sheets, cards, icons and textures, audio, 3D models, and whole dungeon packages. Each type runs a dedicated agent. The agent reads the lore, then calls shared tools that paint images, render audio, or build 3D models. Should be easily extensible for your needs.
3. **Play.** Each game loads the generated assets. When an asset is missing, it uses a built-in stand-in, so every game is playable before anything is generated.

Generation runs on a job queue, so you can refresh the page or cancel a run without losing track of it. Agents have all the instructions they need to trigger the generation while you're running the framework.

## Setup

### Prerequisites

- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/)
- [mkcert](https://github.com/FiloSottile/mkcert)
- [ngrok](https://ngrok.com/download) (optional, paid plan): needed to connect an external MCP server such as ProductNow, or to share your games with friends. See [Connecting external MCP servers](#connecting-external-mcp-servers) and [Sharing games with friends](#sharing-games-with-friends).

### Quickstart

Run the initial setup, then start the stack:

```bash
./scripts/bootstrap.sh
bun run dev
```

- `./scripts/bootstrap.sh` installs dependencies, builds the local CLI, initializes `.env` with local defaults, sets up local HTTPS certificates, and builds the monorepo packages.
- `bun run dev` starts Postgres, Redis, and observability tools in Docker, applies database migrations, and serves the frontend at https://localhost:3000 and backend API at https://localhost:8080.

### API Keys and Configuration

**You do not need any real API keys just to explore or play the games.** All games include built-in fallback assets and procedural logic, and `./scripts/bootstrap.sh` populates `.env` with placeholder credentials so the backend boots cleanly out-of-the-box.

However, once you want to generate new assets (in the Blueprint Workshop at `/assets` or via CLI scripts), you will need to add valid API keys to your `.env` file.

#### Summary of API Keys

| Variable | Required? | Provider / Service | What It Powers |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | **Required** (for asset generation) | [Anthropic Claude](https://console.anthropic.com/) | Powers Mastra agent reasoning, planning, and multi-step pipeline orchestration. |
| `OPENAI_API_KEY` | **Required** (for asset generation) | [OpenAI](https://platform.openai.com/) | Used for text tasks and image generation (character portraits, rooms, sprite sheets, enemies, and icons). |
| `GEMINI_CREDENTIALS` | **Required** (for asset generation) | [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai) | Service-account JSON string or path to credentials file; powers Gemini agents and Vertex AI image painting. |
| `ELEVENLABS_API_KEY` | **Optional** | [ElevenLabs](https://elevenlabs.io/) | AI-generated sound effects, ambient room loops, and instrumental music beds. If omitted, audio generation is skipped and games use built-in synthesized sound cues. |
| `MESHY_API_KEY` | **Optional** | [Meshy](https://www.meshy.ai/) | High-detail textured 3D models and character rigging/animation. If omitted, 3D generation uses the built-in zero-credit procedural low-poly compiler. |

#### Other Configuration Keys

- `MCP_OAUTH_ENCRYPTION_KEY`: A 32-byte base64-encoded secret used to encrypt ProductNow OAuth tokens at rest in Postgres. `./scripts/bootstrap.sh` automatically supplies a local development default; production deployments should set a unique secret.
- **ProductNow Connection (Optional)**: Connect your lore documents via the **Connect ProductNow** button in the Blueprint Workshop. This requires ngrok (see [Connecting external MCP servers](#connecting-external-mcp-servers)).
- `PRODUCTNOW_GAMES_FOLDER_ID`: The ProductNow folder that holds your game lore. Each game files its lore in a subfolder here, created on first use; Towers of Coreborn uses this folder directly. Lore storage is unavailable until this is set.
- `PRODUCTNOW_LORE_DOCUMENT_ID` (optional): The document Towers of Coreborn treats as its canon. Without it, agents search for a document named "Lore".



------------------------ AGENTS FOCUSED README ------------------------

### Connecting external MCP servers

You need ngrok to connect the framework to any external MCP server, such as
ProductNow for your lore. Without one, everything else runs locally as usual.

Why: an external MCP server signs the backend in with OAuth. During that
flow, the server fetches the backend's OAuth client document and redirects
back to it, so the backend must be reachable at a public HTTPS URL with a
certificate the server trusts. The local `https://localhost` certificates
from mkcert are trusted only by your own machine. ngrok gives the frontend
and backend public HTTPS URLs with valid certificates, which is what the
OAuth flow needs.

To set it up:

1. Install the [ngrok CLI](https://ngrok.com/download) and sign in:

   ```bash
   ngrok config add-authtoken <token>
   ```

   The frontend and backend each need their own hostname, which requires a
   paid ngrok plan. A free account has only one dev domain and cannot give
   each its own hostname. By default the hostnames are
   `resync-game-framework-<you>-frontend.ngrok.app` and
   `resync-game-framework-<you>-api.ngrok.app`. To choose your own, set
   `NGROK_DOMAIN_SUFFIX`, or `NGROK_FRONTEND_DOMAIN` and
   `NGROK_BACKEND_DOMAIN`, in `.env`.
2. Start the stack with tunnels instead of `bun run dev`:

   ```bash
   bun run resync dev --network
   ```

   This points `FRONTEND_URL` and `BACKEND_API_URL` at the tunnels, prints
   the public URLs, and closes the tunnels when you stop it. The apps still
   run on localhost.
3. Open the printed frontend URL. In the Blueprint Workshop, click **Connect
   ProductNow** and approve access.

Once connected, agents read your lore before they generate. Card generation
needs a connection. 3D and audio generation can run without lore. See
[packages/backend/README.md](packages/backend/README.md) for the OAuth
details.

### Sharing games with friends

The same ngrok setup lets you run the games on your laptop and share them
with friends, with no hosting. Start the stack with `bun run resync dev
--network` and send your friends the printed frontend URL. They can play in
their own browsers. A game built on the framework's multiplayer rooms can
put you all in the same game.

- The games run only while your laptop is on and the command is running.
  Stopping it closes the tunnels and the link stops working.
- Anyone with the link can use everything you can, including the Blueprint
  Workshop, which spends your API credits. Share the link only with people
  you trust.

### Try the 3D studio

Open the Blueprint Workshop, choose **3D models**, and click **Try complete
demo**. It builds a small world with no model-provider calls. Then open
**3D Sandbox** from the game library to explore it.

## The example games

The games in this repository are small examples of what the framework can
do. Many more are on the way.

- **Towers of Coreborn** (`/towers-of-coreborn`): a deck-building roguelike.
  You climb a tower with a party of Coreborn and fight turn-based card
  battles. Its rooms, portraits, enemies, cards, animated sprites, and music
  can all be generated from the lore.
- **Descent** (`/descent`): a real-time strategy and base-building game. You
  build a Hold, cultivate its defenders, and dig layer by layer into Hell. The first layer, the Ashen Gate, is playable and ends with the Cinderjaw boss.
- **3D Sandbox** (`/three-d-sandbox`): a prototype that loads worlds built in
  the Blueprint Workshop's 3D studio.

For writing about how these games are designed and built, see
[kadhirvelm.dev/blog](https://kadhirvelm.dev/blog).

### Generate assets from an agent

With the backend running, coding agents can queue any image, card, sprite,
audio clip, or 3D model through one non-blocking endpoint:

```bash
curl --cacert .certs/localhost.pem \
  -H 'Content-Type: application/json' \
  -d '{"assetClass":"static-image","prompt":"A seamless moonlit basalt floor texture"}' \
  https://localhost:8080/agent/assets/generations
```

The response includes a `jobId` and `statusUrl`. Poll the status URL with GET;
when `status` is `completed`, `result` contains the stored asset. The coding
agent guide in [AGENTS.md](AGENTS.md) documents every asset class and explains
how to generate a game's roster from its source manifests. Generated models,
images, and audio stay local and are not committed.

## Developing

```bash
bun run build   # build every package
bun run check   # type-check
bun run lint    # Biome and Stylelint
bun run test    # backend and frontend tests (resets the local test database)
```

The repository is a Bun and TypeScript monorepo:

- `packages/frontend`: Next.js game client and Blueprint Workshop
- `packages/backend`: NestJS API, WebSockets, agents, and the generation queue
- `packages/api`: contracts shared by the frontend and backend
- `packages/database`: Prisma schema and client
- `resync-cli`: the `resync` command for local development
- `docs/descent`: Descent's design documents

[AGENTS.md](AGENTS.md) is the full development guide. It covers the
architecture, every local command and tool, the agent tool catalog, and code
standards, and coding agents read it automatically.

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
and **observability** groups turn green once Docker is up. The
**application** group (backend and frontend) turns green once `bun run dev`
has finished starting. The buttons at the top link to the other tools.
Checks are defined in `gatus/config.yaml`.

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
in `vector/vector.yaml`). To include a new Compose service, give it the
`dev.resync-game-framework.logs: "true"` label. The backend and frontend run on
the host, so their logs stay in the `bun run dev` terminal.

### Redis Insight

Open the database named **local**, which already points at the Compose Redis.
Use **Browser** to inspect keys and **Workbench** to run Redis commands.

### pgweb

Open http://localhost:2000. pgweb connects directly to the Compose Postgres
database, with no sign-in or connection setup.

## License

Released under the [Unlicense](LICENSE). Do whatever you want with it.
