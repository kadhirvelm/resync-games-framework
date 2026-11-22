import { Module } from "@nestjs/common";
import { GameRoomModule } from "src/game-room/game-room.module";
import { RedisModule } from "src/infra/redis/redis.module";
import { DescentGateway } from "./descent.gateway";
import { DescentService } from "./descent.service";

/** Provides the Descent co-op lockstep WebSocket gateway and match service. */
@Module({
  imports: [GameRoomModule, RedisModule],
  providers: [DescentService, DescentGateway],
})
export class DescentModule {}
