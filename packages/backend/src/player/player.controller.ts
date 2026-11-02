import { Body, Controller, Req } from "@nestjs/common";
import {
  type PlayerServiceApi,
  PlayerServiceDefinition,
} from "@resync-game-framework/api";
import type { Request } from "express";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  getDecorator,
  type ServiceControllerInterface,
} from "src/genericTypes/controller";
import { requireActiveProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { PlayerService } from "./player.service";
import { resolvePlayerId } from "./playerCookie";

type Payload<Key extends keyof PlayerServiceApi> =
  PlayerServiceApi[Key]["payload"];

/**
 * REST entry point for the browser's cultivators and saved climbs. Every
 * route reads the player cookie, or sets a new one.
 */
@Controller(PlayerServiceDefinition.controller)
export class PlayerController
  implements ServiceControllerInterface<PlayerServiceApi>
{
  public constructor(
    private readonly playerService: PlayerService,
    private readonly configurationService: ConfigurationService,
  ) {}

  /**
   * @param payload - Name, title, and appearance
   * @param request - Incoming request carrying the player cookie
   * @returns The new cultivator
   */
  @getDecorator(PlayerServiceDefinition.endpoints.createCultivator)
  public createCultivator(
    @Body() payload: Payload<"createCultivator">,
    @Req() request: Request,
  ) {
    return this.playerService.createCultivator(this.playerId(request), payload);
  }

  /**
   * @param payload - Climb id
   * @param request - Incoming request carrying the player cookie
   * @returns Whether a climb was removed
   */
  @getDecorator(PlayerServiceDefinition.endpoints.deleteClimb)
  public deleteClimb(
    @Body() payload: Payload<"deleteClimb">,
    @Req() request: Request,
  ) {
    return this.playerService.deleteClimb(this.playerId(request), payload);
  }

  /**
   * @param payload - Cultivator id
   * @param request - Incoming request carrying the player cookie
   * @returns Whether a cultivator was removed
   */
  @getDecorator(PlayerServiceDefinition.endpoints.deleteCultivator)
  public deleteCultivator(
    @Body() payload: Payload<"deleteCultivator">,
    @Req() request: Request,
  ) {
    return this.playerService.deleteCultivator(this.playerId(request), payload);
  }

  /**
   * @param request - Incoming request carrying the player cookie
   * @returns The empty state
   */
  @getDecorator(PlayerServiceDefinition.endpoints.erase)
  public erase(@Req() request: Request) {
    return this.playerService.erase(this.playerId(request));
  }

  /**
   * Painting reads the Lore document, so ProductNow must be connected.
   * @param payload - Cultivator id and parts to paint
   * @param request - Incoming request carrying the player cookie
   * @returns The cultivator with those parts painting
   */
  @getDecorator(PlayerServiceDefinition.endpoints.paintCultivator)
  public paintCultivator(
    @Body() payload: Payload<"paintCultivator">,
    @Req() request: Request,
  ) {
    return this.playerService.paintCultivator(
      this.playerId(request),
      payload,
      requireActiveProductNowSession(),
    );
  }

  /**
   * @param payload - Climb summary and snapshot
   * @param request - Incoming request carrying the player cookie
   * @returns The climb id and when it was saved
   */
  @getDecorator(PlayerServiceDefinition.endpoints.saveClimb)
  public saveClimb(
    @Body() payload: Payload<"saveClimb">,
    @Req() request: Request,
  ) {
    return this.playerService.saveClimb(this.playerId(request), payload);
  }

  /**
   * @param request - Incoming request carrying the player cookie
   * @returns Cultivators and saved climbs
   */
  @getDecorator(PlayerServiceDefinition.endpoints.state)
  public state(@Req() request: Request) {
    return this.playerService.state(this.playerId(request));
  }

  /**
   * @param payload - Cultivator id
   * @param request - Incoming request carrying the player cookie
   * @returns The cultivator after the stop
   */
  @getDecorator(PlayerServiceDefinition.endpoints.stopPainting)
  public stopPainting(
    @Body() payload: Payload<"stopPainting">,
    @Req() request: Request,
  ) {
    return this.playerService.stopPainting(this.playerId(request), payload);
  }

  /**
   * @param payload - Cultivator id and fields to change
   * @param request - Incoming request carrying the player cookie
   * @returns The updated cultivator
   */
  @getDecorator(PlayerServiceDefinition.endpoints.updateCultivator)
  public updateCultivator(
    @Body() payload: Payload<"updateCultivator">,
    @Req() request: Request,
  ) {
    return this.playerService.updateCultivator(this.playerId(request), payload);
  }

  /**
   * @param request - Incoming request
   * @returns The browser's player id, setting the cookie when it is new
   */
  private playerId(request: Request): string {
    return resolvePlayerId(
      request,
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}
