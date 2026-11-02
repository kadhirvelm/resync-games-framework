import { Module } from "@nestjs/common";
import { ConfigurationModule } from "src/configuration/configuration.module";
import { RedisModule } from "src/infra/redis/redis.module";
import { GenerateThreeDModelToolService } from "src/mastra/tools/generateThreeDModelTool.service";
import { MeshyProvider } from "./meshyProvider";
import { ThreeDAssetStore } from "./threeDAssetStore";
import { ThreeDJobs } from "./threeDJobs";

/** Infrastructure has no dependency on agents, preventing registry/asset cycles. */
@Module({
  exports: [
    ThreeDAssetStore,
    MeshyProvider,
    ThreeDJobs,
    GenerateThreeDModelToolService,
  ],
  imports: [ConfigurationModule, RedisModule],
  providers: [
    ThreeDAssetStore,
    MeshyProvider,
    ThreeDJobs,
    GenerateThreeDModelToolService,
  ],
})
export class ThreeDInfrastructureModule {}
