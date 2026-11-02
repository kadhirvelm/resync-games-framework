import {
  Body,
  Controller,
  Inject,
  type Type,
  UseInterceptors,
} from "@nestjs/common";
import type {
  AssetClassServiceApi,
  ServiceDefinition,
} from "@resync-game-framework/api";
import { getDecorator } from "src/genericTypes/controller";
import { Timeout } from "src/library/timeout/timeout.decorator";
import { TimeoutInterceptor } from "src/library/timeout/timeout.interceptor";

/** Image generation plus retries can run for several minutes, past the default 30s limit. */
export const ASSET_CLASS_GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * The operations every asset-class service exposes.
 */
export interface AssetClassOperations<
  Api extends AssetClassServiceApi<unknown, unknown>,
> {
  cancel(payload: Api["cancel"]["payload"]): Promise<Api["cancel"]["response"]>;
  generate(
    payload: Api["generate"]["payload"],
  ): Promise<Api["generate"]["response"]>;
  list(): Promise<Api["list"]["response"]>;
}

/**
 * Builds the `POST /{controller}/generate`, `POST /{controller}/cancel`, and
 * `POST /{controller}/list` controller for an asset class. Generation gets
 * {@link ASSET_CLASS_GENERATION_TIMEOUT_MS}.
 * @param definition - Service definition from `@resync-game-framework/api`
 * @param service - Nest provider that implements generate and list
 * @returns A controller class Nest can register
 */
export function createAssetClassController<
  Api extends AssetClassServiceApi<unknown, unknown>,
>(
  definition: ServiceDefinition<Api>,
  service: Type<AssetClassOperations<Api>>,
): Type<AssetClassOperations<Api>> {
  const controllerName = `${toPascalCase(definition.controller)}Controller`;

  @UseInterceptors(TimeoutInterceptor)
  @Controller(definition.controller)
  class GeneratedAssetClassController implements AssetClassOperations<Api> {
    public constructor(
      @Inject(service)
      private readonly assetClassService: AssetClassOperations<Api>,
    ) {}

    @getDecorator(definition.endpoints.cancel)
    public cancel(@Body() payload: Api["cancel"]["payload"]) {
      return this.assetClassService.cancel(payload);
    }

    @Timeout(ASSET_CLASS_GENERATION_TIMEOUT_MS)
    @getDecorator(definition.endpoints.generate)
    public generate(@Body() payload: Api["generate"]["payload"]) {
      return this.assetClassService.generate(payload);
    }

    @getDecorator(definition.endpoints.list)
    public list() {
      return this.assetClassService.list();
    }
  }

  Object.defineProperty(GeneratedAssetClassController, "name", {
    value: controllerName,
  });

  return GeneratedAssetClassController;
}

/**
 * @param controllerPath - Kebab-case controller path, e.g. `card-characters`
 * @returns PascalCase name, e.g. `CardCharacters`
 */
function toPascalCase(controllerPath: string): string {
  return controllerPath
    .split("-")
    .filter((part) => part !== "")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}
