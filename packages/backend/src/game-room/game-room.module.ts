import { Module } from "@nestjs/common";
import { RedisModule } from "../infra/redis/redis.module";
import { GameRoomGateway } from "./game-room.gateway";
import { GameRoomStore } from "./game-room.store";

/**
 * WebSocket room handling for the game client (join, leave, room state).
 */
@Module({
  exports: [GameRoomGateway, GameRoomStore],
  imports: [RedisModule],
  providers: [GameRoomGateway, GameRoomStore],
})
export class GameRoomModule {}
