import { Module } from "@nestjs/common";
import { AudioAssetWriter } from "src/asset-classes/audio/audioAssetWriter";
import { MastraCoreModule } from "../../mastraCore.module";
import { GenerationAbortModule } from "../generationAbort.module";
import { AudioAgent } from "./audioAgent";

/**
 * Wires {@link AudioAgent}. The agent passes its tool enum to the runner,
 * which loads `consult-productnow` and `generate-audio` from the shared
 * registry. The agent stores the clip that tool returns.
 * Importers of {@link MastraModule} can inject the agent and call `query`.
 */
@Module({
  exports: [AudioAgent],
  imports: [GenerationAbortModule, MastraCoreModule],
  providers: [AudioAgent, AudioAssetWriter],
})
export class AudioAgentModule {}
