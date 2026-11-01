import { Global, Module } from "@nestjs/common";
import { ConfigurationModule } from "src/configuration/configuration.module";
import { RedisModule } from "src/infra/redis/redis.module";
import { GenerationQueueService } from "./generationQueue.service";

/** Makes the durable asset-generation queue available to every asset module. */
@Global()
@Module({
  exports: [GenerationQueueService],
  imports: [ConfigurationModule, RedisModule],
  providers: [GenerationQueueService],
})
export class GenerationQueueModule {}
