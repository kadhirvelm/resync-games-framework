import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CardCharacterServiceDefinition } from "@resync-game-framework/api";
import { TIMEOUT_KEY } from "src/library/timeout/timeout.decorator";
import {
  ASSET_CLASS_GENERATION_TIMEOUT_MS,
  createAssetClassController,
} from "../createAssetClassController";

const widgetDefinition: typeof CardCharacterServiceDefinition = {
  controller: "widgets",
  endpoints: CardCharacterServiceDefinition.endpoints,
};

describe("createAssetClassController", () => {
  const cardController = createAssetClassController(
    CardCharacterServiceDefinition,
    class CardCharacterService {
      public cancel() {
        return Promise.resolve({ stopped: false });
      }

      public generate() {
        return Promise.resolve({
          createdAt: "",
          levels: [],
          prompt: "",
          setId: "set",
          theme: "",
        });
      }

      public list() {
        return Promise.resolve({ sets: [] });
      }
    },
  );

  const widgetController = createAssetClassController(
    widgetDefinition,
    class WidgetService {
      public cancel() {
        return Promise.resolve({ stopped: false });
      }

      public generate() {
        return Promise.resolve({
          createdAt: "",
          levels: [],
          prompt: "",
          setId: "set",
          theme: "",
        });
      }

      public list() {
        return Promise.resolve({ sets: [] });
      }
    },
  );

  test("registers generate, cancel, and list on the class's own controller path", () => {
    expect(cardController.name).toBe("CardCharactersController");
    expect(Reflect.getMetadata(PATH_METADATA, cardController)).toBe(
      "card-characters",
    );
    expect(routeOf(cardController, "cancel")).toEqual({
      method: RequestMethod.POST,
      path: "cancel",
    });
    expect(routeOf(cardController, "generate")).toEqual({
      method: RequestMethod.POST,
      path: "generate",
    });
    expect(routeOf(cardController, "list")).toEqual({
      method: RequestMethod.POST,
      path: "list",
    });
  });

  test("gives only generation the long-running timeout", () => {
    expect(
      Reflect.getMetadata(TIMEOUT_KEY, cardController.prototype.generate),
    ).toBe(ASSET_CLASS_GENERATION_TIMEOUT_MS);
    expect(
      Reflect.getMetadata(TIMEOUT_KEY, cardController.prototype.list),
    ).toBeUndefined();
  });

  test("builds a separate controller for each asset class", () => {
    expect(widgetController.name).toBe("WidgetsController");
    expect(Reflect.getMetadata(PATH_METADATA, widgetController)).toBe(
      "widgets",
    );
    expect(widgetController).not.toBe(cardController);
  });
});

/**
 * @param controller - Controller class produced by the factory
 * @param methodName - `generate` or `list`
 * @returns The HTTP method and path Nest stored on that method
 */
function routeOf(
  controller: { prototype: Record<string, unknown> },
  methodName: string,
): { method: RequestMethod | undefined; path: string | undefined } {
  const handler = controller.prototype[methodName];
  if (typeof handler !== "function") {
    return { method: undefined, path: undefined };
  }
  return {
    method: Reflect.getMetadata(METHOD_METADATA, handler) as
      | RequestMethod
      | undefined,
    path: Reflect.getMetadata(PATH_METADATA, handler) as string | undefined,
  };
}
