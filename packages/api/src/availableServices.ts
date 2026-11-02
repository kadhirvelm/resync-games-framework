import type { ServiceDefinition } from "./genericTypes/service";
import {
  AudioServiceApi,
  AudioServiceDefinition,
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
  type ThreeDAssetServiceApi,
  ThreeDCharacterServiceDefinition,
  ThreeDEnvironmentServiceDefinition,
  ThreeDPropServiceDefinition,
  type ThreeDWorkshopServiceApi,
  ThreeDWorkshopServiceDefinition,
} from "./services/assetClasses/threeD";
import {
  DungeonServiceApi,
  DungeonServiceDefinition,
} from "./services/dungeon";
import { PlayerServiceApi, PlayerServiceDefinition } from "./services/player";
import {
  ProductNowLoreServiceApi,
  ProductNowLoreServiceDefinition,
} from "./services/productNowLore";
import {
  ProductNowMcpServiceApi,
  ProductNowMcpServiceDefinition,
} from "./services/productNowMcp";

export type AvailableServices = {
  threeDProp: ThreeDAssetServiceApi;
  threeDEnvironment: ThreeDAssetServiceApi;
  threeDCharacter: ThreeDAssetServiceApi;
  threeDWorkshop: ThreeDWorkshopServiceApi;
  audio: AudioServiceApi;
  battleBackground: BattleBackgroundServiceApi;
  cardCharacter: CardCharacterServiceApi;
  dungeon: DungeonServiceApi;
  enemy: EnemyServiceApi;
  playableCard: PlayableCardServiceApi;
  player: PlayerServiceApi;
  productNowLore: ProductNowLoreServiceApi;
  productNowMcp: ProductNowMcpServiceApi;
  spriteSheet: SpriteSheetServiceApi;
};

export type AvailableServicesDefinition = {
  [key in keyof AvailableServices]: ServiceDefinition<AvailableServices[key]>;
};

export const AVAILABLE_SERVICES: AvailableServicesDefinition = {
  audio: AudioServiceDefinition,
  battleBackground: BattleBackgroundServiceDefinition,
  cardCharacter: CardCharacterServiceDefinition,
  dungeon: DungeonServiceDefinition,
  enemy: EnemyServiceDefinition,
  playableCard: PlayableCardServiceDefinition,
  player: PlayerServiceDefinition,
  productNowLore: ProductNowLoreServiceDefinition,
  productNowMcp: ProductNowMcpServiceDefinition,
  spriteSheet: SpriteSheetServiceDefinition,
  threeDCharacter: ThreeDCharacterServiceDefinition,
  threeDEnvironment: ThreeDEnvironmentServiceDefinition,
  threeDProp: ThreeDPropServiceDefinition,
  threeDWorkshop: ThreeDWorkshopServiceDefinition,
};
