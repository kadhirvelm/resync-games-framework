import { Module } from "@nestjs/common";
import { ElevenLabsClient } from "src/asset-classes/audio/elevenLabsClient";
import { ThreeDInfrastructureModule } from "src/asset-classes/three-d/threeDInfrastructure.module";
import { ModelModule } from "src/model/model.module";
import { ProductNowLoreModule } from "src/product-now-lore/product-now-lore.module";
import { ProductNowMcpModule } from "src/product-now-mcp/product-now-mcp.module";
import { ConsultProductNowAgent } from "./agents/consult-productnow/consultProductNowAgent";
import { TowersOfCorebornAgentService } from "./shared/towersOfCorebornAgent.service";
import { TowersOfCorebornAgentToolRegistry } from "./shared/towersOfCorebornAgentToolRegistry";
import { GenerateAudioToolService } from "./tools/generateAudioTool.service";
import { GenerateImageToolService } from "./tools/generateImageTool.service";
import { RecordProductNowLoreToolService } from "./tools/recordProductNowLoreTool.service";

/**
 * Shared Mastra runtime: the agent runner and the tool catalog.
 * Agent modules import this; {@link MastraModule} re-exports it with each agent.
 */
@Module({
  exports: [
    ConsultProductNowAgent,
    ElevenLabsClient,
    TowersOfCorebornAgentService,
    TowersOfCorebornAgentToolRegistry,
  ],
  imports: [
    ModelModule,
    ProductNowLoreModule,
    ProductNowMcpModule,
    ThreeDInfrastructureModule,
  ],
  providers: [
    ConsultProductNowAgent,
    ElevenLabsClient,
    GenerateAudioToolService,
    GenerateImageToolService,
    RecordProductNowLoreToolService,
    TowersOfCorebornAgentService,
    TowersOfCorebornAgentToolRegistry,
  ],
})
export class MastraCoreModule {}
