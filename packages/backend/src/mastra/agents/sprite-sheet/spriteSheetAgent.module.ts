import { Module } from "@nestjs/common";
import { SpriteSheetToolService } from "src/asset-classes/sprite-sheet/spriteSheetTool.service";
import { MastraCoreModule } from "../../mastraCore.module";
import { GenerationAbortModule } from "../generationAbort.module";
import { SpriteSheetAgent } from "./spriteSheetAgent";

/**
 * Wires {@link SpriteSheetAgent}. The agent passes its tool enum to the
 * runner, which loads `consult-productnow` and `generate-image` from the
 * shared registry. The agent splits and stores the sheet that tool returns.
 * Importers of {@link MastraModule} can inject the agent and call `query`.
 */
@Module({
  exports: [SpriteSheetAgent],
  imports: [GenerationAbortModule, MastraCoreModule],
  providers: [SpriteSheetAgent, SpriteSheetToolService],
})
export class SpriteSheetAgentModule {}
