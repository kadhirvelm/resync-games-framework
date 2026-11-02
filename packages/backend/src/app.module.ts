import { Module } from "@nestjs/common";
import { AssetClassesModule } from "./asset-classes/asset-classes.module";
import { ConfigurationModule } from "./configuration/configuration.module";
import { DungeonModule } from "./dungeon/dungeon.module";
import { GameRoomModule } from "./game-room/game-room.module";
import { GenerationQueueModule } from "./generation-queue/generationQueue.module";
import { RedisModule } from "./infra/redis/redis.module";
import { AllExceptionsFilter } from "./library/AllExceptions.filter";
import { ResyncGameFrameworkLoggerModule } from "./logger/logger.module";
import { PlayerModule } from "./player/player.module";
import { ProductNowLoreModule } from "./product-now-lore/product-now-lore.module";
import { ProductNowMcpModule } from "./product-now-mcp/product-now-mcp.module";

export const SharedModules = [
  ConfigurationModule,
  ResyncGameFrameworkLoggerModule,
  RedisModule,
];

@Module({
  imports: [
    GameRoomModule,
    GenerationQueueModule,
    AssetClassesModule,
    DungeonModule,
    PlayerModule,
    ProductNowLoreModule,
    ProductNowMcpModule,
    ...SharedModules,
  ],
  providers: [AllExceptionsFilter],
})
export class AppModule {}
