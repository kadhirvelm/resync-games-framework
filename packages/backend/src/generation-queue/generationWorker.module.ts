import { Module } from "@nestjs/common";
import { AssetClassesModule } from "src/asset-classes/asset-classes.module";
import { DungeonModule } from "src/dungeon/dungeon.module";
import { GenerationQueueModule } from "./generationQueue.module";

/**
 * Headless process graph for horizontally scalable asset workers.
 * It loads generation handlers and their dependencies without HTTP or sockets.
 */
@Module({
  imports: [AssetClassesModule, DungeonModule, GenerationQueueModule],
})
export class GenerationWorkerModule {}
