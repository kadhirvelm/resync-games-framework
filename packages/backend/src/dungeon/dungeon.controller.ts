import { Body, Controller, UseInterceptors } from "@nestjs/common";
import {
  type DungeonServiceApi,
  DungeonServiceDefinition,
} from "@resync-game-framework/api";
import { ASSET_CLASS_GENERATION_TIMEOUT_MS } from "src/asset-classes/shared/createAssetClassController";
import {
  getDecorator,
  type ServiceControllerInterface,
} from "src/genericTypes/controller";
import { Timeout } from "src/library/timeout/timeout.decorator";
import { TimeoutInterceptor } from "src/library/timeout/timeout.interceptor";
import { requireActiveProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { DungeonService } from "./dungeon.service";

/** REST entry point for dungeon packages. */
@UseInterceptors(TimeoutInterceptor)
@Controller(DungeonServiceDefinition.controller)
export class DungeonController
  implements ServiceControllerInterface<DungeonServiceApi>
{
  public constructor(private readonly dungeonService: DungeonService) {}

  /**
   * Links an existing asset into a dungeon package.
   * @param payload - Package, slot, and asset id
   * @returns The updated package
   */
  @getDecorator(DungeonServiceDefinition.endpoints.associate)
  public associate(@Body() payload: DungeonServiceApi["associate"]["payload"]) {
    return this.dungeonService.associate(payload);
  }

  /**
   * Stops a planning run or a slot run.
   * @param payload - Generation id
   * @returns Whether cancellation was recorded
   */
  @getDecorator(DungeonServiceDefinition.endpoints.cancel)
  public cancel(@Body() payload: DungeonServiceApi["cancel"]["payload"]) {
    return this.dungeonService.cancel(payload);
  }

  /**
   * Plans a dungeon package from one broad idea.
   * @param payload - Broad dungeon prompt
   * @returns The saved package of prompts
   */
  @Timeout(ASSET_CLASS_GENERATION_TIMEOUT_MS)
  @getDecorator(DungeonServiceDefinition.endpoints.generate)
  public generate(@Body() payload: DungeonServiceApi["generate"]["payload"]) {
    return this.dungeonService.generate(
      payload,
      requireActiveProductNowSession(),
    );
  }

  /**
   * Runs one saved prompt through its asset agent.
   * @param payload - Package, slot, and generation id
   * @returns The package after that slot is filled
   */
  @Timeout(ASSET_CLASS_GENERATION_TIMEOUT_MS)
  @getDecorator(DungeonServiceDefinition.endpoints.generateSlot)
  public generateSlot(
    @Body() payload: DungeonServiceApi["generateSlot"]["payload"],
  ) {
    return this.dungeonService.generateSlot(
      payload,
      requireActiveProductNowSession(),
    );
  }

  /**
   * @returns Slot generations that are still running
   */
  @getDecorator(DungeonServiceDefinition.endpoints.inflight)
  public inflight() {
    return this.dungeonService.listInFlight();
  }

  /**
   * @returns Saved dungeon packages, newest first
   */
  @getDecorator(DungeonServiceDefinition.endpoints.list)
  public list() {
    return this.dungeonService.list();
  }
}
