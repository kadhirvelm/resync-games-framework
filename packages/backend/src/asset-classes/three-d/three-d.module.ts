import {
  Body,
  Controller,
  Inject,
  Module,
  Post,
  type Type,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import type {
  ThreeDAssetKind,
  ThreeDGenerationPayload,
  ThreeDWorkshopServiceApi,
} from "@resync-game-framework/api";
import { RedisModule } from "src/infra/redis/redis.module";
import { Timeout } from "src/library/timeout/timeout.decorator";
import { TimeoutInterceptor } from "src/library/timeout/timeout.interceptor";
import { GenerationAbortModule } from "src/mastra/agents/generationAbort.module";
import {
  ThreeDCharacterAgent,
  ThreeDDesignAgent,
  ThreeDEnvironmentAgent,
  ThreeDPropAgent,
} from "src/mastra/agents/three-d/threeDAgents";
import { ThreeDPrototypeAgent } from "src/mastra/agents/three-d/threeDPrototypeAgent";
import { MastraCoreModule } from "src/mastra/mastraCore.module";
import { ThreeDService } from "./threeD.service";
import { ThreeDInfrastructureModule } from "./threeDInfrastructure.module";
import { ThreeDPrototypeStore } from "./threeDPrototypeStore";
import { ThreeDRequestValidationFilter } from "./threeDRequestValidation.filter";

/** Creates one category's standard asset service and ingestion routes. */
function assetController(kind: ThreeDAssetKind, route: string): Type {
  @Controller(route)
  @UseFilters(ThreeDRequestValidationFilter)
  @UseInterceptors(TimeoutInterceptor)
  class AssetController {
    public constructor(
      @Inject(ThreeDService) private readonly service: ThreeDService,
    ) {}
    /** @returns Stored category assets and provider readiness. */
    @Post("list") public list() {
      return this.service.list(kind);
    }
    /** @returns A complete validated generation for standard asset clients. */
    @Post("generate") @Timeout(25 * 60_000) public generate(
      @Body() payload: ThreeDGenerationPayload,
    ) {
      return this.service.generate(kind, payload);
    }
    /** @returns Whether distributed cancellation was recorded. */
    @Post("cancel") public cancel(@Body() payload: { generationId: string }) {
      return this.service.cancel(payload);
    }
    /** @returns An accepted self-contained GLB or validation failure. */
    @Post("ingest") @Timeout(60_000) public ingest(
      @Body() payload: { name: string; fileName: string; glbBase64: string },
    ) {
      return this.service.ingest(kind, payload);
    }
  }
  Object.defineProperty(AssetController, "name", {
    value: `ThreeD${kind}Controller`,
  });
  return AssetController;
}

/** Durable 3D workshop jobs and independent prototype package routes. */
@Controller("three-d-workshop")
@UseFilters(ThreeDRequestValidationFilter)
@UseInterceptors(TimeoutInterceptor)
class ThreeDWorkshopController {
  public constructor(private readonly service: ThreeDService) {}
  /** @returns Packages and recent jobs. */
  @Post("list") public list() {
    return this.service.workshop();
  }
  /** @returns A new coherent package brief. */
  @Post("create") @Timeout(5 * 60_000) public create(
    @Body() payload: ThreeDWorkshopServiceApi["create"]["payload"],
  ) {
    return this.service.create(payload);
  }
  /** @returns The package after a kind-safe model assignment. */
  @Post("attach") public attach(
    @Body() payload: { prototypeId: string; slotId: string; assetId: string },
  ) {
    return this.service.attach(payload);
  }
  /** @returns An admitted background generation. */
  @Post("start") public start(
    @Body() payload: ThreeDWorkshopServiceApi["start"]["payload"],
  ) {
    return this.service.start(payload);
  }
  /** @returns Whether the distributed stop was recorded. */
  @Post("cancel") public cancel(@Body() payload: { generationId: string }) {
    return this.service.cancel(payload);
  }
}

/** All 3D categories use the same validator and lifecycle, with separate storage. */
@Module({
  controllers: [
    assetController("prop", "three-d-props"),
    assetController("environment", "three-d-environments"),
    assetController("character", "three-d-characters"),
    ThreeDWorkshopController,
  ],
  exports: [ThreeDService],
  imports: [
    RedisModule,
    ThreeDInfrastructureModule,
    MastraCoreModule,
    GenerationAbortModule,
  ],
  providers: [
    ThreeDService,
    ThreeDPrototypeStore,
    ThreeDPrototypeAgent,
    ThreeDDesignAgent,
    ThreeDPropAgent,
    ThreeDEnvironmentAgent,
    ThreeDCharacterAgent,
  ],
})
export class ThreeDModule {}
