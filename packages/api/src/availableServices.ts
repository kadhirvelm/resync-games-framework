import type { ServiceDefinition } from "./genericTypes/service";
import {
  BattleBackgroundServiceApi,
  BattleBackgroundServiceDefinition,
  CardCharacterServiceApi,
  CardCharacterServiceDefinition,
  EnemyServiceApi,
  EnemyServiceDefinition,
  PlayableCardServiceApi,
  PlayableCardServiceDefinition,
  SpriteSheetServiceApi,
  SpriteSheetServiceDefinition,
} from "./services/assetClasses";
import {
  DungeonServiceApi,
  DungeonServiceDefinition,
} from "./services/dungeon";
import {
  ProductNowMcpServiceApi,
  ProductNowMcpServiceDefinition,
} from "./services/productNowMcp";

export type AvailableServices = {
  battleBackground: BattleBackgroundServiceApi;
  cardCharacter: CardCharacterServiceApi;
  dungeon: DungeonServiceApi;
  enemy: EnemyServiceApi;
  playableCard: PlayableCardServiceApi;
  productNowMcp: ProductNowMcpServiceApi;
  spriteSheet: SpriteSheetServiceApi;
};

export type AvailableServicesDefinition = {
  [key in keyof AvailableServices]: ServiceDefinition<AvailableServices[key]>;
};

export const AVAILABLE_SERVICES: AvailableServicesDefinition = {
  battleBackground: BattleBackgroundServiceDefinition,
  cardCharacter: CardCharacterServiceDefinition,
  dungeon: DungeonServiceDefinition,
  enemy: EnemyServiceDefinition,
  playableCard: PlayableCardServiceDefinition,
  productNowMcp: ProductNowMcpServiceDefinition,
  spriteSheet: SpriteSheetServiceDefinition,
};
