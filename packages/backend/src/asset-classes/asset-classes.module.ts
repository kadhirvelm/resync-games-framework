import { Module } from "@nestjs/common";
import { AgentAssetGenerationController } from "./agent-asset-generation/agentAssetGeneration.controller";
import { AgentAssetGenerationService } from "./agent-asset-generation/agentAssetGeneration.service";
import { AudioModule } from "./audio/audio.module";
import { BattleBackgroundModule } from "./battle-background/battle-background.module";
import { CardCharacterModule } from "./card-character/card-character.module";
import { EnemyModule } from "./enemy/enemy.module";
import { PlayableCardModule } from "./playable-card/playable-card.module";
import { SpriteSheetModule } from "./sprite-sheet/sprite-sheet.module";
import { StaticImageModule } from "./static-image/static-image.module";
import { ThreeDModule } from "./three-d/three-d.module";

/**
 * Every generatable asset class. Each class is a self-contained module with
 * its own controller (`generate` + `list`), coordinator agent, tool, and storage folder.
 */
@Module({
  controllers: [AgentAssetGenerationController],
  imports: [
    AudioModule,
    ThreeDModule,
    BattleBackgroundModule,
    CardCharacterModule,
    EnemyModule,
    PlayableCardModule,
    SpriteSheetModule,
    StaticImageModule,
  ],
  providers: [AgentAssetGenerationService],
})
export class AssetClassesModule {}
