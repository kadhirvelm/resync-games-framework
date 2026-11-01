import { Module } from "@nestjs/common";
import { PrismaModule } from "src/database/prisma.module";
import { MastraModule } from "src/mastra/mastra.module";
import { CultivatorPainter } from "./cultivatorPainter";
import { PlayerController } from "./player.controller";
import { PlayerService } from "./player.service";

/** The browser's cultivators and saved climbs, stored in Postgres. */
@Module({
  controllers: [PlayerController],
  imports: [MastraModule, PrismaModule],
  providers: [CultivatorPainter, PlayerService],
})
export class PlayerModule {}
