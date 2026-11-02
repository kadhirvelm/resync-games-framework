# Descent sim core

A deterministic, fixed-tick simulation. Every other Descent system runs as a
module inside it. Import everything from `logic/sim` (the `index.ts` barrel)
and the shared vocabulary from `logic/types.ts`.

## Rules

- **Input goes through commands.** Views call `sim.enqueue(command)`. The
  command gets a stamp for the next tick (`{ tick, seq }`) and runs at the
  start of that tick. Nothing outside a tick mutates world state.
- **Fixed tick.** One tick is `TICK_MS` (50 ms, placeholder) of sim time.
  Speed (`1 | 2 | 4`) changes how many ticks `stepFrame()` runs. It never
  changes tick length. Use `secondsToTicks` for wave clocks and timers.
- **Pause** stops ticks. `enqueue` still works while paused, but commands
  only queue; they run on the first tick after resume.
- **Determinism.** Same seed plus the same commands gives the same state.
  Inside a tick, use `context.rng` (never `Math.random`), use
  `context.nextEntityId` (never random ids), and never read `Date` or
  `performance`. Only `simDriver.ts` reads real time, and it only decides
  how many `stepFrame()` calls to make.
- **Render reads only.** Views use `sim.subscribe` and `sim.snapshot()`. A
  snapshot is deep-frozen and cached until the sim changes, so it works
  directly with `useSyncExternalStore`.

## Tick order

1. Commands stamped for this tick, in `seq` order, go to their owning
   module's handler. A command with no handler is consumed and ignored.
2. Processors run phase by phase, in `SIM_PHASES` order:
   `layers → economy → combat → cultivation → waves`. Within a phase, they
   run in module order, then declaration order.
3. `tick += 1`, then events raised during the tick go to `onEvent`
   listeners. That is a clean tick boundary: a listener may pause or save,
   but may not call `step`.

## Registering a system

```ts
import type { SimModule } from "../sim";

export const economyModule: SimModule = {
  id: "economy",
  init(world) {
    world.meta.economy = { popCap: 100 }; // new games only, not on load
  },
  commands: {
    place_building(command, context) {
      context.world.buildings.push({
        buildingType: command.buildingType,
        id: context.nextEntityId("building"),
        x: command.x,
        y: command.y,
      });
    },
  },
  processors: [
    { id: "economy-gather", phase: "economy", run(context) { /* … */ } },
  ],
};
```

Pass the module in an explicit scenario composition. `DESCENT_SIM_MODULES`
stays empty so a generic sim cannot silently inherit unfinished systems. The
playable slice uses `createAshenGateSim`, which registers economy, waves, and
the Ashen Gate bridge in a fixed order. Each command type has exactly one
owner. A second claim, or a duplicate module id, throws when the sim is
created.

Each module keeps its own state in `world.meta[module.id]`, and may add
fields to `UnitState` or `BuildingState`. All state must be JSON-safe,
because the whole world is serialized as is.

Modules can raise events for the views with `context.emit(moduleId, name,
data)`.

## Layers and autosave

The layers chunk calls `context.startLayer(layerId)`, for example from its
`descend` handler. That sets `layerId` and raises `layer_started`.
`attachLayerAutosave(sim, storage)` listens for `layer_started` and writes
the save at the tick boundary right after it, under `descent.save.autosave`.
A sim created with a `layerId` raises `layer_started` at the start of its
first `step`, so a new run autosaves before its first tick.

The mounted Ashen Gate experience also uses `attachPeriodicAutosave`, which
writes every five sim-seconds, and writes once more on a terminal outcome.
Because the interval follows sim ticks, pause does not advance the save clock.

## Saves

`serialize()` writes `{ format: "descent-sim", version, state }`, where
`state` is the full world: tick, seed, RNG cursor, queued commands, entity
and command counters, pause, speed, and all module data. `load()` validates
the save and restores it; module `init` does not run again. If you change
the saved shape, bump `SIM_SAVE_VERSION` and add a migration to
`SIM_SAVE_MIGRATIONS`, keyed by the old version.
