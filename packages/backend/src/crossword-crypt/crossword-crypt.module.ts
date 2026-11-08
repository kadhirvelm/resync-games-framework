import { Module } from "@nestjs/common";
import { GameRoomModule } from "../game-room/game-room.module";
import { RedisModule } from "../infra/redis/redis.module";
import { CrosswordCryptGateway } from "./crossword-crypt.gateway";
import { CrosswordCryptStore } from "./crossword-crypt.store";

/**
 * WebSocket gateway and Redis-backed lobby for the Crossword Crypt.
 */
@Module({
  imports: [GameRoomModule, RedisModule],
  providers: [CrosswordCryptGateway, CrosswordCryptStore],
})
export class CrosswordCryptModule {}
